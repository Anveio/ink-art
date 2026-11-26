import { bboxIntersects } from '../core/geom.ts';
import type { Op, Page } from '../sdk/page.ts';
import { type RasterSnapshot, type RenderOpts, type RenderedImage, Raster, contextFor, drawGrid, frameFor, marginFor, selectOps } from './render.ts';

/** How keyframes are stored. The default keeps raw copies; Node passes a zlib codec (see node.ts). */
export interface SnapshotCodec {
  pack(s: RasterSnapshot, hasOwnH: boolean): Uint8Array | RasterSnapshot;
  unpack(p: Uint8Array | RasterSnapshot, baseH: Float32Array): RasterSnapshot;
}

export const rawCodec: SnapshotCodec = {
  pack: (s) => s,
  unpack: (p) => p as RasterSnapshot,
};

export interface TimelineOpts extends RenderOpts {
  /** Keep a keyframe every this many ops (in page op indices). Smaller = faster seeks, more memory. */
  every?: number;
  codec?: SnapshotCodec;
}

/**
 * Scrub through a drawing's history for one region at one resolution.
 *
 * The op list is the history: tiny, exact and diffable in git. Rendering a past state means
 * replaying ops, so the timeline keeps compressed keyframes of the raster every `every` ops and
 * replays only from the nearest one. Moving forward from the current state replays just the gap.
 */
export class Timeline {
  readonly length: number;
  private raster: Raster;
  private baseH: Float32Array;
  private ops: { i: number; op: Op }[];
  private keyframes = new Map<number, Uint8Array | RasterSnapshot>();
  private cursor = 0; // page op index the raster currently reflects
  private every: number;
  private codec: SnapshotCodec;
  private frame: ReturnType<typeof frameFor>;
  private margin: number;

  constructor(readonly page: Page, readonly opts: TimelineOpts = {}) {
    this.frame = frameFor(page, opts);
    const { s, px0, py0, W, H } = this.frame;
    const all = selectOps(page, { ...opts, at: undefined });
    this.margin = marginFor(all, s);
    const ctx = contextFor(page, opts, s);
    this.raster = new Raster(ctx, px0 - this.margin, py0 - this.margin, W + this.margin * 2, H + this.margin * 2);
    this.baseH = this.raster.H.slice();
    const set = new Set(all);
    this.ops = page.ops.map((op, i) => ({ i, op })).filter(({ op }) => set.has(op) && bboxIntersects(op.bbox, this.raster.box));
    this.length = page.ops.length;
    this.every = Math.max(1, opts.every ?? 40);
    this.codec = opts.codec ?? rawCodec;
  }

  /** The image after the first `pos` ops (or at a mark/group name). */
  at(pos: string | number): RenderedImage {
    const t0 = performance.now();
    const target = this.page.at(pos);
    this.seek(target);
    const { W, H, s, px0, py0 } = this.frame;
    const data = new Uint8ClampedArray(W * H * 4);
    this.raster.shadeInto(this.margin, data);
    const img: RenderedImage = { width: W, height: H, data, pxPerMm: s, origin: [px0 / s, py0 / s], stats: { ops: this.countBefore(target), ms: 0 } };
    if (this.opts.grid) drawGrid(img, this.opts.grid);
    img.stats.ms = Math.round(performance.now() - t0);
    return img;
  }

  /** History positions where this region actually changes (after each op that touches it). */
  get steps(): number[] {
    return this.ops.map((o) => o.i + 1);
  }

  /** Bytes held by keyframes (packed size when a codec compresses). */
  get storage() {
    let bytes = 0;
    for (const k of this.keyframes.values()) bytes += k instanceof Uint8Array ? k.byteLength : k.D.byteLength * 4;
    return { keyframes: this.keyframes.size, bytes };
  }

  private countBefore(target: number) {
    let n = 0;
    for (const o of this.ops) if (o.i < target) n++;
    return n;
  }

  private seek(target: number) {
    if (target < this.cursor || target - this.cursor > this.every) {
      // Jump to the best keyframe at or before target (or blank paper).
      let best = 0;
      for (const k of this.keyframes.keys()) if (k <= target && k > best) best = k;
      if (!(this.cursor <= target && this.cursor >= best)) {
        if (best === 0) this.reset();
        else this.raster.restore(this.codec.unpack(this.keyframes.get(best)!, this.baseH));
        this.cursor = best;
      }
    }
    let bucket = Math.floor(this.cursor / this.every);
    for (const { i, op } of this.ops) {
      if (i < this.cursor) continue;
      if (i >= target) break;
      this.raster.apply(op);
      const next = i + 1, b = Math.floor(next / this.every);
      if (b > bucket) {
        bucket = b;
        if (!this.keyframes.has(next)) this.keyframes.set(next, this.codec.pack(this.raster.snapshot(), this.raster.hVersion > 0));
      }
    }
    this.cursor = target;
  }

  private reset() {
    this.raster.D.fill(0); this.raster.T.fill(0); this.raster.S.fill(0);
    this.raster.H.set(this.baseH); this.raster.hVersion = 0;
  }
}

/** Highlight what changed between two images: unchanged pixels faded, changes in red. */
export function diffImages(a: RenderedImage, b: RenderedImage, threshold = 6): RenderedImage & { changed: number } {
  const out = new Uint8ClampedArray(b.data.length);
  let changed = 0;
  for (let i = 0; i < b.data.length; i += 4) {
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    const g = b.data[i] * 0.3 + 255 * 0.7;
    if (d > threshold) {
      changed++;
      const k = Math.min(1, d / 120);
      out[i] = 230; out[i + 1] = g * (1 - k) + 40 * k; out[i + 2] = g * (1 - k) + 40 * k;
    } else {
      out[i] = out[i + 1] = out[i + 2] = g;
    }
    out[i + 3] = 255;
  }
  return { ...b, data: out, changed };
}

/** Lay frames side by side with captions (a contact strip). */
export function contactStrip(frames: RenderedImage[], captions: string[], gap = 6): RenderedImage {
  const cap = 14;
  const W = frames.reduce((w, f) => w + f.width, 0) + gap * (frames.length + 1);
  const H = Math.max(...frames.map((f) => f.height)) + gap * 2 + cap;
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  let x = gap;
  frames.forEach((f, n) => {
    for (let j = 0; j < f.height; j++) data.set(f.data.subarray(j * f.width * 4, (j + 1) * f.width * 4), ((j + gap + cap) * W + x) * 4);
    const img = { width: W, height: H, data };
    drawCaption(img, captions[n] ?? '', x, gap);
    x += f.width + gap;
  });
  return { width: W, height: H, data, pxPerMm: frames[0].pxPerMm, origin: frames[0].origin, stats: { ops: 0, ms: 0 } };
}

import { drawText } from './font.ts';
function drawCaption(img: { width: number; height: number; data: Uint8ClampedArray }, text: string, x: number, y: number) {
  drawText(img, text, x, y, 2, [40, 60, 120]);
}

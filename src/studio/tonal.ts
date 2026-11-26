// Tonal rendering: turn a darkness map into real pencil work.
//
// An artist doing a studio-quality graphite drawing builds tone in layers: a light hard-lead
// layer over everything that isn't paper-white, then progressively softer leads in the darker
// passages, each layer hatched at a different angle so the strokes knit together, then a stump
// to melt the hatching into continuous tone, then a look at the drawing, more graphite where it
// is still too light, a kneaded eraser where it went too dark, and finally crisp accents.
// `toneMap` does exactly that with ordinary strokes and tool ops, so the result has real tooth,
// real stroke direction and real burnish, and it stays in the page's history like any drawing.
import { type Pt, clamp } from '../core/geom.ts';
import { rng, seedOf } from '../core/random.ts';
import type { Page } from '../sdk/page.ts';
import type { PencilName } from '../sdk/pencils.ts';
import { render } from '../render/render.ts';

/** A scalar field sampled on a regular grid in page millimetres. */
export class Grid {
  readonly data: Float32Array;
  constructor(readonly x0: number, readonly y0: number, readonly cell: number, readonly w: number, readonly h: number, data?: Float32Array) {
    this.data = data ?? new Float32Array(w * h);
  }
  static over(x: number, y: number, width: number, height: number, cell: number) {
    return new Grid(x, y, cell, Math.ceil(width / cell) + 1, Math.ceil(height / cell) + 1);
  }
  /** Fill by evaluating f at each cell's page position. */
  fill(f: (x: number, y: number) => number): this {
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) this.data[j * this.w + i] = f(this.x0 + i * this.cell, this.y0 + j * this.cell);
    return this;
  }
  map(f: (v: number, x: number, y: number) => number): Grid {
    const g = new Grid(this.x0, this.y0, this.cell, this.w, this.h);
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) g.data[j * this.w + i] = f(this.data[j * this.w + i], this.x0 + i * this.cell, this.y0 + j * this.cell);
    return g;
  }
  /** Bilinear sample at a page position (clamped at the edges). */
  at(x: number, y: number): number {
    const fx = clamp((x - this.x0) / this.cell, 0, this.w - 1.001), fy = clamp((y - this.y0) / this.cell, 0, this.h - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const d = this.data, w = this.w, k = j * w + i;
    return (d[k] * (1 - u) + d[k + 1] * u) * (1 - v) + (d[k + w] * (1 - u) + d[k + w + 1] * u) * v;
  }
  /** Separable box blur, `r` cells, two passes (close to Gaussian). */
  blur(r: number): Grid {
    const g = new Grid(this.x0, this.y0, this.cell, this.w, this.h, this.data.slice());
    if (r < 1) return g;
    const { w, h } = g;
    const tmp = new Float32Array(w * h);
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) {
          let s = 0, n = 0;
          for (let k = -r; k <= r; k++) { const ii = i + k; if (ii >= 0 && ii < w) { s += g.data[j * w + ii]; n++; } }
          tmp[j * w + i] = s / n;
        }
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) {
          let s = 0, n = 0;
          for (let k = -r; k <= r; k++) { const jj = j + k; if (jj >= 0 && jj < h) { s += tmp[jj * w + i]; n++; } }
          g.data[j * w + i] = s / n;
        }
    }
    return g;
  }
}

export interface ToneLayer {
  pencil: PencilName;
  /** Hatch angle in degrees. */
  angle: number;
  /** Line spacing in mm. */
  spacing: number;
  /** Darkness range this layer works in: below `lo` it lifts off, at `hi` and above it is at full pressure. */
  lo: number;
  hi: number;
  /** Pressure at full strength. */
  pressure?: number;
  width?: number;
  /** Curve the hatch lines a little (mm of bow over their length). */
  bow?: number;
}

export interface ToneMapOpts {
  /** Region to work in, mm [x, y, w, h]. Defaults to the target grid's extent. */
  region?: [number, number, number, number];
  /** Where to draw at all (0..1). Outside the mask nothing is laid down or lifted. */
  mask?: Grid;
  layers?: ToneLayer[];
  /** Stump passes after the layers: radius in mm, amount 0..1. Set false to keep raw hatching. */
  blend?: { radius: number; amount: number } | false;
  /** Look-and-correct rounds after blending. Each renders the region and fixes the difference. */
  rounds?: number;
  /** Render resolution for the look-and-correct pass, px per mm. */
  lookRes?: number;
  /**
   * Object ids per cell (e.g. from an SDF render). Hatching lifts at every id boundary so tone
   * stops crisply at an object's edge, and the stump stays off the boundaries.
   */
  ids?: Grid;
  /** Where the eraser may lift, 0..1 (defaults to everywhere in the mask). */
  liftMask?: Grid;
  /** Scale every layer's hatch spacing (smaller = finer, smoother, more strokes). */
  fineness?: number;
  /** Width (mm) of the band along object edges that the stump keeps off. */
  edgeBand?: number;
  /**
   * An extra, broad stump pass over the light passages only (darkness below `below`), the way a
   * realist polishes porcelain or skin until the hatching disappears.
   */
  polish?: { radius: number; amount: number; below: number };
  /** Pre-distort the target with a measured response curve (default true). */
  calibrate?: boolean;
  /** Use the kneaded eraser where a look finds the drawing too dark (default true). */
  lift?: boolean;
  /** Kneaded-eraser highlights: darkness at or below this gets lifted back toward the paper. */
  highlight?: number;
  seed?: number | string;
  /** Log progress. */
  log?: (msg: string) => void;
}

/** The default layer stack: hard to soft, each at a different angle. */
export const STUDIO_LAYERS: ToneLayer[] = [
  { pencil: '2H', angle: 38, spacing: 0.24, lo: 0.02, hi: 0.3, pressure: 0.42 },
  { pencil: '2H', angle: -52, spacing: 0.26, lo: 0.1, hi: 0.38, pressure: 0.42 },
  { pencil: 'HB', angle: -24, spacing: 0.28, lo: 0.2, hi: 0.52, pressure: 0.6 },
  { pencil: '2B', angle: 70, spacing: 0.3, lo: 0.34, hi: 0.72, pressure: 0.7 },
  { pencil: '4B', angle: 12, spacing: 0.28, lo: 0.52, hi: 0.9, pressure: 0.8 },
  { pencil: '6B', angle: 52, spacing: 0.26, lo: 0.7, hi: 1, pressure: 0.9 },
  { pencil: '8B', angle: -50, spacing: 0.26, lo: 0.84, hi: 1.05, pressure: 0.95 },
];

/**
 * Draw a darkness map (0 = paper, 1 = the darkest graphite) into the current group.
 * The target should already be in "drawing" terms: what an artist would aim for, not raw radiance.
 */
export function toneMap(p: Page, target: Grid, opts: ToneMapOpts = {}) {
  const log = opts.log ?? (() => {});
  const region = opts.region ?? [target.x0, target.y0, (target.w - 1) * target.cell, (target.h - 1) * target.cell];
  const mask = opts.mask;
  const m = (x: number, y: number) => (mask ? mask.at(x, y) : 1);
  const r = rng(seedOf(opts.seed ?? 'tone'));
  const layers = opts.layers ?? STUDIO_LAYERS;
  const t0 = Date.now();
  const ids = opts.ids;
  const idAt = ids ? (x: number, y: number) => ids.data[Math.round((y - ids.y0) / ids.cell) * ids.w + Math.round((x - ids.x0) / ids.cell)] ?? -2 : undefined;
  // Distance-to-edge mask for the stump: 0 on id boundaries, 1 a little away from them.
  let edgeMask: Grid | undefined;
  if (ids) {
    const e = ids.map(() => 1);
    for (let j = 1; j < ids.h - 1; j++)
      for (let i = 1; i < ids.w - 1; i++) {
        const k = j * ids.w + i, v = ids.data[k];
        if (ids.data[k + 1] !== v || ids.data[k - 1] !== v || ids.data[k + ids.w] !== v || ids.data[k - ids.w] !== v) e.data[k] = 0;
      }
    edgeMask = e.blur(Math.max(1, Math.round((opts.edgeBand ?? 0.25) / ids.cell))).map((v) => clamp((v - 0.35) * 2.5));
  }
  const blendMask = mask && edgeMask ? mask.map((v, x, y) => v * edgeMask!.at(x, y)) : mask ?? edgeMask;
  // Feed-forward: measure how this paper and layer stack respond, and pre-distort the target so
  // the first pass already lands close (the look-and-correct rounds then only polish).
  const curve = opts.calibrate === false ? null : responseCurve(p, layers, opts.fineness ?? 1, opts.blend ?? { radius: 0.9, amount: 0.55 });
  const pre = (d: number) => (curve ? invert(curve, d) : d);
  for (const L of layers) {
    const field = (x: number, y: number) => {
      const d = pre(target.at(x, y) * m(x, y));
      return clamp((d - L.lo) / (L.hi - L.lo));
    };
    hatchField(p, region, field, { ...L, spacing: L.spacing * (opts.fineness ?? 1), width: (L.width ?? 0.9) * Math.sqrt(opts.fineness ?? 1), seed: Math.floor(r() * 2 ** 31) }, idAt);
  }
  log(`tone layers: ${p.ops.length} ops, ${Date.now() - t0}ms`);
  const blend = opts.blend ?? { radius: 0.9, amount: 0.55 };
  if (blend) blendRegion(p, region, blend.radius, blend.amount, blendMask);
  if (opts.polish) {
    const pol = opts.polish;
    const pm = target.map((v, x, y) => clamp((pol.below - v) / Math.max(0.01, pol.below) * 2) * (blendMask ? blendMask.at(x, y) : 1));
    blendRegion(p, region, pol.radius, pol.amount, pm);
  }

  const rounds = opts.rounds ?? 1;
  const res = opts.lookRes ?? 6;
  for (let k = 0; k < rounds; k++) {
    const seen = look(p, region, res);
    // Residual, smoothed a little so corrections are strokes, not noise.
    const resid = seen.map((v, x, y) => target.at(x, y) * m(x, y) - v).blur(Math.max(1, Math.round(0.4 * res)));
    let more = 0, less = 0, sum = 0;
    for (const v of resid.data) { if (v > 0.04) more++; if (v < -0.05) less++; sum += Math.abs(v); }
    log(`look ${k + 1}: ${(100 * more / resid.data.length).toFixed(1)}% too light, ${(100 * less / resid.data.length).toFixed(1)}% too dark, mean error ${(sum / resid.data.length).toFixed(3)}`);
    // Too light: a correction layer at a fresh angle, soft lead where it needs to be very dark.
    const ang = 25 + k * 47 + r() * 20;
    hatchField(p, region, (x, y) => clamp((resid.at(x, y) - 0.015) * 2.4) * m(x, y), { pencil: '2B', angle: ang, spacing: 0.3, pressure: 0.65, lo: 0, hi: 1, seed: Math.floor(r() * 2 ** 31) }, idAt);
    hatchField(p, region, (x, y) => clamp((resid.at(x, y) - 0.12) * 2.2) * clamp((target.at(x, y) - 0.6) * 3) * m(x, y), { pencil: '6B', angle: ang + 60, spacing: 0.28, pressure: 0.85, lo: 0, hi: 1, seed: Math.floor(r() * 2 ** 31) }, idAt);
    // Too dark: kneaded eraser, pressed in proportion to the excess.
    const lm = opts.liftMask;
    if (opts.lift !== false) liftField(p, region, (x, y) => clamp((-resid.at(x, y) - 0.04) * 3) * m(x, y) * (lm ? lm.at(x, y) : 1), 0.6, r);
    if (blend) blendRegion(p, region, blend.radius * 0.8, blend.amount * 0.7, blendMask);
  }
  if (opts.highlight !== undefined) {
    const hl = opts.highlight;
    liftField(p, region, (x, y) => clamp((hl - target.at(x, y)) / Math.max(0.01, hl)) * m(x, y), 0.45, r, 1);
  }
  log(`tonemap done: ${p.ops.length} ops, ${Date.now() - t0}ms`);
}

const CURVES = new Map<string, Float32Array>();

/**
 * Darkness actually reached by the layer stack for input darkness 0..1 (64 samples), measured by
 * drawing a ramp on a scrap of the same paper. Cached per paper + settings.
 */
export function responseCurve(p: Page, layers: ToneLayer[], fineness: number, blend: { radius: number; amount: number } | false): Float32Array {
  const key = JSON.stringify([p.paper, layers, fineness, blend]);
  const hit = CURVES.get(key);
  if (hit) return hit;
  const PageCtor = p.constructor as new (o: object) => Page;
  const scrap = new PageCtor({ width: 140, height: 20, paper: p.paper, seed: 'calibration' });
  const ramp = Grid.over(10, 6, 120, 8, 0.2).fill((x) => clamp((x - 12) / 116));
  const r = rng(7);
  for (const L of layers) hatchField(scrap, [10, 6, 120, 8], (x, y) => clamp((ramp.at(x, y) - L.lo) / (L.hi - L.lo)), { ...L, spacing: L.spacing * fineness, width: (L.width ?? 0.9) * Math.sqrt(fineness), seed: Math.floor(r() * 2 ** 31) });
  if (blend) blendRegion(scrap, [10, 6, 120, 8], blend.radius, blend.amount);
  const seen = look(scrap, [10, 6, 120, 8], 6);
  const out = new Float32Array(64);
  for (let i = 0; i < 64; i++) {
    const t = i / 63, x = 12 + t * 116;
    let s = 0, n = 0;
    for (let y = 8; y <= 12; y += 0.25) for (let dx = -0.6; dx <= 0.6; dx += 0.2) { s += seen.at(x + dx, y); n++; }
    out[i] = s / n;
  }
  // Monotone (running max) so it can be inverted.
  for (let i = 1; i < 64; i++) out[i] = Math.max(out[i], out[i - 1]);
  CURVES.set(key, out);
  return out;
}

/** Input darkness that produces `want`, by inverting a response curve. */
function invert(curve: Float32Array, want: number): number {
  if (want <= curve[0]) return 0;
  if (want >= curve[63]) return 1;
  let lo = 0, hi = 63;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (curve[mid] < want) lo = mid; else hi = mid; }
  const f = (want - curve[lo]) / Math.max(1e-6, curve[hi] - curve[lo]);
  return (lo + f) / 63;
}

/** Parallel hatching over a rectangle, pressure from a field, lifting the pencil wherever it falls to zero. */
export function hatchField(p: Page, region: [number, number, number, number], field: (x: number, y: number) => number, L: ToneLayer & { seed?: number }, idAt?: (x: number, y: number) => number) {
  const [rx, ry, rw, rh] = region;
  const r = rng(L.seed ?? 1);
  const ang = (L.angle * Math.PI) / 180;
  const d: Pt = [Math.cos(ang), -Math.sin(ang)];
  const n: Pt = [-d[1], d[0]];
  const cx = rx + rw / 2, cy = ry + rh / 2, half = Math.hypot(rw, rh) / 2 + 1;
  const pen = p.pen({ pencil: L.pencil, pressure: L.pressure ?? 0.7, width: L.width ?? 0.9, passes: 1, overshoot: 0, wobble: 0.06, tremor: 0.008, flutter: 0.18, taper: [0.12, 0.12], smooth: false });
  const step = 0.25;
  for (let s = -half; s < half; s += L.spacing * (0.85 + r() * 0.3)) {
    const ox = cx + n[0] * s, oy = cy + n[1] * s;
    let run: Pt[] = [];
    let runId = NaN;
    const bow = (L.bow ?? 0.4) * (r() - 0.5);
    const flush = () => {
      if (run.length >= 3) pen.stroke(run, { field, seed: Math.floor(r() * 2 ** 31) });
      run = [];
    };
    for (let t = -half; t <= half; t += step) {
      const u = t / half;
      const x = ox + d[0] * t + n[0] * bow * (1 - u * u), y = oy + d[1] * t + n[1] * bow * (1 - u * u);
      if (x < rx || y < ry || x > rx + rw || y > ry + rh) { flush(); continue; }
      // Pencil comes off where the field is (near) zero; strokes also break up at random like
      // real hatching so no line runs the whole width.
      if (field(x, y) < 0.015 || (run.length > 60 && r() < 0.012)) { flush(); continue; }
      if (idAt) {
        const id = idAt(x, y);
        // Overlap the runs by one step at an edge so the tone meets without a pale seam.
        if (id !== runId) { run.push([x, y]); flush(); runId = id; }
      }
      run.push([x, y]);
    }
    flush();
  }
}

/** Stump over a rectangle, strength following the mask. */
export function blendRegion(p: Page, region: [number, number, number, number], radius: number, amount: number, mask?: Grid) {
  const [rx, ry, rw, rh] = region;
  const pen = p.pen('studio');
  const field = mask ? (x: number, y: number) => mask.at(x, y) : undefined;
  pen.blend([[rx, ry], [rx + rw, ry], [rx + rw, ry + rh], [rx, ry + rh]], { radius, amount, field });
}

/** Kneaded eraser in short strokes wherever the field asks for it. */
export function liftField(p: Page, region: [number, number, number, number], field: (x: number, y: number) => number, amount: number, r: () => number, radius = 0.7) {
  const [rx, ry, rw, rh] = region;
  const pen = p.pen('studio');
  const step = radius * 0.55;
  // Rows of short eraser passes; strength per vertex follows the field (zero = no contact).
  for (let y = ry; y <= ry + rh; y += step) {
    let run: Pt[] = [];
    const flush = () => {
      if (run.length >= 2) pen.erase(run, { radius, amount, field });
      run = [];
    };
    for (let x = rx; x <= rx + rw; x += step * 0.5) {
      const yy = y + (r() - 0.5) * step * 0.3;
      if (field(x, yy) > 0.02) run.push([x, yy]);
      else flush();
    }
    flush();
  }
}

/**
 * Look at the drawing: render the region (flat, low res) and return its darkness on a grid,
 * on the same 0..1 scale as targets (0 = bare paper).
 */
export function look(p: Page, region: [number, number, number, number], pxPerMm: number): Grid {
  const img = render(p, { region, dpi: pxPerMm * 25.4, finish: 'flat' });
  const g = new Grid(img.origin[0], img.origin[1], 1 / pxPerMm, img.width, img.height);
  const paper = srgbToLin(paperSrgb(p));
  for (let i = 0; i < img.width * img.height; i++) {
    const v = srgbToLin(img.data[i * 4 + 1]);
    g.data[i] = darknessOf(v / paper);
  }
  // Grid samples sit at cell centres in the render; shift by half a pixel.
  return new Grid(g.x0 + g.cell / 2, g.y0 + g.cell / 2, g.cell, g.w, g.h, g.data);
}

/**
 * Darkness scale used by targets. Linear reflectance relative to paper -> 0..1, perceptual
 * (lightness-like) so equal steps look equal, and 1 at the darkest graphite (about 6% of paper).
 */
export function darknessOf(relLin: number): number {
  const l = Math.cbrt(clamp(relLin, 0, 1));
  const lmin = Math.cbrt(0.06);
  return clamp((1 - l) / (1 - lmin));
}
/** Inverse of darknessOf: darkness -> linear reflectance relative to paper. */
export function reflectanceOf(dark: number): number {
  const lmin = Math.cbrt(0.06);
  return (1 - clamp(dark) * (1 - lmin)) ** 3;
}

const srgbToLin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const paperSrgb = (p: Page) => {
  const g = p.paper.tint[1] * 0.97;
  return 255 * (g <= 0.0031308 ? 12.92 * g : 1.055 * g ** (1 / 2.4) - 0.055);
};

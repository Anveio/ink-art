import { type BBox, type Pt, bboxOf, bboxUnion, catmullRom, clamp, dist, ellipsePts, lineCrossings, quad, resample, smoothstep } from '../core/geom.ts';
import { fbm1, rng, seedOf } from '../core/random.ts';
import { type Pencil, type PencilName, pencil as getPencil } from './pencils.ts';
import { PAPERS, type Paper, type PaperName } from './paper.ts';

/** Everything is in millimetres, origin top-left, y down. */

export interface StrokeOp {
  kind: 'stroke';
  pencil: Pencil;
  /** Packed vertices: x, y, pressure (0..1), radius (mm). */
  data: Float32Array;
  bbox: BBox;
  group: string;
}
export type ToolKind = 'blend' | 'erase' | 'scrub' | 'indent' | 'dab' | 'smudge';
export type EraserKind = 'kneaded' | 'rubber' | 'vinyl';
export interface ToolOp {
  kind: ToolKind;
  /** For scrub: which eraser. */
  eraser?: EraserKind;
  /** Packed vertices: x, y, strength (0..1), radius (mm). */
  data: Float32Array;
  amount: number;
  bbox: BBox;
  group: string;
}
export type Op = StrokeOp | ToolOp;

export type Pressure = number | [number, number] | ((t: number) => number);

export interface StrokeOpts {
  pencil?: PencilName | Pencil;
  /** 0..1. A number, a [start, end] ramp, or a function of t in 0..1. */
  pressure?: Pressure;
  /** Multiplier on the pencil's tip radius. */
  width?: number;
  /** Taper length in mm at [start, end]. */
  taper?: number | [number, number];
  /** Slow hand wobble amplitude in mm. */
  wobble?: number;
  /** Fine jitter amplitude in mm. */
  tremor?: number;
  /** How far the stroke runs past its ends in mm (sketchy overshoot). */
  overshoot?: number;
  /** Re-trace the line this many times, each slightly off. */
  passes?: number;
  /** Max offset between passes in mm. */
  spread?: number;
  /** Random pressure variation along the stroke, 0..1. */
  flutter?: number;
  /** Smooth the given points with a spline (true) or keep them as a polyline. */
  smooth?: boolean;
  /** Also press a groove into the paper along the stroke (hard lead, heavy hand). 0..1. */
  dent?: number;
  /** Tip radius growth in mm per 100 mm drawn (the lead dulls). Call pen.sharpen() to reset. */
  wear?: number;
  seed?: number | string;
}

export interface HatchOpts extends StrokeOpts {
  /** Degrees; 0 = horizontal, 45 = rising to the right. */
  angle?: number;
  /** Line spacing in mm. */
  spacing?: number;
  /** Random variation in spacing, 0..1. */
  jitter?: number;
  /** How much each hatch line bows, in mm. */
  bow?: number;
  /** Random shortening of line ends in mm. */
  ragged?: number;
}

export interface ToneOpts extends HatchOpts {
  /** Target darkness 0 (paper) .. 1 (as dark as the pencil goes). */
  value?: number;
  /** Follow with a blending stump pass. */
  blend?: number | false;
  /** Add a crossing layer of hatching when value is above this. */
  crossAbove?: number;
}

export interface ToolOpts {
  radius?: number;
  amount?: number;
  seed?: number | string;
}

export interface ScrubOpts extends ToolOpts {
  /** Round trips: the eraser goes from -> to -> from this many times. */
  n?: number;
  eraser?: EraserKind;
  /** Sideways drift of the hand between passes, mm. */
  drift?: number;
}

export interface Mark { label: string; op: number }

export interface Style extends StrokeOpts {}

/** Named stroke styles. Mix freely per panel; that's the point of the comedy. */
export const STYLES = {
  /** Loose cartoon sketch like the references: retraced, overshooting, wobbly. */
  sketch: { pencil: 'HB', pressure: 0.6, passes: 2, spread: 0.35, overshoot: 1.2, wobble: 0.25, tremor: 0.03, taper: [3, 4], flutter: 0.25 },
  /** Confident single-pass cartoon line. */
  clean: { pencil: '2B', pressure: 0.7, passes: 1, wobble: 0.08, tremor: 0.01, taper: [2, 3], flutter: 0.1 },
  /** Light construction lines that get drawn over. */
  construct: { pencil: '2H', pressure: 0.3, passes: 1, wobble: 0.3, tremor: 0.03, taper: [6, 6], overshoot: 3, flutter: 0.3 },
  /** Precise rendering line for the high-fidelity panels. */
  studio: { pencil: 'HB', pressure: 0.55, passes: 1, wobble: 0.03, tremor: 0.005, taper: [1.5, 2], flutter: 0.08 },
} satisfies Record<string, Style>;

export interface PageOpts {
  width?: number;
  height?: number;
  paper?: PaperName | Paper;
  seed?: number | string;
}

export class Page {
  readonly width: number;
  readonly height: number;
  readonly paper: Paper;
  readonly seed: number;
  readonly ops: Op[] = [];
  readonly marks: Mark[] = [];
  private currentGroup = 'main';
  private groupRanges = new Map<string, [number, number]>();
  private groupBoxes = new Map<string, BBox>();

  constructor(opts: PageOpts = {}) {
    this.width = opts.width ?? 210;
    this.height = opts.height ?? 297;
    const paper = opts.paper ?? 'sketchbook';
    this.paper = typeof paper === 'string' ? PAPERS[paper] : paper;
    this.seed = seedOf(opts.seed ?? 'ink');
  }

  /** A pen with default stroke options. Pens are cheap; make one per style. */
  pen(style: StrokeOpts | keyof typeof STYLES = 'sketch'): Pen {
    return new Pen(this, typeof style === 'string' ? (STYLES[style] as StrokeOpts) : style);
  }

  /** Name the ops drawn inside `fn` so they can be listed, previewed or hidden on their own. */
  group<T>(name: string, fn: () => T): T {
    const prev = this.currentGroup;
    this.currentGroup = prev === 'main' ? name : `${prev}/${name}`;
    try {
      return fn();
    } finally {
      this.currentGroup = prev;
    }
  }

  /** @internal */
  push(op: Op) {
    op.group = this.currentGroup;
    this.ops.push(op);
    const i = this.ops.length - 1;
    const gr = this.groupRanges.get(op.group);
    this.groupRanges.set(op.group, gr ? [gr[0], i] : [i, i]);
    const b = this.groupBoxes.get(op.group);
    this.groupBoxes.set(op.group, b ? bboxUnion(b, op.bbox) : op.bbox);
  }

  /** Name the current point in the drawing's history (e.g. 'linework done'). */
  mark(label: string): this {
    this.marks.push({ label, op: this.ops.length });
    return this;
  }

  /** Resolve a history position: a mark label, an op count, or a group name (= the state after it). */
  at(pos: string | number): number {
    if (typeof pos === 'number') return Math.max(0, Math.min(this.ops.length, pos));
    const m = this.marks.find((k) => k.label === pos);
    if (m) return m.op;
    const r = this.groupRanges.get(pos);
    if (r) return r[1] + 1;
    if (/^\d+$/.test(pos)) return this.at(Number(pos));
    throw new Error(`unknown history position "${pos}". Marks: ${this.marks.map((k) => k.label).join(', ') || 'none'}`);
  }

  /** @internal Monotonic per-page seed stream so every op is unique but reproducible. */
  nextSeed(): number {
    return (this.seed + Math.imul(this.ops.length + 1, 2654435761)) >>> 0;
  }

  /** Group names with their op counts and bounding boxes (mm). Cheap text for context. */
  summary() {
    const counts = new Map<string, number>();
    for (const op of this.ops) counts.set(op.group, (counts.get(op.group) ?? 0) + 1);
    return {
      size: [this.width, this.height],
      paper: this.paper.name,
      ops: this.ops.length,
      groups: [...this.groupBoxes].map(([name, b]) => ({ name, ops: counts.get(name) ?? 0, range: this.groupRanges.get(name), bbox: b.map((v) => Math.round(v * 10) / 10) })),
      marks: this.marks,
    };
  }

  groupBox(name: string): BBox | undefined {
    let out: BBox | undefined;
    for (const [g, b] of this.groupBoxes) if (g === name || g.startsWith(name + '/')) out = out ? bboxUnion(out, b) : b;
    return out;
  }
}

const pressureAt = (p: Pressure, t: number) => (typeof p === 'number' ? p : typeof p === 'function' ? p(t) : p[0] + (p[1] - p[0]) * t);

export class Pen {
  /** mm of line drawn since the last sharpen (for `wear`). */
  drawn = 0;
  constructor(readonly page: Page, readonly defaults: StrokeOpts) {}

  /** Fresh point on the lead. */
  sharpen(): this {
    this.drawn = 0;
    return this;
  }

  /** A pen with some defaults changed. */
  with(opts: StrokeOpts): Pen {
    return new Pen(this.page, { ...this.defaults, ...opts });
  }

  /** Draw a stroke through the points (spline-smoothed by default). */
  stroke(points: Pt[], opts: StrokeOpts = {}): this {
    const o = { ...this.defaults, ...opts };
    const passes = Math.max(1, o.passes ?? 1);
    const baseSeed = o.seed !== undefined ? seedOf(o.seed) : this.page.nextSeed();
    for (let k = 0; k < passes; k++) {
      const r = rng(baseSeed + k * 7919);
      let pts = points;
      if (k > 0) {
        // A retrace: shifted a little, slightly rotated, a little lighter.
        const s = o.spread ?? 0.35;
        const dx = (r() - 0.5) * 2 * s, dy = (r() - 0.5) * 2 * s;
        pts = points.map(([x, y]) => [x + dx, y + dy]);
      }
      const wearK = o.wear ? Math.min(2.5, 1 + (this.drawn / 100) * (o.wear / pencilTip(o))) : 1;
      const op = buildStroke(pts, { ...o, width: (o.width ?? 1) * wearK }, baseSeed + k * 7919, k > 0 ? 0.8 : 1);
      this.page.push(op);
      this.drawn += strokeLength(op);
      if (o.dent) this.page.push(toolOp('indent', op.data, Math.min(1, o.dent), 0.12));
    }
    return this;
  }

  /**
   * Rub an eraser back and forth between two points, `n` round trips. Each pass lifts less than
   * the one before; rubber erasers smear a grey haze and rough up the paper so it takes later
   * graphite unevenly.
   */
  scrub(from: Pt, to: Pt, opts: ScrubOpts = {}): this {
    const r = rng(opts.seed !== undefined ? seedOf(opts.seed) : this.page.nextSeed());
    const n = Math.max(1, Math.round(opts.n ?? 5));
    const radius = opts.radius ?? 2.2, drift = opts.drift ?? radius * 0.35;
    const len = dist(from, to) || 1;
    const nx = -(to[1] - from[1]) / len, ny = (to[0] - from[0]) / len;
    for (let k = 0; k < n * 2; k++) {
      const off = (r() - 0.5) * 2 * drift;
      // Strokes fall a little short or long at the turnarounds.
      const a: Pt = [from[0] + nx * off, from[1] + ny * off], b: Pt = [to[0] + nx * off, to[1] + ny * off];
      const t0 = (r() - 0.5) * 0.15, t1 = 1 + (r() - 0.5) * 0.15;
      const p0: Pt = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
      const p1: Pt = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
      const path = k % 2 ? [p1, p0] : [p0, p1];
      this.tool('scrub', path, { ...opts, radius }, opts.eraser ?? 'rubber');
    }
    return this;
  }

  /** Scrub a whole area: zigzag over it `n` times (alternating direction). */
  scrubArea(area: Pt[], opts: ScrubOpts = {}): this {
    const n = Math.max(1, Math.round(opts.n ?? 2));
    const radius = opts.radius ?? 2.2;
    for (let k = 0; k < n; k++) {
      const z = zigzag(area, radius * 1.3);
      this.tool('scrub', k % 2 ? z.reverse() : z, { ...opts, radius }, opts.eraser ?? 'rubber');
    }
    return this;
  }

  /** Press a groove into the paper (stylus, fingernail). Shade over it later and it stays white. */
  indent(path: Pt[], opts: ToolOpts = {}): this {
    return this.tool('indent', path.length > 2 ? catmullRom(path, 0.1) : path, { radius: 0.15, amount: 0.8, ...opts });
  }

  /** Press a kneaded eraser straight down: soft, mottled lift with no rubbing. */
  dab(at: Pt, opts: ToolOpts = {}): this {
    return this.tool('dab', [at, [at[0] + 0.01, at[1]]], { radius: 2, amount: 0.6, ...opts });
  }

  /** Drag a fingertip along a path: graphite is pulled in the direction of travel. */
  smudge(path: Pt[], opts: ToolOpts = {}): this {
    return this.tool('smudge', path.length > 2 ? catmullRom(path, 0.2) : path, { radius: 2.5, amount: 0.6, ...opts });
  }

  line(a: Pt, b: Pt, opts: StrokeOpts = {}): this {
    return this.stroke([a, b], { smooth: false, ...opts });
  }

  /** Quadratic curve from a to b bent toward control c. */
  curve(a: Pt, c: Pt, b: Pt, opts: StrokeOpts = {}): this {
    return this.stroke(quad(a, c, b, Math.max(8, Math.ceil(dist(a, b) / 1.5))), { smooth: false, ...opts });
  }

  /** Hand-drawn ellipse that doesn't quite close, like a real pencil circle. */
  ellipse(c: Pt, rx: number, ry = rx, opts: StrokeOpts & { rotation?: number; overlap?: number } = {}): this {
    const r = rng(opts.seed !== undefined ? seedOf(opts.seed) : this.page.nextSeed());
    const start = r() * Math.PI * 2;
    const overlap = opts.overlap ?? 0.25;
    const n = Math.max(24, Math.ceil(((rx + ry) * Math.PI) / 1.5));
    const pts = ellipsePts(c, rx, ry, ((opts.rotation ?? 0) * Math.PI) / 180, n, start, start + Math.PI * 2 + overlap);
    return this.stroke(pts, { smooth: false, ...opts });
  }

  /** Closed polygon outline. */
  poly(points: Pt[], opts: StrokeOpts = {}): this {
    return this.stroke([...points, points[0]], { smooth: false, ...opts });
  }

  /** Parallel hatching clipped to a polygon. */
  hatch(poly: Pt[], opts: HatchOpts = {}): this {
    const o = { taper: [1.2, 1.8] as [number, number], wobble: 0.05, tremor: 0.01, overshoot: 0, passes: 1, ...this.defaults, ...opts };
    const r = rng(o.seed !== undefined ? seedOf(o.seed) : this.page.nextSeed());
    const ang = ((o.angle ?? 45) * Math.PI) / 180;
    const d: Pt = [Math.cos(ang), -Math.sin(ang)];
    const nrm: Pt = [-d[1], d[0]];
    const spacing = Math.max(0.15, o.spacing ?? 1.2);
    const jitter = o.jitter ?? 0.25;
    const bow = o.bow ?? spacing * 0.6;
    const ragged = o.ragged ?? spacing * 1.2;
    // Project the polygon onto the normal to find the sweep range.
    let lo = Infinity, hi = -Infinity;
    for (const p of poly) {
      const s = p[0] * nrm[0] + p[1] * nrm[1];
      lo = Math.min(lo, s); hi = Math.max(hi, s);
    }
    for (let s = lo + spacing * 0.5; s < hi; s += spacing * (1 + (r() - 0.5) * 2 * jitter)) {
      const o0: Pt = [nrm[0] * s, nrm[1] * s];
      const ts = lineCrossings(poly, o0, d);
      for (let i = 0; i + 1 < ts.length; i += 2) {
        const t0 = ts[i] + r() * ragged * 0.6, t1 = ts[i + 1] - r() * ragged;
        if (t1 - t0 < spacing * 0.8) continue;
        const a: Pt = [o0[0] + d[0] * t0, o0[1] + d[1] * t0];
        const b: Pt = [o0[0] + d[0] * t1, o0[1] + d[1] * t1];
        const mid: Pt = [(a[0] + b[0]) / 2 + nrm[0] * bow * (r() - 0.3), (a[1] + b[1]) / 2 + nrm[1] * bow * (r() - 0.3)];
        this.page.push(buildStroke(quad(a, mid, b, 12), { ...o, smooth: false }, Math.floor(r() * 2 ** 32), 1));
      }
    }
    return this;
  }

  crosshatch(poly: Pt[], opts: HatchOpts & { layers?: number } = {}): this {
    const layers = opts.layers ?? 2;
    const a = opts.angle ?? 45;
    for (let i = 0; i < layers; i++) this.hatch(poly, { ...opts, angle: a + (i * 180) / (layers + 1) + (i ? 7 : 0), seed: undefined });
    return this;
  }

  /**
   * Fill a polygon with an even graphite tone (studio-style shading): dense hatching sized to
   * the target value, optionally crossed, then blended with a stump.
   */
  tone(poly: Pt[], opts: ToneOpts = {}): this {
    const v = clamp(opts.value ?? 0.5);
    const spacing = opts.spacing ?? 0.3 + (1 - v) * 0.4;
    const pressure = opts.pressure ?? 0.35 + v * 0.6;
    const pencilName = opts.pencil ?? (v > 0.7 ? '4B' : v > 0.4 ? '2B' : 'HB');
    const h: HatchOpts = { taper: [2, 2], width: 0.75, flutter: 0.3, wobble: 0.04, bow: 0.3, ragged: 1.5, jitter: 0.15, ...opts, spacing, pressure, pencil: pencilName, passes: 1, overshoot: 0 };
    this.hatch(poly, h);
    if (v > (opts.crossAbove ?? 0.45)) this.hatch(poly, { ...h, angle: (opts.angle ?? 45) + 70, seed: undefined });
    const blend = opts.blend ?? 0.8;
    if (blend) this.blend(poly, { amount: blend, radius: Math.max(0.9, spacing * 2.2) });
    return this;
  }

  /** Smudge with a blending stump over a polygon: softens tooth texture and adds burnish. */
  blend(area: Pt[], opts: ToolOpts = {}): this {
    return this.tool('blend', zigzag(area, (opts.radius ?? 1.5) * 1.2), opts);
  }

  /** Blend along a path rather than over an area. */
  blendPath(path: Pt[], opts: ToolOpts = {}): this {
    return this.tool('blend', catmullRom(path, 0.3), opts);
  }

  /** Kneaded eraser along a path: lifts graphite, can pull highlights out of tone. */
  erase(path: Pt[], opts: ToolOpts = {}): this {
    return this.tool('erase', path.length > 2 ? catmullRom(path, 0.3) : resample(path, 0.3).pts, opts);
  }

  /** Erase an area. */
  eraseArea(area: Pt[], opts: ToolOpts = {}): this {
    return this.tool('erase', zigzag(area, (opts.radius ?? 1.5) * 1.1), opts);
  }

  /** Comic speech bubble outline with a tail pointing at `tail`. Lettering comes later. */
  bubble(c: Pt, rx: number, ry: number, tail: Pt, opts: StrokeOpts = {}): this {
    const ang = Math.atan2(tail[1] - c[1], tail[0] - c[0]);
    const gap = 0.22;
    const pts = ellipsePts(c, rx, ry, 0, 72, ang + gap, ang + Math.PI * 2 - gap);
    const a = pts[0], b = pts[pts.length - 1];
    this.stroke([b, ...[[tail[0], tail[1]] as Pt], a], { smooth: false, passes: 1, overshoot: 0, ...opts });
    return this.stroke(pts, { smooth: false, passes: 1, overshoot: 0, ...opts });
  }

  private tool(kind: ToolKind, path: Pt[], opts: ToolOpts, eraser?: EraserKind): this {
    const radius = opts.radius ?? 1.5;
    const step = kind === 'smudge' ? Math.max(0.08, radius * 0.12) : Math.max(0.05, radius * 0.25);
    const { pts } = resample(path, step);
    const data = new Float32Array(pts.length * 4);
    pts.forEach((p, i) => data.set([p[0], p[1], 1, radius], i * 4));
    const op = toolOp(kind, data, clamp(opts.amount ?? 0.7), radius);
    if (eraser) op.eraser = eraser;
    this.page.push(op);
    return this;
  }
}

function toolOp(kind: ToolKind, data: Float32Array, amount: number, radius: number): ToolOp {
  // Tool ops store radius per vertex; a stroke's data is reused for dents with a narrow radius.
  const d = new Float32Array(data);
  for (let i = 3; i < d.length; i += 4) d[i] = radius;
  for (let i = 2; i < d.length; i += 4) d[i] = kind === 'indent' ? Math.min(1, data[i] * 1.2) : 1;
  return { kind, data: d, amount, bbox: bboxOf(d, 4, radius * 2), group: '' };
}

function strokeLength(op: StrokeOp): number {
  let l = 0;
  for (let i = 4; i < op.data.length; i += 4) l += Math.hypot(op.data[i] - op.data[i - 4], op.data[i + 1] - op.data[i - 3]);
  return l;
}

const pencilTip = (o: StrokeOpts) => getPencil(o.pencil ?? 'HB').tip;

/** Back-and-forth path that covers a polygon (for stump and eraser fills). */
function zigzag(poly: Pt[], step: number): Pt[] {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of poly) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const out: Pt[] = [];
  let flip = false;
  for (let y = y0 + step * 0.5; y < y1; y += step) {
    const ts = lineCrossings(poly, [0, y], [1, 0]);
    if (ts.length < 2) continue;
    const a: Pt = [ts[0], y], b: Pt = [ts[ts.length - 1], y];
    if (flip) out.push(b, a); else out.push(a, b);
    flip = !flip;
  }
  return out;
}

/** Turn a hand-specified path into stamped vertices with taper, wobble, tremor and pressure. */
function buildStroke(points: Pt[], o: StrokeOpts, seed: number, pressureScale: number): StrokeOp {
  const pen = getPencil(o.pencil ?? 'HB');
  const step = 0.2;
  let path = o.smooth === false || points.length < 3 ? points : catmullRom(points, step);
  if (path.length === 1) path = [path[0], [path[0][0] + 0.01, path[0][1]]];
  const r = rng(seed);
  // Overshoot: extend each end along its tangent by a random fraction of `overshoot`.
  const os = o.overshoot ?? 0;
  if (os > 0 && path.length >= 2) {
    const ext = (p: Pt, q: Pt, len: number): Pt => {
      const d = dist(p, q) || 1;
      return [p[0] + ((p[0] - q[0]) / d) * len, p[1] + ((p[1] - q[1]) / d) * len];
    };
    path = [ext(path[0], path[Math.min(2, path.length - 1)], os * r()), ...path, ext(path[path.length - 1], path[Math.max(0, path.length - 3)], os * (0.4 + r()))];
  }
  const { pts, len } = resample(path, step);
  const n = pts.length;
  const data = new Float32Array(n * 4);
  const wob = o.wobble ?? 0.1, trem = o.tremor ?? 0.015, flutter = o.flutter ?? 0.15;
  const [tin, tout] = typeof o.taper === 'number' ? [o.taper, o.taper] : o.taper ?? [2, 3];
  const press = o.pressure ?? 0.6;
  const tipR = pen.tip * (o.width ?? 1);
  const ns = seed & 0xffff;
  for (let i = 0; i < n; i++) {
    const s = (i / Math.max(1, n - 1)) * len; // arc length mm
    const t = n > 1 ? i / (n - 1) : 0;
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dl = dist(a, b) || 1;
    const nx = -(b[1] - a[1]) / dl, ny = (b[0] - a[0]) / dl;
    const off = fbm1(s / 18, ns, 2) * wob + fbm1(s / 0.9, ns + 31, 2) * trem;
    // Taper envelope: ease the pressure on/off at the ends, scaled down for short strokes.
    const k = Math.min(1, len / Math.max(0.01, tin + tout));
    const env = smoothstep(0, Math.max(0.01, tin * k), s) * smoothstep(0, Math.max(0.01, tout * k), len - s);
    const pr = clamp(pressureAt(press, t) * pressureScale * (0.25 + 0.75 * env) * (1 + fbm1(s / 6, ns + 77, 2) * flutter));
    data[i * 4] = pts[i][0] + nx * off;
    data[i * 4 + 1] = pts[i][1] + ny * off;
    data[i * 4 + 2] = pr * (0.35 + 0.65 * env);
    data[i * 4 + 3] = tipR * (0.55 + 0.45 * Math.sqrt(pr)) * (0.5 + 0.5 * env);
  }
  return { kind: 'stroke', pencil: pen, data, bbox: bboxOf(data, 4, tipR * 2), group: '' };
}

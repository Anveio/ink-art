// Hand lettering: single-stroke capitals drawn with the pencil, the way comic letterers work.
// Each letter is a few real strokes with a little hand jitter (size, baseline, tilt), so the text
// sits on the paper exactly like the rest of the drawing.
import { type BBox, type Pt } from '../core/geom.ts';
import { rng, seedOf } from '../core/random.ts';
import { FUTURAL } from './hershey.ts';
import type { Pen, StrokeOpts } from './page.ts';

export interface LetterOpts extends StrokeOpts {
  /** Cap height in mm. */
  size?: number;
  align?: 'left' | 'center' | 'right';
  /** Line spacing as a multiple of cap height. */
  leading?: number;
  /** Extra space between letters, as a fraction of cap height. */
  tracking?: number;
  /** Horizontal squash (comic lettering is a little condensed). */
  condense?: number;
  /** How unsteady the letterer is, 0..1. */
  hand?: number;
}

const UNITS = 21;

function lineWidth(line: string, o: Required<Pick<LetterOpts, 'size' | 'tracking' | 'condense'>>) {
  const k = (o.size / UNITS) * o.condense;
  let w = 0;
  for (const ch of line) {
    const g = FUTURAL[ch] ?? FUTURAL['?'];
    w += g[0] * 2 * k * 0.86 + o.tracking * o.size;
  }
  return Math.max(0, w - o.tracking * o.size);
}

function resolve(opts: LetterOpts) {
  return { size: opts.size ?? 3, align: opts.align ?? 'center', leading: opts.leading ?? 1.55, tracking: opts.tracking ?? 0.12, condense: opts.condense ?? 0.92, hand: opts.hand ?? 1 };
}

/** Size of a block of text in mm. */
export function measureText(text: string, opts: LetterOpts = {}): { w: number; h: number } {
  const o = resolve(opts);
  const lines = text.toUpperCase().split('\n');
  return { w: Math.max(...lines.map((l) => lineWidth(l, o))), h: o.size * (1 + (lines.length - 1) * o.leading) };
}

/**
 * Letter `text` (newlines break lines) with its block centred on `at` (or starting there for
 * align left). Returns the block's bbox.
 */
export function letter(pen: Pen, text: string, at: Pt, opts: LetterOpts = {}): BBox {
  const o = resolve(opts);
  const lines = text.toUpperCase().split('\n');
  const { w, h } = measureText(text, opts);
  const r = rng(seedOf(opts.seed ?? text));
  const k0 = (o.size / UNITS) * o.condense;
  const ky0 = o.size / UNITS;
  const strokeOpts: StrokeOpts = { pencil: '2B', pressure: 0.78, taper: [0.35, 0.5], wobble: 0.04, tremor: 0.012, overshoot: 0.08, passes: 1, flutter: 0.12, width: 0.85, smooth: false, ...opts };
  let y = at[1] - h / 2;
  for (const line of lines) {
    const lw = lineWidth(line, o);
    let x = o.align === 'left' ? at[0] : o.align === 'right' ? at[0] - lw : at[0] - lw / 2;
    // The whole line drifts a hair off level.
    const lineTilt = (r() - 0.5) * 0.02 * o.hand;
    for (const ch of line) {
      const g = FUTURAL[ch] ?? FUTURAL['?'];
      const sz = 1 + (r() - 0.5) * 0.08 * o.hand;
      const k = k0 * sz, ky = ky0 * sz;
      const tilt = (r() - 0.5) * 0.06 * o.hand;
      const dy = (r() - 0.5) * 0.12 * o.size * o.hand * 0.3 + (x - at[0]) * lineTilt;
      const cx = x + g[0] * k * 0.86, cy = y + o.size / 2 + dy;
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      for (const s of g[1]) {
        const pts: Pt[] = s.map(([gx, gy]) => {
          // Glyph space -> mm, centred on the letter, then tilted.
          const lx = (gx - g[0]) * k * 0.86, ly = (gy - 11.5) * ky;
          return [cx + lx * ct - ly * st, cy + lx * st + ly * ct];
        });
        if (pts.length === 1) pts.push([pts[0][0] + 0.05, pts[0][1]]);
        // Rounded letters: smooth the long polylines (O, S, C), keep corners on short ones.
        const smooth = pts.length > 6;
        pen.stroke(pts, { ...strokeOpts, smooth, seed: Math.floor(r() * 2 ** 31) });
      }
      x += g[0] * 2 * k * 0.86 + o.tracking * o.size;
    }
    y += o.size * o.leading;
  }
  const bx = o.align === 'left' ? at[0] : o.align === 'right' ? at[0] - w : at[0] - w / 2;
  return [bx, at[1] - h / 2, bx + w, at[1] + h / 2];
}

export interface BalloonOpts extends LetterOpts {
  /** Padding around the text in mm. */
  pad?: number;
  /** Line options for the balloon outline. */
  line?: StrokeOpts;
  /** Make the balloon at least this wide/tall (mm). */
  minRx?: number;
  minRy?: number;
  /** Thought/whisper style: 'speech' (default), 'small' (no tail). */
  kind?: 'speech' | 'none';
  /** Longest tail past the balloon edge, mm. */
  maxTail?: number;
}

/**
 * A speech balloon sized to its text: an ellipse that just contains the text block, with a tail
 * pointing at `tail`. Returns the ellipse centre and radii.
 */
export function balloon(pen: Pen, text: string, at: Pt, tail: Pt | null, opts: BalloonOpts = {}) {
  const { w, h } = measureText(text, opts);
  const pad = opts.pad ?? 1.6;
  // The smallest ellipse of the text block's aspect that contains it is sqrt(2) times its half sizes.
  const rx = Math.max(opts.minRx ?? 0, (w / 2) * 1.3 + pad), ry = Math.max(opts.minRy ?? 0, (h / 2) * 1.32 + pad * 1.05);
  letter(pen, text, at, opts);
  const line: StrokeOpts = { pencil: '2B', pressure: 0.85, width: 1.1, wobble: 0.12, tremor: 0.01, taper: [0.6, 0.6], ...opts.line };
  if (tail) {
    // Keep tails short and stubby like the references: at most `maxTail` past the balloon edge.
    const dx = tail[0] - at[0], dy = tail[1] - at[1], ang = Math.atan2(dy, dx);
    const edge = 1 / Math.hypot(Math.cos(ang) / rx, Math.sin(ang) / ry);
    const want = Math.hypot(dx, dy) - edge, maxTail = opts.maxTail ?? Math.max(3.5, Math.min(rx, ry) * 0.7);
    const L = edge + Math.min(want, maxTail);
    pen.bubble(at, rx, ry, [at[0] + Math.cos(ang) * L, at[1] + Math.sin(ang) * L], line);
  }
  else pen.ellipse(at, rx, ry, { ...line, overlap: 0.15 });
  return { at, rx, ry };
}

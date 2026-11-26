import { type BBox, bboxIntersects, clamp, smoothstep } from '../core/geom.ts';
import { vnoise2 } from '../core/random.ts';
import type { Op, Page, StrokeOp, ToolOp } from '../sdk/page.ts';
import type { Paper } from '../sdk/paper.ts';
import { drawText } from './font.ts';

/**
 * How the sheet is lit.
 *  flat   no lighting: fastest, for checking linework
 *  scan   even light, mild relief and sheen, like a good flatbed scan
 *  photo  raking point light, visible tooth relief, graphite sheen where the light catches,
 *         soft falloff and vignette, like a photo of the drawing on a desk
 */
export type Finish = 'flat' | 'scan' | 'photo';

export interface RenderOpts {
  /** Pixels per inch. Previews: 50-150. Print: 300-600. */
  dpi?: number;
  /** Crop in mm: [x, y, width, height]. Only ops touching it are drawn. */
  region?: [number, number, number, number];
  /** Scale the output to fit this many pixels on its long side (overrides dpi). */
  fit?: number;
  finish?: Finish;
  /** Only draw these groups (prefix match). */
  only?: string[];
  /** Skip these groups (prefix match). */
  hide?: string[];
  /** Overlay a labelled mm grid with this spacing (preview aid). */
  grid?: number;
  /** Sheen strength multiplier. */
  sheen?: number;
  /** Light position for the photo finish as fractions of the page, z as fraction of diagonal. */
  light?: [number, number, number];
  /** Called after each tile with (done, total). */
  onProgress?: (done: number, total: number) => void;
}

export interface RenderedImage {
  width: number;
  height: number;
  /** RGBA, 8 bit, sRGB. */
  data: Uint8ClampedArray;
  /** mm -> px scale and the crop origin in mm, so you can map pixels back to page coordinates. */
  pxPerMm: number;
  origin: [number, number];
  stats: { ops: number; ms: number };
}

const TILE = 384;

export function render(page: Page, opts: RenderOpts = {}): RenderedImage {
  const t0 = performance.now();
  const region = opts.region ?? [0, 0, page.width, page.height];
  let dpi = opts.dpi ?? 100;
  if (opts.fit) dpi = (opts.fit / Math.max(region[2], region[3])) * 25.4;
  const s = dpi / 25.4; // px per mm
  const px0 = Math.floor(region[0] * s), py0 = Math.floor(region[1] * s);
  const W = Math.max(1, Math.ceil((region[0] + region[2]) * s) - px0);
  const H = Math.max(1, Math.ceil((region[1] + region[3]) * s) - py0);
  const out = new Uint8ClampedArray(W * H * 4);

  const ops = page.ops.filter((op) => {
    if (opts.only && !opts.only.some((g) => op.group === g || op.group.startsWith(g + '/'))) return false;
    if (opts.hide && opts.hide.some((g) => op.group === g || op.group.startsWith(g + '/'))) return false;
    return true;
  });
  // Tool ops need neighbouring pixels; normals need one pixel.
  let maxR = 0;
  for (const op of ops) if (op.kind !== 'stroke') maxR = Math.max(maxR, op.data[3]);
  const margin = Math.ceil(maxR * s * 1.5) + 3;

  const ctx = makeContext(page, opts, s);
  const tilesX = Math.ceil(W / TILE), tilesY = Math.ceil(H / TILE);
  let used = new Set<Op>();
  for (let ty = 0; ty < tilesY; ty++)
    for (let tx = 0; tx < tilesX; tx++) {
      const x = px0 + tx * TILE, y = py0 + ty * TILE;
      const w = Math.min(TILE, px0 + W - x), h = Math.min(TILE, py0 + H - y);
      const tileOps = renderTile(ctx, ops, x, y, w, h, margin, out, x - px0, y - py0, W);
      tileOps.forEach((o) => used.add(o));
      opts.onProgress?.(ty * tilesX + tx + 1, tilesX * tilesY);
    }

  const img: RenderedImage = { width: W, height: H, data: out, pxPerMm: s, origin: [px0 / s, py0 / s], stats: { ops: used.size, ms: 0 } };
  if (opts.grid) drawGrid(img, opts.grid);
  img.stats.ms = Math.round(performance.now() - t0);
  return img;
}

interface Ctx {
  page: Page;
  paper: Paper;
  seed: number;
  s: number; // px per mm
  pmm: number; // mm per px
  finish: Finish;
  sheen: number;
  light: [number, number, number];
  cam: [number, number, number];
  /** 0..1, how much of the tooth detail is below pixel size at this dpi. */
  toothLoss: number;
}

function makeContext(page: Page, opts: RenderOpts, s: number): Ctx {
  const diag = Math.hypot(page.width, page.height);
  const l = opts.light ?? [-0.3, -0.45, 0.75];
  const pmm = 1 / s;
  // Octave filtering: the tooth's finest octave is tooth/4 mm. Fade detail as pixels outgrow it.
  const toothLoss = smoothstep(0.25, 1.2, pmm / page.paper.tooth);
  return {
    page, paper: page.paper, seed: page.seed, s, pmm,
    finish: opts.finish ?? 'scan',
    sheen: opts.sheen ?? 1,
    light: [page.width * (0.5 + l[0]), page.height * (0.5 + l[1]), diag * l[2]],
    cam: [page.width * 0.5, page.height * 0.6, diag * 1.4],
    toothLoss,
  };
}

/** Paper height in 0..1 at a point (mm). Octaves finer than the pixel are replaced by their mean. */
function paperHeight(x: number, y: number, c: Ctx): number {
  const p = c.paper, seed = c.seed;
  const f = 1 / p.tooth;
  let sum = 0, norm = 0, amp = 1, freq = f;
  for (let o = 0; o < 3; o++) {
    // Nyquist fade per octave.
    const k = 1 - smoothstep(0.2, 0.5, freq * c.pmm);
    const n = k > 0 ? vnoise2(x * freq + o * 17.3, y * freq - o * 9.1, seed + o) : 0.5;
    sum += (0.5 + (n - 0.5) * k) * amp;
    norm += amp; amp *= 0.75; freq *= 1.9;
  }
  let h = sum / norm;
  if (p.fibers > 0) {
    // Long fibres along two directions.
    const fx = x * 0.8 + y * 0.6, fy = -x * 0.6 + y * 0.8;
    const ff = f / 10, fl = f / 1.4;
    const k = 1 - smoothstep(0.2, 0.5, fl * c.pmm);
    const fib = k > 0 ? (vnoise2(fx * ff, fy * fl, seed + 40) + vnoise2(fy * ff, fx * fl, seed + 41)) * 0.5 : 0.5;
    h += (fib - 0.5) * k * p.fibers;
  }
  // Sharpen into bumps: tooth peaks are narrower than its valleys.
  h = 0.5 + (h - 0.5) * (1.6 * p.contrast + 0.4);
  return h < 0 ? 0 : h > 1 ? 1 : h;
}

function renderTile(c: Ctx, allOps: Op[], x: number, y: number, w: number, h: number, margin: number, out: Uint8ClampedArray, ox: number, oy: number, outW: number): Op[] {
  const bx = x - margin, by = y - margin, bw = w + margin * 2, bh = h + margin * 2;
  const n = bw * bh;
  const s = c.s, pmm = c.pmm;
  const tileBox: BBox = [bx * pmm, by * pmm, (bx + bw) * pmm, (by + bh) * pmm];
  const ops = allOps.filter((op) => bboxIntersects(op.bbox, tileBox));

  const Hf = new Float32Array(n);
  for (let j = 0; j < bh; j++)
    for (let i = 0; i < bw; i++) Hf[j * bw + i] = paperHeight((bx + i + 0.5) * pmm, (by + j + 0.5) * pmm, c);

  const D = new Float32Array(n); // graphite amount
  const T = new Float32Array(n); // tone-weighted amount (T/D = average lead tone)
  const S = new Float32Array(n); // burnish / sheen amount
  const buf: Buf = { D, T, S, H: Hf, bx, by, bw, bh };
  for (const op of ops) {
    if (op.kind === 'stroke') depositStroke(op, buf, c);
    else applyTool(op, buf, c);
  }
  shade(buf, c, margin, w, h, out, ox, oy, outW);
  return ops;
}

interface Buf { D: Float32Array; T: Float32Array; S: Float32Array; H: Float32Array; bx: number; by: number; bw: number; bh: number }

function depositStroke(op: StrokeOp, b: Buf, c: Ctx) {
  const { D, T, S, H, bx, by, bw, bh } = b;
  const s = c.s, pen = op.pencil, d = op.data;
  const soft = 0.16 + 0.4 * c.toothLoss;
  const nv = d.length / 4;
  let carry = 0;
  for (let v = 0; v < nv - 1; v++) {
    const x0 = d[v * 4] * s - bx, y0 = d[v * 4 + 1] * s - by;
    const x1 = d[v * 4 + 4] * s - bx, y1 = d[v * 4 + 5] * s - by;
    const segLen = Math.hypot(x1 - x0, y1 - y0);
    const rMid = Math.max(0.1, (d[v * 4 + 3] + d[v * 4 + 7]) * 0.5 * s);
    const sp = Math.max(0.25, rMid * 0.3);
    let t = carry;
    while (t <= segLen) {
      const u = segLen > 0 ? t / segLen : 0;
      const cx = x0 + (x1 - x0) * u, cy = y0 + (y1 - y0) * u;
      const pr = d[v * 4 + 2] + (d[v * 4 + 6] - d[v * 4 + 2]) * u;
      let r = (d[v * 4 + 3] + (d[v * 4 + 7] - d[v * 4 + 3]) * u) * s;
      // Keep mass when the tip is smaller than a pixel.
      let massK = 1;
      if (r < 0.75) { massK = (r / 0.75) ** 2; r = 0.75; }
      const aa = Math.max(0.6, r * 0.08);
      const reach = Math.min(1, pen.reach * Math.pow(pr, 0.45));
      const th = 1 - reach;
      const amount = pen.rate * pr * (sp / (2 * r)) * massK * 2.2;
      const R = r + aa;
      const ix0 = Math.max(0, Math.floor(cx - R)), ix1 = Math.min(bw - 1, Math.ceil(cx + R));
      const iy0 = Math.max(0, Math.floor(cy - R)), iy1 = Math.min(bh - 1, Math.ceil(cy + R));
      if (amount > 0 && ix0 <= ix1 && iy0 <= iy1) {
        const sheenK = pen.sheen * (0.4 + pr);
        for (let iy = iy0; iy <= iy1; iy++) {
          const dy = iy + 0.5 - cy;
          for (let ix = ix0; ix <= ix1; ix++) {
            const dx = ix + 0.5 - cx;
            const dd = Math.sqrt(dx * dx + dy * dy);
            let k = (r - dd) / aa + 0.5;
            if (k <= 0) continue;
            if (k > 1) k = 1;
            const q = dd / r;
            k *= 1 - 0.4 * q * q;
            const idx = iy * bw + ix;
            const a = 1 - Math.exp(-D[idx]);
            // Graphite fills the tooth, so later passes reach further down.
            const he = H[idx] + a * pen.fill;
            let touch = (he - (th - soft)) / (2 * soft);
            if (touch <= 0) continue;
            if (touch > 1) touch = 1;
            touch = touch * touch * (3 - 2 * touch);
            // Tooth saturation: a loaded surface takes less new graphite.
            const dep = (amount * k * touch) / (1 + D[idx] * 0.45);
            D[idx] += dep;
            T[idx] += dep * pen.tone;
            S[idx] += dep * sheenK;
          }
        }
      }
      t += sp;
    }
    carry = t - segLen;
  }
}

function applyTool(op: ToolOp, b: Buf, c: Ctx) {
  const { D, T, S, bx, by, bw, bh } = b;
  const buf_H = b.H;
  const s = c.s, d = op.data;
  // Mask over the op's bbox (clipped to the buffer).
  const x0 = Math.max(0, Math.floor(op.bbox[0] * s - bx)), x1 = Math.min(bw - 1, Math.ceil(op.bbox[2] * s - bx));
  const y0 = Math.max(0, Math.floor(op.bbox[1] * s - by)), y1 = Math.min(bh - 1, Math.ceil(op.bbox[3] * s - by));
  if (x0 > x1 || y0 > y1) return;
  const mw = x1 - x0 + 1, mh = y1 - y0 + 1;
  const M = new Float32Array(mw * mh);
  const nv = d.length / 4;
  for (let v = 0; v < nv; v++) {
    const cx = d[v * 4] * s - bx, cy = d[v * 4 + 1] * s - by, r = Math.max(1, d[v * 4 + 3] * s), st = d[v * 4 + 2];
    const ia = Math.max(x0, Math.floor(cx - r)), ib = Math.min(x1, Math.ceil(cx + r));
    const ja = Math.max(y0, Math.floor(cy - r)), jb = Math.min(y1, Math.ceil(cy + r));
    for (let j = ja; j <= jb; j++)
      for (let i = ia; i <= ib; i++) {
        const q = Math.hypot(i + 0.5 - cx, j + 0.5 - cy) / r;
        if (q >= 1) continue;
        const k = (1 - q * q) * st;
        const m = (j - y0) * mw + (i - x0);
        if (k > M[m]) M[m] = k;
      }
  }
  const amt = op.amount;
  if (op.kind === 'erase') {
    for (let j = 0; j < mh; j++)
      for (let i = 0; i < mw; i++) {
        const m = M[j * mw + i];
        if (!m) continue;
        const idx = (j + y0) * bw + (i + x0);
        // Lift a fraction of the visible coverage (heavy soft lead never fully comes off).
        const d0 = D[idx];
        if (d0 <= 0) continue;
        const a0 = 1 - Math.exp(-d0 * 1.1);
        // Erasers grab the tooth peaks first; graphite in the valleys hangs on.
        const a1 = a0 * (1 - Math.min(1, m * amt * (0.35 + 0.75 * buf_H[idx])));
        const d1 = -Math.log(1 - a1) / 1.1;
        const f = d1 / d0;
        D[idx] = d1; T[idx] *= f; S[idx] *= f * 0.8;
      }
    return;
  }
  // Blend: mix each channel toward a blurred copy, and burnish.
  const rad = Math.max(1, Math.round(d[3] * s * 0.3));
  for (const ch of [D, T, S]) {
    const blurred = boxBlur2(ch, bw, bh, x0, y0, mw, mh, rad);
    for (let j = 0; j < mh; j++)
      for (let i = 0; i < mw; i++) {
        const m = M[j * mw + i] * amt;
        if (!m) continue;
        const idx = (j + y0) * bw + (i + x0);
        ch[idx] += (blurred[j * mw + i] - ch[idx]) * m;
      }
  }
  for (let j = 0; j < mh; j++)
    for (let i = 0; i < mw; i++) {
      const m = M[j * mw + i] * amt;
      if (!m) continue;
      const idx = (j + y0) * bw + (i + x0);
      S[idx] += D[idx] * m * 0.6;
    }
}

/** Two passes of a separable box blur over a sub-rect, reading from the full buffer. */
function boxBlur2(src: Float32Array, bw: number, bh: number, x0: number, y0: number, mw: number, mh: number, r: number): Float32Array {
  // Work on the rect expanded by 2r so the edges see real neighbours.
  const ex0 = Math.max(0, x0 - 2 * r), ey0 = Math.max(0, y0 - 2 * r);
  const ex1 = Math.min(bw - 1, x0 + mw - 1 + 2 * r), ey1 = Math.min(bh - 1, y0 + mh - 1 + 2 * r);
  const ew = ex1 - ex0 + 1, eh = ey1 - ey0 + 1;
  let a = new Float32Array(ew * eh);
  for (let j = 0; j < eh; j++) a.set(src.subarray((j + ey0) * bw + ex0, (j + ey0) * bw + ex0 + ew), j * ew);
  let tmp = new Float32Array(ew * eh);
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < eh; j++) {
      let acc = 0;
      const row = j * ew;
      for (let i = -r; i <= r; i++) acc += a[row + Math.min(ew - 1, Math.max(0, i))];
      for (let i = 0; i < ew; i++) {
        tmp[row + i] = acc / (2 * r + 1);
        acc += a[row + Math.min(ew - 1, i + r + 1)] - a[row + Math.max(0, i - r)];
      }
    }
    for (let i = 0; i < ew; i++) {
      let acc = 0;
      for (let j = -r; j <= r; j++) acc += tmp[Math.min(eh - 1, Math.max(0, j)) * ew + i];
      for (let j = 0; j < eh; j++) {
        a[j * ew + i] = acc / (2 * r + 1);
        acc += tmp[Math.min(eh - 1, j + r + 1) * ew + i] - tmp[Math.max(0, j - r) * ew + i];
      }
    }
  }
  const out = new Float32Array(mw * mh);
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) out[j * mw + i] = a[(j + y0 - ey0) * ew + (i + x0 - ex0)];
  return out;
}

// linear -> sRGB lookup
const LUT_N = 4096;
const SRGB = new Uint8ClampedArray(LUT_N + 1);
for (let i = 0; i <= LUT_N; i++) {
  const v = i / LUT_N;
  SRGB[i] = Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
}
const toSrgb = (v: number) => SRGB[(v <= 0 ? 0 : v >= 1 ? 1 : v) * LUT_N | 0];

function shade(b: Buf, c: Ctx, m: number, w: number, h: number, out: Uint8ClampedArray, ox: number, oy: number, outW: number) {
  const { D, T, S, H, bx, by, bw } = b;
  const pmm = c.pmm, p = c.paper, finish = c.finish;
  const page = c.page;
  const diag = Math.hypot(page.width, page.height);
  // Height field z (mm) for normals. Graphite fills tooth, so dark areas flatten out.
  const zAt = (idx: number, xm: number, ym: number) => {
    const a = 1 - Math.exp(-D[idx]);
    const relief = finish === 'photo' ? p.relief : p.relief * 0.5;
    let z = (H[idx] - 0.5) * relief * (1 - 0.4 * a) + a * 0.002;
    if (finish === 'photo' && p.cockle > 0) z += (vnoise2(xm / 35, ym / 35, c.seed + 90) - 0.5) * p.cockle;
    return z;
  };
  const scanL = norm3([-0.35, -0.5, 1]);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const bi = i + m, bj = j + m;
      const idx = bj * bw + bi;
      const xm = (bx + bi + 0.5) * pmm, ym = (by + bj + 0.5) * pmm;
      const d = D[idx];
      const a = 1 - Math.exp(-d * 1.1);
      const tone = d > 1e-6 ? T[idx] / d : 0.3;
      // Paper albedo varies a little across the sheet.
      const alb = 0.97 + (vnoise2(xm * 0.27 + ym * 0.11, ym * 0.27 - xm * 0.11, c.seed + 70) - 0.5) * 0.018 + (vnoise2(xm / 9, ym / 9, c.seed + 71) - 0.5) * 0.02 + (H[idx] - 0.5) * 0.04 * (1 - c.toothLoss);
      let r = p.tint[0] * alb, g = p.tint[1] * alb, bl = p.tint[2] * alb;
      // Graphite is a cool dark grey.
      const gr = tone * 0.92, gg = tone * 0.95, gb = tone * 1.04;
      r += (gr - r) * a; g += (gg - g) * a; bl += (gb - bl) * a;
      if (finish === 'flat') {
        const o = ((oy + j) * outW + ox + i) * 4;
        out[o] = toSrgb(r); out[o + 1] = toSrgb(g); out[o + 2] = toSrgb(bl); out[o + 3] = 255;
        continue;
      }
      // Normal from central differences (in mm).
      const zx = (zAt(idx + 1, xm + pmm, ym) - zAt(idx - 1, xm - pmm, ym)) / (2 * pmm);
      const zy = (zAt(idx + bw, xm, ym + pmm) - zAt(idx - bw, xm, ym - pmm)) / (2 * pmm);
      const nl = 1 / Math.sqrt(zx * zx + zy * zy + 1);
      const nx = -zx * nl, ny = -zy * nl, nz = nl;
      let L: number[], V: number[], irr = 1;
      if (finish === 'photo') {
        const lx = c.light[0] - xm, ly = c.light[1] - ym, lz = c.light[2];
        const ld = Math.hypot(lx, ly, lz);
        L = [lx / ld, ly / ld, lz / ld];
        const vx = c.cam[0] - xm, vy = c.cam[1] - ym, vz = c.cam[2];
        const vd = Math.hypot(vx, vy, vz);
        V = [vx / vd, vy / vd, vz / vd];
        // Inverse-square falloff, normalised to the page centre.
        const cd = Math.hypot(c.light[0] - page.width / 2, c.light[1] - page.height / 2, lz);
        irr = Math.pow(cd / ld, 1.4);
      } else {
        L = scanL; V = [0, 0, 1];
      }
      const ndl = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      const amb = finish === 'photo' ? 0.25 : 0.45;
      const diff = (amb + (1 - amb) * (ndl / Math.max(0.2, L[2]))) * irr;
      // Graphite sheen: a broad gloss lobe plus a tight glint, scaled by burnish.
      let hx = L[0] + V[0], hy = L[1] + V[1], hz = L[2] + V[2];
      const hl = 1 / Math.hypot(hx, hy, hz);
      hx *= hl; hy *= hl; hz *= hl;
      const ndh = Math.max(0, nx * hx + ny * hy + nz * hz);
      // Burnished tooth peaks shine most.
      const shine = (1 - Math.exp(-S[idx] * 0.5)) * a * (0.35 + 1.3 * H[idx]);
      const gloss = finish === 'photo' ? 0.1 * Math.pow(ndh, 10) + 0.35 * Math.pow(ndh, 60) + 0.7 * Math.pow(ndh, 300) : 0.05 * Math.pow(ndh, 6) + 0.2 * Math.pow(ndh, 60);
      const spec = shine * gloss * c.sheen * irr;
      // Paper itself has a faint matte sheen.
      const pspec = (1 - a) * 0.03 * Math.pow(ndh, 4) * irr;
      r = r * diff + spec * 0.78 + pspec; g = g * diff + spec * 0.8 + pspec; bl = bl * diff + spec * 0.86 + pspec;
      if (finish === 'photo') {
        // Lens vignette, warm lamp.
        const vxn = (xm / page.width - 0.5) * 2, vyn = (ym / page.height - 0.5) * 2;
        const vig = 1 - 0.18 * Math.pow((vxn * vxn + vyn * vyn) / 2, 1.2);
        r *= vig * 1.03; g *= vig; bl *= vig * 0.95;
      }
      const o = ((oy + j) * outW + ox + i) * 4;
      out[o] = toSrgb(r); out[o + 1] = toSrgb(g); out[o + 2] = toSrgb(bl); out[o + 3] = 255;
    }
  }
}

function norm3(v: number[]) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Overlay a labelled mm grid (blue, so it never reads as part of the drawing). */
function drawGrid(img: RenderedImage, step: number) {
  const s = img.pxPerMm, [ox, oy] = img.origin;
  const blue: [number, number, number] = [40, 110, 230];
  const mix = (i: number, k: number) => {
    img.data[i] = img.data[i] * (1 - k) + blue[0] * k;
    img.data[i + 1] = img.data[i + 1] * (1 - k) + blue[1] * k;
    img.data[i + 2] = img.data[i + 2] * (1 - k) + blue[2] * k;
  };
  const first = (o: number) => Math.ceil(o / step) * step;
  const scale = img.width > 900 ? 2 : 1;
  for (let gx = first(ox); (gx - ox) * s < img.width; gx += step) {
    const px = Math.round((gx - ox) * s);
    const major = Math.round(gx / step) % 5 === 0;
    for (let y = 0; y < img.height; y++) mix((y * img.width + px) * 4, major ? 0.55 : 0.25);
    drawText(img, fmt(gx), px + 2, 2, scale, blue);
  }
  for (let gy = first(oy); (gy - oy) * s < img.height; gy += step) {
    const py = Math.round((gy - oy) * s);
    const major = Math.round(gy / step) % 5 === 0;
    for (let x = 0; x < img.width; x++) mix((py * img.width + x) * 4, major ? 0.55 : 0.25);
    drawText(img, fmt(gy), 2, py + 2, scale, blue);
  }
}
const fmt = (v: number) => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : v.toFixed(1));

export const _internal = { paperHeight, clamp };

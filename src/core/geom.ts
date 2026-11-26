export type Pt = [number, number];
export type BBox = [number, number, number, number]; // x0, y0, x1, y1

export const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Centripetal-ish Catmull-Rom through the points, sampled every `step` mm. */
export function catmullRom(pts: Pt[], step = 0.2, closed = false): Pt[] {
  if (pts.length < 3) return pts.slice();
  const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  const out: Pt[] = [];
  const segs = P.length - 3;
  for (let i = 0; i < segs; i++) {
    const p0 = P[i], p1 = P[i + 1], p2 = P[i + 2], p3 = P[i + 3];
    const n = Math.max(2, Math.ceil(dist(p1, p2) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(closed ? pts[0] : pts[pts.length - 1]);
  return out;
}

/** Resample a polyline to uniform arc-length spacing. Returns points and cumulative lengths. */
export function resample(pts: Pt[], step: number): { pts: Pt[]; len: number } {
  if (pts.length < 2) return { pts: pts.slice(), len: 0 };
  const out: Pt[] = [pts[0]];
  let carry = 0, total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const d = dist(a, b);
    if (d === 0) continue;
    let t = step - carry;
    while (t <= d) {
      out.push([lerp(a[0], b[0], t / d), lerp(a[1], b[1], t / d)]);
      t += step;
    }
    carry = d - (t - step);
    total += d;
  }
  const last = pts[pts.length - 1];
  if (dist(out[out.length - 1], last) > step * 0.25) out.push(last);
  return { pts: out, len: total };
}

/** Quadratic bezier sampled into points. */
export function quad(a: Pt, c: Pt, b: Pt, n = 24): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

export function bboxOf(pts: ArrayLike<number>, stride: number, pad = 0): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += stride) {
    const x = pts[i], y = pts[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}

export const bboxIntersects = (a: BBox, b: BBox) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
export const bboxUnion = (a: BBox, b: BBox): BBox => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

/**
 * Intersect the infinite line through `o` with direction `d` against a polygon.
 * Returns sorted parametric t values of crossings (even-odd pairs are "inside" spans).
 */
export function lineCrossings(poly: Pt[], o: Pt, d: Pt): number[] {
  const ts: number[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const den = d[0] * ey - d[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const ax = a[0] - o[0], ay = a[1] - o[1];
    const t = (ax * ey - ay * ex) / den;
    const s = (ax * d[1] - ay * d[0]) / den;
    if (s >= 0 && s < 1) ts.push(t);
  }
  return ts.sort((p, q) => p - q);
}

export function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Ellipse as a polygon. */
export function ellipsePts(c: Pt, rx: number, ry: number, rot = 0, n = 64, a0 = 0, a1 = Math.PI * 2): Pt[] {
  const out: Pt[] = [];
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push([c[0] + x * cr - y * sr, c[1] + x * sr + y * cr]);
  }
  return out;
}

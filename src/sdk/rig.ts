// A drawing rig: draw in a local coordinate system (a character's own units), placed on the
// page with an origin, scale, rotation and optional mirror. Lets one character design be reused
// at any size and angle across panels.
import { type Pt, ellipsePts, quad } from '../core/geom.ts';
import type { HatchOpts, Pen, StrokeOpts, ToneOpts, ToolOpts } from './page.ts';

export class Rig {
  constructor(readonly origin: Pt, readonly scale = 1, readonly rotation = 0, readonly flip = false) {}

  /** A child rig: local point `at`, extra scale and rotation (degrees). */
  sub(at: Pt, scale = 1, rotation = 0): Rig {
    const o = this.T(at);
    return new Rig(o, this.scale * scale, this.rotation + (this.flip ? -rotation : rotation), this.flip);
  }

  /** Local -> page mm. */
  T = (p: Pt): Pt => {
    const a = (this.rotation * Math.PI) / 180;
    const x = (this.flip ? -p[0] : p[0]) * this.scale, y = p[1] * this.scale;
    return [this.origin[0] + x * Math.cos(a) - y * Math.sin(a), this.origin[1] + x * Math.sin(a) + y * Math.cos(a)];
  };
  map = (pts: Pt[]): Pt[] => pts.map(this.T);

  stroke(pen: Pen, pts: Pt[], o: StrokeOpts = {}) { pen.stroke(this.map(pts), o); return this; }
  line(pen: Pen, a: Pt, b: Pt, o: StrokeOpts = {}) { pen.line(this.T(a), this.T(b), o); return this; }
  curve(pen: Pen, a: Pt, c: Pt, b: Pt, o: StrokeOpts = {}) {
    pen.stroke(this.map(quad(a, c, b, Math.max(8, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * this.scale / 1.2)))), { smooth: false, ...o });
    return this;
  }
  /** Ellipse in local units; rotation in degrees (local). */
  ellipse(pen: Pen, c: Pt, rx: number, ry = rx, o: StrokeOpts & { rotation?: number; overlap?: number; start?: number } = {}) {
    const n = Math.max(24, Math.ceil(((rx + ry) * this.scale * Math.PI) / 1.2));
    const start = o.start ?? 2.2; // where the hand starts the loop (radians)
    const pts = ellipsePts(c, rx, ry, ((o.rotation ?? 0) * Math.PI) / 180, n, start, start + Math.PI * 2 + (o.overlap ?? 0.25));
    pen.stroke(this.map(pts), { smooth: false, ...o });
    return this;
  }
  /** Arc of an ellipse between angles (degrees, 0 = +x, 90 = down). */
  arc(pen: Pen, c: Pt, rx: number, ry: number, a0: number, a1: number, o: StrokeOpts = {}) {
    const n = Math.max(8, Math.ceil(((rx + ry) * this.scale * Math.abs(a1 - a0)) / 120));
    pen.stroke(this.map(ellipsePts(c, rx, ry, 0, n, (a0 * Math.PI) / 180, (a1 * Math.PI) / 180)), { smooth: false, ...o });
    return this;
  }
  hatch(pen: Pen, poly: Pt[], o: HatchOpts = {}) { pen.hatch(this.map(poly), o); return this; }
  tone(pen: Pen, poly: Pt[], o: ToneOpts = {}) { pen.tone(this.map(poly), o); return this; }
  erase(pen: Pen, pts: Pt[], o: ToolOpts = {}) { pen.erase(this.map(pts), o); return this; }
  eraseArea(pen: Pen, poly: Pt[], o: ToolOpts = {}) { pen.eraseArea(this.map(poly), o); return this; }
  blend(pen: Pen, poly: Pt[], o: ToolOpts = {}) { pen.blend(this.map(poly), o); return this; }
}

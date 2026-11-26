// The cast of comic 01, drawn in local units (about 1 unit = 1 mm at scale 1; origin at the
// centre of the eye line, y down). Two characters in the spirit of the reference sketches:
//
//   Pip   small, round face, messy short hair with an ahoge, big round glasses, permanently unimpressed.
//   Mags  tall, long messy hair, round glasses, sunny, eats things that are not food.
import { type Page, type Pen, type Pt, Rig, type StrokeOpts } from '../../src/index.ts';

export interface Pens { ink: Pen; fine: Pen; hair: Pen; soft: Pen; heavy: Pen; fill: Pen }

/** The cartoon pens: confident 2B line with taper, finer HB for detail, 4B for accents. */
export function cartoonPens(p: Page, style: 'clean' | 'loose' | 'bold' = 'clean'): Pens {
  const loose: StrokeOpts = style === 'loose' ? { passes: 2, spread: 0.4, overshoot: 1.6, wobble: 0.28, pencil: 'HB' } : style === 'bold' ? { pencil: '6B', width: 1.7, wobble: 0.1 } : {};
  return {
    ink: p.pen({ pencil: '2B', pressure: 0.9, width: 1.2, taper: [1.1, 1.8], wobble: 0.06, tremor: 0.008, flutter: 0.1, passes: 1, overshoot: 0.25, ...loose }),
    fine: p.pen({ pencil: '2B', pressure: 0.72, width: 0.8, taper: [0.8, 1.4], wobble: 0.04, tremor: 0.006, flutter: 0.1, passes: 1, overshoot: 0.15, ...loose }),
    hair: p.pen({ pencil: '2B', pressure: 0.8, width: 0.85, taper: [0.6, 3.2], wobble: 0.05, tremor: 0.006, flutter: 0.15, passes: 1, overshoot: 0.2, ...loose }),
    soft: p.pen({ pencil: 'HB', pressure: 0.5, width: 0.8, taper: [1, 1.5], wobble: 0.05, tremor: 0.006, flutter: 0.15, passes: 1, overshoot: 0.1 }),
    heavy: p.pen({ pencil: '4B', pressure: 0.95, width: 1.15, taper: [0.6, 1.0], wobble: 0.03, tremor: 0.005, flutter: 0.05, passes: 1 }),
    fill: p.pen({ pencil: '6B', pressure: 0.9 }),
  };
}

/** Solid dark fill (pupils, mouth interiors): soft lead worked round and round the shape so the edge stays crisp. */
function fillShape(r: Rig, P: Pens, poly: Pt[]) {
  let cx = 0, cy = 0;
  for (const [x, y] of poly) { cx += x; cy += y; }
  cx /= poly.length; cy /= poly.length;
  let size = 0;
  for (const [x, y] of poly) size = Math.max(size, Math.hypot(x - cx, y - cy));
  const step = 0.12 / (size * r.scale);
  for (let k = 0; k < 1; k += step) {
    const ring = poly.map(([x, y]): Pt => [cx + (x - cx) * (1 - k), cy + (y - cy) * (1 - k)]);
    r.stroke(P.fill, [...ring, ring[0], ring[1]], { pencil: '6B', pressure: 0.95, width: 0.7, taper: [0.1, 0.1], wobble: 0.01, tremor: 0.003, flutter: 0.02, passes: 1, smooth: true });
  }
}

export interface EyeOpts {
  /** Eye width and height (local units). */
  w: number;
  h: number;
  /** Which side of the face: -1 = the character's right (image left), 1 = image right. */
  side: number;
  /** Where the iris looks, in fractions of the eye size (x right, y down). */
  look?: Pt;
  /** How open, 0..1 (0.5 = heavy deadpan lid). */
  open?: number;
  /** Lid shape: arched (default) or flat (unimpressed). */
  lid?: 'arch' | 'flat';
  /** Iris size relative to the eye. */
  iris?: number;
  /** Add a catch-light. */
  shine?: boolean;
}

/** An anime-style eye: thick upper lash line with a flick, iris tucked under the lid, small lower lid. */
export function eye(r: Rig, P: Pens, c: Pt, o: EyeOpts) {
  const { w, h, side } = o;
  const open = o.open ?? 1, look = o.look ?? [0, 0];
  const inner: Pt = [c[0] - side * w * 0.5, c[1] + h * 0.05];
  const outer: Pt = [c[0] + side * w * 0.5, c[1] - h * 0.08];
  const topY = c[1] - h * 0.5 * open;
  const peak: Pt = o.lid === 'flat' ? [c[0], c[1] - h * 0.5 * open + h * 0.05] : [c[0] + side * w * 0.08, topY - h * 0.25 * open];
  // Upper lid as a quadratic; y of the lid at local x (for clipping the iris).
  const lidAt = (x: number) => {
    // Solve the quadratic in x approximately by sampling.
    let best = 0, bd = 1e9;
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, u = 1 - t;
      const px = u * u * inner[0] + 2 * u * t * peak[0] + t * t * outer[0];
      if (Math.abs(px - x) < bd) { bd = Math.abs(px - x); best = u * u * inner[1] + 2 * u * t * peak[1] + t * t * outer[1]; }
    }
    return best;
  };
  // Iris: an ellipse under the lid.
  const ir = (o.iris ?? 0.62) * h * 0.5, irx = ir * 0.82;
  const ic: Pt = [c[0] + look[0] * w * 0.5, c[1] + h * 0.08 + look[1] * h * 0.4];
  const pts: Pt[] = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const x = ic[0] + Math.cos(a) * irx, y = ic[1] + Math.sin(a) * ir;
    pts.push([x, Math.max(y, lidAt(x) + 0.05)]);
  }
  fillShape(r, P, pts);
  if (o.shine !== false) r.eraseArea(P.soft, [[ic[0] + irx * 0.15, ic[1] - ir * 0.45], [ic[0] + irx * 0.55, ic[1] - ir * 0.45], [ic[0] + irx * 0.55, ic[1] - ir * 0.05], [ic[0] + irx * 0.15, ic[1] - ir * 0.05]], { radius: 0.25 * ir, amount: 1 });
  // Lash line: heavy, thicker toward the outer corner, with a small flick.
  r.curve(P.heavy, inner, peak, outer, { taper: [0.8, 0.3], pressure: [0.75, 1] });
  r.curve(P.heavy, outer, [outer[0] + side * w * 0.08, outer[1] - h * 0.02], [outer[0] + side * w * 0.16, outer[1] - h * 0.16], { taper: [0.1, 0.6] });
  // Lower lid: short and light.
  r.curve(P.soft, [c[0] - side * w * 0.15, c[1] + h * 0.58], [c[0] + side * w * 0.1, c[1] + h * 0.64], [c[0] + side * w * 0.38, c[1] + h * 0.5], { pressure: 0.5 });
}

/**
 * A clump of hair: a pointed leaf from two root points to a tip, both edges bowing the same way
 * (`bend` in local units, positive bows to the right of the root->tip direction).
 */
function clump(r: Rig, pen: Pen, a: Pt, b: Pt, tip: Pt, bend = 0, o: StrokeOpts & { only?: 'a' | 'b' } = {}) {
  for (const [root, side] of [[a, 'a'], [b, 'b']] as const) {
    if (o.only && o.only !== side) continue;
    const mx = (root[0] + tip[0]) / 2, my = (root[1] + tip[1]) / 2;
    const dx = tip[0] - root[0], dy = tip[1] - root[1], l = Math.hypot(dx, dy) || 1;
    const c: Pt = [mx - (dy / l) * bend, my + (dx / l) * bend];
    r.curve(pen, root, c, tip, o);
  }
}

/** A hair lock: from a root, bending through `mid`, to a pointed tip. Drawn root -> tip (tapered at the tip). */
function lock(r: Rig, pen: Pen, root: Pt, mid: Pt, tip: Pt, o: StrokeOpts = {}) {
  r.stroke(pen, [root, mid, tip], o);
}

export type PipExpr = 'deadpan' | 'glare' | 'neutral';

/** Pip's head. Face is about 18 wide, chin at y ~ 12, crown at y ~ -16. */
export function pipHead(r: Rig, P: Pens, expr: PipExpr = 'deadpan', look = 0) {
  const { ink, fine, hair, soft } = P;
  // Face: soft round cheeks narrowing to a small chin.
  r.stroke(ink, [[-9.3, -1], [-9.4, 3.5], [-8.2, 7.6], [-5.2, 10.6], [-1.6, 12], [1.3, 12], [5.0, 10.6], [8.1, 7.6], [9.4, 3.5], [9.3, -1]]);
  // Ears, half hidden by hair.
  r.stroke(fine, [[-9.2, 0.6], [-11.4, 0.9], [-11.7, 3.4], [-10.2, 5.4], [-9.0, 5.6]]);
  r.stroke(fine, [[9.2, 0.6], [11.4, 0.9], [11.7, 3.4], [10.2, 5.4], [9.0, 5.6]]);
  r.curve(soft, [-10.9, 2.2], [-10.1, 3.1], [-10.4, 4.3]);
  r.curve(soft, [10.9, 2.2], [10.1, 3.1], [10.4, 4.3]);

  // Glasses: big round lenses that sit a little wider than the face.
  r.ellipse(fine, [-4.7, 2.6], 4.2, 4.0, { start: 3.6 });
  r.ellipse(fine, [4.8, 2.6], 4.2, 4.0, { start: 5.9 });
  r.curve(fine, [-0.6, 2.0], [0.05, 1.1], [0.7, 2.0]);
  // Glare ticks.
  r.line(soft, [1.9, -0.2], [3.0, -0.9], { pressure: 0.45 });
  r.line(soft, [2.2, 0.8], [3.8, -0.3], { pressure: 0.4 });

  if (expr === 'deadpan' || expr === 'glare') {
    // Heavy flat upper lids, pupils hanging just under them, a flat brow pressing down.
    const sag = expr === 'glare' ? 0.5 : 0;
    for (const s of [-1, 1]) {
      const cx = s * 4.7;
      r.stroke(P.heavy, [[cx - s * 2.1, 2.1 - sag * 0.4], [cx, 2.0], [cx + s * 2.0, 2.2 + sag]], { taper: [0.4, 0.8] });
      const px = cx + look * 1.3;
      fillShape(r, P, [[px - 0.95, 2.25], [px + 0.95, 2.25], [px + 0.8, 3.1], [px, 3.45], [px - 0.8, 3.1]]);
      r.line(soft, [cx - s * 1.4, 4.4], [cx + s * 0.9, 4.5], { pressure: 0.4 });
      // Brows sit above the lenses, flat and low.
      r.stroke(fine, [[cx - s * 2.6, -2.5], [cx, -2.9 + sag * 0.4], [cx + s * 2.2, -2.4 + sag]], { pressure: 0.8 });
    }
  } else {
    for (const s of [-1, 1]) {
      const cx = s * 4.7;
      r.ellipse(fine, [cx, 2.7], 1.2, 1.6);
      fillShape(r, P, [[cx - 0.7, 2.4], [cx + 0.7, 2.4], [cx + 0.6, 3.6], [cx - 0.6, 3.6]]);
    }
  }
  // Nose and mouth.
  r.curve(soft, [0.2, 5.6], [0.7, 6.3], [0.1, 6.6]);
  r.stroke(fine, [[-1.5, 8.9], [0, 8.75], [1.4, 8.95]], { pressure: 0.75 });

  // Hair: a round messy mop built from clumps. Outer clumps flick outward and down around the
  // skull; the silhouette is broken where clumps overlap, like a quick confident sketch.
  const skull = (deg: number, k = 1): Pt => [Math.cos((deg * Math.PI) / 180) * 11.6 * k, -3.2 + Math.sin((deg * Math.PI) / 180) * 12.8 * k];
  // [root angle a, root angle b, tip angle, tip distance, bend]
  const outer: [number, number, number, number, number][] = [
    [168, 186, 160, 1.28, -0.8],
    [184, 202, 176, 1.32, -1.2],
    [200, 222, 199, 1.2, -1.0],
    [220, 246, 226, 1.17, -0.8],
    [244, 268, 252, 1.14, -0.6],
    [266, 290, 287, 1.16, 0.7],
    [288, 314, 312, 1.2, 1.0],
    [312, 336, 336, 1.26, 1.3],
    [334, 356, 0, 1.3, 1.1],
    [354, 372, 16, 1.27, 0.8],
  ];
  outer.forEach(([a0, a1, ta, td, bend], i) => {
    const tip = skull(ta, td);
    // Skip a few inner edges so the mop reads as one mass with gaps.
    clump(r, hair, skull(a0), skull(a1), tip, bend, i % 3 === 1 ? { only: a0 < 270 ? 'a' : 'b' } : {});
  });
  // Ahoge: one defiant curl.
  r.stroke(hair, [[0.6, -15.6], [0.4, -19.4], [2.6, -22.6], [5.8, -22.6], [6.4, -20.4], [4.6, -19.6]], { taper: [0.6, 2.4] });
  // Bangs: uneven pointed clumps swept a little to Pip's left, falling to the glasses.
  const hl = (x: number): Pt => [x, -12.4 + 0.045 * x * x];
  const roots = [-10.8, -7.8, -4.6, -1.2, 2.2, 5.4, 8.4, 11];
  const tips: Pt[] = [[-9.6, 1.0], [-6.2, -1.6], [-3.0, 1.6], [0.8, -1.0], [4.0, 1.0], [7.0, -1.6], [9.8, 0.4]];
  const bends = [0.9, 0.6, 1.0, 0.5, 0.9, 0.6, 0.4];
  tips.forEach((tip, i) => clump(r, hair, hl(roots[i]), hl(roots[i + 1]), tip, bends[i], { pressure: 0.8, ...(i === 3 ? { only: 'b' as const } : {}) }));
  // Strand lines inside the mop.
  for (const [a, c, b] of [[[-6.5, -13.5], [-8.6, -10.8], [-9.6, -8.0]], [[2.5, -15.4], [5.6, -14.0], [7.4, -11.4]], [[-2.6, -15.4], [-2.2, -14.2], [-3.0, -12.6]], [[8.6, -11.8], [10.4, -9.6], [11.0, -7.0]]] as [Pt, Pt, Pt][])
    r.curve(soft, a, c, b, { pressure: 0.55 });
}

export type MagsExpr = 'puzzled' | 'shifty' | 'happy';

/** Mags' head. Face about 19 wide, longer than Pip's, chin at y ~ 14.5, crown at y ~ -16. */
export function magsHead(r: Rig, P: Pens, expr: MagsExpr = 'puzzled') {
  const { ink, fine, hair, soft } = P;
  // Long wavy hair behind the face, falling past the shoulders in big loose clumps.
  const sideWave: Record<number, Pt[]> = {
    [-1]: [[-12.4, -4], [-14.6, 3], [-14.2, 10], [-15.6, 17], [-18.2, 24], [-19.4, 30.5]],
    [1]: [[12.4, -4], [14.4, 2.6], [14.6, 9.6], [16.4, 16.4], [18.4, 22.6], [20.2, 27.8]],
  };
  for (const k of [-1, 1]) {
    r.stroke(hair, sideWave[k], { taper: [1, 3] });
    r.stroke(hair, [[k * 9.6, 9.5], [k * 10.4, 15], [k * 10.0, 21], [k * 11.0, 26.5]], { taper: [2, 3], pressure: 0.7 });
    r.stroke(P.soft, [[k * 12.6, 6], [k * 12.5, 13], [k * 14.2, 20], [k * 15.4, 26]], { pressure: 0.5 });
    r.stroke(P.soft, [[k * 11.3, 14], [k * 12.3, 21], [k * 13.2, 27]], { pressure: 0.45 });
  }
  // Ragged ends, different on each side.
  clump(r, hair, [-19.4, 30.5], [-15.8, 30.0], [-18.2, 36.4], 0.7);
  clump(r, hair, [-15.8, 30.0], [-11.0, 26.5], [-12.6, 33.6], -0.5);
  clump(r, hair, [-18.6, 26.5], [-20.8, 27.5], [-23.4, 30.0], -0.8, { only: 'b' });
  clump(r, hair, [20.2, 27.8], [16.4, 28.6], [19.4, 33.2], -0.6);
  clump(r, hair, [16.4, 28.6], [11.0, 26.5], [14.0, 35.0], 0.8);
  clump(r, hair, [11.0, 26.5], [9.4, 26.0], [10.6, 30.2], 0.3, { only: 'a' });
  // Face: oval with a gentle pointed chin.
  r.stroke(ink, [[-9.6, -1], [-9.5, 4.5], [-8.0, 9.2], [-4.6, 13.0], [-0.6, 14.6], [0.6, 14.6], [4.4, 13.0], [8.0, 9.2], [9.5, 4.5], [9.6, -1]]);
  // Neck.
  r.stroke(fine, [[-3.6, 13.6], [-3.7, 17.5], [-4.3, 21]]);
  r.stroke(fine, [[3.6, 13.6], [3.7, 17.5], [4.3, 21]]);

  // Glasses.
  r.ellipse(fine, [-4.9, 2.4], 4.3, 4.0, { start: 3.4 });
  r.ellipse(fine, [5.0, 2.4], 4.3, 4.0, { start: 6.1 });
  r.curve(fine, [-0.6, 1.8], [0.05, 0.9], [0.7, 1.8]);
  r.line(soft, [-2.6, -0.4], [-1.6, -1.1], { pressure: 0.4 });

  if (expr === 'puzzled') {
    // Eyes open, looking down at her tiles, one brow hiked up.
    for (const k of [-1, 1]) eye(r, P, [k * 5.0, 2.8], { w: 5.0, h: 3.6, side: k, look: [0.15, 0.35], open: 0.85 });
    r.stroke(fine, [[-7.6, -2.4], [-5.2, -2.9], [-2.8, -2.3]], { pressure: 0.75 });
    r.stroke(fine, [[2.6, -3.0], [5.0, -4.6], [7.6, -4.0]], { pressure: 0.75 });
    // Small "hm" mouth, pushed to one side.
    r.stroke(fine, [[-0.4, 10.2], [1.0, 9.9], [2.2, 10.3]], { pressure: 0.75 });
  } else if (expr === 'shifty') {
    // Eyes slid all the way to one side, a guilty wobbly smile.
    for (const k of [-1, 1]) eye(r, P, [k * 5.0, 2.9], { w: 5.0, h: 3.4, side: k, look: [0.75, 0.1], open: 0.7, lid: 'flat' });
    r.stroke(fine, [[-7.4, -2.0], [-5.2, -3.0], [-2.9, -2.7]], { pressure: 0.75 });
    r.stroke(fine, [[2.9, -2.7], [5.2, -3.0], [7.4, -2.0]], { pressure: 0.75 });
    r.stroke(fine, [[-2.6, 10.0], [-1.4, 10.7], [-0.2, 10.1], [1.0, 10.7], [2.3, 10.0]], { pressure: 0.75 });
  } else {
    // Happy closed eyes.
    for (const s2 of [-1, 1]) r.curve(P.heavy, [s2 * 5.0 - 2.3, 3.4], [s2 * 5.0, 0.8], [s2 * 5.0 + 2.3, 3.4]);
    r.stroke(fine, [[-2.6, 9.6], [0, 11.6], [2.6, 9.6]], { pressure: 0.8 });
  }
  r.curve(soft, [0.3, 6.2], [0.8, 7.0], [0.1, 7.3]);

  // Hair on top: big soft clumps round the crown and a side part with long swept bangs.
  const skull = (deg: number, k = 1): Pt => [Math.cos((deg * Math.PI) / 180) * 12.6 * k, -3.6 + Math.sin((deg * Math.PI) / 180) * 13.0 * k];
  const outer: [number, number, number, number, number][] = [
    [172, 194, 176, 1.16, -0.9],
    [192, 222, 205, 1.14, -1.2],
    [220, 252, 236, 1.1, -0.9],
    [250, 278, 268, 1.08, 0.5],
    [276, 306, 300, 1.11, 1.0],
    [304, 334, 330, 1.15, 1.2],
    [332, 364, 2, 1.18, 1.0],
  ];
  outer.forEach(([a0, a1, ta, td, bend], i) => clump(r, hair, skull(a0), skull(a1), skull(ta, td), bend, i % 2 ? { only: a0 < 270 ? 'a' : 'b' } : {}));
  // Part at x ~ -3: one heavy lock falls over the left lens; the rest sweep across to the right
  // in long S-curves that end in points near the temple.
  const pen8 = { pressure: 0.82 };
  r.stroke(hair, [[-3.2, -16.0], [-6.2, -11.0], [-8.2, -4.6], [-9.2, 1.6]], pen8);
  r.stroke(hair, [[-4.6, -15.0], [-5.8, -10.0], [-6.6, -4.6], [-9.2, 1.6]], { pressure: 0.7 });
  r.stroke(hair, [[-3.0, -16.0], [-2.2, -10.6], [-3.4, -5.6], [-5.4, -2.4]], pen8);
  r.stroke(hair, [[-2.4, -16.2], [1.6, -11.6], [3.4, -6.4], [3.0, -1.8]], pen8);
  r.stroke(hair, [[-0.6, -16.4], [2.4, -12.8], [3.2, -8.4], [3.0, -1.8]], { pressure: 0.65 });
  r.stroke(hair, [[-1.0, -16.4], [4.8, -13.4], [7.4, -7.6], [7.2, -2.6]], pen8);
  r.stroke(hair, [[1.4, -16.6], [6.4, -14.6], [7.8, -10.0], [7.2, -2.6]], { pressure: 0.65 });
  r.stroke(hair, [[2.0, -16.6], [8.6, -14.0], [11.2, -7.6], [11.6, 1.8]], pen8);
  // A loose strand across the face.
  r.stroke(P.soft, [[-5.4, -14.4], [-2.2, -7.4], [-1.0, -1.8], [-1.6, 2.4]], { pressure: 0.55 });
  // Ahoge and flyaways.
  r.stroke(hair, [[-1.6, -16.6], [-1.0, -20.0], [1.8, -21.8], [3.8, -20.6]], { taper: [0.5, 2.2] });
  r.stroke(hair, [[-11.6, -9.6], [-13.6, -11.0], [-14.2, -12.8], [-13.4, -13.6]], { taper: [0.5, 1.6], pressure: 0.55 });
  for (const [a, c, b] of [[[1.2, -15.6], [5.2, -12.6], [6.0, -8.4]], [[-6.6, -14.2], [-9.2, -11.0], [-9.8, -7.4]]] as [Pt, Pt, Pt][])
    r.curve(soft, a, c, b, { pressure: 0.55 });
}

/** Pip from the neck down to `cut` (local y where something in front hides the rest). T-shirt. */
export function pipBody(r: Rig, P: Pens, cut = 34) {
  const { ink, fine, soft } = P;
  r.stroke(fine, [[-3.1, 11.4], [-3.2, 15.2]]);
  r.stroke(fine, [[3.1, 11.4], [3.2, 15.2]]);
  // Shoulders slope into short arms resting forward.
  r.stroke(ink, [[-3.2, 15.2], [-8.6, 16.4], [-12.6, 18.8], [-14.2, 23.5], [-14.6, cut]]);
  r.stroke(ink, [[3.2, 15.2], [8.6, 16.4], [12.6, 18.8], [14.2, 23.5], [14.6, cut]]);
  // Crew neck and a fold or two.
  r.stroke(fine, [[-3.8, 15.2], [-1.8, 17.0], [0, 17.4], [1.9, 17.0], [3.8, 15.2]]);
  r.stroke(soft, [[-11.2, 21.6], [-10.6, 26.0], [-10.8, cut - 1]], { pressure: 0.5 });
  r.stroke(soft, [[11.0, 22.4], [10.4, 26.6]], { pressure: 0.45 });
  // Sleeve hems.
  r.stroke(fine, [[-14.4, 26.5], [-12.4, 27.6], [-10.6, 27.2]], { pressure: 0.6 });
  r.stroke(fine, [[14.4, 26.5], [12.4, 27.6], [10.6, 27.2]], { pressure: 0.6 });
}

/** Mags from the neck down to `cut`. Loose sweater; the long hair (drawn with the head) sits in front. */
export function magsBody(r: Rig, P: Pens, cut = 46) {
  const { ink, fine, soft } = P;
  // Shoulders start outside the hanging hair.
  r.stroke(ink, [[-19.6, 27.6], [-22.4, 30.6], [-23.8, 37], [-24.2, cut]]);
  r.stroke(ink, [[20.6, 26.4], [23.0, 29.8], [24.4, 36.4], [24.8, cut]]);
  // V-neck between the hair and the neck.
  r.stroke(fine, [[-4.3, 21.2], [-2.2, 25.6], [0, 28.4], [2.2, 25.6], [4.3, 21.2]]);
  r.stroke(fine, [[-5.4, 21.6], [-2.8, 26.6], [0, 30.0], [2.8, 26.6], [5.4, 21.6]], { pressure: 0.6 });
  // Collarbones and sweater folds.
  r.curve(soft, [-6.2, 22.6], [-8.0, 23.4], [-9.4, 23.2], { pressure: 0.45 });
  r.curve(soft, [6.2, 22.6], [8.0, 23.4], [9.4, 23.2], { pressure: 0.45 });
  r.stroke(soft, [[-19.0, 36], [-17.6, 40.5], [-17.8, cut - 1]], { pressure: 0.5 });
  r.stroke(soft, [[18.8, 35], [17.8, 40], [18.4, cut - 1]], { pressure: 0.5 });
  r.stroke(soft, [[-4, 34], [-1.6, 37.6], [-2.2, 42]], { pressure: 0.4 });
}

/** Simple outlines (local units) used to hide what's behind a character. */
export const PIP_SILHOUETTE: Pt[] = [[-12.6, 6], [-14.6, 1], [-14.4, -6], [-11.6, -13], [-6.6, -18.6], [0, -17.6], [6.6, -18.4], [12.0, -13.4], [14.8, -6], [14.6, 1], [12.4, 6], [9.6, 10.4], [5, 13.6], [8.6, 16.4], [12.6, 18.8], [14.2, 23.5], [14.8, 60], [-14.8, 60], [-14.2, 23.5], [-12.6, 18.8], [-8.6, 16.4], [-5, 13.6], [-9.6, 10.4]];

/**
 * Mags' hand at her chin, index finger up (thinking). Local units of her head rig. Returns the
 * hand+forearm silhouette so whatever is behind it can be drawn hidden.
 */
export function magsThinkingHand(r: Rig, P: Pens): Pt[] {
  const { ink, fine, soft } = P;
  // Index finger along the jaw, tip just under the cheek: long and slim.
  r.stroke(fine, [[3.4, 17.0], [3.6, 14.2], [4.1, 11.4], [4.6, 10.4], [5.3, 10.5], [5.4, 11.6], [5.1, 14.2], [5.2, 16.2]], { taper: [0.3, 0.3], pressure: 0.8 });
  r.curve(soft, [4.3, 11.4], [4.8, 11.1], [5.2, 11.5], { pressure: 0.45 }); // nail
  r.curve(soft, [3.8, 14.0], [4.4, 14.3], [5.0, 14.0], { pressure: 0.4 }); // knuckle crease
  // Curled fingers: knuckles stacked under the index, folded toward her.
  r.stroke(ink, [[3.4, 17.0], [2.6, 17.8], [2.8, 19.2], [3.8, 19.6], [3.2, 20.4], [3.4, 21.6], [4.4, 22.0], [4.2, 22.8], [4.8, 23.6], [6.0, 23.8]], { taper: [0.3, 0.6] });
  r.curve(soft, [3.8, 19.6], [5.2, 19.6], [6.6, 18.8], { pressure: 0.55 });
  r.curve(soft, [4.4, 22.0], [5.8, 22.0], [7.2, 21.2], { pressure: 0.55 });
  // Back of the hand, thumb pressed against the curled fingers.
  r.stroke(ink, [[5.2, 16.2], [7.0, 15.8], [8.6, 17.0], [9.2, 19.8], [8.8, 23.0], [7.8, 25.4]], { taper: [0.3, 0.5] });
  r.stroke(fine, [[5.6, 17.4], [7.0, 17.6], [7.6, 19.0], [6.8, 19.8]], { pressure: 0.65 });
  // Wrist into the sleeve, forearm running down out of shot.
  r.stroke(ink, [[5.6, 23.8], [6.0, 26.8], [7.0, 34], [8.2, 44]]);
  r.stroke(ink, [[7.6, 25.6], [10.6, 30.4], [13.2, 38], [14.4, 44]]);
  r.stroke(fine, [[5.2, 27.4], [8.4, 28.6], [11.4, 28.2]], { pressure: 0.7 }); // cuff
  r.stroke(soft, [[8.0, 32.5], [10.0, 36.5]], { pressure: 0.45 });
  return r.map([[2.2, 16.8], [3.4, 12.6], [5.0, 10.6], [6.2, 11.6], [5.6, 15.2], [7.2, 14.8], [9.4, 16.6], [9.8, 20], [8.6, 25.4], [11.2, 30], [14.8, 44], [7.6, 44], [5.4, 27], [3.0, 23.8], [2.0, 18]]);
}

export { Rig };

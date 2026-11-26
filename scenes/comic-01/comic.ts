// Comic 01: "The Missing Tile". Three panels: two cartoon sketches, then one ultra-high-fidelity
// studio graphite rendering for the punchline.
import { type Page, type Pt, Rig, balloon, letter } from '../../src/index.ts';
import { darknessOf, Grid, SOFT_ID, toneMap } from '../../src/studio/tonal.ts';
import { PAGE, PANELS, type Rect } from './layout.ts';
import { PIP_SILHOUETTE, cartoonPens, magsBody, magsHead, magsThinkingHand, pipBody, pipHead, type Pens } from './cast.ts';
import { CAMERA, stillLifeReference } from './still-life.ts';
import { depthOfField } from '../../src/studio/sdf.ts';

export const page = { ...PAGE, paper: 'hotpress', seed: 'comic-01' } as const;

export default async function (p: Page) {
  const skip3 = !!process.env.SKIP_P3;
  const P = cartoonPens(p);
  p.group('title', () => title(p));
  p.group('borders', () => PANELS.forEach((r) => border(p, r)));
  const frame = ([x, y, w, h]: Rect): Pt[] => [[x + 0.3, y + 0.3], [x + w - 0.3, y + 0.3], [x + w - 0.3, y + h - 0.3], [x + 0.3, y + h - 0.3]];
  p.group('p1', () => p.within(frame(PANELS[0]), () => panel1(p, P, PANELS[0])));
  p.group('p2', () => p.within(frame(PANELS[1]), () => panel2(p, P, PANELS[1])));
  p.mark('cartoons');
  if (!skip3) await p.group('p3', () => panel3(p, PANELS[2], (process.env.P3_STYLE as 'hatched') ?? 'polished'));
}

function title(p: Page) {
  const pen = p.pen('clean');
  letter(pen, 'THE MISSING TILE', [PANELS[0][0], 11.6], { size: 4.6, align: 'left', pressure: 0.92, width: 1.1, tracking: 0.16 });
}

/** Hand-ruled panel border: four separate ruler strokes that overrun the corners a little. */
export function border(p: Page, [x, y, w, h]: Rect) {
  const pen = p.pen({ pencil: '2B', pressure: 0.9, width: 1.15, wobble: 0.04, tremor: 0.004, taper: [0.4, 0.6], passes: 1, flutter: 0.05 });
  const o = 0.7;
  pen.line([x - o, y], [x + w + o * 0.4, y + 0.05]);
  pen.line([x + w, y - o * 0.5], [x + w - 0.05, y + h + o]);
  pen.line([x + w + o * 0.3, y + h], [x - o * 0.6, y + h - 0.05]);
  pen.line([x, y + h + o * 0.4], [x + 0.05, y - o * 0.8]);
}

// ---- Panel 1: wide shot at the mahjong table. ----
export function panel1(p: Page, P: Pens, [x0, y0, w, h]: Rect) {
  const tableY = y0 + 95;
  const pip = new Rig([x0 + 22, y0 + 62], 1.12);
  const mags = new Rig([x0 + 65, y0 + 46], 1.16);
  // Mags sits behind Pip's shoulder line a little; draw her first, hidden behind Pip.
  p.group('mags', () => {
    p.behind([PIP_SILHOUETTE.map(pip.T), tableFront(x0, tableY, w)], () => {
      const hand = magsThinkingHand(mags, P);
      p.behind([hand], () => {
        magsHead(mags, P, 'puzzled');
        magsBody(mags, P, 60);
      });
    });
    // Question marks floating over her head.
    letter(P.fine, '?', mags.T([16.5, -17]), { size: 4.2, seed: 'q1', pressure: 0.9 });
    letter(P.fine, '?', mags.T([20.5, -11]), { size: 2.8, seed: 'q2', pressure: 0.85 });
  });
  p.group('pip', () => {
    p.behind([tableFront(x0, tableY, w)], () => {
      pipHead(pip, P, 'deadpan', 0.9);
      pipBody(pip, P, 40);
    });
  });
  p.group('table', () => table(p, P, x0, tableY, w, y0 + h));
  p.group('balloon', () => balloon(P.fine, "HOLD ON...\nI'M ONE TILE\nSHORT.", [x0 + 35, y0 + 13.5], mags.T([-8, -18]), { size: 2.7, line: { pressure: 0.85 } }));
}

function tableFront(x0: number, tableY: number, w: number): Pt[] {
  return [[x0 - 2, tableY - 7], [x0 + w + 2, tableY - 7], [x0 + w + 2, tableY + 60], [x0 - 2, tableY + 60]];
}

/** The table edge, two racks of tile backs, a few discards lying face up. */
function table(p: Page, P: Pens, x0: number, y: number, w: number, bottom: number) {
  const { ink, fine, soft } = P;
  ink.line([x0, y], [x0 + w, y - 0.6], { overshoot: 0 });
  fine.line([x0, y + 1.6], [x0 + w, y + 1.0], { pressure: 0.5 });
  // Table top recedes a little: a back edge hidden by the racks, and some wood grain.
  for (const k of [0, 1, 2]) soft.stroke([[x0 + 4 + k * 23, y + 6 + k * 3.5], [x0 + 30 + k * 20, y + 7 + k * 3.2], [x0 + 52 + k * 14, y + 6.2 + k * 3.6]], { pressure: 0.35 });
  // Racks: each a row of tile backs (two-layer tiles, darker lower band).
  const rack = (cx: number, n: number, tw: number, th: number) => {
    const left = cx - (n * tw) / 2;
    for (let i = 0; i < n; i++) {
      const tx = left + i * tw;
      fine.stroke([[tx, y - 0.4], [tx + 0.1, y - th + 0.5], [tx + 0.6, y - th], [tx + tw - 0.6, y - th], [tx + tw - 0.1, y - th + 0.5], [tx + tw, y - 0.4]], { pressure: 0.75, taper: [0.3, 0.3], smooth: false });
      soft.line([tx + 0.3, y - th * 0.36], [tx + tw - 0.3, y - th * 0.36], { pressure: 0.5 });
      // The darker back layer of the tile.
      p.pen('studio').tone([[tx + 0.35, y - th * 0.34], [tx + tw - 0.35, y - th * 0.34], [tx + tw - 0.35, y - 0.55], [tx + 0.35, y - 0.55]], { value: 0.55, pencil: '2B', spacing: 0.3, angle: 80, blend: 0.6 });
    }
  };
  rack(x0 + 22, 8, 3.2, 5.6);
  rack(x0 + 66, 9, 3.2, 5.6);
  // Discards lying flat in front: little parallelograms with tiny marks.
  const flat = (cx: number, cy: number, mark: number) => {
    // A tile lying face up: top face, a sliver of side, and its marks.
    fine.poly([[cx - 2.4, cy - 1.4], [cx + 2.5, cy - 1.4], [cx + 3.0, cy + 1.5], [cx - 2.0, cy + 1.5]], { pressure: 0.7, taper: [0.3, 0.3] });
    fine.line([cx - 2.0, cy + 2.3], [cx + 3.0, cy + 2.3], { pressure: 0.6 });
    fine.line([cx + 3.0, cy + 1.5], [cx + 3.0, cy + 2.3], { pressure: 0.5 });
    if (mark === 0) fine.ellipse([cx + 0.3, cy + 0.05], 0.9, 0.6, { pressure: 0.65 });
    else for (let k = 0; k < mark; k++) fine.line([cx - 0.8 + k * 0.8, cy - 0.7], [cx - 0.5 + k * 0.8, cy + 0.8], { pressure: 0.65 });
  };
  flat(x0 + 38, y + 6.5, 0); flat(x0 + 46, y + 10.5, 2); flat(x0 + 55, y + 7.0, 3); flat(x0 + 30, y + 11, 1);
  flat(x0 + 62, y + 12, 0); flat(x0 + 21, y + 7, 2); flat(x0 + 52, y + 15, 1);
  void bottom;
}

// ---- Panel 2: Pip, close, unimpressed; Mags behind with evidence on her face. ----
function panel2(p: Page, P: Pens, [x0, y0, w, h]: Rect) {
  const pip = new Rig([x0 + 28, y0 + 74], 2.15);
  const mags = new Rig([x0 + 70, y0 + 47], 1.12);
  const pipOcc = PIP_SILHOUETTE.map(pip.T);
  p.group('mags', () => {
    p.behind([pipOcc], () => {
      magsHead(mags, P, 'shifty');
      magsBody(mags, P, 70);
      // Evidence: a chip of tile stuck to her cheek, and sweat.
      P.fine.poly(mags.map([[5.6, 9.4], [6.9, 9.0], [7.4, 9.9], [6.6, 10.6], [5.7, 10.3]]), { pressure: 0.75, taper: [0.2, 0.2] });
      P.fine.poly(mags.map([[3.4, 11.4], [4.1, 11.2], [4.2, 11.9]]), { pressure: 0.65, taper: [0.2, 0.2] });
      P.fine.poly(mags.map([[-3.6, 11.8], [-3.0, 11.6], [-3.1, 12.2]]), { pressure: 0.6, taper: [0.2, 0.2] });
      // Guilty blush.
      for (const k of [-1, 1]) for (let i = 0; i < 4; i++) P.soft.line(mags.T([k * 6.4 - 1.4 + i * 0.9, 8.4]), mags.T([k * 6.4 - 2.0 + i * 0.9, 9.6]), { pressure: 0.5 });
      for (const [sx, sy, k] of [[14, -8, 1.2], [16.5, -2.5, 0.9]] as [number, number, number][]) drop(P, mags, [sx, sy], k);
    });
  });
  p.group('pip', () => {
    pipHead(pip, P, 'glare', 0.2);
    pipBody(pip, P, 60);
  });
  p.group('balloons', () => {
    balloon(P.fine, 'YOU ATE IT\nAGAIN.', [x0 + 24, y0 + 13], pip.T([-2, -22]), { size: 2.9 });
    balloon(P.fine, 'PREPOSTEROUS.', [x0 + 67, y0 + 15.5], mags.T([3, -20]), { size: 2.5 });
  });
  void w; void h;
}

/** A sweat drop in local units. */
function drop(P: Pens, r: Rig, at: Pt, k: number) {
  const [x, y] = at;
  r.stroke(P.fine, [[x, y - 2.2 * k], [x - 1.1 * k, y + 0.2 * k], [x - 0.6 * k, y + 1.1 * k], [x + 0.6 * k, y + 1.1 * k], [x + 1.1 * k, y + 0.2 * k], [x, y - 2.2 * k]], { pressure: 0.7, taper: [0.2, 0.2] });
}

// ---- Panel 3: the tile as she sees it. ----
export async function panel3(p: Page, rect: Rect, style: 'polished' | 'hatched' = 'polished') {
  const cell = Number(process.env.CELL ?? 0.1);
  const ref = await stillLifeReference(rect, cell);
  const [x0, y0] = rect;
  // Balloon from off panel (she's out of shot). Keep its interior paper-white.
  const bc: Pt = [x0 + 47, y0 + 14], brx = 25, bry = 8.4;
  const mask = Grid.over(rect[0], rect[1], rect[2], rect[3], cell).fill((x, y) => {
    const q = Math.hypot((x - bc[0]) / (brx + 1.2), (y - bc[1]) / (bry + 1.2));
    return Math.min(1, Math.max(0, (q - 1) * 30));
  });
  // Shallow depth of field, focused on the tile's bitten corner, like a macro food shot.
  const focus = Math.hypot(CAMERA.pos[0] + 1, CAMERA.pos[1] - 18, CAMERA.pos[2] - 6);
  const shot = depthOfField(ref, focus, 2.6);
  // Where it's out of focus there are no hard object edges to respect.
  const ids = ref.id.map((v, x, y) => (Math.abs(1 - focus / Math.max(1, ref.depth.at(x, y))) * 2.6 > 0.35 ? SOFT_ID : v));
  const target = shot.lum.map((l) => darknessOf(l / 1.2));
  const look = style === 'polished' ? { blend: { radius: 0.6, amount: 0.6 }, polish: { radius: 1.2, amount: 0.85, below: 0.5 }, fineness: 0.6 } : { blend: false as const, fineness: 1.3 };
  p.group('render', () => toneMap(p, target, { ids, mask, highlight: 0.04, ...look, edgeBand: 0.4, lift: false, seed: 'p3', log: process.env.LOG ? console.error : undefined }));
  p.group('balloon', () => balloon(p.pen('clean'), 'IN MY DEFENSE...\nLOOK AT IT.', bc, [x0 - 4, y0 + 22], { size: 2.8, minRx: brx, minRy: bry, maxTail: 4.5, line: { pressure: 0.9 } }));
}

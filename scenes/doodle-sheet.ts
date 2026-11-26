// A doodle sheet in the loose style of the references: three chibi reactions, drawn the way a
// person would: light construction, a kneaded-eraser lift, then the real lines on top.
import { type Page, type Pen, type Pt, ellipsePts } from '../src/index.ts';

export const page = { width: 200, height: 110, paper: 'sketchbook', seed: 'doodles-1' } as const;

type Expr = 'shocked' | 'smug' | 'crying';

export default function (p: Page) {
  const heads: [Pt, Expr][] = [[[38, 54], 'shocked'], [[100, 54], 'smug'], [[162, 54], 'crying']];

  p.group('construction', () => {
    const c = p.pen('construct');
    for (const [o] of heads) {
      c.ellipse(o, 20, 19);
      c.curve([o[0] - 20, o[1] + 2], [o[0], o[1] + 7], [o[0] + 20, o[1] + 2]); // eye line
      c.curve([o[0] + 2, o[1] - 19], [o[0] + 5, o[1]], [o[0] + 1, o[1] + 19]); // centre line
      c.line([o[0] - 14, o[1] + 18], [o[0] - 16, o[1] + 40]);
      c.line([o[0] + 14, o[1] + 18], [o[0] + 17, o[1] + 40]);
    }
  });
  p.mark('construction');

  p.group('lift', () => {
    // Knock the construction back before committing to lines.
    const k = p.pen('studio');
    for (const [o] of heads) for (const [dx, dy] of [[-9, -8], [9, -8], [-9, 8], [9, 8], [0, 0], [-12, 28], [12, 28]]) k.dab([o[0] + dx, o[1] + dy], { radius: 6.5, amount: 0.55 });
  });
  p.mark('lifted');

  for (const [o, e] of heads) p.group(e, () => head(p, o, e));
  p.mark('linework');

  p.group('fx', () => fx(p, heads));
}

function head(p: Page, o: Pt, e: Expr) {
  const [x, y] = o;
  const L = p.pen('sketch').with({ pencil: '2B', pressure: 0.7 });
  const fine = p.pen('clean').with({ pencil: 'HB', pressure: 0.6, taper: [1, 2] });
  const heavy = p.pen('clean').with({ pencil: '4B', pressure: 0.85 });

  // Face: soft jaw, cheek puff on the far side.
  L.stroke([[x - 19, y - 2], [x - 18, y + 9], [x - 10, y + 18], [x + 1, y + 20], [x + 12, y + 17], [x + 19, y + 8], [x + 19.5, y - 2]]);
  // Ears.
  fine.curve([x - 19, y], [x - 25, y + 2], [x - 18.5, y + 8]);
  fine.curve([x + 19.5, y], [x + 25.5, y + 2], [x + 19, y + 8]);
  // Messy hair: spiky clumps around the crown, bangs as pointed locks, side locks past the ears.
  hair(p, o, e === 'smug' ? 3 : e === 'shocked' ? 11 : 7);
  // Neck and shoulders.
  L.line([x - 6, y + 19], [x - 7, y + 26], { passes: 1 });
  L.line([x + 6, y + 19], [x + 7, y + 26], { passes: 1 });
  L.stroke([[x - 7, y + 26], [x - 15, y + 29], [x - 19, y + 40]], { passes: 1 });
  L.stroke([[x + 7, y + 26], [x + 15, y + 29], [x + 19, y + 40]], { passes: 1 });
  fine.stroke([[x - 6, y + 27], [x, y + 33], [x + 6, y + 27]]); // collar

  // Round glasses on everyone, like the references.
  const gl: Pt = [x - 8, y + 4], gr: Pt = [x + 9, y + 4];
  fine.ellipse(gl, 7, 6.3, { pressure: 0.55 });
  fine.ellipse(gr, 7, 6.3, { pressure: 0.55 });
  fine.curve([x - 1, y + 3], [x + 0.5, y + 1.5], [x + 2, y + 3]);

  if (e === 'shocked') {
    // Blank lenses with tiny pupils, wobbly open mouth, sweat drops.
    heavy.ellipse(gl, 0.8, 0.8, { width: 1.4 });
    heavy.ellipse(gr, 0.8, 0.8, { width: 1.4 });
    fine.stroke([[x - 4, y + 12], [x, y + 10.5], [x + 4, y + 12], [x + 3, y + 16], [x, y + 17], [x - 3, y + 16], [x - 4, y + 12]], { pressure: 0.65 });
    p.pen({ pencil: '6B', pressure: 0.6 }).tone([[x - 2.5, y + 12.5], [x + 2.5, y + 12.5], [x + 2, y + 15.5], [x - 2, y + 15.5]], { value: 0.95, pencil: '6B', blend: 1, spacing: 0.25 });
    drop(fine, [x + 21, y - 12], 2.2);
    drop(fine, [x + 24, y - 4], 1.6);
  } else if (e === 'smug') {
    // Closed happy eyes, cat smile, blush hatching.
    fine.curve([x - 11, y + 5], [x - 8, y + 2], [x - 5, y + 5], { pencil: '4B', pressure: 0.85 });
    fine.curve([x + 6, y + 5], [x + 9, y + 2], [x + 12, y + 5], { pencil: '4B', pressure: 0.85 });
    fine.stroke([[x - 4, y + 12], [x - 2, y + 14], [x, y + 12.5], [x + 2, y + 14], [x + 4, y + 12]], { pressure: 0.7 });
    const blush = p.pen({ pencil: 'HB', pressure: 0.4, width: 0.6 });
    blush.hatch(ellipsePts([x - 13, y + 11], 3.2, 1.4, 0, 16), { angle: 65, spacing: 0.75, bow: 0.1 });
    blush.hatch(ellipsePts([x + 14, y + 11], 3.2, 1.4, 0, 16), { angle: 65, spacing: 0.75, bow: 0.1 });
  } else {
    // Wobbly eyes brimming, mouth squiggle, tear streams.
    for (const g of [gl, gr]) {
      fine.ellipse([g[0], g[1] + 0.5], 2.6, 3, { pencil: '4B', pressure: 0.8 });
      p.pen('studio').tone(ellipsePts([g[0], g[1] + 0.8], 2, 2.3, 0, 16), { value: 1, pencil: '6B', blend: false, spacing: 0.25 });
      p.pen('studio').eraseArea(ellipsePts([g[0] - 0.8, g[1] - 0.2], 0.7, 0.7, 0, 10), { radius: 0.5, amount: 1 });
      fine.stroke([[g[0] - 1, g[1] + 6.5], [g[0] - 2, g[1] + 11], [g[0] - 1, g[1] + 16]], { pressure: 0.5, passes: 1 });
      fine.stroke([[g[0] + 1, g[1] + 6.5], [g[0] + 1.5, g[1] + 11], [g[0] + 1, g[1] + 16]], { pressure: 0.5, passes: 1 });
    }
    fine.stroke([[x - 4, y + 14], [x - 2, y + 12.5], [x, y + 14], [x + 2, y + 12.5], [x + 4, y + 14]], { pressure: 0.7 });
  }
}

function drop(pen: Pen, at: Pt, s: number) {
  const [x, y] = at;
  pen.stroke([[x, y - s * 1.6], [x - s, y + s * 0.3], [x, y + s], [x + s, y + s * 0.3], [x, y - s * 1.6]], { taper: [0.3, 0.3] });
}

function fx(p: Page, heads: [Pt, Expr][]) {
  const f = p.pen('clean').with({ pencil: '2B', pressure: 0.6, taper: [1, 2.5] });
  for (const [[x, y], e] of heads) {
    if (e === 'shocked') {
      // Shake lines either side.
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) f.curve([x + s * (30 + k * 2.5), y - 8 + k * 7], [x + s * (32 + k * 2.5), y - 5 + k * 7], [x + s * (30 + k * 2.5), y - 2 + k * 7]);
    } else if (e === 'smug') {
      // Sparkles.
      for (const [sx, sy, r] of [[x + 27, y - 20, 4], [x - 29, y - 14, 2.6], [x + 31, y - 6, 2]] as const) sparkle(f, [sx, sy], r);
    } else {
      // Gloom: wavy lines falling behind the head, smudged with a fingertip.
      const g = p.pen('sketch').with({ pencil: 'HB', pressure: 0.5, passes: 1, taper: [2, 2] });
      for (let k = 0; k < 5; k++) {
        const gx = x - 16 + k * 8;
        g.stroke(Array.from({ length: 6 }, (_, j): Pt => [gx + (j % 2 ? 1.2 : -1.2), y - 44 + j * 3.2]));
      }
      p.pen('studio').smudge([[x - 18, y - 40], [x + 18, y - 38]], { radius: 3, amount: 0.35 });
    }
  }
}

function sparkle(pen: Pen, c: Pt, r: number) {
  const [x, y] = c;
  pen.stroke([[x, y - r], [x + r * 0.2, y - r * 0.2], [x + r, y], [x + r * 0.2, y + r * 0.2], [x, y + r], [x - r * 0.2, y + r * 0.2], [x - r, y], [x - r * 0.2, y - r * 0.2], [x, y - r]], { smooth: false, taper: [0.2, 0.2], passes: 1 });
}

/** Two flicks from neighbouring roots that meet at a tip: one hair clump, inked the way people do. */
function clump(pen: Pen, a: Pt, tip: Pt, b: Pt, bend: number) {
  const mid = (p: Pt, q: Pt, k: number): Pt => {
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    const dx = q[0] - p[0], dy = q[1] - p[1];
    return [mx - dy * k, my + dx * k];
  };
  pen.curve(a, mid(a, tip, bend), tip, { taper: [0.8, 2.5] });
  pen.curve(b, mid(b, tip, -bend), tip, { taper: [0.8, 2.5], pressure: 0.55 });
}

function hair(p: Page, o: Pt, seed: number) {
  const [x, y] = o;
  const pen = p.pen('clean').with({ pencil: '2B', pressure: 0.7, wobble: 0.12, flutter: 0.3 });
  let r = seed;
  const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  // Crown: tufts around the top of the skull from left ear to right ear.
  const R = 23;
  const n = 7;
  const at = (ang: number, rad: number): Pt => [x + Math.cos(ang) * rad, y - 4 + Math.sin(ang) * rad * 0.95];
  for (let k = 0; k < n; k++) {
    const a0 = Math.PI * (0.95 + (k / n) * 1.1), a1 = Math.PI * (0.95 + ((k + 1) / n) * 1.1);
    const am = (a0 + a1) / 2 + (rand() - 0.5) * 0.15;
    const tip = at(am + (am < Math.PI * 1.5 ? -0.12 : 0.12), R + 3 + rand() * 4);
    clump(pen, at(a0, R - 1), tip, at(a1, R - 1), 0.12);
  }
  // Ahoge.
  pen.curve([x + 1, y - 26], [x - 3, y - 34], [x + 5, y - 37], { taper: [0.5, 3] });
  // Bangs: locks from the hairline to pointed tips above the brow.
  const locks = 6;
  for (let k = 0; k < locks; k++) {
    const u = k / (locks - 1) - 0.5;
    const root: Pt = [x + u * 34, y - 18 + Math.abs(u) * 8];
    const w = 3 + rand() * 2;
    const tip: Pt = [x + u * 38 + (u < 0 ? -2 : 2) + (rand() - 0.5) * 3, y - 7 + rand() * 3 + Math.abs(u) * 7];
    clump(pen, [root[0] - w, root[1]], tip, [root[0] + w, root[1]], u * 0.25);
  }
  // Side locks hanging past the ears.
  for (const s of [-1, 1]) {
    clump(pen, [x + s * 20, y - 8], [x + s * 25, y + 12], [x + s * 24, y - 6], s * 0.1);
    clump(pen, [x + s * 21, y - 2], [x + s * 21, y + 9], [x + s * 23, y], -s * 0.1);
  }
}

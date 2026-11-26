// Lab sheet for the canvas-changing tools: eraser scrubs, dabs, smudges, dents, lead wear.
import { type Page, type Pt } from '../src/index.ts';

export const page = { width: 160, height: 100, paper: 'sketchbook', seed: 'eraser-lab' } as const;

const rect = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

export default function (p: Page) {
  const pen = p.pen('studio');
  // Four identical 2B patches, then a different tool on each.
  p.group('patches', () => {
    for (let i = 0; i < 4; i++) pen.tone(rect(8 + i * 38, 8, 32, 36), { value: 0.75, pencil: '2B', angle: 35, blend: 0.6 });
  });
  p.mark('shaded');

  p.group('tools', () => {
    pen.scrub([12, 16], [36, 16], { n: 1, eraser: 'rubber', radius: 2 });
    pen.scrub([12, 26], [36, 26], { n: 3, eraser: 'rubber', radius: 2 });
    pen.scrub([12, 36], [36, 36], { n: 6, eraser: 'rubber', radius: 2 });
    pen.scrub([50, 16], [74, 16], { n: 2, eraser: 'vinyl', radius: 2 });
    pen.scrub([50, 30], [74, 38], { n: 2, eraser: 'kneaded', radius: 2.5 });
    for (let k = 0; k < 4; k++) pen.dab([90 + (k % 2) * 12, 18 + Math.floor(k / 2) * 16], { radius: 3, amount: 0.3 + k * 0.15 });
    pen.smudge([[124, 14], [140, 18], [158, 22]], { radius: 3, amount: 0.8 });
    pen.smudge([[140, 30], [150, 34], [159, 46]], { radius: 2.5, amount: 0.9 });
    pen.smudge([[130, 36], [136, 42], [138, 50]], { radius: 2, amount: 0.9 });
  });
  p.mark('erased');

  // Dents first, then shading over them: the grooves stay white.
  p.group('dents', () => {
    pen.indent([[12, 62], [20, 56], [30, 66], [40, 56], [48, 64]], { radius: 0.18 });
    pen.indent([[14, 80], [46, 74]], { radius: 0.3, amount: 1 });
    p.pen({ pencil: '2H', pressure: 1 }).stroke([[14, 88], [30, 85], [46, 90]], { dent: 0.8 });
    pen.tone(rect(8, 52, 44, 42), { value: 0.6, pencil: '4B', angle: 10, blend: false });
  });
  p.mark('dents shaded');

  // A dulling lead: the same squiggle drawn over and over without sharpening.
  p.group('wear', () => {
    const dull = p.pen({ pencil: '2B', pressure: 0.7, wear: 0.25, wobble: 0.1, taper: [1, 1] });
    for (let k = 0; k < 8; k++) {
      const y = 56 + k * 5;
      dull.stroke([[64, y], [80, y - 2], [96, y + 2], [112, y], [150, y]]);
    }
  });
}

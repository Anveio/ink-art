// A small single panel in the loose cartoon style of the references, with one
// over-rendered "studio" object in it (the comedic fidelity jump).
import { type Page, type Pt, ellipsePts } from '../src/index.ts';

export const page = { width: 120, height: 90, paper: 'sketchbook', seed: 'demo-panel' } as const;

export default function (p: Page) {
  const sketch = p.pen('sketch');
  const line = p.pen('clean').with({ pencil: '2B', pressure: 0.65 });

  p.group('border', () => {
    const b = p.pen({ pencil: '2B', pressure: 0.8, wobble: 0.15, taper: [0.5, 0.5], passes: 1 });
    b.line([5, 5], [115, 5]).line([115, 5], [115, 85]).line([115, 85], [5, 85]).line([5, 85], [5, 5]);
  });

  p.group('kid', () => {
    p.group('head', () => {
      // Round head, slightly squashed.
      sketch.stroke([[22, 46], [21, 36], [27, 27], [37, 24], [47, 27], [52, 36], [51, 47], [45, 55], [36, 57], [27, 54], [22, 46]], { passes: 2 });
      // Ears.
      sketch.curve([21.5, 40], [16, 41], [21.5, 47], { passes: 1 });
      sketch.curve([51.5, 40], [57, 41], [51.5, 47], { passes: 1 });
    });
    p.group('hair', () => {
      const h = line.with({ pencil: '2B', taper: [1, 4], wobble: 0.15 });
      h.stroke([[19, 38], [20, 26], [30, 18], [42, 18], [52, 24], [55, 36]]);
      h.stroke([[25, 23], [29, 30], [31, 25], [35, 32], [37, 25], [42, 31], [44, 25], [49, 31], [52, 30]]);
      h.curve([34, 18], [33, 11], [40, 9]); // ahoge
      h.curve([36, 18], [37, 13], [41, 11], { pressure: 0.4 });
    });
    p.group('face', () => {
      // Big round glasses.
      line.ellipse([30.5, 41], 6, 5.5, { pressure: 0.55 });
      line.ellipse([43.5, 41], 6, 5.5, { pressure: 0.55 });
      line.curve([36.5, 40.5], [37, 39], [37.5, 40.5], { pressure: 0.5 });
      // Flat, unimpressed eyes.
      line.line([28, 41.5], [33, 41.5], { pencil: '4B', pressure: 0.9 });
      line.line([41, 41.5], [46, 41.5], { pencil: '4B', pressure: 0.9 });
      line.line([27.5, 38.5], [32, 37.8], { pressure: 0.4 });
      line.line([42, 37.8], [46.5, 38.5], { pressure: 0.4 });
      // Mouth.
      line.line([35, 50.5], [39.5, 50.2], { pressure: 0.6 });
      // Sweat drop.
      line.stroke([[50, 33], [48.6, 36.5], [50, 37.6], [51.3, 36.5], [50, 33]], { pressure: 0.5, taper: [0.3, 0.3] });
      // Blush hatching.
      line.with({ pencil: 'HB', pressure: 0.35, width: 0.6 }).hatch(ellipsePts([27, 47], 3, 1.3, 0, 16), { angle: 70, spacing: 0.7, bow: 0.1 });
      line.with({ pencil: 'HB', pressure: 0.35, width: 0.6 }).hatch(ellipsePts([47, 47], 3, 1.3, 0, 16), { angle: 70, spacing: 0.7, bow: 0.1 });
    });
    p.group('body', () => {
      sketch.stroke([[27, 55], [22, 66], [18, 84]]);
      sketch.stroke([[45, 55], [51, 66], [55, 84]]);
      sketch.stroke([[31, 57], [36, 66], [42, 57]], { passes: 1 });
    });
  });

  // The joke: an absurdly well-rendered apple on the table next to a doodle kid.
  p.group('apple', () => {
    const c: Pt = [86, 66];
    const studio = p.pen('studio');
    const body: Pt[] = [[86, 53], [93, 51], [99, 55], [101, 63], [98, 73], [92, 78], [86, 76], [80, 78], [74, 73], [71, 63], [73, 55], [79, 51]];
    // Cast shadow on the table.
    studio.tone(ellipsePts([90, 78.5], 15, 2.6, 0, 40), { value: 0.95, pencil: '6B', angle: 5, blend: 1 });
    // Base tone, then form shadow on the right, then core darks.
    studio.tone(body, { value: 0.4, pencil: 'HB', angle: 35 });
    studio.tone([[90, 52], [96, 52], [100, 58], [101, 66], [98, 74], [92, 78], [88, 77], [93, 70], [95, 62], [93, 55]], { value: 0.8, pencil: '4B', angle: 60 });
    studio.tone([[96, 58], [100, 60], [100, 68], [97, 74], [94, 72], [97, 66]], { value: 1, pencil: '8B', angle: 80, pressure: 0.95 });
    // Reflected light along the bottom edge and a crisp specular highlight.
    studio.erase([[78, 74], [84, 76.5], [90, 76]], { radius: 1, amount: 0.5 });
    studio.eraseArea(ellipsePts([79.5, 59], 2.6, 3.6, -0.4, 20), { radius: 1, amount: 0.95 });
    // Outline and stem.
    studio.poly(body, { pencil: '2B', pressure: 0.5, smooth: true });
    studio.stroke([[86, 53], [86.5, 49], [88.5, 45.5]], { pencil: '6B', pressure: 0.9, width: 2.2, taper: [0.5, 1] });
    studio.tone([[87, 50], [93, 46], [97, 47], [92, 50]], { value: 0.6, pencil: '2B', angle: 15, blend: 0.5 });
    void c;
  });

  p.group('table', () => {
    sketch.line([8, 79.5], [112, 78.5], { passes: 1, pressure: 0.5 });
  });

  p.group('bubble', () => {
    line.with({ pressure: 0.55 }).bubble([78, 22], 20, 10, [56, 34]);
  });
}

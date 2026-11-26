// Model sheet for comic 01's cast: every expression, big, for checking the drawing.
import { type Page } from '../../src/index.ts';
import { Rig, cartoonPens, magsHead, pipHead } from '../comic-01/cast.ts';

export const page = { width: 240, height: 110, paper: 'sketchbook', seed: 'cast' } as const;

export default function (p: Page) {
  const P = cartoonPens(p);
  const s = 1.9;
  (['deadpan', 'glare', 'neutral'] as const).forEach((e, i) => p.group(`pip-${e}`, () => pipHead(new Rig([28 + i * 52, 48], s), P, e)));
  p.group('mags-puzzled', () => magsHead(new Rig([200, 40], 1.6), P, 'puzzled'));
}

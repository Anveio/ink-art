// Iteration scene: the panel-3 still life alone, drawn by the tonal engine.
import { type Page } from '../../src/index.ts';
import { Grid, darknessOf, toneMap } from '../../src/studio/tonal.ts';
import { stillLifeReference } from '../comic-01/still-life.ts';

export const page = { width: 92, height: 115, paper: 'bristol', seed: 'still-life' } as const;

export default async function (p: Page) {
  const cell = Number(process.env.CELL ?? 0.15);
  const ref = await stillLifeReference([0, 0, 92, 115], cell);
  const target = ref.lum.map((l) => darknessOf(l / Number(process.env.EXPO ?? 1.35)));
  p.group('still-life', () => toneMap(p, target, { ids: ref.id, highlight: 0.04, blend: { radius: 0.8, amount: 0.7 }, log: console.error }));
}

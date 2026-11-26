// Tonal engine test: a lit sphere with a cast shadow, drawn by toneMap.
import { type Page } from '../../src/index.ts';
import { Grid, toneMap } from '../../src/studio/tonal.ts';

export const page = { width: 60, height: 50, paper: 'bristol', seed: 'tone-sphere' } as const;

export default function (p: Page) {
  const cx = 28, cy = 22, R = 13;
  const L = [-0.5, -0.6, 0.62];
  const t = Grid.over(4, 4, 52, 42, 0.12).fill((x, y) => {
    const dx = (x - cx) / R, dy = (y - cy) / R, rr = dx * dx + dy * dy;
    if (rr < 1) {
      const nz = Math.sqrt(1 - rr);
      const ndl = Math.max(0, dx * L[0] + dy * L[1] + nz * L[2]);
      const refl = 0.25 * Math.max(0, dy) * (1 - nz); // bounce light from the ground
      const lum = 0.06 + 0.85 * ndl + refl + 0.6 * Math.pow(Math.max(0, ndl), 40);
      return Math.max(0, Math.min(1, 1 - lum));
    }
    // ground + cast shadow ellipse offset away from the light
    const sx = (x - (cx + 9)) / (R * 1.1), sy = (y - (cy + 14)) / (R * 0.35);
    const sh = Math.exp(-Math.max(0, sx * sx + sy * sy - 0.3) * 2.5);
    const ground = y > cy + 8 ? 0.25 : 0.12 + (cy + 8 - y) * 0.01;
    return Math.min(1, ground + 0.6 * sh);
  });
  p.group('sphere', () => toneMap(p, t, { highlight: 0.06, log: console.error }));
}

// Style study for comic 01: panel 1 in three line styles, and the punchline panel rendered two
// ways (raw hatching vs. stump-polished). Used to pick the final look.
import { type Page, type Pt, letter } from '../../src/index.ts';
import { cartoonPens } from './cast.ts';
import { border, panel1, panel3 } from './comic.ts';
import type { Rect } from './layout.ts';

export const page = { width: 497, height: 142, paper: 'hotpress', seed: 'comic-01' } as const;

export default async function (p: Page) {
  const styles = ['loose', 'clean', 'bold'] as const;
  const labels = ['A. LOOSE HB SKETCH', 'B. CLEAN 2B LINE (CHOSEN)', 'C. HEAVY 6B LINE'];
  for (const [i, st] of styles.entries()) {
    // Same drawing, shifted into its own slot: panel 1 is laid out at x = 8.
    const dx = i * 97;
    const rect: Rect = [8 + dx, 19, 92, 115];
    const P = cartoonPens(p, st);
    p.group(`style-${st}`, () => {
      border(p, rect);
      const frame: Pt[] = [[rect[0], rect[1]], [rect[0] + 92, rect[1]], [rect[0] + 92, rect[1] + 115], [rect[0], rect[1] + 115]];
      p.within(frame, () => panel1(p, P, rect));
      letter(p.pen('clean'), labels[i], [rect[0], 12], { size: 3, align: 'left' });
    });
  }
  for (const [i, st] of (['hatched', 'polished'] as const).entries()) {
    const rect: Rect = [299 + i * 97, 19, 92, 115];
    await p.group(`p3-${st}`, async () => {
      border(p, rect);
      await panel3(p, rect, st);
      letter(p.pen('clean'), i ? 'E. STUMP-POLISHED (CHOSEN)' : 'D. RAW HATCHING', [rect[0], 12], { size: 3, align: 'left' });
    });
  }
}

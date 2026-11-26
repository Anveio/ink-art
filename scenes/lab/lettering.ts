import { type Page, balloon, letter } from '../../src/index.ts';
export const page = { width: 120, height: 60, paper: 'sketchbook', seed: 'letters' } as const;
export default function (p: Page) {
  const pen = p.pen('clean');
  balloon(pen, "HUH. I'M ONE\nTILE SHORT.", [32, 18], [46, 36], { size: 3 });
  balloon(pen, 'YOU ATE IT\nAGAIN.', [88, 16], [76, 34], { size: 3 });
  balloon(pen, 'IN MY DEFENSE...\nLOOK AT IT.', [40, 46], [70, 58], { size: 2.6 });
  letter(pen, 'THE MISSING TILE', [95, 46], { size: 4.2, pressure: 0.9 });
  letter(pen, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ?!', [95, 54], { size: 2 });
}

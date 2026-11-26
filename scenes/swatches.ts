// Test sheet for tuning the paper and graphite model.
import { type Page, type Pt, PENCILS, type PencilName, ellipsePts } from '../src/index.ts';

export const page = { width: 180, height: 130, paper: 'sketchbook', seed: 'swatches' } as const;

export default function (p: Page) {
  const grades = Object.keys(PENCILS) as PencilName[];

  // Row 1: each grade, light to heavy pressure, as wavy lines.
  p.group('grades', () => {
    grades.forEach((g, i) => {
      const x = 10 + i * 23;
      [0.25, 0.5, 0.8, 1].forEach((pr, k) => {
        const y = 10 + k * 6;
        p.pen('clean').stroke([[x, y], [x + 6, y - 1.5], [x + 12, y + 1.5], [x + 18, y]], { pencil: g, pressure: pr });
      });
    });
  });

  // Row 2: hatched and toned squares per grade.
  p.group('tones', () => {
    grades.forEach((g, i) => {
      const x = 10 + i * 23, y = 38;
      const sq: Pt[] = [[x, y], [x + 18, y], [x + 18, y + 18], [x, y + 18]];
      p.pen({ pencil: g }).tone(sq, { value: 0.85, pencil: g, angle: 40, blend: i % 2 ? 0.8 : false });
    });
  });

  // Row 3 left: sketchy cartoon head like the references.
  p.group('cartoon', () => {
    const pen = p.pen('sketch');
    pen.ellipse([35, 95], 16, 18, { rotation: 8 });
    pen.ellipse([29, 93], 4.5, 4.5, { pencil: '2B', passes: 1 });
    pen.ellipse([42, 93], 4.5, 4.5, { pencil: '2B', passes: 1 });
    pen.line([33.5, 93], [37.5, 93]);
    pen.curve([30, 103], [36, 108], [42, 102], { pressure: 0.7 });
    pen.stroke([[20, 86], [26, 76], [36, 74], [46, 78], [52, 88]], { pencil: '2B' });
    pen.stroke([[24, 84], [30, 79], [28, 88]], { passes: 1 });
    pen.stroke([[38, 77], [44, 82], [40, 87]], { passes: 1 });
    p.pen('clean').bubble([62, 76], 9, 6, [50, 84]);
  });

  // Row 3 middle: studio-style shaded sphere with cast shadow and a lifted highlight.
  p.group('sphere', () => {
    const c: Pt = [100, 96];
    const R = 18;
    const studio = p.pen('studio');
    // Cast shadow.
    studio.tone(ellipsePts([c[0] + 10, c[1] + R - 1], R * 1.1, 4.5, 0, 48), { value: 0.9, angle: 10, pencil: '6B', blend: 1 });
    // Core shadow crescent then mid tones.
    const crescent: Pt[] = [...ellipsePts(c, R, R, 0, 48, -0.6, Math.PI * 0.95), ...ellipsePts([c[0] - 5, c[1] - 5], R * 0.95, R * 0.95, 0, 48, Math.PI * 0.9, -0.45).slice(1)];
    studio.tone(ellipsePts(c, R, R, 0, 64), { value: 0.35, angle: 30, pencil: 'HB', blend: 1 });
    studio.tone(crescent, { value: 0.85, angle: 55, pencil: '4B', blend: 1 });
    studio.eraseArea(ellipsePts([c[0] - 6, c[1] - 6], 4, 3.2, 0, 24), { radius: 2.2, amount: 0.8 });
    studio.ellipse(c, R, R, { pencil: '2B', pressure: 0.45, overlap: 0.05 });
  });

  // Row 3 right: big burnished 8B patch to show sheen.
  p.group('burnish', () => {
    const sq: Pt[] = [[132, 78], [170, 78], [170, 118], [132, 118]];
    const pen = p.pen({ pencil: '8B' });
    pen.tone(sq, { value: 1, pencil: '8B', angle: 20, pressure: 0.95, spacing: 0.3, blend: 1 });
    pen.tone(sq, { value: 1, pencil: '8B', angle: 80, pressure: 1, spacing: 0.3, blend: 0.6 });
    pen.erase([[136, 112], [150, 96], [166, 84]], { radius: 1.2, amount: 0.95 });
  });
}

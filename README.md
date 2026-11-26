# ink-art

A scriptable graphite-pencil renderer. Drawings are TypeScript that calls a stroke SDK; the
renderer simulates paper tooth, graphite deposition, blending, erasing and sheen, and can render
any crop of a page at any DPI so previews stay small.

## Quick start

```sh
npm install
npm run ink -- info   scenes/demo-panel.ts                          # groups + bboxes (JSON)
npm run ink -- render scenes/demo-panel.ts --fit 900 --grid 10 --finish flat   # overview with mm grid
npm run ink -- render scenes/demo-panel.ts --group kid/face --dpi 600           # crop to a group
npm run ink -- render scenes/demo-panel.ts --region 24,34,26,16 --dpi 1200 --finish photo
npm run ink -- render scenes/demo-panel.ts --dpi 600 --finish photo --out out/final.png
```

## Model

- Units are millimetres, origin top-left. A `Page` has a size and a paper (`sketchbook`, `bristol`, `coldpress`).
- Drawing is an ordered list of ops: strokes, stump blends and eraser passes. Order matters, like real pencil.
- Every op belongs to a group (`page.group('kid', () => ...)`, nested as `kid/face`). Groups can be
  listed, rendered alone (`--only`), hidden (`--hide`) or used as a crop (`--group`).
- All randomness is seeded, and paper is position-based, so a crop renders exactly the same pixels as the full page.

## SDK

```ts
import { type Page } from '../src/index.ts';
export const page = { width: 120, height: 90, paper: 'sketchbook' } as const;
export default function (p: Page) {
  const pen = p.pen('sketch');               // styles: sketch, clean, construct, studio, or your own options
  pen.stroke([[10, 10], [30, 5], [50, 12]]);  // spline through points
  pen.line(a, b).curve(a, ctrl, b).ellipse(c, rx, ry).poly(pts);
  pen.hatch(poly, { angle: 45, spacing: 0.8 });
  pen.crosshatch(poly, { layers: 2 });
  pen.tone(poly, { value: 0.7 });             // even studio shading: hatch + cross + blend
  pen.blend(poly); pen.blendPath(path);       // blending stump
  pen.erase(path); pen.eraseArea(poly);       // kneaded eraser (lifts peaks first)
  pen.bubble(center, rx, ry, tailTip);        // speech bubble outline
}
```

Stroke options: `pencil` (4H..8B), `pressure` (number, [start,end] or fn), `width`, `taper`,
`wobble`, `tremor`, `overshoot`, `passes`, `spread`, `flutter`, `smooth`, `seed`.

Render options: `dpi` or `fit`, `region`, `finish` (`flat` | `scan` | `photo`), `only`, `hide`,
`grid`, `sheen`, `light`.

From a script: `import { Page, render } from './src/index.ts'` (browser-safe) or
`import { renderToFile } from './src/node.ts'` (writes PNG with DPI metadata).

## Layout

- `src/core` seeded noise and geometry
- `src/sdk` page, pens, pencils, papers
- `src/render` the CPU renderer (tiled; works in Node and the browser)
- `src/node` CLI and PNG output
- `scenes/` drawings

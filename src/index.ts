// Browser-safe entry: no Node imports here. Node helpers live in ./node.ts.
export { Page, Pen, STYLES, type StrokeOpts, type HatchOpts, type ToneOpts, type ToolOpts, type PageOpts, type Op } from './sdk/page.ts';
export { PENCILS, pencil, type Pencil, type PencilName } from './sdk/pencils.ts';
export { PAPERS, type Paper, type PaperName } from './sdk/paper.ts';
export { render, type RenderOpts, type RenderedImage, type Finish } from './render/render.ts';
export { type Pt, type BBox, ellipsePts, catmullRom, quad } from './core/geom.ts';
export { rng, seedOf } from './core/random.ts';

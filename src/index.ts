// Browser-safe entry: no Node imports here. Node helpers live in ./node.ts.
export { Page, Pen, STYLES, type StrokeOpts, type HatchOpts, type ToneOpts, type ToolOpts, type PageOpts, type Op, type ScrubOpts, type Mark, type EraserKind } from './sdk/page.ts';
export { PENCILS, pencil, type Pencil, type PencilName } from './sdk/pencils.ts';
export { PAPERS, type Paper, type PaperName } from './sdk/paper.ts';
export { render, type RenderOpts, type RenderedImage, type Finish } from './render/render.ts';
export { Timeline, diffImages, contactStrip, type TimelineOpts, type SnapshotCodec } from './render/timeline.ts';
export { type Pt, type BBox, ellipsePts, catmullRom, quad } from './core/geom.ts';
export { rng, seedOf } from './core/random.ts';
export { letter, balloon, measureText, type LetterOpts, type BalloonOpts } from './sdk/lettering.ts';
export { Grid, toneMap, hatchField, look, darknessOf, reflectanceOf, STUDIO_LAYERS, type ToneLayer, type ToneMapOpts } from './studio/tonal.ts';
export { renderSdf, type SdfScene, type Camera, type Material, type Light, type SdfRender } from './studio/sdf.ts';
export { Rig } from './sdk/rig.ts';

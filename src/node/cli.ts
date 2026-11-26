#!/usr/bin/env tsx
// ink: render scene files to PNG.
//
//   npm run ink -- render scenes/demo.ts                       whole page, 100 dpi, scan finish
//   npm run ink -- render scenes/demo.ts --fit 800 --grid 10   small overview with a mm grid
//   npm run ink -- render scenes/demo.ts --region 40,60,30,20 --dpi 1200   zoom a 30x20 mm crop
//   npm run ink -- render scenes/demo.ts --group face --dpi 600            crop to a group
//   npm run ink -- render scenes/demo.ts --dpi 600 --finish photo --out out/final.png
//   npm run ink -- info scenes/demo.ts                          groups, op ranges, marks as JSON
//   npm run ink -- render scenes/demo.ts --at linework          the drawing as it was at a mark
//   npm run ink -- history scenes/demo.ts --group face --frames 6     contact strip of the history
//   npm run ink -- history scenes/demo.ts --marks --fit 300           one frame per mark
//   npm run ink -- diff scenes/demo.ts --from linework --to shading   what changed, in red
//
// A scene file default-exports either a Page, or a function (page) => void and optionally
// `export const page = { width, height, paper, seed }`.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Page, type PageOpts } from '../sdk/page.ts';
import { renderToFile, writeImage, zlibCodec } from '../node.ts';
import { Timeline, contactStrip, diffImages } from '../render/timeline.ts';
import type { Finish, RenderOpts } from '../render/render.ts';

export async function loadScene(file: string): Promise<Page> {
  const mod = await import(pathToFileURL(resolve(file)).href);
  const d = mod.default;
  if (d instanceof Page) return d;
  if (typeof d === 'function') {
    const page = new Page((mod.page as PageOpts) ?? {});
    await d(page);
    return page;
  }
  throw new Error(`${file}: default export must be a Page or a function(page)`);
}

function parseArgs(argv: string[]) {
  const pos: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      flags[k] = v;
    } else pos.push(a);
  }
  return { pos, flags };
}

async function main() {
  const { pos, flags } = parseArgs(process.argv.slice(2));
  const [cmd, file] = pos;
  if (!cmd || !file) {
    console.log('usage: ink render|info|history|diff <scene.ts> [--dpi N] [--fit PX] [--region x,y,w,h] [--group NAME] [--only a,b] [--hide a,b] [--finish flat|scan|photo] [--grid MM] [--sheen K] [--at POS] [--frames N | --marks] [--from POS --to POS] [--ss N] [--out FILE]');
    process.exit(1);
  }
  const page = await loadScene(file);
  if (cmd === 'info') {
    console.log(JSON.stringify(page.summary()));
    return;
  }
  const opts: RenderOpts = {
    dpi: flags.dpi ? Number(flags.dpi) : undefined,
    fit: flags.fit ? Number(flags.fit) : undefined,
    finish: (flags.finish as Finish) ?? 'scan',
    grid: flags.grid ? Number(flags.grid) : undefined,
    sheen: flags.sheen ? Number(flags.sheen) : undefined,
    at: flags.at,
    only: flags.only?.split(','),
    hide: flags.hide?.split(','),
  };
  if (flags.region) {
    const r = flags.region.split(',').map(Number);
    opts.region = [r[0], r[1], r[2], r[3]];
  }
  if (flags.group) {
    const b = page.groupBox(flags.group);
    if (!b) throw new Error(`no group "${flags.group}". Try: ink info ${file}`);
    const pad = 3;
    opts.region = [b[0] - pad, b[1] - pad, b[2] - b[0] + pad * 2, b[3] - b[1] + pad * 2];
  }
  const base = file.replace(/^.*\//, '').replace(/\.[tj]s$/, '');
  if (cmd === 'history' || cmd === 'diff') {
    if (!opts.dpi && !opts.fit) opts.fit = cmd === 'history' ? 320 : 700;
    const tl = new Timeline(page, { ...opts, at: undefined, codec: zlibCodec });
    const t0 = performance.now();
    if (cmd === 'diff') {
      const a = tl.at(flags.from ?? 0), b = tl.at(flags.to ?? page.ops.length);
      const d = diffImages(a, b);
      const out = flags.out ?? `out/${base}.diff.png`;
      console.log(`${writeImage(d, out)} changed ${d.changed}px (${((100 * d.changed) / (d.width * d.height)).toFixed(1)}%)`);
      return;
    }
    let positions: (number | string)[];
    if (flags.marks) positions = page.marks.map((m) => m.label).concat(['end']);
    else {
      const n = Math.max(2, Number(flags.frames ?? 6));
      // Spread frames over the ops that touch this region, not over the whole page.
      const steps = tl.steps;
      positions = steps.length ? Array.from({ length: n }, (_, k) => steps[Math.max(0, Math.round(((k + 1) / n) * steps.length) - 1)]) : [page.ops.length];
    }
    const frames = positions.map((p) => tl.at(p === 'end' ? page.ops.length : p));
    const captions = positions.map((p) => (typeof p === 'number' ? `#${p}` : String(p)));
    const out = flags.out ?? `out/${base}.history.png`;
    const st = tl.storage;
    console.log(`${writeImage(contactStrip(frames, captions), out)} ${frames.length} frames ${Math.round(performance.now() - t0)}ms keyframes ${st.keyframes} (${(st.bytes / 1024).toFixed(0)} KiB)`);
    return;
  }
  const out = flags.out ?? `out/${base}${flags.group ? '.' + flags.group.replace(/\//g, '_') : ''}${flags.region ? '.crop' : ''}.png`;
  console.log(renderToFile(page, out, { ...opts, supersample: flags.ss ? Number(flags.ss) : undefined }));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

// Node-only: render an SDF reference on all cores with worker threads, and cache it on disk.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname } from 'node:path';
import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import type { Camera, SdfRender } from './sdf.ts';
import { Grid } from './tonal.ts';

export interface SdfJob {
  /** Absolute path (or file URL) of a module that exports a function returning an SdfScene. */
  module: string;
  /** Name of that export. */
  factory: string;
  camera: Camera;
  rect: [number, number, number, number];
  cell: number;
}

const WORKER = new URL('./sdf-worker.ts', import.meta.url);

/** Render on every core. Rows are interleaved in bands so slow regions spread over workers. */
export async function renderSdfParallel(job: SdfJob, log?: (s: string) => void): Promise<SdfRender> {
  const g = Grid.over(job.rect[0], job.rect[1], job.rect[2], job.rect[3], job.cell);
  const n = Math.max(1, Math.min(cpus().length, 8));
  const band = 8;
  const bands: [number, number][] = [];
  for (let j = 0; j < g.h; j += band) bands.push([j, Math.min(g.h, j + band)]);
  const out = { lum: new Float32Array(g.w * g.h), id: new Float32Array(g.w * g.h), depth: new Float32Array(g.w * g.h) };
  const t0 = Date.now();
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: n }, () => new Promise<void>((resolve, reject) => {
    const w = new Worker(WORKER, { execArgv: ['--import', 'tsx'], workerData: job });
    const feed = () => {
      if (next >= bands.length) { w.terminate(); resolve(); return; }
      w.postMessage(bands[next++]);
    };
    w.on('message', (m: { rows: [number, number]; lum: Float32Array; id: Float32Array; depth: Float32Array }) => {
      const o = m.rows[0] * g.w, len = (m.rows[1] - m.rows[0]) * g.w;
      out.lum.set(m.lum.subarray(o, o + len), o); out.id.set(m.id.subarray(o, o + len), o); out.depth.set(m.depth.subarray(o, o + len), o);
      if (log && ++done % 20 === 0) log(`sdf ${done}/${bands.length} bands ${Date.now() - t0}ms`);
      feed();
    });
    w.on('error', reject);
    w.on('online', feed);
  })));
  const mk = (d: Float32Array) => new Grid(g.x0, g.y0, g.cell, g.w, g.h, d);
  return { lum: mk(out.lum), id: mk(out.id), depth: mk(out.depth) };
}

/** Like renderSdfParallel, but cached in `cacheDir` by a hash of the job and the scene source. */
export async function cachedSdf(job: SdfJob, cacheDir: string, log?: (s: string) => void): Promise<SdfRender> {
  const path = job.module.startsWith('file:') ? new URL(job.module).pathname : job.module;
  const src = readFileSync(path, 'utf8') + readFileSync(new URL('./sdf.ts', import.meta.url), 'utf8');
  const key = createHash('sha1').update(JSON.stringify(job)).update(src).digest('hex').slice(0, 16);
  const file = `${cacheDir}/sdf-${job.factory}-${key}.bin`;
  const g = Grid.over(job.rect[0], job.rect[1], job.rect[2], job.rect[3], job.cell);
  const n = g.w * g.h;
  const mk = (d: Float32Array) => new Grid(g.x0, g.y0, g.cell, g.w, g.h, d);
  if (existsSync(file)) {
    const buf = readFileSync(file);
    const all = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    return { lum: mk(all.slice(0, n)), id: mk(all.slice(n, 2 * n)), depth: mk(all.slice(2 * n, 3 * n)) };
  }
  const r = await renderSdfParallel(job, log);
  mkdirSync(dirname(file), { recursive: true });
  const all = new Float32Array(n * 3);
  all.set(r.lum.data, 0); all.set(r.id.data, n); all.set(r.depth.data, 2 * n);
  writeFileSync(file, Buffer.from(all.buffer));
  return r;
}

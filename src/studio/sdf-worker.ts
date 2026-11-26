// Worker for renderSdfParallel: renders bands of rows on request.
import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { renderSdf, type SdfScene } from './sdf.ts';
import type { SdfJob } from './sdf-node.ts';

const job = workerData as SdfJob;
const url = job.module.startsWith('file:') ? job.module : pathToFileURL(job.module).href;
const mod = await import(url);
const scene: SdfScene = mod[job.factory]();
parentPort!.on('message', (rows: [number, number]) => {
  const r = renderSdf(scene, job.camera, job.rect, job.cell, undefined, rows);
  parentPort!.postMessage({ rows, lum: r.lum.data, id: r.id.data, depth: r.depth.data });
});

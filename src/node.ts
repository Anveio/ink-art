// Node-side helpers for scripting: render straight to PNG files.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';
import { render, type RenderOpts, type RenderedImage } from './render/render.ts';
import type { Page } from './sdk/page.ts';

export * from './index.ts';

export function encodePng(img: RenderedImage, dpi?: number): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  const buf = PNG.sync.write(png, { colorType: 2 });
  return dpi ? withPhys(buf, dpi) : buf;
}

/** Render and write a PNG. Returns a one-line summary that is cheap to read. */
export function renderToFile(page: Page, file: string, opts: RenderOpts = {}): string {
  const img = render(page, opts);
  mkdirSync(dirname(file), { recursive: true });
  const dpi = opts.fit ? undefined : opts.dpi ?? 100;
  writeFileSync(file, encodePng(img, dpi));
  return `${file} ${img.width}x${img.height}px ${img.stats.ops} ops ${img.stats.ms}ms`;
}

/** Insert a pHYs chunk so print tools see the intended DPI. */
function withPhys(buf: Buffer, dpi: number): Buffer {
  const ppm = Math.round(dpi / 0.0254);
  const data = Buffer.alloc(9);
  data.writeUInt32BE(ppm, 0); data.writeUInt32BE(ppm, 4); data[8] = 1;
  const type = Buffer.from('pHYs');
  const len = Buffer.alloc(4); len.writeUInt32BE(9);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([type, data])) >>> 0);
  const ihdrEnd = 8 + 25; // signature + IHDR chunk
  return Buffer.concat([buf.subarray(0, ihdrEnd), len, type, data, crc, buf.subarray(ihdrEnd)]);
}

function crc32(b: Buffer): number {
  let c = ~0;
  for (let i = 0; i < b.length; i++) {
    c ^= b[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}

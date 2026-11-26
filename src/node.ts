// Node-side helpers for scripting: render straight to PNG files.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import type { RasterSnapshot } from './render/render.ts';
import type { SnapshotCodec } from './render/timeline.ts';
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
export function renderToFile(page: Page, file: string, opts: RenderOpts & { supersample?: number } = {}): string {
  const ss = Math.max(1, Math.round(opts.supersample ?? 1));
  let img = ss > 1 ? render(page, { ...opts, dpi: (opts.dpi ?? 100) * ss, fit: opts.fit ? opts.fit * ss : undefined }) : render(page, opts);
  if (ss > 1) img = downsample(img, ss);
  mkdirSync(dirname(file), { recursive: true });
  const dpi = opts.fit ? undefined : opts.dpi ?? 100;
  writeFileSync(file, encodePng(img, dpi));
  return `${file} ${img.width}x${img.height}px ${img.stats.ops} ops ${img.stats.ms}ms`;
}

/**
 * Box-filter an image down by an integer factor. Hatching finer than the output pixels averages
 * into tone instead of aliasing into moire, like a scan at lower resolution would.
 */
export function downsample(img: RenderedImage, k: number): RenderedImage {
  const W = Math.floor(img.width / k), H = Math.floor(img.height / k);
  const out = new Uint8ClampedArray(W * H * 4);
  // Average in linear light.
  const lin = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; lin[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
  const toS = (v: number) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < k; j++)
        for (let i = 0; i < k; i++) {
          const o = ((y * k + j) * img.width + x * k + i) * 4;
          r += lin[img.data[o]]; g += lin[img.data[o + 1]]; b += lin[img.data[o + 2]];
        }
      const n = k * k, o = (y * W + x) * 4;
      out[o] = toS(r / n); out[o + 1] = toS(g / n); out[o + 2] = toS(b / n); out[o + 3] = 255;
    }
  return { ...img, width: W, height: H, data: out, pxPerMm: img.pxPerMm / k };
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

/**
 * Keyframe codec for timelines: graphite buffers are mostly empty or smooth, so plain deflate of
 * the float data compresses them hard. Paper height is only stored once something dented it.
 */
export const zlibCodec: SnapshotCodec = {
  pack(s, hasOwnH) {
    // Quantise to 16 bits (graphite in 1/2048ths, tone as a ratio, height offset), then split
    // high and low bytes into separate planes so deflate sees long runs. Visually lossless.
    const n = s.D.length, planes = hasOwnH ? 4 : 3;
    const q = new Uint16Array(n * planes);
    for (let i = 0; i < n; i++) {
      const d = s.D[i];
      q[i] = Math.min(65535, Math.round(d * 2048));
      q[n + i] = d > 1e-6 ? Math.min(65535, Math.round((s.T[i] / d) * 65535)) : 0;
      q[2 * n + i] = Math.min(65535, Math.round(s.S[i] * 2048));
      if (hasOwnH) q[3 * n + i] = Math.round((s.H[i] + 1) * 21845);
    }
    const bytes = new Uint8Array(q.length * 2);
    for (let i = 0; i < q.length; i++) { bytes[i] = q[i] >>> 8; bytes[q.length + i] = q[i] & 255; }
    const z = deflateRawSync(bytes, { level: 6 });
    const out = new Uint8Array(z.byteLength + 9);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, n); dv.setUint32(4, s.hVersion); out[8] = planes;
    out.set(z, 9);
    return out;
  },
  unpack(p, baseH): RasterSnapshot {
    const u = p as Uint8Array;
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    const n = dv.getUint32(0), hVersion = dv.getUint32(4), planes = u[8];
    const bytes = inflateRawSync(u.subarray(9));
    const L = n * planes;
    const D = new Float32Array(n), T = new Float32Array(n), S = new Float32Array(n);
    const H = planes === 4 ? new Float32Array(n) : baseH;
    const v = (k: number) => (bytes[k] << 8) | bytes[L + k];
    for (let i = 0; i < n; i++) {
      D[i] = v(i) / 2048;
      T[i] = D[i] * (v(n + i) / 65535);
      S[i] = v(2 * n + i) / 2048;
      if (planes === 4) H[i] = v(3 * n + i) / 21845 - 1;
    }
    return { D, T, S, H, hVersion };
  },
};

/** Write any RenderedImage-like (strips, diffs) to PNG. */
export function writeImage(img: RenderedImage, file: string): string {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodePng(img));
  return `${file} ${img.width}x${img.height}px`;
}

/** Write a Grid (e.g. a tonal target or an SDF luminance map) as a greyscale PNG for checking. */
export function writeGridPng(g: { w: number; h: number; data: Float32Array }, file: string, opts: { scale?: number; gamma?: number; invert?: boolean } = {}) {
  const png = new PNG({ width: g.w, height: g.h });
  const k = opts.scale ?? 1, gam = opts.gamma ?? 2.2;
  for (let i = 0; i < g.w * g.h; i++) {
    let v = Math.max(0, Math.min(1, g.data[i] * k));
    if (opts.invert) v = 1 - v;
    const s = Math.round(255 * Math.pow(v, 1 / gam));
    png.data[i * 4] = png.data[i * 4 + 1] = png.data[i * 4 + 2] = s;
    png.data[i * 4 + 3] = 255;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, PNG.sync.write(png));
}

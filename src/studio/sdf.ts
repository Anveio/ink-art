// A small signed-distance-field ray marcher for building tonal reference images.
//
// The "studio" panels are drawn from a lit 3D reference, the way a realist works from a photo:
// model the subject as an SDF, light it, and get a luminance map in page millimetres. `toneMap`
// then turns that map into pencil layers. Nothing here touches the paper; it only produces Grids.
import { Grid } from './tonal.ts';

export type V3 = [number, number, number];
export const v3 = (x: number, y: number, z: number): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => mul(a, 1 / (len(a) || 1));

// ---- primitives (all take local coordinates) ----
export const sdSphere = (x: number, y: number, z: number, r: number) => Math.hypot(x, y, z) - r;
export function sdRoundBox(x: number, y: number, z: number, bx: number, by: number, bz: number, r: number) {
  const qx = Math.abs(x) - bx + r, qy = Math.abs(y) - by + r, qz = Math.abs(z) - bz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
export function sdBox2(x: number, y: number, bx: number, by: number) {
  const qx = Math.abs(x) - bx, qy = Math.abs(y) - by;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
}
/** Distance from (x, y) to segment a-b in 2D. */
export function sdSeg2(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay;
  const h = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - dx * h, py - dy * h);
}
export function sdCapsule(x: number, y: number, z: number, a: V3, b: V3, r: number) {
  const px = x - a[0], py = y - a[1], pz = z - a[2], dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const h = Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz)));
  return Math.hypot(px - dx * h, py - dy * h, pz - dz * h) - r;
}
export const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
export const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

export interface Material {
  albedo: number;
  /** Specular strength and Blinn exponent. */
  spec: number;
  gloss: number;
  /** 0..1 mirror reflection of the environment (metal, glaze). */
  mirror?: number;
  /** Light wrapping round the terminator (soft, translucent materials like ivory, skin). */
  wrap?: number;
}

export interface Light {
  pos: V3;
  intensity: number;
  /** Soft-shadow hardness (higher = sharper). 0 = no shadow. */
  shadow?: number;
  /** Spotlight: aim point and cone half-angle in degrees (soft edge). */
  aim?: V3;
  cone?: number;
}

export interface SdfScene {
  /** Distance to the nearest surface. Set `scene.id` as a side effect to tag the material. */
  map(x: number, y: number, z: number): number;
  /** Material for the last id set by `map` (and the hit point, for textures). */
  material(id: number, p: V3): Material;
  /** Optional small surface bump (height) for texture, evaluated at the hit point. */
  bump?(id: number, p: V3): number;
  lights: Light[];
  ambient: number;
  /** Environment brightness by reflected direction (for mirror materials). */
  env?(d: V3): number;
  /** Background brightness when a ray hits nothing. */
  background?(d: V3): number;
  id: number;
}

export interface Camera { pos: V3; target: V3; /** Vertical field of view, degrees. */ fov: number }

export interface SdfRender {
  /** Linear luminance (1 = a white surface square to the key light). */
  lum: Grid;
  /** Material id per cell (-1 = background). */
  id: Grid;
  /** Distance from the camera. */
  depth: Grid;
}

/**
 * Ray-march the scene into Grids covering the page rectangle `rect` (mm) at `cell` mm.
 * The camera's image plane is stretched over the rectangle.
 */
export function renderSdf(scene: SdfScene, cam: Camera, rect: [number, number, number, number], cell: number, log?: (s: string) => void, rows?: [number, number]): SdfRender {
  const [rx, ry, rw, rh] = rect;
  const lum = Grid.over(rx, ry, rw, rh, cell), id = Grid.over(rx, ry, rw, rh, cell), depth = Grid.over(rx, ry, rw, rh, cell);
  const [j0, j1] = rows ?? [0, lum.h];
  const fwd = norm(sub(cam.target, cam.pos));
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const th = Math.tan((cam.fov * Math.PI) / 360);
  const aspect = rw / rh;
  const t0 = Date.now();
  for (let j = j0; j < j1; j++) {
    for (let i = 0; i < lum.w; i++) {
      const u = ((i * cell) / rw - 0.5) * 2 * th * aspect, v = -((j * cell) / rh - 0.5) * 2 * th;
      const d = norm([fwd[0] + right[0] * u + up[0] * v, fwd[1] + right[1] * u + up[1] * v, fwd[2] + right[2] * u + up[2] * v]);
      const k = j * lum.w + i;
      const hit = march(scene, cam.pos, d, 2000);
      if (hit < 0) {
        lum.data[k] = scene.background ? scene.background(d) : 0;
        id.data[k] = -1; depth.data[k] = 1e4;
        continue;
      }
      const p: V3 = [cam.pos[0] + d[0] * hit, cam.pos[1] + d[1] * hit, cam.pos[2] + d[2] * hit];
      scene.map(p[0], p[1], p[2]);
      const mid = scene.id;
      lum.data[k] = shadePoint(scene, p, d, mid);
      id.data[k] = mid; depth.data[k] = hit;
    }
    if (log && j % 100 === 0) log(`sdf row ${j}/${lum.h} ${Date.now() - t0}ms`);
  }
  return { lum, id, depth };
}

function march(scene: SdfScene, o: V3, d: V3, far: number): number {
  let t = 0;
  for (let s = 0; s < 400; s++) {
    const h = scene.map(o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t);
    if (h < 0.002 * (1 + t * 0.002)) return t;
    t += h * 0.9;
    if (t > far) return -1;
  }
  return t;
}

function normalAt(scene: SdfScene, p: V3, mid: number): V3 {
  const e = 0.01;
  const b = scene.bump ? (q: V3) => scene.bump!(mid, q) : () => 0;
  const f = (x: number, y: number, z: number) => scene.map(x, y, z) - b([x, y, z]);
  return norm([
    f(p[0] + e, p[1], p[2]) - f(p[0] - e, p[1], p[2]),
    f(p[0], p[1] + e, p[2]) - f(p[0], p[1] - e, p[2]),
    f(p[0], p[1], p[2] + e) - f(p[0], p[1], p[2] - e),
  ]);
}

export function softShadow(scene: SdfScene, o: V3, d: V3, maxT: number, k: number): number {
  // Improved soft shadows (estimates the closest approach between samples), small steps so thin
  // occluders like a plate rim don't band.
  let res = 1, t = 0.05, ph = 1e10;
  for (let s = 0; s < 400 && t < maxT; s++) {
    const h = scene.map(o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t);
    if (h < 0.0005) return 0;
    const y = (h * h) / (2 * ph), dd = Math.sqrt(Math.max(0, h * h - y * y));
    res = Math.min(res, (k * dd) / Math.max(0.001, t - y));
    ph = h;
    t += Math.max(0.02, Math.min(h, 2));
  }
  res = Math.max(0, Math.min(1, res));
  return res * res * (3 - 2 * res);
}

function ao(scene: SdfScene, p: V3, n: V3): number {
  let occ = 0, w = 1;
  for (let i = 1; i <= 6; i++) {
    const h = 0.4 * i * i;
    const d = scene.map(p[0] + n[0] * h, p[1] + n[1] * h, p[2] + n[2] * h);
    occ += (h - d) * w;
    w *= 0.6;
  }
  return Math.max(0, Math.min(1, 1 - occ * 0.06));
}

export function shadePoint(scene: SdfScene, p: V3, rd: V3, mid: number, bounce = 0): number {
  const n = normalAt(scene, p, mid);
  const m = scene.material(mid, p);
  const po: V3 = [p[0] + n[0] * 0.02, p[1] + n[1] * 0.02, p[2] + n[2] * 0.02];
  const occ = ao(scene, po, n);
  let diffuse = scene.ambient * occ * (0.6 + 0.4 * n[1]);
  let spec = 0;
  const v = mul(rd, -1);
  for (const L of scene.lights) {
    const toL = sub(L.pos, p);
    const dl = len(toL);
    const l = mul(toL, 1 / dl);
    const wrap = m.wrap ?? 0;
    const ndl = Math.max(0, (dot(n, l) + wrap) / (1 + wrap));
    if (ndl <= 0) continue;
    let cone = 1;
    if (L.aim && L.cone) {
      const ax = norm(sub(L.aim, L.pos));
      const c = dot(ax, mul(l, -1));
      const ca = Math.cos((L.cone * Math.PI) / 180);
      cone = Math.max(0, Math.min(1, (c - ca) / (1 - ca) * 3));
      cone = cone * cone * (3 - 2 * cone);
    }
    if (cone <= 0) continue;
    const sh = L.shadow ? softShadow(scene, po, l, dl, L.shadow) : 1;
    diffuse += L.intensity * ndl * sh * cone;
    if (m.spec > 0 && dot(n, l) > 0) {
      const hv = norm(add(l, v));
      spec += L.intensity * sh * cone * m.spec * Math.pow(Math.max(0, dot(n, hv)), m.gloss) * (m.gloss + 8) / 40;
    }
  }
  let out = m.albedo * diffuse + spec;
  if (m.mirror && scene.env) {
    const r = sub(rd, mul(n, 2 * dot(rd, n)));
    const fres = 0.6 + 0.4 * Math.pow(1 - Math.max(0, dot(n, v)), 3);
    // One real bounce: glaze and metal reflect the objects around them, not just the room.
    let refl = scene.env(r);
    if (bounce < 1) {
      const o: V3 = [p[0] + n[0] * 0.05, p[1] + n[1] * 0.05, p[2] + n[2] * 0.05];
      const t = march(scene, o, r, 400);
      if (t >= 0) {
        const q: V3 = [o[0] + r[0] * t, o[1] + r[1] * t, o[2] + r[2] * t];
        scene.map(q[0], q[1], q[2]);
        refl = shadePoint(scene, q, r, scene.id, bounce + 1);
      }
    }
    out = out * (1 - m.mirror) + refl * m.mirror * fres * occ;
  }
  return out;
}

/**
 * Photographic depth of field on a rendered reference: blur each cell by its circle of
 * confusion. `focus` is the in-focus distance from the camera, `aperture` scales the blur
 * (page mm of blur radius per unit of |1 - focus/depth|), `maxR` caps it (mm).
 */
export function depthOfField(r: SdfRender, focus: number, aperture: number, maxR = 1.6): SdfRender {
  const { lum, depth } = r;
  const w = lum.w, h = lum.h, cell = lum.cell;
  const coc = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) coc[i] = Math.min(maxR, aperture * Math.abs(1 - focus / Math.max(1, depth.data[i]))) / cell;
  const out = new Float32Array(w * h);
  const N = 96, R = maxR / cell;
  const off: [number, number][] = [];
  for (let k = 0; k < N; k++) {
    const rr = Math.sqrt((k + 0.5) / N) * R, a = k * 2.39996323;
    off.push([Math.round(Math.cos(a) * rr), Math.round(Math.sin(a) * rr)]);
  }
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k0 = j * w + i;
      const c0 = coc[k0];
      if (c0 < 0.5 && R < 0.5) { out[k0] = lum.data[k0]; continue; }
      let sum = lum.data[k0], wsum = 1;
      for (const [dx, dy] of off) {
        const x = i + dx, y = j + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const k = y * w + x, d = Math.hypot(dx, dy), c = coc[k];
        // A neighbour contributes if its own blur disc reaches us; in-focus foreground
        // stays crisp over a blurred background, and blurred foreground spills over.
        if (d > c + 0.5) continue;
        if (depth.data[k] > depth.data[k0] + 2 && d > c0 + 0.5) continue;
        const wt = 1 / Math.max(1, c * c);
        sum += lum.data[k] * wt; wsum += wt;
      }
      out[k0] = sum / wsum;
    }
  return { lum: new Grid(lum.x0, lum.y0, cell, w, h, out), id: r.id, depth };
}

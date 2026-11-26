// The studio reference for panel 3: a bitten mahjong tile (red dragon) on a dessert plate,
// a fork, crumbs, one hard spotlight. Units are real millimetres; y is up, the table is y = 0.
import { cachedSdf } from '../../src/studio/sdf-node.ts';
import { type Camera, type SdfRender, type SdfScene, type V3, sdBox2, sdRoundBox, sdSeg2, smax, smin } from '../../src/studio/sdf.ts';
import { vnoise2 } from '../../src/core/random.ts';

export const ID = { table: 0, plate: 1, ivory: 2, back: 3, paint: 4, fork: 5, bite: 6, crumb: 7 } as const;

const PLATE_TOP = 2.75;
// Tile: 26 wide, 20 tall, 34 long, lying face up, turned a little.
const TB = { x: 13, y: 10, z: 17 }, TILE_Y = PLATE_TOP + TB.y, TILE_ROT = (-24 * Math.PI) / 180;
const TX = -4, TZ = 4;
const cr = Math.cos(TILE_ROT), sr = Math.sin(TILE_ROT);

/** 中 carved into the face, in face coordinates (u across, w along the tile; w < 0 is the far end). */
function glyph(u: number, w: number) {
  const box = Math.abs(sdBox2(u, w + 0.5, 7.2, 5.2)) - 1.05;
  const bar = sdBox2(u, w, 1.05, 12.5);
  return Math.min(box, bar);
}

// Bite: a scalloped arc taken out of the near-right corner. Each tooth leaves a concave notch,
// and the bite face cups inward (upper and lower teeth meet in the middle).
const BITE_C = { u: 16.5, w: -20.5 }, BITE_R = 9.5;
function biteSdf(u: number, w: number, v: number) {
  const cup = 1.6 * (1 - Math.min(1, (v / TB.y) ** 2));
  const du = u - BITE_C.u, dw = w - BITE_C.w;
  const R = BITE_R + cup;
  const base = Math.hypot(du, dw) - R;
  // Teeth bite in from the top and the bottom, so the notches are deepest at the faces and
  // fade out toward the middle where the plastic snapped.
  const edge = Math.min(1, Math.abs(v) / TB.y);
  let sc = 1e9;
  for (let k = 0; k < 6; k++) {
    const a = Math.PI * 0.5 + 0.12 + k * 0.255;
    const cu = BITE_C.u + Math.cos(a) * R, cw = BITE_C.w + Math.sin(a) * R;
    sc = Math.min(sc, Math.hypot(u - cu, w - cw) - 2.3 * edge * edge);
  }
  return smin(base, sc, 0.9);
}

const CHIPS: [number, number, number, number][] = [[19, 24, 1.9, 0.4], [27, 15, 1.3, 1.9], [23, 10, 0.8, 0.9], [30, 28, 1.0, 2.6], [13, 31, 0.7, 1.2], [35, 21, 0.55, 0.2]];

// Fork lying on the plate in the foreground, tines pointing at the tile (dessert is served).
const FORK_TIP: V3 = [-17, 0, 24];
const FORK_DIR = (() => { const x = -42, z = 58, l = Math.hypot(x, z); return [x / l, z / l]; })();
function forkSdf(x: number, y: number, z: number) {
  const px = x - FORK_TIP[0], pz = z - FORK_TIP[2];
  const fx = px * FORK_DIR[0] + pz * FORK_DIR[1]; // 0 at the tine tips, growing toward the handle
  const fz = -px * FORK_DIR[1] + pz * FORK_DIR[0];
  const lift = fx < 22 ? 0.03 * fx : 0.66 + (fx - 22) * 0.055;
  const ly = y - (PLATE_TOP + 0.8 + Math.max(0, lift));
  // 2D outline in the fork's plane.
  let d2 = 1e9;
  for (let t = -1.5; t <= 1.5; t += 1) d2 = Math.min(d2, sdSeg2(fx, fz - t * 3.4, 0.9, 0, 23, 0) - 0.95);
  d2 = Math.min(d2, sdBox2(fx - 26, fz, 4.5, 4.6) - 2.2);
  d2 = smin(d2, taperedSeg(fx, fz, 30, 6.4, 47, 2.3), 2);
  d2 = smin(d2, taperedSeg(fx, fz, 47, 2.3, 150, 4.8), 3);
  // Extrude to 1.6 mm thick with rounded edges (that's where a fork catches the light).
  const wx = d2 + 0.45, wy = Math.abs(ly) - 0.35;
  return Math.min(Math.max(wx, wy), 0) + Math.hypot(Math.max(wx, 0), Math.max(wy, 0)) - 0.45;
}
/** Distance to a 2D segment whose radius changes from ra to rb along it (approximate). */
function taperedSeg(x: number, y: number, ax: number, ra: number, bx: number, rb: number) {
  const h = Math.max(0, Math.min(1, (x - ax) / (bx - ax)));
  return Math.hypot(x - (ax + (bx - ax) * h), y) - (ra + (rb - ra) * h);
}

export function stillLife(): SdfScene {
  const S: SdfScene = {
    id: 0,
    ambient: 0.16,
    lights: [
      { pos: [-170, 260, 40], intensity: 1.2, shadow: 14, aim: [0, 0, 8], cone: 17 },
      { pos: [160, 90, -260], intensity: 0.45, shadow: 10 },
      // Bounce off the white plate into whatever faces away from the key.
      { pos: [140, 12, 160], intensity: 0.22 },
    ],
    map(x, y, z) {
      let d = y; // table
      let id: number = ID.table;
      // Plate, revolved profile.
      const r = Math.hypot(x, z);
      {
        // Shell around a smooth dish profile: flat well, then a rising rim (Lipschitz-corrected).
        const sr = Math.max(0, Math.min(1, (r - 40) / 46));
        const f = 1.4 + 5.6 * sr * sr, df = r > 40 && r < 86 ? (2 * 5.6 * sr) / 46 : 0;
        const pd = smax(Math.abs(y - f) / Math.sqrt(1 + df * df) - 1.35, r - 86.5, 1.4);
        if (pd < d) { d = pd; id = ID.plate; }
      }
      // Tile in its own frame.
      const lx = x - TX, lz = z - TZ;
      const u = lx * cr - lz * sr, w = lx * sr + lz * cr, v = y - TILE_Y;
      {
        let td = sdRoundBox(u, v, w, TB.x, TB.y, TB.z, 2.2);
        // Bite.
        const b = biteSdf(u, -w, v);
        td = smax(td, -b, 0.6);
        // Engraving: 0.9 mm deep.
        const g = glyph(u, w);
        const groove = Math.max(g, -(v - (TB.y - 0.9)));
        td = smax(td, -groove, 0.25);
        if (td < d) {
          d = td;
          id = b < 0.35 ? ID.bite : v < -3.2 ? ID.back : g < 0.15 && v > TB.y - 1.2 ? ID.paint : ID.ivory;
        }
      }
      // Chips of tile: small rounded shards lying on the plate.
      for (const [cx, cz, cs, rot] of CHIPS) {
        const dx = x - cx, dz = z - cz, dy = y - PLATE_TOP - cs * 0.35;
        const c = Math.cos(rot), s2 = Math.sin(rot);
        const qx = dx * c - dz * s2, qz = dx * s2 + dz * c;
        const cd = sdRoundBox(qx + qz * 0.25, dy, qz, cs, cs * 0.38, cs * 0.7, cs * 0.25);
        if (cd < d) { d = cd; id = ID.crumb; }
      }
      // Fork.
      {
        const fd = forkSdf(x, y, z);
        if (fd < d) { d = fd; id = ID.fork; }
      }
      S.id = id;
      return d;
    },
    material(id, p) {
      switch (id) {
        case ID.table: {
          // Dark linen with a faint weave.
          const weave = 0.03 * (Math.sin(p[0] * 9) * Math.sin(p[2] * 9));
          return { albedo: 0.32 + weave + (vnoise2(p[0] * 0.05, p[2] * 0.05, 3) - 0.5) * 0.06, spec: 0.02, gloss: 6 };
        }
        case ID.plate: return { albedo: 0.74, spec: 0.9, gloss: 140, mirror: 0.14 };
        case ID.ivory: return { albedo: 0.9, spec: 0.7, gloss: 90, wrap: 0.25 };
        case ID.bite: return { albedo: 0.8, spec: 0.12, gloss: 20, wrap: 0.3 };
        case ID.back: return { albedo: 0.22, spec: 0.8, gloss: 110 };
        case ID.paint: return { albedo: 0.1, spec: 0.3, gloss: 40 };
        case ID.crumb: return { albedo: 0.9, spec: 0.3, gloss: 30, wrap: 0.4 };
        case ID.fork: return { albedo: 0.3, spec: 1.4, gloss: 120, mirror: 0.75 };
      }
      return { albedo: 0.5, spec: 0, gloss: 1 };
    },
    bump(id, p) {
      if (id === ID.bite) return (vnoise2(p[0] * 0.7 + p[1] * 0.5, p[2] * 0.7 - p[1] * 0.4, 11) - 0.5) * 0.5 + (vnoise2(p[1] * 2.5, p[0] * 2.5 + p[2], 12) - 0.5) * 0.08;
      if (id === ID.crumb) return (vnoise2(p[0] * 3, p[2] * 3, 13) - 0.5) * 0.04;
      return 0;
    },
    env(d) {
      // A dark studio with one big softbox up and to the left, and the table glow below.
      const soft = Math.max(0, d[1] * 0.6 - d[0] * 0.5 + d[2] * 0.1);
      return 0.12 + 0.25 * Math.max(0, d[1]) + 1.8 * Math.pow(soft, 4) + 0.35 * Math.max(0, -d[1]);
    },
    background: () => 0.02,
  };
  return S;
}

export const CAMERA: Camera = { pos: [16, 102, 122], target: [-4, 6, -8], fov: 36 };

/** Render (or load from cache) the reference over a page rectangle, on all cores. */
export function stillLifeReference(rect: [number, number, number, number], cell: number, log?: (s: string) => void): Promise<SdfRender> {
  return cachedSdf({ module: new URL(import.meta.url).pathname, factory: 'stillLife', camera: CAMERA, rect, cell }, new URL('../../out/cache', import.meta.url).pathname, log);
}
export type { V3 };

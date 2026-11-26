/**
 * Pencil grades. Values are tuned by eye (GUESS: not measured from real pencils).
 *
 *  reach    how deep into the paper tooth the lead reaches at full pressure (0..1).
 *           Hard leads skate on the peaks of the tooth; soft leads sink into the valleys.
 *  rate     graphite laid down per mm of stroke at full pressure.
 *  fill     how fast deposited graphite fills the tooth (dark areas get smoother).
 *  sheen    how burnished/shiny the deposit gets.
 *  tip      default tip radius in mm.
 *  tone     darkest reflectance this lead can reach (lower is darker).
 */
export interface Pencil {
  name: string;
  reach: number;
  rate: number;
  fill: number;
  sheen: number;
  tip: number;
  tone: number;
}

const p = (name: string, reach: number, rate: number, fill: number, sheen: number, tip: number, tone: number): Pencil => ({ name, reach, rate, fill, sheen, tip, tone });

export const PENCILS = {
  '4H': p('4H', 0.5, 0.6, 0.15, 0.35, 0.16, 0.42),
  '2H': p('2H', 0.56, 0.85, 0.2, 0.45, 0.18, 0.3),
  HB: p('HB', 0.66, 1.3, 0.3, 0.6, 0.22, 0.16),
  '2B': p('2B', 0.72, 1.8, 0.4, 0.75, 0.26, 0.1),
  '4B': p('4B', 0.8, 2.4, 0.5, 0.9, 0.32, 0.07),
  '6B': p('6B', 0.87, 3.0, 0.6, 1.0, 0.4, 0.05),
  '8B': p('8B', 0.93, 3.6, 0.7, 1.1, 0.5, 0.04),
} satisfies Record<string, Pencil>;

export type PencilName = keyof typeof PENCILS;

export function pencil(name: PencilName | Pencil): Pencil {
  return typeof name === 'string' ? PENCILS[name] : name;
}

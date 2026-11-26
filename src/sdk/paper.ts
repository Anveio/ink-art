/**
 * Paper surface. Sizes in mm. Tuned by eye (GUESS: not matched to any real paper scan yet).
 *
 *  tooth     size of the grain bumps
 *  contrast  how pronounced the tooth is in the height field (0..1)
 *  fibers    strength of long fibre streaks
 *  relief    physical bump height used for lighting, in mm
 *  cockle    large soft waviness of the sheet (photo finish only), in mm
 *  tint      linear RGB paper colour
 */
export interface Paper {
  name: string;
  tooth: number;
  contrast: number;
  fibers: number;
  relief: number;
  cockle: number;
  tint: [number, number, number];
}

export const PAPERS = {
  /** Everyday sketchbook paper: visible tooth that breaks up light strokes. */
  sketchbook: { name: 'sketchbook', tooth: 0.14, contrast: 0.85, fibers: 0.25, relief: 0.012, cockle: 0.25, tint: [0.88, 0.86, 0.81] },
  /** Smooth bristol: crisp lines, glossy darks. For the studio-quality panels. */
  bristol: { name: 'bristol', tooth: 0.1, contrast: 0.5, fibers: 0.1, relief: 0.006, cockle: 0.1, tint: [0.9, 0.89, 0.86] },
  /** Toothy drawing paper: grainy, dramatic texture. */
  coldpress: { name: 'coldpress', tooth: 0.3, contrast: 1, fibers: 0.35, relief: 0.022, cockle: 0.35, tint: [0.87, 0.85, 0.79] },
} satisfies Record<string, Paper>;

export type PaperName = keyof typeof PAPERS;

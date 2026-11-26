// Page layout for comic 01: a three-panel strip with a hand-lettered title.
export const PAGE = { width: 302, height: 142 } as const;
export type Rect = [number, number, number, number];
const top = 19, h = 115, w = 92, gut = 5, left = 8;
export const PANELS: Rect[] = [0, 1, 2].map((i) => [left + i * (w + gut), top, w, h] as Rect);

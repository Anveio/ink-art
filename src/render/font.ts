// 3x5 bitmap font for grid labels on preview renders.
const GLYPHS: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001111', '.': '000000000000010', '-': '000000111000000',
  ',': '000000000010100', ' ': '000000000000000', x: '000101010101000', y: '000101111001110',
};

export function drawText(img: { width: number; height: number; data: Uint8ClampedArray }, text: string, x: number, y: number, scale: number, rgb: [number, number, number]) {
  for (let c = 0; c < text.length; c++) {
    const g = GLYPHS[text[c]] ?? GLYPHS[' '];
    for (let gy = 0; gy < 5; gy++)
      for (let gx = 0; gx < 3; gx++) {
        if (g[gy * 3 + gx] !== '1') continue;
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) {
            const px = x + (c * 4 + gx) * scale + sx, py = y + gy * scale + sy;
            if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
            const i = (py * img.width + px) * 4;
            img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
          }
      }
  }
}

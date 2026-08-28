/**
 * Generates the PWA icons from one geometric mark — a receipt: three rules
 * and a heavier total below them. Paths only, no text, so rasterising never
 * depends on a font being installed.
 *
 * Run with `npm run icons`. Output lands in public/icons/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT = fileURLToPath(new URL('../public/icons/', import.meta.url));

const INK = '#000000';
const MARK = '#FFFFFF';

/** `scale` shrinks the mark for the maskable icon's safe zone. */
function svg(size, scale = 1) {
  const rules = [
    { y: 168, w: 288, h: 18 },
    { y: 216, w: 232, h: 18 },
    { y: 264, w: 176, h: 18 },
    { y: 330, w: 288, h: 34 },
  ];
  const bars = rules
    .map(({ y, w, h }) => `<rect x="112" y="${y}" width="${w}" height="${h}" />`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${INK}" />
  <g fill="${MARK}" transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    ${bars}
  </g>
</svg>`;
}

const targets = [
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  // Maskable: everything must survive a circular crop of the inner 80%.
  { file: 'icon-maskable-512.png', size: 512, scale: 0.62 },
  // iOS ignores the manifest icons and uses this one.
  { file: 'apple-touch-icon-180.png', size: 180, scale: 1 },
];

mkdirSync(OUT, { recursive: true });

for (const { file, size, scale } of targets) {
  const png = await sharp(Buffer.from(svg(size, scale)))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(join(OUT, file), png);
  console.log(`${file}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`);
}

// Keep the source mark around so the icons can be regenerated or tweaked.
writeFileSync(join(OUT, 'icon.svg'), svg(512, 1));
console.log('icon.svg');

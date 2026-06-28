// Rasterizes public/icon.svg into the PNG sizes the manifest + iOS need.
// Run once after editing the SVG: `npm run icons`. Output PNGs are committed,
// so CI does not need sharp at build time.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = new URL('../public/', import.meta.url);
const svg = readFileSync(new URL('icon.svg', dir));

const render = (size, name) =>
  sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(fileURLToPath(new URL(name, dir)));

await Promise.all([
  render(192, 'icon-192.png'),
  render(512, 'icon-512.png'),
  render(512, 'icon-maskable-512.png'),
  render(180, 'apple-touch-icon.png'),
]);

console.log('Generated icon-192, icon-512, icon-maskable-512, apple-touch-icon');

// Generates the placeholder app icons (a white barbell on blue) as PNGs, with no dependencies.
// Run: node tools/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [11, 87, 208];
const FG = [255, 255, 255];

function crc32(buf) {
  let c; const table = crc32.t || (crc32.t = Array.from({ length: 256 }, (_, n) => {
    c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
  }));
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, scale) {
  // barbell shapes in a 100x100 design space, centred; `scale` shrinks it for maskable safe zone
  const rects = [
    [14, 47, 86, 53],   // bar
    [22, 30, 30, 70],   // left outer plate
    [31, 36, 37, 64],   // left inner plate
    [70, 30, 78, 70],   // right outer plate
    [63, 36, 69, 64],   // right inner plate
  ];
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const u = 50 + ((x + 0.5) / size * 100 - 50) / scale;
      const v = 50 + ((y + 0.5) / size * 100 - 50) / scale;
      const on = rects.some(([x0, y0, x1, y1]) => u >= x0 && u < x1 && v >= y0 && v < y1);
      const c = on ? FG : BG;
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const dir = new URL('../icons/', import.meta.url);
writeFileSync(new URL('apple-touch-icon.png', dir), png(180, 1));
writeFileSync(new URL('icon-192.png', dir), png(192, 1));
writeFileSync(new URL('icon-512.png', dir), png(512, 1));
writeFileSync(new URL('icon-maskable-512.png', dir), png(512, 0.75));
console.log('icons written');

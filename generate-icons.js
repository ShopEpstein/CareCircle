// One-time icon generator — run with: node generate-icons.js
// Generates favicon.svg, apple-touch-icon.png, icon-192.png, icon-512.png
const zlib = require('zlib');
const fs   = require('fs');

// Brand colors
const SAGE   = [0x5C, 0x7A, 0x5F]; // #5C7A5F
const CREAM  = [0xFA, 0xF8, 0xF4]; // #FAF8F4
const GOLD   = [0xC8, 0xA9, 0x6E]; // #C8A96E

// ── CRC32 ─────────────────────────────────────────────────────────────────
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const lenBuf  = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf  = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// ── PNG builder ───────────────────────────────────────────────────────────
function makePNG(size, drawFn) {
  const pixels = new Uint8Array(size * size * 4);
  drawFn(pixels, size);

  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(size * 4 + 1);
    row[0] = 0; // filter None
    for (let x = 0; x < size; x++) {
      const si = (y * size + x) * 4;
      row[1 + x * 4]     = pixels[si];
      row[1 + x * 4 + 1] = pixels[si + 1];
      row[1 + x * 4 + 2] = pixels[si + 2];
      row[1 + x * 4 + 3] = pixels[si + 3];
    }
    rows.push(row);
  }
  const compressed = zlib.deflateSync(Buffer.concat(rows), { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ── Draw function: sage circle + cream "C" ring + gold dot ───────────────
function drawIcon(pixels, size) {
  const cx = size / 2, cy = size / 2;
  const outerR  = size * 0.46;   // sage background circle
  const ringOutR = size * 0.30;  // cream ring outer
  const ringInR  = size * 0.20;  // cream ring inner (makes a C-like arc)
  const dotR     = size * 0.08;  // gold center dot

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let r = 0, g = 0, b = 0, a = 0;

      if (dist <= outerR) {
        // Sage background
        [r, g, b, a] = [...SAGE, 255];

        if (dist <= ringOutR && dist >= ringInR) {
          // Cream ring — open on the right to form a "C"
          const angle = Math.atan2(dy, dx) * 180 / Math.PI; // -180 to 180
          // Open gap: roughly -30° to 30° (right side)
          if (angle < -35 || angle > 35) {
            [r, g, b, a] = [...CREAM, 255];
          }
        }

        if (dist <= dotR) {
          // Gold center dot
          [r, g, b, a] = [...GOLD, 255];
        }
      }

      // Smooth edge on outer circle
      const edge = outerR - dist;
      if (edge >= 0 && edge < 1.5) {
        a = Math.round(255 * (edge / 1.5));
      }

      pixels[idx]     = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = a;
    }
  }
}

// ── Generate PNGs ─────────────────────────────────────────────────────────
[
  ['apple-touch-icon.png', 180],
  ['icon-192.png',         192],
  ['icon-512.png',         512],
].forEach(([name, size]) => {
  fs.writeFileSync(`/home/user/CareCircle/${name}`, makePNG(size, drawIcon));
  console.log(`✓ ${name} (${size}x${size})`);
});

// ── SVG favicon ───────────────────────────────────────────────────────────
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="46" fill="#5C7A5F"/>
  <path d="M50 20 A30 30 0 1 0 50 80 A30 30 0 0 0 50 20 Z
           M50 32 A18 18 0 1 1 50 68 A18 18 0 0 1 50 32 Z"
        fill="#FAF8F4" clip-path="url(#clip)"/>
  <clipPath id="clip">
    <rect x="0" y="0" width="68" height="100"/>
  </clipPath>
  <circle cx="50" cy="50" r="8" fill="#C8A96E"/>
</svg>`;
fs.writeFileSync('/home/user/CareCircle/favicon.svg', svg);
console.log('✓ favicon.svg');

console.log('\nDone. All icons generated.');

// Regenerate PNG icons using CareCircle guardian angel brand colors
// Teal shield shape with gold halo accent — matches logo-icon.svg
const zlib = require('zlib');
const fs   = require('fs');

// Brand colors from logo
const TEAL_DARK  = [0x1E, 0x68, 0x78]; // #1E6878
const TEAL_MID   = [0x5E, 0x9E, 0xAA]; // #5E9EAA
const TEAL_LIGHT = [0x9E, 0xCD, 0xD6]; // #9ECDD6
const GOLD       = [0xF2, 0xCC, 0x40]; // #F2CC40
const WHITE      = [0xFF, 0xFF, 0xFF];
const TRANSPARENT = [0, 0, 0, 0];

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
function pngChunk(type, data) {
  const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}
function makePNG(size, drawFn) {
  const pixels = new Uint8Array(size * size * 4);
  drawFn(pixels, size);
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(size * 4 + 1);
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const si = (y * size + x) * 4;
      row[1 + x*4] = pixels[si]; row[1 + x*4+1] = pixels[si+1];
      row[1 + x*4+2] = pixels[si+2]; row[1 + x*4+3] = pixels[si+3];
    }
    rows.push(row);
  }
  const compressed = zlib.deflateSync(Buffer.concat(rows), { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function setPixel(pixels, size, x, y, r, g, b, a) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const i = (y * size + x) * 4;
  pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = a;
}

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function tealAt(t) { // t: 0=light, 1=dark
  if (t < 0.5) return [lerp(TEAL_LIGHT[0],TEAL_MID[0],t*2), lerp(TEAL_LIGHT[1],TEAL_MID[1],t*2), lerp(TEAL_LIGHT[2],TEAL_MID[2],t*2)];
  return [lerp(TEAL_MID[0],TEAL_DARK[0],(t-0.5)*2), lerp(TEAL_MID[1],TEAL_DARK[1],(t-0.5)*2), lerp(TEAL_MID[2],TEAL_DARK[2],(t-0.5)*2)];
}

function drawGuardian(pixels, size) {
  const s = size / 100; // scale factor (design is in 100-unit space)
  const cx = size * 0.5, cy = size * 0.5;

  // Background: rounded square (for maskable), transparent outside circle
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - cx) / (size * 0.5); // -1 to 1
      const ny = (y - cy) / (size * 0.5);
      const dist = Math.sqrt(nx*nx + ny*ny);
      if (dist > 1.0) continue; // outside circle = transparent

      // Teal gradient background
      const grad = (ny + 1) / 2; // 0 top, 1 bottom
      const [r, g, b] = tealAt(grad);
      const i = (y * size + x) * 4;
      pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = 255;
    }
  }

  // Shield outline — lighter teal
  const shieldPts = (scale) => {
    // Simplified shield path from logo: top-center pointed, curved sides, pointed bottom
    const pts = [];
    const sw = scale * 0.55, sh = scale * 0.75;
    const ox = cx, oy = cy - scale * 0.12;
    for (let t = 0; t <= 1; t += 0.005) {
      let sx, sy;
      if (t < 0.25) { // left side down
        const tt = t / 0.25;
        sx = ox - sw * (0.5 + 0.15 * Math.sin(tt * Math.PI));
        sy = oy - sh * 0.5 + sh * tt * 0.6;
      } else if (t < 0.5) { // bottom-left to point
        const tt = (t - 0.25) / 0.25;
        sx = ox - sw * (0.5 - 0.5 * tt);
        sy = oy + sh * 0.1 + sh * 0.25 * tt;
      } else if (t < 0.75) { // point to bottom-right
        const tt = (t - 0.5) / 0.25;
        sx = ox + sw * 0.5 * tt;
        sy = oy + sh * 0.35 - sh * 0.25 * tt;
      } else { // right side up
        const tt = (t - 0.75) / 0.25;
        sx = ox + sw * (0.5 + 0.15 * Math.sin((1-tt) * Math.PI));
        sy = oy + sh * 0.1 - sh * 0.6 * tt;
      }
      pts.push([Math.round(sx), Math.round(sy)]);
    }
    return pts;
  };

  // Draw shield fill
  const shieldPath = shieldPts(size);
  // Rasterize shield by scanline
  for (let y = 0; y < size; y++) {
    const intersections = [];
    for (let pi = 0; pi < shieldPath.length; pi++) {
      const [x1, y1] = shieldPath[pi];
      const [x2, y2] = shieldPath[(pi+1) % shieldPath.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        intersections.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1));
      }
    }
    intersections.sort((a,b) => a-b);
    for (let ii = 0; ii < intersections.length - 1; ii += 2) {
      for (let x = Math.round(intersections[ii]); x <= Math.round(intersections[ii+1]); x++) {
        if (x < 0 || x >= size) continue;
        const idx = (y * size + x) * 4;
        if (pixels[idx+3] === 0) continue;
        // Semi-transparent white overlay for shield
        const a = 0.15;
        pixels[idx]   = Math.round(pixels[idx]   * (1-a) + 255 * a);
        pixels[idx+1] = Math.round(pixels[idx+1] * (1-a) + 255 * a);
        pixels[idx+2] = Math.round(pixels[idx+2] * (1-a) + 255 * a);
      }
    }
  }

  // Gold halo ring — top right quadrant
  const hcx = Math.round(cx + size * 0.13), hcy = Math.round(cy - size * 0.19);
  const hrx = size * 0.19, hry = size * 0.075, hthick = Math.max(2, size * 0.045);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - hcx) / hrx, ny = (y - hcy) / hry;
      const d = Math.sqrt(nx*nx + ny*ny);
      if (Math.abs(d - 1) < hthick / Math.min(hrx, hry)) {
        const idx = (y * size + x) * 4;
        if (pixels[idx+3] === 0) continue;
        pixels[idx] = GOLD[0]; pixels[idx+1] = GOLD[1]; pixels[idx+2] = GOLD[2];
      }
    }
  }

  // Wing — sweeping arc left side (simplified)
  const wingPts = [
    [cx - size*0.02, cy + size*0.05],
    [cx - size*0.18, cy - size*0.05],
    [cx - size*0.32, cy - size*0.20],
    [cx - size*0.18, cy - size*0.10],
    [cx - size*0.10, cy - size*0.01],
    [cx - size*0.03, cy + size*0.02],
  ].map(([x,y]) => [Math.round(x), Math.round(y)]);

  for (let y = 0; y < size; y++) {
    const ints = [];
    for (let pi = 0; pi < wingPts.length; pi++) {
      const [x1,y1] = wingPts[pi], [x2,y2] = wingPts[(pi+1)%wingPts.length];
      if ((y1<=y&&y2>y)||(y2<=y&&y1>y)) ints.push(x1+(y-y1)/(y2-y1)*(x2-x1));
    }
    ints.sort((a,b)=>a-b);
    for (let ii=0;ii<ints.length-1;ii+=2) {
      for (let x=Math.round(ints[ii]);x<=Math.round(ints[ii+1]);x++) {
        if (x<0||x>=size) continue;
        const idx=(y*size+x)*4;
        if (pixels[idx+3]===0) continue;
        pixels[idx]=TEAL_LIGHT[0]; pixels[idx+1]=TEAL_LIGHT[1]; pixels[idx+2]=TEAL_LIGHT[2];
      }
    }
  }

  // Dove/bird body — center right
  const bx = cx + size*0.08, by = cy + size*0.02, br = size*0.12;
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const dx=x-bx, dy=y-by;
    if (dx*dx/(br*br*1.4)+dy*dy/(br*br*0.7)<1) {
      const idx=(y*size+x)*4;
      if (pixels[idx+3]===0) continue;
      pixels[idx]=WHITE[0]; pixels[idx+1]=WHITE[1]; pixels[idx+2]=WHITE[2];
    }
  }

  // Smooth circle edge
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const nx=(x-cx)/(size*0.5), ny=(y-cy)/(size*0.5);
    const dist=Math.sqrt(nx*nx+ny*ny);
    if (dist>0.9 && dist<=1.0) {
      const idx=(y*size+x)*4;
      pixels[idx+3]=Math.round(255*(1.0-dist)/0.1);
    }
  }
}

[['apple-touch-icon.png',180],['icon-192.png',192],['icon-512.png',512]].forEach(([name,size])=>{
  fs.writeFileSync(`/home/user/CareCircle/${name}`, makePNG(size, drawGuardian));
  console.log(`✓ ${name} (${size}x${size})`);
});
console.log('Done.');

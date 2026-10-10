// Painted pieces for the three disasters (the black hole, the Great Grin and the
// Bloom), shared by the 2D sky painters (windows, the end-game stage) and the 3D
// scenery under the ship (doom.js). Everything is drawn with canvas code: no image
// files. Results are cached, so each texture is painted once.

// ---------- small helpers ----------
function seededRandom(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// ---------- value noise (fractal), used for gas, rock and cracks ----------
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, seed = 1, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * f, y * f, seed + i * 17) * amp;
    f *= 2;
    amp *= 0.5;
  }
  return sum;
}

// ---------- soft glows ----------
// A round glow: inner colour fading to nothing.
export function glowCanvas(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,0.25)', size = 128) {
  return cached(`glow|${inner}|${mid}|${size}`, () => {
    const c = makeCanvas(size);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.35, mid);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  });
}

// A thin bright ring with a halo, for the black hole's photon ring.
export function ringCanvas(size = 512, color = '255,205,140') {
  return cached(`ring|${size}|${color}`, () => {
    const c = makeCanvas(size);
    const g = c.getContext('2d');
    const m = size / 2;
    const grad = g.createRadialGradient(m, m, m * 0.5, m, m, m);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, `rgba(${color},0.0)`);
    grad.addColorStop(0.62, `rgba(${color},0.95)`);
    grad.addColorStop(0.68, `rgba(255,248,235,1)`);
    grad.addColorStop(0.74, `rgba(${color},0.5)`);
    grad.addColorStop(0.9, `rgba(${color},0.08)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  });
}

// The black hole's halo: the far side of the disk, bent by gravity over the top and under
// the bottom of the hole, brightest there and on the side moving towards us, with a thin
// white photon ring right against the horizon. The hole's radius is 0.5 / 2.1 of the canvas.
export function lensCanvas(size = 512) {
  return cached(`lens|${size}`, () => {
    const c = makeCanvas(size);
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const m = size / 2;
    // colour and opacity along the radius (1 = the edge of the canvas)
    const stops = [
      [0.46, 255, 245, 220, 0],
      [0.484, 255, 248, 230, 1],
      [0.535, 255, 215, 140, 0.95],
      [0.64, 255, 150, 60, 0.55],
      [0.8, 190, 60, 40, 0.18],
      [0.95, 80, 10, 60, 0],
    ];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x - m) / m;
        const dy = (y - m) / m;
        const rn = Math.hypot(dx, dy) / 1;
        if (rn < stops[0][0] || rn > stops[stops.length - 1][0]) continue;
        let k = 1;
        while (k < stops.length - 1 && rn > stops[k][0]) k++;
        const lo = stops[k - 1];
        const hi = stops[k];
        const u = (rn - lo[0]) / (hi[0] - lo[0]);
        const ang = Math.atan2(dy, dx);
        // brighter above and below than at the sides, and brighter on the left (towards us)
        const vertical = Math.abs(Math.sin(ang));
        const left = 0.5 - 0.5 * Math.cos(ang);
        const bright = Math.min(1, 0.22 + 0.55 * vertical + 0.23 * left * (0.4 + vertical));
        const i = (y * size + x) * 4;
        img.data[i] = lo[1] + (hi[1] - lo[1]) * u;
        img.data[i + 1] = lo[2] + (hi[2] - lo[2]) * u;
        img.data[i + 2] = lo[3] + (hi[3] - lo[3]) * u;
        img.data[i + 3] = (lo[4] + (hi[4] - lo[4]) * u) * bright * 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  });
}

// ---------- gas clouds (the Bloom) ----------
// A cloud with a transparent edge. tint is [r, g, b] (0-255). Styles:
//   'haze'  a soft, wispy glow
//   'smoke' dense, billowing, dark smoke with a defined edge (it hides what is behind it)
//   'veins' thin, bright, branching veins, like electricity inside the cloud
export function cloudCanvas(seed = 1, tint = [150, 255, 90], size = 256, style = 'haze') {
  return cached(`cloud|${seed}|${tint}|${size}|${style}`, () => {
    const c = makeCanvas(size);
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const m = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x - m) / m;
        const dy = (y - m) / m;
        const d = Math.hypot(dx, dy);
        // swirl the sample point so the cloud has arms, not blobs
        const a = Math.atan2(dy, dx) + d * 2.2;
        const sx = Math.cos(a) * d * 3 + 4;
        const sy = Math.sin(a) * d * 3 + 4;
        const n = fbm(sx, sy, seed, 5);
        const mask = Math.max(0, 1 - d * d * 1.05);
        let alpha;
        let k = 0.55 + n * 0.9;
        if (style === 'smoke') {
          const big = fbm(sx * 0.6 + 9, sy * 0.6 + 9, seed + 3, 4);
          alpha = Math.min(1, Math.max(0, (n * 0.6 + big * 0.7 - 0.42) * 4.2)) * Math.pow(mask, 0.6);
          k = 0.25 + n * 1.1; // lit from within on one side
        } else if (style === 'veins') {
          const ridge = 1 - Math.abs(2 * fbm(sx * 1.3 + 4, sy * 1.3 + 4, seed + 7, 4) - 1);
          alpha = Math.min(1, Math.pow(ridge, 9) * mask * 1.6);
          k = 1.1;
        } else {
          const wisp = Math.max(0, n * 1.7 - 0.5);
          alpha = Math.min(1, wisp * mask * 2.3);
        }
        const i = (y * size + x) * 4;
        img.data[i] = Math.min(255, tint[0] * k);
        img.data[i + 1] = Math.min(255, tint[1] * k);
        img.data[i + 2] = Math.min(255, tint[2] * k);
        img.data[i + 3] = alpha * 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  });
}

export const CLOUD_TINTS = [[130, 255, 70], [60, 235, 190], [130, 255, 70], [190, 90, 255]]; // the bright, glowing gas (mostly sickly green)
export const CLOUD_DARK = [[30, 95, 35], [22, 72, 52], [55, 22, 90]]; // the heavy, murky body of the cloud

// The Bloom's eye: a glowing iris with a slit pupil, drawn on a transparent canvas.
export function eyeCanvas(size = 256) {
  return cached(`eye|${size}`, () => {
    const c = makeCanvas(size);
    const g = c.getContext('2d');
    const m = size / 2;
    const halo = g.createRadialGradient(m, m, size * 0.1, m, m, m);
    halo.addColorStop(0, 'rgba(255,240,120,0.9)');
    halo.addColorStop(0.5, 'rgba(160,255,80,0.3)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, size, size);
    const iris = g.createRadialGradient(m, m, size * 0.04, m, m, size * 0.3);
    iris.addColorStop(0, '#fff7a0');
    iris.addColorStop(0.5, '#a6ff3a');
    iris.addColorStop(1, '#2a7a1a');
    g.fillStyle = iris;
    g.beginPath();
    g.ellipse(m, m, size * 0.3, size * 0.3, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(10,50,10,0.8)';
    g.lineWidth = size * 0.02;
    g.stroke();
    g.fillStyle = '#04100a';
    g.beginPath();
    g.ellipse(m, m, size * 0.045, size * 0.25, 0, 0, Math.PI * 2);
    g.fill();
    return c;
  });
}

// ---------- the Great Grin: a scary clown planet ----------
// The face is drawn on a square canvas that is mapped straight (top-down) onto a
// cap of the planet. Faces are in units of R, the radius of the canvas circle.
// Face parts (positions are in R units, y down).
export const CAP_RADIUS = 0.84; // how much of the planet the face covers (the planet's radius is 1)
export const FACE = {
  eye: { x: 0.37, y: -0.2, w: 0.2, h: 0.26 },
  nose: { x: 0, y: 0.08, r: 0.1 },
  mouth: { left: -0.84, right: 0.84, y: 0.12, upperC: 0.42, lowerC: 1.45 },
};

// the grin: a crescent from cheek to cheek (upper lip sagging, lower lip a deep bowl)
const lipY = (u, control) => FACE.mouth.y + 2 * u * (1 - u) * (control - FACE.mouth.y);

function mouthPath(g, c, R, grow = 0) {
  const M = FACE.mouth;
  g.beginPath();
  g.moveTo(c + M.left * R, c + M.y * R);
  g.quadraticCurveTo(c, c + (M.upperC - grow) * R, c + M.right * R, c + M.y * R);
  g.quadraticCurveTo(c, c + (M.lowerC + grow) * R, c + M.left * R, c + M.y * R);
  g.closePath();
}

// jagged cracks that spread out from the eyes and the mouth
function crackLines(rnd, R) {
  const lines = [];
  const starts = [[-0.37, -0.2], [0.37, -0.2], [-0.84, 0.2], [0.84, 0.2], [0, -0.55], [-0.6, 0.45], [0.6, 0.45], [0, 0.08]];
  for (const [sx, sy] of starts) {
    for (let k = 0; k < 2; k++) {
      let x = sx;
      let y = sy;
      let a = Math.atan2(sy, sx || 0.001) + (rnd() - 0.5) * 2.2 + (k ? 0.8 : -0.8);
      const pts = [[x, y]];
      for (let s = 0; s < 6; s++) {
        a += (rnd() - 0.5) * 1.1;
        const len = 0.07 + rnd() * 0.1;
        x += Math.cos(a) * len;
        y += Math.sin(a) * len;
        pts.push([x, y]);
        if (Math.hypot(x, y) > 0.98) break;
      }
      lines.push(pts);
    }
  }
  return lines;
}

function featherEdge(g, size) {
  // fade the very edge of the cap so it melts into the planet
  const m = size / 2;
  g.save();
  g.globalCompositeOperation = 'destination-in';
  const grad = g.createRadialGradient(m, m, m * 0.82, m, m, m);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  g.restore();
}

// the pale, cracked, cratered face with its hollow eyes, rotten nose and endless grin
export function grinFaceCanvas(size = 1024) {
  return cached(`grinface|${size}`, () => {
    const c = makeCanvas(size);
    const g = c.getContext('2d');
    const m = size / 2;
    const R = m * 0.96;
    const rnd = seededRandom(31);

    // bone-pale skin, shaded darker towards the edges like a sphere
    const skin = g.createRadialGradient(m - R * 0.15, m - R * 0.2, R * 0.05, m, m, R * 1.05);
    skin.addColorStop(0, '#f1ebe4');
    skin.addColorStop(0.55, '#cfc4c6');
    skin.addColorStop(1, '#5d4f66');
    g.fillStyle = skin;
    g.beginPath();
    g.arc(m, m, R * 1.02, 0, Math.PI * 2);
    g.fill();
    // mottled grime (clouds of noise, multiplied in)
    const grime = makeCanvas(256);
    const gg = grime.getContext('2d');
    const gi = gg.createImageData(256, 256);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const n = fbm(x / 40, y / 40, 9, 5);
        const v = 150 + n * 150;
        const i = (y * 256 + x) * 4;
        gi.data[i] = v;
        gi.data[i + 1] = v * 0.93;
        gi.data[i + 2] = v * 0.97;
        gi.data[i + 3] = 255;
      }
    }
    gg.putImageData(gi, 0, 0);
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.65;
    g.beginPath();
    g.arc(m, m, R * 1.02, 0, Math.PI * 2);
    g.clip();
    g.drawImage(grime, 0, 0, size, size);
    g.restore();

    // craters
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 0.25 + rnd() * 0.65;
      const x = m + Math.cos(a) * d * R;
      const y = m + Math.sin(a) * d * R;
      if (Math.hypot(Math.cos(a) * d - 0, Math.sin(a) * d - 0.2) < 0.2) continue;
      const r = R * (0.03 + rnd() * 0.06);
      const cr = g.createRadialGradient(x, y, r * 0.1, x, y, r);
      cr.addColorStop(0, 'rgba(60,40,60,0.55)');
      cr.addColorStop(0.8, 'rgba(60,40,60,0.2)');
      cr.addColorStop(1, 'rgba(255,255,255,0.35)');
      g.fillStyle = cr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }

    // dark cracks (the glowing core of each crack is on the ember layer)
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const pts of crackLines(seededRandom(77), R)) {
      g.strokeStyle = 'rgba(30,10,24,0.85)';
      g.lineWidth = R * 0.012;
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(m + x * R, m + y * R) : g.moveTo(m + x * R, m + y * R)));
      g.stroke();
    }

    // black diamond "tears" over and under each eye, stretching down to the mouth
    g.fillStyle = '#12060f';
    for (const s of [-1, 1]) {
      const ex = m + s * FACE.eye.x * R;
      const ey = m + FACE.eye.y * R;
      g.beginPath();
      g.moveTo(ex, ey - R * 0.42);
      g.lineTo(ex + s * R * 0.09, ey - R * 0.25);
      g.lineTo(ex, ey - R * 0.12);
      g.lineTo(ex - s * R * 0.09, ey - R * 0.25);
      g.closePath();
      g.fill();
      // the long, tapering drip
      g.beginPath();
      g.moveTo(ex + s * R * 0.05, ey + R * 0.14);
      g.quadraticCurveTo(ex + s * R * 0.22, ey + R * 0.45, ex + s * R * 0.4, ey + R * 0.6);
      g.quadraticCurveTo(ex + s * R * 0.2, ey + R * 0.34, ex - s * R * 0.04, ey + R * 0.14);
      g.closePath();
      g.fill();
    }

    // hollow eye sockets with a bloody rim
    for (const s of [-1, 1]) {
      const ex = m + s * FACE.eye.x * R;
      const ey = m + FACE.eye.y * R;
      g.save();
      g.translate(ex, ey);
      g.rotate(s * 0.18);
      const rim = g.createRadialGradient(0, 0, R * 0.08, 0, 0, R * 0.32);
      rim.addColorStop(0, '#000');
      rim.addColorStop(0.7, '#1a0408');
      rim.addColorStop(1, 'rgba(120,10,30,0.8)');
      g.fillStyle = rim;
      g.beginPath();
      g.ellipse(0, 0, R * FACE.eye.w * 1.15, R * FACE.eye.h * 1.1, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    // the rotten nose: a dark red crater
    const nr = R * FACE.nose.r;
    const nose = g.createRadialGradient(m - nr * 0.3, m + R * FACE.nose.y - nr * 0.3, nr * 0.1, m, m + R * FACE.nose.y, nr * 1.2);
    nose.addColorStop(0, '#b01830');
    nose.addColorStop(0.7, '#4a0814');
    nose.addColorStop(1, '#1a0408');
    g.fillStyle = nose;
    g.beginPath();
    g.arc(m, m + R * FACE.nose.y, nr, 0, Math.PI * 2);
    g.fill();

    // the mouth: a cavity stretched almost to the ears, with two rows of fangs
    g.save();
    mouthPath(g, m, R);
    g.clip();
    const cavity = g.createRadialGradient(m, m + R * 0.55, R * 0.05, m, m + R * 0.55, R * 0.9);
    cavity.addColorStop(0, '#5a0a12');
    cavity.addColorStop(0.55, '#1e0408');
    cavity.addColorStop(1, '#000');
    g.fillStyle = cavity;
    g.fillRect(0, 0, size, size);
    const trng = seededRandom(5);
    const M = FACE.mouth;
    // two rows of fangs: the top ones hang from the upper lip, the bottom ones rise from the lower lip
    const teethRow = (top) => {
      const n = 15;
      for (let i = 0; i < n; i++) {
        const u = (i + (top ? 0.5 : 1)) / (top ? n : n + 1);
        if (u <= 0.02 || u >= 0.98) continue;
        const x = m + (M.left + (M.right - M.left) * u) * R;
        const y = m + lipY(u, top ? M.upperC : M.lowerC) * R;
        const edge = Math.sqrt(Math.sin(u * Math.PI));
        const h = R * (0.04 + 0.1 * edge) * (0.6 + trng() * 0.7);
        const w = R * 0.034;
        g.fillStyle = trng() < 0.15 ? '#a99c80' : '#efe6c8';
        g.beginPath();
        g.moveTo(x - w, y);
        g.lineTo(x + w, y);
        g.lineTo(x + (trng() - 0.5) * w, y + (top ? h : -h));
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(40,10,10,0.6)';
        g.lineWidth = 1.5;
        g.stroke();
      }
    };
    teethRow(true);
    teethRow(false);
    g.restore();
    // the lips and the cuts up the cheeks
    g.strokeStyle = '#120408';
    g.lineWidth = R * 0.03;
    mouthPath(g, m, R);
    g.stroke();
    g.strokeStyle = '#7a0c1c';
    g.lineWidth = R * 0.012;
    mouthPath(g, m, R, 0.004);
    g.stroke();
    g.strokeStyle = '#120408';
    g.lineWidth = R * 0.028;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(m + s * M.right * R * 0.98, m + M.y * R);
      g.quadraticCurveTo(m + s * R * 0.96, m + (M.y - 0.12) * R, m + s * R * 0.94, m + (M.y - 0.28) * R);
      g.stroke();
    }
    featherEdge(g, size);
    return c;
  });
}

// glowing parts that pulse and flicker over the face: the mouth's fire, and the eyes,
// nose and cracks, which glow like embers. { maw, ember } (transparent canvases)
export function grinGlowCanvases(size = 1024) {
  return cached(`gringlow|${size}`, () => {
    const maw = makeCanvas(size);
    const mg = maw.getContext('2d');
    const m = size / 2;
    const R = m * 0.96;
    mg.save();
    mouthPath(mg, m, R);
    mg.clip();
    const fire = mg.createRadialGradient(m, m + R * 0.55, R * 0.02, m, m + R * 0.55, R * 0.85);
    fire.addColorStop(0, 'rgba(255,200,90,0.9)');
    fire.addColorStop(0.3, 'rgba(255,70,30,0.7)');
    fire.addColorStop(0.7, 'rgba(160,10,20,0.35)');
    fire.addColorStop(1, 'rgba(0,0,0,0)');
    mg.fillStyle = fire;
    mg.fillRect(0, 0, size, size);
    mg.restore();

    const ember = makeCanvas(size);
    const eg = ember.getContext('2d');
    for (const s of [-1, 1]) {
      const ex = m + s * FACE.eye.x * R;
      const ey = m + FACE.eye.y * R;
      const iris = eg.createRadialGradient(ex, ey, R * 0.01, ex, ey, R * 0.22);
      iris.addColorStop(0, 'rgba(255,230,120,1)');
      iris.addColorStop(0.35, 'rgba(255,60,30,0.95)');
      iris.addColorStop(1, 'rgba(120,0,10,0)');
      eg.fillStyle = iris;
      eg.beginPath();
      eg.ellipse(ex, ey, R * 0.2, R * 0.23, s * 0.18, 0, Math.PI * 2);
      eg.fill();
    }
    const nose = eg.createRadialGradient(m, m + R * FACE.nose.y, 0, m, m + R * FACE.nose.y, R * 0.2);
    nose.addColorStop(0, 'rgba(255,90,60,0.9)');
    nose.addColorStop(1, 'rgba(160,0,20,0)');
    eg.fillStyle = nose;
    eg.beginPath();
    eg.arc(m, m + R * FACE.nose.y, R * 0.2, 0, Math.PI * 2);
    eg.fill();
    eg.lineCap = 'round';
    eg.lineJoin = 'round';
    for (const pts of crackLines(seededRandom(77), R)) {
      eg.strokeStyle = 'rgba(255,70,30,0.8)';
      eg.lineWidth = R * 0.008;
      eg.shadowColor = 'rgba(255,60,20,1)';
      eg.shadowBlur = R * 0.02;
      eg.beginPath();
      pts.forEach(([x, y], i) => (i ? eg.lineTo(m + x * R, m + y * R) : eg.moveTo(m + x * R, m + y * R)));
      eg.stroke();
    }
    return { maw, ember };
  });
}

// the planet's body: dark violet rock with bands and craters (equirectangular)
export function planetCanvas(size = 512) {
  return cached(`planet|${size}`, () => {
    const c = makeCanvas(size, size / 2);
    const g = c.getContext('2d');
    const img = g.createImageData(size, size / 2);
    for (let y = 0; y < size / 2; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm(x / 28, y / 20, 3, 5);
        const band = Math.sin(y / 14 + n * 6) * 0.5 + 0.5;
        const v = 0.25 + n * 0.6 + band * 0.15;
        const i = (y * size + x) * 4;
        img.data[i] = 70 * v + 25;
        img.data[i + 1] = 45 * v + 14;
        img.data[i + 2] = 85 * v + 32;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // a few glowing fissures
    g.strokeStyle = 'rgba(255,60,30,0.5)';
    g.lineWidth = 1.5;
    const rnd = seededRandom(12);
    for (let i = 0; i < 9; i++) {
      let x = rnd() * size;
      let y = rnd() * (size / 2);
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 14; k++) {
        x += (rnd() - 0.3) * 24;
        y += (rnd() - 0.5) * 18;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    return c;
  });
}

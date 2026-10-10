// Space outside the ship: stars, the black hole, and the clues that appear in
// the windows. Everything is painted on canvases (no image files).
import * as THREE from 'three';
import { Doom } from './doom.js';
import { cloudCanvas, CLOUD_TINTS, CLOUD_DARK, eyeCanvas, glowCanvas, lensCanvas, grinFaceCanvas, grinGlowCanvases, planetCanvas, FACE, CAP_RADIUS } from './doom-art.js';

function seededRandom(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const STARS = (() => {
  const rnd = seededRandom(7);
  return Array.from({ length: 220 }, () => ({ x: rnd(), y: rnd(), r: rnd() * 1.4 + 0.3, tw: rnd() * 6, hue: rnd() < 0.15 ? 'rgba(255,200,170,' : rnd() < 0.3 ? 'rgba(170,200,255,' : 'rgba(255,255,255,' }));
})();

// Points that trace the shape of an emoji (for constellations).
const shapeCache = new Map();
function emojiShape(emoji) {
  if (shapeCache.has(emoji)) return shapeCache.get(emoji);
  const size = 48;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.font = `${size * 0.8}px serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, size / 2, size / 2 + 2);
  const data = g.getImageData(0, 0, size, size).data;
  const pts = [];
  const rnd = seededRandom(emoji.codePointAt(0));
  for (let y = 0; y < size; y += 3) {
    for (let x = 0; x < size; x += 3) {
      const a = data[(y * size + x) * 4 + 3];
      // keep edge-ish pixels, sparsely, so it reads as a constellation
      if (a > 120 && rnd() < 0.35) pts.push([x / size - 0.5, y / size - 0.5]);
    }
  }
  const result = { pts: pts.slice(0, 26), canvas: c };
  shapeCache.set(emoji, result);
  return result;
}

const CONFETTI = ['rgba(255,120,190,', 'rgba(255,225,90,', 'rgba(110,230,255,', 'rgba(160,255,140,'];
const SPORES = ['rgba(170,255,90,', 'rgba(110,255,210,', 'rgba(215,130,255,'];

export function paintSpace(ctx, w, h, { t = 0, progress = 0, clue = null, colorOf = () => '#fff', iconOf = () => '★', withHole = true, holeX = 0.5, script = 'classic' } = {}) {
  const carnival = script === 'carnival';
  const outbreak = script === 'outbreak';
  const bg = ctx.createRadialGradient(w * holeX, h * 0.6, 10, w * 0.5, h * 0.5, Math.max(w, h));
  bg.addColorStop(0, carnival ? '#2b0b34' : outbreak ? '#10301a' : '#1a0b22');
  bg.addColorStop(0.4, carnival ? '#12071f' : outbreak ? '#07160f' : '#070816');
  bg.addColorStop(1, carnival ? '#05020d' : outbreak ? '#020805' : '#020208');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Nebula wisps.
  const wisps = outbreak
    ? [[0.2, 0.3, 0.5, 'rgba(90,255,80,0.16)'], [0.8, 0.25, 0.4, 'rgba(60,220,190,0.12)'], [0.6, 0.85, 0.5, 'rgba(170,70,230,0.14)']]
    : carnival
    ? [[0.2, 0.3, 0.5, 'rgba(230,60,170,0.2)'], [0.8, 0.25, 0.4, 'rgba(255,200,60,0.12)'], [0.6, 0.85, 0.5, 'rgba(60,200,230,0.14)']]
    : [[0.2, 0.3, 0.5, 'rgba(90,40,160,0.18)'], [0.8, 0.25, 0.4, 'rgba(20,120,160,0.14)'], [0.6, 0.85, 0.5, 'rgba(160,30,70,0.12)']];
  for (const [x, y, r, col] of wisps) {
    const g = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  for (let i = 0; i < STARS.length; i++) {
    const s = STARS[i];
    const a = 0.45 + 0.55 * Math.abs(Math.sin(t * 0.8 + s.tw));
    // in the Carnival, the stars are bits of confetti; in the Outbreak, glowing spores
    ctx.fillStyle = `${carnival && i % 3 ? CONFETTI[i % CONFETTI.length] : outbreak && i % 3 ? SPORES[i % SPORES.length] : s.hue}${a})`;
    ctx.beginPath();
    ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (withHole) paintDoom(ctx, w * holeX, h * 0.6, (Math.min(w, h) * (0.12 + progress * 0.22)), t, script);
  if (clue) paintClue(ctx, w, h, clue, t, colorOf, iconOf);
}

// ---------------------------------------------------------------------------
// The disasters, painted in 2D (the ship's windows and the end-game stage). The 3D
// versions under the ship are in doom.js; both use the pictures in doom-art.js.
// Every painter takes the centre, a radius r (it grows as the ship nears its end) and
// the time t, and animates itself from t.
// ---------------------------------------------------------------------------

const hashT = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// 🤡 The Great Grin: a scary clown planet. A pale, cracked face with hollow glowing eyes
// (the pupils follow you), a rotten red nose and a grin full of fangs, with fire in its
// mouth that flickers and cracks that glow like embers.
export function paintGrin(ctx, cx, cy, r, t) {
  const beat = Math.pow(Math.max(0, Math.sin(t * 2.1)), 6) * 0.5 + Math.pow(Math.max(0, Math.sin(t * 2.1 - 0.5)), 6) * 0.3;
  ctx.save();
  // a red haze round it
  const halo = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 3);
  halo.addColorStop(0, `rgba(255,50,40,${0.45 + beat * 0.2})`);
  halo.addColorStop(0.4, 'rgba(120,10,90,0.18)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(cx - r * 3.2, cy - r * 3.2, r * 6.4, r * 6.4);
  // the broken ring of debris (its far half first)
  const debris = (back) => {
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + t * 0.12;
      const d = r * (1.5 + (i % 4) * 0.2);
      const y = Math.sin(a) * d * 0.28;
      if ((Math.sin(a) < 0) !== back) continue;
      ctx.fillStyle = `rgba(150,${60 + (i % 3) * 20},70,0.8)`;
      ctx.fillRect(cx + Math.cos(a) * d, cy + y, Math.max(1, r * 0.03), Math.max(1, r * 0.03));
    }
  };
  debris(true);
  // the planet: dark violet rock, lit from the front, with a bloody rim
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.save();
  ctx.clip();
  const rock = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  rock.addColorStop(0, '#6b5a78');
  rock.addColorStop(0.7, '#2c2038');
  rock.addColorStop(1, '#10091a');
  ctx.fillStyle = rock;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.globalAlpha = 0.35;
  ctx.drawImage(planetCanvas(512), cx - r, cy - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
  ctx.restore();
  // the face
  const fr = r * CAP_RADIUS;
  ctx.drawImage(grinFaceCanvas(1024), cx - fr, cy - fr, fr * 2, fr * 2);
  const glow = grinGlowCanvases(1024);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, 0.55 + 0.18 * Math.sin(t * 9) * Math.sin(t * 3.7));
  ctx.drawImage(glow.maw, cx - fr, cy - fr, fr * 2, fr * 2);
  ctx.globalAlpha = Math.min(1, 0.5 + beat * 0.6);
  ctx.drawImage(glow.ember, cx - fr, cy - fr, fr * 2, fr * 2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  // slit pupils that follow whoever is looking
  for (const s of [-1, 1]) {
    const ex = cx + s * FACE.eye.x * 0.96 * fr + Math.sin(t * 0.6) * fr * 0.03;
    const ey = cy + FACE.eye.y * 0.96 * fr + Math.cos(t * 0.5) * fr * 0.02;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(ex, ey, Math.max(1, fr * 0.02), fr * 0.1, s * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  // the bloody rim, bright on the dark side
  const rim = ctx.createRadialGradient(cx, cy, r * 0.82, cx, cy, r * 1.04);
  rim.addColorStop(0, 'rgba(255,40,40,0)');
  rim.addColorStop(0.8, `rgba(230,30,40,${0.35 + beat * 0.25})`);
  rim.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.04, 0, Math.PI * 2);
  ctx.fill();
  debris(false);
  ctx.restore();
}

// 🦠 The Bloom: a vast, scary gas cloud. Layers of turning gas, a glowing heart that
// beats, wavy tendrils, an eye that opens now and then, and flashes of lightning.
export function paintBloom(ctx, cx, cy, r, t) {
  const beat = Math.pow(Math.max(0, Math.sin(t * 1.7)), 8) * 0.55 + Math.pow(Math.max(0, Math.sin(t * 1.7 - 0.6)), 8) * 0.3;
  // lightning: some seconds have a flash in the first quarter-second
  const slot = Math.floor(t / 5);
  const into = t - slot * 5;
  const flashing = hashT(slot) < 0.55 && into < 0.3;
  const flash = flashing ? (Math.sin(into * 70) > -0.3 ? 1 : 0.25) : 0;
  ctx.save();
  const haze = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 4);
  haze.addColorStop(0, 'rgba(120,255,80,0.3)');
  haze.addColorStop(0.45, 'rgba(110,40,200,0.13)');
  haze.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(cx - r * 4, cy - r * 4, r * 8, r * 8);
  // layers of gas, each turning at its own pace: heavy murky body, and every third one glows
  for (let i = 0; i < 9; i++) {
    const glows = i % 3 === 2;
    const size = r * 2 * (2.7 - i * 0.18) * (1 + Math.sin(t * 0.4 + i) * 0.03);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * (i % 2 ? 0.05 : -0.04) * (0.7 + (i % 4) * 0.3) + i);
    ctx.globalCompositeOperation = glows ? 'lighter' : 'source-over';
    ctx.globalAlpha = Math.min(1, (glows ? 0.75 : 0.85) * (1 + flash * (glows ? 1.2 : 0.3)));
    const tint = glows ? CLOUD_TINTS[((i / 3) | 0) % CLOUD_TINTS.length] : CLOUD_DARK[i % CLOUD_DARK.length];
    ctx.drawImage(cloudCanvas(1 + (i % 4) * 5, tint, 256, glows ? 'veins' : 'smoke'), -size / 2, -size / 2, size, size);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1;
  // wavy tendrils
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.sin(t * 0.2 + i) * 0.1;
    ctx.strokeStyle = `rgba(${i % 2 ? '150,255,70' : '90,240,190'},0.55)`;
    ctx.lineWidth = Math.max(1.2, r * 0.04);
    ctx.beginPath();
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      const dist = r * (0.9 + u * (1.4 + 0.3 * Math.sin(i * 3.1)));
      const wob = Math.sin(u * 6 + t * 1.5 + i) * r * 0.14 * u;
      const px = cx + Math.cos(a) * dist - Math.sin(a) * wob;
      const py = cy + Math.sin(a) * dist + Math.cos(a) * wob;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  // the beating heart of the cloud
  const core = r * 1.0 * (1 + beat * 0.2 + flash * 0.6);
  ctx.globalAlpha = Math.min(1, 0.6 + beat * 0.3 + flash * 0.3);
  ctx.drawImage(glowCanvas('rgba(255,255,170,1)', 'rgba(150,255,70,0.45)', 256), cx - core, cy - core, core * 2, core * 2);
  ctx.globalAlpha = 1;
  // an eye looks out of it every so often
  const phase = (t % 17) / 17;
  const open = phase < 0.35 ? Math.sin((phase / 0.35) * Math.PI) : 0;
  if (open > 0.02) {
    const es = r * 1.6;
    ctx.globalAlpha = open;
    ctx.drawImage(eyeCanvas(256), cx - es / 2 + Math.sin(t * 0.7) * r * 0.1, cy - es / 2, es, es);
    ctx.globalAlpha = 1;
  }
  // a bolt of lightning
  if (flashing) {
    ctx.strokeStyle = 'rgba(235,255,215,0.95)';
    ctx.lineWidth = Math.max(1.5, r * 0.03);
    for (let b = 0; b < 2; b++) {
      let a = hashT(slot * 3 + b) * Math.PI * 2;
      let x = cx;
      let y = cy;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let i = 0; i < 9; i++) {
        a += (hashT(slot * 11 + b * 5 + i) - 0.5) * 1.0;
        x += Math.cos(a) * r * 0.35;
        y += Math.sin(a) * r * 0.35;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

// 🕳️ The black hole: a tilted accretion disk of glowing gas that streaks as it orbits (the
// matter close in orbits fastest), a halo where the far side of the disk is bent over the
// top and under the bottom, a black horizon, and sparks spiralling in.
export function paintBlackHole(ctx, cx, cy, r, t) {
  ctx.save();
  const glow = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 4.4);
  glow.addColorStop(0, 'rgba(255,120,50,0.28)');
  glow.addColorStop(0.4, 'rgba(150,30,50,0.1)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - r * 4.6, cy - r * 4.6, r * 9.2, r * 9.2);
  const tilt = 0.36;
  const rot = -0.14 + Math.sin(t * 0.07) * 0.04;
  // streaks of gas, each orbiting at its own speed; hotter and brighter nearer the hole
  const streaks = (front) => {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 46; i++) {
      const u = i / 45;
      const rr = r * (1.45 + u * 2.9);
      const w = 1.5 / Math.pow(rr / r, 1.5);
      const dash = rr * (0.5 + hashT(i) * 1.4);
      ctx.setLineDash([dash, rr * (0.2 + hashT(i + 40) * 0.8)]);
      ctx.lineDashOffset = -t * w * rr * 2.2;
      const g = Math.round(240 - u * 150);
      const b = Math.round(190 - u * 170);
      ctx.strokeStyle = `rgba(255,${g},${Math.max(10, b)},${Math.pow(1 - u, 1.5) * 0.85 + 0.06})`;
      ctx.lineWidth = Math.max(1, r * 0.07 * (1 - u * 0.5));
      ctx.beginPath();
      ctx.ellipse(cx, cy, rr, rr * tilt, rot, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'source-over';
  };
  streaks(false);
  // the halo: the far side of the disk bent over the top and under the bottom, and the photon ring
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(lensCanvas(512), cx - r * 2.1, cy - r * 2.1, r * 4.2, r * 4.2);
  ctx.globalCompositeOperation = 'source-over';
  // the hole itself
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  streaks(true);
  // sparks of matter spiralling in
  for (let i = 0; i < 34; i++) {
    const ph = (t * (0.07 + hashT(i) * 0.08) + i / 34) % 1;
    const rr = r * (3.8 - ph * 2.7);
    const a = i * 2.39 + (t * 1.5) / Math.pow(rr / r, 1.5);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * tilt;
    ctx.fillStyle = `rgba(255,${Math.round(150 + ph * 100)},${Math.round(80 + ph * 140)},${Math.min(1, ph * 3) * (1 - ph * 0.2)})`;
    ctx.fillRect(x, y, Math.max(1.2, r * 0.04), Math.max(1.2, r * 0.04));
  }
  ctx.restore();
}

// Whichever doom this script is about (the black hole, the Great Grin or the Bloom).
export function paintDoom(ctx, cx, cy, r, t, script = 'classic') {
  if (script === 'carnival') paintGrin(ctx, cx, cy, r * 0.95, t);
  else if (script === 'outbreak') paintBloom(ctx, cx, cy, r * 0.7, t);
  else paintBlackHole(ctx, cx, cy, r, t);
}

export function paintConstellation(ctx, cx, cy, size, emoji, living, t) {
  const { pts, canvas } = emojiShape(emoji);
  const color = living ? [255, 214, 120] : [150, 185, 235];
  // a ghostly outline of the role icon, so the shape can be recognised
  ctx.save();
  ctx.globalAlpha = living ? 0.22 : 0.14;
  ctx.filter = living ? 'none' : 'grayscale(1)';
  ctx.drawImage(canvas, cx - size / 2, cy - size / 2, size, size);
  ctx.restore();
  ctx.strokeStyle = `rgba(${color},${living ? 0.5 : 0.35})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    if (Math.hypot(ax - bx, ay - by) < 0.22) {
      ctx.moveTo(cx + ax * size, cy + ay * size);
      ctx.lineTo(cx + bx * size, cy + by * size);
    }
  }
  ctx.stroke();
  pts.forEach(([x, y], i) => {
    const a = living ? 0.75 + 0.25 * Math.sin(t * 2 + i) : 0.55 + 0.2 * Math.sin(t + i);
    ctx.fillStyle = `rgba(${color},${a})`;
    ctx.beginPath();
    ctx.arc(cx + x * size, cy + y * size, living ? 2.2 : 1.6, 0, Math.PI * 2);
    ctx.fill();
  });
}

function paintComet(ctx, x, y, color, angle, len) {
  const tx = x - Math.cos(angle) * len;
  const ty = y - Math.sin(angle) * len;
  const g = ctx.createLinearGradient(x, y, tx, ty);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.strokeStyle = g;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

function paintClue(ctx, w, h, clue, t, colorOf, iconOf) {
  const k = clue.kind;
  if (k === 'dead-constellation' || k === 'living-constellation' || k === 'role-comets') {
    paintConstellation(ctx, w * 0.2, h * 0.45, h * 0.8, iconOf(clue.role), k !== 'dead-constellation', t);
  }
  if (k === 'comets' || k === 'role-comets') {
    (clue.players || []).forEach((id, i) => {
      const phase = ((t * 0.06 + i * 0.33) % 1) * 1.4 - 0.2;
      paintComet(ctx, w * (0.35 + phase * 0.6), h * (0.12 + i * 0.1 + phase * 0.25), colorOf(id), 0.45, 120);
    });
  }
  if (k === 'probe') {
    const x = w * (0.15 + ((t * 0.02) % 1) * 0.7);
    const y = h * 0.28 + Math.sin(t * 0.7) * 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 0.3) * 0.3);
    ctx.fillStyle = '#56607a';
    ctx.fillRect(-14, -8, 28, 16);
    ctx.fillStyle = '#2d3446';
    ctx.fillRect(-34, -4, 18, 8);
    ctx.fillRect(16, -4, 18, 8);
    ctx.strokeStyle = '#8892a8';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(0, -20);
    ctx.stroke();
    const on = Math.sin(t * 5) > 0;
    ctx.fillStyle = on ? colorOf(clue.players?.[0]) : '#111';
    ctx.shadowColor = colorOf(clue.players?.[0]);
    ctx.shadowBlur = on ? 18 : 0;
    ctx.beginPath();
    ctx.arc(0, -21, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (k === 'drift-count') {
    // N lights blink together, then pause.
    const cycle = t % 4;
    const on = cycle < 2.4 && Math.sin(cycle * Math.PI * 2.5) > 0;
    for (let i = 0; i < (clue.count || 0); i++) {
      const x = w * (0.12 + i * 0.07);
      const y = h * (0.22 + (i % 2) * 0.08);
      ctx.fillStyle = '#3a3f4f';
      ctx.fillRect(x - 6, y - 4, 12, 8);
      ctx.fillStyle = on ? '#b8ff9a' : '#1b2a18';
      ctx.shadowColor = '#b8ff9a';
      ctx.shadowBlur = on ? 14 : 0;
      ctx.beginPath();
      ctx.arc(x, y - 6, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}

// Canvas textures shared by all windows. Repainted a few times a second.
export class SpaceCanvases {
  constructor() {
    this.small = document.createElement('canvas');
    this.small.width = 512;
    this.small.height = 256;
    // the Observation Deck window is about 9x wider than it is tall
    this.big = document.createElement('canvas');
    this.big.width = 1440;
    this.big.height = 180;
    this.smallTex = new THREE.CanvasTexture(this.small);
    this.bigTex = new THREE.CanvasTexture(this.big);
    for (const tex of [this.smallTex, this.bigTex]) tex.colorSpace = THREE.SRGBColorSpace;
    this.windowTextures = []; // clones of smallTex used by individual windows
    this.progress = 0;
    this.script = 'classic';
    this.clue = null;
    this.colorOf = () => '#fff';
    this.iconOf = () => '★';
    this.last = -1;
    this.bigVisible = true; // the world says when the Observation Deck window is on screen
    this.bigPaintedAt = -1;
  }

  update(time) {
    if (time - this.last < 0.2) return;
    this.last = time;
    paintSpace(this.small.getContext('2d'), 512, 256, { t: time, progress: this.progress, holeX: 0.7, script: this.script });
    this.smallTex.needsUpdate = true;
    for (const tex of this.windowTextures) tex.needsUpdate = true;
    // the big window is expensive to paint and upload, so do it rarely while nobody is looking
    if (this.bigVisible || this.bigPaintedAt < 0 || time - this.bigPaintedAt > 2) {
      this.bigPaintedAt = time;
      paintSpace(this.big.getContext('2d'), 1440, 180, { t: time, progress: this.progress, clue: this.clue, colorOf: this.colorOf, iconOf: this.iconOf, holeX: 0.62, script: this.script });
      this.bigTex.needsUpdate = true;
    }
  }
}

// Stars far below the ship, and the disaster the script is about (a black hole, the
// Great Grin or the Bloom), as animated 3D scenery (see doom.js).
export function buildBackdrop(scene, { lowFx = false } = {}) {
  const group = new THREE.Group();
  const count = 2600;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 900;
    positions[i * 3 + 1] = -40 - Math.random() * 260;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 900;
    const c = new THREE.Color().setHSL(0.55 + Math.random() * 0.2, 0.5, 0.65 + Math.random() * 0.35);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false }));
  group.add(stars);
  scene.add(group);
  const doom = new Doom(group, { lowFx });

  return {
    group,
    doom,
    setProgress(p) {
      doom.setProgress(p);
    },
    // the black hole, the Great Grin or the Bloom
    setScript(id) {
      doom.setScript(id);
    },
    flash() {
      doom.flash();
    },
    update(time, dt = 0.016, camera = null) {
      stars.rotation.y = time * 0.002;
      doom.update(time, dt, camera);
    },
  };
}

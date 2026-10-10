// Space outside the ship: stars, the black hole, and the clues that appear in
// the windows. Everything is painted on canvases (no image files).
import * as THREE from 'three';

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

// The Cosmic Carnival's doom: the Great Grin, a colossal clown-faced moon with a
// bottomless mouth. r is the face radius (it grows as the show gets closer to
// being swallowed); the whole face bobs, blinks and grins wider with time.
const WIG = ['#ff4fa3', '#ffd23f', '#3ad6e8', '#8a5cff', '#7fe33b', '#ff8a2a'];

export function paintGrin(ctx, cx, cy, r, t) {
  // pink and gold glow around the moon
  const glow = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 3.4);
  glow.addColorStop(0, 'rgba(255,90,170,0.45)');
  glow.addColorStop(0.4, 'rgba(255,200,80,0.14)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - r * 4, cy - r * 4, r * 8, r * 8);

  // rainbow wig, puffing up and down around the head
  for (let i = 0; i < 11; i++) {
    const a = Math.PI * (0.78 + (i / 10) * 1.44);
    const bob = Math.sin(t * 1.6 + i) * r * 0.04;
    const d = r * (1.02 + (i % 2) * 0.08) + bob;
    ctx.fillStyle = WIG[i % WIG.length];
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.36 + (i % 3) * 0.03), 0, Math.PI * 2);
    ctx.fill();
  }

  // the face
  const face = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.1, cx, cy, r);
  face.addColorStop(0, '#fffaf0');
  face.addColorStop(1, '#f1d3c2');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // rosy cheeks
  ctx.fillStyle = 'rgba(255,90,120,0.35)';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + sx * r * 0.62, cy + r * 0.12, r * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }

  // eyes with blue diamonds, blinking now and then
  const blink = (t % 5.2) > 5.05 ? 0.12 : 1;
  for (const sx of [-1, 1]) {
    const ex = cx + sx * r * 0.36;
    const ey = cy - r * 0.22;
    ctx.fillStyle = '#3b6df0';
    ctx.beginPath();
    ctx.moveTo(ex, ey - r * 0.42);
    ctx.lineTo(ex + r * 0.12, ey - r * 0.27);
    ctx.lineTo(ex, ey - r * 0.12);
    ctx.lineTo(ex - r * 0.12, ey - r * 0.27);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(ex, ey, r * 0.17, r * 0.2 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#12091f';
    ctx.beginPath();
    ctx.ellipse(ex + Math.sin(t * 0.7) * r * 0.05, ey + r * 0.04, r * 0.07, r * 0.09 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // the bottomless mouth: wider and deeper as the show nears its end (r grows)
  const open = 0.5 + Math.sin(t * 1.3) * 0.07;
  const mx0 = cx - r * 0.7;
  const mx1 = cx + r * 0.7;
  const my = cy + r * 0.3;
  const mouth = new Path2D();
  mouth.moveTo(mx0, my);
  mouth.quadraticCurveTo(cx, my + r * 0.18, mx1, my);
  mouth.quadraticCurveTo(cx, my + r * (0.18 + open * 1.9), mx0, my);
  mouth.closePath();
  ctx.save();
  ctx.fillStyle = '#05000c';
  ctx.fill(mouth);
  ctx.clip(mouth);
  // a few stars deep inside the dark
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = `rgba(255,230,250,${0.3 + 0.4 * Math.abs(Math.sin(t * 0.9 + i * 1.7))})`;
    ctx.fillRect(mx0 + ((i * 97) % 140) / 140 * (mx1 - mx0), my + r * (0.25 + ((i * 53) % 60) / 60 * open * 1.5), 2, 2);
  }
  // teeth along the top lip
  ctx.fillStyle = '#fffdf6';
  for (let i = 0; i < 9; i++) {
    ctx.fillRect(mx0 + (i / 9) * (mx1 - mx0) + r * 0.02, my + r * 0.04, (mx1 - mx0) / 9 - r * 0.04, r * 0.15);
  }
  ctx.restore();
  // lips
  ctx.strokeStyle = '#d7263d';
  ctx.lineWidth = Math.max(2, r * 0.09);
  ctx.lineCap = 'round';
  ctx.stroke(mouth);

  // the big red nose pulses like a warning light
  const pulse = 1 + Math.sin(t * 3) * 0.06;
  ctx.fillStyle = '#e8203a';
  ctx.shadowColor = '#ff2d55';
  ctx.shadowBlur = r * 0.35;
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.04, r * 0.17 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(cx - r * 0.05, cy - r * 0.01, r * 0.04, 0, Math.PI * 2);
  ctx.fill();
}

// Whichever doom this script is about (the black hole, or the Great Grin).
export function paintDoom(ctx, cx, cy, r, t, script = 'classic') {
  if (script === 'carnival') paintGrin(ctx, cx, cy, r * 0.8, t);
  else if (script === 'outbreak') paintBloom(ctx, cx, cy, r * 0.7, t);
  else paintBlackHole(ctx, cx, cy, r, t);
}

// The Outbreak's doom: the Bloom, a vast living cell wrapped in glowing spore clouds
// and wavy tendrils, with an eye for a nucleus. It pulses; r is its radius (it grows
// as the station gets closer to being swallowed).
export function paintBloom(ctx, cx, cy, r, t) {
  // toxic glow
  const glow = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 3.6);
  glow.addColorStop(0, 'rgba(140,255,80,0.42)');
  glow.addColorStop(0.4, 'rgba(110,40,200,0.16)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - r * 4, cy - r * 4, r * 8, r * 8);

  // drifting spore clouds round the edge
  const cloud = ['rgba(150,255,70,', 'rgba(60,230,200,', 'rgba(210,90,255,'];
  for (let i = 0; i < 26; i++) {
    const a = i * 2.4 + t * 0.05 * (1 + (i % 3) * 0.3);
    const d = r * (1.15 + 0.45 * Math.sin(i * 1.7));
    const rr = r * (0.2 + 0.1 * Math.sin(i * 2.3 + t * 0.8));
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d * 0.9;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, `${cloud[i % 3]}0.5)`);
    g.addColorStop(1, `${cloud[i % 3]}0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }

  // wavy tendrils reaching out
  ctx.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + t * 0.04;
    ctx.strokeStyle = `rgba(${i % 2 ? '150,255,70' : '90,240,190'},0.55)`;
    ctx.lineWidth = Math.max(1.5, r * 0.06);
    ctx.beginPath();
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      const dist = r * (1 + u * (0.9 + 0.3 * Math.sin(i * 3.1)));
      const wob = Math.sin(u * 6 + t * 1.5 + i) * r * 0.12 * u;
      const px = cx + Math.cos(a) * dist - Math.sin(a) * wob;
      const py = cy + Math.sin(a) * dist + Math.cos(a) * wob;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    // a glowing bulb on the end
    const ex = cx + Math.cos(a) * r * 1.9;
    const ey = cy + Math.sin(a) * r * 1.9;
    ctx.fillStyle = 'rgba(210,255,120,0.8)';
    ctx.beginPath();
    ctx.arc(ex, ey, Math.max(1.5, r * 0.05), 0, Math.PI * 2);
    ctx.fill();
  }

  // the cell: a glowing body with a thick membrane
  const beat = 1 + Math.sin(t * 2.2) * 0.025;
  const body = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.25, r * 0.1, cx, cy, r * beat);
  body.addColorStop(0, '#e6ff8a');
  body.addColorStop(0.6, '#6ee03a');
  body.addColorStop(1, '#2a8f34');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(cx, cy, r * beat, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,110,40,0.9)';
  ctx.lineWidth = Math.max(2, r * 0.1);
  ctx.stroke();
  // organelles
  for (let i = 0; i < 9; i++) {
    const a = i * 2.1 + 0.4;
    const d = r * (0.45 + 0.25 * ((i * 37) % 10) / 10);
    ctx.fillStyle = i % 2 ? 'rgba(210,255,120,0.55)' : 'rgba(40,120,60,0.5)';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d * 1.1, cy + Math.sin(a) * d, r * (0.06 + (i % 3) * 0.02), 0, Math.PI * 2);
    ctx.fill();
  }
  // the nucleus is an eye: a purple iris with a slit pupil that sweeps and blinks
  const ex = cx + Math.sin(t * 0.5) * r * 0.05;
  const iris = ctx.createRadialGradient(ex, cy, r * 0.05, ex, cy, r * 0.42);
  iris.addColorStop(0, '#fff27a');
  iris.addColorStop(0.55, '#a45bff');
  iris.addColorStop(1, '#4a1d8a');
  ctx.fillStyle = iris;
  const blink = (t % 6.5) > 6.35 ? 0.1 : 1;
  ctx.beginPath();
  ctx.ellipse(ex, cy, r * 0.42, r * 0.42 * blink, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#05000c';
  ctx.beginPath();
  ctx.ellipse(ex, cy, r * 0.09, r * 0.34 * blink, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function paintBlackHole(ctx, cx, cy, r, t) {
  // Glow
  const glow = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 3.2);
  glow.addColorStop(0, 'rgba(255,140,60,0.45)');
  glow.addColorStop(0.35, 'rgba(200,40,80,0.18)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - r * 4, cy - r * 4, r * 8, r * 8);

  // Accretion disk (back half)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.18 + Math.sin(t * 0.2) * 0.02);
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = `rgba(${255 - i * 10},${150 - i * 18},${70 - i * 8},${0.55 - i * 0.07})`;
    ctx.lineWidth = r * (0.22 - i * 0.025);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * (2.1 - i * 0.12), r * (0.55 - i * 0.03), 0, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Lensed ring over the top
  ctx.strokeStyle = 'rgba(255,190,120,0.75)';
  ctx.lineWidth = r * 0.14;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.12, 0, Math.PI * 2);
  ctx.stroke();

  // The hole itself
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Accretion disk (front half)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.18 + Math.sin(t * 0.2) * 0.02);
  const front = ctx.createLinearGradient(-r * 2, 0, r * 2, 0);
  front.addColorStop(0, 'rgba(255,90,40,0.3)');
  front.addColorStop(0.5, 'rgba(255,220,160,0.95)');
  front.addColorStop(1, 'rgba(255,90,40,0.3)');
  ctx.strokeStyle = front;
  ctx.lineWidth = r * 0.24;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 2.1, r * 0.55, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
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

// Stars and the black hole far below the ship, visible between rooms.
export function buildBackdrop(scene) {
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

  // Black hole seen from above: a glowing disk with a black centre.
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  const mid = 512;
  const disk = g.createRadialGradient(mid, mid, 90, mid, mid, 500);
  disk.addColorStop(0, 'rgba(0,0,0,1)');
  disk.addColorStop(0.18, 'rgba(0,0,0,1)');
  disk.addColorStop(0.2, 'rgba(255,230,180,1)');
  disk.addColorStop(0.3, 'rgba(255,140,60,0.9)');
  disk.addColorStop(0.5, 'rgba(200,40,90,0.5)');
  disk.addColorStop(0.75, 'rgba(80,20,120,0.2)');
  disk.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = disk;
  g.fillRect(0, 0, 1024, 1024);
  // swirl streaks
  for (let i = 0; i < 160; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 110 + Math.random() * 300;
    g.strokeStyle = `rgba(255,${120 + Math.random() * 100},80,${0.08 + Math.random() * 0.15})`;
    g.lineWidth = 1 + Math.random() * 3;
    g.beginPath();
    g.arc(mid, mid, r, a, a + 0.4 + Math.random() * 0.8);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // the Cosmic Carnival's version: the Great Grin, seen from above
  const gc = document.createElement('canvas');
  gc.width = gc.height = 1024;
  paintGrin(gc.getContext('2d'), 512, 512, 150, 1.2);
  const grinTex = new THREE.CanvasTexture(gc);
  grinTex.colorSpace = THREE.SRGBColorSpace;
  // and the Outbreak's: the Bloom
  const bc = document.createElement('canvas');
  bc.width = bc.height = 1024;
  paintBloom(bc.getContext('2d'), 512, 512, 130, 1.2);
  const bloomTex = new THREE.CanvasTexture(bc);
  bloomTex.colorSpace = THREE.SRGBColorSpace;
  let script = 'classic';
  const hole = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(10, -120, -60);
  // The plane lies in its own XY plane, so the black core just sits a hair above it.
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.17, 48), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  core.position.z = 0.002;
  hole.add(core);
  group.add(hole);
  scene.add(group);

  return {
    group,
    setProgress(p) {
      const s = 220 + p * 900;
      hole.scale.set(s, s, 1);
    },
    // the Cosmic Carnival swaps the black hole for the Great Grin, the Outbreak for the Bloom
    setScript(id) {
      script = id || 'classic';
      hole.material.map = { carnival: grinTex, outbreak: bloomTex }[script] || tex;
      hole.material.needsUpdate = true;
      core.visible = script !== 'carnival' && script !== 'outbreak';
    },
    update(time) {
      hole.rotation.z = script === 'carnival' ? Math.sin(time * 0.15) * 0.12 : script === 'outbreak' ? time * 0.012 : time * 0.03;
      stars.rotation.y = time * 0.002;
    },
  };
}

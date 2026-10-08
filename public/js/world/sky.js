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

export function paintSpace(ctx, w, h, { t = 0, progress = 0, clue = null, colorOf = () => '#fff', iconOf = () => '★', withHole = true, holeX = 0.5 } = {}) {
  const bg = ctx.createRadialGradient(w * holeX, h * 0.6, 10, w * 0.5, h * 0.5, Math.max(w, h));
  bg.addColorStop(0, '#1a0b22');
  bg.addColorStop(0.4, '#070816');
  bg.addColorStop(1, '#020208');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Nebula wisps.
  for (const [x, y, r, col] of [[0.2, 0.3, 0.5, 'rgba(90,40,160,0.18)'], [0.8, 0.25, 0.4, 'rgba(20,120,160,0.14)'], [0.6, 0.85, 0.5, 'rgba(160,30,70,0.12)']]) {
    const g = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  for (const s of STARS) {
    const a = 0.45 + 0.55 * Math.abs(Math.sin(t * 0.8 + s.tw));
    ctx.fillStyle = `${s.hue}${a})`;
    ctx.beginPath();
    ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (withHole) paintBlackHole(ctx, w * holeX, h * 0.6, (Math.min(w, h) * (0.12 + progress * 0.22)), t);
  if (clue) paintClue(ctx, w, h, clue, t, colorOf, iconOf);
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

function paintConstellation(ctx, cx, cy, size, emoji, living, t) {
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
    this.clue = null;
    this.colorOf = () => '#fff';
    this.iconOf = () => '★';
    this.last = -1;
  }

  update(time) {
    if (time - this.last < 0.2) return;
    this.last = time;
    paintSpace(this.small.getContext('2d'), 512, 256, { t: time, progress: this.progress, holeX: 0.7 });
    paintSpace(this.big.getContext('2d'), 1440, 180, { t: time, progress: this.progress, clue: this.clue, colorOf: this.colorOf, iconOf: this.iconOf, holeX: 0.62 });
    this.smallTex.needsUpdate = true;
    this.bigTex.needsUpdate = true;
    for (const tex of this.windowTextures) tex.needsUpdate = true;
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
      const s = 260 + p * 520;
      hole.scale.set(s, s, 1);
    },
    update(time) {
      hole.rotation.z = time * 0.03;
      stars.rotation.y = time * 0.002;
    },
  };
}

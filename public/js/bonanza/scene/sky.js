// Star Bonanza: the sky. Cartoon space, not the real thing: a candy-coloured gradient, twinkly four-pointed
// sparkles, puffy pastel nebula clouds, a ringed bubblegum planet, a stripy mint one, and a moon with a sleepy smile.
// Everything drifts and bobs a little.
import * as THREE from 'three';
import { toon } from './stage.js';

const canvas = (w, h, draw) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

function gradient() {
  return canvas(16, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#120c3d');
    gr.addColorStop(0.45, '#2e1a73');
    gr.addColorStop(0.8, '#5b33a8');
    gr.addColorStop(1, '#a35bc9');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
}

// a four-pointed twinkle
export function sparkleTexture() {
  return canvas(64, 64, (g) => {
    g.translate(32, 32);
    g.fillStyle = '#ffffff';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const r = i % 2 ? 5 : 30;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  });
}

function cloudTexture() {
  return canvas(256, 160, (g) => {
    g.fillStyle = '#ffffff';
    for (const [x, y, r] of [[70, 100, 46], [120, 78, 60], [178, 98, 48], [210, 116, 30], [44, 120, 30], [128, 118, 44]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function stripes(a, b, n = 7) {
  return canvas(64, 256, (g, w, h) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? a : b;
      g.fillRect(0, (i * h) / n, w, h / n + 1);
    }
  });
}

// the moon's face is painted where a sphere's texture faces +z (a quarter of the way along)
function moonTexture() {
  return canvas(512, 256, (g, w, h) => {
    g.fillStyle = '#fff1c9';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f0d999';
    for (const [x, y, r] of [[40, 60, 18], [330, 90, 26], [420, 170, 16], [250, 200, 20], [470, 50, 12], [180, 40, 10]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    const cx = w * 0.25;
    const cy = h * 0.5;
    g.strokeStyle = '#2d1b4e';
    g.lineWidth = 7;
    g.lineCap = 'round';
    for (const dx of [-26, 26]) {
      g.beginPath();
      g.arc(cx + dx, cy - 8, 11, Math.PI * 1.1, Math.PI * 1.9, true);
      g.stroke();
    }
    g.beginPath();
    g.arc(cx, cy + 10, 22, 0.25, Math.PI - 0.25);
    g.stroke();
    g.fillStyle = '#ffb3c7';
    for (const dx of [-46, 46]) {
      g.beginPath();
      g.ellipse(cx + dx, cy + 14, 13, 8, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
}

const LINE = new THREE.MeshBasicMaterial({ color: 0x2d1b4e, side: THREE.BackSide });
function outlined(mesh, k = 1.05) {
  const shell = new THREE.Mesh(mesh.geometry, LINE);
  shell.scale.setScalar(k);
  mesh.add(shell);
  return mesh;
}

export class CartoonSky {
  constructor(stage) {
    this.stage = stage;
    stage.scene.background = gradient();
    this.root = new THREE.Group();
    stage.scene.add(this.root);
    this.twinkles = [];
    this.spinners = [];

    // far away: little dots
    const dots = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const a = Math.random() * Math.PI * 2;
      const y = -30 + Math.random() * 140;
      const r = 150 + Math.random() * 80;
      dots.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dots, 3));
    this.dots = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xfff3d6, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85 }));
    this.root.add(this.dots);

    // closer: chunky twinkles
    const sparkle = sparkleTexture();
    const colors = ['#ffffff', '#fff1a8', '#ffc2e5', '#bdf3ff'];
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkle, color: colors[i % colors.length], transparent: true, depthWrite: false }));
      const a = Math.random() * Math.PI * 2;
      const r = 70 + Math.random() * 70;
      m.position.set(Math.cos(a) * r, -10 + Math.random() * 70, Math.sin(a) * r - 10);
      const s = 1.6 + Math.random() * 2.6;
      m.userData = { s, phase: Math.random() * 6, speed: 1 + Math.random() * 2 };
      this.root.add(m);
      this.twinkles.push(m);
    }

    // pastel nebula clouds
    const cloud = cloudTexture();
    for (const [x, y, z, s, c, o] of [[-70, 10, -110, 60, '#ff9ad5', 0.22], [80, 22, -120, 70, '#8fe3ff', 0.18], [10, 45, -150, 90, '#c9a6ff', 0.2], [-110, -10, -40, 50, '#ffd38f', 0.14], [120, -5, -30, 55, '#a6ffd8', 0.13]]) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloud, color: c, transparent: true, opacity: o, depthWrite: false }));
      m.position.set(x, y, z);
      m.scale.set(s, s * 0.62, 1);
      this.root.add(m);
    }

    // a ringed bubblegum planet
    const pink = outlined(new THREE.Mesh(new THREE.SphereGeometry(9, 32, 24), toon('#ff8fc7')), 1.035);
    pink.position.set(-48, 2, -62);
    const ring = new THREE.Mesh(new THREE.RingGeometry(12, 17, 48), toon('#ffe08a', { side: THREE.DoubleSide }));
    ring.rotation.set(1.2, 0.2, 0.3);
    pink.add(ring);
    this.root.add(pink);
    this.spinners.push({ obj: pink, spin: 0.05, bob: 0.6, phase: 0 });

    // a stripy mint planet
    const mint = outlined(new THREE.Mesh(new THREE.SphereGeometry(6.5, 32, 24), toon('#ffffff', { map: stripes('#7ff0c2', '#b8fff0') })), 1.04);
    mint.position.set(56, 10, -48);
    mint.rotation.z = 0.35;
    this.root.add(mint);
    this.spinners.push({ obj: mint, spin: 0.12, bob: 0.8, phase: 2 });

    // a little orange one, far off
    const orange = outlined(new THREE.Mesh(new THREE.SphereGeometry(3.4, 24, 18), toon('#ffb35c')), 1.05);
    orange.position.set(26, 26, -90);
    this.root.add(orange);
    this.spinners.push({ obj: orange, spin: 0.2, bob: 0.5, phase: 4 });

    // the moon, smiling in its sleep
    const moon = outlined(new THREE.Mesh(new THREE.SphereGeometry(6, 32, 24), toon('#ffffff', { map: moonTexture() })), 1.04);
    moon.position.set(-18, 30, -95);
    moon.rotation.x = 0.2;
    this.root.add(moon);
    this.spinners.push({ obj: moon, spin: 0, bob: 0.7, phase: 1 });

    stage.onFrame((dt, t) => this.update(dt, t));
  }

  update(dt, t) {
    for (const m of this.twinkles) {
      const u = m.userData;
      const k = 0.55 + 0.45 * Math.sin(t * u.speed + u.phase);
      m.scale.setScalar(u.s * (0.6 + k * 0.6));
      m.material.opacity = 0.35 + k * 0.65;
    }
    for (const s of this.spinners) {
      s.obj.rotation.y += s.spin * dt;
      if (!s.base) s.base = s.obj.position.y;
      s.obj.position.y = s.base + Math.sin(t * 0.4 + s.phase) * s.bob;
    }
    this.root.rotation.y = Math.sin(t * 0.02) * 0.04;
  }
}

// Star Bonanza: the sky. Cartoon space, not the real thing: a sky painted in flat bands of colour (no smooth
// gradient), twinkly four-pointed sparkles, fat white clouds with ink outlines drifting past below the islands, a
// ringed bubblegum planet, a stripy mint one, an orange one that spins and a moon that smiles in its sleep (and
// sometimes opens one eye). Now and then a shooting star zips across. Everything bobs or turns a little.
import * as THREE from 'three';
import { toon, ink } from './stage.js';

const canvas = (w, h, draw) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

// the sky, in bands
function bands() {
  const colors = ['#1a0f5c', '#25137a', '#331a95', '#4620a8', '#6228b5', '#8a33bb', '#b942b8', '#e0558f'];
  return canvas(8, 512, (g, w, h) => {
    colors.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(0, Math.floor((i * h) / colors.length), w, Math.ceil(h / colors.length) + 1);
    });
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

function stripes(a, b, n = 7) {
  return canvas(64, 256, (g, w, h) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? a : b;
      g.fillRect(0, (i * h) / n, w, h / n + 1);
    }
  });
}

// the moon's face, painted where a sphere's texture faces +z (a quarter of the way along)
function moonTexture(openEye = false) {
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
    g.fillStyle = '#2d1b4e';
    g.lineWidth = 7;
    g.lineCap = 'round';
    [-26, 26].forEach((dx, i) => {
      if (openEye && i === 1) {
        g.beginPath();
        g.ellipse(cx + dx, cy - 6, 9, 12, 0, 0, Math.PI * 2);
        g.fill();
      } else {
        g.beginPath();
        g.arc(cx + dx, cy - 8, 11, Math.PI * 1.1, Math.PI * 1.9, true);
        g.stroke();
      }
    });
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

// a fat cartoon cloud: a few overlapping blobs, flat white with a purple underside and an ink outline
function makeCloud(scale = 1, tone = '#fdf4ff') {
  const g = new THREE.Group();
  const mat = toon(tone, { shine: 0 });
  const blobs = [[0, 0, 0, 1.5], [1.7, -0.25, 0.2, 1.15], [-1.7, -0.3, 0.1, 1.2], [0.7, 0.55, -0.2, 1.1], [-0.8, 0.45, 0, 0.95], [3.0, -0.5, 0, 0.8], [-2.9, -0.55, 0, 0.8]];
  for (const [x, y, z, r] of blobs) {
    const b = ink(new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), mat), 3.6);
    b.position.set(x, y, z);
    b.scale.setScalar(r);
    g.add(b);
  }
  g.scale.setScalar(scale);
  return g;
}

export class CartoonSky {
  constructor(stage) {
    this.stage = stage;
    stage.scene.background = bands();
    this.root = new THREE.Group();
    stage.scene.add(this.root);
    this.twinkles = [];
    this.spinners = [];
    this.clouds = [];
    this.shooter = null;
    this.nextShooter = 3;
    this.sparkle = sparkleTexture();

    // far away: little dots
    const dots = new Float32Array(700 * 3);
    for (let i = 0; i < 700; i++) {
      const a = Math.random() * Math.PI * 2;
      const y = -20 + Math.random() * 130;
      const r = 150 + Math.random() * 80;
      dots.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dots, 3));
    this.root.add(new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xfff3d6, size: 2.2, sizeAttenuation: false })));

    // closer: chunky twinkles that pulse
    const colors = ['#ffffff', '#fff1a8', '#ffc2e5', '#bdf3ff'];
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sparkle, color: colors[i % colors.length], transparent: true, depthWrite: false }));
      const a = Math.random() * Math.PI * 2;
      const r = 70 + Math.random() * 70;
      m.position.set(Math.cos(a) * r, -5 + Math.random() * 70, Math.sin(a) * r - 10);
      m.userData = { s: 1.8 + Math.random() * 2.8, phase: Math.random() * 6, speed: 1.2 + Math.random() * 2.4 };
      this.root.add(m);
      this.twinkles.push(m);
    }

    // clouds drifting past: some far behind, some below the islands (so they float on a sea of cloud)
    const layers = [
      { y: -14, z: -22, n: 6, scale: 1.9, speed: 0.5, span: 140, tone: '#cdbbf8' },
      { y: -24, z: -10, n: 5, scale: 2.4, speed: 0.3, span: 160, tone: '#a98fea' },
      { y: 6, z: -70, n: 6, scale: 4.2, speed: 0.22, span: 220, tone: '#9a7fe0' },
    ];

    for (const L of layers) {
      for (let i = 0; i < L.n; i++) {
        const c = makeCloud(L.scale * (0.8 + Math.random() * 0.5), L.tone);
        c.position.set((i / L.n - 0.5) * L.span + Math.random() * 10, L.y + Math.random() * 3, L.z - Math.random() * 6);
        c.userData = { speed: L.speed * (0.8 + Math.random() * 0.4), span: L.span, bob: Math.random() * 6, y: c.position.y };
        this.root.add(c);
        this.clouds.push(c);
      }
    }

    // a ringed bubblegum planet (the ring is a flat torus, so it gets an outline too)
    const pink = ink(new THREE.Mesh(new THREE.SphereGeometry(9, 32, 24), toon('#ff8fc7')), 5);
    pink.position.set(-48, 6, -62);
    const ring = ink(new THREE.Mesh(new THREE.TorusGeometry(14.5, 1.8, 10, 56), toon('#ffe08a')), 4);
    ring.scale.z = 0.22;
    ring.rotation.set(1.25, 0.15, 0.3);
    pink.add(ring);
    this.root.add(pink);
    this.spinners.push({ obj: pink, spin: 0.05, bob: 0.8, phase: 0 });

    // a stripy mint planet
    const mint = ink(new THREE.Mesh(new THREE.SphereGeometry(6.5, 32, 24), toon('#ffffff', { map: stripes('#7ff0c2', '#b8fff0') })), 5);
    mint.position.set(58, 12, -48);
    mint.rotation.z = 0.35;
    this.root.add(mint);
    this.spinners.push({ obj: mint, spin: 0.14, bob: 0.9, phase: 2 });

    // a little orange one, far off, with a bite out of its day: it spins faster
    const orange = ink(new THREE.Mesh(new THREE.SphereGeometry(3.4, 24, 18), toon('#ffb35c')), 4);
    orange.position.set(26, 28, -90);
    this.root.add(orange);
    this.spinners.push({ obj: orange, spin: 0.3, bob: 0.5, phase: 4 });

    // the moon, smiling in its sleep
    this.moonMat = toon('#ffffff', { map: moonTexture(), shine: 0 });
    this.moonOpen = toon('#ffffff', { map: moonTexture(true), shine: 0 });
    const moon = ink(new THREE.Mesh(new THREE.SphereGeometry(6, 32, 24), this.moonMat), 5);
    moon.position.set(-18, 32, -95);
    moon.rotation.x = 0.2;
    this.root.add(moon);
    this.moon = moon;
    this.spinners.push({ obj: moon, spin: 0, bob: 0.8, phase: 1 });

    // asteroid chunks tumbling about
    for (let i = 0; i < 8; i++) {
      const a = ink(new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), toon(['#a995d8', '#8a78c4', '#c3b2ee'][i % 3], { shine: 0 })), 3);
      const ang = Math.random() * Math.PI * 2;
      const r = 28 + Math.random() * 22;
      a.position.set(Math.cos(ang) * r, -4 + Math.random() * 14, Math.sin(ang) * r * 0.55 - 6);
      a.scale.setScalar(0.5 + Math.random() * 0.9);
      a.userData = { tumble: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(0.8), bob: Math.random() * 6, y: a.position.y };
      this.root.add(a);
      this.spinners.push({ obj: a, spin: 0, bob: 0, phase: 0, rock: true });
    }

    stage.onFrame((dt, t) => this.update(dt, t));
  }

  update(dt, t) {
    for (const m of this.twinkles) {
      const u = m.userData;
      const k = 0.5 + 0.5 * Math.sin(t * u.speed + u.phase);
      m.scale.setScalar(u.s * (0.4 + k * 0.9));
      m.material.rotation = t * 0.3 + u.phase;
      m.material.opacity = 0.3 + k * 0.7;
    }
    for (const s of this.spinners) {
      if (s.rock) {
        s.obj.rotation.x += s.obj.userData.tumble.x * dt;
        s.obj.rotation.y += s.obj.userData.tumble.y * dt;
        s.obj.position.y = s.obj.userData.y + Math.sin(t * 0.6 + s.obj.userData.bob) * 0.8;
        continue;
      }
      s.obj.rotation.y += s.spin * dt;
      if (s.base == null) s.base = s.obj.position.y;
      s.obj.position.y = s.base + Math.sin(t * 0.4 + s.phase) * s.bob;
    }
    // clouds drift to the right and come round again, puffing in and out a little
    for (const c of this.clouds) {
      const u = c.userData;
      c.position.x += u.speed * dt;
      if (c.position.x > u.span / 2 + 20) c.position.x -= u.span + 40;
      c.position.y = u.y + Math.sin(t * 0.5 + u.bob) * 0.5;
      const puff = 1 + Math.sin(t * 0.8 + u.bob) * 0.025;
      c.scale.y = c.scale.x * puff;
    }
    // the moon opens one eye now and then
    if (this.moon) this.moon.material = Math.sin(t * 0.35) > 0.96 ? this.moonOpen : this.moonMat;
    // a shooting star zips across every so often, leaving twinkles behind it
    this.nextShooter -= dt;
    if (!this.shooter && this.nextShooter <= 0) {
      const from = new THREE.Vector3(-90 + Math.random() * 60, 40 + Math.random() * 30, -80);
      this.shooter = { p: from, v: new THREE.Vector3(70 + Math.random() * 30, -22 - Math.random() * 12, 0), life: 1.4, head: new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sparkle, color: 0xfff6c0, transparent: true, depthWrite: false })) };
      this.shooter.head.scale.setScalar(7);
      this.shooter.head.position.copy(from);
      this.root.add(this.shooter.head);
      this.nextShooter = 5 + Math.random() * 6;
    }
    if (this.shooter) {
      const s = this.shooter;
      s.life -= dt;
      s.p.addScaledVector(s.v, dt);
      s.head.position.copy(s.p);
      s.head.material.rotation += dt * 8;
      if (Math.random() < 0.8) {
        const tw = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sparkle, color: 0xffd0f0, transparent: true, depthWrite: false }));
        tw.position.copy(s.p).add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0));
        tw.scale.setScalar(2.5 + Math.random() * 2);
        tw.userData = { life: 0.7 };
        this.root.add(tw);
        this.trail ||= [];
        this.trail.push(tw);
      }
      if (s.life <= 0) {
        s.head.removeFromParent();
        s.head.material.dispose();
        this.shooter = null;
      }
    }
    if (this.trail) {
      for (let i = this.trail.length - 1; i >= 0; i--) {
        const tw = this.trail[i];
        tw.userData.life -= dt;
        tw.material.opacity = Math.max(0, tw.userData.life / 0.7);
        tw.scale.multiplyScalar(1 - dt * 1.4);
        if (tw.userData.life <= 0) {
          tw.removeFromParent();
          tw.material.dispose();
          this.trail.splice(i, 1);
        }
      }
    }
  }
}

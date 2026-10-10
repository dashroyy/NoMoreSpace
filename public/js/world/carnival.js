// 🎪 The Cosmic Carnival's big top, for ships playing that script: a red and
// white circus ring painted round the bridge table, bobbing balloons tied to
// the ring, two sweeping spotlights and a little confetti drifting down.
// It appears the moment the host picks the script in the docking bay.
import * as THREE from 'three';

const RING_INNER = 7.5;
const RING_OUTER = 9.5;
const BALLOON_COLORS = [0xd7263d, 0xf5d327, 0x38d6e8, 0x7b3fe4, 0xee6fb6, 0x7fe33b, 0xf08a24];

// red and cream wedges, painted as a full circle so a flat ring can use it
function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const wedges = 28;
  for (let i = 0; i < wedges; i++) {
    g.beginPath();
    g.moveTo(256, 256);
    g.arc(256, 256, 256, (i / wedges) * Math.PI * 2, ((i + 1) / wedges) * Math.PI * 2);
    g.closePath();
    g.fillStyle = i % 2 ? '#f6f3ea' : '#d7263d';
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class CarnivalDecor {
  constructor(scene, { lowFx = false } = {}) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.active = false;

    // the circus ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(RING_INNER, RING_OUTER, 72, 1),
      new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, opacity: 0.8, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.022;
    this.group.add(ring);
    for (const r of [RING_INNER, RING_OUTER]) {
      const edge = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 6, 72), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa800, emissiveIntensity: 0.9 }));
      edge.rotation.x = Math.PI / 2;
      edge.position.y = 0.06;
      this.group.add(edge);
    }

    // balloons tied to the outside of the ring
    this.balloons = [];
    const count = lowFx ? 8 : 16;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.2;
      const r = RING_OUTER + 0.1;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const color = BALLOON_COLORS[i % BALLOON_COLORS.length];
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.1, emissive: color, emissiveIntensity: 0.25 }));
      b.scale.set(1, 1.2, 1);
      const height = 2.0 + (i % 4) * 0.35;
      b.position.set(x, height, z);
      this.group.add(b);
      const string = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0.05, z), new THREE.Vector3(x, height - 0.4, z)]), new THREE.LineBasicMaterial({ color: 0xcccccc }));
      this.group.add(string);
      this.balloons.push({ mesh: b, base: height, phase: i * 1.3 });
    }

    // two spotlights sweeping the ring
    this.lights = [];
    for (const [side, color] of [[-1, 0xfff0a0], [1, 0xa0e8ff]]) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(2.2, 4.6, 20, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      const pivot = new THREE.Group();
      pivot.position.set(side * 9, 4.6, -9.4);
      cone.position.y = -2.3;
      pivot.add(cone);
      this.group.add(pivot);
      this.lights.push({ pivot, side });
    }

    // confetti, slowly falling
    this.confetti = [];
    const n = lowFx ? 30 : 70;
    this.confettiPos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1 + Math.random() * 8.5;
      this.confetti.push({ x: Math.cos(a) * r, y: Math.random() * 4, z: Math.sin(a) * r, speed: 0.25 + Math.random() * 0.35, sway: Math.random() * 6 });
      const c = new THREE.Color(BALLOON_COLORS[i % BALLOON_COLORS.length]);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.confettiPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  setActive(on) {
    this.active = on;
    this.group.visible = on;
  }

  update(t, dt) {
    if (!this.active) return;
    for (const b of this.balloons) {
      b.mesh.position.y = b.base + Math.sin(t * 0.9 + b.phase) * 0.18;
      b.mesh.position.x += Math.sin(t * 0.7 + b.phase) * 0.0008;
    }
    for (const l of this.lights) {
      l.pivot.rotation.z = l.side * (0.5 + Math.sin(t * 0.55 + l.side) * 0.35);
      l.pivot.rotation.x = 0.55 + Math.cos(t * 0.4 + l.side * 2) * 0.25;
    }
    this.confetti.forEach((c, i) => {
      c.y -= c.speed * dt;
      if (c.y < 0) c.y = 4;
      this.confettiPos.set([c.x + Math.sin(t * 0.8 + c.sway) * 0.3, c.y, c.z + Math.cos(t * 0.6 + c.sway) * 0.3], i * 3);
    });
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

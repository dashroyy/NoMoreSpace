// Dust in the air: a few hundred specks drifting slowly around wherever the camera is looking, catching the light.
// It gives the rooms depth (the specks nearest the camera are big and soft, the far ones tiny) at almost no cost.
import * as THREE from 'three';

const BOX = { x: 26, y: 7, z: 22 }; // the space the specks fill, centred on the camera's target
const COUNT = 260;

function speck() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class Dust {
  constructor(scene, { lowFx = false } = {}) {
    const n = lowFx ? COUNT / 2 : COUNT;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * BOX.x;
      this.pos[i * 3 + 1] = 0.3 + Math.random() * BOX.y;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * BOX.z;
      this.vel[i * 3] = (Math.random() - 0.5) * 0.12;
      this.vel[i * 3 + 1] = (Math.random() - 0.3) * 0.06;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.12;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.09, map: speck(), color: 0xcfe0ff, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  // centre: where the camera is looking; visible: whether there is a room to fill (not on the title screen or at night)
  update(dt, t, centre, visible) {
    this.points.visible = visible;
    if (!visible) return;
    const p = this.pos;
    const v = this.vel;
    const hx = BOX.x / 2;
    const hz = BOX.z / 2;
    for (let i = 0; i < p.length; i += 3) {
      p[i] += (v[i] + Math.sin(t * 0.3 + i) * 0.03) * dt;
      p[i + 1] += v[i + 1] * dt;
      p[i + 2] += v[i + 2] * dt;
      // wrap round the box that follows the camera, so there is always dust where you look
      if (p[i] - centre.x > hx) p[i] -= BOX.x;
      else if (p[i] - centre.x < -hx) p[i] += BOX.x;
      if (p[i + 2] - centre.z > hz) p[i + 2] -= BOX.z;
      else if (p[i + 2] - centre.z < -hz) p[i + 2] += BOX.z;
      if (p[i + 1] > BOX.y + 0.3) p[i + 1] = 0.3;
      else if (p[i + 1] < 0.3) p[i + 1] = BOX.y + 0.3;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.material.opacity = 0.32 + Math.sin(t * 0.7) * 0.06;
  }
}

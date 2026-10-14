// Ruler of the Galaxy: the quantum dice, in 3D. Each die is a rounded cube with a glowing picture on every face.
// A roll throws the free dice into the tray, where they tumble, bounce and settle face up; kept dice lift and glow
// gold and stay put. Tap a die to keep it (on your own turn).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { drawFace } from './faces.js';

const FACES = ['1', '2', '3', 'repair', 'laser', 'shard']; // material slots: +x, -x, +y, -y, +z, -z
// the turn that brings each slot's face to the top, and which way is "up" on that face's picture
const TO_TOP = [new THREE.Euler(0, 0, Math.PI / 2), new THREE.Euler(0, 0, -Math.PI / 2), new THREE.Euler(0, 0, 0), new THREE.Euler(Math.PI, 0, 0), new THREE.Euler(-Math.PI / 2, 0, 0), new THREE.Euler(Math.PI / 2, 0, 0)];
const PIC_UP = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0)];
const SPACING = 1.3;
const Y = new THREE.Vector3(0, 1, 0);

let MATERIALS = null;
function materials() {
  if (MATERIALS) return MATERIALS;
  MATERIALS = FACES.map((f) => {
    const tex = new THREE.CanvasTexture(drawFace(f));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.25 });
  });
  return MATERIALS;
}

// the quaternion that shows `face` on top, its picture upright for a camera looking from +z
function restingTurn(face, yawJitter = 0) {
  const slot = FACES.indexOf(face);
  const q = new THREE.Quaternion().setFromEuler(TO_TOP[slot]);
  const up = PIC_UP[slot].clone().applyQuaternion(q);
  const yaw = Math.atan2(up.x, -up.z); // turn so the picture's top points away from the camera
  return new THREE.Quaternion().setFromAxisAngle(Y, yaw + yawJitter).multiply(q);
}

export class DiceTray {
  constructor(host, { onToggle } = {}) {
    this.host = host;
    this.onToggle = onToggle;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 4, 0.1, 100);
    this.scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x2a1440, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-3, 8, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9f7bff, 1.2);
    rim.position.set(4, 3, -5);
    this.scene.add(rim);
    this.geo = new RoundedBoxGeometry(1, 1, 1, 4, 0.16);
    this.dice = [];
    this.count = 0;
    this.enabled = false;
    this.raycaster = new THREE.Raycaster();
    this.hover = -1;
    const pointer = (e) => {
      const r = this.renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      const i = this.pick(pointer(e));
      if (i >= 0) this.onToggle?.(i);
    });
    this.renderer.domElement.addEventListener('pointermove', (e) => {
      this.hover = this.enabled ? this.pick(pointer(e)) : -1;
      this.renderer.domElement.style.cursor = this.hover >= 0 ? 'pointer' : '';
    });
    this.renderer.domElement.addEventListener('pointerleave', () => (this.hover = -1));
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.clock = new THREE.Clock();
    const loop = () => {
      requestAnimationFrame(loop);
      if (document.hidden || !this.host.isConnected || this.host.offsetParent === null) return;
      this.update(Math.min(0.05, this.clock.getDelta()));
    };
    requestAnimationFrame(loop);
  }

  resize() {
    const w = this.host.clientWidth || 600;
    const h = this.host.clientHeight || 160;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.frame();
  }

  // stand the camera back far enough to see every die
  frame() {
    const n = Math.max(6, this.count);
    const width = n * SPACING + 0.3;
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = Math.max((width / 2 / Math.tan(fov / 2)) / this.camera.aspect, 2.2 / Math.tan(fov / 2));
    // from high above, so the top faces read clearly
    this.camera.position.set(0, dist * 0.94, dist * 0.36);
    this.camera.lookAt(0, 0, 0.05);
    this.camera.updateProjectionMatrix();
  }

  slot(i) {
    return new THREE.Vector3((i - (this.count - 1) / 2) * SPACING, 0, 0);
  }

  // make sure there are n dice
  ensure(n) {
    if (this.count === n) return;
    while (this.dice.length < n) {
      const mesh = new THREE.Mesh(this.geo, materials());
      const glow = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 40), new THREE.MeshBasicMaterial({ color: 0xffb800, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      glow.rotation.x = -Math.PI / 2;
      this.scene.add(mesh, glow);
      this.dice.push({ mesh, glow, face: null, kept: false, anim: null, rest: new THREE.Quaternion(), lift: 0 });
    }
    this.dice.forEach((d, i) => {
      d.mesh.visible = i < n && !!d.face; // a die nobody has rolled yet stays hidden
      d.glow.visible = i < n;
    });
    this.count = n;
    this.frame();
    for (let i = 0; i < n; i++) {
      const d = this.dice[i];
      if (!d.anim) d.mesh.position.copy(this.slot(i));
    }
  }

  // show these faces without throwing (catching up, or the dice of whoever's turn it is now)
  set(faces, kept = []) {
    this.ensure(faces.length);
    faces.forEach((f, i) => {
      const d = this.dice[i];
      d.kept = !!kept[i];
      if (f && f !== d.face && !d.anim) {
        d.rest = restingTurn(f, (Math.random() - 0.5) * 0.25);
        d.mesh.quaternion.copy(d.rest);
      }
      d.face = f;
      d.mesh.visible = !!f;
    });
  }

  // throw the dice that are not kept: they land showing `faces`
  roll(faces, kept = []) {
    this.ensure(faces.length);
    faces.forEach((f, i) => {
      const d = this.dice[i];
      d.kept = !!kept[i];
      if (d.kept && d.face === f && d.mesh.visible) return;
      d.face = f;
      d.mesh.visible = true;
      d.rest = restingTurn(f, (Math.random() - 0.5) * 0.25);
      const end = this.slot(i);
      const start = end.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 3.5 + Math.random() * 1.5, 3 + Math.random() * 1.5));
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      d.anim = { t: -i * 0.05, dur: 0.95 + Math.random() * 0.25, start, end, axis, spins: 3 + Math.random() * 3 };
    });
  }

  clear() {
    for (const d of this.dice) {
      d.face = null;
      d.kept = false;
      d.mesh.visible = false;
      d.anim = null;
    }
  }

  setKept(kept) {
    this.dice.forEach((d, i) => (d.kept = !!kept[i]));
  }

  pick(v) {
    this.raycaster.setFromCamera(v, this.camera);
    const hits = this.raycaster.intersectObjects(this.dice.filter((d) => d.mesh.visible).map((d) => d.mesh));
    return hits.length ? this.dice.findIndex((d) => d.mesh === hits[0].object) : -1;
  }

  update(dt) {
    const t = performance.now() / 1000;
    this.dice.forEach((d, i) => {
      if (!d.mesh.visible) return;
      if (d.anim) {
        const a = d.anim;
        a.t += dt;
        const k = Math.max(0, Math.min(1, a.t / a.dur));
        // fly in on an arc, then two little bounces
        const fly = Math.min(1, k / 0.62);
        const pos = a.start.clone().lerp(a.end, 1 - Math.pow(1 - fly, 2));
        let y = pos.y;
        if (k >= 0.62) {
          const b = (k - 0.62) / 0.38;
          y = Math.abs(Math.sin(b * Math.PI * 2)) * 0.45 * (1 - b);
        }
        d.mesh.position.set(pos.x, y + 0.5, pos.z);
        // tumble, slowing into the resting face
        const spin = new THREE.Quaternion().setFromAxisAngle(a.axis, a.spins * Math.PI * 2 * Math.pow(1 - k, 2));
        d.mesh.quaternion.copy(spin.multiply(d.rest));
        if (k >= 1) d.anim = null;
      } else {
        const lift = d.kept ? 0.32 : i === this.hover ? 0.14 : 0;
        d.lift += (lift - d.lift) * Math.min(1, dt * 10);
        const base = this.slot(i);
        d.mesh.position.set(base.x, 0.5 + d.lift + (d.kept ? Math.sin(t * 3 + i) * 0.03 : 0), base.z);
        d.mesh.quaternion.slerp(d.rest, Math.min(1, dt * 8));
      }
      d.glow.position.set(d.mesh.position.x, 0.02, d.mesh.position.z);
      d.glow.material.opacity += ((d.kept ? 0.9 : i === this.hover ? 0.35 : 0) - d.glow.material.opacity) * Math.min(1, dt * 10);
      d.glow.scale.setScalar(d.kept ? 1 + Math.sin(t * 4 + i) * 0.05 : 1);
    });
    this.renderer.render(this.scene, this.camera);
  }
}

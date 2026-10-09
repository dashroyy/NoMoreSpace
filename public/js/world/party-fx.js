// Little moments in the 3D ship that come from the players themselves:
// emoji reactions floating up, glowing rings under whoever is talking on
// voice chat, and the ghosts' pranks (flickering lights, a crate falling out
// of nowhere, a pumpkin that cackles).
import * as THREE from 'three';
import { makeTextSprite, disposeTree } from './avatar.js';
import { ROOMS, roomById } from './layout.js';

const RING_GEO = new THREE.RingGeometry(0.55, 0.72, 32);
const CRATE_GEO = new THREE.BoxGeometry(0.7, 0.7, 0.7);

export class PartyFx {
  constructor(world) {
    this.world = world;
    this.floaters = []; // { obj, life, rise }
    this.crates = []; // { mesh, vy, spin, life }
    this.speaking = new Set();
    this.rings = new Map(); // avatar id -> ring mesh
  }

  // An emoji floats up from above someone's head.
  reaction(id, emoji) {
    const a = this.world.avatars.get(id);
    if (!a || !a.root.visible) return;
    const sprite = makeTextSprite(emoji, { size: 64, scale: 0.0085 });
    sprite.position.set(a.root.position.x + (Math.random() - 0.5) * 0.6, 2.6, a.root.position.z);
    this.world.scene.add(sprite);
    this.floaters.push({ obj: sprite, life: 1.8, max: 1.8, rise: 1.2, sway: Math.random() * 6 });
  }

  // A ghost's prank in a room. Returns true if it happened in view of the player.
  haunt(kind, roomId) {
    const room = roomById(roomId);
    if (!room) return;
    const [x0, z0, x1, z1] = room.rect;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const t = this.world.clock.elapsedTime;
    if (kind === 'flicker') {
      const light = this.world.ship.lights[ROOMS.indexOf(room)];
      if (light) light.userData.hauntUntil = t + 3.2;
    }
    if (kind === 'crate') {
      const mesh = new THREE.Mesh(CRATE_GEO, new THREE.MeshStandardMaterial({ color: 0x8a6a3b, roughness: 0.8, transparent: true }));
      let x = cx + (Math.random() - 0.5) * (x1 - x0) * 0.5;
      let z = cz + (Math.random() - 0.5) * (z1 - z0) * 0.4;
      if (roomId === 'bridge') {
        // keep clear of the big round table in the middle
        const a = Math.random() * Math.PI * 2;
        x = Math.cos(a) * 7.2;
        z = Math.sin(a) * 7.2;
      }
      mesh.position.set(x, 4.5, z);
      mesh.rotation.set(Math.random(), Math.random(), Math.random());
      this.world.scene.add(mesh);
      this.crates.push({ mesh, vy: 0, spin: new THREE.Vector3(Math.random() * 4, Math.random() * 4, Math.random() * 4), life: 9, bounced: false });
    }
    if (kind === 'cackle') {
      const sprite = makeTextSprite('🎃 hehehe…', { size: 46, scale: 0.012, color: '#ffb347' });
      sprite.position.set(cx, 1.6, cz);
      this.world.scene.add(sprite);
      this.floaters.push({ obj: sprite, life: 3, max: 3, rise: 0.5, sway: 0, shake: true });
      const light = this.world.ship.lights[ROOMS.indexOf(room)];
      if (light) light.userData.hauntUntil = t + 1.2;
    }
  }

  // "…" over someone's head while they type a message
  typing(id, on) {
    this.typists ||= new Map();
    const old = this.typists.get(id);
    if (old) {
      disposeTree(old.sprite);
      this.typists.delete(id);
    }
    const a = this.world.avatars.get(id);
    if (!on || !a) return;
    const sprite = makeTextSprite('💬 …', { size: 40, scale: 0.01, color: '#14102a', bg: 'rgba(245,242,255,0.92)' });
    sprite.position.y = 2.75;
    a.root.add(sprite);
    this.typists.set(id, { sprite, until: performance.now() + 6000 });
  }

  // The docking-bay ball: a giant rubber duck in a space helmet. The server
  // moves it; we glide it to each new position. pos: [x, z, vx, vz]
  ball([x, z, vx, vz]) {
    if (!this.duck) this.duck = buildDuck(this.world.scene);
    this.duckTarget = { x, z, vx, vz, at: performance.now() };
    if (!this.duck.visible) this.duck.position.set(x, 0.75, z);
    this.duck.visible = true;
  }

  // ids of everyone talking on voice chat right now
  setSpeaking(ids) {
    this.speaking = ids;
  }

  update(dt, t) {
    // the duck: only in the docking bay
    if (this.duck) {
      if (this.world.phase !== 'lobby') this.duck.visible = false;
      else if (this.duckTarget) {
        const d = this.duckTarget;
        const ahead = Math.min(0.15, (performance.now() - d.at) / 1000);
        const k = 1 - Math.exp(-dt * 10);
        this.duck.position.x += (d.x + d.vx * ahead - this.duck.position.x) * k;
        this.duck.position.z += (d.z + d.vz * ahead - this.duck.position.z) * k;
        this.duck.position.y = 0.75 + Math.abs(Math.sin(t * 2.2)) * 0.12;
        const speed = Math.hypot(d.vx, d.vz);
        if (speed > 0.3) this.duck.rotation.y = Math.atan2(d.vx, d.vz);
        this.duck.rotation.z = Math.sin(t * 3) * 0.08 + Math.min(0.4, speed * 0.04); // wobbles when kicked
      }
    }
    // typing dots bob, and time out if someone stops halfway
    for (const [id, ty] of this.typists || []) {
      ty.sprite.position.y = 2.75 + Math.sin(t * 6) * 0.04;
      if (performance.now() > ty.until || this.world.avatars.get(id)?.bubble) this.typing(id, false);
    }
    // floating emoji and cackles
    for (const f of this.floaters) {
      f.life -= dt;
      f.obj.position.y += f.rise * dt;
      if (f.sway) f.obj.position.x += Math.sin(t * 4 + f.sway) * dt * 0.3;
      if (f.shake) f.obj.material.rotation = Math.sin(t * 30) * 0.12;
      f.obj.material.opacity = Math.min(1, f.life / (f.max * 0.4));
      if (f.life <= 0) disposeTree(f.obj);
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);

    // crates that fall out of nowhere, bounce and fade away
    for (const c of this.crates) {
      c.life -= dt;
      const m = c.mesh;
      if (m.position.y > 0.35 || c.vy > 0) {
        c.vy -= 14 * dt;
        m.position.y += c.vy * dt;
        m.rotation.x += c.spin.x * dt;
        m.rotation.y += c.spin.y * dt;
        m.rotation.z += c.spin.z * dt;
        if (m.position.y <= 0.35) {
          m.position.y = 0.35;
          if (!c.bounced) {
            c.bounced = true;
            c.vy = 3.2;
            this.world.rumble?.(0.25);
          } else {
            c.vy = 0;
            m.rotation.set(0, m.rotation.y, 0);
          }
        }
      }
      if (c.life < 1.5) m.material.opacity = Math.max(0, c.life / 1.5);
      if (c.life <= 0) {
        m.removeFromParent();
        m.material.dispose();
      }
    }
    this.crates = this.crates.filter((c) => c.life > 0);

    // a soft pulsing ring under anyone who is talking
    for (const [id, a] of this.world.avatars) {
      const on = this.speaking.has(id) && a.root.visible;
      let ring = this.rings.get(id);
      if (on && !ring) {
        ring = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color: 0x7dffa8, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.04;
        a.root.add(ring);
        this.rings.set(id, ring);
      }
      if (ring) {
        ring.visible = on;
        if (on) ring.scale.setScalar(1 + Math.sin(t * 9) * 0.08);
      }
    }
    for (const [id, ring] of this.rings) {
      if (!this.world.avatars.has(id)) {
        ring.removeFromParent();
        ring.material.dispose();
        this.rings.delete(id);
      }
    }
  }
}

// A big rubber duck in a glass space helmet.
function buildDuck(scene) {
  const g = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({ color: 0xffd93b, roughness: 0.45 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xff8a1a, roughness: 0.5 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 14), yellow);
  body.scale.set(1, 0.82, 1.2);
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 18, 12), yellow);
  head.position.set(0, 0.55, 0.42);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 10), orange);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.5, 0.86);
  g.add(beak);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), black);
    eye.position.set(s * 0.15, 0.66, 0.74);
    g.add(eye);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.35, 8), yellow);
  tail.rotation.x = -2.2;
  tail.position.set(0, 0.25, -0.75);
  g.add(tail);
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.52, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0xbfefff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.3, depthWrite: false }),
  );
  helmet.position.copy(head.position);
  g.add(helmet);
  g.visible = false;
  scene.add(g);
  return g;
}

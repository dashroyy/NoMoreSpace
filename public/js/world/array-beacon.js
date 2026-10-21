// The Observation Array's beacon: a little hologram floating over the Observation Deck's telescope console that shows
// how charged the Array is, so everybody in the ship can see what the tasks are adding up to.
//
//   three cyan rings light up one after another as the Array fills towards its clue
//   the orb turns gold when it is charged, and a big gold halo appears when it is overcharged (a bonus clue)
//   every finished task makes it flash and spin faster for a moment
import * as THREE from 'three';

const glow = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });

export class ArrayBeacon {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.y = 3.1;
    this.group.userData.dynamic = true;
    this.orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 1), glow(0x6cf0ff, 0.9));
    this.group.add(this.orb);
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.group.add(this.core);
    // three rings (a third of the charge each) and a gold halo for the bonus
    this.rings = [0.45, 0.6, 0.75].map((r, i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 6, 40), glow(0x6cf0ff, 0.1));
      ring.rotation.x = Math.PI / 2 + i * 0.5;
      ring.rotation.y = i * 0.9;
      this.group.add(ring);
      return ring;
    });
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.04, 6, 48), glow(0xffd23f, 0));
    this.halo.rotation.x = Math.PI / 2.4;
    this.group.add(this.halo);
    // a faint beam up to the ceiling, so it can be seen from across the room
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.2, 2.4, 10, 1, true), glow(0x6cf0ff, 0));
    this.beam.position.y = -1.3;
    this.group.add(this.beam);
    this.level = 0; // smoothed 0..1 (of the clue charge)
    this.want = 0;
    this.bonus = 0;
    this.wantBonus = 0;
    this.flash = 0;
    this.lastCharge = null;
  }

  set(charge, needed) {
    const n = Math.max(1, needed);
    this.want = Math.min(1, charge / n);
    this.wantBonus = Math.min(1, Math.max(0, charge - n) / n);
    if (this.lastCharge != null && charge > this.lastCharge) this.flash = 1;
    this.lastCharge = charge;
  }

  update(dt, t) {
    const k = Math.min(1, dt * 3);
    this.level += (this.want - this.level) * k;
    this.bonus += (this.wantBonus - this.bonus) * k;
    this.flash = Math.max(0, this.flash - dt * 1.6);
    const charged = this.level > 0.98;
    const spin = 0.6 + this.level * 1.2 + this.flash * 5;
    this.rings.forEach((ring, i) => {
      // ring i lights when the charge passes its third
      const lit = Math.max(0, Math.min(1, this.level * 3 - i));
      ring.material.opacity = 0.12 + lit * 0.75 + this.flash * 0.2;
      ring.material.color.setHex(charged ? 0xffd23f : 0x6cf0ff);
      ring.rotation.z += dt * spin * (i % 2 ? -1 : 1) * (1 + i * 0.4);
    });
    this.halo.material.opacity = this.bonus * 0.9;
    this.halo.rotation.z += dt * (1 + this.flash * 4);
    this.orb.material.color.setHex(charged ? 0xffd23f : 0x6cf0ff);
    this.orb.material.opacity = 0.35 + this.level * 0.55;
    this.orb.rotation.y += dt * spin;
    this.orb.scale.setScalar(0.8 + this.level * 0.5 + this.flash * 0.7 + Math.sin(t * 3) * 0.04);
    this.core.scale.setScalar(0.6 + this.level * 0.8 + this.flash);
    this.beam.material.opacity = 0.05 + this.level * 0.2 + this.flash * 0.25;
    this.group.position.y = 3.1 + Math.sin(t * 1.4) * 0.08;
  }
}

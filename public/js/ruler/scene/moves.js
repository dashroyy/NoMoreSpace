// Ruler of the Galaxy: how each contender fights and how each one arrives.
//
//   Mecha-Nova Prime   twin plasma bolts      /  drops out of orbit on a column of light and lands with a thump
//   The Void Kraken    lashing tendrils       /  climbs out of a spinning rift in space
//   Cyber-Hive Xenos   a swarm of drones      /  assembles itself out of a cloud of drones
//   Solaris Star-Eater a solar lance          /  ignites, a star being born
//   Chronos Syndicate  rings of stopped time  /  phases in through a collapsing clock
//   Goliath            hurled rocks           /  falls from the sky as a meteor
//
// attack() and entrance() only draw things (with the Effects library); the game's rules never wait for them.
import * as THREE from 'three';
import { sfx } from '../sound.js';
import { contender } from '../net.js';

const UP = new THREE.Vector3(0, 1, 0);
const later = (ms, fn) => setTimeout(fn, ms);
const rnd = (a = 1) => (Math.random() - 0.5) * a;

// the weapon timings come from the server ("strike" in data.js), which waits the same time before the damage lands:
// charge (from starting to gather power until the shot leaves), flight (until it lands) and gap (between shots)
const DEFAULT_STRIKE = { charge: 0.4, flight: 0.3, gap: 0.14 };
export const strikeOf = (style) => contender(style)?.strike || DEFAULT_STRIKE;

// how long a volley of n shots takes from the first charge to the last impact, in seconds
export const volleyTime = (style, n = 1) => {
  const s = strikeOf(style);
  return s.charge + s.flight + Math.max(0, n - 1) * s.gap;
};

// one weapon sound each
export const SHOT = { mechanova: 'laser', kraken: 'tendril', hive: 'buzz', stareater: 'beam', chronos: 'tick', goliath: 'lob' };

// the opening of a game: the flagships arrive one after another (the server waits the same time before the first turn)
export const INTRO = { lead: 0.5, step: 0.7 };
export const introTime = (n) => INTRO.lead + INTRO.step * (n - 1) + 1.5;

const side = (a, b) => new THREE.Vector3().subVectors(b, a).cross(UP).normalize();
const ground = (p) => new THREE.Vector3(p.x, 0, p.z);

// ---------------------------------------------------------------------------
// Attacks: (fx, from, to, shotIndex, colour, delay in seconds)
// ---------------------------------------------------------------------------
const ATTACKS = {
  // two parallel plasma bolts and a ring of light at the muzzle
  mechanova(fx, a, b, i, color, d) {
    const off = side(a, b).multiplyScalar(0.32);
    fx.bolt(a.clone().add(off), b.clone().add(off), color, d, 0.11);
    fx.bolt(a.clone().sub(off), b.clone().sub(off), color, d + 0.05, 0.11);
    fx.ringFacing(a, b.clone().sub(a), color, 0.3, 2.1, 0.32, d);
    fx.burst(a, 0xffffff, 10, 3.5, d, 0.4, 0.16);
  },

  // a tendril snaking out in an S and snapping back, and an ink burst where it lands
  kraken(fx, a, b, i, color, d) {
    const s = side(a, b);
    const w = (i % 2 ? 1 : -1) * (1.3 + Math.random());
    const pts = [a.clone(), a.clone().lerp(b, 0.3).addScaledVector(s, w).add(new THREE.Vector3(0, 1.2, 0)), a.clone().lerp(b, 0.66).addScaledVector(s, -w * 0.7).add(new THREE.Vector3(0, 0.5, 0)), b.clone()];
    fx.tube(pts, color, 0.14, 0.8, d);
    fx.flash(b, color, 3.6, d + 0.3);
    fx.burst(b, color, 26, 4.2, d + 0.3, 0.9, 0.3);
    fx.shockwave(b, color, 3.2, d + 0.3, 0.5);
  },

  // a cloud of little drones swarming out, curving round and swarming in
  hive(fx, a, b, i, color, d) {
    const n = 18;
    const pos = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: fx.dotTexture(), color: 0xfff08a, size: 0.34, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const s = side(a, b);
    const bees = Array.from({ length: n }, (_, j) => ({ at: j * 0.018 + Math.random() * 0.06, w: rnd(5), h: rnd(2.5), spin: 3 + Math.random() * 4, ph: Math.random() * 6 }));
    const fly = 0.5;
    fx.add(
      pts,
      (t) => {
        if (t > fly + 0.45) return false;
        for (let j = 0; j < n; j++) {
          const bee = bees[j];
          const k = Math.min(1, Math.max(0, (t - bee.at) / fly));
          const e = k * k * (3 - 2 * k);
          const p = a.clone().lerp(b, e);
          const bend = Math.sin(Math.PI * e);
          p.addScaledVector(s, bee.w * bend + Math.sin(t * bee.spin + bee.ph) * 0.3 * bend);
          p.y += bee.h * bend + Math.cos(t * bee.spin + bee.ph) * 0.25 * bend;
          pos.set([p.x, p.y, p.z], j * 3);
        }
        geo.attributes.position.needsUpdate = true;
        pts.material.opacity = t < fly + 0.2 ? 1 : 1 - (t - fly - 0.2) / 0.25;
        return true;
      },
      d,
    );
    for (let j = 0; j < n; j += 3) fx.burst(b.clone().add(new THREE.Vector3(rnd(0.8), rnd(0.8), rnd(0.8))), 0xfff08a, 8, 3, d + bees[j].at + fly, 0.5, 0.2);
    fx.flash(b, color, 3.2, d + fly + 0.05);
  },

  // a fat beam of sunlight that holds for a moment
  stareater(fx, a, b, i, color, d) {
    fx.beam(a, b, 0xffb347, { life: 0.85, width: 0.42, delay: d });
    fx.shockwave(b, 0xffd36b, 6.5, d + 0.1, 0.8);
    fx.burst(b, 0xffd36b, 44, 5.5, d + 0.1, 1.1, 0.3);
    fx.flash(b, 0xffffff, 6, d + 0.08);
    fx.smoke(b, 5, 0x5a3a1a, 1.4, 1.2, d + 0.2);
  },

  // rings of frozen time flying one after another, and a clock face opening where they land
  chronos(fx, a, b, i, color, d) {
    const dir = b.clone().sub(a);
    for (let k = 0; k < 5; k++) fx.ringFacing(a, dir, color, 0.6, 1.5, 0.5, d + k * 0.06, b);
    fx.clockFlash(b, color, d + 0.5);
    fx.flash(b, color, 3.5, d + 0.5);
    fx.burst(b, 0xffffff, 18, 3, d + 0.5, 0.6, 0.18);
  },

  // a burning rock lobbed in a high arc that cracks the ground where it lands
  goliath(fx, a, b, i, color, d) {
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshStandardMaterial({ color: 0x6a5a52, emissive: 0xff5a1a, emissiveIntensity: 1.5, roughness: 0.8 }));
    const g = new THREE.Group();
    g.add(rock);
    const arc = 3.5 + a.distanceTo(b) * 0.2;
    const flight = 0.8;
    fx.add(
      g,
      (t) => {
        const k = t / flight;
        if (k >= 1) return false;
        g.position.lerpVectors(a, b, k);
        g.position.y += Math.sin(Math.PI * k) * arc;
        rock.rotation.x += 0.2;
        rock.rotation.z += 0.13;
        fx.trail(g.position, color);
        return true;
      },
      d,
    );
    const land = d + flight;
    const g0 = ground(b);
    fx.flash(b, 0xffe0a0, 5, land);
    fx.shockwave(g0, 0xff7a1a, 6.5, land, 0.8);
    fx.chunks(g0, 0xff7a1a, 9, 5, 0.26, 1.7, land);
    fx.crater(g0, 0xff6a00, 1.7, 2.8, land);
    fx.smoke(g0, 4, 0x4a3a30, 1.4, 1.4, land);
  },
};

export function attack(fx, style, from, to, i, color, delay = 0) {
  (ATTACKS[style] || ATTACKS.mechanova)(fx, from, to, i, color, delay);
}

// the weapon gathering power before it fires
export function charge(fx, ship) {
  const style = ship.id;
  const t = strikeOf(style).charge;
  const at = ship.muzzle();
  const big = style === 'stareater';
  fx.converge(at, ship.color, { count: big ? 70 : 34, radius: big ? 4.2 : 2.8, life: t });
  fx.chargeOrb(at, ship.color, t, big ? 4.4 : 2.4);
  ship.charge(t);
  sfx('charge');
  return t;
}

// ---------------------------------------------------------------------------
// Entrances: (fx, ship, where it will stand, colour). They also tell the ship how to move (ship.beginEntrance).
// ---------------------------------------------------------------------------
export const ENTRANCE = { mechanova: 1.35, kraken: 1.5, hive: 1.35, stareater: 1.25, chronos: 1.4, goliath: 1.4 };

// a portal on the ground: rings turning, a black disc, and sparks spiralling in
function portal(fx, at, color, life = 1.6) {
  const g = new THREE.Group();
  const rings = [1.0, 1.5, 2.0].map((r, i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07 + i * 0.015, 8, 56), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = Math.PI / 2;
    g.add(m);
    return m;
  });
  const hole = new THREE.Mesh(new THREE.CircleGeometry(1.35, 40), new THREE.MeshBasicMaterial({ color: 0x05020c, side: THREE.DoubleSide }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.04;
  g.add(hole);
  g.position.copy(at).setY(0.05);
  fx.add(g, (t) => {
    const k = t / life;
    if (k >= 1) return false;
    const open = k < 0.25 ? k / 0.25 : k > 0.78 ? Math.max(0.001, 1 - (k - 0.78) / 0.22) : 1;
    g.scale.setScalar(open * 1.4);
    rings.forEach((m, i) => {
      m.rotation.z = t * (3 - i) * (i % 2 ? -1 : 1);
      m.material.opacity = 0.9 * Math.min(1, open * 1.5);
    });
    return true;
  });
  fx.converge(at.clone().setY(0.2), color, { count: 50, radius: 3.6, life: 0.9, size: 0.26 });
}

const ENTER = {
  // a column of light drops from orbit, and the mech lands in a burst of dust
  mechanova(fx, ship, at, color) {
    fx.beam(at.clone().add(new THREE.Vector3(0, 32, 0)), at.clone().add(new THREE.Vector3(0, 0.2, 0)), color, { life: 1.05, width: 0.22, pulse: 0 });
    const land = 0.98;
    fx.flash(at, 0xffffff, 9, land);
    fx.shockwave(at, color, 9, land, 0.9);
    fx.shockwave(at, 0xffffff, 5, land + 0.05, 0.6);
    fx.dust(at, 6, land);
    fx.burst(at, 0xffffff, 40, 7, land, 0.9, 0.22);
    fx.crater(at, color, 1.9, 2.4, land);
    later(land * 1000, () => {
      fx.stage.shake(0.55);
      fx.stage.punch(0.5);
      sfx('thud');
    });
    later(80, () => sfx('drop'));
  },

  // a rift tears open on the floor and the Kraken pulls itself out of it
  kraken(fx, ship, at, color) {
    portal(fx, at, color, 1.7);
    fx.shockwave(at, color, 6, 0.25, 0.8);
    fx.burst(at.clone().setY(0.5), color, 50, 5, 0.55, 1.2, 0.3);
    later(100, () => sfx('portal'));
    later(650, () => fx.stage.shake(0.35));
  },

  // a cloud of drones rushes together and builds the hive
  hive(fx, ship, at, color) {
    const c = at.clone().add(new THREE.Vector3(0, 1.4, 0));
    fx.converge(c, color, { count: 120, radius: 8, life: 1.05, size: 0.32 });
    fx.converge(c, 0xfff08a, { count: 60, radius: 5, life: 0.9, delay: 0.15, size: 0.26 });
    fx.flash(c, color, 8, 1.05);
    fx.shockwave(at, color, 6, 1.05, 0.7);
    later(60, () => sfx('swarm'));
    later(1050, () => fx.stage.shake(0.25));
  },

  // a flare swells into a star, then settles
  stareater(fx, ship, at, color) {
    const c = at.clone().add(new THREE.Vector3(0, 1.4, 0));
    fx.chargeOrb(c, 0xfff1c4, 0.5, 10);
    fx.converge(c, 0xffb347, { count: 80, radius: 5, life: 0.5 });
    fx.flash(c, 0xffffff, 13, 0.5);
    fx.shockwave(at, 0xffb347, 11, 0.5, 1.0);
    fx.shockwave(at, 0xffffff, 6, 0.55, 0.6);
    fx.burst(c, 0xffb347, 90, 8.5, 0.5, 1.3, 0.4);
    later(30, () => sfx('ignite'));
    later(500, () => {
      fx.stage.shake(0.4);
      fx.stage.punch(0.6);
    });
  },

  // three clock-rings spin inwards and the ship snaps into place through the glitch
  chronos(fx, ship, at, color) {
    const c = at.clone().add(new THREE.Vector3(0, 1.4, 0));
    for (let k = 0; k < 3; k++) fx.ringFacing(c, UP, color, 5 + k * 0.5, 0.5, 0.95, k * 0.14);
    for (let k = 0; k < 3; k++) fx.streak(c.clone().add(new THREE.Vector3(-5, rnd(1.6), rnd(2))), c.clone().add(new THREE.Vector3(5, rnd(1.6), rnd(2))), color, 0.3, 0.1, 0.5 + k * 0.12);
    fx.clockFlash(c, color, 1.0);
    fx.flash(c, color, 7, 1.0);
    fx.shockwave(at, color, 7, 1.0, 0.7);
    later(40, () => sfx('phase'));
  },

  // a fireball screams down from the sky and the asteroid-walker stands up out of the crater
  goliath(fx, ship, at, color) {
    const from = at.clone().add(new THREE.Vector3(-26, 36, -14));
    fx.fireball(from, at.clone().add(new THREE.Vector3(0, 0.3, 0)), 0xff7a1a, 0.92, 3);
    const hit = 0.9;
    fx.flash(at, 0xffffff, 11, hit);
    fx.shockwave(at, 0xff7a1a, 12, hit, 1.0);
    fx.shockwave(at, 0xffffff, 6, hit + 0.05, 0.6);
    fx.chunks(at, 0xff7a1a, 18, 7.5, 0.34, 2.2, hit);
    fx.crater(at, 0xff6a00, 2.5, 3.6, hit);
    fx.smoke(at, 12, 0x4a3a30, 2.2, 2.4, hit);
    fx.burst(at, 0xffd36b, 60, 8, hit, 1.1, 0.3);
    later(60, () => sfx('meteor'));
    later(hit * 1000, () => {
      fx.stage.shake(1.0);
      fx.stage.punch(0.9);
      sfx('thud');
    });
  },
};

export function entrance(fx, ship) {
  const style = ship.id;
  const dur = ENTRANCE[style] ?? 1.3;
  ship.beginEntrance(style, dur);
  (ENTER[style] || ENTER.mechanova)(fx, ship, ship.root.position.clone(), ship.color);
  return dur;
}

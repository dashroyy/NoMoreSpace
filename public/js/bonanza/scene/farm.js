// Star Bonanza: the space farm. Every player has a little floating island (a grassy top on an upside-down rock)
// with two or three soil patches where their star buddies grow, a crate where the stars they just won wait to be
// planted, and a pile of gold Star Coins. In the middle hovers the UFO (the deck), with Zorp the alien farmer at the
// wheel (who turns to watch whoever's turn it is) and a tractor beam that brings the turned-over stars down.
//
// It is all cel-shaded with thick ink outlines, and it never keeps still: islands bob and tilt, grass and flowers
// sway, coins spin, the beam sends rings down, the arrow bounces over whoever's turn it is, patches squish when
// something is planted, harvested buddies cheer before they hop away.
//
// It only ever draws what the game state says: sync(state) brings it up to date, and everything pops, hops and flies
// in between. Positions for the effects come from posOf().
import * as THREE from 'three';
import { el } from '../../util.js';
import { toon, ink } from './stage.js';
import { makeCritter, makeCoin, makeCardBack } from './critters.js';
import { sfx } from '../sound.js';
import { star } from '../net.js';

export const RING_X = 15.5; // where the islands sit, round the UFO
export const RING_Z = 7.6;
const PATCH_R = 1.3;
const SPACING = 3.05;
const CAP_W = 5.3; // the island's grassy top: an ellipse this wide and deep (half sizes)
const CAP_D = 3.7;
const PLANTED = 0.62; // how big a star buddy is in a patch
const GROUND = 0.2; // the height of the soil, for the shadows
const ISLAND_COLORS = ['#58d98a', '#a587ff', '#ffa14f', '#52c4ff', '#ffd23f', '#ff7eb6', '#46e0c4'];

const back = (x) => {
  const c1 = 2.6;
  const y = Math.min(1, Math.max(0, x)) - 1;
  return 1 + (c1 + 1) * y * y * y + c1 * y * y;
};

// where seat i of n sits, with seat `mine` at the front (nearest the camera)
export function seatPosition(i, n, mine = 0) {
  const a = ((i - mine) * Math.PI * 2) / n;
  return { a, pos: new THREE.Vector3(Math.sin(a) * RING_X, 0, Math.cos(a) * RING_Z) };
}

// shared shapes
const G = {
  cap: new THREE.CylinderGeometry(1, 0.96, 0.5, 32),
  lip: new THREE.CylinderGeometry(0.97, 0.9, 0.34, 32),
  rock: new THREE.ConeGeometry(1, 1, 9, 2),
  soil: new THREE.CylinderGeometry(PATCH_R, PATCH_R * 1.04, 0.24, 28),
  rim: new THREE.TorusGeometry(PATCH_R + 0.06, 0.12, 8, 32),
  pick: new THREE.TorusGeometry(PATCH_R + 0.34, 0.1, 8, 36),
  pebble: new THREE.DodecahedronGeometry(1, 0),
  crate: new THREE.BoxGeometry(1.9, 0.32, 0.95),
  arrow: new THREE.ConeGeometry(0.55, 0.95, 4),
  ball: new THREE.SphereGeometry(1, 14, 10),
  stem: new THREE.CylinderGeometry(0.05, 0.06, 0.6, 6),
  mushcap: new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  blade: new THREE.ConeGeometry(0.1, 0.55, 5),
};
const M = {
  rock: toon('#7e62c4'),
  lipDark: toon('#8a5a36'),
  soil: toon('#7a4a2c'),
  rim: toon('#e0a25c'),
  crate: toon('#d49254'),
  arrow: toon('#ffd23f', { shine: 1 }),
  bush: toon('#2fcf86'),
  stem: toon('#4aa84a'),
  toad: toon('#ff4d63'),
  dot: toon('#ffffff'),
  blade: toon('#3fd27a', { shine: 0 }),
  petal: [toon('#ff8fc7'), toon('#ffe066'), toon('#8fd8ff'), toon('#c9a6ff')],
};

// a little decoration on the grass: a bush, a flower or a spotty toadstool. They sway (the part that moves is `sway`).
function prop(kind, k) {
  const g = new THREE.Group();
  const sway = new THREE.Group();
  g.add(sway);
  if (kind === 0) {
    for (const [x, y, z, r] of [[0, 0.32, 0, 0.42], [0.36, 0.24, 0.12, 0.3], [-0.34, 0.22, -0.08, 0.32]]) {
      const b = ink(new THREE.Mesh(G.ball, M.bush), 2.6);
      b.position.set(x, y, z);
      b.scale.setScalar(r);
      sway.add(b);
    }
  } else if (kind === 1) {
    const st = ink(new THREE.Mesh(G.stem, M.stem), 2);
    st.position.y = 0.3;
    const head = ink(new THREE.Mesh(G.ball, M.petal[k % M.petal.length]), 2.4);
    head.position.y = 0.66;
    head.scale.set(0.26, 0.16, 0.26);
    const mid = new THREE.Mesh(G.ball, M.arrow);
    mid.position.set(0, 0.72, 0);
    mid.scale.setScalar(0.09);
    sway.add(st, head, mid);
    sway.userData.pivotY = 0;
  } else {
    const st = ink(new THREE.Mesh(G.stem, M.dot), 2.2);
    st.scale.set(2.2, 0.7, 2.2);
    st.position.y = 0.2;
    const cap = ink(new THREE.Mesh(G.mushcap, M.toad), 2.6);
    cap.position.y = 0.38;
    sway.add(st, cap);
    for (const [x, z] of [[0.18, 0.2], [-0.2, 0.14], [0.02, -0.25]]) {
      const d = new THREE.Mesh(G.ball, M.dot);
      d.position.set(x, 0.62, z);
      d.scale.setScalar(0.07);
      sway.add(d);
    }
  }
  g.userData.sway = sway;
  g.userData.phase = Math.random() * 6;
  return g;
}
const PROPS = [[-4.45, -2.3], [4.5, -2.1], [-4.7, 1.8], [4.4, 2.2], [-2.5, 3.0], [2.6, 2.95], [-2.9, -3.0]];

export class SpaceFarm {
  constructor(stage) {
    this.stage = stage;
    this.root = new THREE.Group();
    stage.scene.add(this.root);
    this.fx = null; // set by the world: sparkle trails
    this.anims = []; // pops in and shrinks out
    this.fliers = []; // things flying from place to place
    this.leavers = []; // harvested stars cheering, then hopping off
    this.islands = new Map(); // pid -> island
    this.faceUp = new Map(); // uid -> { obj, label }
    this.critters = new Set(); // every buddy on the farm, to animate and turn to the camera
    this.activePid = null;
    this.ufoTrip = null;
    this.beamGlow = 0;
    this.zorpYaw = 0;
    this.firstSync = 0;
    this.onFart = null; // set by the effects: the sound and the comic word
    this.buildUfo();
    this.unframe = stage.onFrame((dt, t) => this.update(dt, t));
  }

  // ---------------------------------------------------------------------------
  // The UFO: the deck
  // ---------------------------------------------------------------------------
  buildUfo() {
    const ufo = new THREE.Group();
    ufo.position.set(0, 4.4, 0);
    const spinner = new THREE.Group(); // (the ring of lights turns; Zorp does not)
    const saucer = ink(new THREE.Mesh(new THREE.SphereGeometry(1, 36, 18), toon('#dfe3ff')), 4.5);
    saucer.scale.set(3, 0.62, 3);
    ufo.add(saucer);
    const band = ink(new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.26, 10, 48), toon('#ff6fb5')), 3.6);
    band.rotation.x = Math.PI / 2;
    ufo.add(band);
    this.lights = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffe066 : 0x7ff0ff }));
      l.position.set(Math.cos(a) * 3.05, 0.02, Math.sin(a) * 3.05);
      spinner.add(l);
      this.lights.push(l);
    }
    ufo.add(spinner);
    this.spinner = spinner;
    // Zorp, the alien farmer at the wheel
    const zorp = new THREE.Group();
    zorp.position.y = 0.62;
    const head = ink(new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 18), toon('#6df57d')), 3.6);
    head.scale.set(1, 0.92, 1);
    zorp.add(head);
    this.zorpAntennae = [];
    for (const x of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0x14121f }));
      eye.position.set(x * 0.22, 0.08, 0.5);
      eye.scale.set(0.9, 1.25, 0.5);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      shine.position.set(x * 0.22 - 0.05, 0.17, 0.6);
      zorp.add(eye, shine);
      // an antenna that wobbles on a spring: stalk and bobble hang from the top of the head
      const ant = new THREE.Group();
      ant.position.set(x * 0.25, 0.5, 0);
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 6), toon('#3fd35a', { shine: 0 }));
      stalk.position.y = 0.27;
      const bob = ink(new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), toon('#ff5d8f')), 2.4);
      bob.position.y = 0.58;
      ant.add(stalk, bob);
      ant.rotation.z = -x * 0.35;
      ant.userData = { side: x, rest: -x * 0.35 };
      zorp.add(ant);
      this.zorpAntennae.push(ant);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 6, 16, Math.PI), new THREE.MeshBasicMaterial({ color: 0x14121f }));
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.12, 0.56);
    zorp.add(smile);
    this.zorpSmile = smile;
    ufo.add(zorp);
    this.zorp = zorp;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.5, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshToonMaterial({ color: 0xb8f6ff, transparent: true, opacity: 0.32, depthWrite: false, gradientMap: null }));
    dome.position.y = 0.3;
    ufo.add(dome);
    // the tractor beam, from the UFO's belly to the ground, with rings that run down it
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(2.8, 4.2, 36, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff3a8, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide }));
    this.beam.position.y = -2.25;
    ufo.add(this.beam);
    this.beamRings = [0, 1, 2].map(() => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 36), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
      r.rotation.x = Math.PI / 2;
      ufo.add(r);
      return r;
    });
    this.root.add(ufo);
    this.ufo = ufo;
    // the spot of light it makes on the ground
    this.spot = new THREE.Mesh(new THREE.CircleGeometry(2.9, 40), new THREE.MeshBasicMaterial({ color: 0xfff3a8, transparent: true, opacity: 0.25, depthWrite: false }));
    this.spot.rotation.x = -Math.PI / 2;
    this.spot.position.y = 0.02;
    this.root.add(this.spot);
    this.deckTag = el('div', { className: 'deck-tag' }, el('span', { className: 'dk-ico' }, '🛸'), el('b', { className: 'dk-n' }, '0'), el('small', { className: 'dk-pass' }));
    this.deckLabel = this.stage.addLabel(ufo, this.deckTag, 2.4);
  }

  // ---------------------------------------------------------------------------
  // The islands
  // ---------------------------------------------------------------------------
  makeIsland(p, seat) {
    const root = new THREE.Group();
    this.root.add(root);
    const body = new THREE.Group(); // (bobs, tilts and bounces; the root stays where the seat is)
    root.add(body);
    const cap = ink(new THREE.Mesh(G.cap, toon(ISLAND_COLORS[seat % ISLAND_COLORS.length], { shine: 0.5 })), 4.5);
    cap.scale.set(CAP_W, 1, CAP_D);
    cap.position.y = -0.22;
    const lip = ink(new THREE.Mesh(G.lip, M.lipDark), 3.2);
    lip.scale.set(CAP_W * 0.97, 1, CAP_D * 0.97);
    lip.position.y = -0.62;
    const rock = ink(new THREE.Mesh(G.rock, M.rock), 4.5);
    rock.scale.set(CAP_W * 0.9, 2.7, CAP_D * 0.9);
    rock.rotation.x = Math.PI;
    rock.position.y = -0.79 - 1.35;
    body.add(cap, lip, rock);
    // a couple of pebbles floating underneath, bobbing on their own
    const pebbles = [];
    for (const [x, y, z, s] of [[-2.4, -3.8, 0.6, 0.5], [1.9, -4.4, -0.4, 0.36], [0.2, -5.1, 0.3, 0.26]]) {
      const pb = ink(new THREE.Mesh(G.pebble, M.rock), 3);
      pb.position.set(x, y, z);
      pb.scale.setScalar(s);
      pb.userData = { y, phase: Math.random() * 6 };
      body.add(pb);
      pebbles.push(pb);
    }
    // grass tufts round the rim, and the decorations
    const tufts = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const tuft = new THREE.Group();
      for (const dx of [-0.1, 0, 0.1]) {
        const blade = new THREE.Mesh(G.blade, M.blade);
        blade.position.set(dx, 0.27, 0);
        blade.rotation.z = -dx * 2.4;
        blade.scale.y = 0.8 + Math.abs(dx) * -2 + Math.random() * 0.4;
        tuft.add(blade);
      }
      tuft.position.set(Math.cos(a) * (CAP_W - 0.28), 0.03, Math.sin(a) * (CAP_D - 0.24));
      tuft.userData = { phase: Math.random() * 6 };
      body.add(tuft);
      tufts.push(tuft);
    }
    const props = PROPS.map(([x, z], k) => {
      const pr = prop((k + seat) % 3, k + seat);
      pr.position.set(x, 0, z);
      pr.rotation.y = k * 1.3;
      body.add(pr);
      return pr;
    });
    const isl = { pid: p.id, root, body, cap, pads: [], tray: new Map(), coins: [], phase: Math.random() * 6, pebbles, tufts, props, bounce: 0, crateShake: 0 };
    isl.coinGroup = new THREE.Group();
    isl.coinGroup.position.set(0, 0.02, -2.45);
    isl.trayGroup = new THREE.Group();
    isl.trayGroup.position.set(0, 0.02, 2.55);
    const crate = ink(new THREE.Mesh(G.crate, M.crate), 3);
    crate.position.y = 0.16;
    isl.trayGroup.add(crate);
    isl.crate = crate;
    body.add(isl.coinGroup, isl.trayGroup);
    // the "it's your turn" arrow, bouncing over the island
    const arrow = ink(new THREE.Mesh(G.arrow, M.arrow), 3.4);
    arrow.rotation.x = Math.PI;
    arrow.position.set(0, 4.4, -0.6);
    arrow.visible = false;
    body.add(arrow);
    isl.arrow = arrow;
    // the name plate, at the outer edge
    isl.anchor = new THREE.Object3D();
    isl.anchor.position.set(0, 0.3, -CAP_D - 0.2);
    body.add(isl.anchor);
    isl.tag = el('div', { className: 'tag' });
    isl.label = this.stage.addLabel(isl.anchor, isl.tag, 0);
    // a "for sale" spot, while there is no third patch
    isl.sale = new THREE.Object3D();
    body.add(isl.sale);
    isl.saleTag = el('div', { className: 'saletag' }, 'FOR SALE');
    isl.saleLabel = this.stage.addLabel(isl.sale, isl.saleTag, 0.6);
    this.islands.set(p.id, isl);
    return isl;
  }

  makePad(isl, i) {
    const g = new THREE.Group();
    const bed = new THREE.Group(); // the soil and its rim: this is what squishes when something is planted
    const soil = ink(new THREE.Mesh(G.soil, M.soil), 3.2);
    soil.position.y = 0.06;
    const rim = ink(new THREE.Mesh(G.rim, M.rim), 2.6);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.17;
    bed.add(soil, rim);
    const pick = new THREE.Mesh(G.pick, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0 }));
    pick.rotation.x = Math.PI / 2;
    pick.position.y = 0.2;
    g.add(bed, pick);
    // the sign: on the outer side of the patch, on the grass, where it hides nothing
    const anchor = new THREE.Object3D();
    anchor.position.set(0, 0.25, -1.95);
    g.add(anchor);
    const tag = el('div', { className: 'padtag' });
    const label = this.stage.addLabel(anchor, tag, 0);
    const pad = { g, bed, pick, tag, label, items: [], type: null, pickOn: false, sig: '', squish: -1 };
    isl.body.add(g);
    isl.pads[i] = pad;
    return pad;
  }

  // stars spiral out from the middle of the patch; a crowded patch squeezes them smaller
  slot(i, n) {
    const rad = Math.min(PATCH_R - 0.3, 0.5 * Math.sqrt(i));
    const a = i * 2.399963;
    return new THREE.Vector3(Math.cos(a) * rad, 0.62, Math.sin(a) * rad * 0.9);
  }
  plantedScale(id, n) {
    return PLANTED * (star(id)?.size || 1) * Math.max(0.5, Math.min(1, 1.15 - n * 0.07));
  }

  growIn(obj, delay = 0, dur = 0.55) {
    obj.scale.setScalar(0.001);
    this.anims.push({ obj, kind: 'in', t: -delay, dur });
  }
  shrinkOut(obj, dur = 0.3) {
    this.anims.push({ obj, kind: 'out', t: 0, dur, from: obj.scale.x });
  }
  reGrow(obj, delay, dur = 0.55) {
    this.anims = this.anims.filter((a) => a.obj !== obj);
    obj.scale.setScalar(0.001);
    this.anims.push({ obj, kind: 'in', t: -delay, dur });
  }

  addCritter(parent, id, pos, scale, delay = 0, ground = GROUND) {
    const obj = makeCritter(id);
    obj.position.copy(pos);
    obj.userData.target = scale;
    obj.userData.slotPos = pos.clone();
    obj.userData.ground = ground;
    if (id === 'stink-star') obj.userData.onFart = (o) => this.fart(o);
    parent.add(obj);
    this.growIn(obj, delay);
    this.critters.add(obj);
    return obj;
  }
  forget(obj) {
    this.critters.delete(obj);
  }

  // a harvested star cheers (or, if the harvest paid nothing, sulks: see react()), then hops off the patch and is gone
  hopOff(obj, pid, field, wait = 0.5) {
    this.root.attach(obj);
    this.anims = this.anims.filter((a) => a.obj !== obj);
    const out = obj.position.clone().setY(0).normalize();
    obj.userData.react?.('cheer');
    this.leavers.push({ obj, pid, field, wait, t: 0, vel: new THREE.Vector3(out.x * 2 + (Math.random() - 0.5) * 2, 6 + Math.random() * 2.5, out.z * 2 + (Math.random() - 0.5) * 2), spin: (Math.random() - 0.5) * 8, from: obj.scale.x, groundY: obj.position.y - 0.4 });
  }
  // the harvest paid (or did not): whoever is still waiting on that patch cheers or sulks
  reactHarvest(pid, field, paid) {
    for (const l of this.leavers) if (l.pid === pid && l.field === field && l.wait > 0) l.obj.userData.react?.(paid ? 'cheer' : 'sad');
  }

  // ---------------------------------------------------------------------------
  // Bringing the farm up to date with the game
  // ---------------------------------------------------------------------------
  sync(state) {
    if (!this.firstSync && state.you?.id) this.firstSync = performance.now();
    const n = state.players.length;
    const meIndex = Math.max(0, state.players.findIndex((p) => p.id === state.you.id));
    const keep = new Set();
    const turnPid = state.phase === 'playing' ? state.turn?.pid : null;
    state.players.forEach((p, i) => {
      keep.add(p.id);
      const isl = this.islands.get(p.id) || this.makeIsland(p, i);
      const seat = seatPosition(i, n, meIndex);
      isl.root.position.copy(seat.pos);
      isl.root.rotation.y = Math.atan2(-seat.pos.x, -seat.pos.z);
      this.syncPads(isl, p, state);
      this.syncTray(isl, p);
      this.syncCoins(isl, p);
      this.syncTag(isl, p, state);
      if (turnPid === p.id && this.activePid !== p.id) isl.bounce = 1; // the island hops when it becomes your turn
      isl.arrow.visible = turnPid === p.id;
    });
    for (const [pid, isl] of [...this.islands]) {
      if (keep.has(pid)) continue;
      isl.label.remove();
      isl.saleLabel.remove();
      isl.pads.forEach((pd) => pd?.label.remove());
      for (const pd of isl.pads) for (const o of pd?.items || []) this.forget(o);
      for (const o of isl.tray.values()) this.forget(o);
      isl.root.removeFromParent();
      this.islands.delete(pid);
    }
    this.syncFaceUp(state);
    this.activePid = turnPid;
    this.deckTag.querySelector('.dk-n').textContent = `${state.deckCount}`;
    this.deckTag.querySelector('.dk-pass').textContent = state.phase === 'playing' ? (state.endPending ? 'last trip!' : `trip ${Math.min(state.deckOuts + 1, state.passes)} of ${state.passes}`) : '';
    this.deckTag.classList.toggle('last', !!state.endPending);
  }

  syncPads(isl, p, state) {
    const count = p.fields.length;
    // two patches sit in the middle; a third (or the spot for one) goes on the right
    const xs = count === 3 ? [-SPACING, 0, SPACING] : [-SPACING / 2, SPACING / 2];
    p.fields.forEach((f, i) => {
      const pad = isl.pads[i] || this.makePad(isl, i);
      pad.g.position.set(count === 3 ? xs[i] : xs[i] - SPACING / 2, 0, 0);
      // a different kind, or fewer stars: the ones that are gone cheer and hop off
      if (pad.type && (pad.type !== f.type || f.n < pad.items.length)) {
        const keepN = pad.type === f.type ? f.n : 0;
        let k = 0;
        while (pad.items.length > keepN) {
          const o = pad.items.pop();
          this.forget(o);
          this.hopOff(o, isl.pid, i, 0.45 + k++ * 0.07);
        }
      }
      if (f.type && f.n > pad.items.length) {
        for (let k = pad.items.length; k < f.n; k++) pad.items.push(this.addCritter(pad.g, f.type, this.slot(k, f.n), this.plantedScale(f.type, f.n), (k - pad.items.length) * 0.08));
      }
      pad.items.forEach((obj, k) => {
        obj.userData.slotPos = this.slot(k, f.n);
        obj.userData.target = this.plantedScale(f.type, f.n);
      });
      pad.type = f.type;
      const sig = `${f.type}|${f.n}`;
      if (pad.sig !== sig) {
        pad.sig = sig;
        const d = f.type ? star(f.type) : null;
        pad.tag.replaceChildren(d ? el('b', {}, `${f.n}×`) : null, el('span', {}, d ? d.name : 'empty'));
        pad.tag.classList.toggle('empty', !d);
        pad.tag.style.setProperty('--c', d?.color || '#c98a4b');
      }
    });
    while (isl.pads.length > count) {
      const pad = isl.pads.pop();
      pad.label.remove();
      pad.g.removeFromParent();
    }
    // the spot for a third patch
    isl.sale.position.set(SPACING, 0.3, 0);
    isl.saleLabel.visible = count < 3 && state.phase === 'playing';
  }

  syncTray(isl, p) {
    const want = new Set(p.tray.map((c) => c.uid));
    for (const [uid, obj] of [...isl.tray]) {
      if (want.has(uid)) continue;
      isl.tray.delete(uid);
      this.forget(obj);
      this.shrinkOut(obj);
    }
    p.tray.forEach((c, i) => {
      let obj = isl.tray.get(c.uid);
      if (!obj) {
        obj = this.addCritter(isl.trayGroup, c.t, new THREE.Vector3(0, 0.75, 0), 0.5 * (star(c.t)?.size || 1), 0.8, 0.35);
        isl.tray.set(c.uid, obj);
        isl.crateShake = 1;
      }
      obj.userData.slotPos = new THREE.Vector3((i - (p.tray.length - 1) / 2) * 0.85, 0.75, 0);
    });
  }

  syncCoins(isl, p) {
    const want = Math.min(40, p.coins);
    while (isl.coins.length > want) this.shrinkOut(isl.coins.pop(), 0.25);
    for (let i = isl.coins.length; i < want; i++) {
      const c = makeCoin();
      const col = Math.floor(i / 8);
      c.position.set((col - 2) * 0.82, 0.08 + (i % 8) * 0.11, (col % 2) * 0.18);
      c.rotation.y = i * 0.7;
      isl.coinGroup.add(c);
      this.growIn(c, (i - isl.coins.length) * 0.05, 0.3);
      c.userData.target = 1;
      isl.coins.push(c);
    }
  }

  syncTag(isl, p, state) {
    const sig = `${p.name}|${p.avatar}|${p.coins}|${p.handCount}|${p.connected}|${p.afk}|${state.turn?.pid === p.id}|${p.id === state.you.id}`;
    if (isl.tag.dataset.sig === sig) return;
    isl.tag.dataset.sig = sig;
    isl.tag.classList.toggle('turn', state.turn?.pid === p.id);
    isl.tag.classList.toggle('me', p.id === state.you.id);
    isl.tag.classList.toggle('away', !p.connected || p.afk);
    isl.tag.replaceChildren(el('span', { className: 'tg-av' }, p.avatar), el('b', {}, p.id === state.you.id ? 'You' : p.name), el('span', { className: 'tg-n' }, el('i', { className: 'coin' }), `${p.coins}`), el('span', { className: 'tg-h' }, `🃏${p.handCount}`), p.afk ? el('span', { className: 'tg-z' }, '💤') : null);
  }

  // the stars the UFO beams down hang in its beam
  syncFaceUp(state) {
    const cards = state.turn?.phase === 'trade' ? state.turn.faceUp : [];
    const want = new Set(cards.map((c) => c.uid));
    for (const [uid, f] of [...this.faceUp]) {
      if (want.has(uid)) continue;
      this.faceUp.delete(uid);
      f.label.remove();
      this.forget(f.obj);
      this.shrinkOut(f.obj);
    }
    cards.forEach((c, i) => {
      let f = this.faceUp.get(c.uid);
      if (!f) {
        const obj = this.addCritter(this.root, c.t, this.faceUpPos(i, cards.length), 0.8 * (star(c.t)?.size || 1), 0.75 + i * 0.15, 0.1);
        const tag = el('div', { className: 'futag' }, star(c.t)?.name || c.t);
        tag.style.setProperty('--c', star(c.t)?.color || '#fff');
        f = { obj, label: this.stage.addLabel(obj, tag, -0.4) };
        this.faceUp.set(c.uid, f);
      }
      f.obj.userData.slotPos = this.faceUpPos(i, cards.length);
    });
  }

  faceUpPos(i, n) {
    return new THREE.Vector3((i - (n - 1) / 2) * 3.2, 2.0, 1.4);
  }

  // ---------------------------------------------------------------------------
  // For the effects
  // ---------------------------------------------------------------------------
  posOf(pid, kind = 'tag', idx = 0) {
    const isl = this.islands.get(pid);
    if (!isl) return new THREE.Vector3();
    isl.root.updateMatrixWorld(true);
    if (kind === 'pad') {
      const pad = isl.pads[idx];
      return (pad ? pad.g : isl.body).localToWorld(new THREE.Vector3(0, 0.7, 0));
    }
    const local = { tag: [0, 1.0, -CAP_D], tray: [0, 0.9, 2.55], coins: [0, 0.6, -2.45], center: [0, 1, 0], sale: [SPACING, 0.5, 0] }[kind] || [0, 0.6, 0];
    return isl.body.localToWorld(new THREE.Vector3(...local));
  }
  deckPos() {
    return this.ufo.localToWorld(new THREE.Vector3(0, -0.5, 0));
  }

  // a star (or a coin, or the back of a card) flies along an arc from one place to another
  fly(from, to, { id = null, coin = false, card = false, dur = 0.9, arc = 2.4, scale = 0.6, delay = 0, onDone = null } = {}) {
    const obj = coin ? makeCoin() : card ? makeCardBack() : makeCritter(id);
    obj.scale.setScalar(0.001);
    obj.position.copy(from);
    obj.visible = delay <= 0;
    if (obj.userData.shadow) obj.userData.shadow.visible = false;
    this.root.add(obj);
    const color = coin ? '#ffe066' : card ? '#c9b6ff' : star(id)?.color || '#ffffff';
    this.fliers.push({ obj, from: from.clone(), to: to.clone(), t: -delay, dur, arc, scale: coin ? 1.3 : card ? 1.4 : scale * (star(id)?.size || 1), color, onDone, spin: coin || card });
    return obj;
  }

  highlight(pid, i, on) {
    const pad = this.islands.get(pid)?.pads[i];
    if (pad) pad.pickOn = on;
  }
  clearHighlights() {
    for (const isl of this.islands.values()) for (const pad of isl.pads) if (pad) pad.pickOn = false;
  }

  // a Stink Star farts: a green cloud, a noise, a comic word, and everybody nearby pulls a face
  fart(obj) {
    const at = obj.getWorldPosition(new THREE.Vector3());
    this.fx?.stink(at.clone().add(new THREE.Vector3(0, 0.3, 0)));
    this.onFart?.(at, obj);
    for (const o of this.critters) {
      if (o === obj) continue;
      const d = o.getWorldPosition(new THREE.Vector3()).distanceTo(at);
      if (d < 3.6) o.userData.react?.(o.userData.id === 'stink-star' ? 'cheer' : 'sad');
    }
  }

  // the newest star in a patch (and the newest coins in a pile) pop in when what flies to them lands; the patch squishes
  delayLast(pid, i, delay) {
    const pad = this.islands.get(pid)?.pads[i];
    const obj = pad?.items[pad.items.length - 1];
    if (obj) this.reGrow(obj, delay);
    if (pad) pad.squish = -delay;
  }
  delayCoins(pid, n, delay) {
    const isl = this.islands.get(pid);
    if (isl) isl.coins.slice(-n).forEach((c, i) => this.reGrow(c, delay + i * 0.14, 0.3));
  }
  // everything on a patch cheers (a good harvest of someone else's, a trade...)
  cheer(pid, i, name = 'cheer') {
    const pad = this.islands.get(pid)?.pads[i];
    for (const o of pad?.items || []) o.userData.react?.(name);
  }
  // an island shakes its crate and hops (something happened to it)
  bounce(pid) {
    const isl = this.islands.get(pid);
    if (isl) isl.bounce = 1;
  }

  // the UFO flies off to fetch more stars, and comes back
  ufoRefill() {
    this.ufoTrip = { t: 0 };
  }
  beamPulse() {
    this.beamGlow = 1;
  }

  // ---------------------------------------------------------------------------
  update(dt, time) {
    // pops (with a bounce) and shrinks
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      if (a.t < 0) continue;
      const k = Math.min(1, a.t / a.dur);
      if (a.kind === 'in') {
        a.obj.scale.setScalar(Math.max(0.001, back(k) * (a.obj.userData.target ?? 1)));
        if (k >= 1) {
          a.obj.userData.hop?.(0.8);
          // a Stink Star landing in a patch lets one go (but not while the farm is still being set up)
          if (a.obj.userData.id === 'stink-star' && this.firstSync && performance.now() - this.firstSync > 2500 && a.obj.parent !== this.root) a.obj.userData.gagNow?.('fart');
        }
      } else a.obj.scale.setScalar(Math.max(0.001, a.from * (1 - k)));
      if (k >= 1) {
        if (a.kind === 'out') a.obj.removeFromParent();
        this.anims.splice(i, 1);
      }
    }
    const busy = new Set(this.anims.map((a) => a.obj));

    // ---- the UFO: it bobs, leans towards whoever's turn it is, Zorp turns to watch them, the lights chase round
    let ux = 0;
    let uy = 4.4 + Math.sin(time * 1.3) * 0.25;
    if (this.ufoTrip) {
      const tr = this.ufoTrip;
      tr.t += dt;
      const k = tr.t / 2.2;
      if (k >= 1) this.ufoTrip = null;
      else {
        const away = Math.sin(Math.PI * k);
        ux = Math.sin(k * Math.PI * 2) * 6 * away;
        uy += away * 26;
      }
    }
    this.ufo.position.set(ux, uy, 0);
    const watched = this.islands.get(this.activePid);
    let lookYaw = Math.sin(time * 0.5) * 0.5;
    let leanX = 0;
    let leanZ = 0;
    if (watched) {
      const p = watched.root.position;
      lookYaw = Math.atan2(p.x - ux, p.z);
      leanX = p.z * 0.012;
      leanZ = -p.x * 0.006;
    }
    // turn the short way round
    let d = lookYaw - this.zorpYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.zorpYaw += d * Math.min(1, dt * 4);
    this.zorp.rotation.y = this.zorpYaw;
    this.ufo.rotation.x += (leanX + Math.sin(time * 1.1) * 0.03 - this.ufo.rotation.x) * Math.min(1, dt * 4);
    this.ufo.rotation.z += (leanZ + Math.sin(time * 0.9) * 0.03 - this.ufo.rotation.z) * Math.min(1, dt * 4);
    this.zorp.position.y = 0.62 + Math.abs(Math.sin(time * 2.4)) * 0.05 + this.beamGlow * 0.12;
    for (const ant of this.zorpAntennae) ant.rotation.z = ant.userData.rest + Math.sin(time * 5 + ant.userData.side) * 0.18 + Math.sin(time * 11) * 0.05 * (1 + this.beamGlow * 3);
    this.zorpSmile.scale.set(1 + this.beamGlow * 0.4, 1 + this.beamGlow * 1.6, 1);
    this.spinner.rotation.y = time * 0.9;
    this.lights.forEach((l, i) => l.scale.setScalar(Math.floor(time * 6 + i) % 3 === 0 ? 1.45 : 0.9));
    this.beamGlow = Math.max(0, this.beamGlow - dt * 0.9);
    const beamOn = this.ufoTrip ? 0.05 : 1;
    this.beam.material.opacity = (0.2 + this.beamGlow * 0.3) * beamOn;
    this.beam.scale.set(1, 1, 1).multiplyScalar(1 + this.beamGlow * 0.1);
    this.beamRings.forEach((r, i) => {
      const p = (time * 0.55 + i / 3) % 1;
      r.position.y = -0.2 - p * 4.0;
      r.scale.setScalar(0.9 + p * 1.9);
      r.material.opacity = (1 - p) * 0.7 * beamOn;
    });
    this.spot.material.opacity = (0.22 + this.beamGlow * 0.3) * beamOn;

    // ---- the islands: bob, tilt, hop when it becomes their turn; grass, flowers and pebbles sway; coins spin
    const cam = this.stage.camera.position;
    for (const isl of this.islands.values()) {
      isl.bounce = Math.max(0, isl.bounce - dt * 1.6);
      const hop = isl.bounce > 0 ? Math.sin((1 - isl.bounce) * Math.PI) * isl.bounce * 0.9 : 0;
      isl.body.position.y = Math.sin(time * 0.9 + isl.phase) * 0.2 + hop;
      isl.body.rotation.z = Math.sin(time * 0.55 + isl.phase) * 0.03;
      isl.body.rotation.x = Math.sin(time * 0.43 + isl.phase * 1.3) * 0.025;
      isl.crateShake = Math.max(0, isl.crateShake - dt * 2);
      isl.crate.rotation.z = Math.sin(time * 40) * 0.08 * isl.crateShake;
      isl.crate.position.y = 0.16 + Math.abs(Math.sin(time * 14)) * 0.12 * isl.crateShake;
      for (const t of isl.tufts) t.rotation.z = Math.sin(time * 2.2 + t.userData.phase) * 0.18;
      for (const pr of isl.props) pr.userData.sway.rotation.z = Math.sin(time * 1.8 + pr.userData.phase) * 0.07;
      for (const pb of isl.pebbles) pb.position.y = pb.userData.y + Math.sin(time * 1.1 + pb.userData.phase) * 0.3;
      for (const c of isl.coins) c.rotation.y += dt * 1.3;
      if (isl.arrow.visible) {
        const hopA = Math.abs(Math.sin(time * 4));
        isl.arrow.position.y = 4.3 + hopA * 0.7;
        isl.arrow.rotation.y = time * 2;
        isl.arrow.scale.set(1 - hopA * 0.08, 1 + hopA * 0.12, 1 - hopA * 0.08);
      }
      for (const pad of isl.pads) {
        if (!pad) continue;
        pad.pick.material.opacity += ((pad.pickOn ? 0.8 + Math.sin(time * 7) * 0.2 : 0) - pad.pick.material.opacity) * Math.min(1, dt * 10);
        pad.pick.scale.setScalar(pad.pickOn ? 1 + Math.sin(time * 7) * 0.05 : 1);
        // the squish when something is planted: down, then up with a wobble
        if (pad.squish > -1) {
          pad.squish += dt;
          if (pad.squish >= 0) {
            const k = pad.squish;
            const w = Math.exp(-k * 5) * Math.sin(k * 26);
            pad.bed.scale.set(1 + w * 0.08, 1 - w * 0.16, 1 + w * 0.08);
            if (k > 1) {
              pad.squish = -1;
              pad.bed.scale.set(1, 1, 1);
            }
          }
        }
      }
    }

    // ---- every buddy: slide to its spot, bob, blink, look at the camera, keep its shadow on the ground
    const w = new THREE.Vector3();
    for (const obj of this.critters) {
      const slot = obj.userData.slotPos;
      if (slot) obj.position.lerp(slot, Math.min(1, dt * 6));
      if (!busy.has(obj) && obj.userData.target != null) {
        const s = obj.scale.x + (obj.userData.target - obj.scale.x) * Math.min(1, dt * 6);
        obj.scale.setScalar(s);
      }
      obj.getWorldPosition(w);
      obj.lookAt(cam.x, w.y, cam.z);
      obj.userData.update(time, dt);
      const sh = obj.userData.shadow;
      sh.position.y = ((obj.userData.ground ?? GROUND) - obj.position.y) / Math.max(0.05, obj.scale.y);
    }

    // ---- harvested stars: cheer where they stand, then hop away
    for (let i = this.leavers.length - 1; i >= 0; i--) {
      const l = this.leavers[i];
      if (l.wait > 0) {
        l.wait -= dt;
        l.obj.getWorldPosition(w);
        l.obj.lookAt(cam.x, w.y, cam.z);
        l.obj.userData.update(time, dt);
        const sh = l.obj.userData.shadow;
        sh.position.y = (l.groundY - l.obj.position.y) / Math.max(0.05, l.obj.scale.y);
        continue;
      }
      l.obj.userData.shadow.visible = false;
      l.t += dt;
      l.vel.y -= 16 * dt;
      l.obj.position.addScaledVector(l.vel, dt);
      l.obj.rotation.z += l.spin * dt;
      l.obj.userData.update(time, dt);
      if (l.t > 0.5) l.obj.scale.setScalar(Math.max(0.001, l.from * (1 - (l.t - 0.5) / 0.3)));
      if (l.t > 0.8) {
        l.obj.removeFromParent();
        this.leavers.splice(i, 1);
      }
    }

    // ---- things in flight
    for (let i = this.fliers.length - 1; i >= 0; i--) {
      const f = this.fliers[i];
      f.t += dt;
      if (f.t < 0) continue;
      f.obj.visible = true;
      const k = Math.min(1, f.t / f.dur);
      const e = k * k * (3 - 2 * k);
      f.obj.position.lerpVectors(f.from, f.to, e);
      f.obj.position.y += Math.sin(Math.PI * e) * f.arc;
      // squash and stretch along the flight: long on the way up and down, round at the top
      const stretch = 1 + Math.abs(Math.cos(Math.PI * e)) * 0.18;
      f.obj.scale.set(f.scale / Math.sqrt(stretch), f.scale * stretch, f.scale / Math.sqrt(stretch)).multiplyScalar(k < 0.15 ? Math.max(0.001, k / 0.15) : 1);
      if (f.spin) f.obj.rotation.y += dt * 9;
      else {
        f.obj.lookAt(cam.x, f.obj.position.y, cam.z);
        f.obj.userData.update?.(time, dt);
        f.obj.rotation.z += Math.sin(Math.PI * e) * dt * 6;
      }
      if (this.fx && Math.random() < 0.5) this.fx.trail(f.obj.position, f.color);
      if (k >= 1) {
        f.obj.removeFromParent();
        this.fliers.splice(i, 1);
        f.onDone?.();
      }
    }
  }

  dispose() {
    this.unframe();
    this.root.removeFromParent();
  }
}

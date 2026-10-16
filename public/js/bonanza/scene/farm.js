// Star Bonanza: the space farm. Every player has a little floating island (a grassy top on an upside-down rock)
// with two or three soil patches where their star buddies grow, a crate where the stars they just won wait to be
// planted, and a pile of gold Star Coins. In the middle hovers the UFO (the deck), with Zorp the alien farmer at the
// wheel and a tractor beam that brings the turned-over stars down.
//
// It only ever draws what the game state says: sync(state) brings it up to date, and everything pops, hops and flies
// in between. Positions for the effects come from posOf().
import * as THREE from 'three';
import { el } from '../../util.js';
import { toon } from './stage.js';
import { makeCritter, makeCoin, makeCardBack } from './critters.js';
import { star } from '../net.js';

export const RING_X = 15.5; // where the islands sit, round the UFO
export const RING_Z = 7.6;
const PATCH_R = 1.3;
const SPACING = 3.05;
const CAP_W = 5.3; // the island's grassy top: an ellipse this wide and deep (half sizes)
const CAP_D = 3.7;
const PLANTED = 0.62; // how big a star buddy is in a patch
const ISLAND_COLORS = ['#7fe0a8', '#b9a6ff', '#ffb38a', '#8fd8ff', '#ffe27a', '#ff9ac9', '#9ff0e0'];
const INK = 0x2d1b4e;
const LINE = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

const back = (x) => {
  const c1 = 2.2;
  const y = Math.min(1, Math.max(0, x)) - 1;
  return 1 + (c1 + 1) * y * y * y + c1 * y * y;
};
const outline = (mesh, k = 1.05) => {
  const shell = new THREE.Mesh(mesh.geometry, LINE);
  shell.scale.setScalar(k);
  mesh.add(shell);
  return mesh;
};

// where seat i of n sits, with seat `mine` at the front (nearest the camera)
export function seatPosition(i, n, mine = 0) {
  const a = ((i - mine) * Math.PI * 2) / n;
  return { a, pos: new THREE.Vector3(Math.sin(a) * RING_X, 0, Math.cos(a) * RING_Z) };
}

// shared shapes
const G = {
  cap: new THREE.CylinderGeometry(1, 0.96, 0.45, 32),
  rock: new THREE.ConeGeometry(1, 1, 8, 2),
  soil: new THREE.CylinderGeometry(PATCH_R, PATCH_R * 1.04, 0.24, 28),
  rim: new THREE.TorusGeometry(PATCH_R + 0.06, 0.1, 8, 32),
  pick: new THREE.TorusGeometry(PATCH_R + 0.34, 0.09, 8, 36),
  pebble: new THREE.DodecahedronGeometry(1, 0),
  crate: new THREE.BoxGeometry(1.9, 0.32, 0.95),
  arrow: new THREE.ConeGeometry(0.5, 0.9, 4),
  ball: new THREE.SphereGeometry(1, 14, 10),
  stem: new THREE.CylinderGeometry(0.05, 0.06, 0.6, 6),
  cap: new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
};
const M = {
  rock: toon('#8a7cc4'),
  rockDark: toon('#6d5fa8'),
  soil: toon('#7a4a2c'),
  rim: toon('#d49254'),
  crate: toon('#c98a4b'),
  arrow: toon('#ffd23f'),
  bush: toon('#3fc48a'),
  stem: toon('#5aa04a'),
  toad: toon('#ff5a6e'),
  dot: toon('#ffffff'),
  petal: [toon('#ff8fc7'), toon('#ffe066'), toon('#8fd8ff'), toon('#c9a6ff')],
};

// a little decoration on the grass: a bush, a flower or a spotty toadstool
function prop(kind, k) {
  const g = new THREE.Group();
  if (kind === 0) {
    for (const [x, y, z, r] of [[0, 0.32, 0, 0.42], [0.36, 0.24, 0.12, 0.3], [-0.34, 0.22, -0.08, 0.32]]) {
      const b = outline(new THREE.Mesh(G.ball, M.bush), 1.1);
      b.position.set(x, y, z);
      b.scale.setScalar(r);
      g.add(b);
    }
  } else if (kind === 1) {
    const st = new THREE.Mesh(G.stem, M.stem);
    st.position.y = 0.3;
    const head = outline(new THREE.Mesh(G.ball, M.petal[k % M.petal.length]), 1.15);
    head.position.y = 0.66;
    head.scale.set(0.22, 0.14, 0.22);
    const mid = new THREE.Mesh(G.ball, M.arrow);
    mid.position.y = 0.72;
    mid.scale.setScalar(0.08);
    g.add(st, head, mid);
  } else {
    const st = outline(new THREE.Mesh(G.stem, M.dot), 1.2);
    st.scale.set(2.2, 0.7, 2.2);
    st.position.y = 0.2;
    const cap = outline(new THREE.Mesh(G.cap, M.toad), 1.08);
    cap.position.y = 0.38;
    g.add(st, cap);
    for (const [x, z] of [[0.18, 0.2], [-0.2, 0.14], [0.02, -0.25]]) {
      const d = new THREE.Mesh(G.ball, M.dot);
      d.position.set(x, 0.62, z);
      d.scale.setScalar(0.06);
      g.add(d);
    }
  }
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
    this.leavers = []; // harvested stars hopping off
    this.islands = new Map(); // pid -> island
    this.faceUp = new Map(); // uid -> { obj, label }
    this.critters = new Set(); // every buddy on the farm, to animate and turn to the camera
    this.activePid = null;
    this.ufoTrip = null;
    this.beamGlow = 0;
    this.buildUfo();
    this.unframe = stage.onFrame((dt, t) => this.update(dt, t));
  }

  // ---------------------------------------------------------------------------
  // The UFO: the deck
  // ---------------------------------------------------------------------------
  buildUfo() {
    const ufo = new THREE.Group();
    ufo.position.set(0, 4.4, 0);
    const saucer = outline(new THREE.Mesh(new THREE.SphereGeometry(1, 36, 18), toon('#d4d9ff')), 1.04);
    saucer.scale.set(3, 0.62, 3);
    ufo.add(saucer);
    const band = new THREE.Mesh(new THREE.TorusGeometry(3.02, 0.24, 10, 48), toon('#ff7ac6'));
    band.rotation.x = Math.PI / 2;
    ufo.add(band);
    this.lights = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffe066 : 0x7ff0ff }));
      l.position.set(Math.cos(a) * 3.05, 0.02, Math.sin(a) * 3.05);
      ufo.add(l);
      this.lights.push(l);
    }
    // Zorp, the alien farmer at the wheel
    const zorp = new THREE.Group();
    zorp.position.y = 0.62;
    const head = outline(new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 18), toon('#7dff8a')), 1.06);
    head.scale.set(1, 0.92, 1);
    zorp.add(head);
    for (const x of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0x14121f }));
      eye.position.set(x * 0.22, 0.08, 0.5);
      eye.scale.set(0.9, 1.25, 0.5);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      shine.position.set(x * 0.22 - 0.05, 0.17, 0.6);
      zorp.add(eye, shine);
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6), toon('#5ad86a'));
      stalk.position.set(x * 0.25, 0.75, 0);
      stalk.rotation.z = -x * 0.35;
      const bob = outline(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), toon('#ff5d8f')), 1.15);
      bob.position.set(x * 0.36, 1.02, 0);
      zorp.add(stalk, bob);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 16, Math.PI), new THREE.MeshBasicMaterial({ color: 0x14121f }));
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.17, 0.56);
    zorp.add(smile);
    ufo.add(zorp);
    this.zorp = zorp;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.5, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), toon('#a8f4ff', { transparent: true, opacity: 0.35, depthWrite: false }));
    dome.position.y = 0.3;
    ufo.add(dome);
    // the tractor beam, from the UFO's belly to the ground
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0.15)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 128);
    const tex = new THREE.CanvasTexture(c);
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(2.8, 4.2, 36, 1, true), new THREE.MeshBasicMaterial({ map: tex, color: 0xfff3a8, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
    this.beam.position.y = -2.25;
    ufo.add(this.beam);
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
    const body = new THREE.Group(); // (bobs up and down; the root stays where the seat is)
    root.add(body);
    const cap = outline(new THREE.Mesh(G.cap, toon(ISLAND_COLORS[seat % ISLAND_COLORS.length])), 1.025);
    cap.scale.set(CAP_W, 1, CAP_D);
    cap.position.y = -0.22;
    const rock = outline(new THREE.Mesh(G.rock, M.rock), 1.03);
    rock.scale.set(CAP_W * 0.92, 2.6, CAP_D * 0.92);
    rock.rotation.x = Math.PI;
    rock.position.y = -0.45 - 1.3;
    body.add(cap, rock);
    // a couple of pebbles floating underneath
    for (const [x, y, z, s] of [[-2.4, -3.6, 0.6, 0.45], [1.9, -4.2, -0.4, 0.32]]) {
      const pb = outline(new THREE.Mesh(G.pebble, M.rockDark), 1.08);
      pb.position.set(x, y, z);
      pb.scale.setScalar(s);
      body.add(pb);
    }
    PROPS.forEach(([x, z], k) => {
      const pr = prop((k + seat) % 3, k + seat);
      pr.position.set(x, 0, z);
      pr.rotation.y = k * 1.3;
      body.add(pr);
    });
    const isl = { pid: p.id, root, body, cap, pads: [], tray: new Map(), coins: [], phase: Math.random() * 6 };
    isl.coinGroup = new THREE.Group();
    isl.coinGroup.position.set(0, 0.02, -2.45);
    isl.trayGroup = new THREE.Group();
    isl.trayGroup.position.set(0, 0.02, 2.55);
    const crate = outline(new THREE.Mesh(G.crate, M.crate), 1.05);
    crate.position.y = 0.16;
    isl.trayGroup.add(crate);
    isl.crate = crate;
    body.add(isl.coinGroup, isl.trayGroup);
    // the "it's your turn" arrow, bouncing over the island
    const arrow = outline(new THREE.Mesh(G.arrow, M.arrow), 1.12);
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
    const soil = new THREE.Mesh(G.soil, M.soil);
    soil.position.y = 0.06;
    const rim = new THREE.Mesh(G.rim, M.rim);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.17;
    const pick = new THREE.Mesh(G.pick, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0 }));
    pick.rotation.x = Math.PI / 2;
    pick.position.y = 0.2;
    g.add(soil, rim, pick);
    const anchor = new THREE.Object3D();
    anchor.position.set(0, 1.9, -0.4);
    g.add(anchor);
    const tag = el('div', { className: 'padtag' });
    const label = this.stage.addLabel(anchor, tag, 0);
    const pad = { g, pick, tag, label, items: [], type: null, pickOn: false, sig: '' };
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

  growIn(obj, delay = 0, dur = 0.5) {
    obj.scale.setScalar(0.001);
    this.anims.push({ obj, kind: 'in', t: -delay, dur });
  }
  shrinkOut(obj, dur = 0.3) {
    this.anims.push({ obj, kind: 'out', t: 0, dur, from: obj.scale.x });
  }
  reGrow(obj, delay, dur = 0.5) {
    this.anims = this.anims.filter((a) => a.obj !== obj);
    obj.scale.setScalar(0.001);
    this.anims.push({ obj, kind: 'in', t: -delay, dur });
  }

  addCritter(parent, id, pos, scale, delay = 0) {
    const obj = makeCritter(id);
    obj.position.copy(pos);
    obj.userData.target = scale;
    obj.userData.slotPos = pos.clone();
    parent.add(obj);
    this.growIn(obj, delay);
    this.critters.add(obj);
    return obj;
  }
  forget(obj) {
    this.critters.delete(obj);
  }

  // a harvested star hops off the patch, waves and is gone
  hopOff(obj) {
    this.root.attach(obj);
    this.anims = this.anims.filter((a) => a.obj !== obj);
    const out = obj.position.clone().setY(0).normalize();
    this.leavers.push({ obj, t: 0, vel: new THREE.Vector3(out.x * 2 + (Math.random() - 0.5) * 2, 6 + Math.random() * 2.5, out.z * 2 + (Math.random() - 0.5) * 2), spin: (Math.random() - 0.5) * 8, from: obj.scale.x });
  }

  // ---------------------------------------------------------------------------
  // Bringing the farm up to date with the game
  // ---------------------------------------------------------------------------
  sync(state) {
    const n = state.players.length;
    const meIndex = Math.max(0, state.players.findIndex((p) => p.id === state.you.id));
    const keep = new Set();
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
      isl.arrow.visible = state.turn?.pid === p.id && state.phase === 'playing';
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
    this.activePid = state.turn?.pid || null;
    this.deckTag.querySelector('.dk-n').textContent = `${state.deckCount}`;
    this.deckTag.querySelector('.dk-pass').textContent = state.phase === 'playing' ? (state.endPending ? 'last trip!' : `trip ${Math.min(state.deckOuts + 1, state.passes)} of ${state.passes}`) : '';
    this.deckTag.classList.toggle('last', !!state.endPending);
  }

  padX(i) {
    return (i - 1) * SPACING;
  }

  syncPads(isl, p, state) {
    const count = p.fields.length;
    // two patches sit in the middle; a third (or the spot for one) goes on the right
    const xs = count === 3 ? [-SPACING, 0, SPACING] : [-SPACING / 2, SPACING / 2];
    p.fields.forEach((f, i) => {
      const pad = isl.pads[i] || this.makePad(isl, i);
      pad.g.position.set(count === 3 ? xs[i] : xs[i] - SPACING / 2, 0, 0);
      // a different kind, or fewer stars: the ones that are gone hop off
      if (pad.type && (pad.type !== f.type || f.n < pad.items.length)) {
        const keepN = pad.type === f.type ? f.n : 0;
        while (pad.items.length > keepN) {
          const o = pad.items.pop();
          this.forget(o);
          this.hopOff(o);
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
        obj = this.addCritter(isl.trayGroup, c.t, new THREE.Vector3(0, 0.75, 0), 0.5 * (star(c.t)?.size || 1), 0.8);
        isl.tray.set(c.uid, obj);
      }
      obj.userData.slotPos = new THREE.Vector3((i - (p.tray.length - 1) / 2) * 0.85, 0.75, 0);
    });
    isl.crate.visible = true;
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
        const obj = this.addCritter(this.root, c.t, this.faceUpPos(i, cards.length), 0.8 * (star(c.t)?.size || 1), 0.75 + i * 0.15);
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

  // the newest star in a patch (and the newest coins in a pile) pop in when what flies to them lands
  delayLast(pid, i, delay) {
    const pad = this.islands.get(pid)?.pads[i];
    const obj = pad?.items[pad.items.length - 1];
    if (obj) this.reGrow(obj, delay);
  }
  delayCoins(pid, n, delay) {
    const isl = this.islands.get(pid);
    if (isl) isl.coins.slice(-n).forEach((c, i) => this.reGrow(c, delay + i * 0.14, 0.3));
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
        if (k >= 1) a.obj.userData.hop?.(0.8);
      } else a.obj.scale.setScalar(Math.max(0.001, a.from * (1 - k)));
      if (k >= 1) {
        if (a.kind === 'out') a.obj.removeFromParent();
        this.anims.splice(i, 1);
      }
    }
    const busy = new Set(this.anims.map((a) => a.obj));
    // the UFO bobs and turns; its lights chase round; a refill sends it off and back
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
    this.ufo.rotation.y = time * 0.4;
    this.zorp.rotation.y = -time * 0.4 + Math.sin(time * 0.7) * 0.5;
    this.lights.forEach((l, i) => l.scale.setScalar(Math.floor(time * 6 + i) % 3 === 0 ? 1.4 : 0.9));
    this.beamGlow = Math.max(0, this.beamGlow - dt * 0.9);
    this.beam.material.opacity = (this.ufoTrip ? 0.05 : 0.22) + this.beamGlow * 0.4 + Math.sin(time * 3) * 0.03;
    this.beam.scale.set(1, 1, 1).multiplyScalar(1 + this.beamGlow * 0.12);
    this.spot.material.opacity = this.ufoTrip ? 0.05 : 0.22 + this.beamGlow * 0.3;
    // the islands bob; the arrow bounces over whoever's turn it is
    for (const isl of this.islands.values()) {
      isl.body.position.y = Math.sin(time * 0.9 + isl.phase) * 0.18;
      if (isl.arrow.visible) {
        isl.arrow.position.y = 4.4 + Math.abs(Math.sin(time * 4)) * 0.6;
        isl.arrow.rotation.y = time * 2;
      }
      isl.pads.forEach((pad) => {
        if (!pad) return;
        pad.pick.material.opacity += ((pad.pickOn ? 0.7 + Math.sin(time * 7) * 0.3 : 0) - pad.pick.material.opacity) * Math.min(1, dt * 10);
        pad.pick.scale.setScalar(pad.pickOn ? 1 + Math.sin(time * 7) * 0.04 : 1);
      });
    }
    // every buddy: slide to its spot, bob, blink, and look at the camera
    const cam = this.stage.camera.position;
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
    }
    // harvested stars hopping off
    for (let i = this.leavers.length - 1; i >= 0; i--) {
      const l = this.leavers[i];
      l.t += dt;
      l.vel.y -= 16 * dt;
      l.obj.position.addScaledVector(l.vel, dt);
      l.obj.rotation.z += l.spin * dt;
      l.obj.userData.update(time, dt);
      if (l.t > 0.55) l.obj.scale.setScalar(Math.max(0.001, l.from * (1 - (l.t - 0.55) / 0.3)));
      if (l.t > 0.85) {
        l.obj.removeFromParent();
        this.leavers.splice(i, 1);
      }
    }
    // things in flight
    for (let i = this.fliers.length - 1; i >= 0; i--) {
      const f = this.fliers[i];
      f.t += dt;
      if (f.t < 0) continue;
      f.obj.visible = true;
      const k = Math.min(1, f.t / f.dur);
      const e = k * k * (3 - 2 * k);
      f.obj.position.lerpVectors(f.from, f.to, e);
      f.obj.position.y += Math.sin(Math.PI * e) * f.arc;
      f.obj.scale.setScalar(Math.max(0.001, f.scale * (k < 0.15 ? k / 0.15 : 1)));
      if (f.spin) f.obj.rotation.y += dt * 9;
      else {
        f.obj.lookAt(cam.x, f.obj.position.y, cam.z);
        f.obj.userData.update?.(time, dt);
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

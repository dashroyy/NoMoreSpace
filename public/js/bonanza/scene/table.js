// Star Bonanza: the table. An oval of dark glass under the galaxy, with the deck swirling at the centre, and a
// territory for every player round the edge: glowing nursery pads where their stars grow (the more of a kind, the
// brighter the pad), a tray of stars they have just won and must plant, and a stack of gold lumens. It only
// ever draws what the game state says; sync(state) brings it up to date and everything pops, flies and fades in
// between. Positions for the effects (where a harvest happens, where a trade flies to) come from posOf().
import * as THREE from 'three';
import { el } from '../../util.js';
import { glowTexture } from '../../ruler/scene/galaxy.js';
import { plasmaMaterial } from '../../ruler/scene/arena.js';
import { makeStar, makeCoin, tickStars, radiusOf } from './starmesh.js';
import { star } from '../net.js';

export const TABLE_X = 15; // the oval's half-width and half-depth
export const TABLE_Z = 8.4;
const PAD_R = 1.45;
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const back = (x) => {
  const c1 = 1.9;
  const y = Math.min(1, Math.max(0, x)) - 1;
  return 1 + (c1 + 1) * y * y * y + c1 * y * y;
};

// where seat i of n sits on the oval, with seat `mine` at the bottom (nearest the camera)
export function seatPosition(i, n, mine = 0) {
  const a = ((i - mine) * Math.PI * 2) / n;
  return { a, pos: new THREE.Vector3(Math.sin(a) * TABLE_X, 0, Math.cos(a) * TABLE_Z) };
}

let CHART = null;
// the holographic chart on the glass: rings, spokes and tick marks
function chartTexture() {
  if (CHART) return CHART;
  const s = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.translate(s / 2, s / 2);
  g.strokeStyle = 'rgba(0,240,255,0.6)';
  for (let r = 70; r < s / 2; r += 56) {
    g.lineWidth = r % 224 < 56 ? 2.4 : 1;
    g.globalAlpha = 0.2 + (r % 224 < 56 ? 0.3 : 0);
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.globalAlpha = 0.16;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * 70, Math.sin(a) * 70);
    g.lineTo(Math.cos(a) * (s / 2 - 10), Math.sin(a) * (s / 2 - 10));
    g.stroke();
  }
  g.globalAlpha = 0.5;
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * (s / 2 - 10), Math.sin(a) * (s / 2 - 10));
    g.lineTo(Math.cos(a) * (s / 2 - (i % 5 ? 22 : 34)), Math.sin(a) * (s / 2 - (i % 5 ? 22 : 34)));
    g.stroke();
  }
  CHART = new THREE.CanvasTexture(c);
  CHART.colorSpace = THREE.SRGBColorSpace;
  CHART.anisotropy = 4;
  return CHART;
}

const additive = (o) => ({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...o });

export class StarTable {
  constructor(stage) {
    this.stage = stage;
    this.root = new THREE.Group();
    stage.scene.add(this.root);
    this.fx = null; // set by the world: trails for things in flight
    this.anims = []; // things popping in or fading out
    this.fliers = []; // things flying from one place to another
    this.territories = new Map(); // pid -> territory
    this.faceUp = new Map(); // uid -> { obj, label }
    this.t = 0;
    this.mine = null;
    this.activePid = null;
    this.build();
    this.unframe = stage.onFrame((dt, t) => this.update(dt, t));
  }

  // ---------------------------------------------------------------------------
  // The permanent parts: the glass, the rings, the deck
  // ---------------------------------------------------------------------------
  build() {
    const glass = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.MeshBasicMaterial({ color: 0x0a1233, transparent: true, opacity: 0.62, depthWrite: false }));
    glass.rotation.x = -Math.PI / 2;
    glass.scale.set(TABLE_X + 3.4, TABLE_Z + 3.4, 1);
    glass.position.y = -0.04;
    this.root.add(glass);
    const chart = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.MeshBasicMaterial({ map: chartTexture(), ...additive({ opacity: 0.55 }) }));
    chart.rotation.x = -Math.PI / 2;
    chart.scale.copy(glass.scale);
    chart.position.y = -0.02;
    this.chart = chart;
    this.root.add(chart);
    // a bright rim, and a soft glow round the edge of the glass
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 8, 128), new THREE.MeshBasicMaterial({ color: 0x4fe8ff, ...additive({ opacity: 0.8 }) }));
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(TABLE_X + 3.4, TABLE_Z + 3.4, 1);
    this.root.add(rim);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 8, 128), new THREE.MeshBasicMaterial({ color: 0x4fe8ff, ...additive({ opacity: 0.16 }) }));
    halo.rotation.x = Math.PI / 2;
    halo.scale.copy(rim.scale);
    this.root.add(halo);

    // the deck: a swirl of violet plasma with two rings turning round it
    this.deck = new THREE.Group();
    this.deck.position.set(0, 0.85, 0);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 24), plasmaMaterial('#e6c8ff', '#7b3dff', '#14052e', 0.35));
    this.deckMat = orb.material;
    this.deck.add(orb);
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(128), color: 0x8a5bff, ...additive({ opacity: 0.8 }) }));
    aura.scale.setScalar(5.2);
    this.deck.add(aura);
    this.rings = [1.25, 1.55].map((r, i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 8, 80), new THREE.MeshBasicMaterial({ color: i ? 0x00f0ff : 0xc9a2ff, ...additive({ opacity: 0.65 }) }));
      ring.rotation.x = 1.1 + i * 0.5;
      this.deck.add(ring);
      return ring;
    });
    this.root.add(this.deck);
    this.deckTag = el('div', { className: 'deck-tag' }, el('b', {}, 'DECK'), el('span', { className: 'dk-n' }, '0'), el('small', { className: 'dk-pass' }));
    this.deckLabel = this.stage.addLabel(this.deck, this.deckTag, 2.1);
  }

  // ---------------------------------------------------------------------------
  // The players
  // ---------------------------------------------------------------------------
  makeTerritory(p) {
    const root = new THREE.Group();
    this.root.add(root);
    const t = { pid: p.id, root, pads: [], tray: new Map(), coins: [], coinGroup: new THREE.Group(), trayGroup: new THREE.Group(), color: new THREE.Color('#4fe8ff') };
    t.coinGroup.position.set(0, 0, -2.55);
    t.trayGroup.position.set(0, 0, 2.9);
    root.add(t.coinGroup, t.trayGroup);
    // the tray: a faint ring on the glass where stars you have won wait to be planted
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.02, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffd36b, ...additive({ opacity: 0.35 }) }));
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(1.8, 1, 0.8);
    t.trayGroup.add(ring);
    t.trayRing = ring;
    // a pool of light under whoever's turn it is
    const spot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTexture(128), color: 0xffd36b, ...additive({ opacity: 0 }) }));
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(0, 0.02, -0.4);
    spot.scale.set(12, 7.5, 1);
    root.add(spot);
    t.spot = spot;
    // the name plate
    t.anchor = new THREE.Object3D();
    t.anchor.position.set(0, 0.3, -3.9);
    root.add(t.anchor);
    t.tag = el('div', { className: 'tag' });
    t.label = this.stage.addLabel(t.anchor, t.tag, 0);
    this.territories.set(p.id, t);
    return t;
  }

  makePad(t, i) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(PAD_R, PAD_R + 0.08, 0.1, 48), new THREE.MeshStandardMaterial({ color: 0x0e1840, metalness: 0.6, roughness: 0.4 }));
    base.position.y = 0.03;
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x4fe8ff, ...additive({ opacity: 0.55 }) });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(PAD_R - 0.05, 0.035, 8, 64), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.09;
    const fill = new THREE.Mesh(new THREE.CircleGeometry(PAD_R - 0.1, 48), new THREE.MeshBasicMaterial({ color: 0x4fe8ff, ...additive({ opacity: 0.05 }) }));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.075;
    // a brighter, wider ring that says "plant here" (switched on from outside)
    const pick = new THREE.Mesh(new THREE.TorusGeometry(PAD_R + 0.22, 0.06, 8, 64), new THREE.MeshBasicMaterial({ color: 0xffd36b, ...additive({ opacity: 0 }) }));
    pick.rotation.x = Math.PI / 2;
    pick.position.y = 0.1;
    g.add(base, ring, fill, pick);
    const tag = el('div', { className: 'padtag' });
    const anchor = new THREE.Object3D();
    anchor.position.set(0, 2.5, 0);
    g.add(anchor);
    const label = this.stage.addLabel(anchor, tag, 0);
    const pad = { g, ring, ringMat, fill, pick, tag, label, items: [], type: null, level: 0, want: 0, pickOn: false, sig: '' };
    t.root.add(g);
    t.pads[i] = pad;
    return pad;
  }

  padX(count, i) {
    return (i - (count - 1) / 2) * (PAD_R * 2 + 0.55);
  }

  // phyllotaxis: stars spiral out from the middle of the pad
  slot(i, type, n) {
    const s = Math.max(0.24, radiusOf(type) * 1.2);
    const rad = Math.min(PAD_R - 0.25, s * Math.sqrt(i + 0.55) * 1.05);
    const a = i * 2.399963;
    return new THREE.Vector3(Math.cos(a) * rad, 0.5, Math.sin(a) * rad);
  }

  growIn(obj, delay = 0, dur = 0.45) {
    obj.scale.setScalar(0.001);
    this.anims.push({ obj, kind: 'in', t: -delay, dur, to: 1 });
  }
  shrinkOut(obj, dur = 0.35) {
    this.anims.push({ obj, kind: 'out', t: 0, dur, from: obj.scale.x, remove: true });
  }

  addStar(parent, id, pos, scale = 1, delay = 0) {
    const obj = makeStar(id);
    obj.position.copy(pos);
    obj.userData.base = scale;
    parent.add(obj);
    this.growIn(obj, delay);
    obj.userData.target = scale;
    return obj;
  }

  // ---------------------------------------------------------------------------
  // Bringing the table up to date with the game
  // ---------------------------------------------------------------------------
  sync(state) {
    const n = state.players.length;
    const meIndex = Math.max(0, state.players.findIndex((p) => p.id === state.you.id));
    this.mine = state.you.id;
    const keep = new Set();
    state.players.forEach((p, i) => {
      keep.add(p.id);
      const t = this.territories.get(p.id) || this.makeTerritory(p);
      const seat = seatPosition(i, n, meIndex);
      t.seat = i;
      t.root.position.copy(seat.pos);
      // face the middle of the table
      t.root.rotation.y = Math.atan2(-seat.pos.x, -seat.pos.z);
      this.syncPads(t, p);
      this.syncTray(t, p);
      this.syncCoins(t, p);
      this.syncTag(t, p, state);
    });
    for (const [pid, t] of [...this.territories]) {
      if (keep.has(pid)) continue;
      t.label.remove();
      t.pads.forEach((pd) => pd?.label.remove());
      t.root.removeFromParent();
      this.territories.delete(pid);
    }
    this.syncFaceUp(state);
    this.activePid = state.turn?.pid || null;
    this.deckTag.querySelector('.dk-n').textContent = `${state.deckCount}`;
    this.deckTag.querySelector('.dk-pass').textContent = state.phase === 'playing' ? `shuffle ${Math.min(state.deckOuts + 1, state.passes)} of ${state.passes}` : '';
    this.deckTag.classList.toggle('last', !!state.endPending);
  }

  syncPads(t, p) {
    const count = p.fields.length;
    p.fields.forEach((f, i) => {
      const pad = t.pads[i] || this.makePad(t, i);
      pad.g.position.set(this.padX(count, i), 0, 0);
      const d = f.type ? star(f.type) : null;
      // a different kind (or an emptied nursery): the old stars go
      if (pad.type && (pad.type !== f.type || f.n < pad.items.length)) {
        const keepN = pad.type === f.type ? f.n : 0;
        while (pad.items.length > keepN) this.shrinkOut(pad.items.pop());
        if (!keepN) pad.type = null;
      }
      if (f.type && f.n > pad.items.length) {
        pad.type = f.type;
        const scale = 1 / (1 + Math.max(0, f.n - 7) * 0.035);
        for (let k = pad.items.length; k < f.n; k++) {
          const obj = this.addStar(pad.g, f.type, this.slot(k, f.type, f.n), scale, (k - pad.items.length) * 0.12);
          pad.items.push(obj);
        }
      }
      // spread them for the new count
      const scale = 1 / (1 + Math.max(0, f.n - 7) * 0.035);
      pad.items.forEach((obj, k) => {
        obj.userData.slotPos = this.slot(k, f.type, f.n);
        obj.userData.target = scale;
      });
      pad.want = d ? 0.55 + Math.min(0.45, f.n * 0.07) : 0;
      const col = d ? new THREE.Color(d.glow) : new THREE.Color('#4fe8ff');
      pad.ringMat.color.copy(col);
      pad.fill.material.color.copy(col);
      pad.type = f.type;
      const sig = `${f.type}|${f.n}`;
      if (pad.sig !== sig) {
        pad.sig = sig;
        pad.tag.replaceChildren(f.type ? el('b', { style: { color: d.color } }, `${f.n} × ${d.name}`) : el('span', { className: 'empty' }, 'Empty'));
        pad.tag.classList.toggle('empty', !f.type);
        pad.tag.style.setProperty('--c', d?.color || '#4fe8ff');
      }
    });
    // a nursery that has gone (never happens, but the table must not leak)
    while (t.pads.length > count) {
      const pad = t.pads.pop();
      pad.label.remove();
      pad.g.removeFromParent();
    }
  }

  syncTray(t, p) {
    const want = new Set(p.tray.map((c) => c.uid));
    for (const [uid, obj] of [...t.tray]) {
      if (want.has(uid)) continue;
      t.tray.delete(uid);
      this.shrinkOut(obj);
    }
    p.tray.forEach((c, i) => {
      let obj = t.tray.get(c.uid);
      if (!obj) {
        obj = this.addStar(t.trayGroup, c.t, new THREE.Vector3(0, 0.55, 0), 1.25, 0.8);
        t.tray.set(c.uid, obj);
      }
      const x = (i - (p.tray.length - 1) / 2) * 1.0;
      obj.userData.slotPos = new THREE.Vector3(x, 0.55, 0);
    });
    t.trayRing.material.opacity = p.tray.length ? 0.9 : 0.25;
    t.trayRing.userData.on = p.tray.length > 0;
  }

  syncCoins(t, p) {
    while (t.coins.length > Math.min(40, p.coins)) {
      const c = t.coins.pop();
      this.shrinkOut(c, 0.25);
    }
    for (let i = t.coins.length; i < Math.min(40, p.coins); i++) {
      const c = makeCoin();
      const col = Math.floor(i / 8);
      const x = (col - 2) * 0.85;
      c.position.set(x, 0.1 + (i % 8) * 0.105, (col % 2) * 0.16);
      c.rotation.y = i * 0.7;
      t.coinGroup.add(c);
      this.growIn(c, (i - t.coins.length) * 0.05, 0.3);
      c.userData.target = 1;
      t.coins.push(c);
    }
  }

  syncTag(t, p, state) {
    const sig = `${p.name}|${p.coins}|${p.handCount}|${p.connected}|${p.afk}|${state.turn?.pid === p.id}|${p.id === state.you.id}`;
    if (t.tag.dataset.sig === sig) return;
    t.tag.dataset.sig = sig;
    t.tag.classList.toggle('turn', state.turn?.pid === p.id);
    t.tag.classList.toggle('me', p.id === state.you.id);
    t.tag.classList.toggle('away', !p.connected || p.afk);
    t.tag.replaceChildren(el('span', { className: 'tg-av' }, p.avatar), el('b', {}, p.name), el('span', { className: 'tg-n' }, `✦ ${p.coins}`), el('span', { className: 'tg-h' }, `🂠 ${p.handCount}`));
  }

  // the two stars turned over for trading hover above the deck
  syncFaceUp(state) {
    const cards = state.turn?.phase === 'trade' ? state.turn.faceUp : [];
    const want = new Set(cards.map((c) => c.uid));
    for (const [uid, f] of [...this.faceUp]) {
      if (want.has(uid)) continue;
      this.faceUp.delete(uid);
      f.label.remove();
      this.shrinkOut(f.obj);
    }
    cards.forEach((c, i) => {
      let f = this.faceUp.get(c.uid);
      if (!f) {
        const obj = this.addStar(this.root, c.t, this.faceUpPos(i, cards.length), 2.1, 0.8 + i * 0.18);
        const tag = el('div', { className: 'futag' }, star(c.t)?.name || c.t);
        tag.style.setProperty('--c', star(c.t)?.color || '#fff');
        f = { obj, label: this.stage.addLabel(obj, tag, -0.6) };
        this.faceUp.set(c.uid, f);
      }
      f.obj.userData.slotPos = this.faceUpPos(i, cards.length);
    });
  }

  faceUpPos(i, n) {
    return new THREE.Vector3((i - (n - 1) / 2) * 5.6, 2.1, 3.1);
  }

  // ---------------------------------------------------------------------------
  // For the effects: where things are
  // ---------------------------------------------------------------------------
  posOf(pid, kind = 'tag', idx = 0) {
    const t = this.territories.get(pid);
    if (!t) return new THREE.Vector3();
    t.root.updateMatrixWorld(true);
    const local = { tag: [0, 1.2, -3.9], tray: [0, 0.6, 2.9], coins: [0, 0.5, -2.55], center: [0, 0.8, 0] }[kind];
    if (kind === 'pad') {
      const pad = t.pads[idx];
      return pad ? pad.g.localToWorld(new THREE.Vector3(0, 0.7, 0)) : t.root.localToWorld(new THREE.Vector3(0, 0.7, 0));
    }
    return t.root.localToWorld(new THREE.Vector3(...(local || [0, 0.6, 0])));
  }
  deckPos() {
    return this.deck.getWorldPosition(new THREE.Vector3());
  }

  // a star (or a lumen) flies along an arc from one place to another
  fly(from, to, { id = null, coin = false, dur = 0.9, arc = 2.4, scale = 1, delay = 0, onDone = null } = {}) {
    const obj = coin ? makeCoin() : makeStar(id);
    obj.scale.setScalar(0.001);
    obj.position.copy(from);
    this.root.add(obj);
    const color = coin ? 0xffc83a : star(id)?.glow || '#ffffff';
    this.fliers.push({ obj, from: from.clone(), to: to.clone(), t: -delay, dur, arc, scale: coin ? 1.4 : scale, color, onDone });
    return obj;
  }

  // the newest star in a nursery (and the newest lumens in a stack) pop in a moment later, when what flies to them arrives
  delayLast(pid, field, delay) {
    const pad = this.territories.get(pid)?.pads[field];
    const obj = pad?.items[pad.items.length - 1];
    if (obj) this.reGrow(obj, delay);
  }
  delayCoins(pid, n, delay) {
    const t = this.territories.get(pid);
    if (!t) return;
    t.coins.slice(-n).forEach((c, i) => this.reGrow(c, delay + i * 0.14, 0.3));
  }
  reGrow(obj, delay, dur = 0.45) {
    this.anims = this.anims.filter((a) => a.obj !== obj);
    obj.scale.setScalar(0.001);
    this.anims.push({ obj, kind: 'in', t: -delay, dur, to: 1 });
  }

  // lights up (or not) the "plant here" ring on one of a player's pads
  highlight(pid, fieldIdx, on) {
    const pad = this.territories.get(pid)?.pads[fieldIdx];
    if (pad) pad.pickOn = on;
  }
  clearHighlights() {
    for (const t of this.territories.values()) for (const pad of t.pads) if (pad) pad.pickOn = false;
  }

  // ---------------------------------------------------------------------------
  update(dt, time) {
    this.t = time;
    tickStars(time);
    this.chart.rotation.z = time * 0.01;
    this.deck.rotation.y = time * 0.25;
    this.rings.forEach((r, i) => (r.rotation.z = time * (0.4 + i * 0.25) * (i ? -1 : 1)));
    // pops and fades
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      if (a.t < 0) continue;
      const k = a.t / a.dur;
      if (a.kind === 'in') a.obj.scale.setScalar(Math.max(0.001, back(k) * (a.obj.userData.target ?? a.to)));
      else a.obj.scale.setScalar(Math.max(0.001, a.from * (1 - ease(k))));
      if (k >= 1) {
        if (a.kind === 'out' && a.remove) a.obj.removeFromParent();
        this.anims.splice(i, 1);
      }
    }
    // stars in nurseries, trays and the middle: drift to their slot and bob
    for (const t of this.territories.values()) {
      const active = t.pid === this.activePid;
      t.spot.material.opacity += ((active ? 0.5 + Math.sin(time * 2.4) * 0.12 : 0) - t.spot.material.opacity) * Math.min(1, dt * 4);
      t.pads.forEach((pad, pi) => {
        pad.level += (pad.want - pad.level) * Math.min(1, dt * 3);
        pad.ringMat.opacity = 0.35 + pad.level * 0.65 + (active ? 0.15 + Math.sin(time * 4) * 0.08 : 0);
        pad.fill.material.opacity = 0.05 + pad.level * 0.22;
        pad.pick.material.opacity += ((pad.pickOn ? 0.55 + Math.sin(time * 6) * 0.25 : 0) - pad.pick.material.opacity) * Math.min(1, dt * 10);
        pad.items.forEach((obj, k) => this.drift(obj, dt, time, k));
      });
      for (const obj of t.tray.values()) this.drift(obj, dt, time, 3);
      t.trayRing.rotation.z = time * 0.3;
    }
    for (const f of this.faceUp.values()) this.drift(f.obj, dt, time, 1, 0.12);
    // things in flight
    for (let i = this.fliers.length - 1; i >= 0; i--) {
      const f = this.fliers[i];
      f.t += dt;
      if (f.t < 0) continue;
      const k = Math.min(1, f.t / f.dur);
      const e = k * k * (3 - 2 * k);
      f.obj.position.lerpVectors(f.from, f.to, e);
      f.obj.position.y += Math.sin(Math.PI * e) * f.arc;
      f.obj.scale.setScalar(Math.max(0.001, f.scale * (k < 0.15 ? k / 0.15 : k > 0.85 ? 1 - (k - 0.85) / 0.15 * 0.3 : 1)));
      if (f.obj.userData.update) f.obj.userData.update(time);
      else f.obj.rotation.y += dt * 6;
      if (this.fx && Math.random() < 0.7) this.fx.trail(f.obj.position, f.color);
      if (k >= 1) {
        f.obj.removeFromParent();
        this.fliers.splice(i, 1);
        f.onDone?.();
      }
    }
  }

  drift(obj, dt, time, k, bob = 0.05) {
    const slot = obj.userData.slotPos;
    if (slot) obj.position.x += (slot.x - obj.position.x) * Math.min(1, dt * 5);
    if (slot) obj.position.z += (slot.z - obj.position.z) * Math.min(1, dt * 5);
    if (slot) obj.position.y += (slot.y + Math.sin(time * 1.3 + k) * bob - obj.position.y) * Math.min(1, dt * 5);
    obj.userData.update?.(time);
  }

  dispose() {
    this.unframe();
    this.root.removeFromParent();
  }
}

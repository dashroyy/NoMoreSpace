// Star Charters: the map in 3D. Keeps the tiles, the probes and the anomalies on the table in step with the game
// (new tiles drop in with a clack, probes land on little flames and blast off home when they score), shows the
// glowing squares where your tile can go and the tile itself floating over the one you picked, lights up a whole
// feature when you point at it, and draws the wormhole bridges.
import * as THREE from 'three';
import { TILE, TOP, CELL, mats, glowTexture, chevrons } from './look.js';
import { makeTile, cellPos, laneCurve, DECK_H } from './tiles3d.js';
import { makeRocket, layDown, makeAnomaly, makeSpot } from './pieces.js';

const N = 7;
const key = (x, y) => `${x},${y}`;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;

export class Board3D {
  constructor(stage, { tileDef, colourOf, anomalyIcon }) {
    this.stage = stage;
    this.tileDef = tileDef;
    this.colourOf = colourOf;
    this.anomalyIcon = anomalyIcon;
    this.root = new THREE.Group();
    stage.scene.add(this.root);
    this.tiles = new Map();
    this.units = new Map();
    this.anoms = new Map();
    this.links = new Map();
    this.spots = new Map();
    this.spotGroup = new THREE.Group();
    this.root.add(this.spotGroup);
    this.hilite = null;
    this.ghost = null;
    this.anims = [];
    this.on = {}; // sounds: on.land(), on.probe(), on.liftoff()
    stage.onFrame((dt, t) => this.update(dt, t));
  }

  // ---------------------------------------------------------------------------
  // positions
  // ---------------------------------------------------------------------------
  centre(x, y) {
    return new THREE.Vector3(x * TILE, 0, y * TILE);
  }

  // where a piece of a tile is (for a probe, or a marker), whichever way the tile is turned
  segPos(t, r, x, y, seg) {
    const def = this.tileDef(t);
    const s = def?.shapes[r]?.segs[seg];
    const c = this.centre(x, y);
    if (!s) return c.setY(TOP);
    if (s.k === 'L') {
      const p = laneCurve(s, TOP).getPoint(0.5);
      return c.add(new THREE.Vector3(p.x, TOP + 0.02, p.z));
    }
    const [lx, lz] = cellPos(...s.anchor);
    return c.add(new THREE.Vector3(lx, s.k === 'S' ? TOP + DECK_H : s.k === 'A' || s.k === 'H' ? TOP + 0.08 : TOP, lz));
  }

  // which square of the map a point on the table is on, and which square of that tile
  under(point) {
    if (!point) return null;
    const x = Math.round(point.x / TILE);
    const y = Math.round(point.z / TILE);
    const u = (point.x - x * TILE) / TILE + 0.5;
    const v = (point.z - y * TILE) / TILE + 0.5;
    return { x, y, cx: Math.max(0, Math.min(N - 1, Math.floor(u * N))), cy: Math.max(0, Math.min(N - 1, Math.floor(v * N))) };
  }

  // the piece of a placed tile at a point: { x, y, seg, tile }
  segUnder(point) {
    const u = this.under(point);
    if (!u) return null;
    const tile = this.tiles.get(key(u.x, u.y));
    if (!tile) return null;
    const shape = this.tileDef(tile.t).shapes[tile.r];
    const ch = shape.segAt[u.cy * N + u.cx];
    if (ch === '-') return { x: u.x, y: u.y, seg: -1, tile };
    return { x: u.x, y: u.y, seg: ch.charCodeAt(0) - 97, tile };
  }

  bounds() {
    if (!this.tiles.size) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const t of this.tiles.values()) {
      minX = Math.min(minX, t.x);
      maxX = Math.max(maxX, t.x);
      minY = Math.min(minY, t.y);
      maxY = Math.max(maxY, t.y);
    }
    return { minX, maxX, minY, maxY };
  }

  // ---------------------------------------------------------------------------
  // keeping in step with the game
  // ---------------------------------------------------------------------------
  reset() {
    for (const t of this.tiles.values()) this.root.remove(t.mesh);
    for (const u of this.units.values()) this.root.remove(u.rocket);
    for (const a of this.anoms.values()) this.root.remove(a.mesh);
    for (const l of this.links.values()) this.root.remove(l.mesh);
    this.tiles.clear();
    this.units.clear();
    this.anoms.clear();
    this.links.clear();
    this.anims = [];
    this.clearGhost();
    this.setSpots([]);
    this.showCells(null);
  }

  // board: the server's board view; animate: new things arrive with a flourish
  sync(board, anomalies = [], { animate = true } = {}) {
    if (!board) return this.reset();
    const seen = new Set();
    const fresh = [];
    for (const bt of board.tiles) {
      const k = key(bt.x, bt.y);
      seen.add(k);
      let tile = this.tiles.get(k);
      if (tile && (tile.t !== bt.t || tile.r !== bt.r)) {
        this.root.remove(tile.mesh);
        tile = null;
      }
      if (!tile) {
        const mesh = makeTile(this.tileDef(bt.t), { variant: Math.abs(bt.x * 7 + bt.y * 13) });
        mesh.userData.setTurn(bt.r);
        mesh.position.copy(this.centre(bt.x, bt.y));
        this.root.add(mesh);
        tile = { mesh, x: bt.x, y: bt.y, t: bt.t, r: bt.r };
        this.tiles.set(k, tile);
        // the tile you just put down yourself is already sitting there: no second drop
        const g = this.ghost;
        if (g && !g.lifted && g.x === bt.x && g.y === bt.y && g.t === bt.t) this.clearGhost();
        else if (animate) fresh.push(tile);
      }
      tile.view = bt;
    }
    for (const [k, tile] of this.tiles)
      if (!seen.has(k)) {
        this.root.remove(tile.mesh);
        this.tiles.delete(k);
      }
    for (const tile of fresh) this.drop(tile);

    // the probes
    const want = new Map();
    for (const bt of board.tiles) for (const u of bt.u) want.set(`${bt.x},${bt.y},${u.seg}`, { ...u, x: bt.x, y: bt.y, t: bt.t, r: bt.r });
    for (const [k, u] of this.units) {
      const w = want.get(k);
      if (!w || w.pid !== u.pid || w.dread !== u.dread) {
        this.units.delete(k);
        if (animate) this.liftOff(u.rocket, 0.9);
        else this.root.remove(u.rocket);
      }
    }
    for (const [k, w] of want) {
      if (this.units.has(k)) continue;
      const rocket = makeRocket(this.colourOf(w.pid), { dread: w.dread });
      const def = this.tileDef(w.t);
      const kind = def.shapes[w.r].segs[w.seg]?.k;
      if (kind === 'V') layDown(rocket);
      rocket.position.copy(this.segPos(w.t, w.r, w.x, w.y, w.seg));
      this.root.add(rocket);
      this.units.set(k, { rocket, pid: w.pid, dread: w.dread });
      if (animate) this.land(rocket, fresh.length ? 0.45 : 0.05);
    }

    // anomalies
    const wantA = new Set(anomalies.map((a) => key(a.x, a.y)));
    for (const [k, a] of this.anoms)
      if (!wantA.has(k)) {
        this.root.remove(a.mesh);
        this.anoms.delete(k);
      }
    for (const a of anomalies) {
      const k = key(a.x, a.y);
      if (this.anoms.has(k)) continue;
      const mesh = makeAnomaly(a.kind, this.anomalyIcon(a.kind));
      mesh.position.copy(this.centre(a.x, a.y));
      this.root.add(mesh);
      this.anoms.set(k, { mesh, kind: a.kind });
      if (animate) this.popIn(mesh);
    }

    // wormhole bridges
    const wantL = new Set();
    for (const l of board.links || []) {
      const k = `${l.t}`;
      wantL.add(k);
      if (!this.links.has(k)) this.links.set(k, { mesh: this.bridge(l), born: this.stage.time });
    }
    for (const [k, l] of this.links)
      if (!wantL.has(k)) {
        this.root.remove(l.mesh);
        this.links.delete(k);
      }
  }

  // ---------------------------------------------------------------------------
  // little animations
  // ---------------------------------------------------------------------------
  animate(duration, fn, done) {
    this.anims.push({ t: 0, duration, fn, done });
  }

  drop(tile, delay = 0) {
    const m = tile.mesh;
    m.position.y = 3;
    m.visible = delay <= 0;
    let landed = false;
    this.animate(
      0.42 + delay,
      (k, t) => {
        const local = Math.max(0, t - delay) / 0.42;
        if (t < delay) return;
        m.visible = true;
        m.position.y = 3 * (1 - easeIn(Math.min(1, local)));
        if (local >= 1 && !landed) {
          landed = true;
          this.on.land?.(tile);
        }
      },
      () => {
        m.position.y = 0;
        this.squash(m);
      },
    );
  }

  squash(m) {
    this.animate(0.3, (k) => {
      const s = Math.sin(k * Math.PI) * (1 - k);
      m.scale.set(1 + s * 0.06, 1 - s * 0.12, 1 + s * 0.06);
    }, () => m.scale.set(1, 1, 1));
  }

  popIn(m) {
    m.scale.setScalar(0.01);
    this.animate(0.5, (k) => m.scale.setScalar(easeOut(k) * (1 + Math.sin(k * Math.PI) * 0.2)), () => m.scale.setScalar(1));
  }

  // a probe comes down on its flame
  land(rocket, delay = 0) {
    const end = rocket.position.clone();
    const ship = rocket.userData.ship;
    rocket.visible = false;
    let played = false;
    this.animate(0.9 + delay, (k, t) => {
      if (t < delay) return;
      if (!played) {
        played = true;
        this.on.probe?.();
      }
      rocket.visible = true;
      const local = Math.min(1, (t - delay) / 0.9);
      rocket.position.set(end.x, end.y + 5 * (1 - easeOut(local)), end.z);
      rocket.userData.flame.visible = local < 0.92;
      rocket.userData.flame.scale.setScalar(0.8 + Math.random() * 0.4);
      ship.rotation.y = (1 - local) * 6;
    }, () => {
      rocket.position.copy(end);
      rocket.userData.flame.visible = false;
      ship.rotation.y = 0;
      this.on.landed?.();
    });
  }

  // a probe blasts off home (then goes away)
  liftOff(rocket, delay = 0) {
    const start = rocket.position.clone();
    const ship = rocket.userData.ship;
    let played = false;
    this.animate(1.1 + delay, (k, t) => {
      if (t < delay) return;
      if (!played) {
        played = true;
        layDown(rocket, false);
        this.on.liftoff?.();
      }
      const local = Math.min(1, (t - delay) / 1.1);
      rocket.userData.flame.visible = true;
      rocket.userData.flame.scale.setScalar(1 + Math.random() * 0.5);
      rocket.position.set(start.x, start.y + 7 * easeIn(local), start.z - 2 * easeIn(local));
      ship.rotation.y = local * 5;
      rocket.scale.setScalar(1 - local * 0.4);
    }, () => this.root.remove(rocket));
  }

  // a short-lived rocket for a probe that scored the moment it landed (it never shows up in the game state)
  flyby(t, r, x, y, seg, pid, dread) {
    const rocket = makeRocket(this.colourOf(pid), { dread });
    rocket.position.copy(this.segPos(t, r, x, y, seg));
    this.root.add(rocket);
    this.land(rocket, 0.45);
    this.liftOff(rocket, 1.9);
  }

  // a glowing bridge over the map between two wormholes
  bridge(l) {
    const colour = l.t === 'gate' ? '#c27bff' : '#4fe3f5';
    const pa = this.portalPos(l.a);
    const pb = this.portalPos(l.b);
    const mid = pa.clone().add(pb).multiplyScalar(0.5);
    mid.y += 2.5 + pa.distanceTo(pb) * 0.25;
    const curve = new THREE.QuadraticBezierCurve3(pa, mid, pb);
    const tex = chevrons().clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(4, curve.getLength() / 0.6), 1);
    const mat = new THREE.MeshBasicMaterial({ color: colour, map: tex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.06, 8, false), mat);
    mesh.userData.update = (dt) => (tex.offset.x -= dt * 1.5);
    this.root.add(mesh);
    return mesh;
  }

  portalPos([x, y]) {
    const tile = this.tiles.get(key(x, y));
    const c = this.centre(x, y);
    if (!tile) return c.setY(TOP + 0.3);
    const shape = this.tileDef(tile.t).shapes[tile.r];
    for (let cy = 0; cy < N; cy++)
      for (let cx = 0; cx < N; cx++)
        if ('OQ'.includes(shape.rows[cy][cx])) {
          const [lx, lz] = cellPos(cx, cy);
          return c.add(new THREE.Vector3(lx, TOP + 0.3 + (shape.rows[cy][cx] === 'Q' ? DECK_H : 0), lz));
        }
    return c.setY(TOP + 0.3);
  }

  // ---------------------------------------------------------------------------
  // placing a tile: the glowing squares, and the tile floating over the one you chose
  // ---------------------------------------------------------------------------
  setSpots(list) {
    const want = new Set(list.map((s) => key(s.x, s.y)));
    for (const [k, m] of this.spots)
      if (!want.has(k)) {
        this.spotGroup.remove(m);
        this.spots.delete(k);
      }
    for (const s of list) {
      const k = key(s.x, s.y);
      if (this.spots.has(k)) continue;
      const m = makeSpot(TILE * 0.94);
      m.material = m.material.clone();
      m.position.add(this.centre(s.x, s.y));
      this.spotGroup.add(m);
      this.spots.set(k, m);
    }
    this.hotSpot = null;
  }

  // the spot under the pointer glows brighter
  setHotSpot(x, y) {
    this.hotSpot = x == null ? null : key(x, y);
  }

  setGhost(t, x, y, r, { lifted = true } = {}) {
    if (!this.ghost || this.ghost.t !== t) {
      this.clearGhost();
      const mesh = makeTile(this.tileDef(t), { variant: 3 });
      mesh.userData.setTurn(r);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffe9a8', transparent: true, depthWrite: false, opacity: 0.0 }));
      glow.scale.set(TILE * 2.2, TILE * 2.2, 1);
      this.root.add(mesh);
      this.ghost = { mesh, t, r, turn: (-r * Math.PI) / 2, x, y, lifted, glow };
      mesh.position.copy(this.centre(x, y));
      mesh.position.y = lifted ? 1.2 : 0;
    }
    const g = this.ghost;
    // turn the shortest way to the new rotation
    let target = (-r * Math.PI) / 2;
    while (target - g.turn > Math.PI) target -= Math.PI * 2;
    while (target - g.turn < -Math.PI) target += Math.PI * 2;
    g.turnTo = target;
    g.r = r;
    g.x = x;
    g.y = y;
    if (g.lifted && !lifted) this.on.land?.();
    g.lifted = lifted;
    g.mesh.visible = true;
  }

  clearGhost() {
    if (!this.ghost) return;
    this.root.remove(this.ghost.mesh);
    this.ghost = null;
  }

  // ---------------------------------------------------------------------------
  // lighting up a feature: every square of it, on every tile (cells: [{ x, y, t, r, seg }])
  // ---------------------------------------------------------------------------
  showCells(list, colour = '#fff4c2') {
    if (this.hilite) {
      this.root.remove(this.hilite);
      this.hilite.geometry.dispose();
      this.hilite = null;
    }
    if (!list?.length) return;
    const pos = [];
    const q = CELL * 0.5;
    for (const { x, y, t, r, seg } of list) {
      const shape = this.tileDef(t).shapes[r];
      const ch = String.fromCharCode(97 + seg);
      const c = this.centre(x, y);
      for (let cy = 0; cy < N; cy++)
        for (let cx = 0; cx < N; cx++) {
          if (shape.segAt[cy * N + cx] !== ch) continue;
          const [lx, lz] = cellPos(cx, cy);
          const k = shape.segs[seg].k;
          const h = (k === 'S' ? TOP + DECK_H : TOP) + 0.012;
          const X = c.x + lx;
          const Z = c.z + lz;
          pos.push(X - q, h, Z - q, X - q, h, Z + q, X + q, h, Z + q, X - q, h, Z - q, X + q, h, Z + q, X + q, h, Z - q);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.hilite = new THREE.Mesh(geo, mat);
    this.hilite.renderOrder = 2;
    this.root.add(this.hilite);
  }

  // ---------------------------------------------------------------------------
  update(dt, t) {
    for (const tile of this.tiles.values()) tile.mesh.userData.update(dt, t);
    for (const a of this.anoms.values()) a.mesh.userData.update(dt, t);
    for (const l of this.links.values()) l.mesh.userData.update(dt, t);
    chevrons().offset.x -= dt * 0.9; // the stripes run along every lane
    const pulse = 0.55 + Math.sin(t * 4) * 0.25;
    for (const [k, m] of this.spots) {
      const hot = k === this.hotSpot;
      m.material.opacity = hot ? 1 : pulse;
      m.material.color.set(hot ? '#f08a3c' : '#2a9d8f');
    }
    if (this.hilite) this.hilite.material.opacity = 0.32 + Math.sin(t * 5) * 0.1;
    const g = this.ghost;
    if (g) {
      g.turn += (g.turnTo - g.turn) * Math.min(1, dt * 14);
      g.mesh.userData.spin.rotation.y = g.turn;
      const c = this.centre(g.x, g.y);
      const y = g.lifted ? 0.55 + Math.sin(t * 3) * 0.08 : 0;
      g.mesh.position.x += (c.x - g.mesh.position.x) * Math.min(1, dt * 16);
      g.mesh.position.z += (c.z - g.mesh.position.z) * Math.min(1, dt * 16);
      g.mesh.position.y += (y - g.mesh.position.y) * Math.min(1, dt * (g.lifted ? 10 : 18));
      g.mesh.userData.update(dt, t);
    }
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.duration);
      a.fn(k, a.t);
      if (k >= 1) {
        this.anims.splice(i, 1);
        a.done?.();
      }
    }
  }
}

export { mats };

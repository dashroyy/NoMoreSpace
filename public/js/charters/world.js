// Star Charters: the 3D world behind every screen. The cream star-chart table, the map of tiles on it, the
// celebrations, and the camera's moves. On the title screen and in the lobby a demo map builds itself, tile by tile,
// while the camera slowly circles it.
import * as THREE from 'three';
import { Stage } from './scene/stage.js';
import { Board3D } from './scene/board3d.js';
import { Effects } from './scene/effects.js';
import { TILE, chartTexture } from './scene/look.js';
import { store, tileDef, colourOf } from './net.js';

const SIDE = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export class World {
  constructor() {
    this.stage = new Stage(document.getElementById('stage'), document.getElementById('labels'));
    const s = this.stage;
    // the chart table: the grid on it lines up with the tiles
    const tex = chartTexture();
    const size = 480;
    tex.repeat.set(size / (TILE * 4), size / (TILE * 4));
    tex.offset.set(0.125, 0.125);
    const table = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }));
    table.receiveShadow = true;
    s.scene.add(table);
    this.board = new Board3D(s, {
      tileDef,
      colourOf: (pid) => (this.demo ? this.demo.colours[pid] : colourOf(pid)),
      anomalyIcon: (k) => store.data?.anomalies[k]?.icon || '❔',
    });
    this.fx = new Effects(s);
    this.fx.light = s.small;
    this.mode = 'home';
    this.demo = null;
    this.ready = Promise.resolve();
    s.onFrame((dt) => this.tick(dt));
  }

  // ---------------------------------------------------------------------------
  // the camera
  // ---------------------------------------------------------------------------
  // fit the whole map on the screen
  frame(duration = 1.1, { force = false } = {}) {
    if (!force && this.stage.time - this.stage.userMoved < 6) return; // they are looking somewhere: leave them be
    const b = this.board.bounds();
    const cx = ((b.minX + b.maxX) / 2) * TILE;
    const cz = ((b.minY + b.maxY) / 2) * TILE;
    // far enough back for the whole map plus a ring of empty squares round it, across and down the screen
    const w = (b.maxX - b.minX + 3) * TILE;
    const h = (b.maxY - b.minY + 3) * TILE;
    const cam = this.stage.camera;
    const tan = Math.tan(((cam.fov || 40) * Math.PI) / 360);
    const need = Math.max(w / (2 * tan * (cam.aspect || 1.6)), (h * 0.85) / (2 * tan));
    this.stage.fly({ target: new THREE.Vector3(cx, 0, cz + 0.6), dist: Math.max(10, Math.min(60, need * 1.12 + 2)), phi: 0.68, theta: 0 }, duration);
  }

  // look at one spot on the map (someone else's move), without zooming further out than needed
  lookAt(x, y, duration = 0.9) {
    if (this.stage.time - this.stage.userMoved < 6) return;
    const c = new THREE.Vector3(x * TILE, 0, y * TILE + 0.6);
    const now = this.stage.rig.target;
    if (now.distanceTo(c) < this.stage.rig.dist * 0.28) return;
    this.stage.fly({ target: now.clone().lerp(c, 0.65) }, duration);
  }

  // ---------------------------------------------------------------------------
  // title screen and lobby: a demo map that builds itself
  // ---------------------------------------------------------------------------
  showcase(mode) {
    if (this.mode === mode && this.demo) return;
    this.mode = mode;
    if (!this.demo) this.startDemo();
    // on a wide screen the menu sits on the left and the map builds itself on the right
    const wide = innerWidth >= 980;
    this.stage.setShift(mode === 'home' && wide ? 0.2 : 0, mode === 'home' && !wide ? -0.18 : 0);
    this.stage.fly({ target: new THREE.Vector3(0, 0, 0), dist: mode === 'lobby' ? 17 : wide ? 15 : 19, phi: 0.95 }, 1.6);
  }

  startDemo() {
    this.board.reset();
    this.demo = { tiles: [{ x: 0, y: 0, t: store.data.start, r: 0, u: [] }], timer: 0.4, colours: { a: '#e5484d', b: '#3b7ff5', c: '#25a55f', d: '#ffc93c' }, bag: [] };
    for (const t of store.data.tiles) for (let i = 0; i < t.count; i++) this.demo.bag.push(t.id);
    this.demoSync();
  }

  stopDemo() {
    this.demo = null;
    this.board.reset();
  }

  demoSync() {
    this.board.sync({ tiles: this.demo.tiles, links: [] }, [], { animate: true });
  }

  demoStep() {
    const d = this.demo;
    if (d.tiles.length >= 26) {
      this.startDemo();
      return;
    }
    const at = new Map(d.tiles.map((t) => [`${t.x},${t.y}`, t]));
    const edges = (t) => tileDef(t.t).shapes[t.r].edges;
    const spots = new Map();
    for (const t of d.tiles)
      for (const [dx, dy] of SIDE) {
        const x = t.x + dx;
        const y = t.y + dy;
        if (!at.has(`${x},${y}`) && Math.abs(x) <= 3 && Math.abs(y) <= 2) spots.set(`${x},${y}`, [x, y]);
      }
    const list = [...spots.values()].sort(() => Math.random() - 0.5);
    for (let tries = 0; tries < 12; tries++) {
      const id = d.bag[Math.floor(Math.random() * d.bag.length)];
      if (id === 'gate' || id === 'gate-station') continue;
      for (const [x, y] of list)
        for (const r of [0, 1, 2, 3].sort(() => Math.random() - 0.5)) {
          const mine = tileDef(id).shapes[r].edges;
          const ok = SIDE.every(([dx, dy], side) => {
            const n = at.get(`${x + dx},${y + dy}`);
            return !n || edges(n)[(side + 2) % 4] === mine[side];
          });
          if (!ok) continue;
          const tile = { x, y, t: id, r, u: [] };
          // now and then a probe lands on it
          if (Math.random() < 0.35) {
            const segs = tileDef(id).shapes[r].segs;
            const seg = Math.floor(Math.random() * segs.length);
            if (segs[seg].k !== 'V') tile.u.push({ seg, pid: 'abcd'[Math.floor(Math.random() * 4)], dread: Math.random() < 0.15 });
          }
          d.tiles.push(tile);
          this.demoSync();
          return;
        }
    }
  }

  tick(dt) {
    if (this.demo && (this.mode === 'home' || this.mode === 'lobby')) {
      this.demo.timer -= dt;
      if (this.demo.timer <= 0) {
        this.demo.timer = 1.25;
        this.demoStep();
      }
      if (!this.stage.tween) this.stage.rig.theta += dt * 0.06;
    }
  }

  // into a game: the demo goes, the camera settles over the map
  enterGame() {
    if (this.mode === 'game') return;
    this.mode = 'game';
    this.stopDemo();
    this.stage.setShift(0, -0.07); // (the dock covers the bottom of the screen)
    const th = this.stage.rig.theta;
    this.stage.rig.theta = Math.atan2(Math.sin(th), Math.cos(th)); // (the shortest way back round to north-up)
  }
}

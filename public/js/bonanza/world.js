// Star Bonanza: the 3D world, kept in step with the game. It owns the stage (renderer and camera), the galaxy
// behind everything, the effects and the table with a territory for every player. On the title and lobby screens
// the table runs a little demo game by itself (stars planted, nurseries harvested, lumens stacking up) while the
// camera drifts, so the menus are never a still picture.
import * as THREE from 'three';
import { Stage } from '../ruler/scene/stage.js';
import { Universe } from '../ruler/scene/galaxy.js';
import { Effects } from '../ruler/scene/effects.js';
import { StarTable } from './scene/table.js';
import { store, star, payout } from './net.js';

// the table as you play: the whole oval, nudged up so the hand and your nurseries at the bottom do not hide it
const GAME_VIEW = () => (innerWidth > 820 ? { target: new THREE.Vector3(0, 0, 2.2), radius: 37, theta: 0, phi: 0.9 } : { target: new THREE.Vector3(0, 0, 3.4), radius: 46, theta: 0, phi: 0.95 });
// the title screen: the table over to the right, clear of the menu on the left (on a phone the menu is at the bottom)
const HOME_VIEW = () => (innerWidth > 820 ? { target: new THREE.Vector3(0, 0, 1.2), radius: 38, theta: 0.1, phi: 0.95 } : { target: new THREE.Vector3(0, -3, 3.5), radius: 46, theta: 0, phi: 0.85 });
const LOBBY_VIEW = () => (innerWidth > 820 ? { target: new THREE.Vector3(0, 0, 2.4), radius: 40, theta: 0.08, phi: 0.95 } : { target: new THREE.Vector3(0, -3, 3.5), radius: 46, theta: 0, phi: 0.85 });
// the opening shot behind the start screen: far out over the galaxy
const TITLE_SHOT = { target: new THREE.Vector3(0, -30, 0), radius: 160, theta: -0.7, phi: 0.55 };

const DEMO_NAMES = [['Nova', '🛸'], ['Orbit', '🪐'], ['Zip', '☄️'], ['Comet', '🌟'], ['Pixel', '👾']];
const DEMO_KINDS = ['red-dwarf', 'orange-dwarf', 'yellow-dwarf', 'blue-giant', 'pulsar', 'white-dwarf', 'red-giant', 'neutron-star'];

export class World {
  constructor() {
    this.stage = new Stage(document.getElementById('stage'), document.getElementById('labels'));
    this.universe = new Universe(this.stage);
    this.fx = new Effects(this.stage);
    this.table = new StarTable(this.stage);
    this.table.fx = this.fx;
    this.mode = null;
    this.demo = null;
    this.demoClock = 0;
    this.titleMenu = true;
    this.ready = Promise.resolve();
    this.shiftX = 0;
    this.shiftY = 0;
    this.trading = false; // the trading panel is open on the right: the table slides left to make room
    this.handFrom = null; // where the star you just planted came from on the screen (a card in your hand)
    this.stage.onFrame((dt) => this.update(dt));
    this.stage.fly(HOME_VIEW(), 0.01);
  }

  // ---------------------------------------------------------------------------
  // Title screen and lobby: the table plays a demo game
  // ---------------------------------------------------------------------------
  showcase(view = 'home') {
    if (this.mode !== 'showcase') {
      this.mode = 'showcase';
      this.demo = this.makeDemo();
      this.table.sync(this.demoState());
      this.table.clearHighlights();
    }
    if (view !== this.shot) {
      this.shot = view;
      this.stage.spin = 0;
      this.stage.fly(view === 'lobby' ? LOBBY_VIEW() : HOME_VIEW(), 1.6);
      this.stage.drift = 1;
    }
  }

  // the start screen: far out over the galaxy...
  titleShot() {
    this.stage.fly(TITLE_SHOT, 0.01);
    this.stage.spin = 0.03;
    this.stage.drift = 0.4;
    this.titleMenu = false;
  }

  // ...and, on "Press any key", the dive down to the table
  swoopIn() {
    this.stage.spin = 0;
    this.stage.drift = 1;
    this.titleMenu = true;
    this.stage.fly(HOME_VIEW(), 3.4);
  }

  makeDemo() {
    const players = DEMO_NAMES.slice(0, 4).map(([name, avatar], i) => ({ id: `d${i}`, name, avatar, coins: 2 + i, handCount: 5, connected: true, afk: false, fields: [{ type: DEMO_KINDS[i], n: 3 + i }, { type: null, n: 0 }], tray: [] }));
    return { players, turn: 0 };
  }

  demoState() {
    const d = this.demo;
    return {
      code: 'DEMO',
      phase: 'playing',
      players: d.players,
      you: { id: d.players[0].id },
      turn: { pid: d.players[d.turn % d.players.length].id, phase: 'plant', faceUp: [] },
      deckCount: 64,
      deckOuts: 0,
      passes: 2,
      endPending: false,
    };
  }

  // every so often someone plants a star, or cashes a nursery in
  stepDemo() {
    const d = this.demo;
    d.turn += 1;
    const p = d.players[Math.floor(Math.random() * d.players.length)];
    const fi = Math.floor(Math.random() * p.fields.length);
    const f = p.fields[fi];
    if (f.type && f.n >= 4 && Math.random() < 0.45) {
      const k = payout(f.type, f.n);
      const color = star(f.type)?.color || '#ffd36b';
      const pos = this.table.posOf(p.id, 'pad', fi);
      this.fx.shockwave(pos, new THREE.Color(color), 3.4, 0, 0.7);
      this.fx.burst(pos, new THREE.Color(color), 20, 3, 0, 0.8, 0.2);
      for (let i = 0; i < Math.max(1, k); i++) this.table.fly(pos, this.table.posOf(p.id, 'coins'), { coin: true, dur: 0.8, delay: i * 0.12, arc: 1.8 });
      p.coins += k;
      f.type = null;
      f.n = 0;
    } else {
      const kind = f.type && f.n < 9 ? f.type : DEMO_KINDS[Math.floor(Math.random() * DEMO_KINDS.length)];
      if (f.type && f.type !== kind) {
        f.n = 0;
      }
      f.type = kind;
      f.n += 1;
      this.fx.flash(this.table.posOf(p.id, 'pad', fi), new THREE.Color(star(kind)?.glow || '#fff'), 2.4, 0.3);
    }
    this.table.sync(this.demoState());
  }

  // ---------------------------------------------------------------------------
  // The game
  // ---------------------------------------------------------------------------
  sync(state) {
    if (this.mode !== 'game') {
      this.mode = 'game';
      this.shot = null;
      this.stage.fly(GAME_VIEW(), 1.6);
      this.stage.drift = 1;
      this.stage.spin = 0;
    }
    this.table.sync(state);
  }

  update(dt) {
    if (this.mode === 'showcase') {
      this.demoClock += dt;
      if (this.demoClock > 1.5) {
        this.demoClock = 0;
        this.stepDemo();
      }
    }
    this.shiftView(dt);
  }

  // On the title screen the menu is on the left (or along the bottom on a phone): slide the picture over to the
  // empty side. In a game the table moves up a little, clear of the hand along the bottom.
  shiftView(dt) {
    const wide = innerWidth > 820;
    const home = this.mode === 'showcase' && this.shot === 'home' && this.titleMenu;
    const game = this.mode === 'game';
    const k = 1 - Math.exp(-dt * 3);
    this.shiftX += ((home && wide ? 0.22 : game && wide && this.trading ? -0.1 : 0) - this.shiftX) * k;
    this.shiftY += ((home && !wide ? 0.16 : game ? (wide ? 0.13 : 0.1) : 0) - this.shiftY) * k;
    const cam = this.stage.camera;
    if (Math.abs(this.shiftX) + Math.abs(this.shiftY) > 0.001) {
      const w = innerWidth;
      const h = innerHeight;
      cam.setViewOffset(w, h, -this.shiftX * w, this.shiftY * h, w, h);
    } else if (cam.view?.enabled) cam.clearViewOffset();
  }

  // a close look at a player (a harvest, the winner)
  look(pid, { radius = 17, hold = 2.2, phi = 1.05 } = {}) {
    const at = this.table.posOf(pid, 'center');
    const home = GAME_VIEW();
    this.stage.fly({ target: at.clone().multiplyScalar(0.6).setY(0), radius, theta: Math.atan2(at.x, at.z) * 0.25, phi }, 1.0);
    clearTimeout(this.lookTimer);
    this.lookTimer = setTimeout(() => this.mode === 'game' && this.stage.fly(home, 1.4), hold * 1000);
  }

  overview() {
    this.stage.fly(GAME_VIEW(), 1.4);
  }
}

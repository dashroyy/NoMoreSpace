// Star Bonanza: the 3D world, kept in step with the game. It owns the stage (renderer and camera), the cartoon sky,
// the effects and the space farm. On the title screen and in the lobby the farm plays a little demo game by itself
// (star buddies planted, patches harvested, coins piling up) while the camera slowly circles, so the menus are never
// a still picture.
import * as THREE from 'three';
import { Stage } from './scene/stage.js';
import { CartoonSky } from './scene/sky.js';
import { ToonFx } from './scene/toonfx.js';
import { SpaceFarm } from './scene/farm.js';
import { payout } from './net.js';

// the farm as you play: the whole ring of islands, nudged up so your hand and patches at the bottom do not hide it
const GAME_VIEW = () => (innerWidth > 820 ? { target: new THREE.Vector3(0, 0, 1.6), radius: 36, theta: 0, phi: 0.7 } : { target: new THREE.Vector3(0, 0, 4), radius: 50, theta: 0, phi: 0.9 });
// the title screen and the lobby: circling slowly round the farm, a little lower
const HOME_VIEW = () => (innerWidth > 820 ? { target: new THREE.Vector3(0, 1.5, 0), radius: 43, theta: 0, phi: 1.02 } : { target: new THREE.Vector3(0, 1, 2), radius: 52, theta: 0, phi: 0.95 });
// the opening shot behind the start screen: far out in space, looking down at the little farm
const TITLE_SHOT = { target: new THREE.Vector3(0, 6, 0), radius: 110, theta: -0.6, phi: 0.75 };

const DEMO_NAMES = [['Moo', '🐮'], ['Zip', '👽'], ['Penny', '🐷'], ['Clucky', '🐔'], ['Hops', '🐸']];
const DEMO_KINDS = ['orange-dwarf', 'yellow-dwarf', 'white-dwarf', 'blue-giant', 'red-giant', 'neutron-star', 'pulsar', 'quasar'];

export class World {
  constructor() {
    this.stage = new Stage(document.getElementById('stage'), document.getElementById('labels'));
    this.sky = new CartoonSky(this.stage);
    this.fx = new ToonFx(this.stage);
    this.farm = new SpaceFarm(this.stage);
    this.farm.fx = this.fx;
    this.table = this.farm; // (what the effects and the screens call it)
    this.mode = null;
    this.demo = null;
    this.demoClock = 0;
    this.ready = Promise.resolve();
    this.shiftY = 0;
    this.shiftX = 0;
    this.trading = false; // the trading post is open on the right: the farm slides left to make room
    this.handFrom = null; // where the star you just planted came from on the screen (a card in your hand)
    this.stage.onFrame((dt) => this.update(dt));
    this.stage.fly(HOME_VIEW(), 0.01);
  }

  // ---------------------------------------------------------------------------
  // Title screen and lobby: the farm plays a demo game
  // ---------------------------------------------------------------------------
  showcase(view = 'home') {
    if (this.mode !== 'showcase') {
      this.mode = 'showcase';
      this.demo = this.makeDemo();
      this.farm.sync(this.demoState());
      this.farm.clearHighlights();
    }
    if (view !== this.shot) {
      this.shot = view;
      this.stage.fly({ ...HOME_VIEW(), theta: this.stage.rig.theta }, 1.8);
      this.stage.spin = 0.035;
      this.stage.drift = 1;
    }
  }

  titleShot() {
    this.stage.fly(TITLE_SHOT, 0.01);
    this.stage.spin = 0.05;
    this.stage.drift = 0.5;
  }

  // on "Press any key": a swoop down to the farm
  swoopIn() {
    this.stage.spin = 0;
    this.stage.drift = 1;
    this.stage.fly({ ...HOME_VIEW(), theta: this.stage.rig.theta + 1.2 }, 3, { exact: true });
    setTimeout(() => this.mode === 'showcase' && (this.stage.spin = 0.035), 3000);
  }

  makeDemo() {
    const players = DEMO_NAMES.slice(0, 4).map(([name, avatar], i) => ({ id: `d${i}`, name, avatar, coins: 2 + i * 2, handCount: 5, connected: true, afk: false, fields: [{ type: DEMO_KINDS[i], n: 2 + i }, { type: DEMO_KINDS[i + 4], n: 1 + (i % 2) }], tray: [] }));
    return { players, turn: 0 };
  }

  demoState() {
    const d = this.demo;
    return { code: 'DEMO', phase: 'playing', players: d.players, you: { id: '' }, turn: { pid: d.players[d.turn % d.players.length].id, phase: 'plant', faceUp: [] }, deckCount: 88, deckOuts: 0, passes: 2, endPending: false };
  }

  // every so often someone plants a star, or harvests a patch
  stepDemo() {
    const d = this.demo;
    d.turn += 1;
    const p = d.players[d.turn % d.players.length];
    const fi = Math.floor(Math.random() * p.fields.length);
    const f = p.fields[fi];
    const at = this.farm.posOf(p.id, 'pad', fi);
    if (f.type && f.n >= 4 && Math.random() < 0.5) {
      const k = Math.max(1, payout(f.type, f.n));
      this.fx.sparkles(at, 10, '#fff1a8', 1.6);
      for (let i = 0; i < k; i++) this.farm.fly(at, this.farm.posOf(p.id, 'coins'), { coin: true, dur: 0.8, delay: 0.3 + i * 0.14, arc: 2.6 });
      p.coins += k;
      f.type = null;
      f.n = 0;
      this.farm.sync(this.demoState());
      return;
    }
    const kind = f.type && f.n < 8 ? f.type : DEMO_KINDS[Math.floor(Math.random() * DEMO_KINDS.length)];
    if (f.type && f.type !== kind) f.n = 0;
    f.type = kind;
    f.n += 1;
    this.farm.fly(this.farm.deckPos(), at, { id: kind, dur: 0.8, arc: 3, scale: 0.5 });
    setTimeout(() => this.fx.puff(at, '#c08a5c', 5, 0.35), 800);
    this.farm.sync(this.demoState());
    this.farm.delayLast(p.id, fi, 0.8);
  }

  // ---------------------------------------------------------------------------
  // The game
  // ---------------------------------------------------------------------------
  sync(state) {
    if (this.mode !== 'game') {
      this.mode = 'game';
      this.shot = null;
      this.stage.spin = 0;
      this.stage.fly(GAME_VIEW(), 1.8);
      this.stage.drift = 1;
    }
    this.farm.sync(state);
  }

  update(dt) {
    if (this.mode === 'showcase') {
      this.demoClock += dt;
      if (this.demoClock > 1.4) {
        this.demoClock = 0;
        this.stepDemo();
      }
    }
    this.shiftView(dt);
  }

  // In a game the farm moves up a little, clear of the hand along the bottom, and left when the trading post opens
  shiftView(dt) {
    const wide = innerWidth > 820;
    const game = this.mode === 'game';
    const k = 1 - Math.exp(-dt * 3);
    this.shiftX += ((game && wide && this.trading ? -0.12 : 0) - this.shiftX) * k;
    this.shiftY += ((game ? (wide ? 0.12 : 0.1) : 0) - this.shiftY) * k;
    const cam = this.stage.camera;
    if (Math.abs(this.shiftX) + Math.abs(this.shiftY) > 0.001) {
      const w = innerWidth;
      const h = innerHeight;
      cam.setViewOffset(w, h, -this.shiftX * w, this.shiftY * h, w, h);
    } else if (cam.view?.enabled) cam.clearViewOffset();
  }

  // a close look at a player's island (a big harvest, the winner)
  look(pid, { radius = 20, hold = 2.2, phi = 0.95 } = {}) {
    const at = this.farm.posOf(pid, 'center');
    const home = GAME_VIEW();
    this.stage.fly({ target: at.clone().multiplyScalar(0.7).setY(0.5), radius, theta: Math.atan2(at.x, at.z) * 0.3, phi }, 1.0);
    clearTimeout(this.lookTimer);
    this.lookTimer = setTimeout(() => this.mode === 'game' && this.stage.fly(home, 1.4), hold * 1000);
  }

  overview() {
    this.stage.fly(GAME_VIEW(), 1.4);
  }
}

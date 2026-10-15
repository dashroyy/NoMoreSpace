// Ruler of the Galaxy: the 3D world, kept in step with the game. It owns the stage (renderer and camera), the
// universe, the arena, the effects and one flagship per contender, and moves them about as the state changes.
// On the title and lobby screens it runs a showcase: all six contenders on the Rim, the camera circling slowly.
import * as THREE from 'three';
import { el } from '../util.js';
import { Stage } from './scene/stage.js';
import { Universe } from './scene/galaxy.js';
import { Arena, rimPosition, CORE_DOCK, PULSAR_DOCK } from './scene/arena.js';
import { Effects } from './scene/effects.js';
import { Flagship, preloadShips } from './scene/ships.js';
import { entrance, introTime, INTRO } from './scene/moves.js';
import { store, contender } from './net.js';
import { faceSvg } from './faces.js';
import { sfx } from './sound.js';

// the whole table, seen from high enough that the dice console does not hide the ships at the front
const OVERVIEW = { target: new THREE.Vector3(0, -0.5, 4.5), radius: 37, theta: 0, phi: 0.86 };
// the title screen: the galaxy shifted right, clear of the menu on the left (on a phone the menu is at the bottom)
const homeView = () => (innerWidth > 820 ? { target: new THREE.Vector3(-10, 0.5, 1), radius: 36, theta: 0.15, phi: 0.95 } : { target: new THREE.Vector3(0, -4, 2), radius: 40, theta: 0, phi: 0.8 });
// the lobby: the whole ring in the middle, between the squad on the left and the rules on the right
const lobbyView = () => (innerWidth > 820 ? { target: new THREE.Vector3(0, -1.5, 1), radius: 38, theta: 0.12, phi: 0.92 } : { target: new THREE.Vector3(0, -6, 2), radius: 42, theta: 0, phi: 0.8 });
// the opening shot behind the start screen: far out over both galaxies
const TITLE_SHOT = { target: new THREE.Vector3(0, -60, 0), radius: 250, theta: -0.7, phi: 0.5 };

export class World {
  constructor() {
    this.stage = new Stage(document.getElementById('stage'), document.getElementById('labels'));
    this.universe = new Universe(this.stage);
    this.arena = new Arena(this.stage);
    this.fx = new Effects(this.stage);
    this.ships = new Map(); // key -> { ship, label, pid, contender, where }
    this.mode = null;
    this.opening = false; // a game has just started: the flagships are about to arrive
    this.introRun = null; // the opening in progress: { timers, off }
    this.onIntroEnd = null; // set by fx.js: the banner that follows the opening
    this.focusUntil = 0;
    this.trailClock = 0;
    this.ready = preloadShips(); // resolves when the contenders' 3D models are in (the loading screen waits for it)
    this.stage.onFrame((dt) => this.update(dt));
    this.stage.fly(OVERVIEW, 0.01);
  }

  // ---------------------------------------------------------------------------
  // The showcase: every contender on show (title screen and lobby)
  // ---------------------------------------------------------------------------
  // selected: the contender to light up; focus: one to fly the camera to (the contender select screen);
  // view: 'home' (the galaxy to the right of the menu) or 'lobby' (the ring in the middle)
  showcase(selected = null, taken = {}, { focus = null, view = 'home' } = {}) {
    const first = this.mode !== 'showcase';
    if (first) {
      this.clearShips();
      this.mode = 'showcase';
      const list = store.data.contenders;
      list.forEach((c, i) => {
        const ship = new Flagship(this.stage, c.id, c.color);
        ship.place(rimPosition(i, list.length));
        const label = this.makeLabel(c.color);
        const handle = this.stage.addLabel(ship.anchor, label, 0.5);
        this.ships.set(c.id, { ship, label, handle, contender: c.id, pid: null, where: 'rim' });
      });
      this.arena.setPulsar(false);
      this.arena.setCoreHeld(false);
      this.arena.setMood(null);
    }
    for (const [id, rec] of this.ships) {
      const c = contender(id);
      rec.ship.setActive(id === selected);
      rec.label.classList.toggle('picked', id === selected);
      rec.label.querySelector('.tag-name').textContent = taken[id] ? `${c.name.split(' ')[0]} · ${taken[id]}` : c.name;
      rec.label.querySelector('.tag-stats').textContent = c.title;
    }
    // the camera swings round to the contender in focus, or pulls back to the whole ring
    const shot = focus ? `focus:${focus}` : `view:${view}`;
    if (shot !== this.shot) {
      this.shot = shot;
      this.stage.spin = 0;
      if (focus) {
        const i = store.data.contenders.findIndex((c) => c.id === focus);
        const p = rimPosition(i, store.data.contenders.length);
        const theta = Math.atan2(p.x, p.z);
        // on a wide screen, aim a little to the ship's right so it stands left of the info panel
        const side = innerWidth > 1000 ? 2.2 : 0;
        const target = p.clone().setY(innerWidth > 820 ? 1.2 : -3.2).add(new THREE.Vector3(Math.cos(theta), 0, -Math.sin(theta)).multiplyScalar(side));
        this.stage.fly({ target, radius: innerWidth > 820 ? 14.5 : 17, theta, phi: 1.2 }, first ? 1.2 : 1.4);
        this.stage.drift = 0.3;
      } else {
        this.stage.fly(view === 'lobby' ? lobbyView() : homeView(), first ? 1.2 : 1.6);
        this.stage.drift = 1;
      }
    }
  }

  // the start screen: a slow turn far out over the galaxies...
  titleShot() {
    this.stage.fly(TITLE_SHOT, 0.01);
    this.stage.spin = 0.035;
    this.stage.drift = 0.4;
  }

  // ...and, on Press Start, the dive down to the contenders
  swoopIn() {
    this.stage.spin = 0;
    this.stage.drift = 1;
    this.stage.fly(homeView(), 3.4);
  }

  // ---------------------------------------------------------------------------
  // The game
  // ---------------------------------------------------------------------------
  sync(state) {
    if (this.mode !== 'game') {
      this.clearShips();
      this.mode = 'game';
      this.shot = null;
      this.stage.drift = 1;
      // a brand new game (no orbit has begun) opens with the flagships arriving one after another
      this.opening = state.round === 0 && !state.turn && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!this.opening) this.stage.fly(OVERVIEW, 1.4);
    }
    const n = state.players.length;
    const keep = new Set();
    state.players.forEach((p, i) => {
      const key = p.id;
      keep.add(key);
      let rec = this.ships.get(key);
      const c = contender(p.contender);
      if (!rec || rec.contender !== p.contender) {
        if (rec) this.dropShip(key);
        const ship = new Flagship(this.stage, p.contender, c?.color || '#8fb2ff');
        const label = this.makeLabel(c?.color || '#8fb2ff');
        const handle = this.stage.addLabel(ship.anchor, label, 0.5);
        rec = { ship, label, handle, contender: p.contender, pid: p.id, where: null, seat: i, wasAlive: p.alive, arrived: !this.opening };
        if (this.opening) {
          ship.root.visible = false; // hidden until its entrance
          handle.visible = false;
        }
        this.ships.set(key, rec);
      }
      rec.seat = i;
      const goal = this.spotFor(p, i, n);
      if (rec.where === null) rec.ship.place(goal);
      else if (!rec.goal.equals(goal)) {
        if (rec.where !== p.where) sfx('warp');
        rec.ship.flyTo(goal, p.where === 'rim' ? 1.1 : 1.5, p.where === 'rim' ? 3 : 5);
      }
      rec.goal = goal;
      rec.where = p.where;
      // a ship that has just been destroyed stays as it was for a moment, so its explosion can play first (fx.js)
      rec.ship.setGhost(!p.alive, rec.wasAlive && !p.alive ? 2.4 : 0);
      rec.wasAlive = p.alive;
      rec.ship.setActive(state.turn?.pid === p.id && p.alive);
      // ships inside face the Rim (and the camera); ships outside face the middle
      rec.ship.facing = p.where !== 'rim' ? rec.ship.root.position.clone().add(new THREE.Vector3(0, 0, 10)) : null;
      this.fillLabel(rec.label, p, state);
    });
    for (const key of [...this.ships.keys()]) if (!keep.has(key)) this.dropShip(key);
    if (this.opening) this.beginIntro(state);
    this.arena.setPulsar(state.pulsarOpen);
    this.arena.setCoreHeld(!!state.core);
    this.arena.setMood(state.anomaly);
  }

  spotFor(p, i, n) {
    if (p.where === 'core') return CORE_DOCK.clone().setY(CORE_DOCK.y - 0.9);
    if (p.where === 'pulsar') return PULSAR_DOCK.clone().setY(PULSAR_DOCK.y - 0.9);
    return rimPosition(i, n);
  }

  makeLabel(color) {
    return el('div', { className: 'ship-tag', style: { '--c': color } }, el('div', { className: 'tag-name' }), el('div', { className: 'tag-stats' }));
  }

  fillLabel(label, p, state) {
    const name = label.querySelector('.tag-name');
    const stats = label.querySelector('.tag-stats');
    const sig = `${p.name}|${p.hull}|${p.maxHull}|${p.stars}|${p.alive}|${p.where}|${state.turn?.pid === p.id}`;
    if (label.dataset.sig === sig) return;
    label.dataset.sig = sig;
    name.textContent = `${p.avatar} ${p.name}`;
    label.classList.toggle('ghost', !p.alive);
    label.classList.toggle('turn', state.turn?.pid === p.id);
    label.classList.toggle('inside', p.where !== 'rim');
    if (!p.alive) {
      stats.textContent = 'GHOST SHIP';
      return;
    }
    const before = Number(label.dataset.hull ?? p.hull);
    label.dataset.hull = p.hull;
    const pips = Array.from({ length: p.maxHull }, (_, k) => `<i class="${k < p.hull ? 'on' : k < before ? 'lost' : ''}"></i>`).join('');
    stats.innerHTML = `<span class="hull-pips ${p.hull <= 3 ? 'low' : ''}">${pips}</span><b class="tag-star">${faceSvg('star', '0.95em')} ${p.stars}</b>`;
  }

  dropShip(key) {
    const rec = this.ships.get(key);
    if (!rec) return;
    rec.handle.remove();
    rec.ship.dispose();
    this.ships.delete(key);
  }

  clearShips() {
    this.cancelIntro();
    for (const key of [...this.ships.keys()]) this.dropShip(key);
  }

  shipOf(pid) {
    return this.ships.get(pid)?.ship || null;
  }

  // ---------------------------------------------------------------------------
  // The opening: the camera sweeps down over the ring while the flagships arrive one after another, each in its own
  // style (scene/moves.js). The server waits the same time before the first turn. A click or a key skips ahead.
  // ---------------------------------------------------------------------------
  beginIntro(state) {
    this.opening = false;
    const ids = state.players.map((p) => p.id);
    const total = introTime(ids.length);
    const run = { timers: [], off: null, hint: el('div', { className: 'intro-skip' }, 'Click or press any key to skip') };
    this.introRun = run;
    document.body.classList.add('intro');
    document.body.append(run.hint);
    sfx('intro');
    // start high and far away, then sweep round to the usual view
    const r = this.stage.rig;
    r.target.copy(OVERVIEW.target);
    r.radius = 62;
    r.theta = -2.7;
    r.phi = 0.5;
    this.stage.tween = null;
    this.stage.fly(OVERVIEW, total, { exact: true });
    ids.forEach((id, i) => run.timers.push(setTimeout(() => this.arrive(id), (INTRO.lead + INTRO.step * i) * 1000)));
    run.timers.push(setTimeout(() => this.endIntro(), total * 1000));
    const skip = () => this.endIntro(true);
    run.timers.push(setTimeout(() => {
      window.addEventListener('pointerdown', skip, { once: true });
      window.addEventListener('keydown', skip, { once: true });
      run.off = () => {
        window.removeEventListener('pointerdown', skip);
        window.removeEventListener('keydown', skip);
      };
    }, 400));
  }

  // one flagship makes its entrance
  arrive(id) {
    const rec = this.ships.get(id);
    if (!rec || rec.arrived) return;
    rec.arrived = true;
    rec.handle.visible = true;
    rec.label.classList.add('arrive');
    entrance(this.fx, rec.ship);
  }

  // skipped: anyone who has not arrived appears at once
  endIntro(skipped = false) {
    const run = this.introRun;
    if (!run) return;
    this.cancelIntro();
    for (const rec of this.ships.values()) {
      if (rec.arrived) continue;
      rec.arrived = true;
      rec.ship.root.visible = true;
      rec.handle.visible = true;
    }
    if (skipped) this.stage.fly(OVERVIEW, 0.9);
    this.onIntroEnd?.();
  }

  cancelIntro() {
    const run = this.introRun;
    this.opening = false;
    if (!run) return;
    this.introRun = null;
    run.timers.forEach(clearTimeout);
    run.off?.();
    run.hint.remove();
    document.body.classList.remove('intro');
  }

  // the winner: the camera closes in and circles slowly round the new ruler
  coronation(ship) {
    const p = ship.root.position;
    this.stage.fly({ target: p.clone().setY(p.y + 1.6), radius: 12, theta: this.stage.rig.theta, phi: 1.15 }, 1.2);
    setTimeout(() => this.stage.orbitBy(Math.PI * 1.6, 8, { radius: 10, phi: 1.2 }), 1250);
    this.focusUntil = performance.now() + 11000;
    ship.setActive(true);
  }

  // ---------------------------------------------------------------------------
  // Camera moments
  // ---------------------------------------------------------------------------
  look(points, { radius = null, hold = 2.2, phi = 1.05 } = {}) {
    if (!points.length) return;
    const c = new THREE.Vector3();
    for (const p of points) c.add(p);
    c.divideScalar(points.length);
    let spread = 0;
    for (const p of points) spread = Math.max(spread, p.distanceTo(c));
    const theta = Math.atan2(c.x, c.z + 0.001) * 0.5;
    this.stage.fly({ target: c.clone().setY(c.y + 1.2), radius: radius ?? Math.max(13, spread * 2.4 + 9), theta, phi }, 1.1);
    this.focusUntil = performance.now() + hold * 1000;
  }

  overview() {
    this.stage.fly(OVERVIEW, 1.4);
  }

  update(dt) {
    // ships in flight leave a streak of light
    this.trailClock += dt;
    if (this.trailClock > 0.03) {
      this.trailClock = 0;
      for (const { ship } of this.ships.values()) if (ship.move) this.fx.trail(ship.centre(), ship.color);
    }
    // after a close-up, drift back to the whole table
    if (this.mode === 'game' && this.focusUntil && performance.now() > this.focusUntil) {
      this.focusUntil = 0;
      this.overview();
    }
  }
}

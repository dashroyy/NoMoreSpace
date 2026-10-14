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
import { store, contender } from './net.js';
import { faceSvg } from './faces.js';
import { sfx } from './sound.js';

// the whole table, seen from high enough that the dice console does not hide the ships at the front
const OVERVIEW = { target: new THREE.Vector3(0, -0.5, 4.5), radius: 37, theta: 0, phi: 0.86 };
// the title screen: the galaxy shifted right, clear of the panel on the left (on a phone the panel is at the bottom)
const homeView = () => (innerWidth > 820 ? { target: new THREE.Vector3(-10, 0.5, 1), radius: 36, theta: 0.15, phi: 0.95 } : { target: new THREE.Vector3(0, -4, 2), radius: 40, theta: 0, phi: 0.8 });

export class World {
  constructor() {
    this.stage = new Stage(document.getElementById('stage'), document.getElementById('labels'));
    this.universe = new Universe(this.stage);
    this.arena = new Arena(this.stage);
    this.fx = new Effects(this.stage);
    this.ships = new Map(); // key -> { ship, label, pid, contender, where }
    this.mode = null;
    this.focusUntil = 0;
    this.trailClock = 0;
    preloadShips();
    this.stage.onFrame((dt) => this.update(dt));
    this.stage.fly(OVERVIEW, 0.01);
  }

  // ---------------------------------------------------------------------------
  // The showcase: every contender on show (title screen and lobby)
  // ---------------------------------------------------------------------------
  showcase(selected = null, taken = {}) {
    if (this.mode !== 'showcase') {
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
      this.stage.fly(homeView(), 1.2);
    }
    for (const [id, rec] of this.ships) {
      const c = contender(id);
      rec.ship.setActive(id === selected);
      rec.label.classList.toggle('picked', id === selected);
      rec.label.querySelector('.tag-name').textContent = taken[id] ? `${c.name.split(' ')[0]} · ${taken[id]}` : c.name;
      rec.label.querySelector('.tag-stats').textContent = c.title;
    }
    // the camera swings round to whoever you picked
    if (selected && selected !== this.showFocus) {
      this.showFocus = selected;
      const i = store.data.contenders.findIndex((c) => c.id === selected);
      const p = rimPosition(i, store.data.contenders.length);
      const theta = Math.atan2(p.x, p.z);
      this.stage.fly({ target: p.clone().setY(1.6), radius: 11, theta, phi: 1.2 }, 1.6);
      this.stage.drift = 0.3;
    } else if (!selected && this.showFocus !== null) {
      this.showFocus = null;
      this.stage.fly(homeView(), 1.6);
      this.stage.drift = 1;
    }
  }

  // ---------------------------------------------------------------------------
  // The game
  // ---------------------------------------------------------------------------
  sync(state) {
    if (this.mode !== 'game') {
      this.clearShips();
      this.mode = 'game';
      this.showFocus = undefined;
      this.stage.fly(OVERVIEW, 1.4);
      this.stage.drift = 1;
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
        rec = { ship, label, handle, contender: p.contender, pid: p.id, where: null, seat: i };
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
      rec.ship.setGhost(!p.alive);
      rec.ship.setActive(state.turn?.pid === p.id && p.alive);
      // ships inside face the Rim (and the camera); ships outside face the middle
      rec.ship.facing = p.where !== 'rim' ? rec.ship.root.position.clone().add(new THREE.Vector3(0, 0, 10)) : null;
      this.fillLabel(rec.label, p, state);
    });
    for (const key of [...this.ships.keys()]) if (!keep.has(key)) this.dropShip(key);
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
    const pips = Array.from({ length: p.maxHull }, (_, k) => `<i class="${k < p.hull ? 'on' : ''}"></i>`).join('');
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
    for (const key of [...this.ships.keys()]) this.dropShip(key);
  }

  shipOf(pid) {
    return this.ships.get(pid)?.ship || null;
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

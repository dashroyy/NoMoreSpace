// Ruler of the Galaxy: the show. Everything the server writes in the log becomes something you can see and hear:
// lasers crossing the arena, ships exploding, Stars rising, the camera swooping in when someone takes the Core.
// Everyone sees the same thing at the same moment, because it all comes from the shared log.
import * as THREE from 'three';
import { el } from '../util.js';
import { player, colorOf, card, evolution, anomaly } from './net.js';
import { faceSvg } from './faces.js';
import { sfx } from './sound.js';

let world = null;
let seenFor = null;
let lastSeq = 0;

export function initFx(w) {
  world = w;
}

const layer = () => document.getElementById('layer-fx');
const shipOf = (pid) => world?.shipOf(pid);
const later = (ms, fn) => (ms > 0 ? setTimeout(fn, ms) : fn());

export function processLog(state, prev) {
  const top = state.log.length ? state.log[state.log.length - 1].seq : 0;
  if (seenFor !== state.code || !prev || prev.code !== state.code || prev.phase === 'lobby') {
    seenFor = state.code;
    lastSeq = top;
    return;
  }
  let beat = 0;
  for (const e of state.log) {
    if (e.seq <= lastSeq) continue;
    later(beat * 140, () => handle(e, state));
    if (e.k !== 'emote') beat += 1;
  }
  lastSeq = Math.max(lastSeq, top);
}

// ---------------------------------------------------------------------------
// HTML bits over the 3D scene
// ---------------------------------------------------------------------------

// a label that pops up over a ship and drifts away
export function pop(pid, html, tone = '') {
  const ship = shipOf(pid);
  if (!ship) return;
  const at = world.stage.toScreen(ship.anchor.getWorldPosition(new THREE.Vector3()));
  if (at.behind) return;
  const n = el('div', { className: `pop ${tone}` });
  n.innerHTML = html;
  n.style.left = `${at.x}px`;
  n.style.top = `${at.y}px`;
  layer().append(n);
  setTimeout(() => n.remove(), 2100);
}

// a big title across the screen
export function banner(title, sub = '', tone = '') {
  const b = el('div', { className: `banner ${tone}` }, el('div', { className: 'banner-title' }, title), sub ? el('div', { className: 'banner-sub' }, sub) : null);
  layer().append(b);
  setTimeout(() => b.remove(), 2600);
}

const nameOf = (pid) => player(pid)?.name || 'Someone';
const star = (n) => `${faceSvg('star', '1em')}${n > 0 ? '+' : ''}${n}`;

// ---------------------------------------------------------------------------

function laserVolley(from, targets, n, color, { width = 0.15, spread = 0.14 } = {}) {
  const a = shipOf(from);
  if (!a) return;
  const bolts = Math.min(6, Math.max(1, n));
  for (const t of targets) {
    const b = shipOf(t);
    if (!b) continue;
    a.lookAtPoint(b.root.position);
    for (let i = 0; i < bolts; i++) {
      const jitter = new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8);
      world.fx.bolt(a.muzzle(), b.centre().add(jitter), color, i * spread, width);
      later(i * spread * 1000, () => sfx('laser'));
    }
  }
  setTimeout(() => {
    if (a) a.facing = null;
  }, 1600);
}

function handle(e, state) {
  if (!world) return;
  const me = state.you.id;
  const ship = e.pid ? shipOf(e.pid) : null;
  switch (e.k) {
    case 'start':
      sfx('enter');
      banner('Sector Zero', `First to ${state.target} Stars rules the galaxy`, 'gold');
      break;
    case 'turn':
      if (e.pid === me) {
        sfx('turn');
        banner('Your turn', 'Roll the quantum dice', 'cyan');
      }
      break;
    case 'round':
      break;
    case 'roll':
      sfx('dice');
      break;
    case 'stars':
      sfx('star');
      if (ship) world.fx.stars(ship.centre(), e.n);
      pop(e.pid, star(e.n), 'gold');
      break;
    case 'lose-stars':
      pop(e.pid, star(-e.n), 'bad');
      break;
    case 'shards':
      sfx('shard');
      if (ship) world.fx.shards(ship.centre(), e.n);
      pop(e.pid, `${faceSvg('shard', '1em')}+${e.n}`, 'violet');
      break;
    case 'lose-shards':
      pop(e.pid, `${faceSvg('shard', '1em')}−${e.n}`, 'bad');
      break;
    case 'heal':
      sfx('heal');
      if (ship) world.fx.repair(ship.centre(), e.n);
      pop(e.pid, `${faceSvg('hull', '1em')}+${e.n}`, 'green');
      break;
    case 'locked':
      pop(e.pid, '☢️ No repairs inside', 'warn');
      break;
    case 'laser': {
      const color = new THREE.Color(colorOf(player(e.pid)));
      laserVolley(e.pid, e.targets, e.n, color);
      if (e.n >= 3 || e.targets.length >= 2) world.look([shipOf(e.pid)?.root.position, ...e.targets.map((t) => shipOf(t)?.root.position)].filter(Boolean), { hold: 1.8 });
      break;
    }
    case 'volley': {
      const color = new THREE.Color(e.kind === 'acid' ? '#00ff87' : e.kind === 'ejection' ? '#ffb800' : e.kind === 'impactors' ? '#f97316' : colorOf(player(e.pid)));
      if (ship) world.fx.shockwave(ship.centre(), color, 9);
      laserVolley(e.pid, e.targets.filter((t) => t !== e.pid), Math.min(e.n, 3), color, { width: 0.22, spread: 0.08 });
      break;
    }
    case 'damage':
      sfx('hit');
      ship?.hit();
      world.stage.shake(Math.min(1, e.n * 0.18));
      pop(e.pid, `−${e.n} ${faceSvg('hull', '0.9em')}`, 'bad big');
      break;
    case 'block':
    case 'dodge':
      sfx('block');
      ship?.block();
      pop(e.pid, e.k === 'dodge' ? 'Dodged!' : 'Blocked!', 'cyan');
      break;
    case 'destroy':
      sfx('boom');
      if (ship) {
        world.fx.explosion(ship.centre(), new THREE.Color(colorOf(player(e.pid))));
        world.look([ship.root.position], { radius: 14, hold: 2.4 });
      }
      world.stage.shake(1.4);
      banner(`${nameOf(e.pid)} is destroyed`, e.by ? `by ${nameOf(e.by)}` : '', 'red');
      break;
    case 'enter': {
      sfx('enter');
      world.arena.pulse(1.6);
      const dock = e.slot === 'core' ? new THREE.Vector3(0, 4, 0) : new THREE.Vector3(8.6, 2.6, -6.2);
      world.fx.shockwave(dock, e.slot === 'core' ? 0xffb800 : 0x9fe8ff, 7, 0.9);
      world.fx.flash(dock, 0xffd36b, 8, 0.9);
      world.look([dock], { radius: 15, hold: 2.2, phi: 1.1 });
      banner(e.pid === me ? 'You take the Core!' : `${nameOf(e.pid)} takes the ${e.slot === 'core' ? 'Core' : 'Pulsar'}`, e.slot === 'core' ? 'Everyone outside will be shooting at it' : 'The Binary Pulsar: a second throne', 'gold');
      break;
    }
    case 'yield':
      pop(e.pid, '🏳️ Yields!', 'cyan');
      break;
    case 'hold':
      pop(e.pid, '💪 Holds!', 'gold');
      break;
    case 'flung':
      sfx('warp');
      pop(e.pid, '🌀 Flung out!', 'violet');
      break;
    case 'evolving':
      sfx('evolve');
      pop(e.pid, '🧬 Evolving…', 'green');
      break;
    case 'evolve': {
      const ev = evolution(e.id);
      if (ship) world.fx.helix(ship.centre(), new THREE.Color(colorOf(player(e.pid))));
      banner(`🧬 ${ev?.name || 'Evolution'}`, `${nameOf(e.pid)} evolves`, 'green');
      break;
    }
    case 'anomaly': {
      sfx('anomaly');
      const a = anomaly(e.id);
      world.arena.pulse(1);
      world.stage.shake(0.4);
      banner(`${a?.art || '🌀'} ${a?.name || 'Anomaly'}`, a?.text || '', 'violet');
      break;
    }
    case 'buy': {
      sfx('buy');
      const c = card(e.card);
      pop(e.pid, `${c?.art || '🛒'} ${c?.name || ''}`, 'violet');
      if (ship) world.fx.flash(ship.centre(), 0xb537f2, 3);
      break;
    }
    case 'flush':
      sfx('click');
      break;
    case 'steal': {
      const from = shipOf(e.from);
      if (from && ship) world.fx.wisp(from.centre(), ship.centre());
      pop(e.pid, `${faceSvg('shard', '1em')}+${e.n} stolen`, 'violet');
      break;
    }
    case 'ghost':
      sfx('ghost');
      pop(e.pid, `👻 ${e.faces.map((f) => (f === 'haunt' ? '🎯' : f === 'drain' ? '⚡' : '·')).join(' ')}`, 'cyan');
      break;
    case 'haunt':
    case 'drain': {
      const target = shipOf(e.target);
      if (ship && target) world.fx.wisp(ship.centre(), target.centre());
      break;
    }
    case 'thorns':
      pop(e.pid, '🤖 Thorns!', 'cyan');
      if (ship && shipOf(e.target)) world.fx.bolt(ship.muzzle(), shipOf(e.target).centre(), new THREE.Color('#00f0ff'));
      break;
    case 'grapple':
      banner('🦑 Hyperspace Grapple', `${nameOf(e.victim)} is trapped in the Core`, 'violet');
      break;
    case 'collapse-pulsar':
      world.fx.shockwave(new THREE.Vector3(8.6, 0.6, -6.2), 0x9fe8ff, 10);
      world.fx.flash(new THREE.Vector3(8.6, 0.6, -6.2), 0xffffff, 10);
      banner('💫 The Binary Pulsar collapses', 'Only the Core remains', 'cyan');
      break;
    case 'paradox':
    case 'critical':
    case 'slip':
    case 'impactors':
    case 'ejection':
      pop(e.pid, e.text.replace(/^\S+\s/, '').split(/[:!]/)[0], 'gold');
      break;
    case 'extra':
      banner('🔥 Another turn', nameOf(e.pid), 'gold');
      break;
    case 'collapse':
      pop(e.pid, '🕳️ Gravity Collapse', 'violet');
      break;
    case 'summit':
      pop(e.pid, '🕊️ No shots fired', 'cyan');
      break;
    case 'win': {
      sfx('win');
      const w = shipOf(e.pid);
      if (w) {
        world.fx.fireworks(w.root.position, [0xffb800, 0x00f0ff, 0xff2a6d, 0x00ff87, 0xb537f2]);
        world.look([w.root.position], { radius: 12, hold: 9, phi: 1.15 });
      }
      break;
    }
    case 'emote': {
      pop(e.pid, `<span class="emote">${e.emote}</span>`, 'plain');
      break;
    }
    default:
      break;
  }
}


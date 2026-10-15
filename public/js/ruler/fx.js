// Ruler of the Galaxy: the show. Everything the server writes in the log becomes something you can see and hear:
// lasers crossing the arena, ships exploding, Stars rising, the camera swooping in when someone takes the Core.
// Everyone sees the same thing at the same moment, because it all comes from the shared log.
import * as THREE from 'three';
import { el } from '../util.js';
import { store, player, colorOf, card, evolution, anomaly } from './net.js';
import { faceSvg } from './faces.js';
import { sfx } from './sound.js';
import { attack, charge, strikeOf, volleyTime, SHOT } from './scene/moves.js';

let world = null;
let seenFor = null;
let lastSeq = 0;

export function initFx(w) {
  world = w;
  // when the opening is over (or skipped), the game announces itself
  w.onIntroEnd = () => {
    const st = store.state;
    if (!st || st.phase === 'lobby') return;
    sfx('enter');
    banner('Sector Zero', `First to ${st.target} Stars rules the galaxy`, 'gold');
  };
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

// A volley: the weapon gathers power, then each shot flies in the contender's own style (scene/moves.js). The server waits
// as long as it takes (strike in data.js) before the damage arrives.
function laserVolley(from, targets, n, color, { volley = false } = {}) {
  const a = shipOf(from);
  if (!a) return;
  const style = a.id;
  const gap = strikeOf(style).gap;
  const goals = targets.map((t) => shipOf(t)).filter(Boolean);
  if (!goals.length) return;
  const shots = Math.min(volley ? 3 : 6, Math.max(1, n));
  const each = Math.min(shots, Math.ceil(12 / goals.length)); // a crowd of targets would be too much to draw
  a.lookAtPoint(goals[0].root.position);
  const wind = charge(world.fx, a);
  later(wind * 1000, () => {
    for (const b of goals) {
      for (let i = 0; i < each; i++) {
        const aim = b.centre().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8));
        attack(world.fx, style, a.muzzle(), aim, i, color, i * gap);
      }
    }
    for (let i = 0; i < each; i++) later(i * gap * 1000, () => sfx(SHOT[style] || 'laser'));
  });
  setTimeout(() => {
    a.facing = null;
  }, (volleyTime(style, shots) + 0.8) * 1000);
}

// the screen edges flash red when it is your own ship that is hit
function hurtVignette(power) {
  const v = el('div', { className: 'hurt-vignette', style: { '--p': String(Math.min(1, 0.45 + power * 0.15)) } });
  layer().append(v);
  setTimeout(() => v.remove(), 800);
}

// the hit ship's plate in the list on the left shakes and flashes
function flashPlate(pid) {
  const plate = document.querySelector('.plate[data-pid="' + pid + '"]');
  if (!plate) return;
  plate.classList.remove('hit');
  void plate.offsetWidth;
  plate.classList.add('hit');
}

// A ship is destroyed: the camera closes in, time slows, the ship shakes itself apart... and then it blows up
function destroySequence(e, ship) {
  const color = new THREE.Color(colorOf(player(e.pid)));
  sfx('alarm');
  if (ship) {
    ship.startDying(0.5);
    world.look([ship.root.position], { radius: 13, hold: 3.6 });
    world.stage.slowmo(0.5, 0.9);
    world.stage.punch(0.8);
  }
  later(ship ? 850 : 0, () => {
    sfx('boom');
    if (ship) {
      const c = ship.centre();
      world.fx.explosion(c, color);
      world.fx.shockwave(c, 0xffffff, 15, 0, 1.1);
      world.fx.chunks(c, color, 22, 8, 0.36, 2.2);
      world.fx.smoke(c, 14, 0x333344, 2.4, 2.4);
      ship.becomeGhost();
    }
    world.stage.shake(1.5);
    world.stage.punch(1.2);
    banner(`${nameOf(e.pid)} is destroyed`, e.by ? `by ${nameOf(e.by)}` : '', 'red');
  });
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
      if (e.n >= 3 || e.targets.length >= 2) world.look([shipOf(e.pid)?.root.position, ...e.targets.map((t) => shipOf(t)?.root.position)].filter(Boolean), { hold: volleyTime(shipOf(e.pid)?.id, e.n) + 1.4 });
      break;
    }
    case 'volley': {
      const color = new THREE.Color(e.kind === 'acid' ? '#00ff87' : e.kind === 'ejection' ? '#ffb800' : e.kind === 'impactors' ? '#f97316' : colorOf(player(e.pid)));
      if (ship) world.fx.shockwave(ship.centre(), color, 9);
      laserVolley(e.pid, e.targets.filter((t) => t !== e.pid), e.n, color, { volley: true });
      break;
    }
    case 'damage': {
      sfx('hit');
      const by = e.by ? shipOf(e.by) : null;
      ship?.hit(e.n, by ? by.root.position : null); // knocked back, away from whoever fired
      if (by?.id === 'chronos') ship?.stutter(0.6); // time skips
      if (ship) world.fx.burst(ship.centre(), 0xff4466, 10 + e.n * 4, 4.5, 0, 0.7, 0.2);
      world.stage.shake(Math.min(1, e.n * 0.18));
      world.stage.punch(Math.min(1, 0.25 + e.n * 0.12));
      if (e.pid === me) hurtVignette(e.n);
      flashPlate(e.pid);
      pop(e.pid, `−${e.n} ${faceSvg('hull', '0.9em')}`, 'bad big');
      break;
    }
    case 'block':
    case 'dodge':
      sfx('block');
      ship?.block();
      pop(e.pid, e.k === 'dodge' ? 'Dodged!' : 'Blocked!', 'cyan');
      break;
    case 'destroy':
      destroySequence(e, ship);
      break;
    case 'enter': {
      sfx('enter');
      world.arena.pulse(1.6);
      const dock = e.slot === 'core' ? new THREE.Vector3(0, 4, 0) : new THREE.Vector3(8.6, 2.6, -6.2);
      world.fx.shockwave(dock, e.slot === 'core' ? 0xffb800 : 0x9fe8ff, 7, 0.9);
      world.fx.flash(dock, 0xffd36b, 8, 0.9);
      // a column of light comes down onto the throne, and rings spread out from it
      world.fx.beam(dock.clone().add(new THREE.Vector3(0, 30, 0)), dock, 0xffd36b, { life: 1.1, width: 0.45, pulse: 0 });
      for (let k = 0; k < 3; k++) world.fx.ringFacing(dock, new THREE.Vector3(0, 1, 0), 0xffd36b, 1, 10, 0.9, 0.15 + k * 0.18);
      world.stage.punch(0.7);
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
      if (e.k === 'slip' && ship) {
        ship.stutter(0.7); // time skips
        world.fx.clockFlash(ship.centre(), ship.color);
      }
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
        world.coronation(w);
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


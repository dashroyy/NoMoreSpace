// Star Charters: what happens on screen when something happens in the game. Every new line in the game's log turns
// into sounds, a score popping up over the map in the winner's colour, confetti and a beam of light when a station
// is sealed, a little ship racing down a finished lane, a banner when the wormholes open, and, at the end, the
// unfinished features counted up one after another.
import { el } from './ui.js';
import * as THREE from 'three';
import { toast } from '../util.js';
import { store, colourOf, player } from './net.js';
import { sfx } from './sound.js';
import { TILE, TOP } from './scene/look.js';

let lastSeq = 0;
let wired = false;

// a short message over the middle of the screen
export function banner(text, sub = '', tone = '') {
  const b = el('div', { className: `banner ${tone}` }, text, sub ? el('small', {}, sub) : null);
  document.getElementById('layer-fx').append(b);
  setTimeout(() => b.remove(), 2500);
}

// a pop of text over a point on the map
function popAt(world, pos, text, { colour = null, cls = '' } = {}) {
  const p = el('div', { className: `pop ${cls}`, style: colour ? { '--c': colour } : {} }, text);
  const label = world.stage.addLabel(pos, p, 0.8);
  setTimeout(() => label.remove(), 2300);
}

const centreOf = (tiles) => {
  const v = new THREE.Vector3();
  for (const [x, y] of tiles) v.add(new THREE.Vector3(x * TILE, TOP + 0.3, y * TILE));
  return v.multiplyScalar(1 / Math.max(1, tiles.length));
};

// the sounds for things the 3D map does by itself (tiles landing, probes landing and blasting off)
function wire(world) {
  if (wired) return;
  wired = true;
  world.board.on.land = (tile) => {
    sfx('place');
    if (tile) world.fx.ring(world.board.centre(tile.x, tile.y).setY(0.21));
  };
  world.board.on.probe = () => sfx('probe');
  world.board.on.landed = () => sfx('land');
  world.board.on.liftoff = () => sfx('recall');
}

export function processLog(world, state, prev, { fresh = false } = {}) {
  wire(world);
  const log = state.log || [];
  const top = log.length ? log[log.length - 1].seq : 0;
  if (fresh || top < lastSeq) {
    lastSeq = top; // (joining part way through: no replaying everything that went before)
    return;
  }
  const lines = log.filter((l) => l.seq > lastSeq);
  lastSeq = top;
  if (!lines.length) return;
  const busy = lines.length > 6;
  let finals = 0;
  for (const l of lines) {
    try {
      handle(world, state, l, { busy, finalIndex: l.k === 'final' ? finals++ : 0, lines });
    } catch (err) {
      console.error(err);
    }
  }
}

function handle(world, state, l, { busy, finalIndex, lines }) {
  const me = state.you.id;
  const who = (pid) => (pid === me ? 'You' : player(pid)?.name || 'Someone');
  switch (l.k) {
    case 'turn':
      if (l.pid === me) {
        sfx('yourturn');
        banner('Your turn!', 'Pick a glowing square for your tile', 'orange');
      } else sfx('turn');
      break;
    case 'extra':
      sfx('boost');
      banner('Warp boost!', `${who(l.pid)} ${l.pid === me ? 'go' : 'goes'} again`, 'violet');
      break;
    case 'place':
      if (l.pid !== me) world.lookAt(l.x, l.y);
      break;
    case 'deploy': {
      // a probe that scored the moment it landed never shows up on the map: fly one in and straight home
      const scored = lines.some((s) => s.k === 'score' && s.units?.some((u) => u.x === l.x && u.y === l.y && u.seg === l.seg && u.pid === l.pid));
      const tile = state.board?.tiles.find((t) => t.x === l.x && t.y === l.y);
      if (scored && tile) world.board.flyby(tile.t, tile.r, l.x, l.y, l.seg, l.pid, l.dread);
      if (l.assist) popAt(world, world.board.centre(l.x, l.y).setY(TOP + 0.6), '🕳️ Slingshot!', { cls: 'small dark' });
      break;
    }
    case 'recall':
      popAt(world, world.board.centre(l.x, l.y).setY(TOP + 0.6), '🔥 Home!', { cls: 'small dark' });
      break;
    case 'link':
      setTimeout(() => {
        sfx('link');
        banner('🌀 Wormholes open!', 'Whatever runs into one is joined to the other', 'violet');
        for (const [x, y] of [l.a, l.b]) world.fx.beam(world.board.centre(x, y).setY(TOP), l.t === 'gate' ? '#c27bff' : '#4fe3f5', 6);
      }, 500);
      break;
    case 'score': {
      const colour = l.pids.length ? colourOf(l.pids[0]) : '#1d2340';
      const at = centreOf(l.tiles);
      setTimeout(() => {
        if (l.pts) popAt(world, at, `+${l.pts}${l.pids.length > 1 ? ' each' : ''}`, { colour });
        if (l.fk === 'S') {
          sfx(l.pts >= 10 ? 'seal' : 'score');
          if (!busy) world.fx.confetti(at.clone().setY(TOP + 0.5));
          world.fx.beam(at.clone().setY(TOP), '#ffd36b', 7);
          if (l.pts >= 12) world.stage.shake(0.5);
        } else if (l.fk === 'L') {
          sfx('lane');
          const pts = l.tiles.map(([x, y]) => new THREE.Vector3(x * TILE, TOP, y * TILE));
          world.fx.zip(orderPath(pts));
        } else {
          sfx('array');
          world.fx.beam(at.clone().setY(TOP), l.fk === 'H' ? '#ff9a6a' : '#7fe8ff', 10);
          world.fx.sparks(at.clone().setY(TOP + 0.6), l.fk === 'H' ? '#ffb15a' : '#7fe8ff');
        }
        const text = l.pids.length ? `${l.pids.map(who).join(' & ')} ${l.pids.length > 1 || l.pids[0] === me ? 'score' : 'scores'} ${l.pts} for ${l.fk === 'S' ? 'a sealed station' : l.fk === 'L' ? 'a warp lane' : l.fk === 'H' ? 'the black hole' : 'an array'}!` : '';
        if (text) toast(text, l.pids.includes(me) ? 'good' : 'info', 3500);
      }, 650);
      break;
    }
    case 'anomaly': {
      const a = store.data.anomalies[l.kind];
      setTimeout(() => {
        sfx('anomaly');
        popAt(world, world.board.centre(l.x, l.y).setY(TOP + 0.9), `${a.icon} ${a.text}`, { colour: colourOf(l.pid), cls: 'small' });
        world.fx.sparks(world.board.centre(l.x, l.y).setY(TOP + 0.8), '#ffe08a', 20);
      }, 450);
      break;
    }
    case 'skip':
      sfx('skip');
      toast(l.text, 'info', 3500);
      break;
    case 'afk':
      toast(l.text, 'info', 4000);
      break;
    case 'last':
      sfx('last');
      banner('Last sector charted!', 'Now for the unfinished business…', 'teal');
      break;
    case 'final': {
      const colour = l.pids.length ? colourOf(l.pids[0]) : '#1d2340';
      const at = centreOf(l.tiles);
      setTimeout(() => {
        sfx(l.fk === 'V' ? 'score' : 'count');
        if (l.pts) popAt(world, at, `${l.fk === 'V' ? '✨' : ''}+${l.pts}`, { colour, cls: l.pts < 4 ? 'small' : '' });
        if (l.fk === 'V') world.fx.sparks(at.clone().setY(TOP + 0.4), '#9fd8ff', 14);
        world.lookAt(Math.round(at.x / TILE), Math.round(at.z / TILE), 0.5);
      }, 2400 + Math.min(finalIndex, 14) * 650);
      break;
    }
    case 'win':
      setTimeout(
        () => {
          sfx('win');
          const lead = state.board?.tiles.length ? centreOf(state.board.tiles.map((t) => [t.x, t.y])) : new THREE.Vector3();
          world.fx.confetti(lead.setY(TOP + 1), undefined, 80);
          banner(l.pid === me ? 'You win! 🎉' : `${who(l.pid)} wins!`, '', 'orange');
          world.frame(1.2, { force: true });
        },
        2400 + Math.min(lines.filter((x) => x.k === 'final').length, 14) * 650 + 300,
      );
      break;
    case 'emote': {
      const chip = [...document.querySelectorAll('.cap')][state.players.findIndex((p) => p.id === l.pid)];
      if (chip) {
        const r = chip.getBoundingClientRect();
        const e = el('div', { className: 'pop small dark', style: { position: 'fixed', left: `${r.right - 20}px`, top: `${r.top}px` } }, l.emote);
        document.getElementById('layer-fx').append(e);
        setTimeout(() => e.remove(), 2200);
      }
      break;
    }
    default:
  }
}

// a rough path through a lane's tiles: start at one end, always step to the nearest tile not yet visited
function orderPath(points) {
  if (points.length < 3) return points;
  let start = 0;
  let far = -1;
  const c = points.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / points.length);
  points.forEach((p, i) => {
    const d = p.distanceTo(c);
    if (d > far) {
      far = d;
      start = i;
    }
  });
  const left = points.slice();
  const out = [left.splice(start, 1)[0]];
  while (left.length) {
    const last = out[out.length - 1];
    let bi = 0;
    let bd = Infinity;
    left.forEach((p, i) => {
      const d = p.distanceTo(last);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    out.push(left.splice(bi, 1)[0]);
  }
  return out;
}

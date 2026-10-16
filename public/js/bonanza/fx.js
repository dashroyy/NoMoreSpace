// Star Bonanza: the show. Everything the server writes in the log becomes something you can see and hear: stars
// flying into nurseries, a harvest collapsing into gold lumens, trades swapping across the table, the deck
// shuffling, fireworks for the winner. Everyone sees the same thing at the same moment, because it all comes from
// the shared log.
import * as THREE from 'three';
import { el } from '../util.js';
import { store, player, star } from './net.js';
import { sfx } from './sound.js';
import { starArt } from './art.js';

let world = null;
let seenFor = null;
let lastSeq = 0;
let announced = ''; // the game start that has already been announced (a re-draw of the same state must not do it twice)
let lastFaceUp = []; // the stars that were turned over at the last look (they go to the tray when the trading ends)

export function initFx(w) {
  world = w;
}

const layer = () => document.getElementById('layer-fx');
const later = (ms, fn) => (ms > 0 ? setTimeout(fn, ms) : fn());
const nameOf = (pid) => player(pid)?.name || 'Someone';
const colorOf = (id) => new THREE.Color(star(id)?.glow || star(id)?.color || '#ffffff');
const GOLD = new THREE.Color('#ffd36b');

export function processLog(state, prev) {
  const top = state.log.length ? state.log[state.log.length - 1].seq : 0;
  if (seenFor !== state.code || !prev || prev.code !== state.code || prev.phase === 'lobby') {
    seenFor = state.code;
    lastSeq = top;
    // a new game has just started: announce it
    if (prev && prev.code === state.code && prev.phase === 'lobby' && state.phase === 'playing' && announced !== `${state.code}|${top}`) {
      announced = `${state.code}|${top}`;
      sfx('start');
      banner('Let\'s grow some stars!', `${state.players.length} players · ${state.setIds.length} kinds of star · ${state.deckCount} in the deck`, 'gold');
    }
    return;
  }
  if (prev?.turn?.phase === 'trade') lastFaceUp = prev.turn.faceUp;
  const fresh = state.log.filter((e) => e.seq > lastSeq);
  // a crowd of events at once (the last harvest of the game, or a tab that was asleep): the show gets lighter, or it would
  // pile up into one white blaze
  const crowd = fresh.filter((e) => e.k !== 'emote').length;
  let beat = 0;
  for (const e of fresh) {
    later(beat * (crowd > 4 ? 180 : 130), () => handle(e, state, crowd > 4));
    if (e.k !== 'emote') beat += 1;
  }
  lastSeq = Math.max(lastSeq, top);
}

// ---------------------------------------------------------------------------
// HTML bits over the 3D scene
// ---------------------------------------------------------------------------

// a label that pops up at a point in the 3D scene and drifts away
export function popAt(point, html, tone = '') {
  if (!world || !point) return;
  const at = world.stage.toScreen(point);
  if (at.behind) return;
  const n = el('div', { className: `pop ${tone}` });
  n.innerHTML = html;
  n.style.left = `${at.x}px`;
  n.style.top = `${at.y}px`;
  layer().append(n);
  setTimeout(() => n.remove(), 2100);
}
export function pop(pid, html, tone = '', where = 'tag') {
  popAt(world?.table.posOf(pid, where, 0).add(new THREE.Vector3(0, 0.6, 0)), html, tone);
}

// a big title across the screen
export function banner(title, sub = '', tone = '') {
  const b = el('div', { className: `banner ${tone}` }, el('div', { className: 'banner-title' }, title), sub ? el('div', { className: 'banner-sub' }, sub) : null);
  layer().append(b);
  setTimeout(() => b.remove(), 2600);
}

// a star picture flies across the screen (from a card in your hand to the nursery it is planted in)
export function ghost(fromRect, toPoint, id, { dur = 650, size = 70 } = {}) {
  if (!fromRect || !world) return;
  const to = world.stage.toScreen(toPoint);
  if (to.behind) return;
  const img = el('img', { className: 'ghost-star', src: starArt(id, 128), alt: '', width: size, height: size });
  const fx = fromRect.left + fromRect.width / 2 - size / 2;
  const fy = fromRect.top + fromRect.height / 2 - size / 2;
  img.style.left = `${fx}px`;
  img.style.top = `${fy}px`;
  layer().append(img);
  const dx = to.x - size / 2 - fx;
  const dy = to.y - size / 2 - fy;
  const anim = img.animate(
    [
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 80}px) scale(1.25) rotate(120deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.45) rotate(300deg)`, opacity: 0.9 },
    ],
    { duration: dur, easing: 'cubic-bezier(.3,.1,.3,1)' },
  );
  anim.onfinish = () => img.remove();
  setTimeout(() => img.remove(), dur + 200);
}

// the harvest has screen space of its own: a ring of lumen counts rising from the nursery
function lumenPop(pid, field, lumens) {
  const at = world.table.posOf(pid, 'pad', field).add(new THREE.Vector3(0, 0.9, 0));
  popAt(at, lumens ? `+${lumens} ✦` : '🔥 burned out', lumens ? 'gold big' : 'bad');
}

// ---------------------------------------------------------------------------

function handle(e, state, light = false) {
  if (!world) return;
  const me = state.you.id;
  const t = world.table;
  const mine = e.pid === me;
  switch (e.k) {
    case 'turn':
      if (mine) {
        sfx('yourturn');
        banner('Your turn', 'Plant the first star in your hand', 'cyan');
      } else sfx('turn');
      break;

    case 'plant': {
      sfx('plant');
      const to = t.posOf(e.pid, 'pad', e.field);
      const col = colorOf(e.t);
      // the star arrives (a card from your hand if it is yours), the nursery lights up
      let delay = 0.55;
      if (mine && world.handFrom && Date.now() - world.handFrom.at < 2500) {
        ghost(world.handFrom.rect, to, e.t, { dur: 600 });
        world.handFrom = null;
      } else t.fly(t.posOf(e.pid, 'tray'), to.clone(), { id: e.t, dur: 0.55, arc: 2.2, scale: 0.9 });
      t.delayLast(e.pid, e.field, delay);
      later(delay * 1000, () => {
        world.fx.flash(to, col, 2.2, 0);
        if (!light) world.fx.burst(to, col, 12, 2.6, 0, 0.6, 0.16);
        if (e.n >= 3 && !light) world.fx.ringFacing(to.clone().setY(0.15), new THREE.Vector3(0, 1, 0), col, 0.5, 2.2, 0.6, 0);
      });
      break;
    }

    case 'harvest': {
      const at = t.posOf(e.pid, 'pad', e.field);
      const col = colorOf(e.t);
      const k = e.lumens;
      sfx(k >= 3 ? 'bigharvest' : 'harvest');
      if (!light) world.fx.converge(at, col, { count: 16 + e.n * 3, radius: 2.6, life: 0.5, size: 0.18 });
      later(light ? 0 : 480, () => {
        world.fx.flash(at, GOLD, 2.2 + k * 0.5, 0);
        if (!light) world.fx.shockwave(at.clone().setY(0.15), col, 3 + k * 0.9, 0, 0.8);
        world.fx.burst(at, k ? GOLD : new THREE.Color('#ff6a4d'), light ? 8 : 10 + k * 5, 3, 0, 0.8, 0.16);
        lumenPop(e.pid, e.field, k);
        if (k) {
          // the lumens fly to the owner's stack of gold
          const dest = t.posOf(e.pid, 'coins');
          t.delayCoins(e.pid, k, 0.9);
          for (let i = 0; i < k; i++) {
            t.fly(at, dest, { coin: true, dur: 0.8, delay: i * 0.14, arc: 2.4 });
            if (!light) later(900 + i * 140, () => sfx('lumen'));
          }
        } else if (!light) world.fx.smoke(at, 8, 0x553322, 1.6, 1.2);
        if (k >= 4 && !light) {
          world.stage.punch(0.5);
          world.stage.shake(0.4);
        }
      });
      if (k >= 4 && !light) world.look(e.pid, { radius: 19, hold: 2.4 });
      break;
    }

    case 'reveal': {
      sfx('reveal');
      const from = t.deckPos();
      (e.cards || []).forEach((id, i) => {
        const to = t.faceUpPos(i, e.cards.length);
        t.fly(from, to, { id, dur: 0.8, arc: 2.2, scale: 1.4, delay: i * 0.18 });
        later(800 + i * 180, () => {
          world.fx.flash(to, colorOf(id), 3.4, 0);
          world.fx.burst(to, colorOf(id), 12, 2.4, 0, 0.6, 0.16);
        });
      });
      world.fx.shockwave(from.clone().setY(0.2), 0x9b6bff, 5, 0, 0.7);
      pop(e.pid, '👀 Turns over…', 'violet');
      break;
    }

    case 'offer':
      if (e.pid !== me) sfx('offer');
      pop(e.pid, '📣 Offer!', 'cyan');
      break;

    case 'trade': {
      const a = t.posOf(e.from, 'center');
      const b = t.posOf(e.to, 'center');
      sfx(!e.gave.length || !e.got.length ? 'gift' : 'trade');
      // what one side gave flies to the other's tray, and back
      e.gave.forEach((id, i) => t.fly(a, t.posOf(e.to, 'tray'), { id, dur: 0.9, arc: 3, scale: 1, delay: i * 0.12 }));
      e.got.forEach((id, i) => t.fly(b, t.posOf(e.from, 'tray'), { id, dur: 0.9, arc: 3.4, scale: 1, delay: 0.08 + i * 0.12 }));
      const mid = a.clone().lerp(b, 0.5);
      world.fx.flash(mid, new THREE.Color('#9fe8ff'), 3.4, 0.3);
      world.fx.ringFacing(mid.clone().setY(0.3), new THREE.Vector3(0, 1, 0), new THREE.Color('#9fe8ff'), 0.5, 3, 0.7, 0.2);
      pop(e.from, e.got.length && e.gave.length ? '🔁 Trade!' : '🎁 Gift!', 'green');
      break;
    }

    case 'tray': {
      // what was turned over (and not traded) goes to whoever's turn it is, to be planted
      sfx('flip');
      const cards = lastFaceUp;
      lastFaceUp = [];
      cards.forEach((c, i) => t.fly(t.faceUpPos(i, cards.length), t.posOf(e.pid, 'tray'), { id: c.t, dur: 0.8, arc: 2.4, scale: 1.1, delay: i * 0.12 }));
      break;
    }

    case 'draw':
      sfx('draw');
      if (!light) for (let i = 0; i < Math.min(3, e.n || 0); i++) world.fx.streak(t.deckPos(), t.posOf(e.pid, 'tag'), new THREE.Color('#9b7bff'), 0.5, 0.08, i * 0.16);
      break;

    case 'field': {
      sfx('field');
      const count = player(e.pid)?.fields.length || 3;
      const at = t.posOf(e.pid, 'pad', count - 1);
      world.fx.shockwave(at.clone().setY(0.15), GOLD, 5, 0, 0.8);
      world.fx.flash(at, GOLD, 4, 0);
      pop(e.pid, '🌱 Third nursery!', 'gold');
      break;
    }

    case 'reshuffle': {
      sfx('reshuffle');
      const at = t.deckPos();
      world.fx.shockwave(at.clone().setY(0.2), new THREE.Color('#b99bff'), 12, 0, 1.1);
      world.fx.converge(at, new THREE.Color('#b99bff'), { count: 50, radius: 5, life: 0.8, size: 0.24 });
      world.stage.punch(0.5);
      banner('Shuffle!', `The deck is back: ${e.n} of ${state.passes}`, 'violet');
      break;
    }

    case 'last':
      sfx('last');
      world.stage.shake(0.5);
      banner('Last turn!', 'The deck has run out for the last time', 'red');
      break;

    case 'afk':
      pop(e.pid, '💤 Robot helping', 'plain');
      break;

    case 'win': {
      sfx('win');
      if (e.pid) {
        const at = t.posOf(e.pid, 'center');
        world.fx.fireworks(at.clone().setY(2), [0xffd36b, 0x4fe8ff, 0xff6a4d, 0xb99bff, 0x7dffa8]);
        later(700, () => world.fx.fireworks(at.clone().add(new THREE.Vector3(2, 3, -1)), [0xffd36b, 0xffffff]));
        world.look(e.pid, { radius: 18, hold: 30 });
        banner(`${nameOf(e.pid)} wins!`, 'Every nursery is harvested', 'gold');
      }
      break;
    }

    case 'emote':
      pop(e.pid, `<span class="emote">${e.emote}</span>`, 'plain');
      break;

    default:
      break;
  }
}

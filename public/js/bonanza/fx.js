// Star Bonanza: the show. Everything the server writes in the log becomes something silly you can see and hear:
// star buddies plopping into the soil, a harvested patch hopping off as coins go KA-CHING, the UFO beaming stars
// down, trades flying across the farm with a SWAP!, and a confetti party for the winner. Everyone sees the same
// thing at the same moment, because it all comes from the shared log.
import * as THREE from 'three';
import { el } from '../util.js';
import { player, star } from './net.js';
import { sfx } from './sound.js';
import { starArt } from './art.js';

let world = null;
let seenFor = null;
let lastSeq = 0;
let announced = ''; // the game start already announced (a re-draw of the same state must not do it twice)
let lastFaceUp = []; // the stars the UFO beamed down, at the last look (they go to the crate when trading ends)

export function initFx(w) {
  world = w;
}

const layer = () => document.getElementById('layer-fx');
const later = (ms, fn) => (ms > 0 ? setTimeout(fn, ms) : fn());
const nameOf = (pid) => player(pid)?.name || 'Someone';
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const SOIL = '#b98055';

export function processLog(state, prev) {
  const top = state.log.length ? state.log[state.log.length - 1].seq : 0;
  if (seenFor !== state.code || !prev || prev.code !== state.code || prev.phase === 'lobby') {
    seenFor = state.code;
    lastSeq = top;
    if (prev && prev.code === state.code && prev.phase === 'lobby' && state.phase === 'playing' && announced !== `${state.code}|${top}`) {
      announced = `${state.code}|${top}`;
      sfx('start');
      banner('Let’s get farming!', `${state.players.length} farmers · ${state.setIds.length} kinds of star buddy · ${state.deckCount} in the UFO`, 'yellow');
    }
    return;
  }
  if (prev?.turn?.phase === 'trade') lastFaceUp = prev.turn.faceUp;
  const fresh = state.log.filter((e) => e.seq > lastSeq);
  // a crowd of events at once (the last harvest of the game, or a tab that was asleep): keep the show light
  const crowd = fresh.filter((e) => e.k !== 'emote').length;
  let beat = 0;
  for (const e of fresh) {
    later(beat * (crowd > 4 ? 170 : 130), () => handle(e, state, crowd > 4));
    if (e.k !== 'emote') beat += 1;
  }
  lastSeq = Math.max(lastSeq, top);
}

// ---------------------------------------------------------------------------
// HTML bits over the 3D scene
// ---------------------------------------------------------------------------

// a comic-book word (or a little speech bubble) that pops up at a point in the 3D scene
export function popAt(point, html, tone = '') {
  if (!world || !point) return;
  const at = world.stage.toScreen(point);
  if (at.behind) return;
  const n = el('div', { className: `pop ${tone}`, style: { '--r': `${(Math.random() - 0.5) * 16}deg` } });
  n.innerHTML = html;
  n.style.left = `${at.x}px`;
  n.style.top = `${at.y}px`;
  layer().append(n);
  setTimeout(() => n.remove(), 1900);
}
export function pop(pid, html, tone = '', where = 'tag') {
  popAt(world?.table.posOf(pid, where, 0).add(new THREE.Vector3(0, 0.8, 0)), html, tone);
}

// a big bouncy title across the screen
export function banner(title, sub = '', tone = '') {
  const b = el('div', { className: `banner ${tone}` }, el('div', { className: 'banner-title' }, title), sub ? el('div', { className: 'banner-sub' }, sub) : null);
  layer().append(b);
  setTimeout(() => b.remove(), 2600);
}

// a card picture flies from your hand into the patch it is planted in
export function ghost(fromRect, toPoint, id, { dur = 650, size = 84 } = {}) {
  if (!fromRect || !world) return;
  const to = world.stage.toScreen(toPoint);
  if (to.behind) return;
  const img = el('img', { className: 'ghost-star', src: starArt(id), alt: '', width: size, height: size });
  const fx = fromRect.left + fromRect.width / 2 - size / 2;
  const fy = fromRect.top + fromRect.height / 2 - size / 2;
  img.style.left = `${fx}px`;
  img.style.top = `${fy}px`;
  layer().append(img);
  const dx = to.x - size / 2 - fx;
  const dy = to.y - size / 2 - fy;
  const anim = img.animate(
    [
      { transform: 'translate(0,0) scale(1) rotate(0deg)' },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 120}px) scale(1.3) rotate(-25deg)`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.5) rotate(15deg)` },
    ],
    { duration: dur, easing: 'cubic-bezier(.3,.1,.3,1)' },
  );
  anim.onfinish = () => img.remove();
  setTimeout(() => img.remove(), dur + 200);
}

const PLANT_WORDS = ['PLOP!', 'BOING!', 'POMF!', 'SPROING!', 'PLONK!'];
const TRADE_LINES = ['SWAP!', 'DEAL!', 'SWOOSH!'];
const OFFER_LINES = ['Psst! Wanna trade?', 'Got a deal for ya!', 'Swapsies?', 'Make me an offer!', 'Trade you!', 'Ooh, pick me!'];
const BURN_LINES = ['fizzle…', 'poof!', 'wah-wah'];

// ---------------------------------------------------------------------------

function handle(e, state, light = false) {
  if (!world) return;
  const me = state.you.id;
  const t = world.table;
  const fx = world.fx;
  const mine = e.pid === me;
  switch (e.k) {
    case 'turn':
      if (mine) {
        sfx('yourturn');
        banner('Your turn!', 'Plant the first star in your hand', 'yellow');
      } else sfx('turn');
      break;

    case 'plant': {
      sfx('plant');
      const to = t.posOf(e.pid, 'pad', e.field);
      const delay = 0.6;
      if (mine && world.handFrom && Date.now() - world.handFrom.at < 2500) {
        ghost(world.handFrom.rect, to, e.t, { dur: 620 });
        world.handFrom = null;
      } else t.fly(t.posOf(e.pid, 'tray'), to.clone(), { id: e.t, dur: 0.6, arc: 2.6, scale: 0.46 });
      t.delayLast(e.pid, e.field, delay);
      later(delay * 1000, () => {
        fx.puff(to.clone().setY(to.y - 0.4), SOIL, light ? 3 : 6, 0.32);
        if (!light) {
          fx.sparkles(to, 4, star(e.t)?.color || '#fff', 0.9);
          popAt(to.clone().setY(to.y + 1.2), pick(PLANT_WORDS), 'comic small');
        }
      });
      break;
    }

    case 'harvest': {
      const at = t.posOf(e.pid, 'pad', e.field);
      const k = e.lumens;
      sfx(k ? (k >= 3 ? 'bigharvest' : 'harvest') : 'fizzle');
      fx.puff(at, k ? '#ffffff' : '#9a8fb8', light ? 3 : 7, 0.5);
      if (k) {
        // the coins fly to the owner's pile
        const dest = t.posOf(e.pid, 'coins');
        t.delayCoins(e.pid, k, 0.95);
        for (let i = 0; i < k; i++) {
          t.fly(at.clone().setY(at.y + 0.6), dest, { coin: true, dur: 0.85, delay: 0.15 + i * 0.13, arc: 3 });
          if (!light) later(1000 + i * 130, () => sfx('coin'));
        }
        popAt(at.clone().setY(at.y + 1.6), `KA-CHING! <b>+${k}</b><i class="coin"></i>`, `comic ${k >= 3 ? 'big' : ''}`);
        if (!light) fx.sparkles(at, 6 + k * 2, '#ffe066', 1.6);
        if (k >= 3 && !light) {
          fx.confetti(at, 24 + k * 6, 0.9);
          world.stage.punch(0.4);
          world.stage.shake(0.3);
        }
      } else popAt(at.clone().setY(at.y + 1.4), pick(BURN_LINES), 'comic sad');
      if (k >= 4 && !light) world.look(e.pid, { radius: 21, hold: 2.4 });
      break;
    }

    case 'reveal': {
      sfx('ufo');
      t.beamPulse();
      const from = t.deckPos();
      (e.cards || []).forEach((id, i) => {
        const to = t.faceUpPos(i, e.cards.length);
        t.fly(from, to, { id, dur: 0.75, arc: 0.6, scale: 0.8, delay: i * 0.15 });
        later(750 + i * 150, () => fx.sparkles(to, 6, star(id)?.color || '#fff', 1.2));
      });
      break;
    }

    case 'offer':
      if (e.pid !== me) sfx('offer');
      pop(e.pid, pick(OFFER_LINES), 'speech');
      break;

    case 'trade': {
      const a = t.posOf(e.from, 'center');
      const b = t.posOf(e.to, 'center');
      const gift = !e.gave.length || !e.got.length;
      sfx(gift ? 'gift' : 'trade');
      e.gave.forEach((id, i) => t.fly(a, t.posOf(e.to, 'tray'), { id, dur: 1, arc: 4, scale: 0.5, delay: i * 0.12 }));
      e.got.forEach((id, i) => t.fly(b, t.posOf(e.from, 'tray'), { id, dur: 1, arc: 4.6, scale: 0.5, delay: 0.08 + i * 0.12 }));
      const mid = a.clone().lerp(b, 0.5).setY(4);
      popAt(mid, gift ? 'AWW, A GIFT!' : pick(TRADE_LINES), 'comic pink');
      if (!light) fx.sparkles(mid, 8, '#ffc2e5', 1.6);
      break;
    }

    case 'tray': {
      // what the UFO beamed down (and nobody traded for) drops into the crate of whoever's turn it is
      sfx('drop');
      const cards = lastFaceUp;
      lastFaceUp = [];
      cards.forEach((c, i) => t.fly(t.faceUpPos(i, cards.length), t.posOf(e.pid, 'tray'), { id: c.t, dur: 0.8, arc: 2.4, scale: 0.5, delay: i * 0.12 }));
      break;
    }

    case 'draw':
      sfx('draw');
      if (!light) for (let i = 0; i < Math.min(3, e.n || 0); i++) t.fly(t.deckPos(), t.posOf(e.pid, 'tag'), { card: true, dur: 0.7, arc: 2, delay: i * 0.14 });
      break;

    case 'field': {
      sfx('sold');
      const at = t.posOf(e.pid, 'pad', 2);
      fx.puff(at, '#ffd23f', 8, 0.6);
      fx.confetti(at, 30, 0.8);
      popAt(at.clone().setY(at.y + 1.6), 'SOLD! New patch!', 'comic');
      break;
    }

    case 'reshuffle':
      sfx('refill');
      t.ufoRefill();
      banner('Refill!', `The UFO zooms off for more stars (trip ${(e.n || 0) + 1} of ${state.passes})`, 'mint');
      break;

    case 'last':
      sfx('last');
      world.stage.shake(0.4);
      banner('Last call!', 'The UFO is empty for good: this turn is the last', 'pink');
      break;

    case 'afk':
      pop(e.pid, '💤 Zzz…', 'speech');
      break;

    case 'win':
      sfx('win');
      if (e.pid) {
        const at = t.posOf(e.pid, 'center').add(new THREE.Vector3(0, 2, 0));
        world.fx.party(at);
        later(900, () => world.fx.party(at.clone().add(new THREE.Vector3(-2, 1, 1))));
        world.look(e.pid, { radius: 20, hold: 30 });
        banner(`${nameOf(e.pid)} wins!`, 'Top farmer of the galaxy', 'yellow');
      }
      break;

    case 'emote':
      pop(e.pid, `<span class="emote">${e.emote}</span>`, 'plain');
      break;

    default:
      break;
  }
}

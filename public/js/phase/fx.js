// Phase to Space: the show. Sounds, explosions, flying cards, pop-ups, confetti and banners, all triggered by what
// the server writes in the ship log (so everyone sees the same thing at the same moment).
//
// The idea is that you can follow the game without reading the log: a card you draw flies from the deck to you,
// a card someone plays flies to the middle of the table, "+2" pops up over whoever gained something, and so on.
import { el } from '../util.js';
import { iconEl, iconName } from '../icons.js';
import { cardEl } from './cards.js';
import { sfx } from './sound.js';

const layer = () => document.getElementById('layer-fx');
let seenFor = null;
let lastSeq = 0;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// where a player's things are on screen
// (yours is your own area at the bottom; careful, the turn indicator at the top is also ".mine" when it is your turn)
export function rivalEl(pid) {
  return document.querySelector(`.rival[data-pid="${pid}"]`) || document.querySelector('.pt-table > .mine') || null;
}
// where a pop-up about a player appears: over a rival's box, or over your crew
const popEl = (pid) => (pid === meId ? document.querySelector('.pt-table > .mine .party') || rivalEl(pid) : rivalEl(pid));
let meId = null;
// where cards go when they reach a player: your hand, or a rival's box
const handOf = (pid) => (pid === meId ? document.querySelector('.hand') || rivalEl(pid) : rivalEl(pid));
const deckEl = () => document.querySelector('.pile.deck');
const discardEl = () => document.querySelector('.pile.discard');

export function processLog(state, prev) {
  meId = state.you.id;
  const top = state.log.length ? state.log[state.log.length - 1].seq : 0;
  // joining (or rejoining) mid-game: do not replay the past
  if (seenFor !== state.code || !prev || prev.code !== state.code) {
    seenFor = state.code;
    lastSeq = top;
    return;
  }
  // several things at once (draw two, then play one): one after another, a beat apart
  let beat = 0;
  for (const e of state.log) {
    if (e.seq <= lastSeq) continue;
    handle(e, state, beat * 170);
    if (e.k !== 'emote') beat += 1;
  }
  lastSeq = Math.max(lastSeq, top);
}

function handle(e, state, delay) {
  const me = state.you.id;
  switch (e.k) {
    case 'start':
      sfx('join');
      break;
    case 'turn':
      if (e.pid === me) {
        banner('YOUR TURN', 'turn');
        sfx('turn');
      } else {
        sfx('tick');
        pulseClass(rivalEl(e.pid), 'turn-start', 900);
      }
      break;
    case 'deal':
      sfx('deal');
      for (const p of state.players) flyBacks(deckEl(), handOf(p.id), 3, delay);
      break;
    case 'draw':
      if (e.pid === me || e.pid == null) sfx('draw');
      for (const pid of e.pid ? [e.pid] : state.players.map((p) => p.id)) {
        flyBacks(deckEl(), handOf(pid), e.n || 1, delay);
        if (e.n) pop(popEl(pid), [iconEl('joker'), `+${e.n}`], 'good', { delay: delay + 350 });
      }
      break;
    case 'play': {
      sfx('play');
      // your own card leaves your hand; a rival's comes out of their box
      const from = e.pid === me ? document.querySelector(`.hand .card[data-id="${e.card}"]`) || handOf(me) : rivalEl(e.pid);
      flyCard(from, document.querySelector('.pt-middle'), { id: e.card, size: 'md', delay, end: 1.5, fade: true });
      break;
    }
    case 'discard':
      flyBacks(handOf(e.pid), discardEl(), Math.min(e.n || 1, 4), delay);
      pop(popEl(e.pid), [iconEl('joker'), `−${e.n || 1}`], 'bad', { delay });
      break;
    case 'flush':
      if (e.pid) {
        flyBacks(handOf(e.pid), discardEl(), 3, delay);
        flyBacks(deckEl(), handOf(e.pid), 3, delay + 450);
        pop(popEl(e.pid), [iconEl('refresh'), 'new hand'], 'info', { delay });
      } else for (const p of state.players) flyBacks(handOf(p.id), discardEl(), 2, delay);
      break;
    case 'jam':
      sfx('jam');
      staticFlash();
      banner('SIGNAL JAM!', 'jam');
      pop(popEl(e.pid), [iconEl('radio'), 'JAM!'], 'warn', { big: true });
      break;
    case 'jam-win':
      pop(popEl(e.pid), [iconEl('radio'), iconEl('check')], 'good', { delay: delay + 200 });
      break;
    case 'jam-lose':
      pop(popEl(e.pid), [iconEl('radio'), iconEl('cross')], 'bad', { delay: delay + 200 });
      break;
    case 'destroy': {
      sfx('destroy');
      // blow up the card itself if it is on the table, else its owner's box
      const card = (e.uid && document.querySelector(`.card[data-uid="${e.uid}"]`)) || (e.pid && rivalEl(e.pid)) || null;
      if (card?.classList.contains('card')) card.classList.add('doomed');
      explode(card || rivalEl(e.pid));
      shake();
      if (e.pid) pop(popEl(e.pid), [iconEl('burst'), iconEl('person')], 'bad', { delay: delay + 150 });
      break;
    }
    case 'steal':
      sfx('steal');
      fly(popEl(e.from), popEl(e.pid), e.card);
      pop(popEl(e.pid), [iconEl('hand'), iconEl('person')], 'good', { delay: delay + 500 });
      pop(popEl(e.from), [iconEl('person'), '−1'], 'bad', { delay });
      break;
    case 'pull':
      sfx('steal');
      if (e.from) flyBacks(handOf(e.from), handOf(e.pid), 1, delay);
      pop(popEl(e.pid), [iconEl('hand'), iconEl('joker')], 'good', { delay: delay + 400 });
      break;
    case 'swap':
      sfx('steal');
      if (e.from) {
        flyBacks(handOf(e.from), handOf(e.pid), 2, delay);
        flyBacks(handOf(e.pid), handOf(e.from), 2, delay + 80);
      }
      if (e.pid) pop(popEl(e.pid), [iconEl('repeat')], 'info', { delay });
      break;
    case 'peek':
      pop(popEl(e.from), [iconEl('eyes')], 'info', { delay });
      break;
    case 'search':
      flyCard(discardEl(), handOf(e.pid), { id: e.card, size: 'sm', delay, end: 0.8, fade: true });
      pop(popEl(e.pid), [iconEl('recycle'), '+1'], 'good', { delay: delay + 500 });
      break;
    case 'shield':
    case 'rebound':
    case 'bounce':
      sfx('shield');
      sparkle(rivalEl(e.pid), '#6cf0ff');
      pop(popEl(e.pid), [iconEl(e.k === 'shield' ? 'shield' : 'back')], 'info', { delay });
      break;
    case 'energy':
      sfx('energy');
      pop(popEl(e.pid), [iconEl('bolt'), `+${e.n || 1}`], 'warn', { delay, big: true });
      sparkle(rivalEl(e.pid), '#ffd24d', 8);
      break;
    case 'buff':
      pop(popEl(e.pid), [iconEl('die'), '+1'], 'good', { delay });
      break;
    case 'effect':
      pop(popEl(e.pid), [iconEl('check'), el('small', {}, 'it works')], 'good', { delay });
      break;
    case 'fizzle':
      if (e.pid) pop(popEl(e.pid), [iconEl('cross'), el('small', {}, 'fizzles')], 'bad', { delay });
      break;
    case 'attack': {
      const beast = document.querySelector(`.beast-row .card[data-id="${e.card}"]`);
      pulseClass(beast, 'doomed', 800);
      pop(beast, [iconEl('sword')], 'warn', { big: true, delay });
      break;
    }
    case 'slay': {
      sfx('slay');
      confetti(46);
      banner('SLAIN!', 'slay');
      // the Beast flies over to join the party of whoever slew it
      const beast = document.querySelector(`.beast-row .card[data-id="${e.card}"]`);
      flyCard(beast, popEl(e.pid), { id: e.card, size: 'md', delay: delay + 250, start: 1.1, mid: 1.6, end: 0.5, dur: 1100 });
      pop(popEl(e.pid), [iconEl('sword'), iconEl('trophy')], 'good', { delay: delay + 1200, big: true });
      break;
    }
    case 'fightback':
      sfx('fight');
      shake();
      banner('IT FIGHTS BACK!', 'fight');
      pop(popEl(e.pid), [iconEl('burst'), el('small', {}, 'ouch')], 'bad', { delay: delay + 300, big: true });
      break;
    case 'shuffle':
      pulseClass(deckEl(), 'bump', 400);
      break;
    case 'win':
      sfx('win');
      confetti(90);
      break;
    case 'emote':
      floatEmote(e);
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------

export function banner(text, kind = '') {
  const b = el('div', { className: `fx-banner ${kind}` }, text);
  layer().append(b);
  setTimeout(() => b.remove(), 1600);
}

export function shake() {
  document.body.classList.remove('shake');
  void document.body.offsetWidth;
  document.body.classList.add('shake');
  setTimeout(() => document.body.classList.remove('shake'), 500);
}

function pulseClass(node, cls, ms) {
  if (!node) return;
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
  setTimeout(() => node.classList.remove(cls), ms);
}

function staticFlash() {
  const s = el('div', { className: 'fx-static' });
  layer().append(s);
  setTimeout(() => s.remove(), 600);
}

const center = (node) => {
  const r = node?.getBoundingClientRect();
  return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : { x: innerWidth / 2, y: innerHeight / 2, w: 120, h: 120 };
};

// a little label that pops up over a player (or a card) and drifts away: "+2 🃏", "💥", "✓ it works"
const stacked = new WeakMap(); // pop-ups on the same player line up instead of piling on top of each other
export function pop(node, parts, tone = 'info', { delay = 0, big = false } = {}) {
  if (!node) return;
  const c = center(node);
  const show = () => {
    const now = performance.now();
    const list = (stacked.get(node) || []).filter((t) => now - t < 900);
    list.push(now);
    stacked.set(node, list);
    const f = el('div', { className: `fx-float ${tone} ${big ? 'big' : ''}`, style: { left: `${c.x}px`, top: `${c.y - Math.min(c.h * 0.15, 30) - (list.length - 1) * 30}px` } }, parts);
    layer().append(f);
    setTimeout(() => f.remove(), 2000);
  };
  if (delay) setTimeout(show, delay);
  else show();
}

// a puff of smoke and fire from the Kenney explosion frames
export function explode(node) {
  const c = center(node);
  const size = Math.max(110, Math.min(240, c.w * 0.9));
  const img = el('img', { className: 'fx-boom', src: '/assets/phase/fx/boom00.png', alt: '', style: { left: `${c.x - size / 2}px`, top: `${c.y - size / 2}px`, width: `${size}px`, height: `${size}px` } });
  layer().append(img);
  let i = 0;
  const t = setInterval(() => {
    i += 1;
    if (i > 8) {
      clearInterval(t);
      img.remove();
      return;
    }
    img.src = `/assets/phase/fx/boom0${i}.png`;
  }, 55);
  sparkle(node, '#ffb347', 10);
}

export function sparkle(node, color = '#ffe14d', count = 12) {
  const c = center(node);
  for (let i = 0; i < count; i++) {
    const s = el('i', { className: 'fx-spark', style: { left: `${c.x}px`, top: `${c.y}px`, '--c': color, '--dx': `${(Math.random() - 0.5) * 220}px`, '--dy': `${(Math.random() - 0.7) * 200}px`, '--r': `${Math.random() * 360}deg`, '--s': `${0.6 + Math.random() * 0.9}` } });
    layer().append(s);
    setTimeout(() => s.remove(), 900);
  }
}

const CONFETTI = ['#ff5a4d', '#4da6ff', '#4dff9a', '#b36bff', '#ff6bd6', '#ffd24d'];
export function confetti(n = 50) {
  for (let i = 0; i < n; i++) {
    const p = el('i', { className: `fx-confetti ${i % 3 === 0 ? 'star' : ''}`, style: { left: `${Math.random() * 100}vw`, '--c': CONFETTI[i % CONFETTI.length], '--dx': `${(Math.random() - 0.5) * 260}px`, '--d': `${1.6 + Math.random() * 1.8}s`, '--delay': `${Math.random() * 0.5}s`, '--r': `${Math.random() * 720}deg` } });
    layer().append(p);
    setTimeout(() => p.remove(), 3800);
  }
}

// ---------------------------------------------------------------------------
// Flying cards
// ---------------------------------------------------------------------------

// One card flies along an arc from one place to another (the places are measured now, the flight can start later,
// after the table has already moved on). id: the face to show, or none for a card back.
// start / mid / end: its size at each end of the flight, relative to a small card.
export function flyCard(from, to, { id = null, size = 'sm', delay = 0, start = 1, mid = 1.35, end = 1, dur = 750, fade = false, spin = -8 } = {}) {
  if (!from || !to || from === to || reduced()) return;
  const a = center(from);
  const b = center(to);
  const go = () => {
    const card = id ? cardEl(id, { size }) : cardEl(null, { size, back: true });
    card.classList.add('fx-fly');
    layer().append(card);
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    card.style.left = `${a.x - w / 2}px`;
    card.style.top = `${a.y - h / 2}px`;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lift = -Math.min(120, 40 + Math.hypot(dx, dy) * 0.18);
    const anim = card.animate(
      [
        { transform: `translate(0, 0) scale(${start}) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + lift}px) scale(${mid}) rotate(${spin}deg)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${end}) rotate(0deg)`, opacity: fade ? 0 : 1 },
      ],
      { duration: dur, easing: 'cubic-bezier(.45,0,.25,1)' },
    );
    anim.onfinish = () => card.remove();
  };
  if (delay) setTimeout(go, delay);
  else go();
}

// a few card backs, one after another (drawing, discarding, passing hands)
function flyBacks(from, to, n = 1, delay = 0) {
  for (let i = 0; i < Math.min(n, 5); i++) flyCard(from, to, { size: 'sm', delay: delay + i * 110, start: 0.8, mid: 1.05, end: 0.7, dur: 620, fade: true, spin: (i % 2 ? 6 : -6) });
}

// a card flies from one player to another (a steal)
export function fly(from, to, cardId) {
  flyCard(from, to, { id: cardId, size: 'sm', mid: 1.5, dur: 850 });
}

// a quick reaction floats up from a player
function floatEmote(e) {
  const name = iconName(e.emote);
  if (!name) return;
  const c = center(rivalEl(e.pid));
  const node = el('div', { className: 'fx-emote', style: { left: `${c.x}px`, top: `${c.y}px` } }, iconEl(name, { className: 'big' }));
  layer().append(node);
  setTimeout(() => node.remove(), 2200);
}

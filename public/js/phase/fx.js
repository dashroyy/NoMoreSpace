// Phase to Space: the show. Sounds, explosions, flying cards, confetti and banners, all triggered by what the
// server writes in the ship log (so everyone sees the same thing at the same moment).
import { el } from '../util.js';
import { iconEl, iconName } from '../icons.js';
import { cardEl } from './cards.js';
import { sfx } from './sound.js';

const layer = () => document.getElementById('layer-fx');
let seenFor = null;
let lastSeq = 0;

// where a player's things are on screen
export function rivalEl(pid) {
  return document.querySelector(`.rival[data-pid="${pid}"]`) || document.querySelector('.mine') || null;
}

export function processLog(state, prev) {
  const top = state.log.length ? state.log[state.log.length - 1].seq : 0;
  // joining (or rejoining) mid-game: do not replay the past
  if (seenFor !== state.code || !prev || prev.code !== state.code) {
    seenFor = state.code;
    lastSeq = top;
    return;
  }
  for (const e of state.log) if (e.seq > lastSeq) handle(e, state);
  lastSeq = Math.max(lastSeq, top);
}

function handle(e, state) {
  const me = state.you.id;
  switch (e.k) {
    case 'start':
      sfx('join');
      break;
    case 'turn':
      if (e.pid === me) {
        banner('YOUR TURN', 'turn');
        sfx('turn');
      } else sfx('tick');
      break;
    case 'deal':
      sfx('deal');
      break;
    case 'draw':
      if (e.pid === me || e.pid == null) sfx('draw');
      break;
    case 'play':
      sfx('play');
      break;
    case 'jam':
      sfx('jam');
      staticFlash();
      banner('SIGNAL JAM!', 'jam');
      break;
    case 'destroy':
      sfx('destroy');
      explode(rivalEl(e.pid));
      shake();
      break;
    case 'steal':
      sfx('steal');
      fly(rivalEl(e.from), rivalEl(e.pid), e.card);
      break;
    case 'pull':
    case 'swap':
      sfx('steal');
      break;
    case 'shield':
    case 'rebound':
    case 'bounce':
      sfx('shield');
      sparkle(rivalEl(e.pid), '#6cf0ff');
      break;
    case 'energy':
      sfx('energy');
      break;
    case 'slay':
      sfx('slay');
      confetti(46);
      banner('SLAIN!', 'slay');
      break;
    case 'fightback':
      sfx('fight');
      shake();
      banner('IT FIGHTS BACK!', 'fight');
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

function staticFlash() {
  const s = el('div', { className: 'fx-static' });
  layer().append(s);
  setTimeout(() => s.remove(), 600);
}

const center = (node) => {
  const r = node?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : { x: innerWidth / 2, y: innerHeight / 2, w: 120, h: 120 };
};

// a puff of smoke and fire from the Kenney explosion frames
export function explode(node) {
  const c = center(node);
  const size = Math.max(110, Math.min(240, c.w * 0.7));
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

// a card flies from one player to another
export function fly(from, to, cardId) {
  if (!from || !to || from === to) return;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const card = cardEl(cardId, { size: 'sm', extra: 'flying' });
  card.style.position = 'fixed';
  card.style.left = `${a.left + a.width / 2 - 34}px`;
  card.style.top = `${a.top + a.height / 2 - 48}px`;
  card.style.zIndex = '80';
  layer().append(card);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const anim = card.animate(
    [
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(1.5) rotate(-8deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(1) rotate(0deg)`, opacity: 0.2 },
    ],
    { duration: 800, easing: 'cubic-bezier(.4,0,.2,1)' },
  );
  anim.onfinish = () => card.remove();
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

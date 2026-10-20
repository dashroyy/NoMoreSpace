// 🎰 The Jackpot's wheel (Cosmic Carnival). At dawn three players are on the wheel and everyone sees them spin.
// Each of the three secretly chooses LIVE or DIE: those who choose DIE die, but if all three choose LIVE, all three do.
import { $, el, clear, problem, formatTime } from '../util.js';
import { store, send, serverNow, player, suitHex } from '../store.js';
import { sfx } from '../audio.js';

let key = null; // which spin is on screen (so it is only built once)
let closed = null; // a watcher closed this spin

export function initJackpot() {
  setInterval(update, 300);
}

function answer(live) {
  send('jackpot', { live }).then(() => sfx(live ? 'chime' : 'doom')).catch((e) => problem(e.message));
}

const FACES = ['🍒', '💀', '⭐', '🔔', '💀', '🍋', '7️⃣', '💀'];

function reel(id) {
  const p = player(id);
  return el('div', { className: 'jp-reel', dataset: { id } },
    el('div', { className: 'jp-window' }, el('div', { className: 'jp-strip' }, ...[...FACES, ...FACES].map((f) => el('span', {}, f)))),
    el('div', { className: 'jp-token', style: { background: p ? suitHex(p) : '#888' } }),
    el('div', { className: 'jp-name' }, p?.name || '?'),
    el('div', { className: 'jp-state' }, '…'),
  );
}

function update() {
  const box = $('jackpot');
  if (!box) return;
  const wheel = store.state?.wheel;
  const mine = store.state?.you?.jackpot;
  const k = wheel ? wheel.ids.join() : null;
  if (!wheel || (closed === k && !(mine && !mine.chosen))) {
    box.hidden = true;
    if (!wheel) key = closed = null;
    return;
  }
  if (key !== k) {
    key = k;
    sfx('reveal');
    const choosing = mine && !mine.chosen;
    clear(box,
      el('div', { className: 'wish-card jp-card' },
        el('h2', { className: 'jp-title' }, '🎰 JACKPOT'),
        el('div', { className: 'jp-reels' }, ...wheel.ids.map(reel)),
        el('p', { className: 'jp-rule' }, '💀 = die · ❤️ = live · ', el('b', {}, 'all ❤️ = all 💀')),
        choosing
          ? el('div', { className: 'jp-buttons', id: 'jp-buttons' },
            el('button', { className: 'big jp-live', onclick: () => answer(true) }, '❤️ LIVE'),
            el('button', { className: 'big jp-die', onclick: () => answer(false) }, '💀 DIE'),
          )
          : el('button', { className: 'jp-close', onclick: () => (closed = k), title: 'Close' }, '✕'),
        el('div', { className: 'hint jp-timer', id: 'jp-timer' }),
      ),
    );
    box.hidden = false;
  }
  // who has chosen so far (not what they chose)
  for (const r of box.querySelectorAll('.jp-reel')) {
    const done = wheel.chosen.includes(r.dataset.id);
    r.classList.toggle('done', done);
    r.querySelector('.jp-state').textContent = done ? '✅' : '🤔';
  }
  if (mine?.chosen) $('jp-buttons')?.replaceWith(el('div', { className: 'jp-wait' }, '✅'));
  const left = wheel.until ? Math.max(0, wheel.until - serverNow()) : null;
  const t = $('jp-timer');
  if (t) t.textContent = left == null ? '' : formatTime(left);
}

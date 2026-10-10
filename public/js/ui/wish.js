// 🥧 The Clown's last pie. When a Clown dies they get one more act: pick a
// living player and throw a pie at them. If the pie lands on an infiltrator,
// the crew loses! (A Clown who dithers throws it at random.)
import { $, el, clear, problem, formatTime } from '../util.js';
import { store, send, serverNow, suitHex } from '../store.js';
import { sfx } from '../audio.js';

let picked = null;
let shownKey = '';

export function initWish() {
  setInterval(update, 400);
}

function update() {
  const box = $('wish');
  const wish = store.state?.you?.wish;
  if (!box) return;
  if (!wish) {
    box.hidden = true;
    picked = null;
    shownKey = '';
    return;
  }
  const state = store.state;
  const options = state.players.filter((p) => p.alive && p.id !== state.you.id);
  const key = JSON.stringify([options.map((p) => p.id), picked]);
  if (key !== shownKey) {
    shownKey = key;
    sfx(box.hidden ? 'chime' : 'click');
    clear(box,
      el('div', { className: 'wish-card' },
        el('div', { className: 'wish-ico' }, '🥧'),
        el('h2', {}, 'You were the Clown!'),
        el('p', {}, 'One last act: throw a pie at someone. ', el('b', {}, 'If the pie lands on an infiltrator, the crew loses.'), ' Pick a player you are sure is good.'),
        el('div', { className: 'wish-list' }, ...options.map((p) => el('button', {
          className: `wish-pick ${picked === p.id ? 'chosen' : ''}`,
          onclick: () => {
            picked = p.id;
            update();
          },
        }, el('span', { className: 'dot', style: { background: suitHex(p) } }), p.name))),
        el('button', {
          className: 'primary big', disabled: !picked,
          onclick: () => {
            const target = picked;
            send('wish', { target }).then(() => sfx('pop')).catch((e) => problem(e.message));
          },
        }, picked ? `🥧 Throw it at ${options.find((p) => p.id === picked)?.name}!` : 'Pick someone first'),
        el('div', { className: 'hint', id: 'wish-timer' }),
      ),
    );
    box.hidden = false;
  }
  const left = wish.until ? Math.max(0, wish.until - serverNow()) : null;
  const t = $('wish-timer');
  if (t) t.textContent = left == null ? '' : `The pie flies at a random player in ${formatTime(left)}…`;
}

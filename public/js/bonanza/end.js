// Star Bonanza: the end. A podium for the top three farmers, everyone's coins, a few silly awards, and another game
// with the same crew.
import { el, problem } from '../util.js';
import { send, star } from './net.js';
import { starArt } from './art.js';
import { btn } from './ui.js';

let shownFor = null;
let box = null;

export function renderEnd(state, { onLeave }) {
  if (state.phase !== 'ended') {
    box?.remove();
    box = null;
    shownFor = null;
    return;
  }
  const key = `${state.code}|${state.winner}`;
  if (shownFor === key) return;
  shownFor = key;
  // let the party play before the scoreboard comes up (unless a rematch starts first)
  setTimeout(() => shownFor === key && show(state, onLeave), 3600);
}

// small, silly awards from what happened (only when somebody actually did it)
function awards(players) {
  const best = (fn) => players.reduce((a, p) => (fn(p) > fn(a) ? p : a), players[0]);
  const out = [];
  const big = best((p) => p.stats.best);
  if (big?.stats.best >= 3) out.push(['💰', 'Jackpot!', `${big.name} harvested ${big.stats.best} coins in one go`]);
  const trader = best((p) => p.stats.trades);
  if (trader?.stats.trades >= 3) out.push(['🤝', 'Wheeler-dealer', `${trader.name} made ${trader.stats.trades} trades`]);
  const giver = best((p) => p.stats.gifts);
  if (giver?.stats.gifts >= 1) out.push(['🎁', 'Big softie', `${giver.name} gave ${giver.stats.gifts} gift${giver.stats.gifts === 1 ? '' : 's'}`]);
  let rare = null;
  for (const p of players)
    for (const [id, n] of Object.entries(p.stats.earned || {})) if (n > 0 && (!rare || star(id).count < star(rare.id).count)) rare = { p, id };
  if (rare) out.push([el('img', { src: starArt(rare.id), alt: '' }), 'Rarest buddy', `${rare.p.name} cashed in a ${star(rare.id).name}`]);
  return out.slice(0, 3);
}

function show(state, onLeave) {
  box?.remove();
  const by = new Map(state.players.map((p) => [p.id, p]));
  const rows = (state.standings || []).map((s) => ({ ...s, p: by.get(s.pid) })).filter((r) => r.p);
  const host = state.hostId === state.you.id;
  const tie = rows.length > 1 && rows[0].coins === rows[1].coins;
  const podium = [rows[1], rows[0], rows[2]].filter(Boolean).map((r) => {
    const place = rows.indexOf(r) + 1;
    return el('div', { className: `step p${place} ${r.pid === state.you.id ? 'me' : ''}` }, el('span', { className: 'st-av' }, r.p.avatar), el('b', { className: 'st-name' }, r.pid === state.you.id ? 'You!' : r.p.name), el('div', { className: 'st-block' }, el('span', { className: 'st-place' }, ['🥇', '🥈', '🥉'][place - 1]), el('span', { className: 'st-coins' }, `${r.coins}`, el('i', { className: 'coin' }))));
  });
  const list = awards(state.players);
  box = el(
    'div',
    { className: 'end-wrap' },
    el(
      'div',
      { className: 'end panel' },
      el('h1', {}, rows[0] ? (rows[0].pid === state.you.id ? 'You win! 🎉' : `${rows[0].p.name} wins!`) : 'Game over'),
      el('p', { className: 'lead' }, rows[0] ? `Top farmer with ${rows[0].coins} coins${tie ? ' (a tie, won on cards in hand)' : ''}.` : ''),
      el('div', { className: 'podium' }, ...podium),
      rows.length > 3 ? el('div', { className: 'end-rest' }, ...rows.slice(3).map((r, i) => el('div', { className: `end-row ${r.pid === state.you.id ? 'me' : ''}` }, el('span', { className: 'rank' }, `${i + 4}`), el('span', { className: 'who' }, `${r.p.avatar} ${r.p.name}`), el('span', { className: 'lum' }, `${r.coins}`, el('i', { className: 'coin' }))))) : null,
      list.length ? el('div', { className: 'awards' }, ...list.map(([ico, title, text]) => el('div', { className: 'award' }, el('span', { className: 'aw-ico' }, ico), el('div', {}, el('b', {}, title), el('small', {}, text))))) : null,
      el('p', { className: 'end-stats' }, `${state.turnCount} turns · ${state.passes === 1 ? 'one trip' : `${state.passes} trips`} of the UFO`),
      el(
        'div',
        { className: 'end-btns' },
        host ? btn('🔁 Play again!', () => send('rematch').catch((e) => problem(e.message)), 'gold big') : el('span', { className: 'muted' }, 'Waiting for the host to start another game…'),
        btn('👀 Look at the farm', () => box.classList.toggle('peek'), 'big sky'),
        btn('🚪 Leave', onLeave, 'big'),
      ),
    ),
  );
  document.getElementById('layer-prompt').after(box);
}

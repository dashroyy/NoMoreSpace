// Star Bonanza: the end. Who has the most lumens, how everyone finished, a few small awards, and another game with
// the same crew.
import { el, problem } from '../util.js';
import { send, star } from './net.js';

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
  // let the fireworks play before the scoreboard comes up (unless a rematch starts first)
  setTimeout(() => shownFor === key && show(state, onLeave), 3800);
}

// small, friendly awards from what happened (only when somebody actually did it)
function awards(players) {
  const best = (fn) => players.reduce((a, p) => (fn(p) > fn(a) ? p : a), players[0]);
  const out = [];
  const big = best((p) => p.stats.best);
  if (big?.stats.best >= 3) out.push(['💥', 'Biggest harvest', `${big.name}: ${big.stats.best} lumens at once`]);
  const trader = best((p) => p.stats.trades);
  if (trader?.stats.trades >= 3) out.push(['🔁', 'Master trader', `${trader.name}: ${trader.stats.trades} trades`]);
  const giver = best((p) => p.stats.gifts);
  if (giver?.stats.gifts >= 1) out.push(['🎁', 'Most generous', `${giver.name}: ${giver.stats.gifts} gift${giver.stats.gifts === 1 ? '' : 's'}`]);
  const rare = players
    .map((p) => {
      let top = null;
      for (const [id, n] of Object.entries(p.stats.earned || {})) if (n > 0 && (!top || star(id)?.count < star(top.id)?.count)) top = { id, n };
      return { p, top };
    })
    .filter((x) => x.top)
    .sort((a, b) => star(a.top.id).count - star(b.top.id).count)[0];
  if (rare) out.push(['✨', 'Rarest catch', `${rare.p.name}: ${star(rare.top.id).name}`]);
  return out.slice(0, 3);
}

function show(state, onLeave) {
  box?.remove();
  const w = state.players.find((p) => p.id === state.winner) || null;
  const host = state.hostId === state.you.id;
  const by = new Map(state.players.map((p) => [p.id, p]));
  const rows = (state.standings || []).map((s) => ({ ...s, p: by.get(s.pid) })).filter((r) => r.p);
  const top = rows[0]?.coins ?? 0;
  const tie = rows.length > 1 && rows[1].coins === top;
  box = el(
    'div',
    { className: 'end-wrap' },
    el(
      'div',
      { className: 'end panel', style: { '--c': '#ffd36b' } },
      el('div', { className: 'eyebrow' }, 'The deck has run dry'),
      el('h1', {}, w ? `${w.avatar} ${w.name}` : 'Nobody'),
      el('p', { className: 'lead' }, w ? `wins with ${top} lumen${top === 1 ? '' : 's'}${tie ? ' (a tie, settled by cards in hand)' : ''}!` : 'The game is over.'),
      el(
        'div',
        { className: 'end-table' },
        ...rows.map((r, i) =>
          el(
            'div',
            { className: `end-row ${r.pid === state.winner ? 'win' : ''} ${r.pid === state.you.id ? 'me' : ''}`, style: { '--i': i } },
            el('span', { className: 'rank' }, i === 0 ? '🏆' : `${i + 1}`),
            el('span', { className: 'who' }, `${r.p.avatar} ${r.p.name}`, el('small', {}, `${r.hand} star${r.hand === 1 ? '' : 's'} left in hand`)),
            el('span', { className: 'stat lum' }, el('b', {}, `${r.coins}`), ' ✦'),
          ),
        ),
      ),
      awards(state.players).length
        ? el(
            'div',
            { className: 'awards' },
            ...awards(state.players).map(([ico, title, text]) => el('div', { className: 'award' }, el('span', { className: 'aw-ico' }, ico), el('div', {}, el('b', {}, title), el('small', {}, text)))),
          )
        : null,
      el('div', { className: 'end-stats' }, el('span', {}, `${state.turnCount} turns`), el('span', {}, `${state.passes === 1 ? 'one' : state.passes} trip${state.passes === 1 ? '' : 's'} through the deck`)),
      el(
        'div',
        { className: 'end-btns' },
        host ? el('button', { className: 'big gold', onclick: () => send('rematch').catch((e) => problem(e.message)) }, '🔁 Play again') : el('span', { className: 'muted' }, 'Waiting for the host to start another game…'),
        el('button', { className: 'big', onclick: () => box.classList.toggle('peek') }, '👁 See the table'),
        el('button', { className: 'big', onclick: onLeave }, 'Leave'),
      ),
    ),
  );
  document.getElementById('layer-prompt').after(box);
}

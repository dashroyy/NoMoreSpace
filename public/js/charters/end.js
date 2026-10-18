// Star Charters: the end. A podium for the top three captains in their colours, everyone's points, a few awards
// for what happened on the map, and another game with the same crew.
import { problem } from '../util.js';
import { send, colourHex } from './net.js';
import { el, btn } from './ui.js';

let shownFor = null;
let box = null;

export function renderEnd(state, { onLeave }) {
  if (state.phase !== 'ended') {
    box?.remove();
    box = null;
    shownFor = null;
    return;
  }
  const key = `${state.code}|${state.winner}|${state.turnCount}`;
  if (shownFor === key) return;
  shownFor = key;
  // the final count plays out on the map first
  const finals = state.log.filter((l) => l.k === 'final').length;
  setTimeout(() => shownFor === key && show(state, onLeave), 2600 + Math.min(finals, 14) * 650);
}

// awards, only for things somebody actually did
function awards(players) {
  const best = (fn) => players.reduce((a, p) => (fn(p) > fn(a) ? p : a), players[0]);
  const out = [];
  const st = best((p) => p.stats.bestStation);
  if (st?.stats.bestStation >= 3) out.push(['🏙️', 'Master builder', `${st.name} sealed a ${st.stats.bestStation}-tile station`]);
  const ln = best((p) => p.stats.bestLane);
  if (ln?.stats.bestLane >= 4) out.push(['🛣️', 'Long hauler', `${ln.name} finished a ${ln.stats.bestLane}-tile warp lane`]);
  const ar = best((p) => p.stats.arrays);
  if (ar?.stats.arrays >= 1) out.push(['📡', 'Calibrator', `${ar.name} completed ${ar.stats.arrays} array${ar.stats.arrays === 1 ? '' : 's'}`]);
  const th = best((p) => p.stats.steals);
  if (th?.stats.steals >= 1) out.push(['🏴‍☠️', 'Space pirate', `${th.name} took over ${th.stats.steals} feature${th.stats.steals === 1 ? '' : 's'}`]);
  const an = best((p) => p.stats.anomalies);
  if (an?.stats.anomalies >= 2) out.push(['💎', 'Treasure hunter', `${an.name} grabbed ${an.stats.anomalies} anomalies`]);
  const vo = best((p) => p.stats.voids);
  if (vo?.stats.voids >= 6) out.push(['✨', 'Void trawler', `${vo.name} fished ${vo.stats.voids} points out of the void`]);
  return out.slice(0, 4);
}

function show(state, onLeave) {
  box?.remove();
  const by = new Map(state.players.map((p) => [p.id, p]));
  const rows = (state.standings || []).map((s) => ({ ...s, p: by.get(s.pid) })).filter((r) => r.p);
  const host = state.hostId === state.you.id;
  const tie = rows.length > 1 && rows[0].score === rows[1].score;
  const podium = [rows[1], rows[0], rows[2]].filter(Boolean).map((r) => {
    const place = rows.indexOf(r) + 1;
    return el('div', { className: `step p${place} ${r.pid === state.you.id ? 'me' : ''}`, style: { '--c': colourHex(r.p.colour) } }, el('span', { className: 'st-av' }, r.p.avatar), el('b', { className: 'st-name' }, r.pid === state.you.id ? 'You!' : r.p.name), el('div', { className: 'st-block' }, el('span', { className: 'st-place' }, ['🥇', '🥈', '🥉'][place - 1]), el('span', { className: 'st-score' }, `${r.score}`)));
  });
  const list = awards(state.players);
  box = el(
    'div',
    { className: 'end-wrap' },
    el(
      'div',
      { className: 'end panel' },
      el('h1', {}, rows[0] ? (rows[0].pid === state.you.id ? 'You win! 🎉' : `${rows[0].p.name} wins!`) : 'Mission over'),
      el('p', { className: 'lead' }, rows[0] ? `Top charter with ${rows[0].score} points${tie ? ' (a tie, won on features finished)' : ''}.` : ''),
      el('div', { className: 'podium' }, ...podium),
      rows.length > 3 ? el('div', { className: 'end-rest' }, ...rows.slice(3).map((r, i) => el('div', { className: `end-row ${r.pid === state.you.id ? 'me' : ''}` }, el('span', { className: 'rank' }, `${i + 4}`), el('span', { className: 'who' }, `${r.p.avatar} ${r.p.name}`), el('span', {}, `${r.score}`)))) : null,
      list.length ? el('div', { className: 'awards' }, ...list.map(([ico, title, text]) => el('div', { className: 'award' }, el('span', { className: 'aw-ico' }, ico), el('div', {}, el('b', {}, title), el('small', {}, text))))) : null,
      el('p', { className: 'end-stats' }, `${state.board?.tiles.length || 0} sectors charted in ${state.turnCount} turns`),
      el(
        'div',
        { className: 'end-btns' },
        host ? btn('🔁 Play again!', () => send('rematch').catch((e) => problem(e.message)), 'gold big') : el('span', { className: 'muted' }, 'Waiting for the host to start another game…'),
        btn('🗺️ Look at the map', () => box.classList.toggle('peek'), 'big sky'),
        btn('🚪 Leave', onLeave, 'big'),
      ),
    ),
  );
  document.getElementById('layer-prompt').after(box);
}

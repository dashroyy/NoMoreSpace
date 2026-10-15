// Ruler of the Galaxy: the end. Who rules the galaxy, how everyone finished, and another round with the same crew.
import { el, problem } from '../util.js';
import { send, contender, colorOf } from './net.js';
import { faceSvg } from './faces.js';

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

function show(state, onLeave) {
  box?.remove();
  const w = state.players.find((p) => p.id === state.winner) || null;
  const c = contender(w?.contender);
  const ranked = [...state.players].sort((a, b) => (b.id === state.winner) - (a.id === state.winner) || b.alive - a.alive || b.stars - a.stars || b.hull - a.hull);
  const host = state.hostId === state.you.id;
  box = el(
    'div',
    { className: 'end-wrap' },
    el(
      'div',
      { className: 'end panel', style: { '--c': c?.color || '#ffb800' } },
      el('div', { className: 'eyebrow' }, w ? (state.winKind === 'stars' ? 'Dominion achieved' : 'Last ship flying') : 'Total annihilation'),
      el('h1', {}, w ? `${w.avatar} ${w.name}` : 'Nobody'),
      el('p', { className: 'lead' }, w ? `${c?.name} rules the galaxy${state.winKind === 'stars' ? ` with ${w.stars} Stars` : ''}.` : 'Every flagship is gone. The galaxy has no ruler.'),
      el(
        'div',
        { className: 'end-table' },
        ...ranked.map((p, i) =>
          el(
            'div',
            { className: `end-row ${p.id === state.winner ? 'win' : ''} ${p.alive ? '' : 'dead'}`, style: { '--c': colorOf(p) } },
            el('span', { className: 'rank' }, `${i + 1}`),
            el('span', { className: 'who' }, `${p.avatar} ${p.name}`, el('small', {}, contender(p.contender)?.name)),
            el('span', { className: 'stat', innerHTML: `${faceSvg('star', '1em')} ${p.stars}` }),
            el('span', { className: 'stat', innerHTML: p.alive ? `${faceSvg('hull', '1em')} ${p.hull}` : '👻' }),
          ),
        ),
      ),
      el(
        'div',
        { className: 'end-stats' },
        el('span', {}, `${state.round} orbits`),
        el('span', {}, `${state.stats.damage} damage dealt`),
        el('span', {}, `${state.stats.entries} times the Core changed hands`),
        el('span', {}, `${state.stats.bought} cards bought`),
      ),
      el(
        'div',
        { className: 'end-btns' },
        host ? el('button', { className: 'big gold', onclick: () => send('rematch').catch((e) => problem(e.message)) }, '🔁 Play again') : el('span', { className: 'muted' }, 'Waiting for the host to start another round…'),
        el('button', { className: 'big', onclick: () => box.classList.toggle('peek') }, '👁 See the galaxy'),
        el('button', { className: 'big', onclick: onLeave }, 'Leave'),
      ),
    ),
  );
  document.getElementById('layer-prompt').after(box);
}

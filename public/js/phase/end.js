// Phase to Space: the end of the game.
import { el, problem } from '../util.js';
import { iconEl } from '../icons.js';
import { store, send, def } from './net.js';
import { classPips, btn } from './bits.js';
import { sfx } from './sound.js';
import { confetti } from './fx.js';
import { openModal, closeModal } from './modal.js';

let shownFor = null;

export function renderEnd(state, { onLeave }) {
  if (state.phase !== 'ended') {
    if (shownFor) {
      shownFor = null;
      closeModal();
    }
    return;
  }
  const key = `${state.code}:${state.winner}:${state.log.length ? state.log[state.log.length - 1].seq : 0}`;
  if (shownFor === key) return;
  shownFor = key;
  const winner = state.players.find((p) => p.id === state.winner);
  const iWon = winner?.id === state.you.id;
  setTimeout(() => {
    sfx(iWon ? 'win' : 'lose');
    if (iWon) confetti(120);
  }, 900);
  const how = state.winKind === 'crew' ? 'assembled a crew with all six disciplines' : 'slayed three Void Beasts';
  const isHost = state.hostId === state.you.id;
  const rows = [...state.players]
    .sort((a, b) => (b.id === state.winner) - (a.id === state.winner) || b.classes.length + b.beasts.length * 2 - (a.classes.length + a.beasts.length * 2))
    .map((p) =>
      el(
        'div',
        { className: `end-row ${p.id === state.winner ? 'win' : ''}` },
        el('span', { className: 'av' }, p.avatar),
        el('b', {}, p.name, p.id === state.winner ? iconEl('trophy') : null),
        classPips(p.classes),
        el('span', { className: 'beasts-won on' }, iconEl('sword'), el('b', {}, `${p.beasts.length}/3`)),
        el('span', { className: 'muted' }, `${p.crew.length} crew`),
      ),
    );
  setTimeout(
    () =>
      openModal(
        el(
          'div',
          { className: 'end' },
          el('div', { className: `end-hero ${iWon ? 'won' : ''}` }, iconEl(iWon ? 'trophy' : 'skull', { className: 'huge' }), el('h2', {}, iWon ? 'VICTORY!' : `${winner?.name || 'Someone'} wins`), el('p', {}, `${winner?.name || 'Someone'} ${how}.`)),
          el('div', { className: 'end-rows' }, rows),
          el(
            'div',
            { className: 'end-btns' },
            isHost ? btn('Play again (same crew)', { className: 'primary big', icon: 'refresh', onClick: () => send('rematch').then(() => closeModal()).catch((e) => problem(e.message)) }) : el('span', { className: 'hint' }, 'Waiting for the host to start another game…'),
            btn('See the table', { className: 'small', onClick: () => closeModal() }),
            btn('Leave', { className: 'small ghost', onClick: onLeave }),
          ),
        ),
        { title: null, closable: true },
      ),
    1500,
  );
  void def;
  void store;
}

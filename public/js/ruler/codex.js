// Ruler of the Galaxy: How to play, and the codex of contenders, cards and anomalies.
import { el } from '../util.js';
import { store } from './net.js';
import { faceIcon, faceSvg } from './faces.js';
import { sfx } from './sound.js';
import { onEscape } from './ui.js';

const modalLayer = () => document.getElementById('layer-modal');

let popEscape = null;

export function openModal(body, { title = '', wide = false } = {}) {
  closeModal();
  sfx('open');
  const box = modalLayer();
  const close = () => closeModal();
  box.replaceChildren(
    el(
      'div',
      { className: 'modal-wrap', onclick: (e) => e.target === e.currentTarget && close() },
      el('div', { className: `modal panel ${wide ? 'wide' : ''}` }, el('div', { className: 'modal-head' }, el('h2', {}, title), el('button', { className: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕')), el('div', { className: 'modal-body' }, body)),
    ),
  );
  box.hidden = false;
  popEscape = onEscape(() => (sfx('back'), closeModal())); // (Escape closes the top-most thing first)
}

export function closeModal() {
  popEscape?.();
  popEscape = null;
  const box = modalLayer();
  box.hidden = true;
  box.replaceChildren();
}

const rule = (icon, title, ...body) => el('div', { className: 'rule' }, el('div', { className: 'rule-ico' }, icon), el('div', {}, el('h3', {}, title), el('p', {}, ...body)));

export function openRules() {
  const d = store.data;
  const faceRow = (f, text) => el('div', { className: 'face-row' }, faceIcon(f, '2em'), el('span', {}, text));
  openModal(
    el(
      'div',
      { className: 'rules' },
      el('p', { className: 'lead' }, 'Giant contenders fight over the Galactic Core at the heart of two colliding galaxies. Hold the Core to broadcast Dominion, while everyone else shoots at you.'),
      rule('👑', 'How to win', 'Be the first to ', el('b', {}, '20 Dominion Stars'), ' (the host can pick 15 or 25), or the ', el('b', {}, 'last ship flying'), '.'),
      rule('🎲', 'Your turn', 'Roll six quantum dice. Tap any you like to keep them, and roll the rest again, up to three rolls in all. Then they count:'),
      el(
        'div',
        { className: 'faces-grid' },
        faceRow('3', 'Three 1s, 2s or 3s score that many Stars (1, 2 or 3). Each extra matching die adds 1.'),
        faceRow('repair', 'Repair 1 Hull each. Not inside the Core! Three of them: an Evolution.'),
        faceRow('laser', 'Lasers: 1 damage each. From outside you hit whoever holds the Core; from inside you hit everyone outside.'),
        faceRow('shard', 'Dark Matter: spend it in the Xenotech Bazaar.'),
      ),
      rule('🌟', 'The Galactic Core', 'An empty Core must be taken: ', el('b', {}, '+1 Star'), ' on the way in, and ', el('b', {}, '+2 Stars'), ' at the start of each turn you begin there. But you cannot repair inside, and everyone outside shoots at you. When you are hit there you may ', el('b', {}, 'yield'), ': you warp out, and whoever hit you takes your seat.'),
      rule('💫', 'The Binary Pulsar', 'With 5 or 6 contenders there is a second seat, the Pulsar, that works just like the Core. It collapses once only four are left.'),
      rule('🛒', 'The Xenotech Bazaar', 'After your dice, spend Dark Matter on the three cards on offer. ', el('b', {}, 'Augments'), ' stay on your ship; ', el('b', {}, 'Directives'), ' happen once. Pay 2 to replace all three cards.'),
      rule('🧬', 'Evolutions', 'Roll three Repairs and your contender evolves: pick one of its three mutations.'),
      rule('🌀', 'Cosmic anomalies', 'Every third round an anomaly shakes up the rules for that round: double damage, cheap cards, no shooting at all…'),
      rule('👻', 'Ghost ships', 'Destroyed? You keep playing as a ghost: two ghost dice a turn to haunt whoever holds the Core, or drain the leader\'s Dark Matter.'),
      el('h3', { className: 'sub-head' }, 'The contenders'),
      el(
        'div',
        { className: 'codex-contenders' },
        ...d.contenders.map((c) =>
          el(
            'div',
            { className: 'codex-c', style: { '--c': c.color } },
            el('div', { className: 'cc-head' }, el('span', { className: 'cc-art' }, c.art), el('div', {}, el('b', {}, c.name), el('small', {}, `${c.title} · ${c.style}`))),
            el('p', { className: 'cc-perk' }, el('b', {}, `${c.perk.name}: `), c.perk.text),
            el('ul', { className: 'cc-evos' }, ...c.evolutions.map((e) => el('li', {}, el('b', {}, `🧬 ${e.name}`), ` (${e.kind === 'keep' ? 'keep' : 'now'}): ${e.text}`))),
          ),
        ),
      ),
      el('h3', { className: 'sub-head' }, 'Anomalies'),
      el('div', { className: 'codex-anomalies' }, ...d.anomalies.map((a) => el('div', { className: 'codex-a' }, el('span', { className: 'cc-art' }, a.art), el('div', {}, el('b', {}, a.name), el('small', {}, a.text))))),
      el('h3', { className: 'sub-head', innerHTML: `The Bazaar: ${d.cards.length} cards` }),
      el('div', { className: 'codex-cards' }, ...d.cards.map((c) => el('div', { className: `codex-card k-${c.kind}` }, el('span', { className: 'cc-art' }, c.art), el('div', {}, el('b', {}, c.name, ' ', el('span', { className: 'cost', innerHTML: `${faceSvg('shard', '0.9em')}${c.cost}` })), el('small', {}, c.text))))),
    ),
    { title: 'How to play', wide: true },
  );
}

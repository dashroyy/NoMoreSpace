// Star Bonanza: How to play, with a picture of every star and what it pays.
import { el } from '../util.js';
import { store } from './net.js';
import { sfx } from './sound.js';
import { onEscape } from './ui.js';
import { starArt } from './art.js';

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

const step = (n, icon, title, ...body) => el('div', { className: 'rule step' }, el('div', { className: 'rule-ico' }, el('b', {}, n), el('span', {}, icon)), el('div', {}, el('h3', {}, title), el('p', {}, ...body)));

// one row of the star table: its picture, how many are in the deck, and how many you need for each lumen
export function starRow(s) {
  return el(
    'div',
    { className: 'star-row', style: { '--c': s.color } },
    el('img', { src: starArt(s.id, 160), alt: '', width: 72, height: 72 }),
    el('div', { className: 'sr-name' }, el('b', {}, s.name), el('small', {}, `${s.count} in the deck`)),
    el(
      'div',
      { className: 'sr-pays' },
      ...s.table.map((need, i) => (need == null ? el('span', { className: 'pay none' }, '–') : el('span', { className: 'pay' }, el('b', {}, `${need}`), el('small', {}, `= ${i + 1}✦`)))),
    ),
  );
}

export function openRules() {
  const d = store.data;
  openModal(
    el(
      'div',
      { className: 'rules' },
      el('p', { className: 'lead' }, 'Grow stars in your nurseries, trade the ones you cannot use, and harvest them into ', el('b', {}, 'lumens'), '. Whoever has the most lumens when the deck runs out wins.'),
      step('1', '🌱', 'Plant', 'You ', el('b', {}, 'must'), ' plant the first star in your hand (hands stay in the order you were dealt, never sorted), and ', el('b', {}, 'may'), ' plant the next one. A nursery grows one kind of star at a time.'),
      step('2', '🔁', 'Turn over and trade', 'Two stars are turned over. You can plant them, or trade them and any star in your hand with the other players. Anyone can make you an offer, and you can give stars away.'),
      step('3', '🪴', 'Plant what you won', 'Every star you got in a trade must be planted right away, so only take what fits. Planting a different kind in a full nursery means harvesting it first.'),
      step('4', '🃏', 'Draw three', 'Draw three stars to the back of your hand. Then the next player goes.'),
      el('h3', { className: 'rules-head' }, 'Harvest any time'),
      el('p', {}, 'Tap a nursery to cash it in, even on someone else\'s turn. The stars you need for each lumen are on every card; the rest burn out. A nursery with a single star is safe while any of your others has more. Spend ', el('b', {}, `${d.fieldPrice} lumens`), ' to open a third nursery.'),
      el('h3', { className: 'rules-head' }, 'Every star'),
      el('p', { className: 'muted' }, 'The common stars need more stars for each lumen. The rare ones pay much faster.'),
      el('div', { className: 'star-table' }, ...d.stars.map(starRow)),
      el('h3', { className: 'rules-head' }, 'The end'),
      el('p', {}, 'When the deck runs out it is shuffled again (the host picks how many times). The last time it runs out, finish that turn, harvest every nursery, and the most lumens wins. Ties go to whoever holds more cards.'),
    ),
    { title: 'How to play', wide: true },
  );
}

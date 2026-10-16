// Star Bonanza: How to play, in four picture steps, and a card for every star buddy with what it pays.
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
  box.replaceChildren(el('div', { className: 'modal-wrap', onclick: (e) => e.target === e.currentTarget && close() }, el('div', { className: `modal panel ${wide ? 'wide' : ''}` }, el('div', { className: 'modal-head' }, el('h2', {}, title), el('button', { className: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕')), el('div', { className: 'modal-body' }, body))));
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

const step = (n, emoji, title, text) => el('div', { className: 'howto-step', style: { '--i': n } }, el('div', { className: 'hs-num' }, `${n}`), el('div', { className: 'hs-ico' }, emoji), el('h3', {}, title), el('p', {}, text));
const coin = (n) => el('i', { className: 'coin' }, `${n}`);

// one star buddy's card: picture, name, joke, how many are in the UFO, and its coin table
export function starRow(s) {
  return el(
    'div',
    { className: 'star-row', style: { '--c': s.color } },
    el('img', { src: starArt(s.id), alt: '' }),
    el('div', { className: 'sr-name' }, el('b', {}, s.name), el('small', {}, `${s.persona} · ${s.count} in the UFO`), el('em', {}, s.blurb)),
    el('div', { className: 'sr-pays' }, ...s.table.map((need, i) => (need == null ? el('span', { className: 'pay none' }, '–') : el('span', { className: 'pay' }, el('b', {}, `${need}`), coin(i + 1))))),
  );
}

export function openRules() {
  const d = store.data;
  openModal(
    el(
      'div',
      { className: 'rules' },
      el('p', { className: 'lead' }, 'You are a space farmer. Grow star buddies in your patches, swap the ones you cannot use, and harvest them for ', el('b', {}, 'coins'), '. When the UFO runs out of stars, the farmer with the most coins wins!'),
      el(
        'div',
        { className: 'howto' },
        step(1, '🌱', 'Plant', 'You MUST plant the first card in your hand, and you may plant the next one. Never sort your hand!'),
        step(2, '🛸', 'Trade', 'The UFO beams down two stars. Swap them, and cards from your hand, with the other farmers.'),
        step(3, '🪴', 'Plant your winnings', 'Every star you got in a trade has to be planted right away. Only take what fits!'),
        step(4, '🃏', 'Draw three', 'Draw three cards to the back of your hand. Next farmer!'),
      ),
      el(
        'div',
        { className: 'rules-box' },
        el('h3', {}, '💰 Harvest any time'),
        el('p', {}, 'Tap Harvest on a patch to cash it in, even on someone else’s turn. Each card shows how many stars you need for 1, 2, 3 or 4 coins. A patch grows only one kind of star, and a patch with one lonely star is safe while another has more. Spend ', el('b', {}, `${d.fieldPrice} coins`), ' to buy a third patch.'),
      ),
      el('h3', { className: 'rules-head' }, 'Meet the star buddies'),
      el('p', { className: 'muted' }, 'The more of a kind there are, the more you need for each coin. Rare ones pay out fast!'),
      el('div', { className: 'star-table' }, ...d.stars.map(starRow)),
      el('div', { className: 'rules-box' }, el('h3', {}, '🏁 The end'), el('p', {}, 'When the UFO is empty it zooms off for more (the host picks how many trips). On the last trip, the turn finishes, every patch is harvested and the most coins wins. A tie goes to whoever holds more cards.')),
    ),
    { title: '📖 How to play', wide: true },
  );
}

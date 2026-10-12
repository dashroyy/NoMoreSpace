// Phase to Space: the rules, and the card library.
import { el } from '../util.js';
import { iconEl } from '../icons.js';
import { store, classInfo } from './net.js';
import { cardEl } from './cards.js';
import { classIcon } from './bits.js';
import { openModal } from './modal.js';
import { LEGEND, glyphChip } from './glyphs.js';

// one rule: an icon, a title, and one paragraph (its words and bold bits run on together)
const step = (icon, title, ...body) => el('div', { className: 'rule' }, el('div', { className: 'rule-ico' }, iconEl(icon)), el('div', {}, el('h3', {}, title), el('p', {}, ...body)));

export function openRules() {
  const d = store.data;
  openModal(
    el(
      'div',
      { className: 'rules' },
      el('p', { className: 'lead' }, 'You command a starship. Recruit a wacky crew, hunt Void Beasts and try to stop your friends doing the same.'),
      step('crown', 'How to win', 'Be the first to have a crew of ', el('b', {}, 'all six disciplines'), ' (your Captain counts as one) when your turn ends, or to ', el('b', {}, 'slay three Void Beasts'), '.'),
      el('div', { className: 'rule-classes' }, d.classIds.map((c) => el('span', { className: `chip cls-${c}` }, classIcon(c), classInfo(c).name))),
      step('bolt', 'Your turn: 3 Energy', 'Spend them in any order. ', el('b', {}, 'Draw'), ' a card (1). ', el('b', {}, 'Play'), ' a Crew, Gear or Protocol card (1). ', el('b', {}, 'Use'), ' a Crew member in your party (1, once per turn each). ', el('b', {}, 'Attack'), ' a Void Beast (2). ', el('b', {}, 'Flush'), ' your hand and draw five new cards (3).'),
      step('die', 'Rolling', 'Crew effects need you to roll 2 dice and reach the number on the card (e.g. 8+). Playing a Crew card from your hand lets you roll for it straight away. Beasts have a ', el('b', {}, 'slay'), ' number and a ', el('b', {}, 'fight-back'), ' range: roll in between and nothing happens.'),
      step('bolt', 'Boosts', 'The moment ANY roll lands, anyone can play Boost cards on it (free): add the big number to a friend, or take away the small one from a rival. They stack!'),
      step('radio', 'Signal Jam', 'When someone plays a Crew, Gear or Protocol card, anyone with a Signal Jam can answer: you both roll and if the Jammer rolls the same or higher, the card is wasted (and the Energy is lost).'),
      step('sword', 'Void Beasts', 'Three are always up for grabs. You need the right crew (a discipline, or enough Crew cards), then roll. Slay one and it joins your party with a power for the rest of the game. Roll too low and you pay the price.'),
      step('shield', 'Gear, Protocols and Captains', 'Gear is slid under a Crew card. Cursed Gear goes on a rival. Protocols are one-shot tricks. Your Captain starts in your party and has a power all game (and can never be destroyed or stolen).'),
      step('eyes', 'Reading the cards', 'Under each name, a row of pictures says what the card does. Tap a card to read it in full, in big letters.'),
      el('div', { className: 'legend-grid' }, LEGEND.map(([g, text]) => el('div', { className: 'legend-item' }, glyphChip(g), el('span', {}, text)))),
      step('bulb', 'Help on the table', 'Each Void Beast shows your chance to slay it (the green part of its bar) and a padlock until your crew meets its needs. A ring round the roll number on a Crew card shows how likely the roll is to work. The glowing card and the ', el('b', {}, 'bulb'), ' line suggest a good move: tap the bulb button at the top to turn these tips off.'),
      el('p', { className: 'hint' }, 'Tip: hover (or press and hold) any card to see it big. The Card Codex shows every card in the game.'),
    ),
    { title: 'How to play', wide: true },
  );
}

const TABS = [
  ['crew', 'Crew', 'crew'],
  ['captains', 'Captains', 'captains'],
  ['beasts', 'Void Beasts', 'beasts'],
  ['gear', 'Gear', 'gear'],
  ['protocols', 'Protocols', 'protocols'],
  ['boosts', 'Boosts + Jam', null],
];

export function openCodex() {
  const d = store.data;
  const grid = el('div', { className: 'codex-grid' });
  const tabs = el('div', { className: 'codex-tabs' });
  const filter = el('div', { className: 'codex-filter' });
  let tab = 'crew';
  let cls = null;
  const draw = () => {
    for (const b of tabs.children) b.classList.toggle('on', b.dataset.tab === tab);
    filter.hidden = tab !== 'crew';
    for (const b of filter.children) b.classList.toggle('on', b.dataset.cls === (cls || ''));
    let list = tab === 'boosts' ? [...d.boosts, d.challenge] : d[tab];
    if (tab === 'crew' && cls) list = list.filter((c) => c.cls === cls);
    // one of each Boost value: the deck has several copies
    grid.replaceChildren(
      ...list.map((c) => el('div', { className: 'codex-item' }, cardEl(c.id, { size: 'md' }), c.count > 1 ? el('span', { className: 'copies' }, `×${c.count} in the deck`) : null)),
    );
  };
  for (const [id, label] of TABS) tabs.append(el('button', { dataset: { tab: id }, className: 'small', onclick: () => ((tab = id), draw()) }, label));
  filter.append(el('button', { dataset: { cls: '' }, className: 'small', onclick: () => ((cls = null), draw()) }, 'All'));
  for (const c of d.classIds) filter.append(el('button', { dataset: { cls: c }, className: 'small', onclick: () => ((cls = c), draw()) }, classIcon(c), classInfo(c).name));
  draw();
  openModal(el('div', { className: 'codex' }, tabs, filter, grid), { title: 'Card codex', wide: true });
}

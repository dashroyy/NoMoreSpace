// Ruler of the Galaxy: the title screen. Pick a contender (the camera flies over to them), then start a galaxy,
// practise against robots, or join friends with a code.
import { el, problem } from '../util.js';
import { store, send } from './net.js';
import { unlock, sfx } from './sound.js';
import { openRules } from './codex.js';

const NAME_KEY = 'rotg-name';
const PICK_KEY = 'rotg-contender';
const read = (k) => {
  try {
    return localStorage.getItem(k) || '';
  } catch {
    return '';
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

export const homeState = { pick: null };

export function contenderCard(c, { onPick, picked = false, taken = '' } = {}) {
  return el(
    'button',
    { className: `c-card ${picked ? 'picked' : ''} ${taken ? 'taken' : ''}`, style: { '--c': c.color }, onclick: () => onPick?.(c.id), title: c.lore },
    el('span', { className: 'c-art' }, c.art),
    el('span', { className: 'c-name' }, c.name),
    el('span', { className: 'c-title' }, taken ? `Taken by ${taken}` : c.style),
    el('span', { className: 'c-perk' }, el('b', {}, c.perk.name), ` ${c.perk.text}`),
  );
}

export function buildHome(root, { world }) {
  homeState.pick = read(PICK_KEY) || null;
  const name = el('input', { id: 'home-name', placeholder: 'Your name', maxLength: 18, value: read(NAME_KEY), autocomplete: 'nickname' });
  name.addEventListener('change', () => write(NAME_KEY, name.value.trim()));
  const code = el('input', { placeholder: 'CODE', maxLength: 4, className: 'code-input', autocapitalize: 'characters' });
  const bots = el('select', { 'aria-label': 'How many robots' }, ...[1, 2, 3, 4, 5].map((n) => el('option', { value: n, selected: n === 3 }, `${n} robot${n > 1 ? 's' : ''}`)));
  const grid = el('div', { className: 'c-grid' });
  const draw = () => {
    grid.replaceChildren(...store.data.contenders.map((c) => contenderCard(c, { picked: c.id === homeState.pick, onPick: pick })));
    world.showcase(homeState.pick);
  };
  const pick = (id) => {
    unlock();
    sfx('keep');
    homeState.pick = homeState.pick === id ? null : id;
    write(PICK_KEY, homeState.pick || '');
    draw();
  };
  const go = (event, data) => {
    unlock();
    write(NAME_KEY, name.value.trim());
    send(event, { name: name.value.trim(), contender: homeState.pick, ...data }).catch((e) => problem(e.message));
  };
  root.replaceChildren(
    el('a', { className: 'back-link', href: '/' }, '← All games'),
    el(
      'div',
      { className: 'home' },
      el(
        'div',
        { className: 'home-panel panel' },
        el('div', { className: 'eyebrow' }, 'Sector Zero · the Andromeda collision'),
        el('h1', { className: 'title' }, el('span', {}, 'RULER OF'), el('span', { className: 'title-2' }, 'THE GALAXY')),
        el('p', { className: 'lead' }, 'A dice-chucking brawl for 2–6 mates. Take the Galactic Core, survive the barrage, and rule the galaxy.'),
        el('label', { className: 'field' }, el('span', {}, 'Your name'), name),
        el('div', { className: 'field' }, el('span', {}, 'Choose your contender'), grid),
        el('div', { className: 'home-btns' }, el('button', { className: 'big primary', onclick: () => go('create', {}) }, '🌌 Create a galaxy'), el('div', { className: 'practice' }, el('button', { className: 'big', onclick: () => go('create', { practice: true, bots: Number(bots.value) }) }, '🤖 Practice'), bots)),
        el('div', { className: 'join-row' }, code, el('button', { className: 'big', onclick: () => go('join', { code: code.value.trim().toUpperCase() }) }, 'Join friends')),
        el('div', { className: 'home-links' }, el('button', { className: 'link', onclick: () => openRules() }, '📖 How to play'), el('span', { className: 'muted' }, '2–6 players · about 20 minutes · robots fill empty seats')),
      ),
    ),
  );
  code.addEventListener('keydown', (e) => e.key === 'Enter' && go('join', { code: code.value.trim().toUpperCase() }));
  // a join link: /ruler?join=ABCD
  const join = new URLSearchParams(location.search).get('join');
  if (join) code.value = join.toUpperCase();
  draw();
  return { refresh: draw };
}

// Ruler of the Galaxy: the contender select screen, like a fighting game's. A roster along the bottom, the camera
// flies to whoever is highlighted, and a panel shows their stats, power and evolutions. Used from the title screen
// (pick before you play) and the lobby (pick, with the ones friends have taken locked).
import { el } from '../util.js';
import { store } from './net.js';
import { sfx } from './sound.js';
import { btn, icon, keyHints, onEscape } from './ui.js';

const STATS = [
  ['firepower', 'Firepower'],
  ['armour', 'Armour'],
  ['economy', 'Economy'],
  ['control', 'Dice control'],
];
const DIFFICULTY = ['', 'Easy', 'Medium', 'Hard'];
// one short word for the roster tiles
const SHORT = { mechanova: 'Mecha', kraken: 'Kraken', hive: 'Hive', stareater: 'Solaris', chronos: 'Chronos', goliath: 'Goliath' };
export const shortName = (c) => SHORT[c.id] || c.name.replace(/^The /, '').split(' ')[0];
export const roleOf = (c) => c.style.split(':')[0].trim();

// current: the contender to start on; taken: { contenderId: 'name of whoever has it' }
export function contenderSelect({ current = null, taken = {}, onBrowse, onConfirm, onBack }) {
  const list = store.data.contenders;
  let i = Math.max(0, list.findIndex((c) => c.id === current));
  let spinning = null;
  const info = el('div', { className: 'sel-info' });
  const tiles = list.map((c, k) =>
    el(
      'button',
      { className: 'c-tile', type: 'button', style: { '--c': c.color, '--i': k }, dataset: { sfx: 'none' }, onclick: () => browse(k), 'aria-label': c.name },
      el('span', { className: 'ct-frame' }, el('span', { className: 'ct-art' }, c.art)),
      el('span', { className: 'ct-name' }, shortName(c)),
      el('span', { className: 'ct-lock' }, icon('lock')),
    ),
  );
  const random = el('button', { className: 'c-tile random', type: 'button', dataset: { sfx: 'none' }, style: { '--c': '#ffcc4d', '--i': list.length }, onclick: () => roulette(), 'aria-label': 'A random contender' }, el('span', { className: 'ct-frame' }, el('span', { className: 'ct-art' }, '🎲')), el('span', { className: 'ct-name' }, 'Random'));
  const arrow = (dir) => el('button', { className: 'sel-arrow', type: 'button', dataset: { sfx: 'none' }, 'aria-label': dir < 0 ? 'Previous contender' : 'Next contender', onclick: () => browse((i + dir + list.length) % list.length) }, icon(dir < 0 ? 'back' : 'next'));
  const root = el(
    'div',
    { className: 'select-screen' },
    el('header', { className: 'sel-head' }, btn([icon('back'), el('span', {}, 'Back')], () => back(), 'ghost back-btn', { dataset: { sfx: 'back' } }), el('div', {}, el('div', { className: 'eyebrow' }, 'Contender select'), el('h2', {}, 'Choose your contender'))),
    el('aside', { className: 'sel-panel panel' }, info),
    el('div', { className: 'sel-roster' }, arrow(-1), el('div', { className: 'sel-tiles' }, ...tiles, random), arrow(1)),
    keyHints([
      [['←', '→'], 'Browse'],
      [['Enter'], 'Confirm'],
      [['Esc'], 'Back'],
    ]),
  );

  const isTaken = (c) => !!taken[c.id];
  const draw = () => {
    const c = list[i];
    root.style.setProperty('--c', c.color);
    tiles.forEach((t, k) => {
      t.classList.toggle('on', k === i);
      t.classList.toggle('taken', isTaken(list[k]));
      t.title = isTaken(list[k]) ? `${list[k].name}: taken by ${taken[list[k].id]}` : list[k].name;
    });
    const bar = (n) => el('span', { className: 'stat-bar' }, ...[1, 2, 3, 4, 5].map((k) => el('i', { className: k <= n ? 'on' : '' })));
    const confirm = isTaken(c) ? btn(`Taken by ${taken[c.id]}`, null, 'gold big', { disabled: true }) : btn([icon('check'), el('span', {}, `Choose ${c.name}`)], () => choose(), 'gold big confirm-btn', { dataset: { sfx: 'none' } });
    info.replaceChildren(
      el('div', { className: 'sel-tags' }, el('span', { className: 'role-tag' }, roleOf(c)), el('span', { className: 'diff' }, el('span', { className: 'diff-pips' }, ...[1, 2, 3].map((k) => el('i', { className: k <= c.difficulty ? 'on' : '' }))), DIFFICULTY[c.difficulty])),
      el('h1', { className: 'sel-name' }, el('span', { className: 'sel-art' }, c.art), c.name),
      el('div', { className: 'sel-title' }, c.title),
      el('p', { className: 'sel-lore' }, c.lore),
      el('div', { className: 'sel-stats' }, ...STATS.map(([k, label]) => el('div', { className: 'stat-row' }, el('span', {}, label), bar(c.stats?.[k] || 0)))),
      el('div', { className: 'sel-power' }, el('div', { className: 'sp-kicker' }, 'Power'), el('b', {}, c.perk.name), el('span', {}, c.perk.text)),
      el('div', { className: 'sel-evos' }, el('div', { className: 'sp-kicker' }, 'Evolutions · roll three Repairs'), ...c.evolutions.map((e) => el('div', { className: 'evo-line' }, el('b', {}, `🧬 ${e.name}`), el('span', {}, e.text)))),
      confirm,
    );
    info.classList.remove('swap');
    void info.offsetWidth;
    info.classList.add('swap');
  };

  function browse(k, quiet = false) {
    if (k === i && !quiet) return;
    i = k;
    if (!quiet) sfx('hover');
    draw();
    onBrowse?.(list[i].id);
  }
  function roulette() {
    if (spinning) return;
    const free = list.map((c, k) => k).filter((k) => !isTaken(list[k]));
    if (!free.length) return;
    const land = free[Math.floor(Math.random() * free.length)];
    let step = 0;
    const steps = 9 + Math.floor(Math.random() * 4);
    const tick = () => {
      step += 1;
      const k = step >= steps ? land : (i + 1) % list.length;
      i = k;
      sfx(step >= steps ? 'select' : 'hover');
      draw();
      if (step >= steps) {
        spinning = null;
        onBrowse?.(list[i].id);
      } else spinning = setTimeout(tick, 50 + step * step * 3);
    };
    tick();
  }
  function choose() {
    const c = list[i];
    if (isTaken(c) || spinning) return;
    sfx('enter');
    onConfirm?.(c.id);
  }
  function back() {
    onBack?.();
  }

  const onKey = (e) => {
    if (e.target.matches?.('input, textarea')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      browse((i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length);
    } else if (e.key === 'Enter' && (document.activeElement === document.body || document.activeElement?.classList.contains('c-tile'))) {
      e.preventDefault();
      choose();
    }
  };
  document.addEventListener('keydown', onKey);
  const popEscape = onEscape(() => {
    sfx('back');
    back();
  });
  draw();
  onBrowse?.(list[i].id);

  return {
    root,
    update({ taken: t = taken } = {}) {
      taken = t;
      draw();
    },
    destroy() {
      clearTimeout(spinning);
      document.removeEventListener('keydown', onKey);
      popEscape();
      root.remove();
    },
  };
}

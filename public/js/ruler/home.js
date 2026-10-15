// Ruler of the Galaxy: the title screen. A main menu down the left (play online, join, practice, contenders, how to
// play, settings), the galaxy and its six contenders on the right, your callsign and contender at the top, and
// how many people are playing at the bottom. Join, Practice and the contender select open in place of the menu.
import { el, problem } from '../util.js';
import { store, send, contender } from './net.js';
import { unlock, sfx } from './sound.js';
import { openRules } from './codex.js';
import { openSettings } from './settings.js';
import { askName, btn, icon, keyHints, menuList, onEscape } from './ui.js';
import { contenderSelect } from './select.js';

const NAME_KEY = 'rotg-name';
const PICK_KEY = 'rotg-contender';
const VERSION = 'v1.1';
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

const homeState = { pick: null };

// the logo from the start screen (one copy of the drawing, in ruler.html)
const LOGO = document.querySelector('#splash .logo-lockup')?.cloneNode(true);
export const logoLockup = () => LOGO?.cloneNode(true) || el('div', { className: 'logo-lockup' }, el('div', { className: 'wordmark' }, el('span', { className: 'wm-1' }, 'RULER'), el('span', { className: 'wm-2' }, 'of the galaxy')));

export function buildHome(root, { world }) {
  homeState.pick = read(PICK_KEY) || null;
  let name = read(NAME_KEY);
  let view = null;
  let popBack = null;
  let selectUi = null;
  let busy = false;
  const practice = { bots: 3, target: 20 };

  const badge = el('button', { className: 'pilot', type: 'button', title: 'Change your callsign', onclick: () => editName() });
  const online = el('div', { className: 'online' });
  const body = el('div', { className: 'home-view' });
  const hints = el('div', { className: 'home-hints' });
  const frame = el(
    'div',
    { className: 'home' },
    el('header', { className: 'home-top' }, el('a', { className: 'arcade-link', href: '/' }, icon('back'), el('span', {}, 'All games')), el('div', { className: 'home-top-right' }, badge, btn(icon('sliders'), () => openSettings(), 'icon-btn', { title: 'Settings', 'aria-label': 'Settings' }))),
    el('div', { className: 'home-col' }, logoLockup(), body),
    el('footer', { className: 'home-foot' }, hints, el('div', { className: 'foot-right' }, online, el('span', { className: 'version' }, VERSION))),
  );
  root.replaceChildren(frame);

  const drawBadge = () => {
    const c = contender(homeState.pick);
    badge.style.setProperty('--c', c?.color || '#8fa3d8');
    badge.replaceChildren(el('span', { className: 'pilot-art' }, c ? c.art : '?'), el('span', { className: 'pilot-text' }, el('b', {}, name || 'Set your callsign'), el('small', {}, c ? c.name : 'No contender yet')), icon('edit', 'pilot-edit'));
  };

  async function editName() {
    unlock();
    const v = await askName(name);
    if (v) {
      name = v;
      write(NAME_KEY, name);
      drawBadge();
    }
    return v;
  }
  const ensureName = async () => name || (await editName());

  async function go(event, data) {
    if (busy) return;
    unlock();
    if (!(await ensureName())) return;
    busy = true;
    setTimeout(() => (busy = false), 2500);
    send(event, { name, contender: homeState.pick, ...data }).catch((e) => {
      busy = false;
      sfx('error');
      problem(e.message);
    });
  }

  // ---------------------------------------------------------------------------
  const views = {
    main() {
      const menu = menuList([
        { label: 'Play online', sub: 'Host a galaxy and invite friends with a code', onClick: () => go('create', {}) },
        { label: 'Join a galaxy', sub: 'Got a four-letter code? Jump in', onClick: () => show('join') },
        { label: 'Practice', sub: 'You against the robots, right now', onClick: () => show('practice') },
        { label: 'Contenders', sub: 'Meet the six titans and choose yours', onClick: () => show('select') },
        { label: 'How to play', sub: 'The rules, with pictures', onClick: () => openRules() },
        { label: 'Settings', sub: 'Sound, music and graphics', onClick: () => openSettings() },
      ]);
      hints.replaceChildren(
        keyHints([
          [['↑', '↓'], 'Choose'],
          [['Enter'], 'Select'],
        ]),
      );
      return menu;
    },

    join(code = '') {
      const boxes = [0, 1, 2, 3].map((k) => el('input', { className: 'code-box', maxLength: 4, inputMode: 'text', autocapitalize: 'characters', autocomplete: 'off', spellcheck: false, 'aria-label': `Code letter ${k + 1}` })); // (room for a whole code at once: a paste, or autocorrect)
      const value = () => boxes.map((b) => b.value).join('');
      const fill = (text, from = 0) => {
        const chars = text.toUpperCase().replace(/[^A-Z0-9]/g, '').split('');
        let k = from;
        for (const ch of chars) if (k < 4) boxes[k++].value = ch;
        boxes[Math.min(k, 3)].focus();
        joinBtn.disabled = value().length < 4;
      };
      boxes.forEach((b, k) => {
        b.addEventListener('focus', () => b.select()); // typing replaces what is there
        b.addEventListener('input', () => {
          const v = b.value;
          b.value = '';
          fill(v, k);
          if (v) sfx('hover');
        });
        b.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !b.value && k > 0) {
            boxes[k - 1].value = '';
            boxes[k - 1].focus();
            joinBtn.disabled = true;
            e.preventDefault();
          } else if (e.key === 'Enter' && value().length === 4) join();
          else if (e.key === 'ArrowLeft' && k > 0) boxes[k - 1].focus();
          else if (e.key === 'ArrowRight' && k < 3) boxes[k + 1].focus();
        });
        b.addEventListener('paste', (e) => {
          e.preventDefault();
          fill(e.clipboardData.getData('text'), k);
        });
      });
      const join = () => value().length === 4 && go('join', { code: value() });
      const joinBtn = btn([el('span', {}, 'Join'), icon('next')], join, 'gold big', { disabled: true, dataset: { sfx: 'none' } });
      hints.replaceChildren(
        keyHints([
          [['Enter'], 'Join'],
          [['Esc'], 'Back'],
        ]),
      );
      const panel = el('div', { className: 'sub-panel' }, el('div', { className: 'eyebrow' }, 'Join a galaxy'), el('h2', {}, 'Enter the code'), el('p', { className: 'muted' }, 'Four letters, from whoever is hosting.'), el('div', { className: 'code-boxes' }, ...boxes), el('div', { className: 'sub-actions' }, backBtn(), joinBtn));
      setTimeout(() => (code ? fill(code) : boxes[0].focus()), 60);
      return panel;
    },

    practice() {
      const opp = el('div', { className: 'opp-row', role: 'radiogroup', 'aria-label': 'How many robots' });
      const stars = el('div', { className: 'segmented', role: 'radiogroup', 'aria-label': 'Stars to win' });
      const draw = () => {
        opp.replaceChildren(
          ...[1, 2, 3, 4, 5].map((n) =>
            el(
              'button',
              { type: 'button', className: `opp ${practice.bots === n ? 'on' : ''}`, role: 'radio', 'aria-checked': String(practice.bots === n), onclick: () => ((practice.bots = n), draw()) },
              el('span', { className: 'opp-bots' }, '🤖'.repeat(n)),
              el('b', {}, `${n}`),
              el('small', {}, n === 1 ? 'robot' : 'robots'),
            ),
          ),
        );
        stars.replaceChildren(...store.data.targets.map((t) => el('button', { type: 'button', className: `seg ${practice.target === t ? 'on' : ''}`, onclick: () => ((practice.target = t), draw()) }, `★ ${t}`)));
      };
      draw();
      hints.replaceChildren(
        keyHints([
          [['Enter'], 'Start'],
          [['Esc'], 'Back'],
        ]),
      );
      const start = btn([icon('play'), el('span', {}, 'Start practice')], () => go('create', { practice: true, bots: practice.bots, target: practice.target }), 'gold big', { dataset: { sfx: 'none' } });
      setTimeout(() => start.focus({ preventScroll: true }), 60);
      return el(
        'div',
        { className: 'sub-panel' },
        el('div', { className: 'eyebrow' }, 'Practice'),
        el('h2', {}, 'You against the robots'),
        el('div', { className: 'sub-label' }, 'Opponents'),
        opp,
        el('div', { className: 'sub-label' }, 'Stars to win'),
        stars,
        el('div', { className: 'sub-actions' }, backBtn(), start),
      );
    },
  };

  const backBtn = () => btn([icon('back'), el('span', {}, 'Back')], () => show('main'), 'ghost', { dataset: { sfx: 'back' } });

  function show(next, arg) {
    if (next === view && next !== 'join') return;
    popBack?.();
    popBack = null;
    selectUi?.destroy();
    selectUi = null;
    root.classList.toggle('selecting', next === 'select');
    if (next === 'select') {
      selectUi = contenderSelect({
        current: homeState.pick,
        onBrowse: (id) => world.showcase(id, {}, { focus: id }),
        onConfirm: (id) => {
          homeState.pick = id;
          write(PICK_KEY, id);
          drawBadge();
          show('main');
        },
        onBack: () => show('main'),
      });
      root.append(selectUi.root);
    } else {
      body.replaceChildren(views[next](arg));
      body.classList.remove('in');
      void body.offsetWidth;
      body.classList.add('in');
      world.showcase(homeState.pick, {}, { view: 'home' });
      if (next !== 'main')
        popBack = onEscape(() => {
          sfx('back');
          show('main');
        });
      if (next === 'main' && view) setTimeout(() => body.querySelector('.menu')?.focusSelected(), 30);
    }
    view = next;
  }

  // how many people are playing right now
  const poll = () => {
    if (root.hidden) return;
    fetch('/hub-stats')
      .then((r) => r.json())
      .then((s) => {
        const r = s.ruler || {};
        online.replaceChildren(el('i', { className: 'live-dot' }), r.people ? `${r.people} playing · ${r.tables} ${r.tables === 1 ? 'galaxy' : 'galaxies'}` : 'Servers online');
      })
      .catch(() => online.replaceChildren());
  };
  poll();
  setInterval(poll, 20000);

  drawBadge();
  show('main');
  const joinCode = new URLSearchParams(location.search).get('join');

  return {
    // after Press Start: the menu slides in (a join link opens Join with its code)
    intro() {
      frame.classList.remove('enter');
      void frame.offsetWidth;
      frame.classList.add('enter');
      if (joinCode) show('join', joinCode.toUpperCase());
      else setTimeout(() => body.querySelector('.menu')?.focusSelected(), 400);
    },
  };
}

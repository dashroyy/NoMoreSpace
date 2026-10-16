// Star Bonanza: the title screen. A main menu down the left (play online, join, practice, how to play, settings),
// the table running a little demo game on the right, your callsign at the top, and how many people are playing at
// the bottom. Join and Practice open in place of the menu.
import { el, problem } from '../util.js';
import { store, send } from './net.js';
import { unlock, sfx } from './sound.js';
import { openRules } from './codex.js';
import { openSettings } from './settings.js';
import { askName, btn, icon, keyHints, menuList, onEscape } from './ui.js';

const NAME_KEY = 'sbz-name';
const VERSION = 'v0.1';
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

// the logo from the start screen (one copy of the drawing, in bonanza.html)
const LOGO = document.querySelector('#splash .logo-lockup')?.cloneNode(true);
export const logoLockup = () => LOGO?.cloneNode(true) || el('div', { className: 'logo-lockup' }, el('div', { className: 'wordmark' }, el('span', { className: 'wm-1' }, 'STAR'), el('span', { className: 'wm-2' }, 'bonanza')));

export function buildHome(root, { world }) {
  let name = read(NAME_KEY);
  let view = null;
  let popBack = null;
  let busy = false;
  const practice = { bots: 3, passes: 2 };

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
    badge.style.setProperty('--c', '#ffd36b');
    badge.replaceChildren(el('span', { className: 'pilot-art' }, '🧑‍🚀'), el('span', { className: 'pilot-text' }, el('b', {}, name || 'Set your callsign'), el('small', {}, name ? 'Star grower' : 'Tap to choose a name')), icon('edit', 'pilot-edit'));
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
    send(event, { name, ...data }).catch((e) => {
      busy = false;
      sfx('error');
      problem(e.message);
    });
  }

  const backBtn = () => btn([icon('back'), el('span', {}, 'Back')], () => show('main'), 'ghost', { dataset: { sfx: 'back' } });

  // ---------------------------------------------------------------------------
  const views = {
    main() {
      const menu = menuList([
        { label: 'Play online', sub: 'Host a table and invite friends with a code', onClick: () => go('create', {}) },
        { label: 'Join a table', sub: 'Got a four-letter code? Jump in', onClick: () => show('join') },
        { label: 'Practice', sub: 'Learn the ropes against robots, right now', onClick: () => show('practice') },
        { label: 'How to play', sub: 'The rules, with pictures of every star', onClick: () => openRules() },
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
      const boxes = [0, 1, 2, 3].map((k) => el('input', { className: 'code-box', maxLength: 4, inputMode: 'text', autocapitalize: 'characters', autocomplete: 'off', spellcheck: false, 'aria-label': `Code letter ${k + 1}` }));
      const value = () => boxes.map((b) => b.value).join('');
      const fill = (text, from = 0) => {
        const chars = text.toUpperCase().replace(/[^A-Z0-9]/g, '').split('');
        let k = from;
        for (const ch of chars) if (k < 4) boxes[k++].value = ch;
        boxes[Math.min(k, 3)].focus();
        joinBtn.disabled = value().length < 4;
      };
      boxes.forEach((b, k) => {
        b.addEventListener('focus', () => b.select());
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
      const panel = el('div', { className: 'sub-panel' }, el('div', { className: 'eyebrow' }, 'Join a table'), el('h2', {}, 'Enter the code'), el('p', { className: 'muted' }, 'Four letters, from whoever is hosting.'), el('div', { className: 'code-boxes' }, ...boxes), el('div', { className: 'sub-actions' }, backBtn(), joinBtn));
      setTimeout(() => (code ? fill(code) : boxes[0].focus()), 60);
      return panel;
    },

    practice() {
      const opp = el('div', { className: 'opp-row', role: 'radiogroup', 'aria-label': 'How many robots' });
      const length = el('div', { className: 'segmented', role: 'radiogroup', 'aria-label': 'How long' });
      const draw = () => {
        opp.replaceChildren(
          ...[2, 3, 4, 5, 6].map((n) =>
            el(
              'button',
              { type: 'button', className: `opp ${practice.bots === n ? 'on' : ''}`, role: 'radio', 'aria-checked': String(practice.bots === n), onclick: () => ((practice.bots = n), draw()) },
              el('span', { className: 'opp-bots' }, '🤖'.repeat(Math.min(n, 3))),
              el('b', {}, `${n}`),
              el('small', {}, 'robots'),
            ),
          ),
        );
        length.replaceChildren(...store.data.passes.map((p) => el('button', { type: 'button', className: `seg ${practice.passes === p.id ? 'on' : ''}`, title: p.text, onclick: () => ((practice.passes = p.id), draw()) }, p.name)));
      };
      draw();
      hints.replaceChildren(
        keyHints([
          [['Enter'], 'Start'],
          [['Esc'], 'Back'],
        ]),
      );
      const start = btn([icon('play'), el('span', {}, 'Start practice')], () => go('create', { practice: true, bots: practice.bots, passes: practice.passes }), 'gold big', { dataset: { sfx: 'none' } });
      setTimeout(() => start.focus({ preventScroll: true }), 60);
      return el('div', { className: 'sub-panel' }, el('div', { className: 'eyebrow' }, 'Practice'), el('h2', {}, 'You against the robots'), el('div', { className: 'sub-label' }, 'Opponents'), opp, el('div', { className: 'sub-label' }, 'How long'), length, el('div', { className: 'sub-actions' }, backBtn(), start));
    },
  };

  function show(next, arg) {
    if (next === view && next !== 'join') return;
    popBack?.();
    popBack = null;
    body.replaceChildren(views[next](arg));
    body.classList.remove('in');
    void body.offsetWidth;
    body.classList.add('in');
    world.showcase('home');
    if (next !== 'main')
      popBack = onEscape(() => {
        sfx('back');
        show('main');
      });
    if (next === 'main' && view) setTimeout(() => body.querySelector('.menu')?.focusSelected(), 30);
    view = next;
  }

  // how many people are playing right now
  const poll = () => {
    if (root.hidden) return;
    fetch('/hub-stats')
      .then((r) => r.json())
      .then((s) => {
        const b = s.bonanza || {};
        online.replaceChildren(el('i', { className: 'live-dot' }), b.people ? `${b.people} playing · ${b.tables} ${b.tables === 1 ? 'table' : 'tables'}` : 'Servers online');
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

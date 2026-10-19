// Star Charters: the title screen. The logo in the middle, big buttons underneath (play with friends, join,
// practice, how to play), your captain name at the top and how many people are playing at the bottom. Join and
// Practice open in place of the buttons. Behind it all, a demo map builds itself on the chart table.
import { problem } from '../util.js';
import { store, send } from './net.js';
import { unlock, sfx } from './sound.js';
import { openRules } from './codex.js';
import { openSettings } from './settings.js';
import { el, askName, btn, icon, onEscape } from './ui.js';

const NAME_KEY = 'sch-name';
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

// the logo from the start screen (one copy of the drawing, in charters.html)
const LOGO = document.querySelector('#splash .logo-lockup')?.cloneNode(true);
export const logoLockup = () => LOGO?.cloneNode(true) || el('div', { className: 'logo-lockup' }, el('div', { className: 'wordmark' }, el('span', { className: 'wm-1' }, 'Star'), el('span', { className: 'wm-2' }, 'Charters')));

// a big menu button: an emoji and a title (the explanation is a tooltip, not more text on screen)
const bigButton = (emoji, title, sub, kind, onClick) => btn([el('span', { className: 'bb-ico' }, emoji), el('span', { className: 'bb-text' }, el('b', {}, title))], onClick, `bigbtn ${kind}`, { title: sub, dataset: { sfx: 'none' } });

export function buildHome(root, { world }) {
  let name = read(NAME_KEY);
  let view = null;
  let popBack = null;
  let busy = false;
  const practice = { bots: 2, length: 'sprint' };

  const badge = el('button', { className: 'captain', type: 'button', title: 'Change your captain name', onclick: () => editName() });
  const online = el('div', { className: 'online' });
  const body = el('div', { className: 'home-view' });
  const frame = el(
    'div',
    { className: 'home' },
    el('header', { className: 'home-top' }, el('a', { className: 'arcade-link', href: '/' }, icon('back'), el('span', {}, 'All games')), el('div', { className: 'home-top-right' }, badge, btn(icon('sliders'), () => openSettings(), 'icon-btn', { title: 'Settings', 'aria-label': 'Settings' }))),
    el('div', { className: 'home-col' }, el('div', { className: 'home-logo' }, logoLockup()), body),
    el('footer', { className: 'home-foot' }, online, el('span', { className: 'version' }, VERSION)),
  );
  root.replaceChildren(frame);

  const drawBadge = () => {
    badge.replaceChildren(el('span', { className: 'captain-art' }, '🧑‍🚀'), el('span', { className: 'captain-text' }, el('b', {}, name || 'Pick a name'), el('small', {}, name ? 'Star charter' : 'tap to choose')), icon('edit'));
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
    sfx('start');
    send(event, { name, ...data }).catch((e) => {
      busy = false;
      sfx('error');
      problem(e.message);
    });
  }

  const backBtn = () => btn([icon('back'), el('span', {}, 'Back')], () => show('main'), 'ghost', { dataset: { sfx: 'back' } });

  const views = {
    main() {
      const box = el(
        'div',
        { className: 'big-menu' },
        bigButton('🚀', 'Play with friends', 'Start a table and share the code', 'gold', () => go('create', {})),
        bigButton('🔑', 'Join a table', 'Got a four-letter code?', 'sky', () => (sfx('select'), show('join'))),
        bigButton('🤖', 'Practice', 'You against the robots, right now', 'mint', () => (sfx('select'), show('practice'))),
        bigButton('📖', 'How to play', 'Lanes, stations, wormholes…', 'orange', () => openRules()),
      );
      setTimeout(() => box.querySelector('button')?.focus({ preventScroll: true }), 60);
      return box;
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
          if (v) sfx('tick');
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
      const joinBtn = btn([el('span', {}, 'Climb aboard'), icon('next')], join, 'gold big', { disabled: true, dataset: { sfx: 'none' } });
      setTimeout(() => (code ? fill(code) : boxes[0].focus()), 60);
      return el('div', { className: 'sub-panel panel' }, el('h2', {}, '🔑 Join a table'), el('div', { className: 'code-boxes' }, ...boxes), el('div', { className: 'sub-actions' }, backBtn(), joinBtn));
    },

    practice() {
      const opp = el('div', { className: 'opp-row', role: 'radiogroup', 'aria-label': 'How many robots' });
      const length = el('div', { className: 'segmented', role: 'radiogroup', 'aria-label': 'How long' });
      const draw = () => {
        opp.replaceChildren(
          ...[1, 2, 3, 4].map((n) =>
            el('button', { type: 'button', className: `opp ${practice.bots === n ? 'on' : ''}`, role: 'radio', 'aria-checked': String(practice.bots === n), onclick: () => ((practice.bots = n), sfx('select'), draw()) }, el('span', { className: 'opp-bots' }, '🤖'.repeat(n)), el('b', {}, `${n}`), el('small', {}, n === 1 ? 'robot' : 'robots')),
          ),
        );
        length.replaceChildren(...store.data.lengths.map((l) => el('button', { type: 'button', className: `seg ${practice.length === l.id ? 'on' : ''}`, title: l.text, onclick: () => ((practice.length = l.id), sfx('select'), draw()) }, `${l.name} · ${l.text.split(',')[0]}`)));
      };
      draw();
      const start = btn([icon('play'), el('span', {}, 'Launch!')], () => go('create', { practice: true, bots: practice.bots, length: practice.length }), 'gold big', { dataset: { sfx: 'none' } });
      setTimeout(() => start.focus({ preventScroll: true }), 60);
      return el('div', { className: 'sub-panel panel' }, el('h2', {}, '🤖 Practice'), el('div', { className: 'sub-label' }, 'How many robot captains?'), opp, el('div', { className: 'sub-label' }, 'How long?'), length, el('div', { className: 'sub-actions' }, backBtn(), start));
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
    view = next;
  }

  // how many people are playing right now
  const poll = () => {
    if (root.hidden) return;
    fetch('/hub-stats')
      .then((r) => r.json())
      .then((s) => {
        const c = s.charters || {};
        online.replaceChildren(el('i', { className: 'live-dot' }), c.people ? `${c.people} charting now · ${c.tables} ${c.tables === 1 ? 'table' : 'tables'}` : 'Servers online');
      })
      .catch(() => online.replaceChildren());
  };
  poll();
  setInterval(poll, 20000);

  drawBadge();
  show('main');
  const joinCode = new URLSearchParams(location.search).get('join');

  return {
    intro() {
      frame.classList.remove('enter');
      void frame.offsetWidth;
      frame.classList.add('enter');
      if (joinCode) show('join', joinCode.toUpperCase());
    },
  };
}

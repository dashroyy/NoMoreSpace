// Star Bonanza: the pieces every menu shares. Line icons, menu lists you can drive with the keyboard,
// dialogs (instead of the browser's own confirm box), the callsign prompt, menu sounds, the Escape key, the
// warp flash between screens and the key hints along the bottom.
import { el } from '../util.js';
import { sfx } from './sound.js';

// ---------------------------------------------------------------------------
// icons: 24px line drawings, all with the same stroke
// ---------------------------------------------------------------------------
const ICONS = {
  menu: 'M4 6h16M4 12h16M4 18h11',
  chat: 'M4 5h16v11H10l-5 4v-4H4z',
  sound: 'M4 9h4l5-4v14l-5-4H4zM16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11',
  mute: 'M4 9h4l5-4v14l-5-4H4zM16 9.5l5 5M21 9.5l-5 5',
  bag: 'M5 8h14l-1.2 12H6.2zM9 8a3 3 0 0 1 6 0',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM17.5 14H20M14 17.5V20',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  check: 'M5 12.5l4.5 4.5L19 7',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  leave: 'M10 4H5v16h5M14 8l4 4-4 4M18 12H9',
  book: 'M4 5h5.5A2.5 2.5 0 0 1 12 7.5V20a2 2 0 0 0-2-2H4zM20 5h-5.5A2.5 2.5 0 0 0 12 7.5V20a2 2 0 0 1 2-2h6z',
  play: 'M8 5l11 7-11 7z',
  dice: 'M5 5h14v14H5zM9 9h.01M15 15h.01M12 12h.01M15 9h.01M9 15h.01',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.8c1.6.8 2.7 2.6 3 5.2',
  robot: 'M6 9h12v10H6zM12 5v4M9.5 13.5h.01M14.5 13.5h.01M3 13v3M21 13v3',
  link: 'M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1',
};

export function icon(name, className = '') {
  return el('span', {
    className: `ico ${className}`,
    'aria-hidden': 'true',
    innerHTML: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[name] || ''}"/></svg>`,
  });
}

// a chunky cartoon button: kind is '' (paper), 'gold' (the main action), 'primary' (sky blue), 'mint', 'pink', 'danger' or 'ghost'
export function btn(label, onClick, kind = '', props = {}) {
  return el('button', { className: `btn ${kind}`, type: 'button', onclick: onClick, ...props }, label);
}

// ---------------------------------------------------------------------------
// Escape: whatever opened last closes first (a dialog over a menu over the game)
// ---------------------------------------------------------------------------
const escapes = [];
export function onEscape(fn) {
  escapes.push(fn);
  return () => {
    const i = escapes.lastIndexOf(fn);
    if (i >= 0) escapes.splice(i, 1);
  };
}
export const escapeOpen = () => escapes.length > 0;
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !escapes.length) return;
  e.preventDefault();
  escapes[escapes.length - 1]();
});

// ---------------------------------------------------------------------------
// a menu: big items, the highlight follows the mouse and the arrow keys, Enter picks
//   items: [{ label, sub, onClick, sound, className }]
// ---------------------------------------------------------------------------
export function menuList(items, { className = '' } = {}) {
  const nav = el('nav', { className: `menu ${className}` });
  const buttons = items.filter(Boolean).map((it, i) => {
    const b = el(
      'button',
      {
        className: `menu-item ${it.className || ''}`,
        type: 'button',
        style: { '--i': i },
        onclick: () => {
          sfx(it.sound || 'select');
          it.onClick();
        },
      },
      el('span', { className: 'mi-label' }, it.label),
      it.sub ? el('span', { className: 'mi-sub' }, it.sub) : null,
    );
    b.addEventListener('pointerenter', () => {
      if (document.activeElement !== b) b.focus({ preventScroll: true });
    });
    b.addEventListener('focus', () => {
      if (!b.classList.contains('sel')) sfx('hover');
      for (const x of buttons) x.classList.toggle('sel', x === b);
    });
    return b;
  });
  nav.append(...buttons);
  buttons[0]?.classList.add('sel');
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = buttons.indexOf(document.activeElement);
    const n = buttons.length;
    buttons[i < 0 ? 0 : (i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n].focus({ preventScroll: true });
  });
  // focus the highlighted item (so the keyboard works straight away)
  nav.focusSelected = () => (buttons.find((b) => b.classList.contains('sel')) || buttons[0])?.focus({ preventScroll: true });
  return nav;
}

// arrows on a page with a menu but nothing focused yet: start on the menu
document.addEventListener('keydown', (e) => {
  if (!['ArrowDown', 'ArrowUp'].includes(e.key) || (document.activeElement && document.activeElement !== document.body)) return;
  const nav = [...document.querySelectorAll('.menu')].reverse().find((m) => m.offsetParent && m.focusSelected);
  if (nav) {
    e.preventDefault();
    nav.focusSelected();
  }
});

// ---------------------------------------------------------------------------
// dialogs
// ---------------------------------------------------------------------------
function dialogLayer() {
  let layer = document.getElementById('layer-dialog');
  if (!layer) {
    layer = el('div', { id: 'layer-dialog', className: 'layer-dialog' });
    document.body.append(layer);
  }
  return layer;
}

export function dialog({ title, body, actions = [], tone = '', onClose = null }) {
  let open = true;
  const box = el('div', { className: `dialog ${tone}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, el('div', { className: 'dialog-head' }, el('h2', {}, title)), el('div', { className: 'dialog-body' }, body), actions.length ? el('div', { className: 'dialog-actions' }, ...actions) : null);
  const wrap = el('div', { className: 'dialog-wrap', onclick: (e) => e.target === wrap && cancel() }, box);
  const close = () => {
    if (!open) return;
    open = false;
    pop();
    wrap.classList.add('closing');
    setTimeout(() => wrap.remove(), 200);
  };
  const cancel = () => {
    sfx('back');
    close();
    onClose?.();
  };
  const pop = onEscape(cancel);
  dialogLayer().append(wrap);
  sfx('open');
  setTimeout(() => (box.querySelector('input, .btn.gold, .btn.danger, .btn') || box).focus?.({ preventScroll: true }), 40);
  return { close, box };
}

export function confirmDialog({ title, text, yes = 'Yes', no = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let d = null;
    const finish = (v) => {
      d?.close();
      resolve(v);
    };
    d = dialog({ title, body: el('p', {}, text), tone: danger ? 'danger' : '', actions: [btn(no, () => finish(false), 'ghost', { dataset: { sfx: 'back' } }), btn(yes, () => finish(true), danger ? 'danger' : 'gold')], onClose: () => resolve(false) });
  });
}

const CALL_A = ['Farmer', 'Captain', 'Cosmic', 'Space', 'Little', 'Moon', 'Rocket', 'Sparkle', 'Turbo', 'Lucky', 'Silly', 'Fuzzy', 'Mighty', 'Sir', 'Granny'];
const CALL_B = ['Moo', 'Pickles', 'Noodle', 'Beans', 'Sprout', 'Biscuit', 'Waffles', 'Nugget', 'Pebble', 'Bloop', 'Muffin', 'Taters', 'Turnip', 'Wobble', 'Sprinkles'];
export function randomCallsign() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return `${pick(CALL_A)} ${pick(CALL_B)}`;
}

// ask for a name (pre-filled with the current one, or a random callsign); resolves with the name, or null
export function askName(current = '') {
  return new Promise((resolve) => {
    let d = null;
    const input = el('input', { className: 'name-input', value: current || randomCallsign(), maxLength: 18, autocomplete: 'nickname', spellcheck: false, 'aria-label': 'Your farmer name' });
    const finish = (v) => {
      d?.close();
      resolve(v);
    };
    const ok = () => {
      const v = input.value.trim();
      if (!v) {
        sfx('error');
        input.focus();
        return;
      }
      finish(v);
    };
    const roll = btn(icon('dice'), () => {
      input.value = randomCallsign();
      input.focus();
      input.select();
    }, 'icon-btn', { title: 'A random silly name', 'aria-label': 'A random silly name' });
    const form = el('form', { className: 'name-form', onsubmit: (e) => (e.preventDefault(), ok()) }, input, roll);
    d = dialog({
      title: 'Your farmer name',
      body: el('div', {}, el('p', { className: 'muted' }, 'What should the other farmers call you? (The dice makes up a silly one.)'), form),
      actions: [btn('Cancel', () => finish(null), 'ghost', { dataset: { sfx: 'back' } }), btn('That’s me!', ok, 'gold')],
      onClose: () => resolve(null),
    });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 60);
  });
}

// ---------------------------------------------------------------------------
// menu sounds: a tick when the pointer reaches a button, a blip when one is pressed (in menus, not mid-battle,
// where the game's own sounds play)
// ---------------------------------------------------------------------------
const MENUS = '#screen-home, #screen-lobby, .layer-modal, .layer-dialog, .pause, .end-wrap, .topbar, .trade';
export function wireUiSounds() {
  let last = null;
  document.addEventListener('pointerover', (e) => {
    const b = e.target.closest?.('button:not(:disabled)');
    if (b === last) return;
    last = b;
    if (b && !b.classList.contains('menu-item') && b.closest(MENUS)) sfx('hover');
  });
  document.addEventListener(
    'click',
    (e) => {
      const b = e.target.closest?.('button:not(:disabled)');
      if (!b || b.classList.contains('menu-item') || b.dataset.sfx === 'none' || !b.closest(MENUS)) return;
      sfx(b.dataset.sfx || 'select');
    },
    true,
  );
}

// the flash of light between screens
export function warp() {
  const w = document.getElementById('warp');
  if (!w) return;
  w.classList.remove('go');
  void w.offsetWidth;
  w.classList.add('go');
}

// keycaps along the bottom of a screen: [[['↑', '↓'], 'Choose'], [['Enter'], 'Select']]
export function keyHints(pairs) {
  return el('div', { className: 'keyhints' }, ...pairs.map(([keys, label]) => el('span', { className: 'kh' }, ...keys.map((k) => el('kbd', {}, k)), el('span', {}, label))));
}

// No More Space: the pieces every menu shares. Menu lists you can drive with the arrow keys, dialogs of the
// game's own (instead of the browser's confirm box), the callsign prompt, key hints and the flash between screens.
// (The same kit Ruler of the Galaxy uses, wired to this game's sounds.)
import { el } from '../util.js';
import { sfx } from '../audio.js';

// a button in the game's style: kind is '' (glass), 'go' (the main action), 'bad' (danger) or 'quiet'
export function btn(label, onClick, kind = '', props = {}) {
  return el('button', { className: `nm-btn ${kind}`, type: 'button', onclick: onClick, ...props }, label);
}

// ---------------------------------------------------------------------------
// Escape: whatever opened last closes first (a dialog over a menu)
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
//   items: [{ id, emoji, label, sub, onClick, sound, className }]
// ---------------------------------------------------------------------------
export function menuList(items, { className = '' } = {}) {
  const nav = el('nav', { className: `nm-menu ${className}` });
  const buttons = items.filter(Boolean).map((it, i) => {
    const b = el(
      'button',
      {
        id: it.id,
        className: `nm-item ${it.className || ''}`,
        type: 'button',
        style: { '--i': i },
        onclick: () => {
          sfx(it.sound || 'select');
          it.onClick?.();
        },
      },
      it.emoji ? el('span', { className: 'mi-emoji', 'aria-hidden': 'true' }, it.emoji) : null,
      el('span', { className: 'mi-text' }, el('span', { className: 'mi-label' }, it.label), it.sub ? el('span', { className: 'mi-sub' }, it.sub) : null),
      el('span', { className: 'mi-go', 'aria-hidden': 'true' }, '›'),
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
  const nav = [...document.querySelectorAll('.nm-menu')].reverse().find((m) => m.offsetParent && m.focusSelected);
  if (nav) {
    e.preventDefault();
    nav.focusSelected();
  }
});

// ---------------------------------------------------------------------------
// dialogs
// ---------------------------------------------------------------------------
function dialogLayer() {
  let layer = document.getElementById('nm-dialogs');
  if (!layer) {
    layer = el('div', { id: 'nm-dialogs', className: 'nm-dialogs' });
    document.body.append(layer);
  }
  return layer;
}

// while a dialog is open, the screens behind it cannot be reached with Tab or a screen reader
let openDialogs = 0;
const behind = () => document.querySelectorAll('#screen-home, #screen-lobby, #hud');
const setInert = (on) => behind().forEach((n) => n.toggleAttribute('inert', on));

export function dialog({ title, body, actions = [], tone = '', wide = false, onClose = null }) {
  let open = true;
  const box = el('div', { className: `nm-dialog ${tone} ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, el('div', { className: 'dlg-head' }, el('h2', {}, title)), el('div', { className: 'dlg-body' }, body), actions.length ? el('div', { className: 'dlg-actions' }, ...actions) : null);
  const wrap = el('div', { className: 'nm-dialog-wrap', onclick: (e) => e.target === wrap && cancel() }, box);
  const close = () => {
    if (!open) return;
    open = false;
    if (--openDialogs <= 0) {
      openDialogs = 0;
      setInert(false);
    }
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
  openDialogs += 1;
  setInert(true);
  sfx('open');
  setTimeout(() => (box.querySelector('[data-autofocus], input') || box.querySelector('.nm-btn.go, .nm-btn.bad') || box.querySelector('.nm-btn') || box).focus?.({ preventScroll: true }), 40);
  return { close, box };
}

export function confirmDialog({ title, text, yes = 'Yes', no = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let d = null;
    const finish = (v) => {
      d?.close();
      resolve(v);
    };
    d = dialog({ title, body: el('p', {}, text), tone: danger ? 'bad' : '', actions: [btn(no, () => finish(false), 'quiet', { dataset: { sfx: 'back' } }), btn(yes, () => finish(true), danger ? 'bad' : 'go')], onClose: () => resolve(false) });
  });
}

const CALL_A = ['Commander', 'Captain', 'Doctor', 'Admiral', 'Professor', 'Agent', 'Major', 'Sergeant', 'Chief', 'Lieutenant'];
const CALL_B = ['Biscuit', 'Noodle', 'Waffle', 'Pickle', 'Cosmo', 'Muffin', 'Turnip', 'Comet', 'Pretzel', 'Gadget', 'Nebula', 'Pudding', 'Zigzag', 'Tater', 'Beans'];
export function randomCallsign() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return `${pick(CALL_A)} ${pick(CALL_B)}`;
}

// ask for a name (pre-filled with the current one, or a random callsign); resolves with the name, or null
export function askName(current = '') {
  return new Promise((resolve) => {
    let d = null;
    const input = el('input', { className: 'name-input', value: current || randomCallsign(), maxLength: 18, autocomplete: 'nickname', spellcheck: false, 'aria-label': 'Your name' });
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
    const roll = btn('🎲', () => {
      input.value = randomCallsign();
      input.focus();
      input.select();
    }, 'dice', { title: 'A random name', 'aria-label': 'A random name' });
    const form = el('form', { className: 'name-form', onsubmit: (e) => (e.preventDefault(), ok()) }, input, roll);
    d = dialog({
      title: 'What should the crew call you?',
      body: el('div', {}, el('p', { className: 'muted' }, 'The name everyone sees above your spacesuit.'), form),
      actions: [btn('Cancel', () => finish(null), 'quiet', { dataset: { sfx: 'back' } }), btn('Confirm', ok, 'go')],
      onClose: () => resolve(null),
    });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 60);
  });
}

// the flash of light between screens
export function warp() {
  const w = document.getElementById('nm-warp');
  if (!w) return;
  w.classList.remove('go');
  void w.offsetWidth;
  w.classList.add('go');
}

// keycaps along the bottom of a screen: [[['↑', '↓'], 'Choose'], [['Enter'], 'Select']]
export function keyHints(pairs) {
  return el('div', { className: 'nm-keyhints' }, ...pairs.map(([keys, label]) => el('span', { className: 'kh' }, ...keys.map((k) => el('kbd', {}, k)), el('span', {}, label))));
}

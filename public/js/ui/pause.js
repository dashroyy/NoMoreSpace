// The in-game menu: one Menu button (or Esc) instead of a row of tiny icons. The game never stops for it (it is a
// game with friends), so it only offers the way to your role card, the wiki, settings, how to play, and the exit.
// Every item presses the existing button, so there is only one place each action lives.
import { $, el } from '../util.js';
import { menuList, dialog, keyHints } from './menu.js';

// is any other window, menu or text box using Escape right now?
function somethingOpen() {
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;
  return !!document.querySelector('#modal:not([hidden]), #bigmap:not([hidden]), #rooms-menu:not([hidden]), #nominate-menu:not([hidden]), #system-menu:not([hidden]), #claim-menu:not([hidden]), #emote-menu:not([hidden]), .nm-dialog-wrap, #reveal:not([hidden]), #night:not([hidden]) .task-area');
}

export function initPause({ onLeave }) {
  const bar = document.querySelector('.tb-right');
  if (!bar) return;
  const button = el('button', { id: 'btn-menu', className: 'icon menu-btn', type: 'button', title: 'Menu (Esc)', 'aria-label': 'Menu', onclick: () => open() }, '☰');
  bar.append(button);
  // the stylesheet tucks the quick buttons that now live in the menu away (the sound, music and voice switches stay)
  document.body.classList.add('has-menu');

  let current = null;
  function open() {
    if (current) return;
    const press = (id) => () => {
      current?.close();
      $(id)?.click();
    };
    const pauseBtn = $('btn-pause');
    const menu = menuList([
      { emoji: '▶️', label: 'Resume', sub: 'Back to the ship', onClick: () => current?.close(), sound: 'back' },
      { emoji: '📜', label: 'Role card', sub: 'Your ability, notes and the day log (R)', onClick: () => (current?.close(), $('btn-role')?.click()) },
      { emoji: '📖', label: 'The Ship’s Wiki', sub: 'Every role and every rule', onClick: press('btn-wiki') },
      { emoji: '⚙️', label: 'Settings', sub: 'Sound, text size and graphics', onClick: press('btn-settings') },
      { emoji: '❔', label: 'How to play', sub: 'A quick reminder of the rules', onClick: press('btn-help') },
      pauseBtn && !pauseBtn.hidden ? { emoji: '⏸️', label: 'Pause the game', sub: 'Stops the clock for everyone', onClick: press('btn-pause') } : null,
      { emoji: '🚪', label: 'Leave the ship', sub: 'A robot takes over your spacesuit', onClick: () => (current?.close(), onLeave()), className: 'bad', sound: 'back' },
    ]);
    current = dialog({
      title: 'Menu',
      body: el('div', { className: 'pause-body' }, el('p', { className: 'muted' }, 'The ship keeps flying while this is open.'), menu, keyHints([[['↑', '↓'], 'Choose'], [['Enter'], 'Select'], [['Esc'], 'Resume']])),
      onClose: () => (current = null),
    });
    const close = current.close;
    current.close = () => {
      close();
      current = null;
    };
    setTimeout(() => menu.focusSelected(), 60);
  }

  // Escape opens the menu, unless it is just closing something else (checked before anything else reacts to the key)
  let wasBusy = false;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') wasBusy = somethingOpen() || !!current;
  }, true);
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || wasBusy || document.body.classList.contains('screen-home') || $('hud').hidden) return;
    open();
  });
}

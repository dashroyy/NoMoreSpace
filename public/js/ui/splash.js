// No More Space: the start screen. The logo and a loading bar over the 3D ship while the fonts, icons and models
// load, a tip, then "Press any key" (that first press is also what lets the browser play sound). It shows once per
// visit: reloading in the middle of a game, or following an invite link, goes straight in.
import { el } from '../util.js';

const SEEN = 'nms-splash-seen';

// has this visit already been through the start screen?
export function returning() {
  try {
    return sessionStorage.getItem(SEEN) === '1';
  } catch {
    return false;
  }
}

const TIPS = [
  'Only people in the same room can read your chat. Meet someone for a private talk.',
  'Press R for your role card, M to jump to any room, Tab for the station map.',
  'Doing tasks charges the Observation Array: tomorrow you get a clue decoded, or watch the window for it.',
  'Not sure who to trust? Everyone lies a little. The Parasite lies the most.',
  'ARIA, the ship’s AI, tells the story. If you get eaten, she will work in your bio.',
  'No friends online? Practice with robots to learn every script.',
  'The ship cat knows who the Parasite is. The ship cat is not talking.',
  'If someone says "trust me", check their pockets for tentacles.',
  'Pro tip: the vents are not a shortcut.',
  'If you hear whispering from the walls, do not whisper back.',
  'Everybody lies a little. Some lie a lot. A few lie in a funny hat.',
  'The airlock is not a time-out corner. It is more of a time-out forever.',
  'A suspicious silence is just a loud thing that has not happened yet.',
  'Always check under the bed. And inside the other bed.',
  'Do your tasks, make friends, and avoid anyone who laughs a second too late.',
  'A good alibi is one hamster and a witness.',
  'Fun fact: you can survive almost anything if you stand near a hamster.',
  'ARIA is always listening. ARIA is also always dramatic.',
];

// what the loading bar says while the ship powers up
const LOADING = [
  'Powering up the ship%s',
  'Feeding the hamsters%s',
  'Polishing the airlock%s',
  'Untangling the cables%s',
  'Hiding the Parasite%s',
  'Warming up the noodles%s',
  'Teaching ARIA to be dramatic%s',
  'Counting the pumpkins%s',
  'Calibrating the black hole%s',
  'Waking the ship cat%s',
];
export const loadingLine = () => LOADING[Math.floor(Math.random() * LOADING.length)].replace('%s', '...');

export function createSplash() {
  const bar = el('i');
  const status = el('p', { className: 'sp-status' }, 'Powering up the ship…');
  const press = el('p', { className: 'sp-press', hidden: true }, matchMedia('(pointer: coarse)').matches ? 'Tap to start' : 'Press any key');
  const root = el(
    'div',
    { id: 'nm-splash', className: 'nm-splash' },
    el(
      'div',
      { className: 'sp-center' },
      el('h1', { className: 'nm-logo' }, el('span', { className: 'l1' }, 'NO MORE'), el('span', { className: 'l2' }, 'SPACE')),
      el('p', { className: 'sp-tag' }, 'The ship is falling into a black hole.', el('br'), 'Something aboard is not human.'),
      el('div', { className: 'sp-load', role: 'progressbar', 'aria-label': 'Loading' }, bar),
      status,
      press,
    ),
    el('p', { className: 'sp-tip' }, el('b', {}, 'TIP '), TIPS[Math.floor(Math.random() * TIPS.length)]),
  );
  document.body.append(root);
  let open = true;
  const api = {
    get open() {
      return open;
    },
    progress(p, text) {
      bar.style.width = `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
      if (text) status.textContent = text;
    },
    // resolves once someone presses a key or taps (right away if the splash is already gone)
    ready() {
      api.progress(1, '');
      status.hidden = true;
      press.hidden = false;
      return new Promise((resolve) => {
        if (!open) return resolve(false);
        const go = (e) => {
          if (e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
          window.removeEventListener('keydown', go);
          root.removeEventListener('pointerdown', go);
          api.dismiss();
          resolve(true);
        };
        window.addEventListener('keydown', go);
        root.addEventListener('pointerdown', go);
      });
    },
    dismiss() {
      if (!open) return;
      open = false;
      try {
        sessionStorage.setItem(SEEN, '1');
      } catch {}
      root.classList.add('out');
      setTimeout(() => root.remove(), 900);
    },
  };
  return api;
}

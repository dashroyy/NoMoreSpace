// No More Space: the title menu. Big items you can drive with the arrow keys and Enter (or the mouse, or a thumb):
// launch a ship, board one with a code, practice against robots, public ships, your profile, the wiki and settings.
// Launching, boarding and practice open a window of the game's own. Everything asks for a name first, once.
import { el } from '../util.js';
import { store } from '../store.js';
import { sfx } from '../audio.js';
import { menuList, dialog, btn, askName, keyHints } from './menu.js';
import { getCallsign, setCallsign } from './callsign.js';

// the line under the logo: a different one each visit
const TAGLINES = [
  'The ship is falling into a black hole. Something aboard is not human. Find it before there is no more space.',
  'Somebody on this ship is a Parasite. Somebody else is just really bad at tasks. Good luck telling them apart.',
  'You are trapped on a doomed ship with your friends. One of them is lying. Probably more than one.',
  'Do your tasks. Trust nobody. Pet the cat. Vote wisely, or at least loudly.',
  'Black hole outside, liar inside, noodles in the galley. A perfectly normal Tuesday.',
  'Everybody is a suspect and nobody has an alibi. Except the hamster. The hamster is fine.',
  'Meetings, accusations and one deeply suspicious hat. Welcome aboard.',
  'The airlock is always open. The vote is always close. The Parasite is always hungry.',
];
const tagline = () => TAGLINES[Math.floor(Math.random() * TAGLINES.length)];

// the four scripts, in the order the practice screen shows them
const SCRIPT_ORDER = ['classic', 'carnival', 'outbreak', 'traitors'];

// handlers: { launch(mode, name), join(code, name), practice(scriptId, name), publicShips(), profile(), wiki(), settings(), bug() }
export function buildHome(root, handlers) {
  const h = handlers;

  // ---------------- your name ----------------
  const callsign = el('button', { id: 'home-callsign', className: 'nm-callsign', type: 'button', title: 'Change your name', onclick: () => rename() });
  const drawName = () => {
    const n = getCallsign();
    callsign.replaceChildren(el('span', { className: 'cs-av', 'aria-hidden': 'true' }, '🧑‍🚀'), el('span', { className: 'cs-name' }, n || 'Pick a name'), el('span', { className: 'cs-edit' }, n ? 'change' : 'set'));
  };
  async function rename() {
    const n = await askName(getCallsign());
    if (n) {
      setCallsign(n);
      drawName();
    }
  }
  async function ensureName() {
    const n = getCallsign();
    if (n) return n;
    const v = await askName('');
    if (v) {
      setCallsign(v);
      drawName();
    }
    return v;
  }
  drawName();

  // ---------------- launch a ship ----------------
  function openLaunch() {
    let mode = 'autopilot';
    const options = [
      ['autopilot', '🤖', 'Autopilot', 'Everyone plays. ARIA, the ship’s AI, runs the game.'],
      ['captain', '👨‍✈️', 'I’ll be the Captain', 'You run the game from the Command Station and don’t play, like a Blood on the Clocktower Storyteller.'],
    ];
    const cards = options.map(([id, emoji, name, text]) =>
      el(
        'button',
        {
          type: 'button',
          className: `opt ${id === mode ? 'picked' : ''}`,
          role: 'radio',
          'aria-checked': String(id === mode),
          onclick: () => {
            mode = id;
            sfx('select');
            for (const c of cards) {
              const on = c === cardOf[id];
              c.classList.toggle('picked', on);
              c.setAttribute('aria-checked', String(on));
            }
          },
        },
        el('span', { className: 'opt-ico', 'aria-hidden': 'true' }, emoji),
        el('b', {}, name),
        el('small', {}, text),
      ),
    );
    const cardOf = Object.fromEntries(options.map(([id], i) => [id, cards[i]]));
    const go = async () => {
      const name = await ensureName();
      if (!name) return;
      d.close();
      h.launch(mode, name);
    };
    const d = dialog({
      title: 'Launch a new ship',
      body: el('div', {}, el('p', { className: 'muted' }, 'Who runs the game?'), el('div', { className: 'opt-grid', role: 'radiogroup', 'aria-label': 'Who runs the game?' }, ...cards), el('p', { className: 'hint' }, '3–15 players · best with 7+ · voice chat is optional')),
      actions: [btn('Cancel', () => (sfx('back'), d.close()), 'quiet', { dataset: { sfx: 'none' } }), btn('🚀 Launch ship', go, 'go')],
    });
  }

  // ---------------- board a ship ----------------
  function openJoin(prefill = '') {
    const boxes = Array.from({ length: 4 }, (_, i) => el('input', { className: 'code-box', maxLength: 1, inputMode: 'text', autocapitalize: 'characters', autocomplete: 'off', spellcheck: false, 'aria-label': `Ship code, letter ${i + 1}` }));
    const code = () => boxes.map((b) => b.value).join('');
    const go = btn('Board', () => submit(), 'go', { disabled: true });
    const sync = () => {
      go.disabled = code().length < 4;
    };
    // letters typed, pasted or filled in by autocorrect spill across the boxes
    const fill = (text, from = 0) => {
      const letters = text.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4 - from).split('');
      letters.forEach((ch, k) => (boxes[from + k].value = ch));
      boxes[Math.min(3, from + letters.length)].focus();
      sync();
    };
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => {
        const v = b.value.toUpperCase().replace(/[^A-Z]/g, '');
        b.value = '';
        if (v) fill(v, i);
        else sync();
      });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !b.value && i > 0) {
          e.preventDefault();
          boxes[i - 1].value = '';
          boxes[i - 1].focus();
          sync();
        } else if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus();
        else if (e.key === 'ArrowRight' && i < 3) boxes[i + 1].focus();
        else if (e.key === 'Enter') submit();
      });
      b.addEventListener('paste', (e) => {
        e.preventDefault();
        fill((e.clipboardData || window.clipboardData).getData('text'), 0);
      });
    });
    async function submit() {
      if (code().length < 4) {
        sfx('error');
        return;
      }
      const name = await ensureName();
      if (!name) return;
      d.close();
      h.join(code(), name);
    }
    const d = dialog({
      title: 'Board a ship',
      body: el(
        'div',
        {},
        el('p', { className: 'muted' }, 'Type the 4-letter code from your friend (or scan their QR code). No code? Find a game to join.'),
        el('div', { className: 'code-row' }, ...boxes),
        el('button', { type: 'button', className: 'nm-link wide', onclick: () => (d.close(), h.publicShips()) }, '🌐 Browse public ships'),
      ),
      actions: [btn('Cancel', () => (sfx('back'), d.close()), 'quiet', { dataset: { sfx: 'none' } }), go],
    });
    if (prefill) fill(prefill);
    else setTimeout(() => boxes[0].focus(), 60);
  }

  // ---------------- practice: pick a script ----------------
  function openPractice() {
    const scripts = SCRIPT_ORDER.map((id) => store.data?.scripts?.[id]).filter(Boolean);
    const d = dialog({
      title: 'Choose a mission',
      wide: true,
      body: el(
        'div',
        {},
        el('p', { className: 'muted' }, 'You play with robot crewmates. Pick the story you want to learn.'),
        el(
          'div',
          { className: 'mission-grid' },
          ...scripts.map((s) =>
            el(
              'button',
              {
                type: 'button',
                className: `mission m-${s.id}`,
                onclick: async () => {
                  const name = await ensureName();
                  if (!name) return;
                  d.close();
                  h.practice(s.id, name);
                },
              },
              el('span', { className: 'ms-ico', 'aria-hidden': 'true' }, s.icon),
              el('b', { className: 'ms-name' }, s.name),
              el('span', { className: 'ms-tag' }, s.tagline),
              el('span', { className: 'ms-pill' }, '🤖 Play with robots'),
            ),
          ),
        ),
      ),
      actions: [btn('Back', () => (sfx('back'), d.close()), 'quiet', { dataset: { sfx: 'none' } })],
    });
  }

  // ---------------- the menu ----------------
  const menu = menuList([
    { emoji: '🚀', label: 'Launch a ship', sub: 'Host a game and invite your crew', onClick: openLaunch },
    { emoji: '🔑', label: 'Board a ship', sub: 'Join friends with a 4-letter code', onClick: () => openJoin() },
    { emoji: '🤖', label: 'Practice', sub: 'Learn the ropes against robots', onClick: openPractice },
    { id: 'home-public', emoji: '🌐', label: 'Public ships', sub: 'Find a game to join', onClick: () => h.publicShips() },
    { id: 'home-profile', emoji: '👤', label: 'Profile & spacesuit', sub: 'Your stats, unlocks and look', onClick: () => h.profile() },
    { id: 'home-wiki', emoji: '📖', label: 'The Ship’s Wiki', sub: 'Every role and every rule', onClick: () => h.wiki() },
    { id: 'home-settings', emoji: '⚙️', label: 'Settings', sub: 'Sound, text size and graphics', onClick: () => h.settings() },
  ]);

  const logo = el('h1', { className: 'nm-logo' }, el('span', { className: 'l1' }, 'NO MORE'), el('span', { className: 'l2' }, 'SPACE'));
  const music = el('button', { id: 'home-music', className: 'nm-link', type: 'button', title: 'Music on/off' }, '🎵 Music on');
  const bug = el('a', { id: 'home-bug', className: 'nm-link', href: '#', onclick: (e) => (e.preventDefault(), h.bug()) }, '🐞 Report a bug');

  const home = el(
    'div',
    { className: 'nm-home' },
    el('a', { className: 'hub-link', href: '/' }, '← All games'),
    el(
      'div',
      { className: 'nm-col' },
      el('div', { className: 'nm-top' }, logo, el('p', { className: 'nm-tag' }, tagline())),
      callsign,
      menu,
      el('div', { className: 'nm-foot' }, music, bug, el('span', { className: 'nm-count' }, '3–15 players')),
      keyHints([[['↑', '↓'], 'Choose'], [['Enter'], 'Select'], [['Esc'], 'Back']]),
    ),
  );
  root.replaceChildren(home);

  return {
    // the menu slides in and takes the keyboard
    intro() {
      home.classList.add('enter');
      setTimeout(() => menu.focusSelected(), 500);
    },
    openJoin,
    ensureName,
  };
}

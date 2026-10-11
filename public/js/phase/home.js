// Phase to Space: the title screen.
import { el, problem } from '../util.js';
import { iconEl } from '../icons.js';
import { send } from './net.js';
import { cardEl } from './cards.js';
import { btn } from './bits.js';
import { unlock, sfx, soundEnabled, musicEnabled, setSound, setMusic } from './sound.js';
import { openRules, openCodex } from './codex.js';

const NAME_KEY = 'pts-name';

const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
};
const saveName = (n) => {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {}
};

export function buildHome(root) {
  const name = el('input', { id: 'home-name', maxLength: 16, placeholder: 'Captain Biscuit', autocomplete: 'nickname', value: savedName() });
  const code = el('input', { id: 'home-code', className: 'code-input', maxLength: 4, placeholder: 'CODE', autocapitalize: 'characters', autocomplete: 'off', spellcheck: false });
  const myName = () => {
    const n = name.value.trim();
    if (n) saveName(n);
    return n;
  };

  const create = btn('Create a table', { className: 'primary big', icon: 'rocket', onClick: () => {
    unlock();
    send('create', { name: myName() }).then(() => sfx('join')).catch((e) => problem(e.message));
  } });
  const practice = btn('Practice vs robots', { className: 'big', icon: 'robot', onClick: () => {
    unlock();
    send('create', { name: myName() || 'Rookie', practice: true, bots: 3 }).then(() => sfx('join')).catch((e) => problem(e.message));
  } });
  const join = btn('Board', { className: 'big', onClick: () => {
    unlock();
    send('join', { code: code.value, name: myName() }).then(() => sfx('join')).catch((e) => problem(e.message));
  } });
  code.addEventListener('keydown', (e) => e.key === 'Enter' && join.click());
  const params = new URLSearchParams(location.search);
  if (params.get('join')) code.value = params.get('join').toUpperCase().slice(0, 4);

  const soundBtn = btn(soundEnabled() ? 'Sound on' : 'Sound off', { className: 'small ghost', icon: soundEnabled() ? 'speaker' : 'speakerOff', onClick: () => {
    setSound(!soundEnabled());
    unlock();
    soundBtn.replaceChildren(iconEl(soundEnabled() ? 'speaker' : 'speakerOff'), el('span', {}, soundEnabled() ? 'Sound on' : 'Sound off'));
  } });
  const musicBtn = btn(musicEnabled() ? 'Music on' : 'Music off', { className: 'small ghost', icon: 'note', onClick: () => {
    unlock();
    setMusic(!musicEnabled());
    musicBtn.replaceChildren(iconEl('note'), el('span', {}, musicEnabled() ? 'Music on' : 'Music off'));
  } });

  // a handful of real cards drifting at the sides, like the avatars on No More Space's title screen
  const side = (ids, cls) => el('div', { className: `home-fan ${cls}` }, ids.map((id, i) => el('div', { className: 'fan-card', style: { '--i': i } }, cardEl(id, { size: 'lg' }))));

  root.replaceChildren(
    el('a', { className: 'back-link', href: '/' }, iconEl('arrowLeft'), el('span', {}, 'All games')),
    side(['whiskers', 'slab', 'zorp'], 'left'),
    side(['kraken', 'jam', 'karaoke'], 'right'),
    el(
      'div',
      { className: 'home-wrap' },
      el('h1', { className: 'logo' }, 'PHASE', el('span', {}, 'TO SPACE')),
      el('p', { className: 'tagline' }, 'Recruit a crew. Slay the Void. Signal Jam your friends.'),
      el(
        'div',
        { className: 'panel home-card' },
        el('label', {}, 'Your name', name),
        create,
        practice,
        el('div', { className: 'divider' }, el('span', {}, 'or join friends')),
        el('div', { className: 'row' }, code, join),
      ),
      el('p', { className: 'foot' }, '2–6 players · about 15 minutes · robots fill empty seats'),
      el('div', { className: 'home-links' }, btn('How to play', { icon: 'book', className: 'small', onClick: () => openRules() }), btn('Card codex', { icon: 'joker', className: 'small', onClick: () => openCodex() }), soundBtn, musicBtn),
    ),
  );
}

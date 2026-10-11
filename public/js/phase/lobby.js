// Phase to Space: the lobby, while friends arrive.
import { el, problem } from '../util.js';
import { iconEl } from '../icons.js';
import { store, send } from './net.js';
import { btn, classPips } from './bits.js';
import { sfx } from './sound.js';
import { openRules, openCodex } from './codex.js';
import { mountChat } from './chat.js';

let built = null;

export function buildLobby(root, { onLeave }) {
  const code = el('span', { className: 'code', id: 'lobby-code' });
  const qr = el('img', { className: 'lobby-qr', alt: 'QR code: scan to join this table', title: 'Scan with a phone camera to join' });
  const copy = btn('Copy invite link', { className: 'small', icon: 'chains', onClick: () => {
    const url = `${location.origin}/phase?join=${store.state.code}`;
    navigator.clipboard?.writeText(url).then(() => problem('Invite link copied!'), () => prompt('Copy this link:', url));
  } });
  const players = el('ol', { className: 'lobby-players', id: 'lobby-players' });
  const count = el('span', { className: 'muted' });
  const hostBox = el('div', { className: 'lobby-host' });
  const wait = el('div', { className: 'hint' });
  const chat = el('div', { className: 'lobby-chat' });

  root.replaceChildren(
    el(
      'div',
      { className: 'lobby-wrap' },
      el(
        'div',
        { className: 'panel lobby-left' },
        el('div', { className: 'eyebrow' }, 'Docking bay'),
        el('h2', {}, 'Table ', code),
        el('div', { className: 'lobby-invite' }, copy, qr),
        el('p', { className: 'hint' }, 'Share the code or the link. Friends can join from any device, no downloads.'),
        el('h3', {}, 'How to win'),
        el('ul', { className: 'goals' },
          el('li', {}, iconEl('crown'), el('span', {}, 'Build a crew with ', el('b', {}, 'all six disciplines'), ' (your Captain counts)')),
          el('li', {}, iconEl('sword'), el('span', {}, 'or ', el('b', {}, 'slay three Void Beasts'))),
        ),
        classPips(store.data.classIds),
        el('div', { className: 'lobby-actions' }, btn('How to play', { icon: 'book', className: 'small', onClick: () => openRules() }), btn('Card codex', { icon: 'joker', className: 'small', onClick: () => openCodex() })),
      ),
      el(
        'div',
        { className: 'panel lobby-right' },
        el('h3', {}, 'Crew manifest ', count),
        players,
        hostBox,
        wait,
        chat,
        el('button', { className: 'small ghost leave', onclick: onLeave }, 'Leave table'),
      ),
    ),
  );
  built = { code, qr, players, count, hostBox, wait, chat };
  mountChat(chat, { compact: true });
}

export function renderLobby(state) {
  if (!built) return;
  const { code, qr, players, count, hostBox, wait } = built;
  code.textContent = state.code;
  const src = `/qr.svg?code=${state.code}&game=phase`;
  if (qr.getAttribute('src') !== src) qr.src = src;
  const isHost = state.hostId === state.you.id;
  count.textContent = `${state.players.length}/6`;
  players.replaceChildren(
    ...state.players.map((p) =>
      el(
        'li',
        { className: `lp ${p.connected ? '' : 'away'} ${p.id === state.you.id ? 'me' : ''}` },
        el('span', { className: 'av' }, p.avatar),
        el('span', { className: 'name' }, p.name),
        p.isHost ? el('span', { className: 'badge', title: 'Host' }, iconEl('crown'), 'host') : null,
        p.isBot ? el('span', { className: 'badge' }, 'robot') : null,
        p.connected ? null : el('span', { className: 'badge off' }, 'away'),
        isHost && p.id !== state.you.id ? el('button', { className: 'small ghost', title: p.isBot ? 'Remove robot' : 'Remove player', onclick: () => send(p.isBot ? 'remove-bot' : 'kick', { id: p.id }).catch((e) => problem(e.message)) }, iconEl('cross')) : null,
      ),
    ),
  );
  hostBox.replaceChildren();
  if (isHost) {
    const speed = el('select', { onchange: () => send('speed', { speed: speed.value }).catch((e) => problem(e.message)) }, [['chill', 'Chill (long turns)'], ['normal', 'Normal'], ['quick', 'Quick (short timers)']].map(([v, l]) => el('option', { value: v, selected: state.settings.speed === v }, l)));
    hostBox.append(
      btn('Add a robot', { icon: 'robot', className: 'small', disabled: state.players.length >= 6, onClick: () => send('add-bot').then(() => sfx('join')).catch((e) => problem(e.message)) }),
      el('label', { className: 'speed' }, 'Pace', speed),
      btn('Start the game', { icon: 'rocket', className: 'primary big', disabled: state.players.length < 2, onClick: () => send('start').catch((e) => problem(e.message)) }),
    );
  }
  wait.textContent = isHost ? (state.players.length < 2 ? 'Add a robot or wait for a friend: you need at least 2 players.' : 'Ready when you are.') : 'Waiting for the host to start…';
}

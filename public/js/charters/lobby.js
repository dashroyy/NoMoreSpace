// Star Charters: the lobby. The table code big and clear, up to five captains in their colours (open seats show,
// with an Add robot button), the house rules (the host changes them, everyone sees them), a chat, and a big Launch
// button. The demo map keeps building itself behind.
import { problem, toast } from '../util.js';
import { store, send, colourHex } from './net.js';
import { mountChat, renderChat } from './chat.js';
import { sfx } from './sound.js';
import { el, btn, icon } from './ui.js';
import { openRules } from './codex.js';
import { openSettings } from './settings.js';

let refs = null;
let world = null;

const say = (e) => problem(e.message);
const SPEED_TEXT = { chill: '🐢 Chill', normal: '🐇 Normal', quick: '⚡ Quick' };

export function buildLobby(rootEl, { onLeave, world: w }) {
  world = w;
  refs = {
    code: el('div', { className: 'lobby-code', 'aria-label': 'Table code' }),
    qr: el('img', { className: 'qr', alt: 'QR code to join' }),
    qrBox: el('div', { className: 'qr-box', hidden: true }),
    seats: el('div', { className: 'seats' }),
    rules: el('div', { className: 'rules-card' }),
    start: el('div', { className: 'launchbar' }),
    chat: el('div', { className: 'chat' }),
  };
  refs.qrBox.append(refs.qr);
  mountChat(refs.chat);
  const qrBtn = btn(
    icon('qr'),
    () => {
      refs.qrBox.hidden = !refs.qrBox.hidden;
      qrBtn.classList.toggle('on', !refs.qrBox.hidden);
    },
    'icon-btn',
    { title: 'Show a QR code to join', 'aria-label': 'Show a QR code to join' },
  );
  const copyLink = () => {
    const url = `${location.origin}/charters?join=${store.state?.code}`;
    navigator.clipboard?.writeText(url).then(() => toast('Invite link copied!'), () => toast(url));
  };
  rootEl.replaceChildren(
    el(
      'div',
      { className: 'lobby' },
      el(
        'header',
        { className: 'lobby-head' },
        btn([icon('back'), el('span', {}, 'Leave')], onLeave, 'ghost back-btn', { dataset: { sfx: 'back' } }),
        el('h2', { className: 'lobby-title' }, '🧑‍🚀 Mission crew'),
        el('div', { className: 'lobby-head-right' }, btn(icon('book'), () => openRules(), 'icon-btn', { title: 'How to play', 'aria-label': 'How to play' }), btn(icon('sliders'), () => openSettings(), 'icon-btn', { title: 'Settings', 'aria-label': 'Settings' })),
      ),
      el(
        'section',
        { className: 'crew panel' },
        el('div', { className: 'code-card' }, el('div', {}, el('div', { className: 'card-label' }, 'Table code'), refs.code), el('div', { className: 'code-btns' }, btn([icon('copy'), el('span', {}, 'Invite link')], copyLink, 'small gold'), qrBtn)),
        refs.qrBox,
        el('div', { className: 'card-label' }, 'Captains'),
        refs.seats,
      ),
      el('aside', { className: 'lobby-side' }, el('section', { className: 'rules-panel panel' }, refs.rules), el('section', { className: 'chat-panel panel' }, refs.chat)),
      refs.start,
    ),
  );
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || rootEl.hidden || document.querySelector('.dialog-wrap, #layer-modal:not([hidden])')) return;
    onLeave();
  });
}

export function renderLobby(state) {
  if (!refs) return;
  const data = store.data;
  const host = state.hostId === state.you.id;
  const seats = data.maxPlayers;
  refs.code.replaceChildren(...state.code.split('').map((ch, i) => el('span', { style: { '--i': i } }, ch)));
  if (refs.qr.dataset.code !== state.code) {
    refs.qr.dataset.code = state.code;
    refs.qr.src = `/qr.svg?code=${state.code}&game=charters`;
  }

  // ----- the seats
  const seat = (p, i) => {
    if (!p) {
      const next = host && state.players.length < seats && i === state.players.length;
      return el(
        'div',
        { className: `seat empty ${next ? 'next' : ''}`, style: { '--i': i } },
        el('span', { className: 'seat-av' }, '❔'),
        el('span', { className: 'seat-wait' }, i < data.minPlayers ? 'Waiting for a captain…' : 'Empty seat'),
        next ? btn([icon('robot'), el('span', {}, 'Add robot')], () => send('add-bot').catch(say), 'small mint') : null,
      );
    }
    const me = p.id === state.you.id;
    return el(
      'div',
      { className: `seat ${me ? 'me' : ''}`, style: { '--i': i, '--c': colourHex(p.colour) } },
      el('span', { className: 'seat-av' }, p.avatar),
      el('div', { className: 'seat-who' }, el('b', {}, p.name), el('small', {}, `${data.colours.find((c) => c.id === p.colour)?.name || ''} · ${p.isBot ? 'Robot captain' : p.connected ? (me ? 'That’s you!' : 'Ready for launch') : 'Drifted off…'}`)),
      p.id === state.hostId ? el('span', { className: 'badge', title: 'Host' }, '👑 Host') : el('span'),
      host && !me ? btn(icon('close'), () => (p.isBot ? send('remove-bot', { id: p.id }) : send('kick', { id: p.id })).catch(say), 'icon-btn small-icon', { title: p.isBot ? 'Remove robot' : 'Remove player', 'aria-label': p.isBot ? 'Remove robot' : 'Remove player' }) : null,
    );
  };
  refs.seats.replaceChildren(...Array.from({ length: seats }, (_, i) => seat(state.players[i], i)));

  // ----- the house rules
  const s = state.settings;
  const n = state.players.length;
  const seg = (list, on, set, label) => el('div', { className: 'segmented', role: 'radiogroup', 'aria-label': label }, ...list.map(([v, text]) => el('button', { type: 'button', className: `seg ${on === v ? 'on' : ''}`, role: 'radio', 'aria-checked': String(on === v), disabled: !host, onclick: () => (sfx('select'), set(v)) }, text)));
  refs.rules.replaceChildren(
    el('div', { className: 'card-label' }, 'House rules', host ? null : el('span', { className: 'lock-note' }, '🔒 the host picks')),
    el('div', { className: 'rule-row' }, el('div', { className: 'rr-text' }, el('b', {}, '🧩 How long'), el('small', {}, data.lengths.find((l) => l.id === s.length)?.text || '')), seg(data.lengths.map((l) => [l.id, l.name]), s.length, (v) => send('settings', { length: v }).catch(say), 'Game length')),
    el('div', { className: 'rule-row' }, el('div', { className: 'rr-text' }, el('b', {}, '⏱️ Speed'), el('small', {}, 'How long each captain gets for a turn')), seg(data.speeds.map((sp) => [sp, SPEED_TEXT[sp] || sp]), s.speed, (v) => send('settings', { speed: v }).catch(say), 'Speed')),
    el(
      'div',
      { className: 'rule-row inline' },
      el('div', { className: 'rr-text' }, el('b', {}, '✨ Void trawling'), el('small', {}, s.voids ? 'Probes can lie in the void and score for finished stations at the end' : 'Off: no probes in the void (simpler for new captains)')),
      el('button', { type: 'button', className: `switch ${s.voids ? 'on' : ''}`, role: 'switch', 'aria-checked': String(!!s.voids), 'aria-label': 'Void trawling', disabled: !host, onclick: () => (sfx('select'), send('settings', { voids: !s.voids }).catch(say)) }),
    ),
  );

  // ----- the launch bar
  const need = data.minPlayers;
  refs.start.replaceChildren(
    host
      ? el(
          'div',
          { className: 'launch-inner' },
          el('div', { className: 'launch-note' }, n < need ? `You need ${need} captains: add a robot, or share the code!` : `${n} captains ready${n < seats ? ` (room for ${seats - n} more)` : ''}`),
          btn([el('span', {}, n < need ? `Need ${need} captains` : 'Launch!'), icon('play')], () => send('start').catch(say), 'gold big launch', { disabled: n < need, dataset: { sfx: 'none' } }),
        )
      : el('div', { className: 'launch-inner' }, el('div', { className: 'launch-note waiting' }, el('i', { className: 'live-dot' }), 'Waiting for the host to launch…')),
  );

  world.showcase('lobby');
  renderChat(state);
}

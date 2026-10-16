// Star Bonanza: the lobby. The farm code on a big sticker, up to seven farmers (open seats show, with an Add robot
// button), the house rules (the host changes them, everyone sees them), a chat, and a big "Let's farm!" button.
// The space farm keeps circling behind.
import { el, problem, toast } from '../util.js';
import { store, send } from './net.js';
import { mountChat, renderChat } from './chat.js';
import { sfx } from './sound.js';
import { btn, icon } from './ui.js';
import { openRules } from './codex.js';
import { openSettings } from './settings.js';

let refs = null;
let world = null;

const say = (e) => problem(e.message);
const SPEED_TEXT = { chill: '🐢 Chill', normal: '🐇 Normal', quick: '⚡ Quick' };

export function buildLobby(rootEl, { onLeave, world: w }) {
  world = w;
  refs = {
    code: el('div', { className: 'lobby-code', 'aria-label': 'Farm code' }),
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
    const url = `${location.origin}/bonanza?join=${store.state?.code}`;
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
        el('h2', { className: 'lobby-title' }, '🧑‍🌾 Your farm crew'),
        el('div', { className: 'lobby-head-right' }, btn(icon('book'), () => openRules(), 'icon-btn', { title: 'How to play', 'aria-label': 'How to play' }), btn(icon('sliders'), () => openSettings(), 'icon-btn', { title: 'Settings', 'aria-label': 'Settings' })),
      ),
      el(
        'section',
        { className: 'crew panel' },
        el('div', { className: 'code-card' }, el('div', {}, el('div', { className: 'card-label' }, 'Farm code'), refs.code), el('div', { className: 'code-btns' }, btn([icon('copy'), el('span', {}, 'Invite link')], copyLink, 'small sky'), qrBtn)),
        refs.qrBox,
        el('div', { className: 'card-label' }, 'Farmers'),
        refs.seats,
      ),
      el('aside', { className: 'lobby-side' }, el('section', { className: 'rules-panel panel' }, refs.rules), el('section', { className: 'chat-panel panel' }, refs.chat)),
      refs.start,
    ),
  );
  // Escape asks whether to leave (unless something else is open and took the key)
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
    refs.qr.src = `/qr.svg?code=${state.code}&game=bonanza`;
  }

  // ----- the seats
  const seat = (p, i) => {
    if (!p) {
      const next = host && state.players.length < seats && i === state.players.length;
      return el(
        'div',
        { className: `seat empty ${next ? 'next' : ''}`, style: { '--i': i } },
        el('span', { className: 'seat-av' }, '❔'),
        el('span', { className: 'seat-wait' }, i < data.minPlayers ? 'Waiting for a farmer…' : 'Empty seat'),
        next ? btn([icon('robot'), el('span', {}, 'Add robot')], () => send('add-bot').catch(say), 'small mint') : null,
      );
    }
    const me = p.id === state.you.id;
    return el(
      'div',
      { className: `seat ${me ? 'me' : ''}`, style: { '--i': i } },
      el('span', { className: 'seat-av' }, p.avatar),
      el('div', { className: 'seat-who' }, el('b', {}, p.name), el('small', {}, p.isBot ? 'Robot farmer' : p.connected ? (me ? 'That’s you!' : 'Ready to farm') : 'Wandered off…')),
      p.id === state.hostId ? el('span', { className: 'badge', title: 'Host' }, '👑 Host') : null,
      host && !me ? btn(icon('close'), () => (p.isBot ? send('remove-bot', { id: p.id }) : send('kick', { id: p.id })).catch(say), 'icon-btn small-icon', { title: p.isBot ? 'Remove robot' : 'Remove player', 'aria-label': p.isBot ? 'Remove robot' : 'Remove player' }) : null,
    );
  };
  refs.seats.replaceChildren(...Array.from({ length: seats }, (_, i) => seat(state.players[i], i)));

  // ----- the house rules
  const s = state.settings;
  const n = state.players.length;
  const bigGalaxy = s.full || n >= 6;
  const seg = (list, on, set, label) => el('div', { className: 'segmented', role: 'radiogroup', 'aria-label': label }, ...list.map(([v, text]) => el('button', { type: 'button', className: `seg ${on === v ? 'on' : ''}`, role: 'radio', 'aria-checked': String(on === v), disabled: !host, onclick: () => (sfx('select'), set(v)) }, text)));
  refs.rules.replaceChildren(
    el('div', { className: 'card-label' }, 'House rules', host ? null : el('span', { className: 'lock-note' }, '🔒 the host picks')),
    el(
      'div',
      { className: 'rule-row' },
      el('div', { className: 'rr-text' }, el('b', {}, '⏳ How long'), el('small', {}, data.passes.find((p) => p.id === s.passes)?.text || '')),
      seg(data.passes.map((p) => [p.id, p.name]), s.passes, (v) => send('settings', { passes: v }).catch(say), 'Game length'),
    ),
    el(
      'div',
      { className: 'rule-row' },
      el('div', { className: 'rr-text' }, el('b', {}, '⏱️ Speed'), el('small', {}, 'How long everyone gets to plant and trade')),
      seg(data.speeds.map((sp) => [sp, SPEED_TEXT[sp] || sp]), s.speed, (v) => send('settings', { speed: v }).catch(say), 'Speed'),
    ),
    el(
      'div',
      { className: 'rule-row inline' },
      el('div', { className: 'rr-text' }, el('b', {}, `🌌 All ${data.fullSet.length} star buddies`), el('small', {}, n >= 6 ? 'Always on with six or more farmers' : bigGalaxy ? `${data.deck.full} stars in the UFO` : `${data.baseSet.length} kinds and ${data.deck.base} stars: switch on for the Red Dwarfs, Brown Dwarfs and Magnetars`)),
      el('button', { type: 'button', className: `switch ${bigGalaxy ? 'on' : ''}`, role: 'switch', 'aria-checked': String(bigGalaxy), 'aria-label': 'All the star buddies', disabled: !host || n >= 6, onclick: () => (sfx('select'), send('settings', { full: !s.full }).catch(say)) }),
    ),
    el('p', { className: 'rules-note' }, n === 3 ? '🌱 With 3 farmers everyone gets three patches.' : '🌱 Everyone starts with two patches; a third costs 3 coins.'),
  );

  // ----- the launch bar
  const need = data.minPlayers;
  refs.start.replaceChildren(
    host
      ? el(
          'div',
          { className: 'launch-inner' },
          el('div', { className: 'launch-note' }, n < need ? `You need ${need} farmers: add a robot, or share the code!` : `${n} farmers ready${n < seats ? ` (room for ${seats - n} more)` : ''}`),
          btn([el('span', {}, n < need ? `Need ${need} farmers` : 'Let’s farm!'), icon('play')], () => send('start').catch(say), 'gold big launch', { disabled: n < need, dataset: { sfx: 'none' } }),
        )
      : el('div', { className: 'launch-inner' }, el('div', { className: 'launch-note waiting' }, el('i', { className: 'live-dot' }), 'Waiting for the host to start…')),
  );

  world.showcase('lobby');
  renderChat(state);
}

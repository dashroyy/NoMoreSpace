// Star Bonanza: the lobby. The table code to share, up to seven seats (open ones show), the match rules (the host
// edits them, everyone reads them) and a big Launch button. The table runs a demo game in the middle.
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
    const url = `${location.origin}/bonanza?join=${store.state?.code}`;
    sfx('select');
    navigator.clipboard?.writeText(url).then(() => toast('Invite link copied'), () => toast(url));
  };
  rootEl.replaceChildren(
    el(
      'div',
      { className: 'lobby' },
      el(
        'header',
        { className: 'lobby-head' },
        btn([icon('back'), el('span', {}, 'Leave')], onLeave, 'ghost back-btn', { dataset: { sfx: 'back' } }),
        el('div', { className: 'lobby-title' }, el('div', { className: 'eyebrow' }, 'Table lobby'), el('h2', {}, 'Gather your growers')),
        el('div', { className: 'lobby-head-right' }, btn(icon('book'), () => openRules(), 'icon-btn', { title: 'How to play', 'aria-label': 'How to play' }), btn(icon('sliders'), () => openSettings(), 'icon-btn', { title: 'Settings', 'aria-label': 'Settings' })),
      ),
      el(
        'aside',
        { className: 'squad panel' },
        el('div', { className: 'code-card' }, el('div', { className: 'code-main' }, el('div', { className: 'eyebrow' }, 'Table code'), refs.code), el('div', { className: 'code-btns' }, btn([icon('copy'), el('span', {}, 'Invite link')], copyLink, 'small'), qrBtn)),
        refs.qrBox,
        el('div', { className: 'panel-title' }, 'Players'),
        refs.seats,
      ),
      el('aside', { className: 'lobby-right' }, el('div', { className: 'rules-panel panel' }, refs.rules), el('div', { className: 'chat-panel panel' }, refs.chat)),
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
  refs.code.textContent = state.code;
  if (refs.qr.dataset.code !== state.code) {
    refs.qr.dataset.code = state.code;
    refs.qr.src = `/qr.svg?code=${state.code}&game=bonanza`;
  }

  // ----- the seats
  const seat = (p, i) => {
    if (!p) {
      return el(
        'div',
        { className: 'seat empty', style: { '--i': i } },
        el('span', { className: 'seat-no' }, `${i + 1}`),
        el('span', { className: 'seat-wait' }, i < data.minPlayers ? 'Waiting for a player…' : 'Open seat'),
        host && state.players.length < seats && i === state.players.length ? btn([icon('robot'), el('span', {}, 'Add robot')], () => send('add-bot').catch(say), 'small') : null,
      );
    }
    return el(
      'div',
      { className: `seat ${p.id === state.you.id ? 'me' : ''}`, style: { '--c': '#ffd36b', '--i': i } },
      el('span', { className: 'seat-no' }, `${i + 1}`),
      el('span', { className: 'seat-av' }, p.avatar),
      el('div', { className: 'seat-who' }, el('b', {}, p.name, p.id === state.you.id ? el('small', { className: 'you' }, 'YOU') : null), el('span', {}, p.isBot ? 'Robot' : p.connected ? 'Ready' : 'Away')),
      p.id === state.hostId ? el('span', { className: 'badge gold', title: 'Host' }, icon('check'), 'Host') : null,
      host && p.id !== state.you.id
        ? btn(icon('close'), () => (p.isBot ? send('remove-bot', { id: p.id }) : send('kick', { id: p.id })).catch(say), 'icon-btn small-icon', { title: p.isBot ? 'Remove robot' : 'Remove player', 'aria-label': p.isBot ? 'Remove robot' : 'Remove player' })
        : null,
    );
  };
  refs.seats.replaceChildren(...Array.from({ length: seats }, (_, i) => seat(state.players[i], i)));

  // ----- the rules
  const s = state.settings;
  const lock = host ? null : el('span', { className: 'lock-note' }, icon('lock'), 'The host sets these');
  const n = state.players.length;
  const bigGalaxy = s.full || n >= 6;
  refs.rules.replaceChildren(
    el('div', { className: 'panel-title' }, 'Match rules', lock),
    el(
      'div',
      { className: 'rule-row target' },
      el('span', { className: 'rr-glyph' }, '⏳'),
      el('div', { className: 'rr-text' }, el('b', {}, 'Game length'), el('small', {}, data.passes.find((p) => p.id === s.passes)?.text || '')),
      el('div', { className: 'segmented', role: 'radiogroup', 'aria-label': 'Game length' }, ...data.passes.map((p) => el('button', { type: 'button', className: `seg ${s.passes === p.id ? 'on' : ''}`, role: 'radio', 'aria-checked': String(s.passes === p.id), disabled: !host, onclick: () => (sfx('select'), send('settings', { passes: p.id }).catch(say)) }, p.name))),
    ),
    el(
      'div',
      { className: 'rule-row target' },
      el('span', { className: 'rr-glyph' }, '⏱️'),
      el('div', { className: 'rr-text' }, el('b', {}, 'Speed'), el('small', {}, 'How long people get to plant and trade')),
      el('div', { className: 'segmented', role: 'radiogroup', 'aria-label': 'Speed' }, ...data.speeds.map((sp) => el('button', { type: 'button', className: `seg ${s.speed === sp ? 'on' : ''}`, role: 'radio', 'aria-checked': String(s.speed === sp), disabled: !host, onclick: () => (sfx('select'), send('settings', { speed: sp }).catch(say)) }, sp[0].toUpperCase() + sp.slice(1)))),
    ),
    el(
      'div',
      { className: `rule-row ${host ? '' : 'locked'}` },
      el('span', { className: 'rr-glyph' }, '🌌'),
      el('div', { className: 'rr-text' }, el('b', {}, 'Full galaxy'), el('small', {}, n >= 6 ? 'Six or more players always use all 11 kinds' : bigGalaxy ? 'All 11 kinds, 154 stars' : '8 kinds and 104 stars: switch on for all 11')),
      el('button', {
        type: 'button',
        className: `switch ${bigGalaxy ? 'on' : ''}`,
        role: 'switch',
        'aria-checked': String(bigGalaxy),
        'aria-label': 'Full galaxy',
        disabled: !host || n >= 6,
        onclick: () => (sfx('select'), send('settings', { full: !s.full }).catch(say)),
      }),
    ),
    el('p', { className: 'muted rules-note' }, `${n === 3 ? 'With 3 players everyone gets three nurseries.' : 'Everyone starts with two nurseries; a third costs 3 lumens.'}`),
  );

  // ----- the launch bar
  const need = data.minPlayers;
  refs.start.replaceChildren(
    host
      ? el(
          'div',
          { className: 'launch-inner' },
          el('div', { className: 'launch-note' }, n < need ? `You need at least ${need} players: add a robot, or share the code.` : `${n} players ready${n < seats ? `: add up to ${seats - n} more` : ''}`),
          btn([icon('play'), el('span', {}, n < need ? `Need ${need} players` : `Launch with ${n}`)], () => (sfx('start'), send('start').catch(say)), 'gold big launch', { disabled: n < need, dataset: { sfx: 'none' } }),
        )
      : el('div', { className: 'launch-inner' }, el('div', { className: 'launch-note waiting' }, el('i', { className: 'live-dot' }), 'Waiting for the host to launch…')),
  );

  world.showcase('lobby');
  renderChat(state);
}

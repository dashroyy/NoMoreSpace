// Ruler of the Galaxy: the lobby. A squad room: the galaxy code to share, six seats (open ones show), your
// contender with a Change button (which opens the contender select), the match rules (the host edits them, everyone
// reads them) and a big Launch button. The 3D ring of contenders turns in the middle.
import { el, problem, toast } from '../util.js';
import { store, send, contender } from './net.js';
import { mountChat, renderChat } from './chat.js';
import { sfx } from './sound.js';
import { btn, icon } from './ui.js';
import { contenderSelect, shortName, roleOf } from './select.js';
import { openRules } from './codex.js';
import { openSettings } from './settings.js';

const SEATS = 6;
let refs = null;
let world = null;
let root = null;
let selectUi = null;
let focus = null; // the contender the camera is looking at while the select screen is open
let lastTaken = {};

const say = (e) => problem(e.message);

export function buildLobby(rootEl, { onLeave, world: w }) {
  world = w;
  root = rootEl;
  refs = {
    code: el('div', { className: 'lobby-code', 'aria-label': 'Galaxy code' }),
    qr: el('img', { className: 'qr', alt: 'QR code to join' }),
    qrBox: el('div', { className: 'qr-box', hidden: true }),
    seats: el('div', { className: 'seats' }),
    you: el('div', { className: 'you-card' }),
    rules: el('div', { className: 'rules-card' }),
    start: el('div', { className: 'launchbar' }),
    chat: el('div', { className: 'chat' }),
  };
  refs.qrBox.append(refs.qr);
  mountChat(refs.chat);
  const qrBtn = btn(icon('qr'), () => {
    refs.qrBox.hidden = !refs.qrBox.hidden;
    qrBtn.classList.toggle('on', !refs.qrBox.hidden);
  }, 'icon-btn', { title: 'Show a QR code to join', 'aria-label': 'Show a QR code to join' });
  root.replaceChildren(
    el(
      'div',
      { className: 'lobby' },
      el(
        'header',
        { className: 'lobby-head' },
        btn([icon('back'), el('span', {}, 'Leave')], onLeave, 'ghost back-btn', { dataset: { sfx: 'back' } }),
        el('div', { className: 'lobby-title' }, el('div', { className: 'eyebrow' }, 'Galaxy lobby'), el('h2', {}, 'Assemble your fleet')),
        el('div', { className: 'lobby-head-right' }, btn(icon('book'), () => openRules(), 'icon-btn', { title: 'How to play', 'aria-label': 'How to play' }), btn(icon('sliders'), () => openSettings(), 'icon-btn', { title: 'Settings', 'aria-label': 'Settings' })),
      ),
      el(
        'aside',
        { className: 'squad panel' },
        el(
          'div',
          { className: 'code-card' },
          el('div', { className: 'code-main' }, el('div', { className: 'eyebrow' }, 'Galaxy code'), refs.code),
          el('div', { className: 'code-btns' }, btn([icon('copy'), el('span', {}, 'Invite link')], copyLink, 'small'), qrBtn),
        ),
        refs.qrBox,
        el('div', { className: 'panel-title' }, 'Fleet'),
        refs.seats,
        refs.you,
      ),
      el('aside', { className: 'lobby-right' }, el('div', { className: 'rules-panel panel' }, refs.rules), el('div', { className: 'chat-panel panel' }, refs.chat)),
      refs.start,
    ),
  );
  // Escape asks whether to leave (unless something else is open and took the key)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || root.hidden || selectUi || document.querySelector('.dialog-wrap, #layer-modal:not([hidden])')) return;
    onLeave();
  });
}

function copyLink() {
  const url = `${location.origin}/ruler?join=${store.state?.code}`;
  sfx('select');
  navigator.clipboard?.writeText(url).then(() => toast('Invite link copied'), () => toast(url));
}

function closeSelect() {
  selectUi?.destroy();
  selectUi = null;
  focus = null;
  root.classList.remove('selecting');
  if (store.state) renderLobby(store.state);
}

function openSelect(state) {
  const me = state.players.find((p) => p.id === state.you.id);
  root.classList.add('selecting');
  selectUi = contenderSelect({
    current: me?.contender || null,
    taken: lastTaken,
    onBrowse: (id) => {
      focus = id;
      world.showcase(id, lastTaken, { focus: id });
    },
    onConfirm: (id) => {
      send('choose', { contender: id }).catch(say);
      closeSelect();
    },
    onBack: closeSelect,
  });
  root.append(selectUi.root);
}

export function renderLobby(state) {
  if (!refs) return;
  const me = state.players.find((p) => p.id === state.you.id);
  const host = state.hostId === state.you.id;
  refs.code.textContent = state.code;
  if (refs.qr.dataset.code !== state.code) {
    refs.qr.dataset.code = state.code;
    refs.qr.src = `/qr.svg?code=${state.code}&game=ruler`;
  }
  // who has which contender (robots do not hold one until the launch)
  lastTaken = Object.fromEntries(state.players.filter((p) => p.contender && p.id !== state.you.id && !p.isBot).map((p) => [p.contender, p.name]));
  selectUi?.update({ taken: lastTaken });

  // ----- the six seats
  const seat = (p, i) => {
    if (!p) {
      return el(
        'div',
        { className: 'seat empty', style: { '--i': i } },
        el('span', { className: 'seat-no' }, `${i + 1}`),
        el('span', { className: 'seat-wait' }, i < 2 ? 'Waiting for a pilot…' : 'Open seat'),
        host && state.players.length < SEATS && i === state.players.length ? btn([icon('robot'), el('span', {}, 'Add robot')], () => send('add-bot').catch(say), 'small') : null,
      );
    }
    const c = contender(p.contender);
    return el(
      'div',
      { className: `seat ${p.id === state.you.id ? 'me' : ''}`, style: { '--c': c?.color || '#5a6496', '--i': i } },
      el('span', { className: 'seat-no' }, `${i + 1}`),
      el('span', { className: 'seat-av' }, p.avatar),
      el('div', { className: 'seat-who' }, el('b', {}, p.name, p.id === state.you.id ? el('small', { className: 'you' }, 'YOU') : null), el('span', {}, c ? `${c.art} ${c.name}` : p.isBot ? 'Picks at the launch' : 'Choosing…')),
      p.isHost ? el('span', { className: 'badge gold', title: 'Host' }, icon('check'), 'Host') : null,
      p.isBot ? el('span', { className: 'badge' }, 'Robot') : null,
      host && p.id !== state.you.id
        ? btn(icon('close'), () => (p.isBot ? send('remove-bot', { id: p.id }) : send('kick', { id: p.id })).catch(say), 'icon-btn small-icon', { title: p.isBot ? 'Remove robot' : 'Remove player', 'aria-label': p.isBot ? 'Remove robot' : 'Remove player' })
        : null,
    );
  };
  refs.seats.replaceChildren(...Array.from({ length: SEATS }, (_, i) => seat(state.players[i], i)));

  // ----- your contender
  const mine = contender(me?.contender);
  refs.you.replaceChildren(
    mine
      ? el(
          'div',
          { className: 'you-pick', style: { '--c': mine.color } },
          el('span', { className: 'yp-art' }, mine.art),
          el('div', { className: 'yp-text' }, el('div', { className: 'yp-role' }, roleOf(mine)), el('b', {}, mine.name), el('small', {}, mine.perk.name)),
          btn('Change', () => openSelect(store.state), 'small', { dataset: { sfx: 'none' } }),
        )
      : btn([icon('users'), el('span', {}, 'Choose your contender')], () => openSelect(store.state), 'gold big pulse', { dataset: { sfx: 'none' } }),
  );

  // ----- the rules
  const s = state.settings;
  const lock = host ? null : el('span', { className: 'lock-note' }, icon('lock'), 'The host sets these');
  const toggle = (key, glyph, label, hint) => {
    const sw = el('button', {
      type: 'button',
      className: `switch ${s[key] ? 'on' : ''}`,
      role: 'switch',
      'aria-checked': String(!!s[key]),
      'aria-label': label,
      disabled: !host,
      onclick: () => {
        sfx('select');
        send('settings', { [key]: !s[key] }).catch(say);
      },
    });
    return el('div', { className: `rule-row ${host ? '' : 'locked'}` }, el('span', { className: 'rr-glyph' }, glyph), el('div', { className: 'rr-text' }, el('b', {}, label), el('small', {}, hint)), sw);
  };
  refs.rules.replaceChildren(
    el('div', { className: 'panel-title' }, 'Match rules', lock),
    el(
      'div',
      { className: 'rule-row target' },
      el('span', { className: 'rr-glyph' }, '★'),
      el('div', { className: 'rr-text' }, el('b', {}, 'Stars to win'), el('small', {}, s.blitz ? 'Blitz sets it to 15' : 'First to rule the galaxy')),
      el('div', { className: 'segmented', role: 'radiogroup', 'aria-label': 'Stars to win' }, ...store.data.targets.map((n) => el('button', { type: 'button', className: `seg ${(s.blitz ? 15 : s.target) === n ? 'on' : ''}`, role: 'radio', 'aria-checked': String((s.blitz ? 15 : s.target) === n), disabled: !host || s.blitz, onclick: () => (sfx('select'), send('settings', { target: n }).catch(say)) }, `${n}`))),
    ),
    toggle('evolutions', '🧬', 'Evolutions', 'Three Repairs unlock a mutation'),
    toggle('anomalies', '🌀', 'Cosmic anomalies', 'Every third round, a twist'),
    toggle('ghosts', '👻', 'Ghost ships', 'The destroyed keep haunting'),
    toggle('blitz', '⚡', 'Blitz', '15 Stars, 8 Hull, quick timers'),
  );

  // ----- the launch bar
  const n = state.players.length;
  refs.start.replaceChildren(
    host
      ? el(
          'div',
          { className: 'launch-inner' },
          el('div', { className: 'launch-note' }, n < 2 ? 'You need at least 2 pilots: add a robot, or share the code.' : `${n} pilots ready${n < SEATS ? `: add up to ${SEATS - n} more` : ''}`),
          btn([icon('play'), el('span', {}, n < 2 ? 'Need 2 pilots' : `Launch with ${n}`)], () => (sfx('start'), send('start').catch(say)), 'gold big launch', { disabled: n < 2, dataset: { sfx: 'none' } }),
        )
      : el('div', { className: 'launch-inner' }, el('div', { className: 'launch-note waiting' }, el('i', { className: 'live-dot' }), 'Waiting for the host to launch…')),
  );

  // the camera: the whole ring, or the contender being looked at on the select screen
  world.showcase(me?.contender || null, lastTaken, focus ? { focus } : { view: 'lobby' });
  renderChat(state);
}

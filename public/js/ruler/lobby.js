// Ruler of the Galaxy: the lobby. Share the code, everyone picks a contender, the host sets the rules and starts.
import { el, problem, toast } from '../util.js';
import { store, send, contender } from './net.js';
import { contenderCard } from './home.js';
import { mountChat, renderChat } from './chat.js';
import { sfx } from './sound.js';

let refs = null;
let world = null;

export function buildLobby(root, { onLeave, world: w }) {
  world = w;
  refs = {
    code: el('div', { className: 'lobby-code' }),
    qr: el('img', { className: 'qr', alt: 'QR code to join' }),
    players: el('div', { className: 'lobby-players' }),
    grid: el('div', { className: 'c-grid' }),
    settings: el('div', { className: 'lobby-settings' }),
    start: el('div', { className: 'lobby-start' }),
    chat: el('div', { className: 'chat' }),
  };
  mountChat(refs.chat);
  root.replaceChildren(
    el(
      'div',
      { className: 'lobby' },
      el(
        'div',
        { className: 'lobby-main panel' },
        el('div', { className: 'lobby-top' }, el('div', {}, el('div', { className: 'eyebrow' }, 'Galaxy code'), refs.code, el('button', { className: 'small', onclick: copyLink }, '🔗 Copy invite link')), refs.qr),
        el('h3', {}, 'Contenders'),
        refs.players,
        el('h3', {}, 'Choose your contender'),
        refs.grid,
        refs.settings,
        refs.start,
        el('button', { className: 'link', onclick: onLeave }, '← Leave'),
      ),
      el('aside', { className: 'lobby-side panel' }, refs.chat),
    ),
  );
}

function copyLink() {
  const url = `${location.origin}/ruler?join=${store.state?.code}`;
  navigator.clipboard?.writeText(url).then(() => toast('Invite link copied!'), () => toast(url));
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
  refs.players.replaceChildren(
    ...state.players.map((p) => {
      const c = contender(p.contender);
      return el(
        'div',
        { className: 'lp-row', style: { '--c': c?.color || '#5a6496' } },
        el('span', { className: 'av' }, p.avatar),
        el('b', {}, p.name),
        p.isHost ? el('span', { className: 'badge gold' }, '👑 host') : null,
        p.isBot ? el('span', { className: 'badge' }, 'robot') : null,
        el('span', { className: 'lp-c' }, c ? `${c.art} ${c.name}` : p.isBot ? 'picks at the start' : 'choosing…'),
        host && p.isBot ? el('button', { className: 'icon-btn', title: 'Remove robot', onclick: () => send('remove-bot', { id: p.id }).catch((e) => problem(e.message)) }, '✕') : null,
      );
    }),
  );
  const taken = Object.fromEntries(state.players.filter((p) => p.contender && p.id !== state.you.id).map((p) => [p.contender, p.name]));
  refs.grid.replaceChildren(
    ...store.data.contenders.map((c) =>
      contenderCard(c, {
        picked: me?.contender === c.id,
        taken: taken[c.id] && !state.players.find((p) => p.contender === c.id)?.isBot ? taken[c.id] : '',
        onPick: (id) => {
          sfx('keep');
          send('choose', { contender: me?.contender === id ? null : id }).catch((e) => problem(e.message));
        },
      }),
    ),
  );
  world.showcase(me?.contender || null, taken);

  const s = state.settings;
  const toggle = (key, label, hint) =>
    el('label', { className: `toggle ${host ? '' : 'locked'}`, title: hint }, el('input', { type: 'checkbox', checked: !!s[key], disabled: !host, onchange: (e) => send('settings', { [key]: e.target.checked }).catch((err) => problem(err.message)) }), el('span', {}, label), el('small', {}, hint));
  refs.settings.replaceChildren(
    el('h3', {}, host ? 'Rules (you are the host)' : 'Rules'),
    el(
      'div',
      { className: 'target-row' },
      el('span', {}, 'Stars to win'),
      ...store.data.targets.map((n) => el('button', { className: `small ${s.target === n && !s.blitz ? 'on' : ''}`, disabled: !host || s.blitz, onclick: () => send('settings', { target: n }).catch((e) => problem(e.message)) }, `${n}`)),
    ),
    el(
      'div',
      { className: 'toggles' },
      toggle('evolutions', '🧬 Evolutions', 'Three Repairs unlock a mutation for your contender'),
      toggle('anomalies', '🌀 Cosmic anomalies', 'Every third round, a twist to the rules'),
      toggle('ghosts', '👻 Ghost ships', 'Destroyed players keep haunting the galaxy'),
      toggle('blitz', '⚡ Blitz', '15 Stars, 8 Hull, 3 Dark Matter to start, quick timers'),
    ),
  );
  const n = state.players.length;
  refs.start.replaceChildren(
    host ? el('button', { className: 'small', disabled: n >= 6, onclick: () => send('add-bot').catch((e) => problem(e.message)) }, '🤖 Add a robot') : null,
    host ? el('button', { className: 'big primary', disabled: n < 2, onclick: () => send('start').catch((e) => problem(e.message)) }, n < 2 ? 'Need 2 contenders' : `🚀 Launch (${n} contenders)`) : el('span', { className: 'muted' }, 'Waiting for the host to launch…'),
  );
  renderChat(state);
}

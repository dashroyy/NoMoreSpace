// ⚡ Ship systems: each role's once-per-game online ability (see roles.js
// `system`). This file draws the button and its picker, and keeps the 3D
// world in step with disguises, blackouts and sealed rooms.
import { $, el, clear, problem } from '../util.js';
import { store, send, serverNow, isCaptain, role } from '../store.js';
import { sfx } from '../audio.js';
import { ROOMS } from '../world/layout.js';
import { ROOM_ICONS } from './rooms.js';

let world = null;
let spoofTarget = null;

export function initSystems(w) {
  world = w;
  $('btn-system').addEventListener('click', () => toggleMenu());
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select') || $('hud').hidden) return;
    if (e.key === 'x' || e.key === 'X') toggleMenu();
  });
  setInterval(syncWorld, 400);
}

// The ship system this player can use right now, if any.
export function mySystem(state = store.state) {
  const you = state?.you;
  if (!you?.system || you.system.used || !you.alive || isCaptain()) return null;
  const sys = role(you.role)?.system;
  return sys && sys.phases.includes(state.phase) ? sys : null;
}

// Live effects, with expiry worked out on this side so they end on time.
export function liveSystems(state = store.state) {
  const s = state?.systems || {};
  const now = serverNow();
  return {
    disguise: Object.fromEntries((s.disguises || []).filter((d) => d.until > now).map((d) => [d.id, d.as])),
    blackout: (s.blackoutUntil || 0) > now,
    lockdowns: (s.lockdowns || []).filter((l) => l.until > now).map(({ room, allowed, until, private: isPrivate }) => ({ room, allowed, until, private: !!isPrivate })),
  };
}

function syncWorld() {
  if (!world || !store.state) return;
  const live = liveSystems();
  world.setSystems(live);
  document.body.classList.toggle('blackout', live.blackout);
  const sys = mySystem();
  const btn = $('btn-system');
  btn.hidden = !sys;
  if (sys) {
    btn.querySelector('span').textContent = sys.icon;
    btn.querySelector('b').textContent = sys.name;
    btn.title = sys.text;
  } else {
    $('system-menu').hidden = true;
  }
  const you = store.state.you;
  const ear = you?.intercepting && you.intercepting.until > serverNow() ? you.intercepting : null;
  const tag = $('intercept-tag');
  tag.hidden = !ear;
  if (ear) tag.textContent = `🎧 Listening to ${ROOMS.find((r) => r.id === ear.room)?.name} · ${Math.ceil((ear.until - serverNow()) / 1000)}s`;
}

function toggleMenu(open = $('system-menu').hidden) {
  const sys = mySystem();
  $('system-menu').hidden = !open || !sys;
  if (!$('system-menu').hidden) renderMenu(sys);
}

function use(args, label) {
  send('system', args)
    .then(() => {
      sfx('chime');
      $('system-menu').hidden = true;
      if (label) problem(label); // reuse the little banner as feedback
    })
    .catch((e) => problem(e.message));
}

function renderMenu(sys) {
  const menu = $('system-menu');
  const state = store.state;
  const me = state.you.id;
  const others = state.players.filter((p) => p.id !== me && (p.alive || sys.target === 'spoof'));
  const head = el('div', { className: 'rooms-head' },
    el('b', {}, `${sys.icon} ${sys.name}`),
    el('button', { className: 'small ghost', onclick: () => toggleMenu(false) }, '✕'),
  );
  const body = [el('div', { className: 'hint' }, sys.text, ' ', el('b', {}, 'One use per game.'))];
  if (sys.target === 'room') {
    body.push(el('div', { className: 'room-list' }, ...ROOMS.map((r) =>
      el('button', { className: 'room-row', onclick: () => use({ room: r.id }) },
        el('span', { className: 'room-ico' }, ROOM_ICONS[r.id]), el('span', { className: 'room-main' }, el('b', {}, r.name)), el('span', { className: 'room-go' }, `${sys.icon} Use`)),
    )));
  } else if (sys.target === 'player') {
    body.push(el('div', { className: 'room-list' }, ...others.map((p) =>
      el('button', { className: 'room-row', onclick: () => use({ target: p.id }) },
        el('span', { className: 'room-ico' }, '🧑‍🚀'), el('span', { className: 'room-main' }, el('b', {}, p.name)), el('span', { className: 'room-go' }, `${sys.icon} Use`)),
    )));
  } else if (sys.target === 'spoof') {
    const input = el('input', { maxLength: 200, placeholder: spoofTarget ? `Type as ${state.players.find((p) => p.id === spoofTarget)?.name}…` : 'Pick who to pretend to be first', disabled: !spoofTarget });
    body.push(
      el('div', { className: 'pick-row' }, ...others.map((p) =>
        el('button', { className: `small ${spoofTarget === p.id ? 'primary' : ''}`, onclick: () => { spoofTarget = p.id; renderMenu(sys); } }, p.name),
      )),
      el('form', { className: 'chat-form', onsubmit: (e) => { e.preventDefault(); use({ target: spoofTarget, text: input.value }); } },
        input,
        el('button', { className: 'primary small', type: 'submit', disabled: !spoofTarget }, '👾 Send'),
      ),
      el('div', { className: 'hint' }, state.phase === 'meeting' ? 'In the meeting, everyone sees it.' : 'Only people who can hear you right now see it.'),
    );
  } else {
    const here = ROOMS.find((r) => r.id === world.room);
    const label = sys.target === 'here' ? (here ? `${sys.icon} Seal ${here.name}` : 'Stand in a room first') : `${sys.icon} ${sys.name} now`;
    body.push(el('button', { className: 'primary', disabled: sys.target === 'here' && !here, onclick: () => use({}) }, label));
  }
  clear(menu, head, ...body);
  menu.querySelector('input')?.focus();
}

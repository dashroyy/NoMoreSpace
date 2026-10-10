// Rooms: see who is where, teleport between rooms, and know who can hear
// you. Proximity chat only reaches people in the same room (or standing
// close by), so this is how players find each other for a private chat.
import { $, el, clear, problem } from '../util.js';
import { store, isCaptain, suitHex } from '../store.js';
import { sfx } from '../audio.js';
import { ROOMS } from '../world/layout.js';
import { systemLine } from './chat.js';
import { askToWhisper } from './social.js';

export const ROOM_ICONS = {
  bridge: '🛸', observation: '🔭', navigation: '🧭', comms: '📡', medbay: '🩺', galley: '🍜',
  reactor: '☢️', engine: '🔥', hydroponics: '🌱', airlock: '🚪', quarters: '🛏️', cargo: '📦', corridor: '🚶',
};

let world = null;
let lastWho = '';

export function initRooms(w) {
  world = w;
  $('btn-rooms').addEventListener('click', () => toggleRooms());
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select') || $('hud').hidden) return;
    if (e.key === 'm' || e.key === 'M') toggleRooms();
    if (e.key === 'Escape') toggleRooms(false);
  });
  setInterval(update, 400);
}

export function canTeleport() {
  const s = store.state;
  return !!s && !isCaptain() && (s.phase === 'roam' || s.phase === 'lobby');
}

export function toggleRooms(open = $('rooms-menu').hidden) {
  $('rooms-menu').hidden = !open || !canTeleport();
  if (!$('rooms-menu').hidden) renderRooms(true);
}

export function teleportTo(roomId) {
  if (!canTeleport()) return;
  if (world.room === roomId) return;
  const why = world.teleport(roomId);
  if (why) return problem(why);
  sfx('whoosh');
  const room = ROOMS.find((r) => r.id === roomId);
  const others = world.hearers().map(name);
  systemLine(`🚀 Teleported to ${room.name}.${others.length ? ` ${others.join(', ')} can hear you here.` : ' Nobody is here yet.'}`);
  $('rooms-menu').hidden = true;
}

// Who someone looks like right now (the Mimic can wear another player's face).
function shownAs(id) {
  const as = world?.disguise?.[id] || id;
  return store.state?.players.find((p) => p.id === as);
}

function name(id) {
  return world?.phantomName(id) || shownAs(id)?.name || '?';
}

// Group everyone by the room they're in.
function occupants() {
  const out = {};
  for (const [id, p] of Object.entries(world.whereabouts())) (out[p.room] ||= []).push(id);
  return out;
}

let lastKey = '';
function renderRooms(force = false) {
  const menu = $('rooms-menu');
  if (menu.hidden) return;
  const who = occupants();
  const me = store.state?.you?.id;
  // only rebuild when something changed, so a click never lands on a stale button
  const key = JSON.stringify([world.room, who, store.state?.players.map((p) => [p.name, p.alive]), world.systemsKey]);
  if (key === lastKey && !force) return;
  lastKey = key;
  const players = store.state?.players || [];
  const chip = (id) => {
    const p = shownAs(id);
    const ph = world.whereabouts()[id]?.phantom;
    const color = p ? suitHex(p) : ph ? store.data.suits[ph.avatar.look.suit] || '#ccc' : '#ccc';
    return el('span', { className: `who-chip ${id === me ? 'me' : ''} ${p && !p.alive ? 'ghost' : ''}` }, el('i', { style: { background: color } }), id === me ? 'You' : name(id));
  };
  const rows = ROOMS.map((r) => {
    const here = world.room === r.id;
    const list = world.blackout ? [] : who[r.id] || [];
    const sealed = world.lockedOut(r.id);
    return el('button', { className: `room-row ${here ? 'here' : ''} ${list.some((id) => id !== me) ? 'busy' : ''} ${sealed ? 'sealed' : ''}`, disabled: here || sealed, onclick: () => teleportTo(r.id) },
      el('span', { className: 'room-ico' }, ROOM_ICONS[r.id] || '🚪'),
      el('span', { className: 'room-main' },
        el('b', {}, r.name),
        el('span', { className: 'room-who' }, ...(world.blackout ? [el('em', {}, '📡 sensors offline')] : list.length ? list.map(chip) : [el('em', {}, 'empty')])),
      ),
      el('span', { className: 'room-go' }, here ? 'You are here' : sealed ? (world.lockOf(r.id)?.private ? '🔒 Locked' : '🔐 Sealed') : '🚀 Go'),
    );
  });
  const walking = world.blackout ? [] : (who.corridor || []).filter((id) => id !== me);
  clear(menu,
    el('div', { className: 'rooms-head' },
      el('b', {}, '🚀 Teleport to a room'),
      el('button', { className: 'small ghost', onclick: () => toggleRooms(false) }, '✕'),
    ),
    el('div', { className: 'hint' }, 'Only people in the same room can hear your chat. Pick a room to join someone, or meet in an empty one.'),
    el('div', { className: 'room-list' }, ...rows),
    whisperRow(me),
    walking.length ? el('div', { className: 'hint' }, `🚶 In the corridors: ${walking.map(name).join(', ')}`) : null,
  );
}

// The line above the chat box: who will hear what you type.
function whoText() {
  const s = store.state;
  if (!s) return '';
  if (isCaptain()) return '📢 Captain: everyone hears you';
  if (s.phase === 'night') return '';
  if (s.phase === 'roam') {
    const hear = world.hearers();
    const room = ROOMS.find((r) => r.id === world.room);
    const where = room ? `${ROOM_ICONS[room.id]} ${room.name}` : '🚶 Corridor';
    if (world.blackout) return `${where} · 🌑 Blackout! You can't see who is listening`;
    if (!hear.length) return `${where} · 🔇 Nobody can hear you · press M to teleport to someone`;
    return `${where} · 🔒 Private chat with ${hear.map(name).join(', ')}`;
  }
  if (s.phase === 'lobby' || s.phase === 'ended') return '📢 Everyone on the ship hears you';
  return '📢 Everyone at the bridge table hears you';
}

function update() {
  if (!world || !store.state) return;
  const s = store.state;
  $('btn-rooms').hidden = !(s.phase === 'roam' && !isCaptain());
  if (!canTeleport()) $('rooms-menu').hidden = true;
  renderRooms();
  const text = whoText();
  if (text !== lastWho) {
    lastWho = text;
    const box = $('chat-who');
    box.textContent = text;
    box.hidden = !text;
    box.classList.toggle('alone', text.includes('Nobody'));
  }
}

// 💬 Ask someone for a private chat: if they accept, you're both beamed into an empty room.
function whisperRow(me) {
  const others = (store.state?.players || []).filter((p) => p.id !== me);
  if (!others.length) return null;
  return el('div', {},
    el('div', { className: 'hint' }, '💬 Or ask someone for a private chat. If they say yes, you are both beamed into an empty room:'),
    el('div', { className: 'pick-row' }, ...others.map((p) => el('button', { className: 'small', onclick: () => askToWhisper(p.id) }, `💬 ${p.name}${p.alive ? '' : ' 👻'}`))),
  );
}

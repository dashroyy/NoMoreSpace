// 🔒 Doors: lock the room you are talking in so nobody walks in or listens at
// the door; knock on a locked door; let knockers in. One button (and the K key)
// that does whichever of those makes sense where you are standing.
// (The rules live in engine.js, lockRoom. The server checks everything.)
import { $, el, clear, problem, toast, formatTime } from '../util.js';
import { store, send, socket, isCaptain, serverNow } from '../store.js';
import { sfx } from '../audio.js';
import { ROOMS } from '../world/layout.js';
import { systemLine } from './chat.js';

const KNOCK_REACH = 9; // metres from a locked room's wall (the server uses the same)
const roomName = (id) => ROOMS.find((r) => r.id === id)?.name || 'room';
let world = null;
const knocks = new Map(); // person id -> { name, expires }

export function initDoors(w) {
  world = w;
  $('btn-door').addEventListener('click', press);
  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, select') || $('hud').hidden || !$('modal').hidden) return;
    if (e.key === 'k' || e.key === 'K') press();
  });
  socket.on('door', onDoor);
  setInterval(update, 300);
  setInterval(pruneKnocks, 1000);
}

// The nearest private door locked against you that you could knock on.
function lockedDoorNearby(me) {
  const { x, z } = world.local;
  let best = null;
  for (const l of world.lockdowns || []) {
    if (!l.private || l.allowed.includes(me)) continue;
    const [x0, z0, x1, z1] = ROOMS.find((r) => r.id === l.room).rect;
    const d = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
    if (d <= KNOCK_REACH && (!best || d < best.d)) best = { d, room: l.room, lock: l };
  }
  return best;
}

// What the button would do right now: lock this room, unlock it, knock on a door, or nothing.
function context() {
  const s = store.state;
  const you = s?.you;
  if (!s || s.phase !== 'roam' || !you?.id || isCaptain() || you.isSpectator || s.paused) return null;
  const here = world.room;
  if (here !== 'corridor') {
    const lock = world.lockOf(here);
    if (lock) return lock.private && lock.allowed.includes(you.id) ? { mode: 'unlock', room: here, lock } : null;
    if (!you.alive || here === 'bridge') return null;
    const people = Object.entries(world.whereabouts()).filter(([id, p]) => p.room === here && id !== you.id && !p.phantom).length + 1;
    return { mode: 'lock', room: here, people };
  }
  const near = lockedDoorNearby(you.id);
  return near ? { mode: 'knock', room: near.room, lock: near.lock } : null;
}

function update() {
  if (!world || !store.state) return;
  const btn = $('btn-door');
  const c = context();
  btn.hidden = !c;
  if (!c) return;
  const you = store.state.you;
  const wait = Math.max(0, Math.ceil(((you.lockReady || 0) - serverNow()) / 1000));
  const left = c.lock?.until ? Math.max(0, c.lock.until - serverNow()) : 0;
  const [icon, label, hint] = {
    lock: ['🔒', wait ? `Lock door (${wait}s)` : 'Lock door', 'Lock this room so nobody can walk in or listen at the door. Needs someone in here with you. Lasts up to 90 seconds; anyone inside can unlock it or let a knocker in. (A Comms Officer\'s intercept can still listen.)'],
    unlock: ['🔓', `Unlock door${left ? ` (${formatTime(left)})` : ''}`, 'Open the door again. It also opens by itself when the time is up or you leave.'],
    knock: ['🚪', `Knock (${roomName(c.room)})`, 'The people inside are told you are knocking, and can let you in.'],
  }[c.mode];
  btn.querySelector('span').textContent = icon;
  btn.querySelector('b').textContent = label;
  btn.title = hint;
  btn.classList.toggle('dim', c.mode === 'lock' && (c.people < 2 || wait > 0));
}

function press() {
  const c = context();
  if (!c) return;
  if (c.mode === 'lock') send('lock').then(() => sfx('lock')).catch((e) => problem(e.message));
  else if (c.mode === 'unlock') send('unlock').then(() => sfx('click')).catch((e) => problem(e.message));
  else {
    send('knock', { room: c.room })
      .then((r) => {
        sfx('knock');
        toast(r.heard ? `🚪 You knock on the ${roomName(c.room)} door…` : `🚪 You knock on the ${roomName(c.room)} door… nobody answers.`, 'info', 4000);
      })
      .catch((e) => problem(e.message));
  }
}

// ---------------------------------------------------------------------------
// News from the server
// ---------------------------------------------------------------------------

const WHY = {
  time: '🔓 The door unlocked itself: its 90 seconds are up.',
  empty: '🔓 The door unlocked itself: not enough of you were left inside.',
};

function onDoor(msg) {
  const where = roomName(msg.room);
  switch (msg.kind) {
    case 'locked':
      sfx('lock');
      systemLine(`🔒 ${msg.by} locked the ${where}. Nobody else can walk in or hear you. Press K to unlock it, and let anyone who knocks in.`);
      toast(`🔒 ${where} locked. Press K to unlock.`, 'info', 4000);
      break;
    case 'unlocked':
      sfx('click');
      systemLine(msg.why === 'unlocked' ? `🔓 ${msg.by} unlocked the ${where}.` : WHY[msg.why] || '🔓 The door is open again.');
      break;
    case 'knock':
      sfx('knock');
      systemLine(`🚪 ${msg.name} is knocking on the door.`);
      knocks.set(msg.from, { name: msg.name, expires: Date.now() + 25_000 });
      renderKnocks();
      break;
    case 'opened':
      sfx('chime');
      toast(`🚪 ${msg.by} opened the ${where} door for you. Walk in!`, 'info', 6000);
      break;
    default:
      break;
  }
}

function renderKnocks() {
  const card = $('door-card');
  if (!knocks.size) {
    card.hidden = true;
    return;
  }
  clear(card, ...[...knocks].slice(-3).map(([id, k]) => el('div', { className: 'knock-row' },
    el('span', {}, '🚪 ', el('b', {}, k.name), ' is knocking.'),
    el('button', { className: 'primary small', onclick: () => letIn(id) }, 'Let in'),
    el('button', { className: 'small ghost', onclick: () => { knocks.delete(id); renderKnocks(); } }, 'Ignore'),
  )));
  card.hidden = false;
}

// Old knocks fade away. (The card is only redrawn when something changes, so a click never lands on a button that has just been replaced.)
function pruneKnocks() {
  let changed = false;
  for (const [id, k] of knocks) {
    if (k.expires < Date.now()) {
      knocks.delete(id);
      changed = true;
    }
  }
  if (changed) renderKnocks();
}

function letIn(id) {
  knocks.delete(id);
  renderKnocks();
  send('let-in', { id }).then(() => sfx('chime')).catch((e) => problem(e.message));
}

// Small comforts for playing online with friends:
// - the browser tab and your phone tell you when it's your turn
// - "are you sure?" before closing the tab mid-game
// - your suit, hat, pet and bio are remembered for next time
// - a player card (click a seat) with a voice volume control
// - "…" over someone's head while they type
// - a pause button for the host of an Autopilot game
// - read aloud (text to speech) and extra sound cues
import { $, el, problem, toast, buzz } from '../util.js';
import { socket, store, send, player, role, suitHex } from '../store.js';
import { sfx } from '../audio.js';
import { openModal } from './rolecard.js';
import { phaseBanner } from './hud.js';
import { peerVolume, setPeerVolume, hasVoice } from '../voice.js';
import { cycleTts, ttsMode, ttsSupported, stopSpeaking } from '../tts.js';

const LOOK_KEY = 'nms-look';
const BIO_KEY = 'nms-bio';
const BASE_TITLE = 'No More Space';
let world = null;

// ---------------------------------------------------------------------------
// Remembered look and bio
// ---------------------------------------------------------------------------

export function savedLook() {
  try {
    return JSON.parse(localStorage.getItem(LOOK_KEY) || 'null') || undefined;
  } catch {
    return undefined;
  }
}

export function rememberLook(look) {
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(look));
  } catch {}
}

function savedBio() {
  try {
    return localStorage.getItem(BIO_KEY) || '';
  } catch {
    return '';
  }
}

export function rememberBio(text) {
  try {
    localStorage.setItem(BIO_KEY, String(text || '').slice(0, 48));
  } catch {}
}

// ---------------------------------------------------------------------------

export function initExtras(w) {
  world = w;

  // "are you sure?" before closing the tab while a game is running
  window.addEventListener('beforeunload', (e) => {
    const s = store.state;
    if (!s || extras.leaving || ['lobby', 'ended'].includes(s.phase)) return;
    e.preventDefault();
    e.returnValue = '';
  });

  // the tab title goes back to normal when you look at it
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTitle(null);
  });

  // typing dots
  socket.on('typing', ({ id, on }) => world.fx.typing(id, on));

  // host pause (Autopilot)
  $('btn-pause').addEventListener('click', () => send('pause').catch((e) => problem(e.message)));

  // read aloud
  const ttsBtn = $('btn-tts');
  const syncTts = () => {
    const m = ttsMode();
    ttsBtn.classList.toggle('off', m === 'off');
    ttsBtn.title = { off: 'Read aloud: off', stories: 'Read aloud: stories and last words', all: 'Read aloud: stories, last words and chat' }[m];
  };
  ttsBtn.hidden = !ttsSupported();
  syncTts();
  ttsBtn.addEventListener('click', () => {
    const m = cycleTts();
    syncTts();
    toast({ off: '🔇 Read aloud is off.', stories: '🗣️ ARIA will read the stories and last words aloud.', all: '🗣️ Reading aloud: stories, last words AND chat.' }[m], 'info', 3500);
    if (m === 'off') stopSpeaking();
  });

  // click a seat (when it isn't for nominating or shooting) for a player card
  $('ring').addEventListener('click', (e) => {
    const seat = e.target.closest('.seat');
    if (!seat || seat.classList.contains('selectable')) return;
    const p = player(seat.dataset.id);
    if (p) openPlayerCard(p);
  });
}

export const extras = { leaving: false };

// ---------------------------------------------------------------------------
// Called on every state update
// ---------------------------------------------------------------------------

let buzzedFor = null;
let bioSent = null;

export function renderExtras(state, prev) {
  const you = state.you || {};

  // host pause button
  const pause = $('btn-pause');
  pause.hidden = !(you.isController && state.mode === 'autopilot' && !['lobby', 'ended'].includes(state.phase));
  pause.textContent = state.paused ? '▶️' : '⏸️';
  pause.title = state.paused ? 'Resume the game' : 'Pause the game (host)';

  // your saved bio goes back on when you join a new ship
  if (state.phase === 'lobby' && you.id && bioSent !== state.code) {
    bioSent = state.code;
    const me = state.players.find((p) => p.id === you.id);
    const bio = savedBio();
    if (me && !me.bio && bio) send('bio', { text: bio }).catch(() => {});
  }

  // does the game need YOU right now?
  const need = attention(state);
  if (need && need !== buzzedFor) {
    buzz([120, 60, 120]);
    if (document.hidden) sfx('ping');
  }
  buzzedFor = need;
  setTitle(document.hidden ? need : null, state);

  if (!prev || prev.code !== state.code) return;
  announce(state, prev);
}

// What the game is waiting for you to do, if anything.
function attention(state) {
  const you = state.you || {};
  if (!you.id || you.isCaptain || you.isSpectator) return null;
  const nom = state.nomination;
  if (state.phase === 'night' && you.blackbox && !you.blackbox.done) return '📼 Your Black Box!';
  if (state.phase === 'night' && you.alive && you.prompt && !you.prompt.done) return '🌙 Your turn!';
  if (nom && nom.stage === 'accuse' && nom.nominator === you.id) return '🗣️ Make your case!';
  if (nom && nom.stage === 'defend' && nom.nominee === you.id) return '🛡️ Defend yourself!';
  if (nom && nom.stage !== 'count' && !you.cast && (you.alive || you.ghostVote)) return '☝️ Vote now!';
  if (state.phase === 'lastwords' && state.lastWords?.id === you.id) return '🎤 Last words!';
  return null;
}

let titleTimer = null;
function setTitle(need, state = store.state) {
  clearInterval(titleTimer);
  const base = state?.shipName && state.phase !== 'lobby' ? `${state.shipName} · ${BASE_TITLE}` : BASE_TITLE;
  if (!need) {
    document.title = base;
    return;
  }
  let on = true;
  document.title = need;
  titleTimer = setInterval(() => {
    on = !on;
    document.title = on ? need : base;
  }, 1000);
}

// Sounds and banners for things that happen to other people.
function announce(state, prev) {
  const you = state.you || {};
  // friends arriving and leaving the docking bay
  if (state.phase === 'lobby' && prev.phase === 'lobby') {
    if (state.players.length > prev.players.length) sfx('join');
    if (state.players.length < prev.players.length) sfx('leave');
  }
  if ((state.spectators?.length || 0) > (prev.spectators?.length || 0)) {
    sfx('join');
    toast(`👀 ${state.spectators.at(-1).name} is watching from the gallery. They join the crew at the next rematch.`, 'info', 6000);
  }
  // the host paused or resumed
  if (state.paused !== prev.paused && !['lobby', 'ended'].includes(state.phase)) {
    sfx(state.paused ? 'pause' : 'resume');
    phaseBanner(state.paused ? '⏸️ Paused' : '▶️ Back to it', state.paused ? 'The host paused the game.' : 'The clock is running again.', 3000);
  }
  // a new public claim
  const before = new Set((prev.dayLog || []).filter((e) => e.k === 'claim').map((e) => e.at));
  if ((state.dayLog || []).some((e) => e.k === 'claim' && !before.has(e.at) && e.id !== you.id)) sfx('claim');
  // you've been nominated
  if (state.nomination?.nominee === you.id && prev.nomination?.nominee !== you.id) sfx('dread');
  // you just died
  const was = prev.players.find((p) => p.id === you.id);
  const now = state.players.find((p) => p.id === you.id);
  if (was?.alive && now && !now.alive) setTimeout(() => sfx('ghost'), 1800);
}

// ---------------------------------------------------------------------------
// Player card: who they are, what they claim, and their voice volume
// ---------------------------------------------------------------------------

function openPlayerCard(p) {
  const state = store.state;
  const claim = state.claims?.[p.id];
  const r = claim?.role ? role(claim.role) : null;
  const level = peerVolume(p.id);
  const voiceRow = p.id === state.you?.id
    ? el('p', { className: 'hint' }, 'This is you!')
    : hasVoice(p.id)
      ? el('div', { className: 'row volume-row' },
        el('span', { className: 'hint' }, '🎙️ Their voice:'),
        ...[[0, '🔇 Mute'], [0.4, '🔉 Quiet'], [1, '🔊 Normal']].map(([v, label]) => el('button', {
          className: `small ${level === v ? 'on' : ''}`,
          onclick: () => {
            setPeerVolume(p.id, v);
            sfx('tap');
            openPlayerCard(p);
          },
        }, label)))
      : el('p', { className: 'hint' }, '🎙️ Not on voice chat.');
  openModal(el('div', { className: 'player-card' },
    el('div', { className: 'player-card-head' },
      el('span', { className: 'dot big', style: { background: suitHex(p) } }),
      el('div', {},
        el('h2', {}, p.name, p.alive ? '' : ' 👻'),
        p.bio ? el('div', { className: 'hint' }, `is ${p.bio}`) : null,
      ),
    ),
    el('p', {}, r ? `📣 Claims to be the ${r.name} ${r.icon}${claim.text ? `: “${claim.text}”` : ''}` : claim?.text ? `📣 “${claim.text}”` : '📣 Has not claimed a role yet.'),
    state.afk?.includes(p.id) ? el('p', { className: 'hint' }, '💤 Away from the keyboard right now.') : null,
    p.connected ? null : el('p', { className: 'hint' }, '📴 Offline.'),
    voiceRow,
  ));
}

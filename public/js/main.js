// Entry point: connects the server, the 3D world and all the UI pieces.
import { $, el, clear, problem, toast, typeText, isTouch } from './util.js';
import { socket, store, onState, send, role, player, isCaptain } from './store.js';
import { unlockAudio, sfx, setAmbient, setSound, soundEnabled } from './audio.js';
import { World, blackHoleProgress } from './world/world.js';
import { initChat, addChat, updateChatVisibility, clearChat, systemLine } from './ui/chat.js';
import { initModal, openRoleCard, refreshRoleCard } from './ui/rolecard.js';
import { initHud, renderHud, setUsePrompt, phaseBanner } from './ui/hud.js';
import { initLobby, renderLobby, resetLobbyPicks } from './ui/lobby.js';
import { initDrawing, renderNight } from './ui/night.js';
import { openTask } from './ui/tasks.js';
import { initCommand, renderCommand } from './ui/command.js';
import { initRooms } from './ui/rooms.js';
import { Reveal } from './ui/reveal.js';
import { clearNotebook } from './ui/notebook.js';
import { initVoice, toggleVoice, voiceEnabled } from './voice.js';

const SEAT_KEY = 'nms-seat';
const MOODS = { lobby: 'calm', night: 'night', dawn: 'day', roam: 'day', meeting: 'day', nominations: 'tense', dusk: 'tense', ended: 'calm' };

function loadSeat() {
  try {
    return JSON.parse(localStorage.getItem(SEAT_KEY) || 'null');
  } catch {
    return null;
  }
}
function saveSeat(seat) {
  try {
    if (seat) localStorage.setItem(SEAT_KEY, JSON.stringify(seat));
    else localStorage.removeItem(SEAT_KEY);
  } catch {}
}

async function boot() {
  store.data = await fetch('/game-data.json').then((r) => r.json());
  const world = new World($('world'), store.data, {
    onSendPos: (p) => socket.emit('pos', p),
    onNearTask: (taskId) => setUsePrompt(taskId ? store.data.tasks[taskId].name : null),
    onStep: () => sfx('step'),
  });
  window.__world = world; // handy for debugging in the console
  const reveal = new Reveal(world);

  initModal();
  initChat();
  initDrawing();
  initCommand();
  initVoice(world);
  initLobby({ onLeave: leave });
  initRooms(world);
  initHud(world, {
    onRoleCard: (tab) => openRoleCard(typeof tab === 'string' ? tab : 'role'),
    onUse: () => {
      const taskId = world.nearTask;
      if (!taskId) return;
      openTask(taskId, store.data.tasks[taskId].name, () => {
        send('task', { task: taskId }).catch((e) => problem(e.message));
      });
    },
  });
  setupHome();
  setupButtons();
  setupJoystick(world);
  // Small touch screens: start with the panels folded away so the ship is visible.
  if (isTouch() && window.innerWidth < 820) {
    $('chat').classList.add('collapsed');
    $('ring-panel').classList.add('collapsed');
  }

  // Unlock audio on the first interaction (browser rule).
  const unlock = () => {
    unlockAudio();
    if (store.state) setAmbient(MOODS[store.state.phase] || 'calm');
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  // ---------------- server events ----------------
  const rejoin = () => {
    const seat = loadSeat();
    if (seat?.code && seat?.token) socket.emit('join', seat);
  };
  socket.on('connect', rejoin);
  // the socket may have connected while the game data was loading
  if (socket.connected) rejoin();
  socket.on('joined', ({ code, token, id }) => {
    store.me = id;
    const name = $('home-name').value || loadSeat()?.name || '';
    saveSeat({ code, token, name });
    history.replaceState(null, '', '/');
  });
  socket.on('problem', (message) => {
    if (message === 'No ship with that code.' && loadSeat()) saveSeat(null);
    problem(message);
  });
  socket.on('kicked', () => {
    saveSeat(null);
    location.reload();
  });
  socket.on('pos', (packed) => world.applyPositions(packed));
  socket.on('chat', (m) => {
    addChat(m);
    if (m.channel !== 'evil') world.say(m.from, m.text);
  });
  socket.on('emote', ({ id, emote, byCaptain }) => {
    world.emote(id, emote);
    if (byCaptain) sfx(emote === 'zap' ? 'zap' : 'pop');
  });
  socket.on('bubble', (b) => showStory(b.text, [], 9000));
  socket.on('drawing', ({ id, data }) => world.addDrawingImage(id, data));
  socket.on('drawings-cleared', () => world.clearDrawings());
  socket.on('drawing-removed', () => world.placeDrawings());

  // ---------------- state changes ----------------
  onState((state, prev) => {
    route(state);
    world.syncPlayers(state);
    if (!prev || prev.phase !== state.phase || prev.code !== state.code) onPhaseChange(state, prev, world, reveal);
    world.setProgressFromState(state);

    if (state.phase === 'lobby') renderLobby(state);
    if (state.phase === 'night') renderNight(state);
    renderHud(state);
    renderCommand(state);
    updateChatVisibility(state);
    refreshRoleCard();
    world.setDoneTasks(state.you?.tasksDone || []);

    // clue in the windows
    if (JSON.stringify(state.clue) !== JSON.stringify(prev?.clue)) {
      world.setClue(state.clue, state.players, store.data.roles);
      if (state.clue && prev && state.phase !== 'lobby') toast('🔭 Something has appeared outside the Observation Deck window…', 'info', 7000);
    }
    // drawings on the walls
    for (const d of state.drawings) if (!world.drawingCache.has(d.id)) socket.emit('get-drawing', { id: d.id });
    world.setDrawings(state.drawings);

    if (prev && prev.code === state.code) announceChanges(state, prev, world);
  });
}

function route(state) {
  const screen = state.phase === 'lobby' ? 'lobby' : 'game';
  document.body.classList.toggle('screen-home', false);
  document.body.classList.toggle('screen-lobby', screen === 'lobby');
  document.body.classList.toggle('screen-game', screen === 'game');
  document.body.classList.toggle('is-captain', isCaptain());
  for (const ph of ['lobby', 'night', 'dawn', 'roam', 'meeting', 'nominations', 'dusk', 'ended']) document.body.classList.toggle(`phase-${ph}`, state.phase === ph);
  $('screen-home').hidden = true;
  $('screen-lobby').hidden = screen !== 'lobby';
  $('hud').hidden = false;
  $('night').hidden = !(state.phase === 'night' && !isCaptain());
  $('joystick').hidden = !(isTouch() && ['lobby', 'roam'].includes(state.phase) && !isCaptain());
}

function onPhaseChange(state, prev, world, reveal) {
  world.setPhase(state.phase, state);
  setAmbient(MOODS[state.phase] || 'calm');
  $('emote-menu').hidden = true;
  if (state.phase !== 'night') {
    clear($('night-action'));
  }
  const first = !prev || prev.code !== state.code;
  if (state.phase === 'lobby') {
    reveal.stop();
    resetLobbyPicks();
    hideStory();
    if (prev && prev.phase !== 'lobby') {
      clearChat();
      clearNotebook(); // a new game, a fresh page
      systemLine('Back in the docking bay. Fresh suits, fresh lies.');
    }
    return;
  }
  if (first && state.phase !== 'ended') return; // reconnecting mid-game: no fanfare
  switch (state.phase) {
    case 'night':
      sfx('night');
      hideStory();
      break;
    case 'dawn': {
      sfx('dawn');
      // every night the ship drifts closer to the black hole
      world.rumble(1.8);
      setTimeout(() => sfx('creak'), 300);
      setTimeout(() => toast(`🕳️ The ship lurches. The black hole is ${Math.round(blackHoleProgress(state) * 100)}% of the way to swallowing us…`, 'death', 6000), 1800);
      const dawn = state.dawn;
      if (dawn) {
        const names = dawn.deaths.map((d) => player(d.id)?.name).filter(Boolean);
        showStory(dawn.story, names.map((n) => `💀 ${n}`), 4000 + dawn.story.length * 45);
        if (dawn.deaths.length) {
          setTimeout(() => sfx('death'), 1200);
          world.playDeaths(dawn.deaths);
        }
      }
      if (state.day === 1) {
        const r = role(state.you?.role);
        if (r) toast(`You are ${r.type === 'parasite' ? '' : 'the '}${r.name} ${r.icon}. Press R for your role card and tips.`, store.data.types[r.type].team === 'crew' ? 'info' : 'evil', 9000);
      }
      phaseBanner(`☀️ Day ${state.day}`, dawn?.deaths.length ? `${dawn.deaths.length} crew member${dawn.deaths.length > 1 ? 's' : ''} did not wake up` : 'Everyone survived the night');
      break;
    }
    case 'roam':
      sfx('chime');
      phaseBanner('🔦 Explore the ship', 'Press M (🚀 Rooms) to teleport. Only people in your room hear you.', 5000);
      systemLine('🔦 Explore time! Press M or tap 🚀 Rooms to teleport into a room. Only people in the same room can read your chat, so meet up with someone for a private talk.');
      break;
    case 'meeting':
      sfx('alarm');
      phaseBanner('🚨 Emergency meeting', 'Everyone to the bridge. Share what you know.');
      break;
    case 'nominations':
      sfx('gavel');
      phaseBanner('☝️ Nominations are open', `Click a player on the table to nominate. ${state.threshold} votes needed.`);
      break;
    case 'dusk': {
      const dusk = state.dusk;
      if (dusk?.id) {
        sfx('airlock');
        world.playDeaths([{ id: dusk.id, anim: dusk.anim || 'airlock' }]);
        showStory(dusk.story, [], 7000);
      } else {
        showStory(dusk?.story || 'Nobody is airlocked today.', [], 5000);
      }
      phaseBanner('🌇 Dusk', dusk?.id ? `${player(dusk.id)?.name} is airlocked` : 'Nobody is airlocked');
      break;
    }
    case 'ended':
      hideStory();
      $('night').hidden = true;
      setTimeout(() => store.state?.phase === 'ended' && reveal.start(store.state), first ? 200 : 2500);
      break;
    default:
      break;
  }
}

// Toasts and sounds for things that happen within a phase.
function announceChanges(state, prev, world) {
  // new private info
  const notes = state.you?.notes || [];
  const before = prev.you?.notes?.length || 0;
  if (notes.length > before && state.phase !== 'lobby') {
    for (const n of notes.slice(before)) toast(`📜 ${n.text}`, n.kind === 'evil' ? 'evil' : 'info', 9000);
    sfx('chime');
    $('btn-role').classList.add('on');
    setTimeout(() => $('btn-role').classList.remove('on'), 6000);
  }
  // public log lines
  const lastPrev = prev.log.at(-1)?.at || 0;
  for (const line of state.log.filter((l) => l.at > lastPrev)) {
    if (['nominate', 'vote', 'shot', 'death', 'system'].includes(line.kind)) toast(line.text, line.kind === 'death' ? 'death' : line.kind === 'vote' ? 'vote' : 'info', 6000);
    if (line.kind === 'shot') sfx('shot');
  }
  // vote clock ticks
  const nom = state.nomination;
  const pnom = prev.nomination;
  if (nom && !pnom) sfx('gavel');
  if (nom && pnom && nom.index !== pnom.index && nom.index >= 0) sfx(nom.hands[nom.order[nom.index - 1]] ? 'lock' : 'vote');
  // deaths in the middle of the day (Gunner, Captain)
  if (state.phase === prev.phase && ['roam', 'meeting', 'nominations'].includes(state.phase)) {
    for (const p of state.players) {
      const was = prev.players.find((x) => x.id === p.id);
      if (was?.alive && !p.alive) {
        world.playDeaths([{ id: p.id, anim: 'shot' }]);
        sfx('death');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Story cloud bubble
// ---------------------------------------------------------------------------

function showStory(text, chips = [], ms = 8000) {
  if (!text) return;
  const state = store.state;
  $('story-author').textContent = state?.mode === 'captain' && state.captain ? `☁️ Captain ${state.captain.name} says` : '☁️ ARIA, ship AI, reports';
  typeText($('story-text'), text, 18);
  clear($('story-deaths'), ...chips.map((c) => el('span', {}, c)));
  $('story').hidden = false;
  clearTimeout(showStory.t);
  showStory.t = setTimeout(hideStory, Math.min(20000, ms));
}

function hideStory() {
  $('story').hidden = true;
}

// ---------------------------------------------------------------------------
// Title screen & buttons
// ---------------------------------------------------------------------------

function setupHome() {
  const params = new URLSearchParams(location.search);
  if (params.get('join')) $('home-code').value = params.get('join').toUpperCase();
  const saved = loadSeat();
  if (saved?.name) $('home-name').value = saved.name;
  $('home-create').addEventListener('click', () => {
    unlockAudio();
    const mode = document.querySelector('input[name="mode"]:checked')?.value || 'autopilot';
    send('create', { name: $('home-name').value, mode }).then(() => sfx('whoosh')).catch((e) => problem(e.message));
  });
  $('home-join').addEventListener('click', () => {
    unlockAudio();
    send('join', { code: $('home-code').value, name: $('home-name').value }).then(() => sfx('whoosh')).catch((e) => problem(e.message));
  });
  $('home-code').addEventListener('keydown', (e) => e.key === 'Enter' && $('home-join').click());
  document.body.classList.add('screen-home');
}

function leave() {
  if (!confirm('Leave this ship?')) return;
  send('leave').catch(() => {});
  saveSeat(null);
  location.reload();
}

function setupButtons() {
  const soundBtn = $('btn-sound');
  const syncSound = () => {
    soundBtn.textContent = soundEnabled() ? '🔊' : '🔇';
    soundBtn.classList.toggle('off', !soundEnabled());
  };
  syncSound();
  soundBtn.addEventListener('click', () => {
    unlockAudio();
    setSound(!soundEnabled());
    syncSound();
  });
  $('btn-mic').addEventListener('click', async () => {
    const on = await toggleVoice();
    $('btn-mic').classList.toggle('on', on);
    $('btn-mic').title = on ? 'Voice chat ON (click to mute)' : 'Proximity voice chat';
  });
  $('btn-mic').classList.toggle('on', voiceEnabled());
}

function setupJoystick(world) {
  const pad = $('joystick');
  const knob = pad.querySelector('.knob');
  let active = null;
  const move = (e) => {
    const r = pad.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let dz = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(dx, dz);
    if (len > 1) {
      dx /= len;
      dz /= len;
    }
    world.joy = { x: dx, z: dz };
    knob.style.transform = `translate(${dx * 35}px, ${dz * 35}px)`;
  };
  pad.addEventListener('pointerdown', (e) => {
    active = e.pointerId;
    pad.setPointerCapture(e.pointerId);
    move(e);
  });
  pad.addEventListener('pointermove', (e) => e.pointerId === active && move(e));
  const end = () => {
    active = null;
    world.joy = { x: 0, z: 0 };
    knob.style.transform = '';
  };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
}

boot().catch((err) => {
  console.error(err);
  problem('Could not start the game. Try refreshing the page.');
});

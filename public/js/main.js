// Entry point: connects the server, the 3D world and all the UI pieces.
import { $, el, clear, problem, toast, typeText, isTouch } from './util.js';
import { socket, store, onState, send, role, player, isCaptain, serverNow, themeInfo, scriptInfo } from './store.js';
import { unlockAudio, sfx, setAmbient, setMusicScript, setSound, soundEnabled, setMusic, musicEnabled } from './audio.js';
import { World, blackHoleProgress } from './world/world.js';
import { initChat, addChat, updateChatVisibility, clearChat, systemLine } from './ui/chat.js';
import { openShareCard } from './ui/sharecard.js';
import { initModal, openRoleCard, refreshRoleCard } from './ui/rolecard.js';
import { initHud, renderHud, setUsePrompt, phaseBanner, titleCard } from './ui/hud.js';
import { initLobby, renderLobby, resetLobbyPicks } from './ui/lobby.js';
import { initDrawing, renderNight, flushDrawing } from './ui/night.js';
import { openTask } from './ui/tasks.js';
import { initCommand, renderCommand } from './ui/command.js';
import { initRooms } from './ui/rooms.js';
import { ROOMS, setRoomNames } from './world/layout.js';
import { initSystems } from './ui/systems.js';
import { initVote } from './ui/vote.js';
import { initSocial } from './ui/social.js';
import { initConnection, openBugReport } from './ui/report.js';
import { recordGame } from './progress.js';
import { Reveal } from './ui/reveal.js';
import { clearNotebook } from './ui/notebook.js';
import { initParty, renderParty } from './ui/party.js';
import { initCoach, renderCoach } from './ui/coach.js';
import { initExtras, renderExtras, savedLook, extras } from './ui/extras.js';
import { speak } from './tts.js';
import { openWiki } from './ui/wiki.js';
import { initSettings, openSettings } from './ui/settings.js';
import { buildHome } from './ui/home.js';
import { initPause } from './ui/pause.js';
import { createSplash, returning, loadingLine } from './ui/splash.js';
import { getCallsign } from './ui/callsign.js';
import { warp, confirmDialog } from './ui/menu.js';
import { initSession, renderSession } from './ui/session.js';
import { initCaptions } from './ui/captions.js';
import { initWish } from './ui/wish.js';
import { initOffer } from './ui/offer.js';
import { initJackpot } from './ui/jackpot.js';
import { initDoors } from './ui/doors.js';
import { openProfile } from './ui/profile.js';
import { openPublicShips } from './ui/publicships.js';
import { recordKick } from './progress.js';
import { initVoice, toggleVoice, voiceEnabled } from './voice.js';
import { initIcons, loadAtlas } from './icons.js';

initIcons(); // emoji in the text become the arcade's own icons (see icons.js)

const SEAT_KEY = 'nms-seat';
let ghostTaskTip = false; // shown once per visit
const MOODS = { lobby: 'calm', night: 'night', dawn: 'day', roam: 'day', meeting: 'day', nominations: 'tense', lastwords: 'tense', dusk: 'tense', ended: 'calm' };

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

// Canvas text (name tags, room labels) can only use fonts that have finished loading.
function loadFonts() {
  if (!document.fonts?.load) return Promise.resolve();
  const fonts = ['40px VT323', '40px Silkscreen', '40px Sixtyfour', '900 40px Doto', '40px "Rubik Glitch"', '40px "Kenney Future"', '600 40px "Chakra Petch"'];
  return Promise.race([Promise.all(fonts.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
}

async function boot() {
  // the start screen shows once per visit (not when rejoining a game, following an invite link or watching a replay)
  const params = new URLSearchParams(location.search);
  const splash = params.get('replay') || params.get('join') || returning() || loadSeat()?.code ? null : createSplash();
  splash?.progress(0.1, loadingLine());
  [store.data] = await Promise.all([fetch('/game-data.json').then((r) => r.json()), loadFonts(), loadAtlas()]); // the icon atlas too: canvas text (name tags, signs) draws with it
  const world = new World($('world'), store.data, {
    onSendPos: (p) => socket.emit('pos', p),
    onNearTask: (taskId) => setUsePrompt(taskId ? store.data.tasks[taskId].name : null),
    onStep: () => sfx('step'),
    onBlocked: (roomId, lock) => toast(lock?.private ? '🔒 That room is locked: people are talking in private. Press K to knock.' : '🔐 That room is sealed.', 'info', 4500),
    onDuckBump: () => {
      sfx('pop');
      const unlocked = recordKick();
      if (!unlocked.length) return;
      toast(`🎁 Unlocked for your spacesuit: ${unlocked.join(', ')}!`, 'info', 8000);
      if (store.state?.phase === 'lobby') renderLobby(store.state); // show it in the wardrobe straight away
    },
  });
  window.__world = world; // handy for debugging in the console
  if (splash) world.titleShot(); // the start screen looks down on the ship from far away
  splash?.progress(0.55, loadingLine());
  world.serverNow = serverNow;
  // when a clue drifts past, whoever is watching from the Observation Deck gets its caption
  let captioned = null;
  setInterval(() => {
    const clue = store.state?.clue;
    if (!clue || !world.flyby?.live || captioned === clue.at) return;
    if (world.room !== 'observation' && !isCaptain()) return;
    captioned = clue.at;
    sfx('chime');
    toast(`🔭 ${clue.caption}`, 'info', 12000);
  }, 500);
  const reveal = new Reveal(world);

  // After the game, whenever the reveal is not on screen (it was closed, or never opened), the way back to
  // the docking bay. (The reveal's own summary has the same buttons, but it can be closed.)
  $('pg-rematch').addEventListener('click', () => send('rematch').catch((e) => problem(e.message)));
  $('pg-reveal').addEventListener('click', () => store.state && reveal.start(store.state));
  $('pg-share').addEventListener('click', () => store.state && openShareCard(store.state));
  setInterval(() => {
    $('postgame').hidden = !(store.state?.phase === 'ended' && !store.state.isReplay && $('reveal').hidden);
  }, 400);

  initModal();
  initChat();
  initDrawing();
  initCommand();
  initVoice(world);
  initLobby({ onLeave: leave });
  initRooms(world);
  initSocial(world);
  initConnection();
  initSystems(world);
  initVote();
  initParty(world);
  initCoach();
  initExtras(world);
  initSettings({ moods: MOODS });
  initSession();
  initCaptions();
  initWish();
  initOffer();
  initJackpot();
  initDoors(world);
  $('lobby-profile').addEventListener('click', () => openProfile());
  for (const id of ['lobby-wiki', 'btn-wiki']) $(id).addEventListener('click', () => openWiki());
  initHud(world, {
    onRoleCard: (tab) => openRoleCard(typeof tab === 'string' ? tab : 'role'),
    onUse: () => {
      const taskId = world.nearTask;
      if (!taskId) return;
      openTask(taskId, store.data.tasks[taskId].name, () => send('task', { task: taskId }).catch((e) => problem(e.message)));
    },
  });
  initPause({ onLeave: leave });
  const home = setupHome();
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
    setAmbient(store.state ? MOODS[store.state.phase] || 'calm' : 'calm'); // the title screen gets the lobby waltz
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  // ---------------- server events ----------------
  // ?replay=<id>: rewatch a finished game's reveal instead of playing
  const replayId = new URLSearchParams(location.search).get('replay');
  if (replayId) {
    startReplay(replayId, reveal, world);
    return;
  }
  const rejoin = () => {
    const seat = loadSeat();
    if (seat?.code && seat?.token) socket.emit('join', seat);
  };
  socket.on('connect', rejoin);
  // the socket may have connected while the game data was loading
  if (socket.connected) rejoin();
  socket.on('joined', ({ code, token, id }) => {
    store.me = id;
    const name = getCallsign() || loadSeat()?.name || '';
    saveSeat({ code, token, name });
    history.replaceState(null, '', '/nms');
  });
  socket.on('problem', (message) => {
    if (message === 'No ship with that code.' && loadSeat()) saveSeat(null);
    problem(message);
  });
  socket.on('kicked', () => {
    saveSeat(null);
    location.reload();
  });
  socket.on('pos', (packed) => {
    // the docking-bay duck travels with the movement updates
    if (packed['@ball']) {
      world.fx.ball(packed['@ball']);
      delete packed['@ball'];
    }
    world.applyPositions(packed);
  });
  socket.on('chat', (m) => {
    addChat(m);
    if (m.channel !== 'evil') world.say(m.from, m.text);
    // last words get the big cloud bubble
    if (m.lastWords) {
      showStory(`“${m.text}”`, [], 9000, `🎤 ${m.name}'s last words`, false);
      speak(m.text, { kind: 'lastwords', who: m.name });
    }
  });
  socket.on('stinger', ({ name }) => sfx(name));
  socket.on('emote', ({ id, emote, byCaptain }) => {
    world.emote(id, emote);
    if (byCaptain) sfx(emote === 'zap' ? 'zap' : 'pop');
    // every emote has a little sound (only nearby avatars, so the whole ship isn't noisy)
    else if (world.avatars.get(id)?.root.visible) sfx({ scooby: 'groove', scuba: 'bubbles', dance: 'groove', floss: 'groove', disco: 'groove', twist: 'groove', moonwalk: 'groove', breakdance: 'groove', robot: 'beep', jump: 'boing', spin: 'whirl', laugh: 'giggle', cry: 'sob', wave: 'swish', shrug: 'huh', facepalm: 'huh', point: 'tap', salute: 'tap', clap: 'clap', cheer: 'cheer', flex: 'cheer', bow: 'swish', heart: 'chime', sleep: 'huh' }[emote] || 'pop');
  });
  socket.on('bubble', (b) => showStory(b.text, [], 9000));
  socket.on('drawing', ({ id, data }) => world.addDrawingImage(id, data));
  socket.on('drawings-cleared', () => world.clearDrawings());
  socket.on('drawing-removed', () => world.placeDrawings());

  // ---------------- state changes ----------------
  onState((state, prev) => {
    route(state);
    world.syncPlayers(state);
    world.setScript(state.script);
    setMusicScript(state.script);
    setRoomNames(themeInfo(state.script).rooms);
    $('night-sub').textContent = themeInfo(state.script).nightSub;
    if (!prev || prev.phase !== state.phase || prev.code !== state.code) onPhaseChange(state, prev, world, reveal);
    world.setProgressFromState(state);

    if (state.phase === 'lobby') renderLobby(state);
    if (state.phase === 'night') renderNight(state);
    renderHud(state);
    renderCommand(state);
    updateChatVisibility(state);
    refreshRoleCard();
    world.setDoneTasks(state.you?.tasksDone || []);
    world.setArrayCharge(state.charge, state.chargeNeeded);
    // a ghost's first day: they can still help
    if (state.phase === 'roam' && prev?.phase !== 'roam' && state.you?.alive === false && !state.you.isCaptain && !ghostTaskTip) {
      ghostTaskTip = true;
      toast('👻 Ghosts can still do tasks: yours charge the Observation Array too!', 'info', 7000);
    }
    world.setHallucination(state.you?.fx || null, state.phase, (m) => addChat(m));
    world.setShipEvent(state.shipEvent);
    world.setSpotlight(state.phase === 'lastwords' ? state.lastWords?.id : null);

    // clue in the windows
    if (JSON.stringify(state.clue) !== JSON.stringify(prev?.clue)) {
      world.setClue(state.clue, state.players, store.data.roles);
      // players who did a task today get a heads-up from the ship's sensors
      if (state.clue && prev && state.phase === 'roam' && state.you?.clueWarning && state.clue.at !== prev.clue?.at) {
        sfx('blip');
        toast('📡 Your task sensors ping: something is drifting toward the Observation Deck! Get to the window in the next 20 seconds…', 'info', 9000);
      }
    }
    // drawings on the walls
    for (const d of state.drawings) if (!world.drawingCache.has(d.id)) socket.emit('get-drawing', { id: d.id });
    world.setDrawings(state.drawings);

    renderParty(state, prev);
    renderCoach(state);
    renderExtras(state, prev);
    renderSession(state, prev);
    if (prev && prev.code === state.code) announceChanges(state, prev, world);
  });

  // everything is in: wait for a key (the very first visit), then dive in to the ship and bring the menu up
  if (splash) {
    let shown = 0.6;
    const creep = setInterval(() => splash.progress((shown += (0.92 - shown) * 0.08)), 220);
    const words = setInterval(() => splash.progress(shown, loadingLine()), 1400);
    await Promise.race([world.classicRooms.ready, new Promise((r) => setTimeout(r, 9000))]);
    clearInterval(creep);
    clearInterval(words);
    const pressed = await splash.ready();
    if (pressed) {
      unlockAudio();
      sfx('start');
      warp();
      world.swoopIn();
    }
  }
  home.intro();
  if (params.get('join')) home.openJoin(params.get('join'));
}

// Rewatch a finished game from a replay link.
async function startReplay(id, reveal, world) {
  try {
    const res = await fetch(`/replay/${encodeURIComponent(id)}.json`);
    if (!res.ok) throw new Error('missing');
    const state = await res.json();
    document.body.classList.remove('screen-home');
    document.body.classList.add('screen-replay');
    $('screen-home').hidden = true;
    // the stage behind the "watch" card wears the right script (Great Grin, circus room names...)
    world.setScript(state.script);
    setMusicScript(state.script);
    setRoomNames(themeInfo(state.script).rooms);
    const gameName = themeInfo(state.script).shareTitle.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    const go = () => {
      unlockAudio();
      reveal.start(state);
    };
    // browsers only play sound after a click, so ask for one
    const start = el('div', { className: 'replay-start card' },
      el('h2', {}, `🎬 ${state.shipName || 'A game'} of ${gameName}`),
      el('p', { className: 'hint' }, `${state.players.length} players · ${state.winner === 'crew' ? 'the crew escaped' : themeInfo(state.script).shareTitle.toLowerCase()}`),
      el('button', { className: 'primary big', onclick: () => { start.remove(); go(); } }, '▶ Watch the replay'),
    );
    document.body.append(start);
  } catch {
    problem('That replay link has expired or does not exist.');
    setTimeout(() => (location.href = '/'), 2500);
  }
}

function route(state) {
  const screen = state.phase === 'lobby' ? 'lobby' : 'game';
  document.body.classList.toggle('screen-home', false);
  document.body.classList.toggle('screen-lobby', screen === 'lobby');
  document.body.classList.toggle('screen-game', screen === 'game');
  document.body.classList.toggle('is-captain', isCaptain());
  for (const ph of ['lobby', 'night', 'dawn', 'roam', 'meeting', 'nominations', 'lastwords', 'dusk', 'ended']) document.body.classList.toggle(`phase-${ph}`, state.phase === ph);
  $('screen-home').hidden = true;
  $('screen-lobby').hidden = screen !== 'lobby';
  $('hud').hidden = false;
  $('night').hidden = !(state.phase === 'night' && !isCaptain() && !state.you?.isSpectator);
  document.body.classList.toggle('is-spectator', !!state.you?.isSpectator);
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
      flushDrawing(); // a picture still being drawn as the night ended
      sfx('dawn');
      // every night the ship drifts closer to the black hole (or the Great Grin)
      world.lurch();
      setTimeout(() => sfx('creak'), 300);
      const theme = themeInfo(state.script);
      setTimeout(() => toast(`${theme.doomIcon} ${theme.lurch.replace('{pct}', Math.round(blackHoleProgress(state) * 100))}`, 'death', 6000), 1800);
      const dawn = state.dawn;
      if (dawn) {
        const names = dawn.deaths.map((d) => player(d.id)?.name).filter(Boolean);
        const back = (dawn.revived || []).map((id) => player(id)?.name).filter(Boolean);
        showStory(dawn.story, [...names.map((n) => `💀 ${n}`), ...back.map((n) => `✨ ${n}`)], 9000 + dawn.story.length * 60); // up for most of the dawn
        if (back.length) setTimeout(() => sfx('fanfare'), 1600);
        if (dawn.deaths.length) {
          setTimeout(() => sfx('death'), 1200);
          world.playDeaths(dawn.deaths);
        }
      }
      if (state.day === 1) {
        const r = role(state.you?.role);
        if (r) toast(`You are ${r.type === 'parasite' ? '' : 'the '}${r.name} ${r.icon}. Press R for your role card and tips.`, store.data.types[r.type].team === 'crew' ? 'info' : 'evil', 9000);
      }
      titleCard(`☀️ Day ${state.day}`, dawn?.deaths.length ? `${dawn.deaths.length} did not wake up` : 'Everyone made it through the night', { accent: dawn?.deaths.length ? '#ff6b81' : '#ffd27a' });
      break;
    }
    case 'roam':
      hideStory(); // (the dawn story is still up if everyone was ready early)
      sfx('chime');
      titleCard('🔦 Explore', 'Tasks, whispers, alibis', { accent: '#6cf0ff', ms: 2200 });
      break;
    case 'lastwords': {
      sfx('drumroll');
      const who = player(state.lastWords?.id);
      titleCard(`🎤 ${who?.name || '…'}`, 'Last words', { accent: '#ff7ad9', ms: 2400 });
      if (state.lastWords?.id === state.you?.id) toast('🎤 You have 15 seconds for your last words. Type in the chat: everyone will see it in a big bubble.', 'evil', 9000);
      break;
    }
    case 'meeting':
      sfx('alarm');
      titleCard('🚨 Emergency meeting', 'Everyone to the bridge', { accent: '#ff4d6d' });
      break;
    case 'nominations':
      sfx('gavel');
      titleCard('☝️ Nominations', `${state.threshold} votes to airlock`, { accent: '#ffb347' });
      break;
    case 'dusk': {
      const dusk = state.dusk;
      if (dusk?.survived) {
        // the Acrobat's safety net: airlocked, and bounced right back
        sfx('fanfare');
        showStory(dusk.story, [dusk.cause === 'jam' ? '🤝 The hatch jams!' : dusk.cause === 'leech' ? '🩸 It crawls back in!' : dusk.cause === 'tech' ? '🔧 The hatch is rigged!' : '🤸 The net holds!'], 9000);
      } else if (dusk?.id) {
        sfx('airlock');
        world.playDeaths([{ id: dusk.id, anim: dusk.anim || 'airlock' }]);
        showStory(dusk.story, [], 7000);
      } else {
        showStory(dusk?.story || `Nobody is ${themeInfo(state.script).banishedVerb} today.`, [], 5000);
      }
      titleCard(dusk?.survived ? (dusk.cause === 'jam' ? '🤝 The hatch jams!' : dusk.cause === 'leech' ? '🩸 It crawls back in!' : dusk.cause === 'tech' ? '🔧 The hatch is rigged!' : '🤸 The net holds!') : '🌇 Dusk', dusk?.survived ? `${player(dusk.id)?.name} survives ${themeInfo(state.script).banishPlace}` : dusk?.id ? `${player(dusk.id)?.name} is ${themeInfo(state.script).banishedVerb}` : `Nobody is ${themeInfo(state.script).banishedVerb}`, { accent: dusk?.id && !dusk.survived ? '#ff8a3a' : '#c9a0ff', ms: 3000 });
      break;
    }
    case 'ended': {
      hideStory();
      $('night').hidden = true;
      // progress for unlockable hats and pets
      reveal.unlocked = recordGame(state);
      if (reveal.unlocked.length) setTimeout(() => toast(`🎁 Unlocked for your spacesuit: ${reveal.unlocked.join(', ')}!`, 'info', 10000), 3000);
      setTimeout(() => store.state?.phase === 'ended' && reveal.start(store.state), first ? 200 : 2500);
      break;
    }
    default:
      break;
  }
}

// Toasts and sounds for things that happen within a phase.
function announceChanges(state, prev, world) {
  // the Captain's ship events
  const ev = state.shipEvent;
  if (ev && ev.until !== prev.shipEvent?.until) {
    const show = {
      zerog: ['🪐 ZERO GRAVITY!', 'The artificial gravity has failed. Wheee!', 'whoosh'],
      disco: ['🪩 DISCO MODE', 'The Captain found the party lights.', 'fanfare'],
      alarm: ['🚨 RED ALERT', 'Something is very wrong. (Probably.)', 'alarm'],
      confetti: ['🎉 CONFETTI!', 'Somebody pressed the party button.', 'pop'],
    }[ev.kind];
    if (show) {
      phaseBanner(show[0], show[1], 3500);
      sfx(show[2]);
    }
  }
  // ship systems everyone notices
  const sys = state.systems || {};
  const was = prev.systems || {};
  if (sys.blackoutUntil && sys.blackoutUntil !== was.blackoutUntil) {
    sfx('doom');
    phaseBanner('🌑 BLACKOUT', 'The lights are out. Who is who?', 4000);
  }
  for (const l of sys.lockdowns || []) {
    if (l.private) continue; // private locks tell the people inside (doors.js), not the whole ship
    if (!(was.lockdowns || []).some((b) => b.room === l.room && b.until === l.until)) {
      sfx('lock');
      toast(`🔐 ${ROOMS.find((r) => r.id === l.room)?.name || 'A room'} has gone into lockdown!`, 'info', 6000);
    }
  }

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
  if (nom && !pnom) {
    sfx('gavel');
    // somebody is accused: the accuser points, the accused gasps
    world.react(nom.nominator, 'point');
    world.react(nom.nominee, 'gasp');
  }
  // how the vote turned out: the player who was voted on cheers, or slumps on the block
  if (prev.dayLog && state.dayLog) {
    const seen = prev.dayLog.at(-1)?.at || 0;
    for (const e of state.dayLog) if (e.k === 'vote' && e.at > seen) world.react(e.t, e.result === 'block' ? 'cry' : e.result === 'safe' ? 'cheer' : 'shrug');
  }
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

function showStory(text, chips = [], ms = 8000, author = null, read = true) {
  if (!text) return;
  if (read) speak(text, { kind: 'story' });
  const state = store.state;
  $('story-author').textContent = author || (state?.mode === 'captain' && state.captain ? `☁️ Captain ${state.captain.name} says` : `☁️ ${scriptInfo(state?.script).narrator || 'ARIA, ship AI'}, reports`);
  typeText($('story-text'), text, 18);
  clear($('story-deaths'), ...chips.map((c) => el('span', {}, c)));
  $('story').hidden = false;
  clearTimeout(showStory.t);
  showStory.t = setTimeout(hideStory, Math.min(28000, ms));
}

function hideStory() {
  $('story').hidden = true;
}

// ---------------------------------------------------------------------------
// Title screen & buttons
// ---------------------------------------------------------------------------

function setupHome() {
  const go = (event, data) => {
    unlockAudio();
    send(event, { ...data, look: savedLook() }).then(() => sfx('whoosh')).catch((e) => problem(e.message));
  };
  return buildHome($('screen-home'), {
    launch: (mode, name) => go('create', { name, mode }),
    join: (code, name) => go('join', { code, name }),
    practice: (script, name) => go('create', { name, practice: true, ...(script === 'classic' ? {} : { script }) }),
    publicShips: () => openPublicShips({ look: savedLook }),
    profile: () => openProfile(),
    wiki: () => openWiki(),
    settings: () => openSettings(MOODS),
    bug: () => openBugReport(),
  });
}

async function leave() {
  const ok = await confirmDialog({ title: 'Leave this ship?', text: store.state?.phase === 'lobby' ? 'Your seat is freed for someone else.' : 'A robot takes over your spacesuit.', yes: 'Leave', no: 'Stay', danger: true });
  if (!ok) return;
  extras.leaving = true;
  send('leave').catch(() => {});
  saveSeat(null);
  location.reload();
}

function setupButtons() {
  // a soft tap on every button press (night picks and minigames make their own sounds)
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest?.('button');
    if (b && !b.disabled && !b.closest('.night-action, .task-area')) sfx('tap');
  });
  const syncMusic = () => {
    const on = musicEnabled();
    $('btn-music').classList.toggle('off', !on);
    $('btn-music').title = on ? 'Music on (click to mute)' : 'Music off';
    $('home-music').textContent = on ? '🎵 Music on' : '🎵 Music off';
    $('home-music').classList.toggle('off', !on);
  };
  syncMusic();
  for (const id of ['btn-music', 'home-music']) {
    $(id).addEventListener('click', () => {
      unlockAudio();
      setMusic(!musicEnabled());
      setAmbient(store.state ? MOODS[store.state.phase] || 'calm' : 'calm');
      syncMusic();
    });
  }
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

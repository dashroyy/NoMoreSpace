// Star Bonanza: the entry point. Shows the start screen while the 3D galaxy loads, connects to the server and
// shows the right screen (title menu, lobby or the farm).

// The DOM turns a null child into the word "null"; the screens build lists with optional pieces, so null and false
// are simply skipped (the same small patch Ruler of the Galaxy and Phase to Space use).
for (const name of ['replaceChildren', 'append', 'prepend']) {
  const original = Element.prototype[name];
  Element.prototype[name] = function (...nodes) {
    return original.apply(this, nodes.filter((n) => n != null && n !== false));
  };
}
import { $, problem, toast } from '../util.js';
import { socket, store, loadData, onState, send } from './net.js';
import { unlock, sfx } from './sound.js';
import { World } from './world.js';
import { initFx } from './fx.js';
import { buildHome } from './home.js';
import { buildLobby, renderLobby } from './lobby.js';
import { buildGame, renderGame } from './game.js';
import { renderEnd } from './end.js';
import { closeModal } from './codex.js';
import { createSplash, returning } from './splash.js';
import { applySettings } from './settings.js';
import { initArt } from './art.js';
import { confirmDialog, wireUiSounds, warp } from './ui.js';

const SEAT_KEY = 'sbz-seat';
const loadSeat = () => {
  try {
    return JSON.parse(localStorage.getItem(SEAT_KEY) || 'null');
  } catch {
    return null;
  }
};
const saveSeat = (seat) => {
  try {
    if (seat) localStorage.setItem(SEAT_KEY, JSON.stringify(seat));
    else localStorage.removeItem(SEAT_KEY);
  } catch {}
};

let screen = null;

function show(name) {
  if (screen === name) return;
  const first = screen === null;
  screen = name;
  for (const id of ['home', 'lobby', 'game']) $(`screen-${id}`).hidden = id !== name;
  document.body.className = document.body.className.replace(/\bon-\w+/g, '').trim();
  document.body.classList.add(`on-${name}`);
  if (!first) warp(); // a flash of light between the title, the lobby and the table
}

async function leave() {
  const phase = store.state?.phase;
  const text = phase === 'ended' ? 'Back to the title screen you go.' : phase === 'lobby' ? 'Your seat is freed up for another farmer.' : 'A robot takes over your farm and plays on for you.';
  const ok = await confirmDialog({ title: 'Leave the farm?', text, yes: 'Leave', no: 'Stay', danger: true });
  if (!ok) return;
  send('leave').catch(() => {});
  saveSeat(null);
  location.href = '/bonanza';
}

async function boot() {
  const splash = createSplash();
  splash.progress(0.08, 'Watering the stars…');
  await loadData();
  splash.progress(0.2, 'Taking the stars’ photos…');
  initArt(); // (every screen shows the star buddies' pictures, so they are taken first)
  splash.progress(0.3, 'Fluffing the clouds…');
  const world = new World();
  window.__sbz = {
    store,
    world,
    // run the animations forward by hand (a hidden browser tab gets no animation frames)
    step(seconds = 1) {
      for (let i = 0; i < seconds * 30; i++) {
        world.stage.time += 1 / 30;
        world.stage.update(1 / 30);
      }
    },
  }; // handy for debugging in the console
  applySettings(world);
  wireUiSounds();
  initFx(world);
  const home = buildHome($('screen-home'), { world });
  buildLobby($('screen-lobby'), { onLeave: leave, world });
  buildGame($('screen-game'), { onLeave: leave, world });
  show('home');
  const seat = loadSeat();
  if (!returning() && !seat?.code) world.titleShot(); // far out in space, behind the logo

  // the bar creeps up while everything is made
  let shown = 0.34;
  const creep = setInterval(() => splash.progress((shown += (0.92 - shown) * 0.09), 'Feeding the alien…'), 220);

  // browsers only play sound after a first click
  const unlockOnce = () => unlock();
  window.addEventListener('pointerdown', unlockOnce, { once: true });
  window.addEventListener('keydown', unlockOnce, { once: true });

  const rejoin = () => {
    const s = loadSeat();
    if (s?.code && s?.token) socket.emit('join', s);
  };
  socket.on('connect', rejoin);
  if (socket.connected) rejoin();

  socket.on('joined', ({ code, token, id }) => {
    store.me = id;
    saveSeat({ code, token, name: loadSeat()?.name || '' });
    history.replaceState(null, '', '/bonanza');
    if (splash.open) splash.dismiss(); // picking up a game: no title screen
  });
  socket.on('problem', (message) => {
    if (message === 'No table with that code.' && loadSeat()) {
      saveSeat(null);
      if (screen === 'home') return; // an old seat from a game that is gone: no need to say so
    }
    sfx('error');
    problem(message);
  });
  socket.on('kicked', () => {
    saveSeat(null);
    location.href = '/bonanza';
  });
  socket.on('server-restart', ({ in: s }) => toast(s ? `The server restarts in ${s} seconds. Your game will be back in a moment.` : 'The server is restarting. Reconnecting…', 'info', 9000));

  onState((state, prev) => {
    if (state.phase === 'lobby') {
      if (screen !== 'lobby') closeModal();
      show('lobby');
      renderLobby(state);
    } else {
      show('game');
      renderGame(state, prev);
    }
    // also when a rematch goes back to the lobby: that takes the scoreboard away
    renderEnd(state, { onLeave: leave });
  });

  // everything is in: wait for a key (the very first visit), then swoop down to the farm
  await Promise.race([world.ready, new Promise((r) => setTimeout(r, 12000))]);
  clearInterval(creep);
  splash.progress(1, 'Ready');
  if (loadSeat()?.code && !splash.open) return home.intro();
  if (loadSeat()?.code) {
    // a saved seat: wait a moment for the server to put us back in the game before showing the menu
    await new Promise((r) => setTimeout(r, 1800));
    if (splash.open) splash.dismiss();
    return home.intro();
  }
  const pressed = await splash.ready();
  if (pressed) {
    unlock();
    sfx('start');
    warp();
    world.swoopIn();
  }
  home.intro();
}

boot().catch((err) => {
  console.error(err);
  problem('Could not start the game. Try reloading.');
});

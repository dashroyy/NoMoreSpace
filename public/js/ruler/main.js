// Ruler of the Galaxy: the entry point. Builds the 3D galaxy, connects to the server and shows the right screen.

// The DOM turns a null child into the word "null"; the screens build lists with optional pieces, so null and false
// are simply skipped (the same small patch Phase to Space uses).
for (const name of ['replaceChildren', 'append', 'prepend']) {
  const original = Element.prototype[name];
  Element.prototype[name] = function (...nodes) {
    return original.apply(this, nodes.filter((n) => n != null && n !== false));
  };
}
import { $, problem, toast } from '../util.js';
import { socket, store, loadData, onState, send } from './net.js';
import { unlock } from './sound.js';
import { World } from './world.js';
import { initFx } from './fx.js';
import { buildHome } from './home.js';
import { buildLobby, renderLobby } from './lobby.js';
import { buildGame, renderGame } from './game.js';
import { renderEnd } from './end.js';
import { clear as clearPrompt } from './prompts.js';
import { closeModal } from './codex.js';

const SEAT_KEY = 'rotg-seat';
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
  screen = name;
  for (const id of ['home', 'lobby', 'game']) $(`screen-${id}`).hidden = id !== name;
  document.body.className = document.body.className.replace(/\bon-\w+/g, '').trim();
  document.body.classList.add(`on-${name}`);
}

function leave() {
  if (!confirm('Leave this galaxy?')) return;
  send('leave').catch(() => {});
  saveSeat(null);
  location.href = '/ruler';
}

async function boot() {
  await loadData();
  const world = new World();
  window.__rotg = {
    store,
    world,
    // run the animations forward by hand (a hidden browser tab gets no animation frames)
    step(seconds = 1) {
      for (let i = 0; i < seconds * 30; i++) {
        world.stage.time += 1 / 30;
        world.stage.update(1 / 30);
        this.tray?.update(1 / 30);
      }
    },
  }; // handy for debugging in the console
  initFx(world);
  buildHome($('screen-home'), { world });
  buildLobby($('screen-lobby'), { onLeave: leave, world });
  buildGame($('screen-game'), { onLeave: leave, world });
  show('home');

  // browsers only play sound after a first click
  const unlockOnce = () => unlock();
  window.addEventListener('pointerdown', unlockOnce, { once: true });
  window.addEventListener('keydown', unlockOnce, { once: true });

  const rejoin = () => {
    const seat = loadSeat();
    if (seat?.code && seat?.token) socket.emit('join', seat);
  };
  socket.on('connect', rejoin);
  if (socket.connected) rejoin();

  socket.on('joined', ({ code, token, id }) => {
    store.me = id;
    saveSeat({ code, token, name: $('home-name')?.value || loadSeat()?.name || '' });
    history.replaceState(null, '', '/ruler');
  });
  socket.on('problem', (message) => {
    if (message === 'No galaxy with that code.' && loadSeat()) {
      saveSeat(null);
      if (screen === 'home') return; // an old seat from a game that is gone: no need to say so
    }
    problem(message);
  });
  socket.on('kicked', () => {
    saveSeat(null);
    location.href = '/ruler';
  });
  socket.on('server-restart', ({ in: s }) => toast(s ? `The server restarts in ${s} seconds. Your game will be back in a moment.` : 'The server is restarting. Reconnecting…', 'info', 9000));

  onState((state, prev) => {
    if (state.phase === 'lobby') {
      if (screen !== 'lobby') {
        clearPrompt();
        closeModal();
      }
      show('lobby');
      renderLobby(state);
    } else {
      show('game');
      renderGame(state, prev);
    }
    // also when a rematch goes back to the lobby: that takes the scoreboard away
    renderEnd(state, { onLeave: leave });
  });
}

boot().catch((err) => {
  console.error(err);
  problem('Could not start the game. Try reloading.');
});

// Phase to Space: the entry point. Connects to the server and shows the right screen.
import { $, problem, toast } from '../util.js';
import { initIcons } from '../icons.js';
import { socket, store, loadData, onState, send } from './net.js';
import { unlock, sfx } from './sound.js';
import { initPreview } from './cards.js';
import { buildHome } from './home.js';
import { buildLobby, renderLobby } from './lobby.js';
import { buildGame, renderGame } from './table.js';
import { renderEnd } from './end.js';
import { clear as clearPrompt } from './prompts.js';
import { renderChat } from './chat.js';
import { closeModal } from './modal.js';
import { startStars } from './stars.js';

const SEAT_KEY = 'pts-seat';
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
  if (!confirm('Leave this table?')) return;
  send('leave').catch(() => {});
  saveSeat(null);
  location.href = '/phase';
}

async function boot() {
  await loadData();
  window.__pts = { store }; // handy for debugging in the console
  initIcons();
  initPreview();
  startStars($('bg'));
  buildHome($('screen-home'));
  buildLobby($('screen-lobby'), { onLeave: leave });
  buildGame($('screen-game'), { onLeave: leave });
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
    const name = $('home-name')?.value || loadSeat()?.name || '';
    saveSeat({ code, token, name });
    history.replaceState(null, '', '/phase');
  });
  socket.on('problem', (message) => {
    if (message === 'No table with that code.' && loadSeat()) saveSeat(null);
    problem(message);
  });
  socket.on('kicked', () => {
    saveSeat(null);
    location.href = '/phase';
  });
  socket.on('server-restart', ({ in: s }) => toast(s ? `The server is restarting in ${s} seconds. Your game will be back in a moment.` : 'The server is restarting. Reconnecting…', 'info', 9000));

  onState((state, prev) => {
    const phase = state.phase;
    if (phase === 'lobby') {
      clearPrompt();
      closeModal();
      show('lobby');
      renderLobby(state);
      renderChat(state);
    } else {
      show('game');
      renderGame(state, prev);
      renderEnd(state, { onLeave: leave });
    }
  });
}

boot().catch((err) => {
  console.error(err);
  problem('Could not start the game. Try reloading.');
});

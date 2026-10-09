// Odds and ends that keep a session running smoothly:
// - the "ship systems rebooting" countdown when the server restarts
// - practice games launch themselves
// - the "who dies tonight?" guess at night, and its result at dawn
// - number keys 1–9 fire emotes straight away
import { $, el, clear, problem, toast } from '../util.js';
import { socket, store, send, suitHex } from '../store.js';
import { sfx } from '../audio.js';

let restartTimer = null;
let restarting = false;

export function initSession() {
  // the server is about to restart (a new version is being deployed)
  socket.on('server-restart', ({ in: seconds }) => {
    restarting = true;
    const box = $('restart-banner');
    clearInterval(restartTimer);
    let left = Math.max(0, Math.round(seconds || 0));
    const show = () => {
      box.textContent = left > 0
        ? `🔄 Ship systems rebooting in ${left}s for an update. Your game is saved and you'll be reconnected automatically.`
        : '🔄 Rebooting ship systems… hold tight, your game is saved.';
      box.hidden = false;
    };
    show();
    if (left > 0) sfx('warn');
    restartTimer = setInterval(() => {
      left = Math.max(0, left - 1);
      show();
    }, 1000);
  });
  // back online: the server sends our state again once we've rejoined
  socket.on('joined', () => {
    if (!restarting) return;
    restarting = false;
    clearInterval(restartTimer);
    $('restart-banner').hidden = true;
    sfx('chime');
    toast('✅ Ship systems back online. Carry on!', 'info', 5000);
  });

  // 1–9: quick emotes
  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, select') || !$('modal').hidden || $('hud').hidden) return;
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > 9 || e.ctrlKey || e.metaKey || e.altKey) return;
    const emote = store.data.playerEmotes[n - 1];
    const you = store.state?.you;
    if (!emote || !you || you.isCaptain || you.isSpectator) return;
    send('emote', { emote }).catch(() => {});
  });
}

let practiceLaunched = null;
let shownGuess = null;

export function renderSession(state, prev) {
  const you = state.you || {};

  // practice: launch as soon as the robots are aboard
  if (state.practice && state.phase === 'lobby' && you.isController && practiceLaunched !== state.code) {
    practiceLaunched = state.code;
    setTimeout(() => send('start').then(() => sfx('whoosh')).catch((e) => problem(e.message)), 1500);
    toast('🎓 Practice game: you and six robot crewmates. Tips will guide you through your first day and night.', 'info', 8000);
  }

  renderGuess(state);

  // the result of last night's guess
  const g = you.lastGuess;
  if (g && state.phase === 'dawn' && shownGuess !== `${state.code}:${g.night}`) {
    shownGuess = `${state.code}:${g.night}`;
    setTimeout(() => toast(g.correct ? '🔮 You called it! +1 point on the season.' : '🔮 Your guess was wrong this time.', g.correct ? 'info' : 'vote', 6000), 2500);
    if (g.correct) setTimeout(() => sfx('chime'), 2500);
  }
}

// "Who dies tonight?" on the night screen (for everyone, so it gives nothing away).
function renderGuess(state) {
  const box = $('night-guess');
  const you = state.you || {};
  const show = state.phase === 'night' && you.id && !you.isCaptain && !you.isSpectator;
  box.hidden = !show;
  if (!show) return;
  const current = you.deathGuess;
  const pick = (target) => send('death-guess', { target }).then(() => sfx('tap')).catch((e) => problem(e.message));
  const living = state.players.filter((p) => p.alive);
  clear(box,
    el('h3', {}, '🔮 Who dies tonight?'),
    el('p', { className: 'hint' }, 'Guess who the Parasite will strike (or that everyone survives). A right guess is a point on the season.'),
    el('div', { className: 'pick-list' },
      el('button', { className: `pick ${current === 'none' ? 'chosen' : ''}`, onclick: () => pick('none') }, '😮 Nobody'),
      ...living.map((p) => el('button', { className: `pick ${current === p.id ? 'chosen' : ''}`, onclick: () => pick(p.id) },
        el('span', { className: 'dot', style: { background: suitHex(p) } }), p.name, p.id === you.id ? ' (you)' : '')),
    ),
  );
}

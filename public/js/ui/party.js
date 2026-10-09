// Party-game touches that keep a group of friends playing together:
// emoji reactions, speaking rings, ghosts' bets and pranks, the dawn recap,
// a 10-second warning, away-from-keyboard detection, a "what now?" line,
// the ship's name, and the rematch warm-up.
import { $, el, clear, problem, toast } from '../util.js';
import { socket, store, send, player, role, serverNow, suitHex } from '../store.js';
import { sfx } from '../audio.js';
import { speakingIds } from '../voice.js';
import { openModal, closeModal } from './rolecard.js';
import { phaseBanner } from './hud.js';
import { ROOMS } from '../world/layout.js';
import { rememberBio } from './extras.js';

const REACT_PHASES = ['dawn', 'meeting', 'nominations', 'lastwords', 'dusk'];
const DAY_PHASES = ['roam', 'meeting', 'nominations'];
const NEXT_PART = { roam: 'the emergency meeting', meeting: 'nominations', nominations: 'dusk' };
const HAUNT_LABELS = { flicker: ['💡', 'Flicker the lights'], crate: ['📦', 'Drop a crate'], cackle: ['🎃', 'Make a pumpkin cackle'] };
const ACTIVE_EVERY_MS = 15_000;

let world = null;

export function initParty(w) {
  world = w;

  // ---------- emoji reactions ----------
  clear($('reactions'), ...store.data.reactions.map((emoji) =>
    el('button', { className: 'react-btn', title: 'React', onclick: () => socket.emit('react', { emoji }, () => {}) }, emoji),
  ));
  socket.on('react', ({ id, emoji }) => {
    world.fx.reaction(id, emoji);
    floatFromSeat(id, emoji);
    if (id !== store.me) sfx('react');
  });

  // ---------- ghosts ----------
  $('btn-haunt').addEventListener('click', () => {
    $('haunt-menu').hidden = !$('haunt-menu').hidden;
    renderHauntMenu();
  });
  $('btn-predict').addEventListener('click', openBet);
  $('ghost-bet-btn').addEventListener('click', openBet);
  socket.on('haunt', ({ kind, room }) => {
    world.fx.haunt(kind, room);
    const here = world.room === room;
    if (kind === 'cackle' && here) sfx('cackle');
    if (kind === 'crate' && here) sfx('thud');
    if (kind === 'flicker' && here) sfx('zap');
    const you = store.state?.you;
    if (here && you && you.alive !== false && !you.isCaptain) {
      toast({ flicker: '💡 The lights in here flicker… something is not alone.', crate: '📦 A crate crashes down out of nowhere!', cackle: '🎃 A pumpkin in here just… cackled.' }[kind], 'evil', 5000);
    }
  });

  // ---------- away from keyboard: tell the server we're still here ----------
  let lastSent = 0;
  const active = () => {
    const now = Date.now();
    const away = store.state?.you?.afk;
    if (away ? now - lastSent < 800 : now - lastSent < ACTIVE_EVERY_MS) return;
    lastSent = now;
    socket.emit('active', {}, () => {});
  };
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, active, { passive: true });

  // ---------- lobby: bio and ship name ----------
  $('lobby-bio').addEventListener('change', (e) => send('bio', { text: e.target.value }).then(() => {
    sfx('pop');
    rememberBio(e.target.value);
  }).catch((er) => problem(er.message)));

  // speaking rings and the countdown run on their own little clocks
  setInterval(updateSpeaking, 120);
  setInterval(updateCountdown, 200);
}

// ---------------------------------------------------------------------------
// Called on every state update
// ---------------------------------------------------------------------------

export function renderParty(state, prev) {
  const you = state.you || {};
  const ghost = !!you.id && !you.isCaptain && you.alive === false;
  const live = state.phase !== 'lobby' && state.phase !== 'ended';

  // the ship's name everywhere
  $('hud-ship').textContent = state.shipName || '';
  $('lobby-ship').textContent = state.shipName || '';
  $('lobby-round').textContent = state.round > 1 ? `Round ${state.round}` : '';

  // reactions during the big moments
  $('reactions').hidden = !(you.id && REACT_PHASES.includes(state.phase));

  // ghost tools
  $('btn-predict').hidden = !(ghost && live);
  $('btn-predict').querySelector('b').textContent = you.prediction ? `Bet: ${player(you.prediction.id)?.name || '?'}` : 'Bet on the Parasite';
  const haunting = ghost && state.phase === 'roam';
  $('btn-haunt').hidden = !haunting;
  if (haunting) $('btn-haunt').querySelector('b').textContent = `Haunt (${you.haunts?.left ?? 0})`;
  if (!haunting) $('haunt-menu').hidden = true;
  else if (!$('haunt-menu').hidden) renderHauntMenu();
  renderNightGhost(state, ghost);

  // the "what do I do now?" line under the timer
  $('hud-todo').textContent = todo(state);

  // lobby bio box (don't overwrite while typing)
  const me = state.players.find((p) => p.id === you.id);
  if (me && document.activeElement !== $('lobby-bio')) $('lobby-bio').value = me.bio || '';
  $('lobby-bio-name').textContent = me?.name || 'You';
  renderShipNameEditor(state);
  renderSeasonBox(state);

  if (!prev || prev.code !== state.code) return;
  // previously on No More Space…
  if (state.phase === 'dawn' && prev.phase !== 'dawn') showRecap(state);
  // a rematch: the crew warms up with a dance
  if (state.phase === 'lobby' && state.rematchAt && state.rematchAt !== prev.rematchAt) warmUp(state);
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

function floatFromSeat(id, emoji) {
  const seat = document.querySelector(`#ring .seat[data-id="${id}"]`);
  const box = seat && seat.getBoundingClientRect().width ? seat.getBoundingClientRect() : $('reactions').getBoundingClientRect();
  if (!box.width) return;
  const f = el('span', { className: 'react-float' }, emoji);
  f.style.left = `${box.left + box.width / 2 + (Math.random() - 0.5) * 24}px`;
  f.style.top = `${box.top}px`;
  document.body.append(f);
  setTimeout(() => f.remove(), 1700);
}

// ---------------------------------------------------------------------------
// Speaking rings
// ---------------------------------------------------------------------------

function updateSpeaking() {
  if (!world) return;
  const ids = speakingIds();
  world.fx.setSpeaking(ids);
  for (const seat of document.querySelectorAll('#ring .seat')) seat.classList.toggle('speaking', ids.has(seat.dataset.id));
}

// ---------------------------------------------------------------------------
// Ghosts: bets and haunting
// ---------------------------------------------------------------------------

function openBet() {
  const state = store.state;
  const you = state?.you;
  if (!you) return;
  const current = you.prediction;
  const changedToday = current?.changedDay === state.day;
  const pick = (p) => send('predict', { target: p.id })
    .then(() => {
      sfx('blip');
      toast(`🔮 Your secret bet: ${p.name} is the Parasite.`, 'evil', 5000);
      closeModal();
    })
    .catch((e) => problem(e.message));
  openModal(el('div', { className: 'bet-picker' },
    el('h2', {}, '🔮 Bet on the Parasite'),
    el('p', { className: 'hint' }, 'Only the dead can bet, and nobody sees your bet until the end. The first ghost to bet on the real Parasite (and keep the bet) wins the 👻 Psychic award. ',
      current ? (changedToday ? 'You already changed your bet today.' : 'You can change your bet once a day.') : 'Your first bet is free.'),
    el('div', { className: 'pick-list' }, ...state.players.filter((p) => p.id !== you.id).map((p) =>
      el('button', { className: `pick ${current?.id === p.id ? 'chosen' : ''} ${p.alive ? '' : 'dead'}`, disabled: changedToday && current?.id !== p.id, onclick: () => pick(p) },
        el('span', { className: 'dot', style: { background: suitHex(p) } }), p.name, p.alive ? '' : ' 👻'),
    )),
  ));
}

function renderHauntMenu() {
  const state = store.state;
  const left = state?.you?.haunts?.left ?? 0;
  const roomName = ROOMS.find((r) => r.id === world.room)?.name;
  clear($('haunt-menu'),
    el('div', { className: 'hint' }, roomName ? `👻 Haunting ${roomName} · ${left} left today` : '👻 Float into a room to haunt it.'),
    ...store.data.haunts.map((kind) => el('button', {
      className: 'small', disabled: !roomName || left <= 0,
      onclick: () => send('haunt', { kind }).then(() => ($('haunt-menu').hidden = true)).catch((e) => problem(e.message)),
    }, `${HAUNT_LABELS[kind][0]} ${HAUNT_LABELS[kind][1]}`)),
  );
}

// At night the dead get their own card: gossip channel + bet.
function renderNightGhost(state, ghost) {
  const show = ghost && state.phase === 'night';
  $('night-ghost').hidden = !show;
  if (!show) return;
  const bet = state.you.prediction;
  $('ghost-bet').textContent = bet ? `🔮 Your bet: ${player(bet.id)?.name || '?'}` : '🔮 No bet yet.';
}

// ---------------------------------------------------------------------------
// "Previously on No More Space…": a recap card at dawn
// ---------------------------------------------------------------------------

function recapLines(state) {
  const name = (id) => player(id)?.name || '?';
  const yesterday = state.day - 1;
  const lines = [];
  for (const e of state.dayLog || []) {
    if (e.day !== yesterday) continue;
    if (e.k === 'airlock') lines.push(`🚪 ${name(e.id)} was airlocked (${e.votes} vote${e.votes === 1 ? '' : 's'}).`);
    if (e.k === 'sentinel') lines.push(`⚡ ${name(e.id)} was fried by the Sentinel.`);
    if (e.k === 'noexec') lines.push('🤷 Nobody was airlocked.');
    if (e.k === 'shot') lines.push(`🔫 ${name(e.a)} shot at ${name(e.t)}${e.hit ? ' and hit!' : '. Nothing happened.'}`);
  }
  const claims = new Map();
  for (const e of state.dayLog || []) if (e.k === 'claim' && e.day === yesterday) claims.set(e.id, e.role);
  for (const [id, r] of [...claims].slice(-3)) lines.push(`📣 ${name(id)} claimed ${role(r)?.name || r}.`);
  const dawn = [...(state.dayLog || [])].reverse().find((e) => e.k === 'dawn' && e.day === state.day);
  if (dawn) lines.push(dawn.deaths.length ? `💀 ${dawn.deaths.map(name).join(' and ')} died in the night.` : '😮 Nobody died in the night.');
  return lines.slice(-5);
}

function showRecap(state) {
  if (state.day < 2) return;
  const lines = recapLines(state);
  if (!lines.length) return;
  const card = $('recap');
  clear(card, el('div', { className: 'recap-title' }, '📼 Previously on No More Space…'), ...lines.map((l) => el('div', { className: 'recap-line' }, l)));
  card.hidden = false;
  card.classList.remove('out');
  clearTimeout(showRecap.t);
  clearTimeout(showRecap.t2);
  showRecap.t = setTimeout(() => card.classList.add('out'), 7500);
  showRecap.t2 = setTimeout(() => (card.hidden = true), 8200);
}

// ---------------------------------------------------------------------------
// The 10-second warning
// ---------------------------------------------------------------------------

let warned = null;
let lastSecond = null;
function updateCountdown() {
  const state = store.state;
  const box = $('countdown');
  const timed = state && state.autoAdvance && DAY_PHASES.includes(state.phase) && !state.nomination && !state.paused && state.phaseEndsAt;
  const left = timed ? state.phaseEndsAt - serverNow() : Infinity;
  if (!(left <= 10_000 && left > 0)) {
    box.hidden = true;
    return;
  }
  const secs = Math.ceil(left / 1000);
  if (warned !== state.phaseEndsAt) {
    warned = state.phaseEndsAt;
    sfx('warn');
    toast(`⏳ 10 seconds until ${NEXT_PART[state.phase]}. Wrap it up!`, 'vote', 4000);
  }
  if (secs !== lastSecond) {
    lastSecond = secs;
    if (secs <= 5) sfx('count');
    box.classList.remove('pop');
    void box.offsetWidth;
    box.classList.add('pop');
  }
  box.hidden = false;
  box.textContent = secs;
}

// ---------------------------------------------------------------------------
// "What do I do now?"
// ---------------------------------------------------------------------------

// One line per role for the day, in plain words.
const ROLE_DAY = {
  comms: 'One of your two players is that Crew role. Ask them both what they are.',
  archivist: 'You know a Drifter (or that there are none). Check who claims what.',
  security: 'One of your two players is a Saboteur. Watch whose story is weakest.',
  navigator: 'Your number says how many evil players sit side by side. Look at the seats.',
  engineer: 'Your number comes at dawn. Find out who sits next to you.',
  scanner: 'Share your scans carefully. A "yes" might be the ghost signal.',
  coroner: 'Tonight you learn what the airlocked player really was.',
  medic: 'Decide who to shield tonight. Protect whoever knows the most.',
  blackbox: 'If you die tonight you get one role check. Who would you look at?',
  sentinel: 'If a Crew player nominates you, they get zapped. Use it to prove yourself.',
  gunner: 'You have one shot all game. Only fire when you are fairly sure.',
  marine: 'The Parasite cannot kill you at night, so you can say risky things.',
  firstofficer: 'With 3 left and no airlocking, the crew wins. Keep yourself alive.',
  droid: 'You can only vote when your master votes. Pick a good master tonight.',
  drunk: 'Share what you learned, but remember: not every honest player is right.',
  stowaway: 'You might look evil to some abilities. Explain early that you are good.',
  ambassador: 'If you are airlocked, the crew loses. Do not get nominated!',
  hacker: 'Blend in. Pick a believable bluff and back the Parasite up.',
  mimic: 'You saw the Manifest. Use it to make perfect bluffs, quietly.',
  incubator: 'Stay unsuspicious. If the Parasite dies, you take over.',
  smuggler: 'There are extra Drifters aboard. A Drifter is a safe bluff.',
  jester: 'Your victim is seeing things today. Enjoy the chaos you caused.',
  parasite: 'Pick a believable bluff, point suspicion elsewhere and stay calm.',
};

function todo(state) {
  const you = state.you || {};
  if (!you.id || state.phase === 'lobby' || state.phase === 'ended') return '';
  if (you.isCaptain) return '👨‍✈️ Run the show from the Command Station.';
  if (you.isSpectator) return '👀 You are watching from the gallery. You join the crew at the next rematch.';
  const r = role(you.role);
  if (you.alive === false) {
    if (state.phase === 'night') return '👻 Gossip with the other ghosts and place your bet.';
    if (state.phase === 'roam') return `👻 Haunt the living (${you.haunts?.left ?? 0} left) and bet on the Parasite.`;
    return you.ghostVote ? '👻 You still have one ghost vote. Save it for when it matters.' : '👻 Watch, react and keep your bet up to date.';
  }
  switch (state.phase) {
    case 'night':
      return you.prompt && !you.prompt.done ? `🌙 Choose your ${r?.name || ''} target before dawn.` : '🌙 Sleep tight, or paint something for the walls.';
    case 'dawn':
      return '☀️ Who died? Think about who gains from it.';
    case 'roam':
      return `${r ? `${r.icon} ` : ''}${ROLE_DAY[you.role] || 'Explore, talk in rooms and do tasks.'}`;
    case 'meeting':
      return '🗣️ Share what you know, and tell everyone your claim (C).';
    case 'nominations':
      if (state.nomination) return state.nomination.stage === 'count' ? '🕐 Watch the votes being revealed.' : '🗳️ Vote YES or NO (Y / N) before the count.';
      return player(you.id)?.nominatedSomeone ? '⏭️ Press Ready when you have nothing more to say.' : '☝️ Nominate a suspect, or press Ready.';
    case 'lastwords':
      return state.lastWords?.id === you.id ? '🎤 Your last words! Type them in the chat.' : '🎤 Listen to the last words, and react!';
    case 'dusk':
      return '🌇 The day is over. Night is coming.';
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Lobby: ship name, season scores, rematch warm-up
// ---------------------------------------------------------------------------

function renderShipNameEditor(state) {
  const box = $('lobby-shipname');
  const ctl = state.you?.isController;
  box.hidden = !ctl || state.phase !== 'lobby';
  if (box.hidden || document.activeElement === $('shipname-input')) return;
  if (!box.firstChild) {
    box.append(
      el('label', {}, 'Ship name',
        el('div', { className: 'row' },
          el('input', { id: 'shipname-input', maxLength: 28, placeholder: 'The Wobbly Goose', onchange: (e) => send('ship-name', { name: e.target.value }).catch((er) => problem(er.message)) }),
          el('button', { className: 'small', title: 'Random name', onclick: () => send('ship-name', { name: '' }).catch((er) => problem(er.message)) }, '🎲'),
        ),
      ),
    );
  }
  $('shipname-input').value = state.shipName || '';
}

function renderSeasonBox(state) {
  const box = $('lobby-season');
  box.hidden = !(state.season && state.phase === 'lobby');
  if (!box.hidden) clear(box, seasonTable(state.season));
}

// The evening's running scores (also shown on the end screen).
export function seasonTable(season) {
  if (!season) return null;
  return el('div', { className: 'season' },
    el('h3', {}, `🏆 Tonight's season · ${season.games} game${season.games === 1 ? '' : 's'}`),
    el('table', { className: 'season-table' },
      el('tr', {}, el('th', {}, ''), el('th', {}, 'Crew'), el('th', { title: 'Points: 3 per win, 1 per award' }, 'Pts'), el('th', { title: 'Wins' }, '🏆'), el('th', { title: 'Times eaten by the Parasite' }, '🦑'), el('th', { title: 'Times airlocked' }, '🚪'), el('th', { title: 'Best Liar awards' }, '🎭')),
      ...season.rows.map((r, i) => el('tr', {},
        el('td', {}, ['🥇', '🥈', '🥉'][i] || `${i + 1}`),
        el('td', {}, r.name),
        el('td', {}, el('b', {}, r.points)),
        el('td', {}, r.wins),
        el('td', {}, r.eaten),
        el('td', {}, r.airlocked),
        el('td', {}, r.liar),
      )),
    ),
  );
}

function warmUp(state) {
  phaseBanner(`🔁 Round ${state.round}!`, 'Same crew, fresh lies. Warm-up dance!', 5000);
  sfx('fanfare');
  state.players.forEach((p, i) => setTimeout(() => world.emote(p.id, i % 3 === 0 ? 'confetti' : 'dance'), 200 + i * 120));
}

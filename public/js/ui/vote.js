// Nominations made for playing online: a Nominate button with a picker, and
// a vote panel where everyone votes YES or NO at the same time (you can
// change your mind until the count). Then the clock hand sweeps round the
// table revealing each vote, like Blood on the Clocktower's hands.
import { $, el, clear, formatTime, problem } from '../util.js';
import { store, send, serverNow, player } from '../store.js';
import { sfx } from '../audio.js';

let pickOpen = false;
let picked = null;

export function initVote() {
  $('btn-nominate').addEventListener('click', () => {
    pickOpen = !pickOpen;
    picked = null;
    renderVote(store.state);
  });
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select') || $('hud').hidden) return;
    const k = e.key.toLowerCase();
    if (k === 'y') vote(true);
    if (k === 'n') vote(false);
  });
  setInterval(tickTimer, 250);
}

const name = (id) => player(id)?.name || '?';

export function canNominate(state = store.state) {
  const you = state?.you;
  const me = you && player(you.id);
  return !!(state?.phase === 'nominations' && !state.nomination && you && !you.isCaptain && you.alive && me && !me.nominatedSomeone);
}

function canVote(state) {
  const you = state.you || {};
  return !!you.id && !you.isCaptain && (you.alive || you.ghostVote);
}

export function vote(up) {
  const state = store.state;
  const nom = state?.nomination;
  if (!nom || nom.stage === 'count' || !canVote(state)) return;
  send('hand', { up }).then(() => sfx(up ? 'hand' : 'click')).catch((e) => problem(e.message));
}

// Open the picker, optionally with someone already chosen (clicking a seat).
export function openNominate(id = null) {
  if (!canNominate()) return;
  pickOpen = true;
  picked = id;
  renderVote(store.state);
}

export function nominate(id) {
  send('nominate', { target: id })
    .then(() => {
      sfx('gavel');
      pickOpen = false;
      picked = null;
    })
    .catch((e) => problem(e.message));
}

// YES votes needed to put someone on the block.
function needed(state) {
  return Math.max(state.threshold, (state.block?.votes || 0) + (state.block?.id ? 1 : 0));
}

function tickTimer() {
  const nom = store.state?.nomination;
  const t = document.getElementById('vote-timer');
  if (t && nom) t.textContent = nom.stage === 'count' ? '' : formatTime(nom.stageEndsAt - serverNow());
}

export function renderVote(state) {
  if (!state) return;
  const panel = $('vote-panel');
  const picker = $('nominate-menu');
  const nom = state.nomination;
  const you = state.you || {};

  // ---- Nominate button + picker ----
  const nominator = canNominate(state);
  $('btn-nominate').hidden = !nominator;
  if (!nominator) pickOpen = false;
  picker.hidden = !pickOpen;
  if (pickOpen) {
    const options = state.players.filter((p) => p.alive && !p.nominated);
    clear(picker,
      el('div', { className: 'rooms-head' }, el('b', {}, '☝️ Who should go out the airlock?'), el('button', { className: 'small ghost', onclick: () => { pickOpen = false; renderVote(store.state); } }, '✕')),
      el('div', { className: 'hint' }, `You can nominate once per day, and each player can only be nominated once. They need ${needed(state)} YES votes to go on the block.`),
      el('div', { className: 'room-list' }, ...options.map((p) =>
        el('button', { className: `room-row ${picked === p.id ? 'here' : ''}`, onclick: () => { picked = p.id; renderVote(store.state); } },
          el('span', { className: 'room-ico' }, p.id === you.id ? '🙋' : '🧑‍🚀'),
          el('span', { className: 'room-main' }, el('b', {}, p.id === you.id ? `${p.name} (you)` : p.name)),
          el('span', { className: 'room-go' }, picked === p.id ? '✔' : ''),
        ),
      )),
      el('button', { className: 'primary', disabled: !picked, onclick: () => nominate(picked) }, picked ? `☝️ Nominate ${name(picked)}` : 'Pick a player'),
    );
  }

  // ---- Vote panel ----
  const last = state.lastNomination;
  const showResult = !nom && last && ['nominations', 'dusk'].includes(state.phase) && serverNow() - last.at < 7000;
  panel.hidden = !nom && !showResult;
  if (panel.hidden) return;

  if (!nom) {
    const yesNames = last.voters.map(name);
    clear(panel,
      el('div', { className: 'vote-stage' }, '🗳️ RESULT'),
      el('div', { className: 'vote-title' }, el('b', {}, name(last.nominee)), ` got ${last.votes} vote${last.votes === 1 ? '' : 's'} (${last.threshold} needed)`),
      el('div', { className: `vote-outcome ${last.result}` }, { block: '☠️ On the block! Airlocked at dusk unless someone gets more votes.', tie: '⚖️ A tie: nobody is on the block.', safe: '🛟 Safe for now.' }[last.result]),
      el('div', { className: 'hint' }, yesNames.length ? `✋ YES: ${yesNames.join(', ')}` : 'Nobody voted YES.'),
    );
    return;
  }

  const stageText = {
    accuse: `🗣️ ${name(nom.nominator)} explains why`,
    defend: `🛡️ ${name(nom.nominee)} defends themself`,
    vote: '🗳️ Vote now!',
    count: '🕐 Counting the votes…',
  }[nom.stage];
  const mine = nom.hands[you.id];
  const cast = nom.cast?.includes(you.id);
  const voter = canVote(state);
  const counting = nom.stage === 'count';
  const yesRevealed = Object.entries(nom.hands).filter(([id, up]) => up && nom.locked[id]).length;
  const eligible = state.players.filter((p) => p.connected && (p.alive || p.ghostVote)).length;
  const speaker = (nom.stage === 'accuse' && nom.nominator === you.id) || (nom.stage === 'defend' && nom.nominee === you.id);

  let note = null;
  if (!voter && !you.isCaptain) note = '👻 You have used your ghost vote.';
  else if (voter && !you.alive) note = '👻 Voting YES uses your one ghost vote.';
  else if (you.master) note = `🤖 Your YES only counts if ${name(you.master)} votes YES too.`;

  clear(panel,
    el('div', { className: 'vote-stage' }, stageText, ' ', el('span', { id: 'vote-timer', className: 'vote-timer' }, '')),
    el('div', { className: 'vote-title' }, el('b', {}, name(nom.nominator)), ' nominates ', el('b', { className: 'nominee' }, name(nom.nominee))),
    voter ? el('div', { className: 'vote-buttons' },
      el('button', { className: `vote-btn yes ${mine === true ? 'on' : ''}`, disabled: counting, onclick: () => vote(true) }, '✋ YES', el('small', {}, 'airlock them'), el('kbd', {}, 'Y')),
      el('button', { className: `vote-btn no ${cast && !mine ? 'on' : ''}`, disabled: counting, onclick: () => vote(false) }, '🙅 NO', el('small', {}, 'spare them'), el('kbd', {}, 'N')),
    ) : null,
    el('div', { className: 'hint' },
      counting
        ? `✋ ${yesRevealed} YES so far · needs ${needed(state)}${state.block?.id ? ` (to beat ${name(state.block.id)})` : ''}`
        : `${nom.cast?.length || 0} of ${eligible} have voted · needs ${needed(state)} YES${state.block?.id ? ` to beat ${name(state.block.id)}` : ''}`),
    voter && !counting ? el('div', { className: 'hint' }, cast ? 'You can change your vote until the count starts.' : 'Not voting counts as NO. Votes stay secret until the count.') : null,
    note ? el('div', { className: 'hint' }, note) : null,
    speaker ? el('button', { className: 'small', onclick: () => send('done-speaking').catch(() => {}) }, '🎤 I\'m done speaking') : null,
    you.isController && !counting && !speaker ? el('button', { className: 'small ghost', onclick: () => send('done-speaking').catch(() => {}) }, '⏩ Skip ahead') : null,
  );
  tickTimer();
}

// Today's nominations, for the bridge table panel.
export function votesTodayList(state) {
  const list = state.votesToday || [];
  if (!list.length || state.phase !== 'nominations') return null;
  const icon = { block: '☠️', tie: '⚖️', safe: '🛟' };
  return el('div', { className: 'votes-today' },
    el('div', { className: 'stage' }, "TODAY'S VOTES"),
    ...list.map((v) => el('div', { className: 'vt-row', title: v.voters.length ? `YES: ${v.voters.map(name).join(', ')}` : 'No YES votes' },
      el('span', {}, `${icon[v.result]} ${name(v.nominee)}`),
      el('small', {}, `by ${name(v.nominator)} · ${v.votes}/${v.threshold}`),
    )),
  );
}


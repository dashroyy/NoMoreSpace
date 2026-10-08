// Runs in the player's browser. It sends what the player clicks to the server,
// and redraws the screen whenever the server sends a new game state.

const socket = io();
const $ = (id) => document.getElementById(id);

const saved = JSON.parse(localStorage.getItem('nms-seat') || 'null'); // { code, token, name }
$('name').value = saved?.name || '';

// Rejoin automatically after a refresh or lost connection.
socket.on('connect', () => {
  const seat = JSON.parse(localStorage.getItem('nms-seat') || 'null');
  if (seat?.code && seat?.token) socket.emit('join', seat);
});

$('create').onclick = () => socket.emit('create', { name: $('name').value });
$('join').onclick = () => socket.emit('join', { code: $('code').value, name: $('name').value });

socket.on('joined', ({ code, token }) => {
  localStorage.setItem('nms-seat', JSON.stringify({ code, token, name: $('name').value }));
});

socket.on('problem', (message) => {
  // A stale saved seat (server restarted) shouldn't trap you on an error.
  if (message === 'No ship with that code.') localStorage.removeItem('nms-seat');
  $('problem').textContent = message;
  setTimeout(() => ($('problem').textContent = ''), 4000);
});

socket.on('state', render);

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

const PHASE_LABELS = { lobby: 'Docked', night: 'Night', day: 'Day', ended: 'Mission over' };

function render(state) {
  const me = state.you;
  const isHost = state.hostId === me.id;

  $('home').hidden = true;
  $('game').hidden = false;
  $('room-code').textContent = state.code;
  $('phase').textContent = state.phase === 'lobby' ? PHASE_LABELS.lobby : `${PHASE_LABELS[state.phase]} ${state.round}`;

  // Role card
  const card = $('role-card');
  card.hidden = !me.role;
  if (me.role) {
    card.className = `role-card ${me.role.team}`;
    card.replaceChildren(
      el('h3', { textContent: `${me.role.name}${me.alive ? '' : ' (dead)'}` }),
      el('p', { textContent: me.role.description }),
    );
  }

  // What should I be doing right now?
  let prompt = '';
  if (state.phase === 'lobby') {
    prompt = `Waiting for crew (${state.players.length}/${state.minPlayers} minimum). Share the code ${state.code}!`;
  } else if (state.phase === 'night') {
    prompt = me.mustActTonight ? 'Choose your target below.' : 'Close your eyes. Others are acting...';
  } else if (state.phase === 'day') {
    if (!me.canVote) prompt = 'You have used your ghost vote. Watch and whisper.';
    else if (me.hasVoted) prompt = 'Vote locked in. Waiting for the others...';
    else prompt = me.alive ? 'Who should be airlocked?' : 'You are a ghost. You get ONE vote for the rest of the game.';
  } else if (state.phase === 'ended') {
    prompt = state.winner === 'crew' ? 'The crew wins!' : 'The infiltrators win!';
  }
  $('prompt').textContent = prompt;

  // Player list (with action buttons when relevant)
  const actionVerb = { kill: 'Consume', protect: 'Shield', scan: 'Scan' }[me.role?.night];
  $('players').replaceChildren(
    ...state.players.map((p) => {
      const li = el('li', { className: `${p.alive ? '' : 'dead'} ${p.connected ? '' : 'offline'}` });
      const label = el('span', { className: 'name', textContent: p.name + (p.id === me.id ? ' (you)' : '') });
      const info = el('span');

      if (p.id === state.hostId && state.phase === 'lobby') info.append(el('span', { className: 'tag', textContent: 'host' }));
      if (p.role) info.append(el('span', { className: `tag ${p.team}`, textContent: p.role }));
      if (state.phase === 'day' && p.hasVoted) info.append(el('span', { className: 'tag', textContent: 'voted ' }));

      if (state.phase === 'night' && me.mustActTonight && p.alive) {
        info.append(el('button', { textContent: actionVerb, onclick: () => socket.emit('night-action', { targetId: p.id }) }));
      }
      if (state.phase === 'day' && me.canVote && !me.hasVoted && p.alive) {
        info.append(el('button', { textContent: 'Airlock', onclick: () => socket.emit('vote', { targetId: p.id }) }));
      }

      li.append(label, info);
      return li;
    }),
  );

  // Extra buttons
  const controls = [];
  if (state.phase === 'lobby' && isHost) {
    controls.push(el('button', {
      textContent: 'Launch',
      disabled: state.players.length < state.minPlayers,
      onclick: () => socket.emit('start'),
    }));
  }
  if (state.phase === 'day' && me.canVote && !me.hasVoted) {
    controls.push(el('button', { className: 'secondary', textContent: 'Skip vote', onclick: () => socket.emit('vote', { targetId: 'skip' }) }));
  }
  if (state.phase === 'day' && isHost) {
    controls.push(el('button', { className: 'secondary', textContent: 'Close voting', onclick: () => socket.emit('end-day') }));
  }
  if (state.phase === 'ended') {
    controls.push(el('button', {
      textContent: 'Leave ship',
      onclick: () => { localStorage.removeItem('nms-seat'); location.reload(); },
    }));
  }
  $('controls').replaceChildren(...controls);

  // Logs, newest first
  $('messages').replaceChildren(...[...me.messages].reverse().map((m) => el('li', { textContent: m.text })));
  $('log').replaceChildren(...[...state.log].reverse().map((m) => el('li', { textContent: m.text })));
}

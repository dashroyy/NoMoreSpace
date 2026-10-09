// Night: the action card for roles that wake, the drawing pad for everyone.
import { $, el, clear, problem, toast, formatTime } from '../util.js';
import { store, send, role, suitHex, serverNow } from '../store.js';
import { sfx } from '../audio.js';

const INSTRUCTIONS = {
  hacker: (n) => `Choose a player to glitch. Their ability malfunctions tonight and tomorrow.`,
  jester: () => 'Choose a player to prank. All tomorrow they will see things that are not there: fake crewmates, a space whale, whispers from nobody… and a fake clue.',
  medic: () => 'Choose a player (not yourself) to shield from the Parasite tonight.',
  parasite: () => 'Choose a victim. (Choose yourself to jump hosts: you die and a Saboteur becomes the Parasite.)',
  scanner: () => 'Choose 2 players to scan for the Parasite.',
  droid: () => 'Choose your master. Tomorrow you may only vote when they vote.',
};

let chosen = [];
let lastNight = null;
let dirty = false; // something has been drawn that is not pinned up yet
let lastAutoPin = 0;

// ---------------------------------------------------------------------------
// "I'm done": the night ends when everyone is ready (or when the timer runs out)
// ---------------------------------------------------------------------------

function renderReady(state) {
  const you = state.you;
  const btn = $('night-ready');
  const needsChoice = !!(you.alive && you.prompt && !you.prompt.done) || !!(you.blackbox && !you.blackbox.done);
  const count = `${new Set([...(state.ready || []), ...(state.afk || [])]).size}/${state.readyNeeded || 0}`;
  btn.disabled = needsChoice;
  btn.classList.toggle('on', !!you.ready);
  btn.textContent = needsChoice ? '🌙 Make your choice first' : you.ready ? `✓ Ready for dawn ${count} (tap to wait)` : `🌙 I'm done: ready for dawn ${count}`;
  updateNightNote();
}

function updateNightNote() {
  const state = store.state;
  const note = $('night-ready-note');
  if (!note || !state || state.phase !== 'night') return;
  const left = state.phaseEndsAt ? Math.max(0, state.phaseEndsAt - serverNow()) : null;
  const wait = left == null ? '' : ` Dawn comes by itself in ${formatTime(left)}.`;
  note.textContent = state.you?.ready ? `Waiting for everyone else.${wait}` : `When everyone is ready, dawn comes early.${wait}`;
}

// Pin whatever is on the canvas. auto: nobody pressed the button (the night is ending, or they pressed Ready).
function pinDrawing(auto = false) {
  const canvas = $('draw-canvas');
  if (!canvas || !dirty) return Promise.resolve(false);
  dirty = false;
  return send('drawing', { data: canvas.toDataURL('image/png'), signed: $('draw-signed').checked })
    .then(() => {
      sfx('chime');
      $('draw-send').textContent = 'Pinned! (send again to replace)';
      if (auto) toast('🎨 Your drawing was pinned to the wall for you.', 'info', 4000);
      return true;
    })
    .catch((e) => {
      dirty = true; // try again
      if (!auto) problem(e.message);
      return false;
    });
}

// The night just ended: a drawing still not pinned is sent straight away (the server takes it for a few seconds more).
export function flushDrawing() {
  return pinDrawing(true);
}

function nightNote(r, state) {
  if (!r) return 'Sleep tight.';
  if (r.type === 'parasite' && !state.you.prompt) return 'The Parasite does not hunt on the first night. Plan your cover story: check your role card (R) for safe bluffs if you have them.';
  if (r.night?.other && !r.night.first && state.night === 1) return 'You wake from tomorrow night onwards. For now: sleep, plan, and maybe paint.';
  if (r.night?.first || r.night?.other) return 'If your role learns something, it will appear at dawn (and in your role card, R).';
  return 'Your role does not wake at night. Sleep tight, or paint something unsettling for the crew to find tomorrow…';
}

export function renderNight(state) {
  const you = state.you;
  const box = $('night-action');
  $('night-title').textContent = `Night ${state.night}`;
  if (state.night !== lastNight) {
    lastNight = state.night;
    chosen = [];
    resetDrawing();
  }
  if (!you || you.isCaptain) return;
  renderReady(state);
  const r = role(you.role);

  if (you.blackbox && !you.blackbox.done) {
    return renderPicker(box, state, {
      icon: '📼', title: 'Your Black Box activates!', text: 'You were killed in the night. With your last flicker of power, choose a player to learn their role.', choose: 1, target: 'any', notSelf: false,
    });
  }
  if (!you.alive) {
    clear(box, el('h3', {}, '👻 You are a ghost'), el('p', {}, 'The dead do not wake at night, but they can still paint, gossip on the ghost channel and update their bet on the Parasite. Tomorrow, while the crew explores, you can haunt them. You can still talk, and you have ' + (you.ghostVote ? 'one ghost vote left.' : 'no vote left.')));
    return;
  }
  const prompt = you.prompt;
  if (!prompt) {
    clear(box,
      el('div', { className: 'role-line' }, el('span', { className: 'ico' }, r?.icon || '😴'), el('div', {}, el('h3', {}, r ? r.name : 'Asleep'), el('div', { className: 'hint' }, 'Nothing to choose tonight.'))),
      el('p', {}, nightNote(r, state)),
    );
    return;
  }
  if (prompt.done) {
    const names = (prompt.chosen || []).map((id) => state.players.find((p) => p.id === id)?.name).join(' & ');
    clear(box, el('div', { className: 'role-line' }, el('span', { className: 'ico' }, r.icon), el('div', {}, el('h3', {}, r.name), el('div', { className: 'hint' }, `You chose ${names}. Now wait for dawn…`))));
    return;
  }
  renderPicker(box, state, { icon: r.icon, title: r.name, text: INSTRUCTIONS[prompt.role]?.() || 'Choose.', choose: prompt.choose, target: prompt.target, notSelf: prompt.notSelf });
}

function renderPicker(box, state, { icon, title, text, choose, target, notSelf }) {
  const you = state.you;
  const options = state.players.filter((p) => (target === 'any' || p.alive) && !(notSelf && p.id === you.id));
  const list = el('div', { className: 'pick-list' }, ...options.map((p) =>
    el('button', {
      className: `pick ${chosen.includes(p.id) ? 'chosen' : ''} ${p.alive ? '' : 'dead'}`,
      onclick: () => {
        if (chosen.includes(p.id)) chosen = chosen.filter((x) => x !== p.id);
        else {
          chosen.push(p.id);
          if (chosen.length > choose) chosen.shift();
        }
        sfx('click');
        renderPicker(box, store.state, { icon, title, text, choose, target, notSelf });
      },
    }, el('span', { className: 'dot', style: { background: suitHex(p) } }), `${p.name}${p.id === you.id ? ' (you)' : ''}${p.alive ? '' : ' 👻'}`),
  ));
  const confirm = el('button', {
    className: 'primary', disabled: chosen.length !== choose,
    onclick: () => {
      send('choose', { targets: chosen }).then(() => sfx('lock')).catch((e) => problem(e.message));
    },
  }, chosen.length === choose ? 'Confirm' : `Pick ${choose - chosen.length} more`);
  clear(box,
    el('div', { className: 'role-line' }, el('span', { className: 'ico' }, icon), el('div', {}, el('h3', {}, title), el('div', { className: 'hint' }, 'If you don\'t choose in time, ARIA picks at random.'))),
    el('p', {}, text),
    list,
    confirm,
  );
}

// ---------------------------------------------------------------------------
// Drawing pad
// ---------------------------------------------------------------------------

const COLORS = ['#111111', '#ffffff', '#d7263d', '#f08a24', '#f5d327', '#7fe33b', '#1f8f4e', '#38d6e8', '#1f5fd1', '#7b3fe4', '#ee6fb6', '#7a4e2d'];
const BG = '#f6f3ea';
let pen = { color: '#111111', size: 4 };
let drawing = false;
let last = null;

export function initDrawing() {
  const canvas = $('draw-canvas');
  const g = canvas.getContext('2d');
  resetDrawing();
  const tools = $('draw-tools');
  const renderTools = () => {
    clear(tools,
      ...COLORS.map((c) => el('button', { className: `pen ${pen.color === c ? 'selected' : ''}`, style: { background: c }, title: c, onclick: () => { pen.color = c; renderTools(); } })),
      el('button', { className: `size ${pen.color === BG ? 'selected' : ''}`, onclick: () => { pen.color = BG; renderTools(); } }, '🧽 Eraser'),
      ...[[2, 'S'], [5, 'M'], [12, 'L']].map(([s, label]) => el('button', { className: `size ${pen.size === s ? 'selected' : ''}`, onclick: () => { pen.size = s; renderTools(); } }, label)),
    );
  };
  renderTools();

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
  };
  canvas.addEventListener('pointerdown', (e) => {
    drawing = true;
    dirty = true;
    last = pos(e);
    canvas.setPointerCapture(e.pointerId);
    g.fillStyle = pen.color;
    g.beginPath();
    g.arc(last.x, last.y, pen.size / 2, 0, Math.PI * 2);
    g.fill();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pos(e);
    g.strokeStyle = pen.color;
    g.lineWidth = pen.size;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(last.x, last.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    last = p;
  });
  const stop = () => (drawing = false);
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  $('draw-clear').addEventListener('click', resetDrawing);
  $('draw-send').addEventListener('click', () => {
    dirty = true;
    pinDrawing(false);
  });

  // Ready: pin the drawing first (readying may be the very thing that ends the night)
  $('night-ready').addEventListener('click', async () => {
    const up = !store.state?.you?.ready;
    if (up) await pinDrawing(true);
    send('ready', { on: up }).then(() => sfx(up ? 'lock' : 'click')).catch((e) => problem(e.message));
  });

  // In the last few seconds, anyone who has started drawing gets their picture pinned automatically
  setInterval(() => {
    const state = store.state;
    updateNightNote();
    if (!dirty || state?.phase !== 'night' || !state.phaseEndsAt || state.paused) return;
    if (state.phaseEndsAt - serverNow() < 6000 && Date.now() - lastAutoPin > 2000) {
      lastAutoPin = Date.now();
      pinDrawing(true);
    }
  }, 500);
}

function resetDrawing() {
  const canvas = $('draw-canvas');
  if (!canvas) return;
  dirty = false;
  const g = canvas.getContext('2d');
  g.fillStyle = BG;
  g.fillRect(0, 0, canvas.width, canvas.height);
  $('draw-send').textContent = 'Pin it to the wall';
}

// Night: the action card for roles that wake, the drawing pad for everyone.
import { $, el, clear, problem } from '../util.js';
import { store, send, role, suitHex } from '../store.js';
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
  const r = role(you.role);

  if (you.blackbox && !you.blackbox.done) {
    return renderPicker(box, state, {
      icon: '📼', title: 'Your Black Box activates!', text: 'You were killed in the night. With your last flicker of power, choose a player to learn their role.', choose: 1, target: 'any', notSelf: false,
    });
  }
  if (!you.alive) {
    clear(box, el('h3', {}, '👻 You are a ghost'), el('p', {}, 'The dead do not wake at night, but they can still haunt the walls with art. Tomorrow you can still talk, and you have ' + (you.ghostVote ? 'one ghost vote left.' : 'no vote left.')));
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
    const data = canvas.toDataURL('image/png');
    send('drawing', { data, signed: $('draw-signed').checked })
      .then(() => {
        sfx('chime');
        $('draw-send').textContent = 'Pinned! (send again to replace)';
      })
      .catch((e) => problem(e.message));
  });
}

function resetDrawing() {
  const canvas = $('draw-canvas');
  if (!canvas) return;
  const g = canvas.getContext('2d');
  g.fillStyle = BG;
  g.fillRect(0, 0, canvas.width, canvas.height);
  $('draw-send').textContent = 'Pin it to the wall';
}

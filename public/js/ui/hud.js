// The in-game HUD: top bar, the bridge-table ring (seats, nominations, the
// vote clock), action buttons and the minimap.
import { $, el, clear, formatTime, problem, toast } from '../util.js';
import { store, send, serverNow, player, isCaptain, suitHex } from '../store.js';
import { sfx } from '../audio.js';
import { ROOMS, CORRIDORS } from '../world/layout.js';
import { blackHoleProgress } from '../world/world.js';
import { canTeleport, teleportTo } from './rooms.js';
import { badgeFor } from './notebook.js';

const DAY_PHASES = ['roam', 'meeting', 'nominations'];
const READY_LABEL = { roam: 'Ready for the meeting', meeting: 'Ready for nominations', nominations: 'No more nominations' };

const PHASE_NAMES = {
  lobby: 'Docked', night: 'Night', dawn: 'Dawn', roam: 'Explore', meeting: 'Meeting', nominations: 'Nominations', dusk: 'Dusk', ended: 'Mission over',
};

let selectMode = null; // { kind: 'shoot' | 'puppet', onPick }
let world = null;

export function initHud(w, { onRoleCard, onUse, onPuppetPick }) {
  world = w;
  $('btn-role').addEventListener('click', onRoleCard);
  $('btn-help').addEventListener('click', () => onRoleCard('help'));
  $('btn-use').addEventListener('click', onUse);
  $('use-prompt').addEventListener('click', onUse);
  $('ring-toggle').addEventListener('click', () => $('ring-panel').classList.toggle('collapsed'));
  $('btn-hand').addEventListener('click', toggleHand);
  $('btn-done-speaking').addEventListener('click', () => send('done-speaking').catch((e) => problem(e.message)));
  $('btn-ready').addEventListener('click', () => {
    const up = !store.state?.you?.ready;
    send('ready', { on: up }).then(() => sfx(up ? 'lock' : 'click')).catch((e) => problem(e.message));
  });
  $('btn-shoot').addEventListener('click', () => {
    if (selectMode?.kind === 'shoot') {
      selectMode = null;
      renderRing();
      return;
    }
    selectMode = {
      kind: 'shoot',
      onPick: (p) => {
        if (!confirm(`Fire your one plasma shot at ${p.name}? Everyone will see it.`)) return;
        send('shoot', { target: p.id }).then(() => sfx('shot')).catch((e) => problem(e.message));
        selectMode = null;
      },
    };
    toast('Click a player on the bridge table to shoot them.', 'info');
    renderRing();
  });
  $('btn-emote').addEventListener('click', toggleEmotes);
  hud.onPuppetPick = onPuppetPick;
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select') || $('hud').hidden || !$('modal').hidden) return;
    const k = e.key.toLowerCase();
    if (k === 'r') onRoleCard();
    if (k === 'e' && !$('btn-use').hidden) onUse();
    if (k === 'q') toggleEmotes();
    if (k === ' ' && !$('btn-hand').hidden) {
      e.preventDefault();
      toggleHand();
    }
  });
  buildEmoteMenu();
  setInterval(tick, 250);
  setInterval(drawMinimap, 200);
  // click a room on the map to teleport there
  $('minimap').addEventListener('click', (e) => {
    const c = $('minimap');
    const b = c.getBoundingClientRect();
    const px = ((e.clientX - b.left) / b.width) * c.width;
    const pz = ((e.clientY - b.top) / b.height) * c.height;
    const x = ((px - 5) / (c.width - 10)) * (BOUNDS.x1 - BOUNDS.x0) + BOUNDS.x0;
    const z = ((pz - 5) / (c.height - 10)) * (BOUNDS.z1 - BOUNDS.z0) + BOUNDS.z0;
    const room = ROOMS.find(({ rect: [x0, z0, x1, z1] }) => x >= x0 - 1 && x <= x1 + 1 && z >= z0 - 1 && z <= z1 + 1);
    if (room && canTeleport()) teleportTo(room.id);
  });
}

export const hud = { onPuppetPick: null };

function buildEmoteMenu() {
  const labels = { wave: '👋 Wave', dance: '💃 Dance', jump: '🦘 Jump', spin: '🌀 Spin', shrug: '🤷 Shrug', point: '👉 Point', cry: '😭 Cry', laugh: '🤣 Laugh' };
  clear($('emote-menu'), ...store.data.playerEmotes.map((e) => el('button', { className: 'small', onclick: () => { send('emote', { emote: e }).catch(() => {}); $('emote-menu').hidden = true; } }, labels[e] || e)));
}

function toggleEmotes() {
  if (isCaptain()) return;
  $('emote-menu').hidden = !$('emote-menu').hidden;
}

function toggleHand() {
  const nom = store.state?.nomination;
  if (!nom) return;
  const up = !nom.hands[store.me];
  send('hand', { up }).then(() => sfx(up ? 'hand' : 'click')).catch((e) => problem(e.message));
}

export function setSelectMode(mode) {
  selectMode = mode;
  renderRing();
}

// ---------------------------------------------------------------------------
// Render (called on every state change)
// ---------------------------------------------------------------------------

export function renderHud(state) {
  $('hud-code').textContent = state.code;
  const label = PHASE_NAMES[state.phase] + (['night'].includes(state.phase) ? ` ${state.night}` : ['dawn', 'roam', 'meeting', 'nominations', 'dusk'].includes(state.phase) ? ` · Day ${state.day}` : '');
  $('hud-phase').textContent = label;
  const alive = state.aliveCount;
  const hole = Math.round(blackHoleProgress(state) * 100);
  $('hud-horizon').replaceChildren(el('span', { title: 'How close the black hole is. It creeps closer every night and every death.' }, `🕳️ ${hole}% · `), el('b', {}, `${alive} alive`), ` · ${state.threshold} votes to airlock`);
  document.body.classList.toggle('horizon-close', state.phase !== 'lobby' && alive <= 4);
  const pct = Math.min(100, Math.round((state.charge / state.chargeNeeded) * 100));
  $('hud-charge').querySelector('span').style.width = `${pct}%`;
  $('hud-charge').classList.toggle('full', pct >= 100);
  $('hud-charge').title = pct >= 100 ? 'Observation Array charged! A clue will appear in the Observation Deck windows tomorrow morning.' : `Observation Array ${pct}%: do tasks so a clue appears in the windows tomorrow.`;

  const you = state.you || {};
  const nom = state.nomination;
  const canVote = !!you.id && !you.isCaptain && (you.alive || you.ghostVote);
  const locked = nom?.locked?.[you.id];
  const handBtn = $('btn-hand');
  handBtn.hidden = !nom || !canVote;
  if (nom) {
    const up = !!nom.hands[you.id];
    handBtn.classList.toggle('up', up);
    handBtn.classList.toggle('locked', !!locked);
    handBtn.disabled = !!locked;
    handBtn.querySelector('b').textContent = locked ? (up ? 'Voted YES' : 'Did not vote') : up ? 'Hand UP (click to lower)' : 'Raise hand to vote';
  }
  $('btn-done-speaking').hidden = !nom || !((nom.stage === 'accuse' && nom.nominator === you.id) || (nom.stage === 'defend' && nom.nominee === you.id));
  // everyone ready = skip the rest of this part of the day
  const readyBtn = $('btn-ready');
  readyBtn.hidden = !you.id || you.isCaptain || !DAY_PHASES.includes(state.phase) || !!nom;
  if (!readyBtn.hidden) {
    const count = `${state.ready?.length || 0}/${state.readyNeeded || 0}`;
    readyBtn.classList.toggle('on', !!you.ready);
    readyBtn.querySelector('b').textContent = you.ready ? `Ready ✓ ${count}` : `${READY_LABEL[state.phase]} ${count}`;
    readyBtn.title = state.mode === 'captain' && !state.autoAdvance
      ? 'Tell the Captain you are happy to move on.'
      : 'When everyone is ready, the ship moves on without waiting for the timer.';
  }
  $('btn-shoot').hidden = !you.gunner || !DAY_PHASES.includes(state.phase);
  $('btn-shoot').classList.toggle('on', selectMode?.kind === 'shoot');
  $('btn-emote').hidden = !!you.isCaptain;
  if (!['roam', 'lobby'].includes(state.phase)) $('btn-use').hidden = true;

  renderRing();
  renderNomination(state);
}

function seatHint(state) {
  const you = state.you || {};
  if (selectMode?.kind === 'shoot') return '🔫 Click a player to shoot.';
  if (selectMode?.kind === 'puppet') return '🎭 Click a player to puppet.';
  if (state.phase === 'nominations' && !state.nomination && you.alive && !you.isCaptain) {
    const me = player(you.id);
    if (me && !me.nominatedSomeone) return '☝️ Click a player to nominate them for the airlock.';
    return 'You have already nominated today.';
  }
  if (state.phase === 'nominations' && !state.nomination) return 'Waiting for nominations…';
  if (state.phase === 'roam') return 'Explore the ship. Talk privately in rooms. Do tasks!';
  if (state.phase === 'meeting') return 'Share what you know. Nominations open soon.';
  return '';
}

export function renderRing() {
  const state = store.state;
  if (!state) return;
  const ring = $('ring');
  const players = state.players;
  const n = players.length;
  const nom = state.nomination;
  const box = ring.getBoundingClientRect().width > 0 ? 270 : 270;
  const c = box / 2;
  const R = c - 32;
  const children = [el('div', { className: 'table' })];
  if (nom && nom.stage === 'vote' && nom.index >= 0) {
    const currentId = nom.order[Math.min(nom.index, nom.order.length - 1)];
    const seat = players.find((p) => p.id === currentId)?.seat ?? 0;
    const angle = (seat / n) * 360;
    children.push(el('div', { className: 'hand-clock', style: { transform: `rotate(${angle + 180}deg)` } }));
  }
  const you = state.you || {};
  const meP = players.find((p) => p.id === you.id);
  for (const p of players) {
    const a = -Math.PI / 2 + (p.seat / n) * Math.PI * 2;
    const x = c + Math.cos(a) * R;
    const y = c + Math.sin(a) * R;
    const nominatable = state.phase === 'nominations' && !nom && you.alive && meP && !meP.nominatedSomeone && p.alive && !p.nominated;
    const selectable = selectMode ? p.alive || selectMode.kind === 'puppet' : nominatable;
    const cls = ['seat', p.alive ? '' : 'dead', p.id === you.id ? 'me' : '', p.connected ? '' : 'offline', nom?.nominee === p.id ? 'nominee' : '', state.block?.id === p.id ? 'block' : '', selectable ? 'selectable' : ''];
    const isCurrent = nom?.stage === 'vote' && nom.order[nom.index] === p.id;
    if (isCurrent) cls.push('current');
    if (nom?.locked?.[p.id] && nom.hands[p.id]) cls.push('locked-yes');
    const badge = p.id !== you.id && !you.isCaptain && state.phase !== 'lobby' ? badgeFor(p.id) : null;
    const token = el('div', { className: 'token', style: { background: suitHex(p) } },
      p.alive ? '' : '👻',
      p.ghostVote ? el('span', { className: 'ghostvote', title: 'Has a ghost vote' }) : null,
      badge ? el('span', { className: `nb-badge ${badge.trust}`, title: badge.title }, badge.text) : null,
      DAY_PHASES.includes(state.phase) && state.ready?.includes(p.id) && !nom ? el('span', { className: 'ready-tick', title: 'Ready to move on' }, '✓') : null,
    );
    const seat = el('button', { className: cls.join(' '), style: { left: `${x}px`, top: `${y}px` }, title: `${p.name}${p.alive ? '' : ' (dead)'}${p.nominated ? ' · nominated today' : ''}${p.nominatedSomeone ? ' · has nominated' : ''}` },
      nom && nom.hands[p.id] ? el('span', { className: 'hand' }, '✋') : null,
      token,
      el('span', { className: 'nm' }, p.name),
    );
    seat.addEventListener('click', () => clickSeat(p, nominatable));
    children.push(seat);
  }
  ring.replaceChildren(...children);
  $('ring-hint').textContent = seatHint(state);
}

function clickSeat(p, nominatable) {
  if (selectMode) {
    if (!p.alive && selectMode.kind !== 'puppet') return;
    selectMode.onPick(p);
    renderRing();
    return;
  }
  if (nominatable) {
    if (!confirm(`Nominate ${p.name} for the airlock?`)) return;
    send('nominate', { target: p.id }).then(() => sfx('gavel')).catch((e) => problem(e.message));
  }
}

function renderNomination(state) {
  const box = $('nomination-box');
  const nom = state.nomination;
  const last = state.lastNomination;
  if (!nom && !(last && state.phase === 'nominations' && serverNow() - last.at < 8000)) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  if (!nom) {
    const name = (id) => player(id)?.name || '?';
    clear(box,
      el('div', { className: 'stage' }, 'RESULT'),
      el('div', {}, el('b', {}, name(last.nominee)), ` got ${last.votes} vote${last.votes === 1 ? '' : 's'} (needed ${last.threshold}).`),
      el('div', { className: 'hint' }, { block: '☠️ Heading for the airlock at dusk…', tie: '⚖️ Tie: nobody is on the block.', safe: '🛟 Safe for now.' }[last.result]),
      state.block?.id ? el('div', { className: 'hint' }, `On the block: ${name(state.block.id)} (${state.block.votes} votes)`) : null,
    );
    return;
  }
  const name = (id) => player(id)?.name || '?';
  const stageText = { accuse: `🗣️ ${name(nom.nominator)} explains why`, defend: `🛡️ ${name(nom.nominee)} defends themself`, vote: '🕐 The vote goes clockwise…' }[nom.stage];
  const yes = Object.entries(nom.hands).filter(([id, up]) => up && nom.locked[id]).length;
  clear(box,
    el('div', { className: 'stage' }, nom.stage === 'vote' ? 'VOTING' : nom.stage === 'accuse' ? 'ACCUSATION' : 'DEFENCE', ' · ', el('span', { id: 'nom-timer' }, '')),
    el('div', {}, el('b', {}, name(nom.nominator)), ' nominates ', el('b', {}, name(nom.nominee)), '!'),
    el('div', {}, stageText),
    el('div', { className: 'hint' }, `YES so far: ${yes} · needs ${Math.max(state.threshold, (state.block?.votes || 0) + (state.block?.id ? 1 : 0))}${state.block?.id ? ` to beat ${name(state.block.id)}` : ''}`),
    el('div', { className: 'hint' }, 'Raise your hand (Space) before the clock hand reaches your seat.'),
  );
}

// ---------------------------------------------------------------------------
// Timers & minimap
// ---------------------------------------------------------------------------

function tick() {
  const state = store.state;
  if (!state || $('hud').hidden) return;
  const timer = $('hud-timer');
  if (state.paused) {
    timer.textContent = `⏸ ${formatTime(state.pausedRemaining)}`;
    timer.className = 'timer paused';
  } else if (state.phaseEndsAt) {
    const left = state.phaseEndsAt - serverNow();
    timer.textContent = formatTime(left);
    timer.className = `timer ${left < 15000 && left > 0 ? 'urgent' : ''}`;
  } else {
    timer.textContent = state.phase === 'lobby' ? '—' : '∞';
    timer.className = 'timer';
  }
  const nt = document.getElementById('nom-timer');
  if (nt && state.nomination) nt.textContent = formatTime(state.nomination.stageEndsAt - serverNow());
}

const BOUNDS = { x0: -50, x1: 54, z0: -36, z1: 50 };
function drawMinimap() {
  const canvas = $('minimap');
  if (!world || $('hud').hidden || getComputedStyle(canvas).display === 'none') return;
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const sx = (x) => ((x - BOUNDS.x0) / (BOUNDS.x1 - BOUNDS.x0)) * (W - 10) + 5;
  const sz = (z) => ((z - BOUNDS.z0) / (BOUNDS.z1 - BOUNDS.z0)) * (H - 10) + 5;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(80,100,160,0.35)';
  for (const [x0, z0, x1, z1] of CORRIDORS) g.fillRect(sx(x0), sz(z0), sx(x1) - sx(x0), sz(z1) - sz(z0));
  for (const r of ROOMS) {
    const [x0, z0, x1, z1] = r.rect;
    const here = world.room === r.id;
    g.fillStyle = here ? 'rgba(108,240,255,0.35)' : 'rgba(120,140,200,0.25)';
    g.fillRect(sx(x0), sz(z0), sx(x1) - sx(x0), sz(z1) - sz(z0));
    if (r.task && !world.doneTasks.has(r.task) && store.state?.phase === 'roam') {
      g.fillStyle = '#ffd27a';
      g.beginPath();
      g.arc(sx((x0 + x1) / 2), sz((z0 + z1) / 2), 2.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  // everyone else, as small dots in their suit colour
  const players = store.state?.players || [];
  if (['lobby', 'roam'].includes(store.state?.phase)) {
    for (const [id, p] of Object.entries(world.whereabouts())) {
      if (id === world.myId) continue;
      const pl = players.find((x) => x.id === id);
      g.globalAlpha = pl && !pl.alive ? 0.45 : 1;
      g.fillStyle = pl ? suitHex(pl) : '#fff';
      g.beginPath();
      g.arc(sx(p.x), sz(p.z), 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  if (!isCaptain()) {
    g.strokeStyle = '#fff';
    g.lineWidth = 1.5;
    g.fillStyle = '#6cf0ff';
    g.beginPath();
    g.arc(sx(world.local.x), sz(world.local.z), 4, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  const room = ROOMS.find((r) => r.id === world.room);
  g.fillStyle = '#cfd6ff';
  g.font = "600 10px 'Bricolage Grotesque', sans-serif";
  g.fillText(room ? room.name : 'Corridor', 6, H - 6);
}

export function setUsePrompt(taskName) {
  const p = $('use-prompt');
  p.hidden = !taskName;
  $('btn-use').hidden = !taskName;
  if (taskName) p.textContent = `🛠️ ${taskName} — press E`;
}

export function phaseBanner(title, subtitle = '', ms = 3500) {
  const b = $('phase-banner');
  clear(b, title, subtitle ? el('small', {}, subtitle) : null);
  b.hidden = false;
  b.style.animation = 'none';
  void b.offsetWidth;
  b.style.animation = '';
  clearTimeout(phaseBanner.t);
  phaseBanner.t = setTimeout(() => (b.hidden = true), ms);
}

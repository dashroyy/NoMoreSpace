// The in-game HUD: top bar, the bridge-table ring (seats, nominations, the
// vote clock), action buttons and the minimap.
import { $, el, clear, formatTime, problem, toast } from '../util.js';
import { store, send, serverNow, player, isCaptain, suitHex, themeInfo } from '../store.js';
import { sfx } from '../audio.js';
import { ROOMS, CORRIDORS, roomOutline } from '../world/layout.js';
import { blackHoleProgress } from '../world/world.js';
import { canTeleport, teleportTo } from './rooms.js';
import { renderVote, openNominate, votesTodayList } from './vote.js';
import { claimTag, updateClaimButton } from './social.js';
import { badgeFor } from './notebook.js';

const DAY_PHASES = ['roam', 'meeting', 'nominations'];
const READY_PHASES = ['dawn', ...DAY_PHASES]; // (the night has its own Ready button, in the night panel)
const READY_LABEL = { dawn: 'Ready for the day', roam: 'Ready for the meeting', meeting: 'Ready for nominations', nominations: 'No more nominations' };

const PHASE_NAMES = {
  lobby: 'Docked', night: 'Night', dawn: 'Dawn', roam: 'Explore', meeting: 'Meeting', nominations: 'Nominations', lastwords: 'Last words', dusk: 'Dusk', ended: 'Mission over',
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
    if (e.key === 'Tab') {
      e.preventDefault();
      toggleBigMap();
    }
    if (k === 'c' && !$('btn-claim').hidden) $('btn-claim').click();
    if (k === 'l') onRoleCard('log');
    if (k === ' ' && !$('btn-hand').hidden) {
      e.preventDefault();
      toggleHand();
    }
  });
  buildEmoteMenu();
  setInterval(tick, 250);
  setInterval(drawMinimap, 200);
  $('map-expand').addEventListener('click', () => toggleBigMap(true));
  $('bigmap-close').addEventListener('click', () => toggleBigMap(false));
  $('bigmap-canvas').addEventListener('click', bigMapClick);
  window.addEventListener('keydown', (e) => e.key === 'Escape' && !$('bigmap').hidden && toggleBigMap(false));
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
  const labels = { wave: '👋 Wave', dance: '💃 Dance', scooby: '🐶 Scooby dance', scuba: '🤿 Scuba dance', jump: '🦘 Jump', spin: '🌀 Spin', shrug: '🤷 Shrug', point: '👉 Point', cry: '😭 Cry', laugh: '🤣 Laugh' };
  clear($('emote-menu'), ...store.data.playerEmotes.map((e, i) => el('button', { className: 'small', title: i < 9 ? `Key ${i + 1}` : '', onclick: () => { send('emote', { emote: e }).catch(() => {}); $('emote-menu').hidden = true; } }, i < 9 ? el('kbd', {}, i + 1) : null, ' ', labels[e] || e)));
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
  const label = PHASE_NAMES[state.phase] + (['night'].includes(state.phase) ? ` ${state.night}` : ['dawn', 'roam', 'meeting', 'nominations', 'lastwords', 'dusk'].includes(state.phase) ? ` · Day ${state.day}` : '');
  $('hud-phase').textContent = label;
  const alive = state.aliveCount;
  const hole = Math.round(blackHoleProgress(state) * 100);
  const theme = themeInfo(state.script);
  $('hud-horizon').replaceChildren(el('span', { title: theme.doomTip }, `${theme.doomIcon} ${hole}% · `), el('b', {}, `${alive} alive`), ` · ${state.threshold} votes to airlock`);
  document.body.classList.toggle('horizon-close', state.phase !== 'lobby' && alive <= 4);
  const pct = Math.min(100, Math.round((state.charge / state.chargeNeeded) * 100));
  $('hud-charge').querySelector('span').style.width = `${pct}%`;
  $('hud-charge').classList.toggle('full', pct >= 100);
  $('hud-charge').title = pct >= 100 ? 'Observation Array charged! A clue will appear in the Observation Deck windows tomorrow morning.' : `Observation Array ${pct}%: do tasks so a clue appears in the windows tomorrow.`;

  const you = state.you || {};
  const nom = state.nomination;
  // voting happens in the vote panel now (vote.js)
  $('btn-hand').hidden = true;
  // last words: the airlocked player (or the host/Captain) can finish early
  $('btn-done-speaking').hidden = !(state.phase === 'lastwords' && (state.lastWords?.id === you.id || you.isController));
  updateClaimButton(state);
  // everyone ready = skip the rest of this part of the day
  const readyBtn = $('btn-ready');
  readyBtn.hidden = !you.id || you.isCaptain || !READY_PHASES.includes(state.phase) || !!nom;
  if (!readyBtn.hidden) {
    // players away from the keyboard count as ready
    const count = `${new Set([...(state.ready || []), ...(state.afk || [])]).size}/${state.readyNeeded || 0}`;
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
  renderVote(state);
}

function seatHint(state) {
  const you = state.you || {};
  if (selectMode?.kind === 'shoot') return '🔫 Click a player to shoot.';
  if (selectMode?.kind === 'puppet') return '🎭 Click a player to puppet.';
  if (state.phase === 'nominations' && !state.nomination && you.alive && !you.isCaptain) {
    const me = player(you.id);
    if (me && !me.nominatedSomeone) return '☝️ Press Nominate (or click a player here) to put someone up for the airlock.';
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
  if (nom && nom.stage === 'count' && nom.index >= 0) {
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
    const isCurrent = nom?.stage === 'count' && nom.order[nom.index] === p.id;
    if (isCurrent) cls.push('current');
    if (nom?.locked?.[p.id] && nom.hands[p.id]) cls.push('locked-yes');
    const badge = p.id !== you.id && !you.isCaptain && state.phase !== 'lobby' ? badgeFor(p.id) : null;
    // a letter on every token, so colour is never the only way to tell people apart
    const token = el('div', { className: 'token', style: { background: suitHex(p) } },
      p.alive ? el('span', { className: 'initial', style: { color: inkFor(suitHex(p)) } }, initial(p.name)) : '👻',
      p.ghostVote ? el('span', { className: 'ghostvote', title: 'Has a ghost vote' }) : null,
      badge ? el('span', { className: `nb-badge ${badge.trust}`, title: badge.title }, badge.text) : null,
      state.afk?.includes(p.id) ? el('span', { className: 'afk-badge', title: 'Away from keyboard (counts as ready)' }, '💤')
        : READY_PHASES.includes(state.phase) && state.ready?.includes(p.id) && !nom ? el('span', { className: 'ready-tick', title: 'Ready to move on' }, '✓') : null,
    );
    const seat = el('button', { className: cls.join(' '), dataset: { id: p.id }, style: { left: `${x}px`, top: `${y}px` }, title: `${p.name}${p.bio ? ` (is ${p.bio})` : ''}${p.alive ? '' : ' (dead)'}${p.nominated ? ' · nominated today' : ''}${p.nominatedSomeone ? ' · has nominated' : ''}` },
      nom && nom.hands[p.id] && (nom.locked[p.id] || p.id === you.id) ? el('span', { className: 'hand' }, '✋') : null,
      nom && nom.stage !== 'count' && nom.cast?.includes(p.id) ? el('span', { className: 'cast-tick', title: 'Has voted' }, '🗳️') : null,
      token,
      el('span', { className: 'nm' }, p.name),
      claimTag(state, p.id),
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
  if (nominatable) openNominate(p.id);
}

function renderNomination(state) {
  // the big vote panel shows the live vote; the bridge table panel keeps today's record
  const box = $('nomination-box');
  const list = votesTodayList(state);
  const block = state.block?.id && state.phase === 'nominations' ? el('div', { className: 'hint' }, `☠️ On the block: ${player(state.block.id)?.name} (${state.block.votes} votes)`) : null;
  box.hidden = !list && !block;
  if (!box.hidden) clear(box, block, list);
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
  drawMap(canvas, false);
}

// Draw the station: rooms, corridors, tasks still to do and where everyone is.
// big: the full-screen map (Tab) with room names, cut corners and player names.
function drawMap(canvas, big) {
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const pad = big ? 24 : 5;
  const sx = (x) => ((x - BOUNDS.x0) / (BOUNDS.x1 - BOUNDS.x0)) * (W - pad * 2) + pad;
  const sz = (z) => ((z - BOUNDS.z0) / (BOUNDS.z1 - BOUNDS.z0)) * (H - pad * 2) + pad;
  const k = big ? 2.6 : 1; // sizes scale up on the big map
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(80,100,160,0.35)';
  for (const [x0, z0, x1, z1] of CORRIDORS) g.fillRect(sx(x0), sz(z0), sx(x1) - sx(x0), sz(z1) - sz(z0));
  for (const r of ROOMS) {
    const [x0, z0, x1, z1] = r.rect;
    const here = world.room === r.id;
    g.fillStyle = here ? 'rgba(108,240,255,0.35)' : 'rgba(120,140,200,0.25)';
    if (big) {
      // the real module shape, with its corners cut off
      g.beginPath();
      roomOutline(r.rect).forEach(([x, z], i) => (i ? g.lineTo(sx(x), sz(z)) : g.moveTo(sx(x), sz(z))));
      g.closePath();
      g.fill();
      g.strokeStyle = `#${r.light.toString(16).padStart(6, '0')}`;
      g.globalAlpha = 0.7;
      g.lineWidth = 2;
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = '#e6ecff';
      g.font = "16px 'Silkscreen', monospace";
      g.textAlign = 'center';
      g.fillText(r.name.toUpperCase(), sx((x0 + x1) / 2), sz(z0) + 22);
      g.textAlign = 'start';
    } else g.fillRect(sx(x0), sz(z0), sx(x1) - sx(x0), sz(z1) - sz(z0));
    if (r.task && !world.doneTasks.has(r.task) && store.state?.phase === 'roam') {
      g.fillStyle = '#ffd27a';
      g.beginPath();
      g.arc(sx((x0 + x1) / 2), sz((z0 + z1) / 2) + (big ? 18 : 0), 2.5 * k, 0, Math.PI * 2);
      g.fill();
    }
  }
  // everyone else, as dots in their suit colour (with a letter, and on the big map their name)
  const players = store.state?.players || [];
  if (['lobby', 'roam'].includes(store.state?.phase) && !world.blackout) {
    for (const [id, p] of Object.entries(world.whereabouts())) {
      if (id === world.myId) continue;
      const pl = p.phantom ? { cosmetics: p.phantom.avatar.look, alive: true, name: p.phantom.name || '?' } : players.find((x) => x.id === (world.disguise?.[id] || id));
      g.globalAlpha = pl && !pl.alive ? 0.45 : 1;
      g.fillStyle = pl ? suitHex(pl) : '#fff';
      g.beginPath();
      g.arc(sx(p.x), sz(p.z), 5 * (big ? 1.8 : 1), 0, Math.PI * 2);
      g.fill();
      if (pl) {
        g.fillStyle = inkFor(suitHex(pl));
        g.font = `bold ${big ? 12 : 7}px 'Silkscreen', sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(initial(pl.name), sx(p.x), sz(p.z) + 0.5);
        if (big) outlined(g, `${pl.name}${pl.alive ? '' : ' 👻'}`, sx(p.x), sz(p.z) + 21, "18px 'VT323', monospace", '#ffffff');
        g.textAlign = 'start';
        g.textBaseline = 'alphabetic';
      }
    }
    g.globalAlpha = 1;
  }
  if (!isCaptain() && !store.state?.you?.isSpectator) {
    g.strokeStyle = '#fff';
    g.lineWidth = 1.5 * (big ? 1.5 : 1);
    g.fillStyle = '#6cf0ff';
    g.beginPath();
    g.arc(sx(world.local.x), sz(world.local.z), 4 * (big ? 2 : 1), 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (big) outlined(g, 'YOU', sx(world.local.x), sz(world.local.z) + 22, "14px 'Silkscreen', monospace", '#6cf0ff');
  }
  if (!big) {
    const room = ROOMS.find((r) => r.id === world.room);
    g.fillStyle = '#cfd6ff';
    g.font = '9px Silkscreen, monospace';
    g.fillText(room ? room.name : 'Corridor', 6, H - 6);
  }
}

// Centred text with a dark edge, so names stay readable over the coloured rooms.
function outlined(g, text, x, y, font, color) {
  g.save();
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
  g.restore();
}

// ---------- the full-screen map (Tab) ----------
let bigMapTimer = null;
export function toggleBigMap(open = $('bigmap').hidden) {
  const box = $('bigmap');
  box.hidden = !open;
  clearInterval(bigMapTimer);
  if (!open) return;
  const draw = () => drawMap($('bigmap-canvas'), true);
  draw();
  bigMapTimer = setInterval(draw, 200);
}

function bigMapClick(e) {
  const c = $('bigmap-canvas');
  const b = c.getBoundingClientRect();
  const pad = 24;
  const px = ((e.clientX - b.left) / b.width) * c.width;
  const pz = ((e.clientY - b.top) / b.height) * c.height;
  const x = ((px - pad) / (c.width - pad * 2)) * (BOUNDS.x1 - BOUNDS.x0) + BOUNDS.x0;
  const z = ((pz - pad) / (c.height - pad * 2)) * (BOUNDS.z1 - BOUNDS.z0) + BOUNDS.z0;
  const room = ROOMS.find(({ rect: [x0, z0, x1, z1] }) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
  if (room && canTeleport()) {
    teleportTo(room.id);
    toggleBigMap(false);
  }
}

function initial(name) {
  return String(name || '?').trim().charAt(0).toUpperCase();
}

// Dark letters on light suits, light letters on dark ones.
function inkFor(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16) || 0;
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#0b0d18' : '#ffffff';
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

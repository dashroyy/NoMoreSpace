// Star Charters: the game screen. The map fills the screen; round it sit the captains (left), the next tiles
// (right) and the dock (bottom), which holds your tile and says, in big words, what to do next.
//
// Your turn goes: pick one of the glowing squares (your tile floats over it), turn it with the arrows until you like
// it, press Place; then tap a marker to send a probe there (or call one home with fuel, or send nothing) and press
// End turn. Nothing goes to the server until End turn, so Back always works.
//
// Pointing at anything on the map lights the whole feature up and says what it is worth and who is winning it.
import { problem } from '../util.js';
import { store, act, serverNow, tileDef, player, colourHex, colourOf } from './net.js';
import { sfx, unlock } from './sound.js';
import { el, btn, icon, keyHints, escapeOpen } from './ui.js';
import { openRules } from './codex.js';
import { openSettings, settings, onSettings, toggleMute } from './settings.js';
import { tileArt } from './art.js';
import { mountChat, renderChat } from './chat.js';
import { processLog } from './fx.js';

let world = null;
let refs = null;
const ui = {
  mode: 'idle', // idle | place | deploy | sending
  turnKey: null,
  sel: null, // { x, y, r }
  prefR: 0, // the way round you last turned it (used for previews)
  unit: 'probe',
  target: null,
  recallMode: false,
  recall: null,
  markers: [],
  worth: [],
  hover: null,
  boardVersion: null,
  scores: new Map(),
};

const SPEED = { chill: 1.8, normal: 1, quick: 0.55 };
const KIND_ICON = { L: '🛣️', S: '🏙️', A: '📡', H: '🕳️', V: '✨' };
const KIND_WORD = { L: 'Lane', S: 'Station', A: 'Array', H: 'Black hole', V: 'Void' };

// a little rocket drawing for the fleet read-out
const rocketSvg = (hex, cls = '') => el('i', { className: `rk ${cls}`, innerHTML: `<svg viewBox="0 0 12 18"><path d="M6 0C9 3 9.5 7 9 11H3C2.5 7 3 3 6 0z" fill="${hex}" stroke="#1d2340" stroke-width="1"/><path d="M3 9L0 14l3-1zM9 9l3 5-3-1z" fill="${hex}" stroke="#1d2340" stroke-width="1"/><circle cx="6" cy="6" r="1.6" fill="#b9e6df" stroke="#1d2340" stroke-width=".8"/><path d="M4.5 12h3l-1.5 5z" fill="#f08a3c"/></svg>` });

export function buildGame(root, { onLeave, world: w }) {
  world = w;
  refs = {
    bag: el('div', { className: 'tb-bag' }),
    code: el('span', { className: 'tb-code' }),
    crew: el('div', { className: 'crewlist' }),
    radar: el('div', { className: 'radar' }),
    dock: el('div', { className: 'dock' }),
    tele: el('div', { className: 'telemetry', hidden: true }),
    drawer: el('div', { className: 'drawer panel', hidden: true }),
    chat: el('div', { className: 'chat' }),
    mute: null,
  };
  mountChat(refs.chat);
  refs.drawer.append(refs.chat);
  refs.mute = btn(icon(settings.muted ? 'mute' : 'sound'), () => {
    const m = toggleMute();
    refs.mute.replaceChildren(icon(m ? 'mute' : 'sound'));
  }, 'icon-btn', { title: 'Sound on/off', 'aria-label': 'Sound on or off' });
  const chatBtn = btn(icon('chat'), () => {
    refs.drawer.hidden = !refs.drawer.hidden;
    chatBtn.classList.toggle('on', !refs.drawer.hidden);
    if (!refs.drawer.hidden && store.state) renderChat(store.state);
  }, 'icon-btn', { title: 'Chat and game log', 'aria-label': 'Chat and game log' });
  const logo = el('div', { className: 'tb-logo', innerHTML: '<svg viewBox="0 0 120 120"><path d="M60 2l7 44 45 14-45 14-7 44-7-44L8 60l45-14z" fill="#ffc93c"/><circle cx="60" cy="60" r="25" fill="#2a9d8f" stroke="#1d2340" stroke-width="6"/><ellipse cx="60" cy="60" rx="50" ry="15" fill="none" stroke="#f08a3c" stroke-width="8" transform="rotate(-20 60 60)"/></svg><span>Star Charters</span>' });
  const camctl = el(
    'div',
    { className: 'camctl' },
    btn('＋', () => world.stage.zoomBy(0.8), 'icon-btn', { title: 'Zoom in', 'aria-label': 'Zoom in', dataset: { sfx: 'none' } }),
    btn('－', () => world.stage.zoomBy(1.25), 'icon-btn', { title: 'Zoom out', 'aria-label': 'Zoom out', dataset: { sfx: 'none' } }),
    btn('⌖', () => world.frame(0.8, { force: true }), 'icon-btn', { title: 'Show the whole map', 'aria-label': 'Show the whole map', dataset: { sfx: 'none' } }),
  );
  root.replaceChildren(
    el('header', { className: 'topbar' }, el('div', { className: 'tb-left' }, logo, refs.code), refs.bag, el('div', { className: 'tb-right' }, btn(icon('book'), () => openRules(), 'icon-btn', { title: 'How to play', 'aria-label': 'How to play' }), chatBtn, refs.mute, btn(icon('sliders'), () => openSettings(), 'icon-btn', { title: 'Settings', 'aria-label': 'Settings' }), btn(icon('leave'), onLeave, 'icon-btn', { title: 'Leave', 'aria-label': 'Leave the game' }))),
    refs.crew,
    refs.radar,
    camctl,
    refs.drawer,
    refs.dock,
  );
  document.body.append(refs.tele);
  onSettings(() => {
    refs.mute.replaceChildren(icon(settings.muted ? 'mute' : 'sound'));
    ui.boardVersion = null;
    if (store.state) drawWorth(store.state);
  });

  // ----- pointing and tapping at the map
  world.stage.input.onHover = (p, e) => hover(p, e);
  world.stage.input.onTap = (p, e) => tap(p, e);

  // ----- keys
  document.addEventListener('keydown', (e) => {
    if (root.hidden || e.target.closest?.('input, textarea') || escapeOpen() || document.querySelector('.dialog-wrap, #layer-modal:not([hidden])')) return;
    const k = e.key.toLowerCase();
    const s = world.stage;
    if (k === 'r' || k === 'e') rotate(1);
    else if (k === 'q') rotate(-1);
    else if (k === 'enter') primary();
    else if (k === 'backspace' && ui.mode === 'deploy') back();
    else if (k === 'f') world.frame(0.8, { force: true });
    else if (k === '+' || k === '=') s.zoomBy(0.85);
    else if (k === '-') s.zoomBy(1.18);
    else if (k === 'arrowleft' || k === 'a') s.pan(-1.5, 0);
    else if (k === 'arrowright' || k === 'd') s.pan(1.5, 0);
    else if (k === 'arrowup' || k === 'w') s.pan(0, -1.5);
    else if (k === 'arrowdown' || k === 's') s.pan(0, 1.5);
    else return;
    e.preventDefault();
  });

  // the turn timer
  setInterval(() => {
    const t = store.state?.turn;
    const bar = refs.crew.querySelector('.cap.turn .cap-timer i');
    if (!t || !bar) return;
    const total = 60000 * (SPEED[store.state.settings.speed] || 1);
    bar.style.transform = `scaleX(${Math.max(0, Math.min(1, (t.deadline - serverNow()) / total))})`;
  }, 250);
}

// ---------------------------------------------------------------------------
// the options for my tile, by square
// ---------------------------------------------------------------------------
const opts = () => store.state?.you?.options || [];
const spotKey = (x, y) => `${x},${y}`;
function optionsAt(x, y) {
  return opts().filter((o) => o.x === x && o.y === y);
}
function optionFor(x, y, r) {
  return opts().find((o) => o.x === x && o.y === y && o.r === r) || null;
}
const isMine = (state) => !!(state.turn && !state.turn.done && state.turn.pid === state.you.id && state.you.options);

// ---------------------------------------------------------------------------
// what the pointer does
// ---------------------------------------------------------------------------
function hover(p, e) {
  const b = world.board;
  if (ui.mode === 'place' && p) {
    const u = b.under(p);
    const here = u && optionsAt(u.x, u.y);
    if (here?.length) {
      b.setHotSpot(u.x, u.y);
      if (!ui.sel) {
        const r = here.some((o) => o.r === ui.prefR) ? ui.prefR : here[0].r;
        b.setGhost(store.state.turn.tile, u.x, u.y, r);
        drawDockTile(r);
      }
      showTelemetry(null);
      return;
    }
    b.setHotSpot(ui.sel ? ui.sel.x : null, ui.sel?.y);
    if (!ui.sel) b.clearGhost();
  }
  inspect(p, e);
}

function tap(p, e) {
  unlock();
  const b = world.board;
  if (ui.mode === 'place') {
    const u = b.under(p);
    const here = u && optionsAt(u.x, u.y);
    if (here?.length) {
      if (ui.sel && ui.sel.x === u.x && ui.sel.y === u.y) return place(); // a second tap on the same square: place it
      const r = here.some((o) => o.r === ui.prefR) ? ui.prefR : here[0].r;
      ui.sel = { x: u.x, y: u.y, r };
      b.setGhost(store.state.turn.tile, u.x, u.y, r);
      b.setHotSpot(u.x, u.y);
      sfx('pick');
      renderDock(store.state);
      return;
    }
  }
  // anything else: what is this?
  inspect(p, e, true);
}

// turn the tile (only the ways it fits, once a square is picked)
function rotate(dir) {
  if (ui.mode !== 'place') return;
  const tile = store.state.turn.tile;
  if (ui.sel) {
    const rs = optionsAt(ui.sel.x, ui.sel.y).map((o) => o.r).sort((a, b) => a - b);
    if (rs.length < 2) {
      sfx('error');
      return;
    }
    let i = rs.indexOf(ui.sel.r);
    i = (i + dir + rs.length) % rs.length;
    ui.sel.r = rs[i];
    ui.prefR = rs[i];
    world.board.setGhost(tile, ui.sel.x, ui.sel.y, ui.sel.r);
  } else {
    const uniq = tileDef(tile).uniq;
    const i = uniq.indexOf(ui.prefR);
    ui.prefR = uniq[(Math.max(0, i) + dir + uniq.length) % uniq.length];
    if (world.board.ghost) world.board.setGhost(tile, world.board.ghost.x, world.board.ghost.y, optionsAt(world.board.ghost.x, world.board.ghost.y).some((o) => o.r === ui.prefR) ? ui.prefR : world.board.ghost.r);
  }
  sfx('rotate');
  renderDock(store.state);
}

// put the tile down (on this screen only, until End turn) and offer the probes
function place() {
  if (ui.mode !== 'place' || !ui.sel) return;
  const o = optionFor(ui.sel.x, ui.sel.y, ui.sel.r);
  if (!o) return;
  ui.mode = 'deploy';
  ui.target = null;
  ui.recall = null;
  ui.recallMode = false;
  const me = player(store.state.you.id);
  ui.unit = me?.probes > 0 ? 'probe' : 'dread';
  world.board.setSpots([]);
  world.board.setGhost(store.state.turn.tile, o.x, o.y, o.r, { lifted: false });
  sfx('place');
  world.fx.ring(world.board.centre(o.x, o.y).setY(0.21));
  drawMarkers();
  renderDock(store.state);
}

function back() {
  if (ui.mode !== 'deploy') return;
  ui.mode = 'place';
  clearMarkers();
  world.board.setSpots(uniqueSpots());
  world.board.setGhost(store.state.turn.tile, ui.sel.x, ui.sel.y, ui.sel.r, { lifted: true });
  sfx('back');
  renderDock(store.state);
}

function endTurn() {
  if (ui.mode !== 'deploy' || !ui.sel) return;
  const me = player(store.state.you.id);
  const a = { type: 'place', x: ui.sel.x, y: ui.sel.y, r: ui.sel.r, deploy: null, recall: null };
  if (ui.target) a.deploy = { x: ui.target.x, y: ui.target.y, seg: ui.target.seg, dread: ui.unit === 'dread' || me.probes < 1 };
  else if (ui.recall) a.recall = ui.recall;
  ui.mode = 'sending';
  clearMarkers();
  renderDock(store.state);
  act(a).catch((err) => {
    problem(err.message);
    sfx('error');
    ui.mode = 'deploy';
    drawMarkers();
    renderDock(store.state);
  });
}

function primary() {
  if (ui.mode === 'place') {
    if (ui.sel) place();
    else sfx('error');
  } else if (ui.mode === 'deploy') endTurn();
}

const uniqueSpots = () => [...new Map(opts().map((o) => [spotKey(o.x, o.y), { x: o.x, y: o.y }])).values()];

// ---------------------------------------------------------------------------
// the markers over the map: where a probe can go (or which of yours to call home)
// ---------------------------------------------------------------------------
function clearMarkers() {
  for (const m of ui.markers) m.remove();
  ui.markers = [];
}

const keyOf = (t) => `${t.x},${t.y},${t.seg}`;
// the chosen marker stands out (without building the markers again)
function markSelected() {
  const k = ui.recallMode ? ui.recall && keyOf(ui.recall) : ui.target && keyOf(ui.target);
  for (const m of ui.markers) m.element.classList.toggle('sel', m.element.dataset.k === k);
}

// markers that would sit on top of each other are pushed apart on the screen
function declutter(items) {
  const pts = items.map(({ pos, offset }) => {
    const p = world.stage.toScreen(pos.clone().setY(pos.y + offset));
    return { x: p.x, y: p.y, x0: p.x, y0: p.y };
  });
  const gap = matchMedia('(max-width: 760px)').matches ? 54 : 62;
  for (let round = 0; round < 12; round++)
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i];
        const b = pts[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= gap) continue;
        if (d < 0.01) {
          dx = 1;
          dy = 0.3;
          d = Math.hypot(dx, dy);
        }
        const push = (gap - d) / 2;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
      }
  items.forEach(({ label }, i) => {
    label.element.style.marginLeft = `${pts[i].x - pts[i].x0}px`;
    label.element.style.marginTop = `${pts[i].y - pts[i].y0}px`;
  });
}

function drawMarkers() {
  clearMarkers();
  const state = store.state;
  const b = world.board;
  const tile = state.turn.tile;
  const o = optionFor(ui.sel.x, ui.sel.y, ui.sel.r);
  if (!o) return;
  const me = player(state.you.id);
  const placed = [];
  if (ui.recallMode) {
    for (const bt of state.board.tiles)
      for (const u of bt.u) {
        if (u.pid !== state.you.id) continue;
        const pos = b.segPos(bt.t, bt.r, bt.x, bt.y, u.seg);
        const sel = ui.recall && ui.recall.x === bt.x && ui.recall.y === bt.y && ui.recall.seg === u.seg;
        const k = `${bt.x},${bt.y},${u.seg}`;
        const m = el('button', { className: `marker recall ${sel ? 'sel' : ''}`, type: 'button', dataset: { k }, onclick: () => ((ui.recall = ui.recall && keyOf(ui.recall) === k ? null : { x: bt.x, y: bt.y, seg: u.seg }), sfx('pick'), markSelected(), renderDock(store.state)) }, el('span', { className: 'mk' }, '🔥'), el('span', { className: 'mt' }, 'Call home'));
        const label = world.stage.addLabel(pos, m, 0.9);
        ui.markers.push(label);
        placed.push({ label, pos, offset: 0.9 });
      }
    declutter(placed);
    return;
  }
  if (me.probes < 1 && me.dread < 1) return;
  for (const tg of o.targets) {
    const bt = tg.x === o.x && tg.y === o.y ? { t: tile, r: o.r } : state.board.tiles.find((q) => q.x === tg.x && q.y === tg.y);
    if (!bt) continue;
    const pos = b.segPos(bt.t, bt.r, tg.x, tg.y, tg.seg);
    const sel = ui.target && ui.target.x === tg.x && ui.target.y === tg.y && ui.target.seg === tg.seg;
    const text = tg.done ? `+${tg.pts} now!` : tg.assist ? 'Slingshot' : KIND_WORD[tg.k];
    const m = el(
      'button',
      {
        className: `marker ${sel ? 'sel' : ''} ${tg.assist ? 'assist' : ''} ${tg.done ? 'done' : ''}`,
        type: 'button',
        title: `${KIND_WORD[tg.k]}${tg.size > 1 ? ` (${tg.size} tiles)` : ''}`,
        dataset: { k: keyOf(tg) },
        onclick: () => {
          ui.target = ui.target && keyOf(ui.target) === keyOf(tg) ? null : tg;
          sfx('pick');
          markSelected();
          renderDock(store.state);
        },
      },
      el('span', { className: 'mk' }, KIND_ICON[tg.k]),
      el('span', { className: 'mt' }, text),
    );
    const offset = tg.k === 'V' ? 0.35 : 0.55;
    const label = world.stage.addLabel(pos, m, offset);
    ui.markers.push(label);
    placed.push({ label, pos, offset });
  }
  declutter(placed);
}

// ---------------------------------------------------------------------------
// the read-out: what is this feature, what is it worth, who is winning it
// ---------------------------------------------------------------------------
function inspect(p, e, tapped = false) {
  const state = store.state;
  if (!state?.board || !p) return showTelemetry(null);
  const hit = world.board.segUnder(p);
  if (!hit || hit.seg < 0 || !hit.tile.view) return showTelemetry(null);
  const fid = hit.tile.view.f[hit.seg];
  showTelemetry(fid, e, tapped);
}

function showTelemetry(fid, e, tapped) {
  const state = store.state;
  if (fid == null || !state?.board?.features[fid]) {
    if (ui.hover != null) {
      ui.hover = null;
      refs.tele.hidden = true;
      world.board.showCells(null);
    }
    return;
  }
  if (e) {
    refs.tele.style.left = `${Math.min(innerWidth - 320, e.clientX)}px`;
    refs.tele.style.top = `${Math.min(innerHeight - 200, e.clientY)}px`;
  }
  if (ui.hover === fid && !tapped) return;
  ui.hover = fid;
  const f = state.board.features[fid];
  const cells = [];
  for (const bt of state.board.tiles) bt.f.forEach((id, seg) => id === fid && cells.push({ x: bt.x, y: bt.y, t: bt.t, r: bt.r, seg }));
  world.board.showCells(cells, f.k === 'V' ? '#9fd8ff' : '#fff4c2');
  const rows = [];
  const row = (a, b) => rows.push(el('div', { className: 'row' }, el('span', {}, a), el('b', {}, b)));
  let title = `${KIND_ICON[f.k]} ${store.data.features[f.k].name}`;
  if (f.k === 'L' || f.k === 'S') {
    row('Size', `${f.n} tile${f.n === 1 ? '' : 's'}${f.cores ? ` + ${f.cores} core${f.cores === 1 ? '' : 's'}` : ''}`);
    row(f.done ? 'Finished' : f.k === 'S' ? 'Open edges' : 'Open ends', f.done ? '✔' : `${f.open}`);
    row(f.done ? 'Scored' : 'Worth if finished', `${f.full}`);
    if (!f.done) row('Worth if left open', `${f.k === 'L' ? f.n : f.n + f.cores}`);
  } else if (f.k === 'A' || f.k === 'H') {
    row('Charted round it', `${8 - f.open} of 8`);
    row(f.done ? 'Scored' : 'Worth now', f.done ? '9' : `${f.now}`);
    if (!f.done) row('When surrounded', '9');
  } else if (f.k === 'V') {
    row('Stations touching', `${f.stations}`);
    row('Of them finished', `${f.stationsDone}`);
    row('Trawlers score (end)', `${f.now}`);
  }
  const power = Object.entries(f.power || {}).sort((a, b) => b[1] - a[1]);
  const lead = power.length
    ? el('div', { className: 'lead' }, ...power.map(([pid, n], i) => el('div', { className: 'row' }, el('span', {}, el('i', { className: 'dot', style: { '--c': colourOf(pid) } }), pid === state.you.id ? 'You' : player(pid)?.name || '?'), el('b', {}, `${n}${i === 0 && (power.length === 1 || power[1][1] < n) ? ' 👑' : ''}`))))
    : el('div', { className: 'lead muted' }, f.done ? 'Nobody claimed it.' : 'Nobody here yet: claim it!');
  refs.tele.replaceChildren(el('h5', {}, title), ...rows, lead);
  refs.tele.hidden = false;
  if (tapped && matchMedia('(hover: none)').matches) {
    clearTimeout(showTelemetry.timer);
    showTelemetry.timer = setTimeout(() => showTelemetry(null), 3500);
  }
}

// ---------------------------------------------------------------------------
// drawing the screen
// ---------------------------------------------------------------------------
export function renderGame(state, prev) {
  if (!refs) return;
  world.enterGame();
  const fresh = !prev || prev.phase === 'lobby' || prev.code !== state.code;
  world.board.sync(state.board, state.anomalies, { animate: !fresh });
  if (fresh) {
    ui.turnKey = null;
    ui.scores.clear();
    world.frame(0.01, { force: true });
  }
  refs.code.textContent = state.code;
  refs.bag.replaceChildren(`🧩 ${state.bagCount}`, el('span', { className: 'long' }, ` tile${state.bagCount === 1 ? '' : 's'} left`));
  refs.bag.classList.toggle('low', state.phase === 'playing' && state.bagCount <= state.players.length);

  // ----- a new turn
  const t = state.turn;
  const key = t && !t.done ? `${t.n}` : null;
  if (key !== ui.turnKey) {
    ui.turnKey = key;
    clearMarkers();
    ui.sel = null;
    ui.target = null;
    ui.recall = null;
    ui.recallMode = false;
    world.board.clearGhost();
    if (isMine(state)) {
      ui.mode = 'place';
      ui.prefR = tileDef(t.tile)?.uniq[0] || 0;
      world.board.setSpots(uniqueSpots());
      if (!fresh) world.frame(1);
    } else {
      ui.mode = 'idle';
      world.board.setSpots([]);
    }
  } else if (ui.mode === 'sending' && (!t || t.done)) {
    ui.mode = 'idle';
    world.board.clearGhost();
  }
  if (state.phase !== 'playing') {
    ui.mode = 'idle';
    world.board.setSpots([]);
    world.board.clearGhost();
    clearMarkers();
  }

  renderCrew(state);
  renderRadar(state);
  renderDock(state);
  drawWorth(state);
  if (!refs.drawer.hidden) renderChat(state);
  processLog(world, state, prev, { fresh });
}

function renderCrew(state) {
  const t = state.turn;
  refs.crew.replaceChildren(
    ...state.players.map((p) => {
      const hex = colourHex(p.colour);
      const me = p.id === state.you.id;
      const turn = t && t.pid === p.id && state.phase === 'playing';
      const before = ui.scores.get(p.id);
      ui.scores.set(p.id, p.score);
      const kit = el('div', { className: 'cap-kit', title: `${p.probes} probes${p.dread ? ' and the dreadnought' : ''} at home · ${p.fuel} fuel` });
      for (let i = 0; i < store.data.probes; i++) kit.append(rocketSvg(hex, i < p.probes ? '' : 'out'));
      kit.append(rocketSvg(hex, `dread ${p.dread ? '' : 'out'}`), el('span', { className: 'fuel' }, `⛽${p.fuel}`));
      return el(
        'div',
        { className: `cap ${turn ? 'turn' : ''} ${p.connected || p.isBot ? '' : 'away'}`, style: { '--c': hex } },
        el('span', { className: 'cap-av' }, p.avatar),
        el('div', { className: 'cap-name' }, me ? 'You' : p.name, ' ', turn ? el('span', { className: 'cap-tag' }, me ? 'your turn' : 'charting') : el('small', {}, p.isBot ? '🤖' : p.afk ? '💤' : !p.connected ? '(away)' : '')),
        el('div', { className: `cap-score ${before != null && before !== p.score ? 'bump' : ''}` }, `${p.score}`),
        kit,
        turn ? el('div', { className: 'cap-timer' }, el('i')) : null,
      );
    }),
  );
}

function renderRadar(state) {
  const q = state.queue || [];
  refs.radar.hidden = state.phase !== 'playing';
  refs.radar.replaceChildren(el('h4', {}, 'Next up'), q.length ? el('div', { className: 'radar-row' }, ...q.map((id) => el('img', { src: tileArt(id), alt: tileDef(id)?.name || '', title: tileDef(id)?.name || '' }))) : el('div', { className: 'none' }, state.bagCount ? '' : 'Last tile!'));
}

function drawDockTile(r) {
  const img = refs.dock.querySelector('.dock-tile img');
  if (img) img.style.transform = `rotate(${r * 90}deg)`;
}

function renderDock(state) {
  const d = refs.dock;
  const t = state.turn;
  d.classList.toggle('mine', isMine(state));
  if (state.phase !== 'playing' || !t) {
    d.replaceChildren(el('div', { className: 'dock-main' }, el('div', { className: 'dock-say' }, state.phase === 'ended' ? '🏁 The galaxy is charted!' : 'Getting ready…', el('small', {}, state.phase === 'ended' ? 'Counting up the points…' : ''))));
    return;
  }
  const def = tileDef(t.tile);
  const who = player(t.pid);
  const r = ui.sel ? ui.sel.r : ui.mode === 'place' ? ui.prefR : 0;
  const tileBox = el('div', { className: 'dock-tile' }, el('span', { className: 'tname' }, def?.name || ''), el('img', { src: tileArt(t.tile), alt: def?.name || '', style: { transform: `rotate(${r * 90}deg)` } }));
  if (ui.mode === 'place') tileBox.append(btn('⟲', () => rotate(-1), 'icon-btn rot l', { title: 'Turn left (Q)', 'aria-label': 'Turn the tile left', dataset: { sfx: 'none' } }), btn('⟳', () => rotate(1), 'icon-btn rot r', { title: 'Turn right (R)', 'aria-label': 'Turn the tile right', dataset: { sfx: 'none' } }));
  const main = el('div', { className: 'dock-main' });
  if (ui.mode === 'place') {
    const o = ui.sel && optionFor(ui.sel.x, ui.sel.y, ui.sel.r);
    const turns = ui.sel ? optionsAt(ui.sel.x, ui.sel.y).length : 0;
    main.append(
      el('div', { className: 'dock-say' }, ui.sel ? 'Place it!' : t.extra ? '⏩ Bonus tile!' : 'Your turn! Pick a square', el('small', {}, ui.sel ? (turns > 1 ? `It fits ${turns} ways here: turn it with ⟲ ⟳.` : 'It only fits this way round here.') : `${uniqueSpots().length} places it fits. Turn it with ⟲ ⟳ first if you like.`)),
      el(
        'div',
        { className: 'dock-btns' },
        btn([el('span', {}, 'Place tile'), icon('check')], place, 'gold', { disabled: !ui.sel, dataset: { sfx: 'none' } }),
        o?.anomaly ? el('span', { className: 'dock-gain' }, `${store.data.anomalies[o.anomaly].icon} grabs the ${store.data.anomalies[o.anomaly].name.toLowerCase()}`) : null,
        o?.completes?.length ? el('span', { className: 'dock-gain' }, `⭐ finishes ${o.completes.map((c) => `a ${KIND_WORD[c.k].toLowerCase()} (+${c.pts})`).join(', ')}`) : null,
      ),
      keyHints([[['Q', 'R'], 'Turn'], [['Enter'], 'Place'], [['Drag'], 'Look around']]),
    );
  } else if (ui.mode === 'deploy') {
    const me = player(state.you.id);
    const o = optionFor(ui.sel.x, ui.sel.y, ui.sel.r);
    const mine = state.board.tiles.some((bt) => bt.u.some((u) => u.pid === state.you.id));
    const any = me.probes > 0 || me.dread > 0;
    const say = ui.recallMode
      ? ui.recall
        ? 'Coming home!'
        : 'Pick a probe to call home'
      : ui.target
        ? ui.target.done
          ? `+${ui.target.pts} now!`
          : `${ui.unit === 'dread' ? 'Dreadnought' : 'Probe'} to the ${KIND_WORD[ui.target.k].toLowerCase()}${ui.target.assist ? ' (slingshot!)' : ''}`
        : !any
          ? 'Fleet all out'
          : o.targets.length
            ? 'Send a probe?'
            : 'No room for a probe';
    const sub = ui.recallMode ? 'Burns 1 thruster fuel. The probe scores nothing.' : ui.target ? (ui.target.k === 'V' ? 'It will lie in the void until the end of the game.' : 'Most probes on a feature wins it when it is finished.') : 'Or end your turn without one.';
    main.append(
      el('div', { className: 'dock-say' }, say, el('small', {}, sub)),
      el(
        'div',
        { className: 'dock-btns' },
        !ui.recallMode && any
          ? el(
              'div',
              { className: 'unit-pick', role: 'radiogroup', 'aria-label': 'Which ship' },
              el('button', { type: 'button', className: ui.unit === 'probe' ? 'on' : '', disabled: me.probes < 1, onclick: () => ((ui.unit = 'probe'), sfx('select'), renderDock(store.state)) }, `🚀 Probe ×${me.probes}`),
              el('button', { type: 'button', className: ui.unit === 'dread' ? 'on' : '', disabled: me.dread < 1, title: 'Counts as two probes', onclick: () => ((ui.unit = 'dread'), sfx('select'), renderDock(store.state)) }, '🛸 Dreadnought'),
            )
          : null,
        me.fuel > 0 && mine ? btn(ui.recallMode ? '🚀 Probe' : `⛽ Recall ×${me.fuel}`, () => ((ui.recallMode = !ui.recallMode), (ui.target = null), (ui.recall = null), sfx('select'), drawMarkers(), renderDock(store.state)), 'small', { dataset: { sfx: 'none' } }) : null,
        btn([icon('back'), el('span', {}, 'Back')], back, 'ghost small', { dataset: { sfx: 'none' } }),
        btn([el('span', {}, 'End turn'), icon('check')], endTurn, 'gold', { dataset: { sfx: 'none' } }),
      ),
      keyHints([[['Enter'], 'End turn'], [['⌫'], 'Back']]),
    );
  } else if (ui.mode === 'sending') {
    main.append(el('div', { className: 'dock-wait' }, el('i', { className: 'spinner' }), el('div', { className: 'dock-say' }, 'Transmitting…')));
  } else if (t.done && t.pid === state.you.id) {
    main.append(el('div', { className: 'dock-say' }, '✔ Done!'));
  } else {
    const hex = colourHex(who?.colour);
    main.append(el('div', { className: 'dock-wait', style: { '--c': hex } }, el('i', { className: 'spinner' }), el('div', { className: 'dock-say' }, el('span', { className: 'who', style: { '--c': hex } }, who ? `${who.avatar} ${who.name}` : 'Someone'), t.extra ? ' takes a bonus turn…' : ' is charting…', el('small', {}, state.you.isSpectator ? 'You are watching this game.' : `${matchMedia('(hover: none)').matches ? 'Tap' : 'Point at'} anything on the map to see what it is worth.`))));
  }
  d.replaceChildren(tileBox, main);
}

// ---------------------------------------------------------------------------
// what features with probes on them are worth (a tag over the first probe)
// ---------------------------------------------------------------------------
function drawWorth(state) {
  const v = `${state.version}|${settings.hints}`;
  if (ui.boardVersion === v) return;
  ui.boardVersion = v;
  for (const w of ui.worth) w.remove();
  ui.worth = [];
  if (!settings.hints || !state.board) return;
  const seen = new Set();
  for (const bt of state.board.tiles)
    for (const u of bt.u) {
      const fid = bt.f[u.seg];
      if (seen.has(fid)) continue;
      seen.add(fid);
      const f = state.board.features[fid];
      if (!f) continue;
      const lead = Object.entries(f.power || {}).sort((a, b) => b[1] - a[1])[0];
      const text = f.k === 'V' ? `✨${f.now}` : f.done || f.now === f.full ? `${f.now}` : `${f.now} → ${f.full}`;
      const tag = el('div', { className: 'worth', style: { '--c': lead ? colourOf(lead[0]) : '#1d2340' } }, el('i', {}, '⭐'), ` ${text}`);
      const pos = world.board.segPos(bt.t, bt.r, bt.x, bt.y, u.seg);
      ui.worth.push(world.stage.addLabel(pos, tag, f.k === 'V' ? 0.75 : 1.05));
    }
}


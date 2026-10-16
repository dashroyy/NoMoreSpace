// Star Bonanza: the game screen, over the space farm. Along the top, sticker chips for every farmer (coins, cards in
// hand, their patches). At the bottom, Zorp the alien farmer says what to do right now in a speech bubble, and under
// him are your hand of star cards (in the order you were dealt them, each with its coin table, like the real bean
// cards) and your patches, as wooden planters: tap one to plant, tap Harvest to cash it in. On the right, while the
// UFO has beamed stars down, the Trading Post: the stars on offer, everyone's deals and a deal-maker for your own.
import { el, problem, formatTime } from '../util.js';
import { store, send, act, star, player, serverNow } from './net.js';
import { starArt } from './art.js';
import { sfx, unlock } from './sound.js';
import { settings, toggleMute, onSettings, openSettings } from './settings.js';
import { icon, btn, menuList, onEscape, keyHints, confirmDialog, dialog } from './ui.js';
import { processLog } from './fx.js';
import { openRules } from './codex.js';
import { mountChat, renderChat } from './chat.js';

let built = null;
let world = null;
const ui = { sel: new Set(), want: new Map(), to: '', trayUid: null, busy: false, dl: null, seen: new Set(), coins: new Map(), title: '' };

const iconBtn = (label, title, onClick, className = '') => el('button', { className: `icon-btn ${className}`, title, 'aria-label': title, onclick: onClick }, label);
const pluralS = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const names = (ids) => [].concat(ids || []).map((id) => player(id)?.name || 'Someone');
export const coin = (n = '') => el('i', { className: 'coin' }, `${n}`);
const coins = (n) => el('span', { className: 'coins' }, `${n}`, coin());
const pick = (list, seed) => list[Math.abs(seed) % list.length];
const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

// Zorp, the little alien farmer who runs the UFO and tells you what to do
const ZORP = `<svg viewBox="0 0 64 64" aria-hidden="true"><g stroke="#2d1b4e" stroke-width="3" stroke-linecap="round"><line x1="23" y1="18" x2="15" y2="6"/><line x1="41" y1="18" x2="49" y2="6"/></g><circle cx="15" cy="6" r="4.5" fill="#ff5d8f" stroke="#2d1b4e" stroke-width="3"/><circle cx="49" cy="6" r="4.5" fill="#ff5d8f" stroke="#2d1b4e" stroke-width="3"/><ellipse cx="32" cy="37" rx="23" ry="21" fill="#7dff8a" stroke="#2d1b4e" stroke-width="3"/><ellipse cx="23" cy="34" rx="6.5" ry="9" fill="#14121f"/><ellipse cx="41" cy="34" rx="6.5" ry="9" fill="#14121f"/><circle cx="21" cy="30" r="2.4" fill="#fff"/><circle cx="39" cy="30" r="2.4" fill="#fff"/><path d="M25 47q7 6 14 0" fill="none" stroke="#2d1b4e" stroke-width="3" stroke-linecap="round"/><ellipse cx="15" cy="45" rx="4" ry="2.4" fill="#ff8fb8"/><ellipse cx="49" cy="45" rx="4" ry="2.4" fill="#ff8fb8"/></svg>`;

// what Zorp says (a different joke every turn, the same one while the turn lasts)
const QUIPS = {
  plant: ['In the dirt you go!', 'Pop it in a patch, farmer!', 'Plant that little guy!', 'Time to get your hands dirty!'],
  second: ['Another one? You can, you know.', 'Feeling green-fingered?', 'One more for luck?'],
  trade: ['Wheel and deal, farmer!', 'Swapsies time!', 'Everyone wants a deal. Make one!', 'Bargain hunting season!'],
  other: ['Psst… make them an offer!', 'Got spares? They might want them!', 'The Trading Post is open!'],
  tray: ['You won it, you plant it!', 'Fresh from the trade!', 'Into the soil they go!'],
  wait: ['*whistles in alien*', 'Harvest any time, you know!', 'Patience, farmer…', 'Nice weather in space today.', 'Does anyone else smell… that?', 'Who opened a window?'],
};

// ---------------------------------------------------------------------------
// a star card: the name, the picture, and its coin table ("4 stars = 1 coin, 7 = 2...")
// ---------------------------------------------------------------------------
function meter(d) {
  return el('div', { className: 'sc-meter', title: 'Stars needed for each coin' }, ...d.table.map((need, i) => (need == null ? el('span', { className: 'm none' }, '·') : el('span', { className: 'm' }, el('b', {}, `${need}`), coin(i + 1)))));
}
function starCard(c, { cls = '', onClick = null, badge = null, small = false, delay = 0 } = {}) {
  const d = star(c.t);
  const node = el(
    onClick ? 'button' : 'div',
    { className: `scard ${small ? 'small' : ''} ${cls}`, style: { '--c': d?.color || '#fff', '--d': `${delay}ms` }, title: d ? `${d.name}, ${d.persona.toLowerCase()}. ${d.table.map((n, i) => (n == null ? null : `${n} = ${i + 1} coin${i ? 's' : ''}`)).filter(Boolean).join(', ')}` : '', dataset: { uid: c.uid || '' } },
    el('span', { className: 'sc-name' }, d?.name || c.t),
    el('img', { src: starArt(c.t), alt: '', draggable: false }),
    small || !d ? null : meter(d),
    badge ? el('span', { className: 'sc-badge' }, badge) : null,
  );
  if (onClick) node.addEventListener('click', (e) => onClick(e, node));
  return node;
}

function wantChip(w) {
  const d = star(w.t);
  return el('span', { className: 'wchip', style: { '--c': d?.color || '#fff' } }, el('img', { src: starArt(w.t), alt: '' }), el('b', {}, `${w.n}×`), el('small', {}, d?.name || w.t));
}

export function buildGame(root, { onLeave, world: w }) {
  world = w;
  const refs = {
    code: el('span', { className: 'code' }),
    turn: el('div', { className: 'turn-pill' }),
    deck: el('div', { className: 'deck-pill' }),
    strip: el('div', { className: 'strip' }),
    todo: el('div', { className: 'todo' }),
    hand: el('div', { className: 'hand' }),
    handHead: el('div', { className: 'dock-head' }),
    nurseries: el('div', { className: 'nurseries' }),
    trade: el('aside', { className: 'trade panel', hidden: true }),
    chat: el('div', { className: 'chat' }),
  };
  const sound = iconBtn(icon('sound'), 'Sound on or off', () => toggleMute());
  const drawSound = () => {
    sound.replaceChildren(icon(settings.muted ? 'mute' : 'sound'));
    sound.classList.toggle('off', settings.muted);
  };
  onSettings(drawSound);
  drawSound();
  mountChat(refs.chat);

  const dock = el('section', { className: 'dock' }, refs.todo, el('div', { className: 'dock-row' }, el('div', { className: 'hand-wrap panel' }, refs.handHead, refs.hand), el('div', { className: 'nursery-wrap' }, refs.nurseries)));
  root.replaceChildren(
    // the farmers sit along the top, in the middle; whose turn it is lights up (the 3D arrow and Zorp say so too)
    el(
      'header',
      { className: 'topbar' },
      el('div', { className: 'brand' }, el('span', { className: 'logo' }, '⭐'), refs.code, refs.deck),
      refs.strip,
      el('div', { className: 'top-right' }, iconBtn(icon('book'), 'How to play', () => openRules()), iconBtn(icon('chat'), 'Chat and what happened', () => document.body.classList.toggle('chat-open')), sound, iconBtn(icon('menu'), 'Menu (Esc)', () => openPause(onLeave))),
    ),
    refs.trade,
    dock,
    el('aside', { className: 'chat-drawer panel' }, refs.chat),
  );
  built = refs;

  // the Trading Post ends above the dock, whatever height that is
  new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', `${dock.offsetHeight}px`)).observe(dock);
  setInterval(tickTimer, 250);

  // a robot that took over while you were away steps aside the moment you touch the screen
  let lastWake = 0;
  document.addEventListener('pointerdown', () => {
    const st = store.state;
    if (!st || st.phase !== 'playing' || !player(st.you.id)?.afk || Date.now() - lastWake < 2000) return;
    lastWake = Date.now();
    send('wake').catch(() => {});
  });
  // Escape opens the menu (unless it closed something else)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || document.getElementById('screen-game').hidden) return;
    if (document.querySelector('.dialog-wrap, .end-wrap:not(.peek), #layer-modal:not([hidden])')) return;
    openPause(onLeave);
  });
  // 1, 2, 3 plant in that patch; D finishes the trading
  document.addEventListener('keydown', (e) => {
    const st = store.state;
    if (e.target.matches?.('input, textarea, select') || !st || st.phase !== 'playing' || document.getElementById('screen-game').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.dialog-wrap, #layer-modal:not([hidden])')) return;
    if (/^[1-3]$/.test(e.key)) plantInto(Number(e.key) - 1);
    if (e.key === 'd' || e.key === 'D') doneTrading();
  });
}

// ---------------------------------------------------------------------------
// The menu: the game does not stop for it (it is a game with friends), so it only offers the way out
// ---------------------------------------------------------------------------
let pause = null;
let popPause = null;

function closePause() {
  pause?.classList.add('closing');
  const gone = pause;
  setTimeout(() => gone?.remove(), 180);
  pause = null;
  popPause?.();
  popPause = null;
}

function openPause(onLeave) {
  if (pause) return closePause();
  const menu = menuList([
    { label: '▶ Back to the farm', sub: 'The game keeps going while this is open', onClick: closePause, sound: 'back' },
    { label: '📖 How to play', sub: 'The rules, and what every star pays', onClick: () => openRules() },
    { label: '⚙️ Settings', sub: 'Sound, music and graphics', onClick: () => openSettings() },
    { label: '🚪 Leave the farm', sub: 'A robot farms for you', onClick: () => (closePause(), onLeave()), className: 'danger', sound: 'back' },
  ]);
  pause = el('div', { className: 'pause', onpointerdown: (e) => e.target === pause && closePause() }, el('div', { className: 'pause-panel panel' }, el('h2', {}, 'Taking a break?'), menu, el('div', { className: 'pause-keys' }, keyHints([[['Esc'], 'Back to the farm']]))));
  document.body.append(pause);
  popPause = onEscape(() => (sfx('back'), closePause()));
  setTimeout(() => menu.focusSelected(), 30);
}

// ---------------------------------------------------------------------------

export function renderGame(state, prev) {
  if (!built) return;
  world.sync(state);
  processLog(state, prev);
  const t = state.turn;
  document.body.classList.toggle('my-turn', t?.pid === state.you.id && state.phase === 'playing');
  // the clock: restart it when a new deadline arrives
  if (t?.deadline && t.deadline !== ui.dl?.deadline) ui.dl = { deadline: t.deadline, total: Math.max(1000, t.deadline - serverNow()) };
  if (!t?.deadline) ui.dl = null;
  // choices that no longer make sense are dropped
  const live = new Set([...state.you.hand.map((c) => c.uid), ...(t?.faceUp || []).map((c) => c.uid)]);
  for (const uid of [...ui.sel]) if (!live.has(uid)) ui.sel.delete(uid);
  const tray = player(state.you.id)?.tray || [];
  if (!tray.some((c) => c.uid === ui.trayUid)) ui.trayUid = tray[0]?.uid || null;
  renderTop(state);
  renderStrip(state);
  renderTodo(state);
  renderHand(state);
  renderNurseries(state);
  renderTrade(state);
  renderChat(state);
  tickTimer();
}
const again = () => store.state && renderGame(store.state, store.prev);

function renderTop(state) {
  built.code.textContent = state.code;
  const who = player(state.turn?.pid);
  const phase = { plant: 'is planting', trade: 'is trading', tray: 'planting time', draw: 'is drawing' }[state.turn?.phase] || '';
  built.turn.replaceChildren(who ? el('span', { className: 'tp-av' }, who.avatar) : null, el('b', {}, who ? (who.id === state.you.id ? 'Your turn!' : `${who.name}`) : state.phase === 'ended' ? 'Game over' : '…'), who && who.id !== state.you.id && phase ? el('span', { className: 'muted' }, phase) : null);
  built.turn.classList.toggle('mine', who?.id === state.you.id);
  built.deck.replaceChildren(el('span', { className: 'dp-ico' }, '🛸'), el('b', {}, `${state.deckCount}`), el('span', { className: 'muted' }, state.endPending ? 'last trip!' : `trip ${Math.min(state.deckOuts + 1, state.passes)} of ${state.passes}`));
  built.deck.classList.toggle('last', !!state.endPending);
  built.deck.title = `${state.deckCount} stars left in the UFO. The game ends when it runs empty for the ${['first', 'second', 'third'][state.passes - 1]} time.`;
}

// the farmers along the top
function renderStrip(state) {
  const sig = JSON.stringify(state.players.map((p) => [p.id, p.name, p.coins, p.handCount, p.fields.map((f) => [f.type, f.n]), p.tray.length, p.afk, p.connected])) + state.turn?.pid;
  if (built.strip.dataset.sig === sig) return;
  built.strip.dataset.sig = sig;
  const bumped = new Set(state.players.filter((p) => ui.coins.has(p.id) && p.coins > ui.coins.get(p.id)).map((p) => p.id));
  for (const p of state.players) ui.coins.set(p.id, p.coins);
  built.strip.replaceChildren(
    ...state.players.map((p) =>
      el(
        'button',
        { type: 'button', className: `pchip ${state.turn?.pid === p.id ? 'turn' : ''} ${p.id === state.you.id ? 'me' : ''} ${!p.connected || p.afk ? 'away' : ''}`, dataset: { pid: p.id }, onclick: () => world.look(p.id, { radius: 19, hold: 2.6 }), title: `${p.name}: tap to fly over their farm` },
        el('span', { className: 'pc-av' }, p.avatar),
        el('span', { className: 'pc-who' }, el('b', {}, p.id === state.you.id ? 'You' : p.name), el('span', { className: 'pc-fields' }, ...p.fields.map((f) => (f.type ? el('span', { className: 'pf', title: `${f.n} × ${star(f.type).name}` }, el('img', { src: starArt(f.type), alt: '' }), el('em', {}, `${f.n}`)) : el('span', { className: 'pf empty', title: 'empty patch' }))))),
        el('span', { className: `pc-n ${bumped.has(p.id) ? 'bump' : ''}`, title: 'Coins' }, el('b', {}, `${p.coins}`), coin()),
        el('span', { className: 'pc-n cards', title: 'Cards in hand' }, el('b', {}, `${p.handCount}`), '🃏'),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Zorp: "what do I do now?"
// ---------------------------------------------------------------------------
function trayCard(state) {
  const tray = player(state.you.id)?.tray || [];
  return tray.find((c) => c.uid === ui.trayUid) || tray[0] || null;
}

function renderTodo(state) {
  const todo = state.you.todo;
  const t = state.turn;
  const box = built.todo;
  const meP = player(state.you.id);
  const seed = hash(`${state.code}|${t?.n}|${todo?.kind}|${todo?.second}`);
  let tone = '';
  let art = null;
  let title = '';
  let sub = '';
  let quip = '';
  const actions = [];
  let extra = null;

  if (state.phase === 'ended') {
    title = 'That’s the harvest!';
    sub = 'Every patch has been cashed in. Most coins wins!';
  } else if (state.you.isSpectator) {
    const who = player(t?.pid);
    title = 'You are watching';
    sub = who ? `${who.name} is ${{ plant: 'planting', trade: 'trading', tray: 'planting', draw: 'drawing' }[t.phase] || 'farming'}` : '';
  } else if (!todo) {
    title = t?.phase === 'draw' ? 'Drawing new stars…' : 'Hold on…';
  } else if (todo.kind === 'plant') {
    tone = 'go';
    const c = state.you.hand[0];
    art = c ? starCard(c, { small: true, cls: 'big' }) : null;
    const d = star(todo.card);
    title = todo.must ? `Plant your ${d?.name || 'star'}!` : `Plant the ${d?.name || 'star'} too?`;
    sub = todo.must ? 'Tap a patch below (or press 1, 2, 3). The first card in your hand always gets planted.' : 'You may plant one more, or go straight to trading.';
    quip = pick(todo.must ? QUIPS.plant : QUIPS.second, seed);
    if (!todo.must) actions.push(btn([el('span', {}, 'Skip: let’s trade'), icon('next')], () => doAct({ type: 'skipPlant' }), 'gold', { dataset: { sfx: 'none' } }));
  } else if (todo.kind === 'wait') {
    const on = names(todo.on);
    title = t?.phase === 'tray' ? `${on.join(' & ') || 'Someone'} ${on.length === 1 ? 'is' : 'are'} planting…` : `${on[0] || 'Someone'} is planting…`;
    sub = 'You can harvest your patches whenever you like.';
    quip = pick(QUIPS.wait, seed);
  } else if (todo.kind === 'trade-active') {
    tone = 'go';
    title = 'Trading time!';
    sub = t.faceUp.length ? `The UFO beamed down ${pluralS(t.faceUp.length, 'star')}. Swap them (or cards from your hand) at the Trading Post. Whatever is left is yours to plant.` : 'Swap cards from your hand at the Trading Post, then press Done.';
    quip = pick(QUIPS.trade, seed);
    actions.push(btn([icon('check'), el('span', {}, 'Done trading')], doneTrading, 'gold big', { dataset: { sfx: 'none' } }));
  } else if (todo.kind === 'trade-other') {
    tone = 'go soft';
    title = `${names(todo.on)[0]} is trading`;
    sub = 'Offer them cards from your hand, or take one of their deals. Anything you win must be planted!';
    quip = pick(QUIPS.other, seed);
  } else if (todo.kind === 'tray') {
    tone = 'go';
    const tray = meP?.tray || [];
    const c = trayCard(state);
    const d = c ? star(c.t) : null;
    title = tray.length > 1 ? `Plant your ${d?.name || 'star'}! (${tray.length} to go)` : `Plant your ${d?.name || 'star'}!`;
    sub = 'Stars you won have to be planted. Tap a patch.';
    quip = pick(QUIPS.tray, seed);
    if (tray.length > 1) extra = el('div', { className: 'tray-pick' }, ...tray.map((x) => starCard(x, { small: true, cls: x.uid === (c?.uid || '') ? 'sel' : '', onClick: () => ((ui.trayUid = x.uid), sfx('select'), again()) })));
    else if (c) art = starCard(c, { small: true, cls: 'big' });
  }
  if (meP?.afk && state.phase === 'playing') extra = el('div', { className: 'afk-note' }, '💤 A robot is farming for you', el('small', {}, 'Tap anything to take over'));
  const fresh = title !== ui.title; // a new instruction: Zorp says it with a little bounce
  ui.title = title;
  box.className = `todo ${tone} ${fresh ? 'talk' : ''}`;
  box.replaceChildren(
    el('div', { className: 'zorp', innerHTML: ZORP, title: 'Zorp, your alien farm hand' }),
    el('div', { className: 'bubble' }, art, el('div', { className: 'todo-text' }, el('h3', {}, title), sub ? el('p', {}, sub) : null, quip ? el('p', { className: 'quip' }, `“${quip}”`) : null), extra),
    el('div', { className: 'todo-timer', hidden: !t?.deadline || state.phase !== 'playing' }, el('span', { className: 'tt-ico' }, '⏰'), el('span', { className: 'tt-n' }), el('div', { className: 'timer' }, el('i', { className: 'timer-fill' }))),
    actions.length ? el('div', { className: 'todo-actions' }, ...actions) : null,
  );
}

function tickTimer() {
  const box = built?.todo;
  const st = store.state;
  if (!box || !st?.turn?.deadline || !ui.dl) return;
  const left = Math.max(0, st.turn.deadline - serverNow());
  for (const n of document.querySelectorAll('#screen-game .tt-n')) n.textContent = formatTime(left);
  const fill = box.querySelector('.timer-fill');
  if (fill) fill.style.width = `${Math.min(100, (left / ui.dl.total) * 100)}%`;
  box.classList.toggle('hurry', left < 10_000 && left > 0);
}

// ---------------------------------------------------------------------------
// The hand
// ---------------------------------------------------------------------------
function renderHand(state) {
  const hand = state.you.hand;
  const trading = state.turn?.phase === 'trade' && !state.you.isSpectator;
  const sig = JSON.stringify([hand.map((c) => c.uid), [...ui.sel], trading]);
  if (built.hand.dataset.sig === sig) return;
  built.hand.dataset.sig = sig;
  built.handHead.replaceChildren(el('b', {}, '🃏 Your hand'), el('span', { className: 'muted' }, state.you.isSpectator ? 'you are watching' : hand.length ? (trading ? 'tap cards to offer them' : 'in the order you got them: no sorting!') : 'empty'));
  built.hand.classList.toggle('picking', trading);
  let dealt = 0;
  const live = new Set(hand.map((c) => c.uid));
  built.hand.replaceChildren(
    ...hand.map((c, i) =>
      starCard(c, {
        cls: `${i === 0 ? 'next' : ''} ${ui.sel.has(c.uid) ? 'sel' : ''} ${!ui.seen.has(c.uid) ? 'deal' : ''}`,
        delay: !ui.seen.has(c.uid) ? dealt++ * 90 : 0,
        badge: i === 0 ? 'Next!' : null,
        onClick: trading
          ? () => {
              if (ui.sel.has(c.uid)) ui.sel.delete(c.uid);
              else ui.sel.add(c.uid);
              sfx('select');
              again();
            }
          : null,
      }),
    ),
    hand.length ? null : el('div', { className: 'hand-empty' }, state.you.isSpectator ? '👀 Watching the farm' : 'No cards: you draw three at the end of your turn'),
  );
  ui.seen = live;
}

// ---------------------------------------------------------------------------
// Your patches
// ---------------------------------------------------------------------------
function plantTarget(state) {
  const todo = state.you.todo;
  if (!todo) return null;
  if (todo.kind === 'plant') return state.you.hand[0] || null;
  if (todo.kind === 'tray') return trayCard(state);
  return null;
}

function renderNurseries(state) {
  const meP = player(state.you.id);
  if (!meP || state.you.isSpectator) {
    built.nurseries.replaceChildren();
    world.table.clearHighlights();
    return;
  }
  const target = plantTarget(state);
  const sig = JSON.stringify([meP.fields, meP.coins, state.you.harvestable, target?.t, state.you.canBuyField, state.phase]);
  if (built.nurseries.dataset.sig === sig) return;
  built.nurseries.dataset.sig = sig;
  world.table.clearHighlights();
  const panels = meP.fields.map((f, i) => {
    const d = f.type ? star(f.type) : null;
    const h = state.you.harvestable[i] || { ok: false, lumens: 0, next: null };
    const fits = !!target && (!f.n || f.type === target.t);
    const clash = !!target && f.n > 0 && f.type !== target.t;
    if (fits) world.table.highlight(meP.id, i, true);
    return el(
      'div',
      { className: `nursery ${f.n ? 'full' : 'empty'} ${fits ? 'fits' : ''} ${clash ? 'clash' : ''}`, style: { '--c': d?.color || '#c98a4b' }, dataset: { field: i }, onclick: (e) => !e.target.closest('button') && plantInto(i), role: target ? 'button' : null, tabindex: target ? 0 : -1, 'aria-label': `Patch ${i + 1}` },
      el('span', { className: 'n-key' }, `${i + 1}`),
      target ? el('div', { className: 'n-hint' }, clash ? 'Harvest first' : 'Plant here!') : null,
      el('div', { className: 'n-soil' }, d ? el('img', { src: starArt(f.type), alt: '' }) : el('span', { className: 'n-sprout' }, '🌱'), d ? el('span', { className: 'n-count' }, `×${f.n}`) : null),
      el(
        'div',
        { className: 'n-info' },
        el('b', {}, d ? d.name : 'Empty patch'),
        d ? el('small', {}, h.lumens ? ['Worth ', coins(h.lumens)] : 'Worth nothing yet') : el('small', {}, target ? 'plant here!' : 'grows one kind of star'),
        d ? el('small', { className: 'n-next' }, h.next ? [`${h.next.more} more → `, coins(h.next.lumens)] : 'as good as it gets!') : null,
      ),
      f.n ? btn(h.ok ? (h.lumens ? ['Harvest! +', coins(h.lumens)] : 'Harvest (nothing)') : '🔒 Lonely star', () => harvest(i), `small ${h.ok ? (h.lumens ? 'gold' : 'pink') : ''}`, { disabled: !h.ok, title: h.ok ? '' : 'A patch with one star is safe while another patch has more', dataset: { sfx: 'none' } }) : null,
    );
  });
  if (meP.fields.length < 3) {
    const need = store.data.fieldPrice;
    panels.push(el('div', { className: `nursery ghost ${state.you.canBuyField ? 'can' : ''}` }, el('div', { className: 'n-soil' }, el('span', { className: 'n-sprout' }, '🪧')), el('div', { className: 'n-info' }, el('b', {}, 'For sale!'), el('small', {}, 'A third patch')), btn(['Buy for ', coins(need)], buyField, 'small mint', { disabled: !state.you.canBuyField, dataset: { sfx: 'none' } })));
  }
  built.nurseries.replaceChildren(...panels);
}

// ---------------------------------------------------------------------------
// Doing things
// ---------------------------------------------------------------------------
async function doAct(a) {
  if (ui.busy) return false;
  ui.busy = true;
  unlock();
  try {
    await act(a);
    return true;
  } catch (e) {
    sfx('error');
    problem(e.message);
    return false;
  } finally {
    ui.busy = false;
  }
}

async function plantInto(i) {
  const st = store.state;
  if (!st || st.phase !== 'playing' || st.you.isSpectator) return;
  const card = plantTarget(st);
  const meP = player(st.you.id);
  const f = meP?.fields[i];
  if (!card || !f) return;
  let harvest = false;
  if (f.n && f.type !== card.t) {
    const h = st.you.harvestable[i];
    if (!h?.ok) {
      sfx('error');
      return problem('That patch has one lonely star, and it is safe while another patch has more. Plant somewhere else, or harvest your bigger patch.');
    }
    const ok = await confirmDialog({
      title: `Harvest the ${star(f.type).name}s first?`,
      text: h.lumens ? `Your ${pluralS(f.n, star(f.type).name)} cash in for ${h.lumens} coin${h.lumens === 1 ? '' : 's'}, then the ${star(card.t).name} moves in.` : `Your ${pluralS(f.n, star(f.type).name)} are not worth a coin yet. They wander off for nothing, and the ${star(card.t).name} moves in.`,
      yes: 'Harvest and plant',
      no: 'Oops, no',
      danger: !h.lumens,
    });
    if (!ok) return;
    harvest = true;
  }
  // the card flies from where it is (the hand, or the speech bubble)
  const cardEl = built.hand.querySelector(`[data-uid="${card.uid}"]`) || built.todo.querySelector(`[data-uid="${card.uid}"]`);
  if (cardEl) world.handFrom = { rect: cardEl.getBoundingClientRect(), at: Date.now() };
  const done = await doAct({ type: 'plant', field: i, uid: st.you.todo.kind === 'tray' ? card.uid : undefined, harvest });
  if (!done) world.handFrom = null;
}

async function harvest(i) {
  const st = store.state;
  const h = st?.you.harvestable[i];
  const f = player(st.you.id)?.fields[i];
  if (!h || !f?.n) return;
  if (!h.ok) {
    sfx('error');
    return problem('A patch with one lonely star is safe while another has more.');
  }
  if (!h.lumens) {
    const ok = await confirmDialog({ title: 'Harvest for nothing?', text: `${pluralS(f.n, star(f.type).name)} are not worth a single coin yet. They would just wander off.`, yes: 'Harvest anyway', no: 'Keep growing', danger: true });
    if (!ok) return;
  }
  await doAct({ type: 'harvest', field: i });
}

async function buyField() {
  const ok = await confirmDialog({ title: 'Buy a third patch?', text: `It costs ${store.data.fieldPrice} coins, and gives your star buddies more room to grow.`, yes: 'Buy it!', no: 'Not now' });
  if (ok) await doAct({ type: 'buyField' });
}

async function doneTrading() {
  const st = store.state;
  if (!st || st.turn?.pid !== st.you.id || st.turn.phase !== 'trade') return;
  const left = st.turn.faceUp.length;
  if (left) {
    const ok = await confirmDialog({ title: 'All done trading?', text: `You still have ${pluralS(left, 'beamed-down star')}, and anything you keep has to be planted.`, yes: 'Done!', no: 'Keep trading' });
    if (!ok) return;
  }
  sfx('select');
  await doAct({ type: 'doneTrading' });
}

// ---------------------------------------------------------------------------
// The Trading Post
// ---------------------------------------------------------------------------
function renderTrade(state) {
  const t = state.turn;
  const open = !!t && t.phase === 'trade' && state.phase === 'playing';
  built.trade.hidden = !open;
  document.body.classList.toggle('trading', open);
  world.trading = open;
  if (!open) {
    ui.sel.clear();
    ui.want.clear();
    built.trade.dataset.sig = '';
    return;
  }
  const meId = state.you.id;
  const playing = !state.you.isSpectator;
  const active = t.pid === meId;
  const activeP = player(t.pid);
  const sig = JSON.stringify([t.offers, t.faceUp.map((c) => c.uid), state.you.hand.map((c) => c.uid), [...ui.sel], [...ui.want], ui.to, active, state.players.map((p) => p.id)]);
  if (built.trade.dataset.sig === sig) return;
  built.trade.dataset.sig = sig;
  const scroll = built.trade.querySelector('.trade-body')?.scrollTop || 0;
  // the cards I could give: my hand, and (on my turn) the beamed-down ones
  const pool = [...state.you.hand, ...(active ? t.faceUp : [])];
  const toggle = (uid) => {
    if (ui.sel.has(uid)) ui.sel.delete(uid);
    else ui.sel.add(uid);
    sfx('select');
    again();
  };

  const faceUp = el(
    'div',
    { className: 'tr-sec' },
    el('div', { className: 'tr-title' }, el('b', {}, '🛸 Beamed down'), el('small', {}, active ? 'yours to swap, or to plant' : `${activeP?.name || ''} can swap these`)),
    el('div', { className: 'faceup' }, ...(t.faceUp.length ? t.faceUp.map((c) => starCard(c, { small: true, cls: ui.sel.has(c.uid) ? 'sel' : '', onClick: active ? () => toggle(c.uid) : null })) : [el('div', { className: 'empty-note' }, 'All gone!')])),
  );

  const offerRow = (o) => {
    const from = player(o.from);
    const toP = o.to ? player(o.to) : null;
    const mineO = o.from === meId;
    const canTake = playing && !mineO && (active || (o.from === t.pid && (!o.to || o.to === meId)));
    const need = {};
    for (const w of o.want) need[w.t] = (need[w.t] || 0) + w.n;
    const short = Object.entries(need).filter(([k, n]) => pool.filter((c) => c.t === k).length < n);
    const addressee = o.from === t.pid ? (toP ? `for ${toP.id === meId ? 'you' : toP.name}` : 'for anyone') : `for ${activeP?.id === meId ? 'you' : activeP?.name || ''}`;
    return el(
      'div',
      { className: `offer ${mineO ? 'mine' : ''} ${canTake && !short.length ? 'can' : ''}` },
      el('div', { className: 'of-head' }, el('span', { className: 'of-av' }, from?.avatar || '?'), el('b', {}, mineO ? 'Your deal' : from?.name || 'Someone'), el('small', {}, addressee)),
      el(
        'div',
        { className: 'of-body' },
        el('div', { className: 'of-give' }, el('small', {}, o.give.length ? 'gives' : 'gives nothing'), el('div', { className: 'of-cards' }, ...o.give.map((c) => starCard(c, { small: true })))),
        el('span', { className: 'of-arrow' }, o.want.length ? '⇄' : '🎁'),
        el('div', { className: 'of-want' }, el('small', {}, o.want.length ? 'wants' : 'a free gift!'), el('div', { className: 'of-chips' }, ...o.want.map(wantChip))),
      ),
      mineO
        ? btn('Take it back', () => doAct({ type: 'cancelOffer', id: o.id }), 'small ghost', { dataset: { sfx: 'back' } })
        : canTake
          ? btn(short.length ? `You need ${short.map(([k, n]) => `${n} ${star(k).name}`).join(' + ')}` : o.want.length ? 'Deal! 🤝' : 'Yes please! 🎁', () => accept(o, state), `small ${short.length ? '' : 'mint'}`, { disabled: short.length > 0, dataset: { sfx: 'none' } })
          : null,
    );
  };
  const offers = el('div', { className: 'tr-sec' }, el('div', { className: 'tr-title' }, el('b', {}, '📋 Deals on the table'), el('small', {}, t.offers.length ? `${t.offers.length} open` : '')), el('div', { className: 'offers' }, ...(t.offers.length ? t.offers.map(offerRow) : [el('div', { className: 'empty-note' }, 'No deals yet. Make one below!')])));

  let builder = null;
  if (playing) {
    const maxed = t.offers.filter((o) => o.from === meId).length >= 3;
    const give = pool.filter((c) => ui.sel.has(c.uid));
    const wantList = [...ui.want].map(([k, n]) => ({ t: k, n }));
    const others = state.players.filter((p) => p.id !== meId);
    const gift = give.length && !wantList.length;
    builder = el(
      'div',
      { className: 'tr-sec builder' },
      el('div', { className: 'tr-title' }, el('b', {}, '✍️ Make a deal'), el('small', {}, maxed ? 'three deals open: take one back first' : active ? 'to one farmer, or to everyone' : `with ${activeP?.name || 'them'}`)),
      el('div', { className: 'bd-row' }, el('small', {}, 'You give'), el('div', { className: 'bd-chips' }, ...(give.length ? give.map((c) => starCard(c, { small: true, cls: 'sel', onClick: () => toggle(c.uid) })) : [el('span', { className: 'muted' }, active ? 'tap cards in your hand, or beamed-down stars' : 'tap cards in your hand')]))),
      el(
        'div',
        { className: 'bd-row' },
        el('small', {}, 'You want'),
        el('div', { className: 'kinds' }, ...state.setIds.map((id) => star(id)).map((d) => el('button', { type: 'button', className: `kind ${ui.want.has(d.id) ? 'on' : ''}`, style: { '--c': d.color }, title: d.name, onclick: () => (ui.want.set(d.id, Math.min(4, (ui.want.get(d.id) || 0) + 1)), sfx('select'), again()), dataset: { sfx: 'none' } }, el('img', { src: starArt(d.id), alt: d.name }), ui.want.has(d.id) ? el('span', { className: 'k-n' }, `${ui.want.get(d.id)}`) : null))),
        wantList.length ? el('div', { className: 'bd-chips wants' }, ...wantList.map((w) => el('button', { type: 'button', className: 'wchip removable', style: { '--c': star(w.t).color }, title: 'Remove', onclick: () => (ui.want.delete(w.t), sfx('back'), again()), dataset: { sfx: 'none' } }, el('img', { src: starArt(w.t), alt: '' }), el('b', {}, `${w.n}×`), el('small', {}, star(w.t).name), el('span', { className: 'x' }, '✕')))) : null,
      ),
      active && others.length > 1 ? el('div', { className: 'bd-row to' }, el('small', {}, 'Offer to'), el('select', { 'aria-label': 'Offer to', onchange: (e) => ((ui.to = e.target.value), again()) }, el('option', { value: '' }, 'Everyone'), ...others.map((p) => el('option', { value: p.id, selected: ui.to === p.id }, `${p.avatar} ${p.name}`)))) : null,
      btn(gift ? 'Give it away 🎁' : 'Put it on the table', postOffer, 'gold post', { disabled: maxed || (!give.length && !wantList.length), dataset: { sfx: 'none' } }),
    );
  }

  built.trade.replaceChildren(el('div', { className: 'awning', 'aria-hidden': 'true' }), el('div', { className: 'tr-head' }, el('h2', {}, 'Trading Post'), el('div', { className: 'tr-clock' }, '⏰ ', el('span', { className: 'tt-n' }))), el('div', { className: 'trade-body' }, faceUp, offers, builder));
  built.trade.querySelector('.trade-body').scrollTop = scroll;
}

async function postOffer() {
  const st = store.state;
  const t = st?.turn;
  if (!t) return;
  const body = { type: 'offer', give: [...ui.sel], want: [...ui.want].map(([k, n]) => ({ t: k, n })) };
  if (t.pid === st.you.id && ui.to) body.to = ui.to;
  const ok = await doAct(body);
  if (ok) {
    sfx('offer');
    ui.sel.clear();
    ui.want.clear();
    again();
  }
}

// taking a deal: give what they asked for. Beamed-down stars go first, then the back of the hand; only when there
// is a real choice between cards in your hand (their places matter) are you asked which.
async function accept(o, state) {
  const t = state.turn;
  const active = t.pid === state.you.id;
  const pool = [...state.you.hand, ...(active ? t.faceUp : [])];
  const need = {};
  for (const w of o.want) need[w.t] = (need[w.t] || 0) + w.n;
  let give = [];
  let choice = false;
  for (const [k, n] of Object.entries(need)) {
    const up = (active ? t.faceUp : []).filter((c) => c.t === k).slice(0, n);
    const rest = n - up.length;
    const inHand = state.you.hand.filter((c) => c.t === k);
    if (rest > 0 && inHand.length > rest) choice = true;
    give.push(...up.map((c) => c.uid), ...(rest > 0 ? inHand.slice(inHand.length - rest).map((c) => c.uid) : []));
  }
  if (choice) give = await pickGive(need, pool, state);
  if (!give) return;
  const ok = await doAct({ type: 'accept', id: o.id, give });
  if (ok) ui.sel.clear();
}

function pickGive(need, pool, state) {
  return new Promise((resolve) => {
    const chosen = new Set();
    const order = [...pool].reverse();
    for (const [k, n] of Object.entries(need)) order.filter((c) => c.t === k).slice(0, n).forEach((c) => chosen.add(c.uid));
    const handIndex = new Map(state.you.hand.map((c, i) => [c.uid, i + 1]));
    const list = el('div', { className: 'pick-list' });
    let d = null;
    const finish = (v) => {
      d?.close();
      resolve(v);
    };
    const exact = () => Object.entries(need).every(([k, n]) => pool.filter((c) => c.t === k && chosen.has(c.uid)).length === n);
    const ok = btn('Give these', () => finish([...chosen]), 'gold', { disabled: !exact() });
    const draw = () => {
      ok.disabled = !exact();
      list.replaceChildren(
        ...Object.entries(need).map(([k, n]) =>
          el(
            'div',
            { className: 'pick-group' },
            el('div', { className: 'pg-title' }, `Pick ${n} × ${star(k).name}`),
            el('div', { className: 'pg-cards' }, ...pool.filter((c) => c.t === k).map((c) => starCard(c, { small: true, cls: chosen.has(c.uid) ? 'sel' : '', badge: handIndex.has(c.uid) ? `#${handIndex.get(c.uid)}` : 'UFO', onClick: () => ((chosen.has(c.uid) ? chosen.delete(c.uid) : chosen.add(c.uid)), draw()) }))),
          ),
        ),
      );
    };
    draw();
    d = dialog({ title: 'Which ones do you give?', body: el('div', {}, el('p', { className: 'muted' }, 'You have more than they asked for. The number is the card’s place in your hand.'), list), actions: [btn('Cancel', () => finish(null), 'ghost', { dataset: { sfx: 'back' } }), ok], onClose: () => resolve(null) });
  });
}

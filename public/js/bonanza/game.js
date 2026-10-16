// Star Bonanza: the game screen, over the 3D table. Along the top, who is playing (lumens, cards in hand, their
// nurseries); at the bottom, what to do right now in big letters, your hand of stars in the order you were dealt
// them, and your nurseries (tap one to plant, tap Harvest to cash it in); on the right, while stars are turned
// over, the trading panel: the turned-over stars, everyone's offers and a builder for your own.
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
const ui = { sel: new Set(), want: new Map(), to: '', trayUid: null, busy: false, dl: null };

const iconBtn = (label, title, onClick, className = '') => el('button', { className: `icon-btn ${className}`, title, 'aria-label': title, onclick: onClick }, label);
const pluralS = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const lumens = (n) => `${n} ✦`;
const names = (ids) => [].concat(ids || []).map((id) => player(id)?.name || 'Someone');

// ---------------------------------------------------------------------------
// a star card: the picture, the name, an optional badge
// ---------------------------------------------------------------------------
function starCard(c, { cls = '', onClick = null, badge = null, small = false } = {}) {
  const d = star(c.t);
  const node = el(
    onClick ? 'button' : 'div',
    { className: `scard ${small ? 'small' : ''} ${cls}`, style: { '--c': d?.color || '#fff' }, title: d ? `${d.name}: ${d.table.map((n, i) => (n == null ? null : `${n} = ${i + 1}✦`)).filter(Boolean).join(', ')}` : '', dataset: { uid: c.uid || '' } },
    el('img', { src: starArt(c.t, small ? 96 : 160), alt: '', draggable: false }),
    el('b', {}, d?.name || c.t),
    badge ? el('span', { className: 'sc-badge' }, badge) : null,
  );
  if (onClick) node.addEventListener('click', (e) => onClick(e, node));
  return node;
}

// a little picture with a count: "2 × Pulsar" in the offers
function wantChip(w) {
  const d = star(w.t);
  return el('span', { className: 'wchip', style: { '--c': d?.color || '#fff' } }, el('img', { src: starArt(w.t, 64), alt: '' }), el('b', {}, `${w.n}×`), el('small', {}, d?.name || w.t));
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
  const sound = iconBtn(icon('sound'), 'Mute or unmute everything', () => toggleMute());
  const drawSound = () => {
    sound.replaceChildren(icon(settings.muted ? 'mute' : 'sound'));
    sound.classList.toggle('off', settings.muted);
  };
  onSettings(drawSound);
  drawSound();
  const chatToggle = iconBtn(icon('chat'), 'Chat and game log', () => document.body.classList.toggle('chat-open'));
  const menuBtn = iconBtn(icon('menu'), 'Menu (Esc)', () => openPause(onLeave), 'menu-btn');
  const rulesBtn = iconBtn(icon('book'), 'How to play', () => openRules());
  mountChat(refs.chat);

  const dock = el(
    'section',
    { className: 'dock' },
    refs.todo,
    el('div', { className: 'dock-row' }, el('div', { className: 'hand-wrap panel' }, refs.handHead, refs.hand), el('div', { className: 'nursery-wrap' }, refs.nurseries)),
  );
  root.replaceChildren(
    el('header', { className: 'topbar' }, el('div', { className: 'brand' }, el('span', { className: 'logo' }, 'STAR BONANZA'), refs.code), el('div', { className: 'top-mid' }, refs.turn, refs.deck), el('div', { className: 'top-right' }, rulesBtn, chatToggle, sound, menuBtn)),
    refs.strip,
    refs.trade,
    dock,
    el('aside', { className: 'chat-drawer panel' }, refs.chat),
  );
  built = refs;
  built.dock = dock;

  // the trading panel ends above the dock, whatever height that is
  new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', `${dock.offsetHeight}px`)).observe(dock);

  // the clock on whatever is being waited for
  setInterval(tickTimer, 250);

  // Escape opens the menu (unless it closed something else)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || document.getElementById('screen-game').hidden) return;
    if (document.querySelector('.dialog-wrap, .end-wrap:not(.peek), #layer-modal:not([hidden])')) return;
    openPause(onLeave);
  });
  // 1, 2, 3 plant in that nursery; D finishes the trading
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
    { label: 'Resume', sub: 'Back to the table', onClick: closePause, sound: 'back' },
    { label: 'How to play', sub: 'The rules, and what every star pays', onClick: () => openRules() },
    { label: 'Settings', sub: 'Sound, music and graphics', onClick: () => openSettings() },
    { label: 'Leave the table', sub: 'A robot takes over your seat', onClick: () => (closePause(), onLeave()), className: 'danger', sound: 'back' },
  ]);
  pause = el(
    'div',
    { className: 'pause', onpointerdown: (e) => e.target === pause && closePause() },
    el('div', { className: 'pause-panel panel' }, el('div', { className: 'eyebrow' }, 'Menu'), el('h2', {}, 'The game goes on'), menu, el('div', { className: 'pause-keys' }, keyHints([[['↑', '↓'], 'Choose'], [['Enter'], 'Select'], [['Esc'], 'Resume']]))),
  );
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
  const mine = t?.pid === state.you.id;
  document.body.classList.toggle('my-turn', mine && state.phase === 'playing');
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

function renderTop(state) {
  built.code.textContent = state.code;
  const who = player(state.turn?.pid);
  const phase = { plant: 'planting', trade: 'trading', tray: 'planting what they won', draw: 'drawing' }[state.turn?.phase] || '';
  built.turn.replaceChildren(
    who ? el('span', { className: 'tp-av' }, who.avatar) : null,
    who ? el('b', {}, who.id === state.you.id ? 'Your turn' : `${who.name}'s turn`) : el('b', {}, state.phase === 'ended' ? 'Game over' : '…'),
    phase ? el('span', { className: 'muted' }, phase) : null,
  );
  built.turn.classList.toggle('mine', who?.id === state.you.id);
  built.deck.replaceChildren(
    el('span', { className: 'dp-ico' }, '🂠'),
    el('b', {}, `${state.deckCount}`),
    el('span', { className: 'muted' }, state.endPending ? 'LAST TURN' : `shuffle ${Math.min(state.deckOuts + 1, state.passes)} of ${state.passes}`),
  );
  built.deck.classList.toggle('last', !!state.endPending);
  built.deck.title = `${state.deckCount} stars left in the deck. When it runs out for the ${state.passes === 1 ? 'first' : state.passes === 2 ? 'second' : 'third'} time, the game ends.`;
}

// the players along the top
function renderStrip(state) {
  const sig = JSON.stringify(state.players.map((p) => [p.id, p.name, p.coins, p.handCount, p.fields.map((f) => [f.type, f.n]), p.tray.length, p.afk, p.connected])) + state.turn?.pid;
  if (built.strip.dataset.sig === sig) return;
  built.strip.dataset.sig = sig;
  built.strip.replaceChildren(
    ...state.players.map((p) =>
      el(
        'div',
        { className: `pchip ${state.turn?.pid === p.id ? 'turn' : ''} ${p.id === state.you.id ? 'me' : ''} ${!p.connected || p.afk ? 'away' : ''}`, dataset: { pid: p.id }, onclick: () => world.look(p.id, { radius: 17, hold: 2.6 }), title: `${p.name}: tap to look at their nurseries` },
        el('span', { className: 'pc-av' }, p.avatar),
        el('div', { className: 'pc-who' }, el('b', {}, p.name), el('div', { className: 'pc-fields' }, ...p.fields.map((f) => el('i', { style: { '--c': f.type ? star(f.type).color : 'transparent' }, title: f.type ? `${f.n} × ${star(f.type).name}` : 'empty nursery' }, f.n ? `${f.n}` : '')), p.tray.length ? el('em', { title: 'Stars to plant' }, `+${p.tray.length}`) : null)),
        el('span', { className: 'pc-n lum', title: 'Lumens' }, el('b', {}, `${p.coins}`), '✦'),
        el('span', { className: 'pc-n', title: 'Stars in hand' }, el('b', {}, `${p.handCount}`), '🂠'),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// "What do I do now?"
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
  let tone = '';
  let art = null;
  let title = '';
  let sub = '';
  const actions = [];
  let extra = null;

  if (state.phase === 'ended') {
    title = 'The deck has run dry';
    sub = 'Every nursery was harvested. The most lumens wins!';
  } else if (state.you.isSpectator) {
    const who = player(t?.pid);
    title = 'You are watching';
    sub = who ? `${who.name} is ${{ plant: 'planting', trade: 'trading', tray: 'planting', draw: 'drawing' }[t.phase] || 'playing'}` : '';
  } else if (!todo) {
    title = t?.phase === 'draw' ? 'Drawing stars…' : '…';
    sub = '';
  } else if (todo.kind === 'plant') {
    tone = 'go';
    const c = state.you.hand[0];
    art = c ? starCard(c, { cls: 'big', small: false }) : null;
    const d = star(todo.card);
    title = todo.must ? `Plant your ${d?.name || 'star'}` : `Plant the next ${d?.name || 'star'}?`;
    sub = todo.must ? 'Tap one of your nurseries below (or press 1, 2, 3). The first star in your hand must be planted.' : 'You may plant one more, or skip to the trading.';
    if (!todo.must) actions.push(btn([el('span', {}, 'Skip: go to trading'), icon('next')], () => doAct({ type: 'skipPlant' }), 'gold', { dataset: { sfx: 'none' } }));
  } else if (todo.kind === 'wait') {
    const on = names(todo.on);
    title = t?.phase === 'tray' ? `${on.join(', ') || 'Someone'} ${on.length === 1 ? 'is' : 'are'} planting…` : `${on[0] || 'Someone'} is planting…`;
    sub = 'You can harvest your nurseries at any time.';
  } else if (todo.kind === 'trade-active') {
    tone = 'go';
    title = 'Trade!';
    sub = t.faceUp.length ? `Swap the ${pluralS(t.faceUp.length, 'turned-over star')} and any star in your hand. Stars left over are yours to plant.` : 'Swap any star in your hand with the others.';
    actions.push(btn([icon('check'), el('span', {}, 'Done trading')], doneTrading, 'gold big', { dataset: { sfx: 'none' } }));
  } else if (todo.kind === 'trade-other') {
    tone = 'go soft';
    title = `${names(todo.on)[0]} is trading`;
    sub = 'Offer them stars from your hand, or take one of their offers. Whatever you win has to be planted.';
  } else if (todo.kind === 'tray') {
    tone = 'go';
    const tray = meP?.tray || [];
    const c = trayCard(state);
    const d = c ? star(c.t) : null;
    title = tray.length > 1 ? `Plant the ${d?.name || 'star'} (${tray.length} to plant)` : `Plant your ${d?.name || 'star'}`;
    sub = 'Stars you won must be planted. Tap a nursery.';
    if (tray.length > 1) extra = el('div', { className: 'tray-pick' }, ...tray.map((x) => starCard(x, { small: true, cls: x.uid === (c?.uid || '') ? 'sel' : '', onClick: () => ((ui.trayUid = x.uid), sfx('select'), renderGameAgain()) })));
    else if (c) art = starCard(c, { cls: 'big' });
  }
  box.className = `todo ${tone}`;
  box.replaceChildren(
    art,
    el('div', { className: 'todo-text' }, el('h3', {}, title), sub ? el('p', {}, sub) : null),
    extra,
    el('div', { className: 'todo-timer', hidden: !t?.deadline || state.phase !== 'playing' }, el('span', { className: 'tt-n' }), el('div', { className: 'timer' }, el('i', { className: 'timer-fill' }))),
    actions.length ? el('div', { className: 'todo-actions' }, ...actions) : null,
  );
}

const renderGameAgain = () => store.state && renderGame(store.state, store.prev);

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
  const t = state.turn;
  const trading = t?.phase === 'trade' && !state.you.isSpectator;
  const sig = JSON.stringify([hand.map((c) => c.uid), [...ui.sel], trading, state.you.todo?.kind]);
  if (built.hand.dataset.sig === sig) return;
  built.hand.dataset.sig = sig;
  built.handHead.replaceChildren(el('b', {}, 'Your hand'), el('span', { className: 'muted' }, state.you.isSpectator ? 'you are watching' : hand.length ? (trading ? 'tap stars to offer them' : 'in the order you were dealt them') : 'empty'), hand.length ? el('span', { className: 'dh-n' }, `${hand.length}`) : null);
  built.hand.classList.toggle('picking', trading);
  built.hand.replaceChildren(
    ...hand.map((c, i) =>
      starCard(c, {
        cls: `${i === 0 ? 'next' : ''} ${ui.sel.has(c.uid) ? 'sel' : ''}`,
        badge: i === 0 ? 'NEXT' : null,
        onClick: trading
          ? () => {
              if (ui.sel.has(c.uid)) ui.sel.delete(c.uid);
              else ui.sel.add(c.uid);
              sfx('select');
              renderGameAgain();
            }
          : null,
      }),
    ),
    hand.length ? null : el('div', { className: 'hand-empty' }, state.you.isSpectator ? 'Watching the game' : 'No stars in hand: you will draw three after your turn'),
  );
}

// ---------------------------------------------------------------------------
// Your nurseries
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
    if (target && fits) world.table.highlight(meP.id, i, true);
    const next = h.next;
    return el(
      'div',
      { className: `nursery ${f.n ? 'full' : 'empty'} ${fits ? 'fits' : ''} ${clash ? 'clash' : ''}`, style: { '--c': d?.color || '#4fe8ff' }, dataset: { field: i }, onclick: (e) => !e.target.closest('button') && plantInto(i), role: target ? 'button' : null, tabindex: target ? 0 : -1, 'aria-label': `Nursery ${i + 1}` },
      el('span', { className: 'n-key' }, `${i + 1}`),
      f.n
        ? el('div', { className: 'n-body' }, el('img', { src: starArt(f.type, 160), alt: '' }), el('div', { className: 'n-info' }, el('b', {}, `${f.n} × ${d.name}`), el('small', {}, h.lumens ? `pays ${lumens(h.lumens)} now` : 'pays nothing yet'), next ? el('small', { className: 'n-next' }, `${next.more} more → ${lumens(next.lumens)}`) : el('small', { className: 'n-next' }, 'as good as it gets')))
        : el('div', { className: 'n-body' }, el('div', { className: 'n-empty' }, '🌱'), el('div', { className: 'n-info' }, el('b', {}, 'Empty'), el('small', {}, target ? 'plant here' : 'one kind of star'))),
      target ? el('div', { className: 'n-hint' }, clash ? 'harvest first' : 'plant here') : null,
      f.n ? btn(h.ok ? (h.lumens ? `Harvest +${lumens(h.lumens)}` : 'Burn out') : 'Protected', () => harvest(i), `small ${h.ok ? (h.lumens ? 'gold' : 'danger') : ''}`, { disabled: !h.ok, title: h.ok ? '' : 'A single star is safe while another nursery has more', dataset: { sfx: 'none' } }) : null,
    );
  });
  if (meP.fields.length < 3) {
    const need = store.data.fieldPrice;
    panels.push(
      el(
        'div',
        { className: `nursery ghost ${state.you.canBuyField ? 'can' : ''}` },
        el('div', { className: 'n-body' }, el('div', { className: 'n-empty' }, '➕'), el('div', { className: 'n-info' }, el('b', {}, '3rd nursery'), el('small', {}, state.you.canBuyField ? `costs ${lumens(need)}` : `needs ${lumens(need)}`))),
        btn(`Open for ${lumens(need)}`, buyField, 'small', { disabled: !state.you.canBuyField, dataset: { sfx: 'none' } }),
      ),
    );
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
      return problem('That nursery has a single star, which is safe while another nursery has more. Plant somewhere else, or harvest your bigger nursery.');
    }
    const ok = await confirmDialog({
      title: `Harvest your ${star(f.type).name}s first?`,
      text: h.lumens ? `${pluralS(f.n, 'star')} pay${f.n === 1 ? 's' : ''} ${lumens(h.lumens)}. Then your ${star(card.t).name} takes its place.` : `${pluralS(f.n, 'star')} would burn out for nothing. Then your ${star(card.t).name} takes its place.`,
      yes: 'Harvest and plant',
      no: 'Cancel',
      danger: !h.lumens,
    });
    if (!ok) return;
    harvest = true;
  }
  // the card flies from where it is (the hand, or the tray)
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
    return problem('A nursery with one star is safe while another has more.');
  }
  if (!h.lumens) {
    const ok = await confirmDialog({ title: 'Burn these stars out?', text: `${pluralS(f.n, star(f.type).name)} are not enough for a single lumen yet. Harvesting now earns nothing.`, yes: 'Harvest anyway', no: 'Keep growing', danger: true });
    if (!ok) return;
  }
  await doAct({ type: 'harvest', field: i });
}

async function buyField() {
  const ok = await confirmDialog({ title: 'Open a third nursery?', text: `It costs ${lumens(store.data.fieldPrice)}, and gives you more room to grow.`, yes: 'Open it', no: 'Not now' });
  if (ok) await doAct({ type: 'buyField' });
}

async function doneTrading() {
  const st = store.state;
  if (!st || st.turn?.pid !== st.you.id || st.turn.phase !== 'trade') return;
  const left = st.turn.faceUp.length;
  if (left) {
    const ok = await confirmDialog({ title: 'Finish trading?', text: `You still hold ${pluralS(left, 'turned-over star')}, and anything you keep must be planted.`, yes: 'Done trading', no: 'Keep trading' });
    if (!ok) return;
  }
  sfx('select');
  await doAct({ type: 'doneTrading' });
}

// ---------------------------------------------------------------------------
// The trading panel
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

  // the pool of stars I could give: my hand, and (on my turn) the turned-over ones
  const pool = [...state.you.hand, ...(active ? t.faceUp : [])];

  // ----- the turned-over stars
  const faceUp = el(
    'div',
    { className: 'tr-sec' },
    el('div', { className: 'tr-title' }, el('b', {}, 'Turned over'), el('small', { className: 'muted' }, active ? 'yours to trade, or to plant' : `${activeP?.name || ''} may trade these`)),
    el(
      'div',
      { className: 'faceup' },
      ...(t.faceUp.length
        ? t.faceUp.map((c) =>
            starCard(c, {
              cls: ui.sel.has(c.uid) ? 'sel' : '',
              onClick: active
                ? () => {
                    if (ui.sel.has(c.uid)) ui.sel.delete(c.uid);
                    else ui.sel.add(c.uid);
                    sfx('select');
                    renderGameAgain();
                  }
                : null,
            }),
          )
        : [el('div', { className: 'muted' }, 'None left: all traded away')]),
    ),
  );

  // ----- offers
  const offerRow = (o) => {
    const from = player(o.from);
    const toP = o.to ? player(o.to) : null;
    const mineO = o.from === meId;
    const canTake = playing && !mineO && (active || (o.from === t.pid && (!o.to || o.to === meId)));
    const need = {};
    for (const w of o.want) need[w.t] = (need[w.t] || 0) + w.n;
    const short = Object.entries(need).filter(([k, n]) => pool.filter((c) => c.t === k).length < n);
    const addressee = o.from === t.pid ? (toP ? `for ${toP.name}` : 'for anyone') : `for ${activeP?.name || ''}`;
    return el(
      'div',
      { className: `offer ${mineO ? 'mine' : ''} ${canTake && !short.length ? 'can' : ''}` },
      el('div', { className: 'of-head' }, el('span', { className: 'of-av' }, from?.avatar || '?'), el('b', {}, mineO ? 'You' : from?.name || 'Someone'), el('small', { className: 'muted' }, addressee)),
      el('div', { className: 'of-body' }, el('div', { className: 'of-give' }, el('small', {}, o.give.length ? 'gives' : 'gives nothing'), el('div', { className: 'of-cards' }, ...o.give.map((c) => starCard(c, { small: true })))), el('span', { className: 'of-arrow' }, o.want.length ? '⇄' : '🎁'), el('div', { className: 'of-want' }, el('small', {}, o.want.length ? 'wants' : 'a gift'), el('div', { className: 'of-chips' }, ...o.want.map(wantChip)))),
      mineO
        ? btn('Take back', () => doAct({ type: 'cancelOffer', id: o.id }), 'small ghost', { dataset: { sfx: 'back' } })
        : canTake
          ? btn(short.length ? `You need ${short.map(([k, n]) => `${n} ${star(k).name}`).join(' + ')}` : o.want.length ? 'Accept' : 'Take the gift', () => accept(o, state), `small ${short.length ? '' : 'gold'}`, { disabled: short.length > 0, dataset: { sfx: 'none' } })
          : null,
    );
  };
  const offers = el('div', { className: 'tr-sec' }, el('div', { className: 'tr-title' }, el('b', {}, 'Offers'), el('small', { className: 'muted' }, t.offers.length ? `${t.offers.length} open` : '')), el('div', { className: 'offers' }, ...(t.offers.length ? t.offers.map(offerRow) : [el('div', { className: 'muted empty-note' }, 'No offers yet. Make one, or wait for the robots.')])));

  // ----- my own offer
  let builder = null;
  if (playing) {
    const mineCount = t.offers.filter((o) => o.from === meId).length;
    const maxed = mineCount >= 3;
    const kinds = state.setIds.map((id) => star(id));
    const give = pool.filter((c) => ui.sel.has(c.uid));
    const wantList = [...ui.want].map(([k, n]) => ({ t: k, n }));
    const others = state.players.filter((p) => p.id !== meId);
    const gift = give.length && !wantList.length;
    builder = el(
      'div',
      { className: 'tr-sec builder' },
      el('div', { className: 'tr-title' }, el('b', {}, 'Make an offer'), el('small', { className: 'muted' }, maxed ? 'three offers open: take one back' : active ? 'to one player, or to anyone' : `to ${activeP?.name || 'them'}`)),
      el('div', { className: 'bd-row' }, el('small', {}, 'You give'), el('div', { className: 'bd-chips' }, ...(give.length ? give.map((c) => starCard(c, { small: true, cls: 'sel', onClick: () => (ui.sel.delete(c.uid), renderGameAgain()) })) : [el('span', { className: 'muted' }, active ? 'tap stars in your hand or turned over' : 'tap stars in your hand')]))),
      el('div', { className: 'bd-row' }, el('small', {}, 'You want'), el('div', { className: 'kinds' }, ...kinds.map((d) => el('button', { type: 'button', className: `kind ${ui.want.has(d.id) ? 'on' : ''}`, style: { '--c': d.color }, title: d.name, onclick: () => ((ui.want.set(d.id, Math.min(4, (ui.want.get(d.id) || 0) + 1))), sfx('select'), renderGameAgain()), dataset: { sfx: 'none' } }, el('img', { src: starArt(d.id, 64), alt: d.name }), ui.want.has(d.id) ? el('span', { className: 'k-n' }, `${ui.want.get(d.id)}`) : null))), wantList.length ? el('div', { className: 'bd-chips wants' }, ...wantList.map((w) => el('button', { type: 'button', className: 'wchip removable', style: { '--c': star(w.t).color }, title: 'Remove', onclick: () => (ui.want.delete(w.t), sfx('back'), renderGameAgain()), dataset: { sfx: 'none' } }, el('img', { src: starArt(w.t, 64), alt: '' }), el('b', {}, `${w.n}×`), el('small', {}, star(w.t).name), el('span', { className: 'x' }, '✕')))) : null),
      active && others.length > 1
        ? el('div', { className: 'bd-row to' }, el('small', {}, 'Offer to'), el('select', { 'aria-label': 'Offer to', onchange: (e) => ((ui.to = e.target.value), renderGameAgain()) }, el('option', { value: '' }, 'Anyone'), ...others.map((p) => el('option', { value: p.id, selected: ui.to === p.id }, `${p.avatar} ${p.name}`))))
        : null,
      btn(gift ? 'Give it away' : 'Offer', postOffer, `gold big post`, { disabled: maxed || (!give.length && !wantList.length), dataset: { sfx: 'none' } }),
    );
  }

  built.trade.replaceChildren(
    el('div', { className: 'tr-head' }, el('div', {}, el('div', { className: 'eyebrow' }, 'Trading'), el('h2', {}, active ? 'Your trading round' : `${activeP?.name || ''} is trading`)), el('div', { className: 'tr-clock' }, el('span', { className: 'tt-n' }))),
    el('div', { className: 'trade-body' }, faceUp, offers, builder),
  );
  built.trade.querySelector('.trade-body').scrollTop = scroll;
  // (the clock in this panel follows the one in the dock)
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
    renderGameAgain();
  }
}

// taking an offer: give what they asked for (you choose when you have spares)
async function accept(o, state) {
  const t = state.turn;
  const active = t.pid === state.you.id;
  const pool = [...state.you.hand, ...(active ? t.faceUp : [])];
  const need = {};
  for (const w of o.want) need[w.t] = (need[w.t] || 0) + w.n;
  // the turned-over stars go first (they are the same as any other of their kind), then the back of the hand; only when
  // there is a real choice between cards in the hand (their places matter) are you asked
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

// you have more than they asked for: choose which ones go
function pickGive(need, pool, state) {
  return new Promise((resolve) => {
    const chosen = new Set();
    // start with the turned-over stars, then the ones at the back of the hand
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
            el('div', { className: 'pg-title' }, `Choose ${n} × ${star(k).name}`),
            el('div', { className: 'pg-cards' }, ...pool.filter((c) => c.t === k).map((c) => starCard(c, { small: true, cls: chosen.has(c.uid) ? 'sel' : '', badge: handIndex.has(c.uid) ? `#${handIndex.get(c.uid)}` : 'up', onClick: () => ((chosen.has(c.uid) ? chosen.delete(c.uid) : chosen.add(c.uid)), draw()) }))),
          ),
        ),
      );
    };
    draw();
    d = dialog({ title: 'Which stars do you give?', body: el('div', {}, el('p', { className: 'muted' }, 'You have more than they asked for. The number is the place in your hand.'), list), actions: [btn('Cancel', () => finish(null), 'ghost', { dataset: { sfx: 'back' } }), ok], onClose: () => resolve(null) });
  });
}

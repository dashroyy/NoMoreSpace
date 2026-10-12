// Phase to Space: the table. Everything you see while a game is on: rivals, Void Beasts, piles, your party and hand.
import { el, problem } from '../util.js';
import { iconEl } from '../icons.js';
import { store, def, send } from './net.js';
import { cardEl, rich, reqText } from './cards.js';
import { glyphRow } from './glyphs.js';
import { classPips, energyOrbs, syncList, btn } from './bits.js';
import { sfx, soundEnabled, musicEnabled, setSound, setMusic, unlock } from './sound.js';
import { RollStage } from './dice.js';
import { mountChat, renderChat } from './chat.js';
import { applyPrompt } from './prompts.js';
import { openRules, openCodex } from './codex.js';
import { processLog } from './fx.js';
import { ui, respond } from './answer.js';
import { tipsOn, setTips } from './tips.js';

let built = null;
let rollStage = null;

const actionPrompt = (state) => state.you.prompts.find((p) => p.type === 'action') || null;

export function buildGame(root, { onLeave }) {
  rollStage = new RollStage(document.getElementById('layer-roll'));
  const sound = btn('', { className: 'ghost icon', icon: soundEnabled() ? 'speaker' : 'speakerOff', title: 'Sound on/off', onClick: () => {
    unlock();
    setSound(!soundEnabled());
    sound.replaceChildren(iconEl(soundEnabled() ? 'speaker' : 'speakerOff'));
  } });
  const music = btn('', { className: 'ghost icon', icon: 'note', title: 'Music on/off', onClick: () => {
    unlock();
    setMusic(!musicEnabled());
    music.classList.toggle('off', !musicEnabled());
  } });
  music.classList.toggle('off', !musicEnabled());
  const sideToggle = btn('', { className: 'ghost icon side-toggle', icon: 'speech', title: 'Log and chat', onClick: () => document.body.classList.toggle('side-open') });
  // tips: odds on the table, and a glow on the move a robot would make
  const tips = btn('', { className: `ghost icon tips-toggle ${tipsOn() ? '' : 'off'}`, icon: 'bulb', title: 'Tips on/off: odds and a suggested move', onClick: () => {
    setTips(!tipsOn());
    tips.classList.toggle('off', !tipsOn());
    if (store.state) renderGame(store.state, store.prev);
  } });

  const refs = {
    code: el('span', { className: 'code' }),
    turn: el('div', { className: 'turn-pill' }),
    rivals: el('div', { className: 'rivals' }),
    beasts: el('div', { className: 'beast-row' }),
    deck: el('div', { className: 'pile deck' }),
    discard: el('div', { className: 'pile discard' }),
    stage: el('div', { className: 'stage' }),
    meBar: el('div', { className: 'me-bar' }),
    party: el('div', { className: 'party' }),
    hand: el('div', { className: 'hand' }),
    actions: el('div', { className: 'actions' }),
    banner: el('div', { className: 'prompt-bar', hidden: true }),
    info: el('div', { className: 'card-info', hidden: true }),
    log: el('div', { className: 'log' }),
    chat: el('div', { className: 'game-chat' }),
  };
  mountChat(refs.chat);

  root.replaceChildren(
    el(
      'div',
      { className: 'game-wrap' },
      el(
        'header',
        { className: 'pt-top' },
        el('div', { className: 'pt-left' }, el('span', { className: 'pt-logo' }, 'PHASE TO SPACE'), refs.code),
        refs.turn,
        el('div', { className: 'pt-right' }, btn('', { className: 'ghost icon', icon: 'book', title: 'How to play', onClick: () => openRules() }), btn('', { className: 'ghost icon', icon: 'joker', title: 'Card codex', onClick: () => openCodex() }), tips, sound, music, sideToggle, btn('', { className: 'ghost icon', icon: 'back', title: 'Leave the table', onClick: () => {
      ui.selected = null;
      built.info.hidden = true;
      onLeave();
    } })),
      ),
      el(
        'div',
        { className: 'pt-main' },
        el(
          'div',
          { className: 'pt-table' },
          refs.rivals,
          el(
            'div',
            { className: 'pt-middle' },
            refs.banner,
            el('div', { className: 'beast-zone' }, el('div', { className: 'zone-title' }, iconEl('sword'), 'Void Beasts'), refs.beasts),
            el('div', { className: 'piles' }, refs.deck, refs.discard),
            refs.stage,
          ),
          el('div', { className: 'mine' }, refs.meBar, refs.party, refs.hand, refs.actions),
        ),
        el('aside', { className: 'side panel' }, el('div', { className: 'zone-title' }, iconEl('book'), 'Ship log'), refs.log, refs.chat),
      ),
    ),
  );
  built = refs;
  document.body.append(refs.info);
  addEventListener('resize', () => {
    fitHand();
    placeInfo();
  });

  // clicking things on the table
  // (a card that is a target of a question is handled by prompts.js, which sees the click first)
  root.addEventListener('click', (e) => {
    const card = e.target.closest('.card[data-uid]');
    if (!card || !store.state) return;
    if (card.closest('.hand')) select({ kind: 'hand', uid: card.dataset.uid });
    else if (card.closest('.party') && card.closest('.mine')) select({ kind: 'crew', uid: card.dataset.uid });
    else if (card.closest('.beast-row')) select({ kind: 'beast', uid: card.dataset.uid });
  });
  document.addEventListener('keydown', (e) => {
    if (document.getElementById('screen-game').hidden || e.target.matches('input, textarea, select') || !store.state) return;
    const ap = actionPrompt(store.state);
    if (!ap) return;
    if (e.key === 'd') respond(ap.rid, { action: 'draw' });
    if (e.key === 'e') respond(ap.rid, { action: 'end' });
    if (e.key === 'Escape') select(null);
  });
}

function select(sel) {
  ui.selected = ui.selected && sel && ui.selected.uid === sel.uid ? null : sel;
  if (ui.selected) sfx('click');
  if (store.state) renderGame(store.state, store.prev);
}

// ---------------------------------------------------------------------------

export function renderGame(state, prev) {
  if (!built) return;
  const you = state.you;
  document.body.classList.toggle('my-turn', state.turn?.pid === you.id);
  built.code.textContent = state.code;
  document.body.classList.toggle('tips', tipsOn());
  processLog(state, prev);
  renderTurn(state, prev);
  renderRivals(state, prev);
  renderCenter(state);
  renderMine(state, prev);
  renderSide(state);
  rollStage.update(state.roll);
  applyPrompt(state);
}

// how much Energy the player had a moment ago (so the orbs they just spent can pop)
function apBefore(state, prev) {
  const t = state.turn;
  const pt = prev?.turn;
  return t && pt && pt.pid === t.pid ? pt.ap : t?.ap;
}

// disciplines a player did not have a moment ago (their badges light up with a flash)
function freshClasses(p, prev) {
  const before = prev?.players.find((x) => x.id === p.id);
  if (!before) return [];
  return p.classes.filter((c) => !before.classes.includes(c));
}

function renderTurn(state, prev) {
  const t = state.turn;
  const who = t && state.players.find((p) => p.id === t.pid);
  const me = state.you.id;
  let content;
  if (state.phase === 'captains') content = [iconEl('crown'), el('span', {}, 'Pick your Captain')];
  else if (state.phase === 'ended') content = [iconEl('trophy'), el('span', {}, 'Game over')];
  else if (who) {
    content = [el('span', { className: 'av' }, who.avatar), el('span', {}, who.id === me ? 'Your turn' : `${who.name}'s turn`), energyOrbs(t.ap, t.maxAp, apBefore(state, prev))];
    const others = state.waitingOn.filter((id) => id !== t.pid && id !== me);
    if (others.length && state.stack) content.push(el('em', { className: 'waiting' }, 'Signal Jam window'));
  } else content = [el('span', {}, 'Phase to Space')];
  built.turn.className = `turn-pill ${who?.id === me ? 'mine' : ''}`;
  built.turn.replaceChildren(...content);
}

// ---------------------------------------------------------------------------
// Rivals
// ---------------------------------------------------------------------------
function rivalsOf(state) {
  const list = state.players;
  const mi = list.findIndex((p) => p.id === state.you.id);
  if (mi < 0) return list; // watching: show everyone
  return [...list.slice(mi + 1), ...list.slice(0, mi)];
}

function partyItems(p) {
  const items = [];
  if (p.captain) items.push({ key: 'cap', kind: 'captain', id: p.captain.id });
  for (const c of p.crew) items.push({ key: c.uid, kind: 'crew', c });
  for (const b of p.beasts) items.push({ key: b.uid, kind: 'beast', b });
  return items;
}

function partyCard(item, size) {
  if (item.kind === 'captain') return cardEl(item.id, { size, extra: 'captain' });
  if (item.kind === 'crew') return cardEl(item.c.id, { size, uid: item.c.uid, gear: item.c.gear, shield: item.c.shield, used: item.c.used });
  return cardEl(item.b.id, { size, uid: item.b.uid, extra: 'won' });
}
const partySig = (item) => (item.kind === 'crew' ? `${item.c.id}|${item.c.gear?.id || ''}|${item.c.shield ? 1 : 0}|${item.c.used ? 1 : 0}` : item.kind === 'captain' ? item.id : item.b.id);

function makeRival(p) {
  const refs = {
    head: el('div', { className: 'rival-head' }),
    pips: el('div', { className: 'rival-pips' }),
    party: el('div', { className: 'party' }),
  };
  const root = el('div', { className: 'rival', dataset: { pid: p.id, target: p.id } }, refs.head, refs.pips, refs.party);
  root._refs = refs;
  return root;
}

function renderRivals(state, prev) {
  const others = rivalsOf(state);
  syncList(built.rivals, others, (p) => p.id, makeRival);
  for (const p of others) {
    const node = [...built.rivals.children].find((n) => n.dataset.pid === p.id && !n.classList.contains('leave'));
    if (!node) continue;
    const r = node._refs;
    const turn = state.turn?.pid === p.id;
    node.classList.toggle('turn', turn);
    node.classList.toggle('away', !p.connected);
    node.classList.toggle('winner', state.winner === p.id);
    node.classList.toggle('waiting', state.waitingOn.includes(p.id) && !turn);
    r.head.replaceChildren(
      el('span', { className: 'av' }, p.avatar),
      el('span', { className: 'nm' }, p.name),
      p.isBot ? el('span', { className: 'badge' }, 'robot') : null,
      !p.connected && !p.isBot ? el('span', { className: 'badge off' }, 'away') : null,
      p.afk ? el('span', { className: 'badge off', title: 'A robot is steering for them' }, iconEl('zzz')) : null,
      el('span', { className: 'hc', title: `${p.handCount} cards in hand` }, iconEl('joker'), el('b', {}, p.handCount)),
    );
    const need = p.classes.length;
    r.pips.replaceChildren(classPips(p.classes, { fresh: freshClasses(p, prev) }), el('span', { className: `beasts-won ${p.beasts.length ? 'on' : ''}`, title: `${p.beasts.length} of 3 Void Beasts slain` }, iconEl('sword'), el('b', {}, `${p.beasts.length}/3`)), need >= 5 ? el('span', { className: 'danger' }, 'one away!') : null);
    syncList(r.party, partyItems(p), (i) => i.key, (i) => partyCard(i, 'xs'), partySig);
  }
}

// ---------------------------------------------------------------------------
// The middle of the table
// ---------------------------------------------------------------------------
function renderCenter(state) {
  const hints = state.you.hints;
  syncList(
    built.beasts,
    state.beastRow,
    (b) => b.uid,
    (b) => cardEl(b.id, { size: 'md', uid: b.uid }),
  );
  const odds = state.you.odds?.beasts || {};
  for (const node of built.beasts.children) {
    const uid = node.dataset.uid;
    node.classList.toggle('can', !!hints && hints.attack[uid] === null);
    node.classList.toggle('selected', ui.selected?.uid === uid);
    beastOdds(node, odds[uid]);
  }
  built.deck.replaceChildren(cardEl(null, { size: 'sm', back: true }), el('span', { className: 'pile-count', title: 'Cards left in the deck' }, state.deckCount), el('span', { className: 'pile-label' }, 'Deck'));
  built.discard.replaceChildren(
    state.discardTop ? cardEl(state.discardTop.id, { size: 'sm' }) : el('div', { className: 'card sz-sm empty' }),
    el('span', { className: 'pile-count', title: 'Cards in the discard pile' }, state.discardCount),
    el('span', { className: 'pile-label' }, 'Discard'),
  );
  // a card being played, waiting to see if it gets Signal Jammed
  const s = state.stack;
  const sig = s ? `${s.card.uid}|${s.challenger || ''}|${s.window ? 1 : 0}` : '';
  if (built.stage.dataset.sig !== sig) {
    built.stage.dataset.sig = sig;
    if (!s) built.stage.replaceChildren();
    else {
      const by = state.players.find((p) => p.id === s.by);
      const target = s.target ? findCrew(state, s.target) : null;
      const chall = s.challenger && state.players.find((p) => p.id === s.challenger);
      built.stage.replaceChildren(
        el(
          'div',
          { className: `stack ${chall ? 'jammed' : ''}` },
          el('div', { className: 'stack-who' }, el('span', { className: 'av' }, by?.avatar), `${by?.name || '?'} plays`),
          cardEl(s.card.id, { size: 'lg' }),
          target ? el('div', { className: 'stack-target' }, iconEl('arrowRight'), `on ${target.name}`) : null,
          s.window ? el('div', { className: 'jam-wait' }, iconEl('radio'), 'Signal Jam window…') : null,
          chall ? el('div', { className: 'jam-hit' }, iconEl('radio'), `${chall.name} JAMS it!`) : null,
        ),
      );
    }
  }
}

function findCrew(state, uid) {
  for (const p of state.players) {
    const c = p.crew.find((x) => x.uid === uid);
    if (c) return { name: def(c.id).name, owner: p };
  }
  return null;
}

// ---------------------------------------------------------------------------
// You
// ---------------------------------------------------------------------------
function renderMine(state, prev) {
  const me = state.players.find((p) => p.id === state.you.id);
  const root = built.meBar.parentElement;
  root.hidden = !me;
  if (!me) return;
  const hints = state.you.hints;
  const ap = actionPrompt(state);
  const turn = state.turn?.pid === me.id;
  built.meBar.replaceChildren(
    el('span', { className: 'av' }, me.avatar),
    el('span', { className: 'nm' }, me.name),
    classPips(me.classes, { fresh: freshClasses(me, prev) }),
    el('span', { className: `beasts-won ${me.beasts.length ? 'on' : ''}`, title: 'Void Beasts slain' }, iconEl('sword'), el('b', {}, `${me.beasts.length}/3`)),
    turn ? el('span', { className: 'energy' }, iconEl('bolt'), energyOrbs(state.turn.ap, state.turn.maxAp, apBefore(state, prev))) : null,
  );
  const odds = state.you.odds;
  syncList(built.party, partyItems(me), (i) => i.key, (i) => partyCard(i, 'sm'), partySig);
  for (const node of built.party.children) {
    const uid = node.dataset.uid;
    if (!uid) continue;
    const can = hints && node.classList.contains('k-crew') && hints.activate[uid] === null;
    node.classList.toggle('can', !!can);
    node.classList.toggle('selected', ui.selected?.uid === uid);
    chanceRing(node, odds?.crew[uid]);
  }
  syncList(built.hand, state.you.hand, (c) => c.uid, (c) => handSlot(c));
  fitHand();
  for (const slot of built.hand.children) {
    const uid = slot.dataset.k;
    const card = slot.firstChild;
    const d = def(card.dataset.id);
    const playable = hints ? hints.playable[uid] === null : false;
    card.classList.toggle('selected', ui.selected?.uid === uid);
    card.classList.toggle('dim', !!hints && !playable && ['crew', 'gear', 'protocol'].includes(d.kind));
    card.classList.toggle('reactive', ['boost', 'challenge'].includes(d.kind));
    chanceRing(card, odds?.hand[uid]);
    lockReason(card, hints && !playable && ['crew', 'gear', 'protocol'].includes(d.kind) ? hints.playable[uid] : null);
  }
  markSuggestion(state, hints);
  if (ui.selected && !selectionStillValid(state)) ui.selected = null;
  renderActions(state, me, ap, hints);
  renderInfo(state, me);
}

// The card you tapped, described in big letters just above it (below it if it is near the top of the screen).
function selectedNode() {
  const uid = ui.selected?.uid;
  return uid ? document.querySelector(`.hand .card[data-uid="${uid}"], .mine .party .card[data-uid="${uid}"], .beast-row .card[data-uid="${uid}"]`) : null;
}

function renderInfo(state, me) {
  const box = built.info;
  const sel = ui.selected;
  const detail = sel && document.getElementById('screen-game') && !document.getElementById('screen-game').hidden ? cardDetail(state, me, sel) : null;
  if (!detail || !selectedNode()) {
    box.hidden = true;
    box.dataset.sig = '';
    return;
  }
  const sig = `${sel.uid}|${detail.textContent}`;
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    box.replaceChildren(detail);
  }
  box.hidden = false;
  placeInfo();
  // the selected card lifts up as it is picked: measure again once it has
  setTimeout(placeInfo, 220);
}

function placeInfo() {
  const box = built?.info;
  const node = selectedNode();
  if (!box || box.hidden || !node) return;
  const r = node.getBoundingClientRect();
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  let y = r.top - h - 12;
  const below = y < 52;
  if (below) y = Math.min(innerHeight - h - 8, r.bottom + 12);
  box.classList.toggle('below', below);
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
  box.style.setProperty('--arrow', `${Math.max(16, Math.min(w - 16, r.left + r.width / 2 - x))}px`);
}

// Many cards: they overlap more, so the whole hand fits without scrolling sideways (hover or tap one to lift it).
function fitHand() {
  const hand = built?.hand;
  if (!hand) return;
  const slots = [...hand.children].filter((n) => !n.classList.contains('leave'));
  const w = hand.querySelector('.card')?.offsetWidth || 0;
  if (slots.length < 2 || !w) {
    hand.style.removeProperty('--hand-gap');
    return;
  }
  const room = hand.clientWidth - 20;
  const gap = Math.min(-w * 0.1, (room - w) / (slots.length - 1) - w);
  hand.style.setProperty('--hand-gap', `${Math.round(Math.max(gap, -w * 0.62))}px`);
}

// The card you tapped, in words big enough to read: name, what it does in pictures and in words, and your odds.
function cardDetail(state, me, sel) {
  let id = null;
  if (sel.kind === 'hand') id = state.you.hand.find((c) => c.uid === sel.uid)?.id;
  else if (sel.kind === 'crew') id = me.crew.find((c) => c.uid === sel.uid)?.id;
  else if (sel.kind === 'beast') id = state.beastRow.find((b) => b.uid === sel.uid)?.id;
  const d = id && def(id);
  if (!d) return null;
  const odds = state.you.odds;
  const facts = [];
  if (d.kind === 'crew') {
    const o = sel.kind === 'hand' ? odds?.hand[sel.uid] : odds?.crew[sel.uid];
    facts.push(el('span', { className: 'fact' }, iconEl('die'), `Roll ${d.req}+ to use it`, o ? el('b', { className: 'pct' }, `${o.pct}%`) : null));
  }
  if (d.kind === 'beast') {
    const o = odds?.beasts[sel.uid];
    facts.push(el('span', { className: `fact ${o && !o.ready ? 'no' : ''}` }, iconEl(o && !o.ready ? 'lock' : 'check'), `Needs ${reqText(d)}`));
    facts.push(el('span', { className: 'fact' }, iconEl('sword'), `${d.slay}+ slays it`, o ? el('b', { className: 'pct' }, `${o.slay}%`) : null));
    facts.push(el('span', { className: 'fact bad' }, iconEl('burst'), `${d.fail} or less: ${d.penalty === 'discard2' ? 'you discard 2 cards' : 'you sacrifice a Crew card'}`, o ? el('b', { className: 'pct bad' }, `${o.bite}%`) : null));
  }
  if (d.kind === 'protocol') facts.push(el('span', { className: 'fact' }, iconEl('bolt'), 'One use, then it is discarded'));
  if (d.kind === 'gear') facts.push(el('span', { className: 'fact' }, iconEl('gear'), d.cursed ? 'Put it on a rival\'s Crew card' : 'Put it on one of your Crew cards'));
  if (d.kind === 'boost') facts.push(el('span', { className: 'fact' }, iconEl('bolt'), 'Played the moment anyone rolls'));
  if (d.kind === 'challenge') facts.push(el('span', { className: 'fact' }, iconEl('radio'), 'Played when someone else plays a card'));
  return el(
    'div',
    { className: `card-detail k-${d.kind} ${d.cls ? `cls-${d.cls}` : ''}` },
    el('div', { className: 'cd-head' }, el('b', { className: 'cd-name' }, d.name), glyphRow(d, 'cd-glyphs')),
    el('p', { className: 'cd-text' }, d.kind === 'beast' ? `Slay it and: ${d.text}` : rich(d.text)),
    facts.length ? el('div', { className: 'cd-facts' }, facts) : null,
  );
}

function handSlot(c) {
  const slot = el('div', { className: 'hand-slot' }, cardEl(c.id, { size: 'md', uid: c.uid }));
  slot.dataset.k = c.uid;
  return slot;
}

function selectionStillValid(state) {
  const sel = ui.selected;
  if (sel.kind === 'hand') return state.you.hand.some((c) => c.uid === sel.uid);
  if (sel.kind === 'crew') return state.players.find((p) => p.id === state.you.id)?.crew.some((c) => c.uid === sel.uid);
  return state.beastRow.some((b) => b.uid === sel.uid);
}

function renderActions(state, me, ap, hints) {
  const box = built.actions;
  const parts = [];
  const sel = ui.selected;
  const turn = state.turn?.pid === me.id;
  if (state.phase !== 'playing') {
    box.replaceChildren();
    return;
  }
  if (me.afk) {
    box.replaceChildren(el('span', { className: 'status' }, 'A robot is steering for you while you were away.'), btn('Take control', { className: 'primary', icon: 'play', onClick: () => send('wake').catch((e) => problem(e.message)) }));
    return;
  }
  if (!turn) {
    // someone else's turn: who is playing, and what you hold to answer them with
    const who = state.players.find((p) => p.id === state.turn?.pid);
    const jams = state.you.hand.filter((c) => def(c.id).kind === 'challenge').length;
    const boosts = state.you.hand.filter((c) => def(c.id).kind === 'boost').length;
    parts.push(
      el(
        'span',
        { className: 'status watch' },
        who ? el('span', { className: 'who-plays' }, el('span', { className: 'av' }, who.avatar), el('b', {}, who.name), iconEl('hourglass')) : null,
        jams ? el('span', { className: 'ready-chip jam', title: 'Signal Jams in your hand: you are asked when someone plays a card' }, iconEl('radio'), el('b', {}, `×${jams}`)) : null,
        boosts ? el('span', { className: 'ready-chip boost', title: 'Boosts in your hand: you are asked when someone rolls' }, iconEl('bolt'), el('b', {}, `×${boosts}`)) : null,
      ),
    );
    box.replaceChildren(...parts);
    return;
  }
  const canAct = !!ap && !!hints;
  if (sel && canAct) {
    let label = null;
    let err = null;
    let answer = null;
    let cost = 0;
    if (sel.kind === 'hand') {
      const c = state.you.hand.find((x) => x.uid === sel.uid);
      const d = c && def(c.id);
      if (d && ['crew', 'gear', 'protocol'].includes(d.kind)) {
        label = `Play ${d.name}`;
        err = hints.playable[sel.uid];
        answer = { action: 'play', uid: sel.uid };
        cost = 1;
      } else if (d) parts.push(el('span', { className: 'status' }, d.kind === 'boost' ? 'Boosts are played the moment someone rolls.' : 'A Signal Jam answers a card another player plays.'));
    } else if (sel.kind === 'crew') {
      const c = me.crew.find((x) => x.uid === sel.uid);
      if (c) {
        label = `Use ${def(c.id).name}`;
        err = hints.activate[sel.uid];
        answer = { action: 'activate', uid: sel.uid };
        cost = hints.costs[sel.uid];
      }
    } else if (sel.kind === 'beast') {
      const b = state.beastRow.find((x) => x.uid === sel.uid);
      if (b) {
        label = `Attack ${def(b.id).name}`;
        err = hints.attack[sel.uid];
        answer = { action: 'attack', uid: sel.uid };
        cost = 2;
      }
    }
    if (label) {
      parts.push(
        el(
          'button',
          { className: 'primary act main', disabled: !!err, title: err || '', onclick: () => {
            ui.selected = null;
            respond(ap.rid, answer);
          } },
          iconEl(sel.kind === 'beast' ? 'sword' : sel.kind === 'crew' ? 'bolt' : 'bolt'),
          el('span', {}, label),
          el('span', { className: 'cost' }, cost ? `${cost} Energy` : 'free'),
        ),
        err ? el('span', { className: 'why' }, err) : null,
        btn('Cancel', { className: 'small ghost', onClick: () => select(null) }),
      );
    }
  }
  if (!sel && canAct) parts.push(tipLine(state, me, hints));
  const free = hints?.drawCost === 0;
  parts.push(
    el('button', { className: 'act', dataset: { act: 'draw' }, disabled: !canAct || !!hints?.draw, title: hints?.draw || 'Draw a card (D)', onclick: () => respond(ap.rid, { action: 'draw' }) }, iconEl('package'), el('span', {}, 'Draw'), el('span', { className: 'cost' }, free ? 'free' : '1')),
    el('button', { className: 'act', dataset: { act: 'flush' }, disabled: !canAct || !!hints?.flush, title: hints?.flush || 'Discard your whole hand and draw five new cards', onclick: () => respond(ap.rid, { action: 'flush' }) }, iconEl('refresh'), el('span', {}, 'Flush hand'), el('span', { className: 'cost' }, '3')),
  );
  for (const ab of hints?.abilities || []) {
    parts.push(el('button', { className: 'act power', dataset: { act: `ability:${ab.key}` }, disabled: !canAct, title: 'Free, once per turn', onclick: () => respond(ap.rid, { action: 'ability', key: ab.key }) }, iconEl('sparkles'), el('span', {}, ab.label), el('span', { className: 'cost' }, 'free')));
  }
  const last = state.turn.ap === 0;
  parts.push(el('button', { className: `act end ${last ? 'primary pulse' : ''}`, dataset: { act: 'end' }, disabled: !canAct, title: 'End your turn (E)', onclick: () => respond(ap.rid, { action: 'end' }) }, iconEl('flag'), el('span', {}, 'End turn')));
  box.replaceChildren(...parts);
  markSuggestedButton(hints);
}

// ---------------------------------------------------------------------------
// Help on the table: odds, chances, why a card is greyed out, and the suggested move
// ---------------------------------------------------------------------------

// a Void Beast's odds for you: which of its needs your crew meets, and a bar of how an attack roll could go
function beastOdds(node, o) {
  node.classList.toggle('ready', !!o?.ready);
  node.classList.toggle('locked', !!o && !o.ready);
  node.querySelectorAll('.reqs .chip').forEach((chip, i) => {
    const r = o?.reqs[i];
    chip.classList.toggle('ok', !!r?.ok);
    chip.classList.toggle('miss', !!r && !r.ok);
    const b = r && !r.cls ? chip.querySelector('b') : null;
    if (b) b.textContent = r.ok ? `×${r.need}` : `${r.have}/${r.need}`;
  });
  let bar = node.querySelector('.odds-bar');
  if (!o || !tipsOn()) {
    bar?.remove();
    return;
  }
  if (!bar) {
    // under the "9+ / ≤6" line: a padlock if your crew is not ready, the bar, and your chance to slay it
    bar = el('div', { className: 'odds-bar' }, el('span', { className: 'lock-tag' }, iconEl('lock')), el('div', { className: 'track' }, el('i', { className: 'bite' }), el('i', { className: 'meh' }), el('i', { className: 'win' })), el('span', { className: 'pct' }));
    const after = node.querySelector('.face .odds');
    if (after) after.after(bar);
    else node.querySelector('.face')?.append(bar);
  }
  const [bite, meh, win] = bar.querySelector('.track').children;
  const pct = bar.querySelector('.pct');
  bite.style.width = `${o.bite}%`;
  win.style.width = `${o.slay}%`;
  meh.style.width = `${Math.max(0, 100 - o.bite - o.slay)}%`;
  pct.textContent = `${o.slay}%`;
  bar.title = `${o.ready ? '' : 'Your crew does not meet its needs yet. '}If you attack: ${o.slay}% you slay it, ${o.bite}% it fights back${o.bonus ? ` (your bonus: +${o.bonus})` : ''}.`;
}

// a ring round a Crew card's number: how likely its effect roll is to work for you
function chanceRing(node, o) {
  if (!o || !tipsOn()) {
    node.classList.remove('has-odds');
    return;
  }
  node.classList.add('has-odds');
  node.style.setProperty('--pct', String(o.pct));
  node.style.setProperty('--ring', o.pct >= 60 ? '#7dffa8' : o.pct >= 35 ? '#ffd24d' : '#ff6e82');
  const req = node.querySelector('.face .req');
  if (req) req.title = `${o.pct}% chance the effect works${o.bonus ? ` (your bonus: +${o.bonus})` : ''}`;
}

// a greyed-out card says why, with a picture
function lockReason(card, why) {
  let tag = card.querySelector(':scope > .why-tag');
  if (!why) {
    tag?.remove();
    return;
  }
  const icon = /Energy/.test(why) ? 'bolt' : /Gear/.test(why) ? 'gear' : 'lock';
  if (!tag || tag.dataset.icon !== icon) {
    tag?.remove();
    tag = el('div', { className: 'why-tag', dataset: { icon } }, iconEl(icon));
    card.append(tag);
  }
  tag.title = why;
}

// what the suggested move is called, and which thing on the table it is about
function describe(state, me, hints) {
  const s = hints?.suggest;
  if (!s) return null;
  const name = (list, uid) => def(list.find((c) => c.uid === uid)?.id)?.name || '';
  switch (s.action) {
    case 'play':
      return { label: `Play ${name(state.you.hand, s.uid)}`, uid: s.uid, kind: 'hand' };
    case 'activate':
      return { label: `Use ${name(me.crew, s.uid)}`, uid: s.uid, kind: 'crew' };
    case 'attack': {
      const o = state.you.odds?.beasts[s.uid];
      return { label: `Attack ${name(state.beastRow, s.uid)}${o ? ` (${o.slay}%)` : ''}`, uid: s.uid, kind: 'beast' };
    }
    case 'draw':
      return { label: 'Draw a card', act: 'draw' };
    case 'flush':
      return { label: 'Flush your hand', act: 'flush' };
    case 'ability':
      return { label: hints.abilities.find((a) => a.key === s.key)?.label || 'Use your power', act: `ability:${s.key}` };
    case 'end':
      return { label: 'End your turn', act: 'end' };
    default:
      return null;
  }
}

function markSuggestion(state, hints) {
  for (const n of document.querySelectorAll('.card.suggest')) n.classList.remove('suggest');
  if (!tipsOn() || ui.selected) return;
  const me = state.players.find((p) => p.id === state.you.id);
  const d = me && describe(state, me, hints);
  if (!d?.uid) return;
  document.querySelector(`.hand .card[data-uid="${d.uid}"], .mine .party .card[data-uid="${d.uid}"], .beast-row .card[data-uid="${d.uid}"]`)?.classList.add('suggest');
}

function markSuggestedButton(hints) {
  if (!tipsOn() || !hints?.suggest || ui.selected) return;
  const s = hints.suggest;
  const act = s.action === 'ability' ? `ability:${s.key}` : s.action;
  if (['draw', 'flush', 'end'].includes(act) || act.startsWith('ability:')) built.actions.querySelector(`[data-act="${act}"]`)?.classList.add('suggest');
}

// the first thing in your action bar: the suggested move (tap it to pick that card)
function tipLine(state, me, hints) {
  if (!tipsOn()) return null;
  const d = describe(state, me, hints);
  if (!d) return null;
  return el(
    'button',
    { className: 'tip-line', title: 'What a robot would do now. Tap to pick it.', onclick: () => {
      if (d.uid) select({ kind: d.kind, uid: d.uid });
      else {
        const b = built.actions.querySelector(`[data-act="${d.act}"]`);
        b?.classList.remove('nudge');
        void b?.offsetWidth;
        b?.classList.add('nudge');
      }
    } },
    iconEl('bulb'),
    el('span', {}, d.label),
  );
}

// ---------------------------------------------------------------------------
// The log
// ---------------------------------------------------------------------------
function renderSide(state) {
  const lines = state.log;
  const last = lines.length ? lines[lines.length - 1].seq : 0;
  if (built.log.dataset.last !== String(last)) {
    const atBottom = built.log.scrollHeight - built.log.scrollTop - built.log.clientHeight < 60;
    built.log.dataset.last = String(last);
    built.log.replaceChildren(...lines.filter((l) => l.k !== 'emote').map((l) => el('div', { className: `log-line k-${l.k || 'x'}` }, l.text)));
    if (atBottom) built.log.scrollTop = built.log.scrollHeight;
  }
  renderChat(state);
}


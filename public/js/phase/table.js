// Phase to Space: the table. Everything you see while a game is on: rivals, Void Beasts, piles, your party and hand.
import { el, problem } from '../util.js';
import { iconEl } from '../icons.js';
import { store, def, send } from './net.js';
import { cardEl } from './cards.js';
import { classPips, energyOrbs, syncList, btn } from './bits.js';
import { sfx, soundEnabled, musicEnabled, setSound, setMusic, unlock } from './sound.js';
import { RollStage } from './dice.js';
import { mountChat, renderChat } from './chat.js';
import { applyPrompt } from './prompts.js';
import { openRules, openCodex } from './codex.js';
import { processLog } from './fx.js';
import { ui, respond } from './answer.js';

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
        el('div', { className: 'pt-right' }, btn('', { className: 'ghost icon', icon: 'book', title: 'How to play', onClick: () => openRules() }), btn('', { className: 'ghost icon', icon: 'joker', title: 'Card codex', onClick: () => openCodex() }), sound, music, sideToggle, btn('', { className: 'ghost icon', icon: 'back', title: 'Leave the table', onClick: onLeave })),
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
  processLog(state, prev);
  renderTurn(state);
  renderRivals(state);
  renderCenter(state);
  renderMine(state);
  renderSide(state);
  rollStage.update(state.roll);
  applyPrompt(state);
}

function renderTurn(state) {
  const t = state.turn;
  const who = t && state.players.find((p) => p.id === t.pid);
  const me = state.you.id;
  let content;
  if (state.phase === 'captains') content = [iconEl('crown'), el('span', {}, 'Pick your Captain')];
  else if (state.phase === 'ended') content = [iconEl('trophy'), el('span', {}, 'Game over')];
  else if (who) {
    content = [el('span', { className: 'av' }, who.avatar), el('span', {}, who.id === me ? 'Your turn' : `${who.name}'s turn`), energyOrbs(t.ap, t.maxAp)];
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

function renderRivals(state) {
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
    r.pips.replaceChildren(classPips(p.classes), el('span', { className: `beasts-won ${p.beasts.length ? 'on' : ''}`, title: `${p.beasts.length} of 3 Void Beasts slain` }, iconEl('sword'), el('b', {}, `${p.beasts.length}/3`)), need >= 5 ? el('span', { className: 'danger' }, 'one away!') : null);
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
  for (const node of built.beasts.children) {
    const uid = node.dataset.uid;
    node.classList.toggle('can', !!hints && hints.attack[uid] === null);
    node.classList.toggle('selected', ui.selected?.uid === uid);
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
function renderMine(state) {
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
    classPips(me.classes),
    el('span', { className: `beasts-won ${me.beasts.length ? 'on' : ''}`, title: 'Void Beasts slain' }, iconEl('sword'), el('b', {}, `${me.beasts.length}/3`)),
    turn ? el('span', { className: 'energy' }, iconEl('bolt'), energyOrbs(state.turn.ap, state.turn.maxAp)) : null,
  );
  syncList(built.party, partyItems(me), (i) => i.key, (i) => partyCard(i, 'sm'), partySig);
  for (const node of built.party.children) {
    const uid = node.dataset.uid;
    if (!uid) continue;
    const can = hints && node.classList.contains('k-crew') && hints.activate[uid] === null;
    node.classList.toggle('can', !!can);
    node.classList.toggle('selected', ui.selected?.uid === uid);
  }
  syncList(built.hand, state.you.hand, (c) => c.uid, (c) => handSlot(c));
  for (const slot of built.hand.children) {
    const uid = slot.dataset.k;
    const card = slot.firstChild;
    const d = def(card.dataset.id);
    const playable = hints ? hints.playable[uid] === null : false;
    card.classList.toggle('selected', ui.selected?.uid === uid);
    card.classList.toggle('dim', !!hints && !playable && ['crew', 'gear', 'protocol'].includes(d.kind));
    card.classList.toggle('reactive', ['boost', 'challenge'].includes(d.kind));
  }
  if (ui.selected && !selectionStillValid(state)) ui.selected = null;
  renderActions(state, me, ap, hints);
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
    const who = state.players.find((p) => p.id === state.turn?.pid);
    parts.push(el('span', { className: 'status' }, who ? `${who.name} is playing. Keep an eye out for chances to Boost or Signal Jam!` : ''));
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
  const free = hints?.drawCost === 0;
  parts.push(
    el('button', { className: 'act', disabled: !canAct || !!hints?.draw, title: hints?.draw || 'Draw a card (D)', onclick: () => respond(ap.rid, { action: 'draw' }) }, iconEl('package'), el('span', {}, 'Draw'), el('span', { className: 'cost' }, free ? 'free' : '1')),
    el('button', { className: 'act', disabled: !canAct || !!hints?.flush, title: hints?.flush || 'Discard your whole hand and draw five new cards', onclick: () => respond(ap.rid, { action: 'flush' }) }, iconEl('refresh'), el('span', {}, 'Flush hand'), el('span', { className: 'cost' }, '3')),
  );
  for (const ab of hints?.abilities || []) {
    parts.push(el('button', { className: 'act power', disabled: !canAct, title: 'Free, once per turn', onclick: () => respond(ap.rid, { action: 'ability', key: ab.key }) }, iconEl('sparkles'), el('span', {}, ab.label), el('span', { className: 'cost' }, 'free')));
  }
  const last = state.turn.ap === 0;
  parts.push(el('button', { className: `act end ${last ? 'primary pulse' : ''}`, disabled: !canAct, title: 'End your turn (E)', onclick: () => respond(ap.rid, { action: 'end' }) }, iconEl('flag'), el('span', {}, 'End turn')));
  box.replaceChildren(...parts);
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


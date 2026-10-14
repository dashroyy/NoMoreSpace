// Ruler of the Galaxy: the game screen, over the 3D scene. Down the left, a plate for every contender (Hull,
// Stars, Dark Matter, where they are); at the bottom, the dice console (the 3D dice, Roll and Resolve, and what
// the dice would do right now); on the right, the Xenotech Bazaar; at the top, the round and any anomaly.
import { el, problem } from '../util.js';
import { store, send, contender, card, anomaly, evolution, player, colorOf } from './net.js';
import { DiceTray } from './dice.js';
import { faceSvg, faceIcon } from './faces.js';
import { sfx, soundEnabled, musicEnabled, setSound, setMusic, unlock } from './sound.js';
import { processLog } from './fx.js';
import { applyPrompts } from './prompts.js';
import { openRules } from './codex.js';
import { mountChat, renderChat } from './chat.js';

let built = null;
let tray = null;
let world = null;
const ui = { keep: new Set(), rollKey: null, busy: false };

const myPrompt = (state, type) => state.you.prompts.find((p) => p.type === type) || null;
const iconBtn = (label, title, onClick, className = '') => el('button', { className: `icon-btn ${className}`, title, 'aria-label': title, onclick: onClick }, label);

export function buildGame(root, { onLeave, world: w }) {
  world = w;
  const refs = {
    code: el('span', { className: 'code' }),
    round: el('div', { className: 'round-pill' }),
    anomaly: el('div', { className: 'anomaly-chip', hidden: true }),
    goal: el('div', { className: 'goal-pill' }),
    plates: el('div', { className: 'plates' }),
    ticker: el('div', { className: 'ticker' }),
    turnLine: el('div', { className: 'turn-line' }),
    tray: el('div', { className: 'tray' }),
    controls: el('div', { className: 'controls' }),
    preview: el('div', { className: 'preview' }),
    bazaar: el('div', { className: 'bazaar-cards' }),
    bazaarFoot: el('div', { className: 'bazaar-foot' }),
    bazaarHead: el('div', { className: 'bazaar-head' }),
    chat: el('div', { className: 'chat' }),
  };
  const sound = iconBtn(soundEnabled() ? '🔊' : '🔇', 'Sound on/off', () => {
    unlock();
    setSound(!soundEnabled());
    sound.textContent = soundEnabled() ? '🔊' : '🔇';
  });
  const music = iconBtn('🎵', 'Music on/off', () => {
    unlock();
    setMusic(!musicEnabled());
    music.classList.toggle('off', !musicEnabled());
  });
  music.classList.toggle('off', !musicEnabled());
  const chatToggle = iconBtn('💬', 'Chat and log', () => document.body.classList.toggle('chat-open'));
  const bazaarToggle = iconBtn('🛒', 'Xenotech Bazaar', () => document.body.classList.toggle('bazaar-open'), 'bazaar-toggle');
  mountChat(refs.chat);

  root.replaceChildren(
    el(
      'header',
      { className: 'topbar' },
      el('div', { className: 'brand' }, el('span', { className: 'logo' }, 'RULER OF THE GALAXY'), refs.code),
      el('div', { className: 'top-mid' }, refs.round, refs.anomaly, refs.goal),
      el('div', { className: 'top-right' }, iconBtn('📖', 'How to play', () => openRules()), bazaarToggle, chatToggle, sound, music, iconBtn('⏏', 'Leave the galaxy', onLeave)),
    ),
    el('aside', { className: 'left-col' }, refs.plates, refs.ticker),
    el('aside', { className: 'bazaar panel' }, refs.bazaarHead, refs.bazaar, refs.bazaarFoot),
    el('section', { className: 'console panel' }, refs.turnLine, refs.tray, refs.preview, refs.controls),
    el('aside', { className: 'chat-drawer panel' }, refs.chat),
  );
  built = refs;
  tray = new DiceTray(refs.tray, {
    onToggle: (i) => {
      const st = store.state;
      if (!st || !myPrompt(st, 'dice') || !st.turn?.rolled) return;
      if (ui.keep.has(i)) ui.keep.delete(i);
      else ui.keep.add(i);
      sfx('keep');
      tray.setKept(st.turn.dice.map((_, k) => ui.keep.has(k)));
      renderControls(st);
    },
  });
  if (window.__rotg) window.__rotg.tray = tray; // (for debugging)
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea') || !store.state || document.getElementById('screen-game').hidden) return;
    const st = store.state;
    if (e.key === ' ' || e.key === 'r') {
      e.preventDefault();
      if (myPrompt(st, 'dice') && st.turn.rollsLeft > 0) roll(st);
    }
    if (e.key === 'Enter' && myPrompt(st, 'dice') && st.turn.rolled) resolve(st);
    if (/^[1-7]$/.test(e.key) && myPrompt(st, 'dice') && st.turn.rolled) tray.onToggle(Number(e.key) - 1);
  });
}

// ---------------------------------------------------------------------------

export function renderGame(state, prev) {
  if (!built) return;
  world.sync(state);
  processLog(state, prev);
  document.body.classList.toggle('my-turn', state.turn?.pid === state.you.id);
  document.body.classList.toggle('shopping', !!myPrompt(state, 'buy'));
  if (myPrompt(state, 'buy') && !prev?.you.prompts.some((p) => p.type === 'buy')) document.body.classList.add('bazaar-open');
  renderTop(state);
  renderPlates(state);
  renderTicker(state);
  renderConsole(state, prev);
  renderBazaar(state);
  renderChat(state);
  applyPrompts(state);
}

function renderTop(state) {
  built.code.textContent = state.code;
  const who = player(state.turn?.pid);
  built.round.innerHTML = '';
  built.round.append(el('span', { className: 'muted' }, `Orbit ${state.round || 1}`), who ? el('b', { style: { color: colorOf(who) } }, who.id === state.you.id ? 'Your turn' : `${who.name}'s turn`) : null);
  const a = anomaly(state.anomaly);
  built.anomaly.hidden = !a;
  if (a) {
    built.anomaly.replaceChildren(el('span', { className: 'a-art' }, a.art), el('div', {}, el('b', {}, a.name), el('small', {}, a.text)));
    built.anomaly.title = a.text;
  }
  built.goal.innerHTML = `${faceSvg('star', '1.05em')} <b>${state.target}</b> to rule`;
}

function renderPlates(state) {
  const box = built.plates;
  const list = state.players;
  const sig = JSON.stringify(list.map((p) => [p.id, p.hull, p.maxHull, p.stars, p.shards, p.where, p.alive, p.cards.length, p.evolutions.length, p.afk, p.connected])) + state.turn?.pid + state.target;
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.replaceChildren(
    ...list.map((p) => {
      const c = contender(p.contender);
      const turn = state.turn?.pid === p.id;
      const where = !p.alive ? 'GHOST' : p.where === 'core' ? 'CORE' : p.where === 'pulsar' ? 'PULSAR' : 'RIM';
      const pct = Math.min(100, (p.stars / state.target) * 100);
      return el(
        'div',
        { className: `plate ${turn ? 'turn' : ''} ${p.alive ? '' : 'dead'} where-${where.toLowerCase()} ${p.id === state.you.id ? 'me' : ''}`, style: { '--c': c?.color || '#8fb2ff' } },
        el('div', { className: 'plate-head' }, el('span', { className: 'av' }, p.avatar), el('div', { className: 'who' }, el('b', {}, p.name, p.id === state.you.id ? el('small', { className: 'you' }, ' YOU') : null), el('small', {}, c?.name || '')), el('span', { className: `where w-${where.toLowerCase()}` }, where)),
        p.alive
          ? el(
              'div',
              { className: 'plate-stats' },
              el('div', { className: `hull-bar ${p.hull <= 3 ? 'low' : ''}`, title: `${p.hull} of ${p.maxHull} Hull` }, ...Array.from({ length: p.maxHull }, (_, k) => el('i', { className: k < p.hull ? 'on' : '' })), el('span', { className: 'hull-n' }, `${p.hull}`)),
              el('div', { className: 'star-row', title: `${p.stars} of ${state.target} Stars` }, el('span', { className: 'star-n', innerHTML: `${faceSvg('star', '1.1em')} ${p.stars}` }), el('div', { className: 'star-track' }, el('i', { style: { width: `${pct}%` } })), el('span', { className: 'shard-n', innerHTML: `${faceSvg('shard', '1em')} ${p.shards}` })),
            )
          : el('div', { className: 'plate-stats ghost-line' }, '👻 Haunting the galaxy'),
        p.cards.length || p.evolutions.length
          ? el(
              'div',
              { className: 'plate-cards' },
              ...p.cards.map((x) => {
                const d = card(x.id);
                return el('span', { className: 'mini-card', title: `${d.name}: ${d.text}` }, d.art);
              }),
              ...p.evolutions.map((id) => {
                const e = evolution(id);
                return el('span', { className: 'mini-card evo', title: `🧬 ${e?.name}: ${e?.text}` }, '🧬');
              }),
            )
          : null,
        p.afk ? el('div', { className: 'afk' }, '💤 a robot is flying for them') : null,
      );
    }),
  );
}

function renderTicker(state) {
  const lines = state.log.filter((l) => !['emote', 'roll', 'resolve'].includes(l.k)).slice(-5);
  const last = lines.length ? lines[lines.length - 1].seq : 0;
  if (built.ticker.dataset.last === String(last)) return;
  built.ticker.dataset.last = String(last);
  built.ticker.replaceChildren(...lines.map((l, i) => el('div', { className: `tick k-${l.k}`, style: { opacity: String(0.35 + (i / Math.max(1, lines.length - 1)) * 0.65) } }, l.text)));
}

// ---------------------------------------------------------------------------
// The dice console
// ---------------------------------------------------------------------------
function renderConsole(state, prev) {
  const t = state.turn;
  const p = player(t?.pid);
  // the dice: a new roll is thrown, a new turn clears the tray
  if (t && !t.ghost && t.dice?.length) {
    const key = `${t.pid}|${t.rollId || 0}`;
    if (key !== ui.rollKey) {
      const isNewTurn = ui.rollKey?.split('|')[0] !== t.pid;
      ui.rollKey = key;
      if (!t.rolled) tray.clear();
      else if (isNewTurn && prev?.turn?.pid !== t.pid) tray.set(t.dice.map((d) => d.face), t.dice.map((d) => d.kept));
      else tray.roll(t.dice.map((d) => d.face), t.dice.map((d) => d.kept));
      // what you kept before rolling stays kept (unless you change your mind)
      ui.keep = new Set(t.dice.map((d, i) => (d.kept ? i : -1)).filter((i) => i >= 0));
      if (!t.rolled) ui.keep.clear();
      tray.ensure(t.dice.length);
    }
    if (t.stage !== 'roll') tray.setKept(t.dice.map(() => false));
  } else if (!t || t.ghost) {
    if (ui.rollKey) tray.clear();
    ui.rollKey = null;
  }
  const mine = !!myPrompt(state, 'dice');
  tray.enabled = mine && !!t?.rolled;
  document.body.classList.toggle('can-keep', tray.enabled);

  // the line over the dice: whose turn, and what to do
  let line;
  if (!t) line = state.phase === 'ended' ? 'The battle is over' : 'Between turns…';
  else if (t.ghost) line = `👻 ${p?.name}'s ghost ship haunts the galaxy`;
  else if (mine && !t.rolled) line = 'Your turn: roll the quantum dice!';
  else if (mine) line = t.rollsLeft ? 'Tap the dice you want to keep, then roll the rest (or resolve)' : 'Resolve your dice';
  else if (myPrompt(state, 'buy')) line = 'Spend your Dark Matter in the Bazaar, then finish your turn';
  else if (t.stage === 'buy') line = `${p?.name} is shopping in the Bazaar…`;
  else if (t.stage === 'resolve') line = `${p?.name}'s dice are counted…`;
  else line = `${p?.name} is rolling…`;
  built.turnLine.replaceChildren(el('span', { className: 'dot', style: { background: colorOf(p) } }), el('span', {}, line), t && !t.ghost && t.stage === 'roll' ? el('span', { className: 'rolls-left' }, ...Array.from({ length: t.rolls }, (_, i) => el('i', { className: i < t.rollsLeft ? 'on' : '' }))) : null);
  renderPreview(state);
  renderControls(state);
}

function renderPreview(state) {
  const pv = state.you.preview;
  const t = state.turn;
  const box = built.preview;
  if (!t || t.ghost || !t.rolled) {
    box.replaceChildren();
    return;
  }
  // somebody else's dice: just count the faces
  if (!pv) {
    const c = {};
    for (const d of t.dice) if (d.face) c[d.face] = (c[d.face] || 0) + 1;
    box.replaceChildren(...Object.entries(c).map(([f, n]) => el('span', { className: 'chip' }, faceIcon(f, '1.1em'), el('b', {}, `×${n}`))));
    return;
  }
  const chips = [];
  if (pv.stars) chips.push(el('span', { className: 'chip gold', innerHTML: `${faceSvg('star', '1.1em')} <b>+${pv.stars}</b> Stars` }));
  if (pv.heal) chips.push(el('span', { className: 'chip green', innerHTML: `${faceSvg('hull', '1.1em')} <b>+${pv.heal}</b> Hull` }));
  if (pv.healBlocked) chips.push(el('span', { className: 'chip warn' }, '☢️ No repair in the Core'));
  if (pv.evolve) chips.push(el('span', { className: 'chip green' }, '🧬 Evolution!'));
  if (pv.damage) chips.push(el('span', { className: 'chip red', innerHTML: `${faceSvg('laser', '1.1em')} <b>${pv.damage}</b> damage → ${pv.targets.map((id) => player(id)?.name).join(', ')}` }));
  if (pv.shards) chips.push(el('span', { className: 'chip violet', innerHTML: `${faceSvg('shard', '1.1em')} <b>+${pv.shards}</b>` }));
  if (pv.enter) chips.push(el('span', { className: 'chip gold' }, '👑 You will take the empty Core'));
  if (!chips.length) chips.push(el('span', { className: 'chip muted' }, 'Nothing yet: keep rolling!'));
  box.replaceChildren(...chips);
}

function roll(state) {
  const prompt = myPrompt(state, 'dice');
  if (!prompt || ui.busy) return;
  ui.busy = true;
  unlock();
  const keep = state.turn.rolled ? [...ui.keep] : [];
  send('respond', { rid: prompt.rid, answer: { action: 'roll', keep } })
    .catch((e) => problem(e.message))
    .finally(() => (ui.busy = false));
}

function resolve(state) {
  const prompt = myPrompt(state, 'dice');
  if (!prompt || ui.busy) return;
  ui.busy = true;
  send('respond', { rid: prompt.rid, answer: { action: 'resolve' } })
    .catch((e) => problem(e.message))
    .finally(() => (ui.busy = false));
}

function renderControls(state) {
  const box = built.controls;
  const t = state.turn;
  const prompt = myPrompt(state, 'dice');
  const me = player(state.you.id);
  if (!prompt) {
    box.replaceChildren();
    return;
  }
  const parts = [];
  const left = t.rollsLeft;
  const allKept = t.rolled && ui.keep.size === t.dice.length;
  parts.push(el('button', { className: 'big primary roll-btn', disabled: left <= 0 || allKept, onclick: () => roll(state) }, '🎲 ', t.rolled ? `Roll again (${left} left)` : 'Roll the dice'));
  if (t.rolled) parts.push(el('button', { className: 'big gold', onclick: () => resolve(state) }, '✓ Resolve'));
  if (t.rolled && me?.evolutions.includes('critical') && !t.criticalUsed) {
    parts.push(
      el(
        'button',
        { className: 'small', title: 'Take 1 damage to turn the first die you are not keeping into a Laser', onclick: () => {
          const die = t.dice.findIndex((d, i) => !ui.keep.has(i) && d.face !== 'laser');
          if (die < 0) return problem('Every die is already a Laser or kept.');
          send('respond', { rid: prompt.rid, answer: { action: 'critical', die, face: 'laser' } }).catch((e) => problem(e.message));
        } },
        '☀️ Critical Mass (−1 Hull)',
      ),
    );
  }
  box.replaceChildren(...parts);
}

// ---------------------------------------------------------------------------
// The Xenotech Bazaar
// ---------------------------------------------------------------------------
function renderBazaar(state) {
  const me = player(state.you.id);
  const prompt = myPrompt(state, 'buy');
  const sig = JSON.stringify([state.market, state.you.prices, me?.shards, !!prompt, state.anomaly]);
  if (built.bazaar.dataset.sig === sig) return;
  built.bazaar.dataset.sig = sig;
  built.bazaarHead.innerHTML = `<div class="eyebrow">The Xenotech Bazaar</div><div class="bank">${faceSvg('shard', '1.1em')} <b>${me?.shards ?? 0}</b> Dark Matter</div>`;
  built.bazaar.replaceChildren(
    ...state.market.map((m) => {
      const d = card(m.id);
      const price = state.you.prices[m.uid] ?? d.cost;
      const afford = me && me.shards >= price;
      return el(
        'div',
        { className: `xcard k-${d.kind} ${prompt && afford ? 'can' : ''}` },
        el('div', { className: 'xc-top' }, el('span', { className: 'xc-kind' }, d.kind === 'keep' ? 'AUGMENT · KEEP' : 'DIRECTIVE · NOW'), el('span', { className: `xc-cost ${price < d.cost ? 'cheap' : ''}`, innerHTML: `${faceSvg('shard', '0.95em')}${price}` })),
        el('div', { className: 'xc-art' }, d.art),
        el('div', { className: 'xc-name' }, d.name),
        el('div', { className: 'xc-text' }, d.text),
        prompt
          ? el('button', { className: `small ${afford ? 'primary' : ''}`, disabled: !afford, onclick: () => send('respond', { rid: prompt.rid, answer: { action: 'buy', uid: m.uid } }).catch((e) => problem(e.message)) }, afford ? 'Buy' : `Need ${price}`)
          : null,
      );
    }),
  );
  const foot = [];
  if (prompt) {
    foot.push(el('button', { className: 'small', disabled: (me?.shards ?? 0) < state.you.flushCost, onclick: () => send('respond', { rid: prompt.rid, answer: { action: 'flush' } }).catch((e) => problem(e.message)) }, `🔄 New cards (${state.you.flushCost})`));
    if (me?.cards.some((c) => card(c.id)?.hook === 'bay')) foot.push(el('button', { className: 'small', disabled: me.shards < 2 || me.hull >= me.maxHull, onclick: () => send('respond', { rid: prompt.rid, answer: { action: 'heal' } }).catch((e) => problem(e.message)) }, '🔧 Heal 1 (2)'));
    foot.push(el('button', { className: 'big gold', onclick: () => {
      document.body.classList.remove('bazaar-open');
      send('respond', { rid: prompt.rid, answer: { action: 'done' } }).catch((e) => problem(e.message));
    } }, '✓ End turn'));
  } else foot.push(el('div', { className: 'muted small-text' }, 'You can shop at the end of your turn.'));
  built.bazaarFoot.replaceChildren(...foot);
}

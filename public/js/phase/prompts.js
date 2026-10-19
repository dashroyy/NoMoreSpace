// Phase to Space: the questions the game asks you. Choose a Captain, pick a target on the board or cards from a
// list, Signal Jam a card (or not), play a Boost on a roll (or not).
import { el } from '../util.js';
import { iconEl } from '../icons.js';
import { store, def, serverNow, player } from './net.js';
import { cardEl } from './cards.js';
import { btn } from './bits.js';
import { sfx } from './sound.js';
import { respond, ui } from './answer.js';

const layer = () => document.getElementById('layer-prompt');
let current = null;

const AUTOPASS_KEY = 'pts-autopass';
export const autoPass = () => {
  try {
    return localStorage.getItem(AUTOPASS_KEY) === '1';
  } catch {
    return false;
  }
};
const setAutoPass = (on) => {
  try {
    localStorage.setItem(AUTOPASS_KEY, on ? '1' : '0');
  } catch {}
};

export function applyPrompt(state) {
  const p = state.you.prompts.find((x) => x.type !== 'action') || null;
  if (!p || ui.answered.has(p.rid)) return clear();
  if (current?.rid === p.rid) {
    current.update?.(state, p);
    return;
  }
  clear();
  current = { rid: p.rid, type: p.type, cleanup: null, update: null };
  if (p.type === 'captain') showCaptain(p, state);
  else if (p.type === 'pick') (p.style === 'board' ? showBoardPick : showCardPick)(p, state);
  else if (p.type === 'react') showReact(p, state);
  else if (p.type === 'boost') showBoost(p, state);
  sfx('tick');
}

export function clear() {
  if (!current) return;
  current.cleanup?.();
  current = null;
  layer().replaceChildren();
  for (const n of document.querySelectorAll('.targetable')) {
    n.classList.remove('targetable', 'picked');
    delete n.dataset.pick;
  }
  document.body.classList.remove('picking');
}

// a thin bar that drains while you decide (the server answers for you when it runs out)
function timerBar(p) {
  if (!p.until) return null;
  const bar = el('i', { className: 'timer-fill' });
  const total = Math.max(1, p.until - serverNow());
  bar.style.transition = 'none';
  bar.style.width = '100%';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      bar.style.transition = `width ${Math.max(0, p.until - serverNow())}ms linear`;
      bar.style.width = '0%';
    });
  });
  void total;
  return el('div', { className: 'timer-bar' }, bar);
}

// ---------------------------------------------------------------------------
// Captains
// ---------------------------------------------------------------------------
function showCaptain(p) {
  const picked = { id: null };
  const cards = p.options.map((id) =>
    el(
      'div',
      { className: 'cap-option' },
      el('button', { className: 'card-btn', onclick: () => {
        if (picked.id) return;
        picked.id = id;
        sfx('success');
        respond(p.rid, { id });
        body.replaceChildren(el('div', { className: 'wait' }, iconEl('hourglass'), 'Waiting for everyone to choose…'));
      } }, cardEl(id, { size: 'lg' })),
      el('div', { className: 'cap-name' }, def(id).title),
    ),
  );
  const body = el('div', { className: 'cap-row' }, cards);
  layer().replaceChildren(
    el('div', { className: 'overlay' }, el('div', { className: 'panel captain-pick' }, el('div', { className: 'eyebrow' }, 'Mission briefing'), el('h2', {}, 'Choose your Captain'), body, timerBar(p))),
  );
}

// ---------------------------------------------------------------------------
// Pick something on the board
// ---------------------------------------------------------------------------
function findTarget(o) {
  if (o.kind === 'crew') return document.querySelector(`.party .card[data-uid="${o.key}"]`);
  if (o.kind === 'beast') return document.querySelector(`.beast-row .card[data-uid="${o.key}"]`);
  if (o.kind === 'player') return document.querySelector(`.rival[data-pid="${o.key}"]`) || (o.key === store.me ? document.querySelector('.pt-table > .mine') : null);
  return null;
}

function showBoardPick(p, state) {
  const targets = p.options.map((o) => ({ o, node: findTarget(o) }));
  // anything we cannot point at on the table is offered in a list instead
  if (targets.some((t) => !t.node)) return showCardPick(p, state, true);
  const chosen = new Set();
  const multi = p.max > 1;
  for (const { o, node } of targets) {
    node.classList.add('targetable');
    node.dataset.pick = o.key;
  }
  document.body.classList.add('picking');
  const confirm = btn(p.min === 0 && p.max === 0 ? 'Done' : 'Confirm', { className: 'primary small', onClick: () => finish() });
  const status = el('span', { className: 'pick-count' });
  const finish = () => {
    respond(p.rid, { keys: [...chosen] });
    clear();
  };
  const sync = () => {
    status.textContent = multi ? `${chosen.size}/${p.max}` : '';
    confirm.disabled = chosen.size < p.min;
    confirm.hidden = !multi && p.min > 0;
    for (const { o, node } of targets) node.classList.toggle('picked', chosen.has(o.key));
  };
  const onClick = (e) => {
    const node = e.target.closest('[data-pick]');
    if (!node) return;
    e.stopPropagation();
    e.preventDefault();
    const key = node.dataset.pick;
    sfx('click');
    if (!multi) {
      chosen.clear();
      chosen.add(key);
      finish();
      return;
    }
    if (chosen.has(key)) chosen.delete(key);
    else if (chosen.size < p.max) chosen.add(key);
    sync();
  };
  document.addEventListener('click', onClick, true);
  current.cleanup = () => document.removeEventListener('click', onClick, true);
  layer().replaceChildren(
    el('div', { className: 'pick-banner' }, iconEl('arrowUp'), el('div', {}, el('b', {}, p.title), el('div', { className: 'hint' }, p.hint || 'Tap a glowing card or player.')), status, confirm, timerBar(p)),
  );
  sync();
}

// ---------------------------------------------------------------------------
// Pick cards from a list
// ---------------------------------------------------------------------------
function showCardPick(p, state, fromBoard = false) {
  const chosen = new Set();
  const look = p.max === 0;
  const grid = el('div', { className: 'pick-grid' });
  const status = el('span', { className: 'pick-count' });
  const confirm = btn(look ? 'Close' : p.max === 1 ? 'Choose' : 'Confirm', { className: 'primary', onClick: () => {
    respond(p.rid, { keys: [...chosen] });
    clear();
  } });
  const sync = () => {
    status.textContent = look ? '' : p.max > 1 ? `${chosen.size}/${p.min === p.max ? p.max : `${p.min}-${p.max}`}` : '';
    confirm.disabled = !look && chosen.size < p.min;
    for (const n of grid.children) n.classList.toggle('picked', chosen.has(n.dataset.key));
  };
  for (const o of p.options) {
    let face;
    if (o.kind === 'card') face = cardEl(o.id, { size: 'lg' });
    else if (o.kind === 'crew') face = cardEl(o.id, { size: 'lg' });
    else if (o.kind === 'beast') face = cardEl(o.id, { size: 'lg' });
    else if (o.kind === 'player') face = el('div', { className: 'pick-player' }, el('span', { className: 'av' }, player(o.key)?.avatar), el('b', {}, o.label), o.hint ? el('small', {}, o.hint) : null);
    else face = el('div', { className: 'pick-text' }, o.label);
    const owner = o.kind === 'crew' && o.ownerId ? player(o.ownerId) : null;
    const item = el('button', { className: 'pick-item', dataset: { key: o.key }, disabled: look, onclick: () => {
      sfx('click');
      if (p.max === 1) {
        chosen.clear();
        chosen.add(o.key);
      } else if (chosen.has(o.key)) chosen.delete(o.key);
      else if (chosen.size < p.max) chosen.add(o.key);
      sync();
    } }, face, owner ? el('div', { className: 'pick-owner' }, owner.name) : null);
    grid.append(item);
  }
  layer().replaceChildren(
    el('div', { className: 'overlay' }, el('div', { className: 'panel pick-modal' }, el('h2', {}, p.title), p.hint ? el('p', { className: 'hint' }, p.hint) : null, grid, el('div', { className: 'pick-foot' }, status, confirm), timerBar(p))),
  );
  sync();
  void state;
  void fromBoard;
}

// ---------------------------------------------------------------------------
// Signal Jam?
// ---------------------------------------------------------------------------
function showReact(p) {
  const by = player(p.by);
  layer().replaceChildren(
    el(
      'div',
      { className: 'react-panel panel' },
      el('div', { className: 'react-card' }, cardEl(p.card, { size: 'md' })),
      el(
        'div',
        { className: 'react-body' },
        el('h3', {}, iconEl('radio'), 'Signal Jam?'),
        el('p', {}, `${by?.name || 'Someone'} is playing `, el('b', {}, def(p.card).name), '. Jam it and you both roll: if you roll the same or higher, it is wasted.'),
        el(
          'div',
          { className: 'react-btns' },
          el('button', { className: 'primary big jam', onclick: () => { sfx('jam'); respond(p.rid, { uid: p.cards[0].uid }); clear(); } }, iconEl('radio'), 'JAM IT!', p.cards.length > 1 ? el('small', {}, ` (${p.cards.length} cards)`) : null),
          el('button', { className: 'big', onclick: () => { respond(p.rid, { pass: true }); clear(); } }, 'Let it through'),
        ),
        timerBar(p),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Boosts
// ---------------------------------------------------------------------------

// Which (side, plus or minus) choices make sense? If you are rolling, add to yourself and take from the others; if you
// are only watching, you can do either to anyone.
function boostChoices(roll, meId) {
  const mine = roll.sides.find((x) => x.pid === meId);
  if (!mine) return roll.sides.flatMap((x) => [[x, 'up'], [x, 'down']]);
  return [[mine, 'up'], ...roll.sides.filter((x) => x !== mine).map((x) => [x, 'down'])];
}
function showBoost(p, state) {
  if (autoPass()) {
    respond(p.rid, { pass: true });
    current.rid = p.rid;
    return;
  }
  const box = el('div', { className: 'boost-panel panel' });
  const render = (st, req) => {
    const roll = st.roll;
    if (!roll) return;
    const cards = req.cards;
    const sideBtn = (card, d, side, sign) => {
      const pl = player(side.pid);
      const amp = def(st.players.find((x) => x.id === st.you.id)?.captain?.id)?.passive === 'amplify' ? 1 : 0;
      const v = sign === 'up' ? d.up + amp : d.down;
      const mine = side.pid === st.you.id;
      return el(
        'button',
        { className: `bst ${sign} ${mine ? 'mine' : ''}`, title: `${sign === 'up' ? 'Add to' : 'Take from'} ${pl?.name}'s roll`, onclick: () => {
          sfx(sign === 'up' ? 'boostUp' : 'boostDown');
          respond(req.rid, { uid: card.uid, side: side.pid, sign });
          // more Boosts may be played in this round: the server asks again
          clear();
        } },
        el('b', {}, `${v > 0 ? '+' : ''}${String(v).replace('-', '−')}`),
        el('span', {}, mine ? 'me' : pl?.name),
      );
    };
    box.replaceChildren(
      el('h3', {}, iconEl('bolt'), 'Play a Boost?'),
      el('div', { className: 'boost-sides' }, roll.sides.map((s) => el('span', { className: 'bs' }, el('b', {}, player(s.pid)?.name), ` ${s.total}`))),
      el('div', { className: 'boost-list' }, cards.map((card) => {
        const d = def(card.id);
        return el('div', { className: 'boost-item' }, cardEl(card.id, { size: 'sm' }), el('div', { className: 'bst-row' }, boostChoices(roll, st.you.id).map(([s, sign]) => sideBtn(card, d, s, sign))));
      })),
      el('div', { className: 'boost-foot' },
        el('label', { className: 'check' }, el('input', { type: 'checkbox', checked: false, onchange: (e) => setAutoPass(e.target.checked) }), 'Always pass on Boosts'),
        btn('No thanks', { className: 'primary', onClick: () => { respond(req.rid, { pass: true }); clear(); } }),
      ),
      timerBar(req),
    );
  };
  render(state, p);
  layer().replaceChildren(box);
  current.update = (st, req) => {
    // the totals move as others play Boosts: refresh the little scoreboard only
    const roll = st.roll;
    if (!roll) return;
    const sides = box.querySelector('.boost-sides');
    if (sides) sides.replaceChildren(...roll.sides.map((s) => el('span', { className: 'bs' }, el('b', {}, player(s.pid)?.name), ` ${s.total}`)));
    void req;
  };
}

// Ruler of the Galaxy: the big decisions, as full-screen alerts. Hold the Core or yield it, choose an evolution,
// and (for the Void Kraken) whether to keep a yielding rival trapped.
import { el, problem } from '../util.js';
import { send, serverNow, player, contender, colorOf } from './net.js';
import { faceSvg } from './faces.js';
import { sfx } from './sound.js';

const layer = () => document.getElementById('layer-prompt');
let current = null;
const answered = new Set();

function answer(p, a) {
  answered.add(p.rid);
  clear();
  send('respond', { rid: p.rid, answer: a }).catch((e) => problem(e.message));
}

export function clear() {
  current = null;
  layer().replaceChildren();
}

function timerBar(p) {
  if (!p.until) return null;
  const fill = el('i', { className: 'timer-fill' });
  const ms = Math.max(0, p.until - serverNow());
  fill.style.transition = 'none';
  fill.style.width = '100%';
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      fill.style.transition = `width ${ms}ms linear`;
      fill.style.width = '0%';
    }),
  );
  return el('div', { className: 'timer' }, fill);
}

export function applyPrompts(state) {
  const p = state.you.prompts.find((x) => ['yield', 'evolve', 'grapple'].includes(x.type) && !answered.has(x.rid)) || null;
  if (!p) {
    if (current) clear();
    return;
  }
  if (current === p.rid) return;
  current = p.rid;
  if (p.type === 'yield') showYield(p, state);
  if (p.type === 'evolve') showEvolve(p, state);
  if (p.type === 'grapple') showGrapple(p, state);
}

function showYield(p, state) {
  sfx('alarm');
  const attacker = player(p.attacker);
  const me = player(state.you.id);
  const slot = p.slot === 'core' ? 'Core' : 'Pulsar';
  const canYield = !(me?.evolutions.includes('siege') && p.slot === 'core' && me.hull > 3);
  layer().replaceChildren(
    el(
      'div',
      { className: 'alert-wrap' },
      el(
        'div',
        { className: 'alert red' },
        el('div', { className: 'eyebrow' }, `Under fire in the ${slot}`),
        el('h2', {}, 'Hold or yield?'),
        el('p', { className: 'lead', innerHTML: `<b style="color:${colorOf(attacker)}">${attacker?.name}</b> hit you for <b>${p.damage}</b>. You have <b>${faceSvg('hull', '1em')} ${me?.hull}</b> Hull left.` }),
        el(
          'div',
          { className: 'choice-row' },
          el(
            'button',
            { className: 'choice hold', onclick: () => answer(p, { yield: false }) },
            el('span', { className: 'c-ico' }, '💪'),
            el('b', {}, `Hold the ${slot}`),
            el('small', { innerHTML: `Stay. If you survive to your turn: ${faceSvg('star', '1em')} +2 Stars, and your lasers hit everyone outside.` }),
          ),
          el(
            'button',
            { className: 'choice yield', disabled: !canYield, onclick: () => answer(p, { yield: true }) },
            el('span', { className: 'c-ico' }, '🏳️'),
            el('b', {}, 'Yield and warp out'),
            el('small', {}, canYield ? `Back to the Rim, where you can repair. ${attacker?.name} takes your seat.` : 'Siege Mode: only at 3 Hull or less.'),
          ),
        ),
        timerBar(p),
      ),
    ),
  );
}

function showEvolve(p, state) {
  sfx('evolve');
  const me = player(state.you.id);
  const c = contender(me?.contender);
  layer().replaceChildren(
    el(
      'div',
      { className: 'alert-wrap' },
      el(
        'div',
        { className: 'alert green' },
        el('div', { className: 'eyebrow' }, 'Triple Nanite Repair'),
        el('h2', {}, `🧬 ${c?.name || 'You'} evolves`),
        el('p', { className: 'lead' }, 'Choose one mutation. "Keep" ones stay with you all game; "Now" ones happen at once.'),
        el(
          'div',
          { className: 'evo-row' },
          ...p.options.map((o) =>
            el(
              'button',
              { className: 'evo-card', style: { '--c': c?.color || '#00ff87' }, onclick: () => answer(p, { id: o.id }) },
              el('span', { className: 'evo-kind' }, o.kind === 'keep' ? 'KEEP' : 'NOW'),
              el('b', {}, o.name),
              el('span', {}, o.text),
            ),
          ),
        ),
        timerBar(p),
      ),
    ),
  );
}

function showGrapple(p) {
  const victim = player(p.victim);
  layer().replaceChildren(
    el(
      'div',
      { className: 'alert-wrap' },
      el(
        'div',
        { className: 'alert violet' },
        el('div', { className: 'eyebrow' }, 'Hyperspace Grapple'),
        el('h2', {}, `Trap ${victim?.name}?`),
        el('p', { className: 'lead', innerHTML: `They want to yield the Core to you. Pay ${faceSvg('shard', '1em')} 2 to keep them stuck inside, where everyone can shoot them.` }),
        el('div', { className: 'choice-row' }, el('button', { className: 'choice hold', onclick: () => answer(p, { grapple: true }) }, el('span', { className: 'c-ico' }, '🦑'), el('b', {}, 'Trap them (2)')), el('button', { className: 'choice yield', onclick: () => answer(p, { grapple: false }) }, el('span', { className: 'c-ico' }, '👑'), el('b', {}, 'Let them go'), el('small', {}, 'and take the Core yourself'))),
        timerBar(p),
      ),
    ),
  );
}

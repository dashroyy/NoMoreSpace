// Phase to Space: what a card does, in pictures. Every effect is a short row of icons ("🃏+2 › 💥👤" is "draw 2,
// then destroy a Crew card"), worked out from the same step list the server runs (see fx in server/phase/cards.js),
// so the pictures can never disagree with the rules. The words are still on the big preview.
import { el } from '../util.js';
import { iconEl } from '../icons.js';

// one picture: an icon, maybe a number, maybe a small second icon (what it acts on), and a tone for its colour
const G = (icon, n = null, tone = 'plain', tip = '', sub = null) => ({ icon, n, tone, tip, sub });
const THEN = '›'; // "and then"
const WHEN = '⇒'; // "whenever this happens, that happens"

const KIND = { crew: { icon: 'person', name: 'Crew card' }, gear: { icon: 'gear', name: 'Gear card' }, protocol: { icon: 'scroll', name: 'Protocol card' }, boost: { icon: 'bolt', name: 'Boost card' }, any: { icon: 'joker', name: 'card' } };
const kindOf = (k) => KIND[k] || KIND.any;

// the steps a Crew or Protocol card runs
const STEP = {
  draw: (n = 1) => [G('joker', `+${n}`, 'good', `Draw ${n === 1 ? 'a card' : `${n} cards`}`)],
  discard: (n = 1) => [G('joker', `−${n}`, 'bad', `Discard ${n === 1 ? 'a card' : `${n} cards`}`)],
  othersDiscard: (n = 1) => [G('joker', `−${n}`, 'bad', 'Every other player discards', 'masks')],
  destroy: () => [G('burst', null, 'bad', 'Destroy a Crew card', 'person')],
  steal: () => [G('hand', null, 'good', 'Steal a Crew card', 'person')],
  stealUse: () => [G('hand', null, 'good', 'Steal a Crew card', 'person'), G('die', null, 'good', '…and roll to use it at once')],
  pull: () => [G('hand', null, 'good', "Pull a random card from a player's hand", 'joker')],
  pullFromLast: () => [G('hand', null, 'good', "Pull a random card from that player's hand", 'joker')],
  peekHand: (then) => [
    G('eyes', null, 'plain', "Look at a player's hand", 'joker'),
    ...(then === 'discard' ? [THEN, G('joker', '−1', 'bad', '…and discard a card from it')] : []),
    ...(then === 'take' ? [THEN, G('hand', null, 'good', '…and take any card from it', 'joker')] : []),
    ...(then === 'jam' ? [THEN, G('radio', '✕', 'bad', '…and discard every Signal Jam in it')] : []),
  ],
  peekDeck: (n = 3) => [G('telescope', n, 'good', `Look at the top ${n} cards of the deck and keep one`)],
  search: (k = 'any') => [G('recycle', null, 'good', `Take a ${kindOf(k).name} from the discard pile`, kindOf(k).icon)],
  energy: (n = 1) => [G('bolt', `+${n}`, 'good', `Gain ${n} Energy`)],
  attackFree: () => [G('sword', '0', 'good', 'Attack a Void Beast for no Energy')],
  shield: (which) => [G('shield', which === 'all' ? 'ALL' : null, 'good', which === 'all' ? 'Shield all your Crew until your next turn' : 'Shield one of your Crew until your next turn')],
  returnOwn: () => [G('back', null, 'plain', 'Take one of your Crew back into your hand', 'person')],
  bounce: () => [G('back', null, 'bad', "Send any Crew card back to its owner's hand", 'person')],
  playFree: (k, orElse) => [G('play', '0', 'good', `Play a ${kindOf(k).name} for free`, kindOf(k).icon), ...(orElse === 'draw' ? [G('joker', '+1', 'good', '(none? draw a card)')] : [])],
  noChallenge: () => [G('speakerOff', null, 'good', 'Your cards cannot be Signal Jammed this turn')],
  drawPlay: () => [G('joker', '+1', 'good', 'Draw a card'), THEN, G('play', '0', 'good', 'If it is a Crew card, play it for free', 'person')],
  swapHands: () => [G('repeat', null, 'plain', 'Swap hands with another player', 'joker')],
  passHands: () => [G('arrowLeft', null, 'plain', 'Everyone passes their hand to the left', 'joker')],
  hardReset: (n = 4) => [G('refresh', null, 'plain', 'Everyone discards their whole hand…'), THEN, G('joker', `+${n}`, 'good', `…and draws ${n}`)],
  everyoneDraw: (n = 1) => [G('joker', `+${n}`, 'good', 'Every player draws (you too)', 'masks')],
  forceSacrifice: () => [G('candle', null, 'bad', 'A player of your choice must sacrifice a Crew card', 'person')],
  gearMove: () => [G('wrench', null, 'good', 'Move a Gear card onto one of your Crew', 'gear')],
  gearDestroy: () => [G('burst', null, 'bad', 'Destroy a Gear card', 'gear')],
  gearsHome: () => [G('cyclone', null, 'plain', 'Every Gear card goes back to its owner', 'gear')],
  swapCrew: () => [G('shuffle', null, 'plain', 'Swap one of your Crew for a rival\'s', 'person')],
  luckDuel: () => [G('die', 'VS', 'plain', 'You and another player both roll'), THEN, G('hand', null, 'good', 'Winner takes a random card', 'joker')],
  rollBuff: (n = 1) => [G('die', `+${n}`, 'good', `+${n} to all your rolls this turn`)],
  topBoosts: (n = 4) => [G('telescope', n, 'good', `Reveal the top ${n} cards and keep every Boost`, 'bolt')],
};

// Captain and Void Beast powers ("ability": a free button once per turn)
const ONCE = G('repeat', '1', 'plain', 'Once per turn, free');
const PASSIVE = {
  hunter: [G('sword', '+1', 'good', '+1 when you attack a Void Beast')],
  bounty: [G('burst', null, 'plain', 'When you destroy a Crew card', 'person'), WHEN, G('joker', '+1', 'good', 'draw a card')],
  grit: [G('burst', null, 'bad', 'When one of your Crew is destroyed', 'person'), WHEN, G('joker', '+1', 'good', 'draw a card')],
  rigger: [G('gear', null, 'plain', 'When you play a Gear card'), WHEN, G('joker', '+1', 'good', 'draw a card')],
  quickdraw: [G('joker', '0', 'good', 'Your first Draw each turn is free')],
  lucky: [G('die', '+1', 'good', '+1 to all your Crew effect rolls', 'person')],
  pickpocket: [ONCE, G('hand', null, 'good', "Pull a random card from a player's hand", 'joker')],
  fence: [G('hand', null, 'plain', 'When you steal a Crew card', 'person'), WHEN, G('joker', '+1', 'good', 'draw a card')],
  echo: [G('scroll', null, 'plain', 'When you play a Protocol'), WHEN, G('joker', '+1', 'good', 'draw a card')],
  mindread: [ONCE, G('eyes', null, 'plain', "Look at a player's hand", 'joker')],
  amplify: [G('bolt', '+1', 'good', 'Your Boosts give +1 more on their plus side')],
  loot: [ONCE, G('joker', '−1', 'plain', 'Discard a card…'), THEN, G('joker', '+1', 'good', '…then draw a card')],
  playdraw: [G('person', null, 'plain', 'When you play a Crew card from your hand'), WHEN, G('joker', '+1', 'good', 'draw a card')],
  effect: [G('die', '+1', 'good', '+1 to all your Crew effect rolls', 'person')],
  ward: [G('hand', '✕', 'good', 'Your Crew cards cannot be stolen', 'person')],
  attack: [G('sword', '+2', 'good', '+2 when you attack a Void Beast')],
  rebound: [G('burst', null, 'bad', 'When one of your Crew would be destroyed', 'person'), WHEN, G('back', null, 'good', 'it goes back to your hand instead')],
  challenger: [G('radio', '+2', 'good', '+2 to your rolls in a Signal Jam')],
  startdraw: [G('flag', null, 'plain', 'At the start of your turn'), WHEN, G('joker', '+1', 'good', 'draw a card')],
  boostbonus: [G('bolt', '+1', 'good', 'Boosts that rivals play on your roll give you +1 more')],
  jamdraw: [G('radio', null, 'plain', 'When you win a Signal Jam roll'), WHEN, G('joker', '+1', 'good', 'draw a card')],
  energy: [G('bolt', '+1', 'good', '1 more Energy every turn')],
  rolls: [G('die', '+1', 'good', '+1 to ALL your rolls')],
};

// what a Void Beast does to you if it fights back
export const PENALTY = {
  sacrifice: G('candle', null, 'bad', 'You sacrifice a Crew card', 'person'),
  discard2: G('joker', '−2', 'bad', 'You discard 2 cards'),
};

function gearGlyphs(d) {
  const out = [];
  if (d.roll) out.push(G('die', d.roll > 0 ? `+${d.roll}` : `−${-d.roll}`, d.roll > 0 ? 'good' : 'bad', `${d.roll > 0 ? '+' : ''}${d.roll} to this Crew card's effect rolls`));
  if (d.free) out.push(G('bolt', '0', 'good', "Using this Crew card's effect costs no Energy"));
  if (d.cost) out.push(G('bolt', `+${d.cost}`, 'bad', "Using this Crew card's effect costs 1 more Energy"));
  if (d.ward) out.push(G('shield', null, 'good', 'This Crew card cannot be destroyed or stolen', 'person'));
  if (d.rebound) out.push(G('burst', null, 'plain', 'If this Crew card is destroyed…', 'person'), WHEN, G('back', null, 'good', '…it goes back to your hand'));
  if (d.loot) out.push(G('check', null, 'plain', "When this Crew card's effect works…"), WHEN, G('joker', '+1', 'good', '…draw a card'));
  if (d.silence) out.push(G('speakerOff', null, 'bad', 'This Crew card cannot use its effect'));
  if (d.bomb) out.push(G('cross', null, 'plain', "When this Crew card's effect roll fails…"), WHEN, G('bomb', null, 'bad', '…it is destroyed'));
  return out;
}

// the pictures for any card definition
export function glyphsFor(d) {
  if (!d) return [];
  switch (d.kind) {
    case 'crew':
    case 'protocol': {
      const out = [];
      for (const [name, ...args] of d.fx || []) {
        const make = STEP[name];
        if (!make) continue;
        if (out.length) out.push(THEN);
        out.push(...make(...args));
      }
      return out;
    }
    case 'captain':
      return PASSIVE[d.passive || d.ability] || [];
    case 'beast':
      return PASSIVE[d.passive] || [];
    case 'gear':
      return gearGlyphs(d);
    case 'challenge':
      return [G('radio', null, 'plain', 'When someone plays a card'), WHEN, G('die', 'VS', 'plain', 'you both roll: tie or better and…'), THEN, G('cross', null, 'bad', '…their card is wasted')];
    default:
      return [];
  }
}

function glyphNode(g) {
  if (g === THEN) return el('i', { className: 'gl-then' }, '›');
  if (g === WHEN) return el('i', { className: 'gl-then when' }, '⇒');
  return el(
    'span',
    { className: `gl tone-${g.tone}`, title: g.tip },
    iconEl(g.icon),
    g.sub ? el('i', { className: 'gl-sub' }, iconEl(g.sub)) : null,
    g.n != null ? el('b', {}, String(g.n)) : null,
  );
}

// a row of pictures for a card (or [] when it has none)
export function glyphRow(d, className = '') {
  const list = glyphsFor(d);
  if (!list.length) return null;
  return el('div', { className: `glyphs ${className}`.trim() }, list.map(glyphNode));
}

export function glyphChip(g) {
  return glyphNode(g);
}

// what the pictures mean (shown in How to play)
export const LEGEND = [
  [G('joker', '+2', 'good'), 'Draw cards'],
  [G('joker', '−1', 'bad'), 'Discard cards'],
  [G('burst', null, 'bad', '', 'person'), 'Destroy a Crew card'],
  [G('hand', null, 'good', '', 'person'), 'Steal a Crew card'],
  [G('hand', null, 'good', '', 'joker'), "Take a card from someone's hand"],
  [G('eyes', null, 'plain', '', 'joker'), "Look at someone's hand"],
  [G('recycle', null, 'good', '', 'joker'), 'Take a card from the discard pile'],
  [G('bolt', '+2', 'good'), 'Gain Energy'],
  [G('shield', null, 'good'), 'Shield: safe from destroy and steal'],
  [G('back', null, 'plain', '', 'person'), "Back to its owner's hand"],
  [G('play', '0', 'good'), 'Play a card for free'],
  [G('die', '+1', 'good'), 'A bonus on your rolls'],
  [G('candle', null, 'bad', '', 'person'), 'Sacrifice a Crew card'],
  [G('repeat', '1'), 'Once per turn, free'],
  [THEN, 'then'],
  [WHEN, 'whenever this happens'],
];

// Phase to Space: the robots.
//
// A robot answers the very same questions a person does (see ask() in engine.js), so it can never do
// anything a person could not. It is not a genius, but it plays sensibly: it builds towards six
// disciplines, hunts Void Beasts it has a decent chance against, spends Boosts when they turn a roll,
// jams the cards that matter and picks on whoever is winning.

const { def, CLASS_IDS } = require('./cards');

// the chance that two dice (+bonus) reach `need`
const CHANCE = { 2: 36, 3: 35, 4: 33, 5: 30, 6: 26, 7: 21, 8: 15, 9: 10, 10: 6, 11: 3, 12: 1 };
function odds(need, bonus = 0) {
  const n = need - bonus;
  if (n <= 2) return 1;
  if (n > 12) return 0;
  return CHANCE[n] / 36;
}

// how dangerous a player looks: close to six disciplines, or close to three Beasts
function threat(g, o) {
  return g.classes(o).size * 2 + o.beasts.length * 3.5 + o.crew.length * 0.4;
}

function crewValue(g, owner, entry) {
  const d = def(entry.id);
  let v = 3 + (10 - d.req) * 0.35 + fxValue(d.fx);
  // a Crew card of a discipline nobody else at their party has is the one that wins them the game
  const sameClass = owner.crew.filter((c) => def(c.id).cls === d.cls).length + (def(owner.captain.id).cls === d.cls ? 1 : 0);
  if (sameClass <= 1) v += 3 + g.classes(owner).size * 0.6;
  if (entry.gear) v += def(entry.gear.id).cursed ? -1 : 1.5;
  return v;
}

function fxValue(fx) {
  let v = 0;
  for (const [name, a] of fx) {
    v += { destroy: 5, steal: 6, stealUse: 7, pull: 3, peekHand: 2.5, search: 2, draw: 1.3 * (a || 1), energy: 2, attackFree: 4, shield: 1.5, returnOwn: 0.5, bounce: 2, noChallenge: 1.5, peekDeck: 2.5, drawPlay: 2.5, playFree: 3, swapHands: 2, passHands: 1, hardReset: 0, forceSacrifice: 4, gearMove: 2, gearDestroy: 2, gearsHome: 1.5, swapCrew: 2, luckDuel: 2, rollBuff: 1.5, othersDiscard: 3, everyoneDraw: 1, topBoosts: 2, discard: -1.2 * (a || 1), pullFromLast: 1.5 }[name] ?? 1;
  }
  return v;
}

// does this card's effect have anything to do right now?
function usable(g, p, fx) {
  const rivals = g.others(p);
  for (const [name] of fx) {
    switch (name) {
      case 'destroy':
        if (!rivals.some((o) => o.crew.some((c) => !g.protectedFrom(o, c, 'destroy')))) return false;
        break;
      case 'steal':
      case 'stealUse':
        if (!rivals.some((o) => o.crew.some((c) => !g.protectedFrom(o, c, 'steal')))) return false;
        break;
      case 'pull':
      case 'peekHand':
      case 'swapHands':
        if (!rivals.some((o) => o.hand.length)) return false;
        break;
      case 'forceSacrifice':
        if (!rivals.some((o) => o.crew.length)) return false;
        break;
      case 'attackFree':
        if (!g.beastRow.some((b) => g.meetsReqs(p, def(b.id)))) return false;
        break;
      case 'gearsHome':
      case 'gearDestroy':
        if (!g.allCrew().some((x) => x.crew.gear)) return false;
        break;
      case 'gearMove':
        if (!g.allCrew().some((x) => x.crew.gear) || !p.crew.some((c) => !c.gear)) return false;
        break;
      case 'swapCrew':
        if (!p.crew.length || !rivals.some((o) => o.crew.some((c) => !g.protectedFrom(o, c, 'steal')))) return false;
        break;
      case 'bounce':
        if (!g.allCrew().length) return false;
        break;
      case 'returnOwn':
        if (!p.crew.length) return false;
        break;
      case 'shield':
        if (!p.crew.length) return false;
        break;
      case 'search':
        break;
      default:
        break;
    }
  }
  return true;
}

function cardValue(g, p, card) {
  const d = def(card.id);
  switch (d.kind) {
    case 'crew': {
      const missing = !g.classes(p).has(d.cls);
      return 7 + (missing ? 5 : 0) + fxValue(d.fx) * 0.3;
    }
    case 'protocol':
      return 5 + fxValue(d.fx) * 0.2;
    case 'gear':
      return d.cursed ? 4.5 : 4;
    case 'challenge':
      return p.hand.filter((c) => c.id === 'jam').length > 2 ? 3 : 5;
    case 'boost':
      return 3 + d.up * 0.4;
    default:
      return 1;
  }
}

const rnd = (g, n = 1) => (g.r() - 0.5) * n;

// ---------------------------------------------------------------------------

function decide(g, p, req) {
  switch (req.type) {
    case 'captain':
      return { id: req.options[Math.floor(g.r() * req.options.length)] };
    case 'react':
      return react(g, p, req);
    case 'boost':
      return boost(g, p, req);
    case 'pick':
      return pickAnswer(g, p, req);
    case 'action':
      return action(g, p);
    default:
      return g.safeAnswer(req);
  }
}

// ---------------------------------------------------------------------------
// Signal Jam
// ---------------------------------------------------------------------------
function react(g, p, req) {
  const stack = g.stack;
  if (!stack) return { pass: true };
  const d = def(stack.card.id);
  const by = g.get(stack.by);
  let want = 0.3;
  if (d.kind === 'crew') {
    want = 0.35 + (usable(g, by, d.fx) ? 0.2 : 0) + (fxValue(d.fx) > 5 ? 0.15 : 0);
    if (!g.classes(by).has(d.cls) && g.classes(by).size >= 4) want += 0.4; // their sixth discipline is on the way
  } else if (d.kind === 'protocol') want = 0.45 + (fxValue(d.fx) > 5 ? 0.2 : 0);
  else if (d.kind === 'gear') want = d.cursed && stack.target && g.findCrew(stack.target)?.owner.id === p.id ? 0.9 : 0.15;
  if (threat(g, by) >= threat(g, p) + 3) want += 0.2;
  if (g.classes(by).size >= 5) want += 0.5;
  const jams = req.cards.length;
  if (jams > 1) want += 0.15;
  if (g.r() < want) return { uid: req.cards[0].uid };
  return { pass: true };
}

// ---------------------------------------------------------------------------
// Boosts
// ---------------------------------------------------------------------------
function boost(g, p, req) {
  const roll = g.roll;
  if (!roll || !roll.open) return { pass: true };
  const mySide = roll.sides.find((s) => s.pid === p.id);
  const amp = g.has(p, 'amplify') ? 1 : 0;
  const cards = req.cards.map((c) => ({ c, d: def(c.id) }));
  const ups = cards.map((x) => ({ ...x, v: x.d.up + amp })).sort((a, b) => a.v - b.v);
  const downs = cards.map((x) => ({ ...x, v: x.d.down })).sort((a, b) => b.v - a.v); // gentlest first
  const total = (s) => s.total;

  if (roll.kind === 'check') {
    const side = roll.sides[0];
    const roller = g.get(side.pid);
    if (roller.id === p.id) {
      // my own roll: save it if one Boost does it
      if (total(side) >= roll.need) return { pass: true };
      const fix = ups.find((x) => total(side) + x.v >= roll.need);
      if (fix) return { uid: fix.c.uid, side: p.id, sign: 'up' };
      return { pass: true };
    }
    // a rival's roll: spoil it if it would work, and it would hurt
    if (total(side) < roll.need) return { pass: true };
    const hurts = threat(g, roller) >= threat(g, p) - 2 || g.r() < 0.5;
    if (!hurts) return { pass: true };
    const spoil = downs.find((x) => total(side) + x.v < roll.need);
    if (spoil && g.r() < 0.8) return { uid: spoil.c.uid, side: roller.id, sign: 'down' };
    return { pass: true };
  }

  // a duel (Signal Jam and the like): the Jam side wins on a tie
  if (!mySide) return { pass: true };
  const other = roll.sides.find((s) => s.pid !== p.id);
  const defenderIsMe = roll.sides[0].pid === p.id;
  const wins = (mine, theirs) => (defenderIsMe ? mine > theirs : mine >= theirs);
  const mineNow = total(mySide);
  const theirsNow = total(other);
  if (wins(mineNow, theirsNow)) return { pass: true };
  const lift = ups.find((x) => wins(mineNow + x.v, theirsNow));
  const cut = downs.find((x) => wins(mineNow, theirsNow + x.v));
  const pickIt = lift && cut ? (lift.v < -cut.v ? lift : cut) : lift || cut;
  if (!pickIt) return { pass: true };
  if (pickIt === lift) return { uid: lift.c.uid, side: p.id, sign: 'up' };
  return { uid: cut.c.uid, side: other.pid, sign: 'down' };
}

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------
function pickAnswer(g, p, req) {
  const { options, min, max } = req;
  const keys = (list) => ({ keys: list.slice(0, max).map((o) => o.key) });
  if (max === 0) return { keys: [] };
  const crewOf = (o) => g.findCrew(o.key);
  const score = (fn) => options.map((o) => ({ o, v: fn(o) + rnd(g, 0.6) })).sort((a, b) => b.v - a.v).map((x) => x.o);

  switch (req.purpose) {
    case 'destroy':
    case 'steal': {
      return keys(score((o) => {
        const t = crewOf(o);
        if (!t) return 0;
        return crewValue(g, t.owner, t.crew) + threat(g, t.owner) * 0.5 + (req.purpose === 'steal' && !g.classes(p).has(def(t.crew.id).cls) ? 5 : 0);
      }));
    }
    case 'sacrifice':
    case 'return-own':
      return keys(score((o) => {
        const t = crewOf(o);
        return t ? -crewValue(g, p, t.crew) + (req.purpose === 'return-own' ? 2 : 0) : 0;
      }));
    case 'shield':
      return keys(score((o) => {
        const t = crewOf(o);
        return t ? crewValue(g, p, t.crew) : 0;
      }));
    case 'bounce':
      // send a rival's best Crew card home (unless one of mine is better used again)
      return keys(score((o) => {
        const t = crewOf(o);
        if (!t) return 0;
        return t.owner.id === p.id ? -5 : crewValue(g, t.owner, t.crew) + threat(g, t.owner) * 0.4;
      }));
    case 'gear-own':
      return keys(score((o) => {
        const t = crewOf(o);
        return t ? crewValue(g, p, t.crew) : 0;
      }));
    case 'gear-curse':
      return keys(score((o) => {
        const t = crewOf(o);
        return t ? crewValue(g, t.owner, t.crew) + threat(g, t.owner) : 0;
      }));
    case 'gear-take':
    case 'gear-destroy':
      return keys(score((o) => {
        const t = crewOf(o);
        if (!t) return 0;
        const bad = def(t.crew.gear.id).cursed;
        // take (or destroy) good Gear on rivals; unload cursed Gear from my own Crew
        return t.owner.id === p.id ? (bad ? 6 : -4) : bad ? -3 : 5;
      }));
    case 'discard':
    case 'discard-theirs': {
      const mine = req.purpose === 'discard';
      return keys(score((o) => {
        const c = p.hand.find((x) => x.uid === o.key) || g.players.flatMap((x) => x.hand).find((x) => x.uid === o.key);
        if (!c) return 0;
        return mine ? -cardValue(g, p, c) : cardValue(g, g.players.find((x) => x.hand.includes(c)) || p, c);
      }));
    }
    case 'take-from-hand':
    case 'search':
    case 'play-free': {
      return keys(score((o) => {
        const c = g.players.flatMap((x) => x.hand).concat(g.discard, g.deck).find((x) => x.uid === o.key);
        if (!c) return 0;
        return cardValue(g, p, c);
      }));
    }
    case 'player-hand':
      return keys(score((o) => (g.get(o.key)?.hand.length || 0) + threat(g, g.get(o.key)) * 0.3));
    case 'player-crew':
      return keys(score((o) => {
        const x = g.get(o.key);
        return x.crew.length * 0.8 + threat(g, x);
      }));
    case 'swap-hands': {
      // trade a poor hand for a rich one
      return keys(score((o) => (g.get(o.key)?.hand.length || 0) - p.hand.length));
    }
    case 'attack':
      return keys(score((o) => {
        const d = def(g.beastRow.find((b) => b.uid === o.key).id);
        return odds(d.slay, g.attackBonus(p).reduce((n, b) => n + b.v, 0));
      }));
    case 'look':
      return { keys: [] };
    default:
      return keys(options.slice().sort(() => g.r() - 0.5));
  }
}

// ---------------------------------------------------------------------------
// The turn
// ---------------------------------------------------------------------------
// noise: robots add a little randomness so they do not all play alike; the hint shown to a person has none (and so
// does not touch the game's random numbers)
function action(g, p, noise = true) {
  const ap = g.turn.ap;
  const list = [];
  const add = (a, score) => {
    if (!g.validateAction(p, a)) list.push({ a, score: score + (noise ? rnd(g, 0.8) : 0) });
  };
  const rolls = g.attackBonus(p).reduce((n, b) => n + b.v, 0);

  // Beasts
  if (ap >= 2) {
    for (const b of g.beastRow) {
      const d = def(b.id);
      if (!g.meetsReqs(p, d)) continue;
      const win = odds(d.slay, rolls);
      const fail = 1 - odds(d.fail + 1, rolls);
      // a Beast is worth more the closer you are to three, and when six disciplines look far away
      const far = 6 - g.classes(p).size >= 3 ? 2.5 : 0;
      const value = 9 + p.beasts.length * 4 + (p.beasts.length >= 2 ? 10 : 0) + far;
      add({ action: 'attack', uid: b.uid }, win * value - fail * 2 + 0.5);
    }
  }

  // cards from hand
  const have = g.classes(p);
  for (const c of p.hand) {
    const d = def(c.id);
    if (d.kind === 'crew') {
      const missing = !have.has(d.cls);
      const chance = odds(d.req, g.effectBonus(p, null).reduce((n, b) => n + b.v, 0));
      add({ action: 'play', uid: c.uid }, 5 + (missing ? 5 + have.size * 0.5 : 0) + chance * fxValue(d.fx) * 0.5 - (p.crew.length > 6 ? 2 : 0));
    } else if (d.kind === 'gear') {
      if (d.cursed) {
        const victims = g.gearTargets(p, d);
        const best = Math.max(0, ...victims.map((v) => threat(g, v.owner) + crewValue(g, v.owner, v.crew) * 0.3));
        add({ action: 'play', uid: c.uid }, victims.length ? 2 + best * 0.25 : -9);
      } else add({ action: 'play', uid: c.uid }, p.crew.length ? 3 + (d.ward || d.rebound ? 0.5 : 0) + (d.roll ? 0.5 : 0) : -9);
    } else if (d.kind === 'protocol') {
      let v = 2 + fxValue(d.fx) * 0.55;
      if (!usable(g, p, d.fx)) v = -9;
      if (d.id === 'strike' || d.id === 'mindcontrol') {
        if (p.hand.length < (d.id === 'strike' ? 2 : 3)) v -= 6;
      }
      if (d.id === 'overclock' && !p.hand.some((x) => def(x.id).kind === 'crew')) v -= 1.5;
      if (d.id === 'reset') v = p.hand.length <= 2 ? 6 : -4;
      if (d.id === 'jump') v = ap >= 2 && p.hand.length >= 3 ? 3.2 : 0.5;
      if (d.id === 'salvage') v = g.discard.some((x) => def(x.id).kind === 'crew') ? 4.5 : -9;
      if (d.id === 'gravwell') v = g.allCrew().filter((x) => x.crew.gear).length >= 2 ? 3 : -9;
      if (d.id === 'intel') v = g.others(p).some((o) => o.hand.length) ? 2 : -9;
      add({ action: 'play', uid: c.uid }, v);
    }
  }

  // crew already in play
  for (const c of p.crew) {
    if (c.used) continue;
    const d = def(c.id);
    const cost = g.energyCost(p, c);
    const chance = odds(d.req, g.effectBonus(p, c).reduce((n, b) => n + b.v, 0));
    if (!usable(g, p, d.fx)) continue;
    add({ action: 'activate', uid: c.uid }, chance * (1 + fxValue(d.fx) * 0.7) - cost * 1.0 + (cost === 0 ? 1.5 : 0));
  }

  // free powers
  for (const ab of g.freeAbilities(p)) {
    let v = 2.5;
    if (ab.ability === 'loot') v = p.hand.some((c) => def(c.id).kind === 'boost') && p.hand.length > 4 ? 2.4 : 0.9;
    add({ action: 'ability', key: ab.key }, v);
  }

  // basics
  add({ action: 'draw' }, 2.4 + Math.max(0, 5 - p.hand.length) * 0.5 + (g.drawCost(p) === 0 ? 3 : 0));
  add({ action: 'flush' }, p.hand.length === 0 ? 4 : p.hand.length === 1 ? 1.5 : -3);

  list.sort((x, y) => y.score - x.score);
  const best = list[0];
  if (!best || best.score < 0.4) return { action: 'end' };
  return best.a;
}

// What a robot would do in a person's seat right now: shown to them as a gentle hint. Ending the turn is only
// suggested once nothing else looks worth doing.
function suggest(g, p) {
  if (!g.turn || g.turn.pid !== p.id) return null;
  return action(g, p, false);
}

module.exports = { decide, suggest, odds, threat };

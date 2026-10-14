// Ruler of the Galaxy: the robots. They answer the very same questions a person does (see ask() in engine.js),
// so they can never do anything a person could not. They play like a sensible friend: chase triplets, shoot when
// there is someone to shoot, repair when hurt, hold the Core while they are healthy and leave when they are not.

const { cardDef } = require('./data');
const { tally } = require('./engine');

function decide(g, p, req) {
  switch (req.type) {
    case 'dice':
      return dice(g, p);
    case 'buy':
      return buy(g, p);
    case 'yield':
      return { yield: wantsToYield(g, p) && g.canYield(p) };
    case 'grapple':
      return { grapple: p.shards >= 4 };
    case 'evolve':
      return evolve(g, p, req);
    default:
      return g.safeAnswer(req);
  }
}

// ---------------------------------------------------------------------------
// Dice: which ones are worth keeping?
// ---------------------------------------------------------------------------
function keepers(g, p) {
  const t = g.turn;
  const c = tally(t.dice);
  const hurt = p.maxHull - p.hull;
  const inside = g.inside(p);
  const targets = inside ? g.rivals(p).filter((o) => o.where === 'rim') : g.rivals(p).filter((o) => g.inside(o));
  const evolving = g.settings.evolutions && p.evolutions.length < 3;
  const keep = new Set();
  t.dice.forEach((d, i) => {
    const f = d.face;
    if (f === '1' || f === '2' || f === '3') {
      const n = Number(f);
      // a pair of 3s or 2s is worth chasing; 1s only once they are three already
      if (c[f] >= 3 || (c[f] >= 2 && n >= 2 && t.rollsLeft >= 1)) keep.add(i);
    } else if (f === 'repair') {
      if ((!inside && hurt >= 2) || (evolving && c.repair >= 2) || (!inside && hurt >= 1 && p.hull <= 5)) keep.add(i);
    } else if (f === 'laser') {
      // shooting the Core from outside can drag you in: not when you are weak
      const brave = inside || p.hull >= 6 || targets.some((o) => o.hull <= c.laser + 1);
      if (targets.length && brave) keep.add(i);
    } else if (f === 'shard') {
      keep.add(i);
    }
  });
  return keep;
}

function dice(g, p) {
  const t = g.turn;
  if (!t.rolled) return { action: 'roll', keep: [] };
  const keep = keepers(g, p);
  if (keep.size === t.dice.length || t.rollsLeft <= 0) return { action: 'resolve' };
  return { action: 'roll', keep: [...keep] };
}

// ---------------------------------------------------------------------------
// The Bazaar
// ---------------------------------------------------------------------------
function cardValue(g, p, id) {
  const d = cardDef(id);
  const hurt = p.maxHull - p.hull;
  const needed = g.target - p.stars;
  if (d.kind === 'now') {
    let v = 0;
    for (const [step, n] of d.fx) {
      if (step === 'stars') v += n * (needed <= n ? 10 : 1.4);
      if (step === 'shards') v += n * 0.55;
      if (step === 'heal') v += Math.min(n, hurt) * 1.2;
      if (step === 'hurtSelf') v -= p.hull - n <= 2 ? 99 : n * 1.1;
      if (step === 'hurtOthers') v += n * g.rivals(p).length * 0.6 + g.rivals(p).filter((o) => o.hull <= n).length * 3;
      if (step === 'hurtAll') v += p.hull <= n + 1 ? -99 : n * (g.rivals(p).length - 1) * 0.6;
      if (step === 'othersLoseStars') v += Math.min(n, Math.max(0, ...g.rivals(p).map((o) => o.stars))) * 0.9;
      if (step === 'halveShards') v += g.rivals(p).reduce((s, o) => s + Math.floor(o.shards / 2), 0) * 0.4;
      if (step === 'takeCore') v += p.where === 'core' ? -5 : p.hull >= 7 ? 3 : -3;
      if (step === 'extraTurn') v += 5;
    }
    return v;
  }
  const keepValue = {
    extraDie: 7, extraRoll: 6, railgun: 6, ablative: 4, ion: 3, siphon: 3, drones: 3, sails: 2, feeder: 4, cartographer: 4, hoard: 3,
    ram: 6, cloak: 5, banner: 4, echo: 4, throne: 4, salvage: 2, megahull: 5, bay: 2, discount: 4,
  }[d.hook] ?? 2;
  // a card that will not pay back before the end is worth less
  return keepValue * (needed > 8 ? 1 : 0.6);
}

function buy(g, p) {
  const t = g.turn;
  t.botBuys = (t.botBuys || 0) + 1;
  if (t.botBuys > 6) return { action: 'done' };
  let best = null;
  for (const c of g.market) {
    const price = g.price(p, c.id);
    if (price > p.shards) continue;
    const value = cardValue(g, p, c.id) - price * 0.55;
    if (!best || value > best.value) best = { uid: c.uid, value };
  }
  if (best && best.value > 0.4) return { action: 'buy', uid: best.uid };
  if (g.has(p, 'bay') && p.hull <= p.maxHull - 2 && p.shards >= 2 && p.where === 'core') return { action: 'heal' };
  if (!t.botFlushed && p.shards >= 7 && !best) {
    t.botFlushed = true;
    return { action: 'flush' };
  }
  return { action: 'done' };
}

// ---------------------------------------------------------------------------
// Hold or yield
// ---------------------------------------------------------------------------
function wantsToYield(g, p) {
  // a turn start in the Core is worth 2 Stars: if that wins, hang on
  if (p.stars + 2 >= g.target && p.hull >= 2) return false;
  // how much more could come before my turn? the rest of the table shooting
  const shooters = g.rivals(p).filter((o) => o.where === 'rim').length;
  return p.hull <= Math.min(6, 3 + shooters);
}

function evolve(g, p, req) {
  const hurt = p.maxHull - p.hull;
  const score = (o) => {
    if (o.id === 'rewind' || o.id === 'magma') return hurt >= 3 ? 9 : 4;
    if (o.id === 'acid' || o.id === 'bombard') return 6;
    if (o.id === 'capacitor') return Math.floor(hurt / 2) * 2;
    return 5 + g.r();
  };
  const best = [...req.options].sort((a, b) => score(b) - score(a))[0];
  return { id: best.id };
}

module.exports = { decide, keepers };

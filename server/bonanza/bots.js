// Star Bonanza: the robots. A robot looks at the table the same way a person does and answers with the very same
// actions (plant, harvest, offer, accept...). autoStep() returns the one thing a player should do next, or null when
// there is nothing to do right now. The engine also uses it for people who have gone quiet ("forced": always do
// something that moves the game on).
//
// A robot is not a genius, but it plays sensibly: it plants beside stars of the same kind, gives away the stars
// that would only force a harvest, asks for the kinds it is growing, accepts fair trades and cashes in when a
// nursery is as good as it is going to get (or the game is nearly over).

const { starDef, payout, nextPayout } = require('./data');

// how much a robot wants one more star of this kind: stars that fit a nursery are worth a lot, stars that would
// only force a harvest are worth next to nothing, and the rarer kinds are worth a little more
function worth(p, t) {
  let w = 0;
  const f = p.fields.find((x) => x.type === t && x.cards.length);
  if (f) w = 3 + f.cards.length * 0.25;
  else if (p.fields.some((x) => !x.cards.length)) w = 1.6;
  return w + (1 - starDef(t).count / 24) * 0.8;
}

// what you lose by harvesting this nursery now (a field close to paying is worth keeping)
function fieldLoss(f) {
  return payout(f.type, f.cards.length) * 10 + f.cards.length;
}

// where to plant a star: beside its own kind, in an empty nursery, or (as a last resort) over the nursery that
// would be the cheapest to harvest
function chooseField(game, p, card) {
  let i = p.fields.findIndex((f) => f.type === card.t && f.cards.length);
  if (i >= 0) return { field: i, harvest: false };
  i = p.fields.findIndex((f) => !f.cards.length);
  if (i >= 0) return { field: i, harvest: false };
  let best = -1;
  p.fields.forEach((f, j) => {
    if (!game.canHarvest(p, j)) return;
    if (best < 0 || fieldLoss(f) < fieldLoss(p.fields[best])) best = j;
  });
  if (best < 0) best = p.fields.findIndex((f) => f.cards.length > 1);
  if (best < 0) best = 0;
  return { field: best, harvest: true };
}

// cash a nursery in when it is as good as it will get, or when the game is nearly over
function voluntaryHarvest(game, p) {
  const endgame = game.endPending || (game.deckOuts + 1 >= game.settings.passes && game.deck.length <= 10);
  let pick = -1;
  p.fields.forEach((f, i) => {
    if (!f.cards.length || !game.canHarvest(p, i)) return;
    const k = payout(f.type, f.cards.length);
    if (k < 1) return;
    let good = endgame;
    if (!good && k >= 2) {
      const next = nextPayout(f.type, f.cards.length);
      const soon = p.hand.slice(0, 3).some((c) => c.t === f.type);
      good = (!next || next.more >= 3) && !soon;
    }
    if (good && (pick < 0 || k > payout(p.fields[pick].type, p.fields[pick].cards.length))) pick = i;
  });
  return pick >= 0 ? { type: 'harvest', field: pick, delay: 1000 } : null;
}

// the stars a robot would happily give away: they fit nowhere, so planting them would only force a harvest
function unwantedFaceUp(game, p) {
  const t = game.turn;
  const offered = new Set(t.offers.filter((o) => o.from === p.id).flatMap((o) => o.give));
  return t.faceUp.filter((c) => !offered.has(c.uid) && worth(p, c.t) < 1.3).sort((a, b) => worth(p, a.t) - worth(p, b.t));
}

function unwantedHand(game, p) {
  const t = game.turn;
  const offered = new Set(t.offers.filter((o) => o.from === p.id).flatMap((o) => o.give));
  return p.hand
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) => i >= 2 && !offered.has(c.uid) && worth(p, c.t) < 1.0)
    .sort((a, b) => b.i - a.i)
    .map(({ c }) => c);
}

// the kind a robot would most like to be handed: the one it is growing the most of
function wantedType(p) {
  let best = null;
  for (const f of p.fields) if (f.cards.length && (!best || f.cards.length > best.n)) best = { t: f.type, n: f.cards.length };
  return best?.t || null;
}

// should a robot accept this offer, and with which of its own stars?
function evaluateOffer(game, p, o) {
  if (p.tray.length >= 2) return null; // already has plenty to plant
  const gain = o.give.reduce((s, c) => s + worth(p, c.t), 0);
  const give = [];
  for (const w of o.want) {
    const pool = p.hand.filter((c) => c.t === w.t && !give.includes(c));
    if (pool.length < w.n) return null;
    for (let k = 0; k < w.n; k++) give.push(pool[pool.length - 1 - k]); // from the back of the hand: the least in the way
  }
  const cost = give.reduce((s, c) => s + worth(p, c.t) * (p.hand.indexOf(c) < 2 ? 1.6 : 1), 0);
  const gift = !o.want.length;
  const ok = gift ? gain >= 2.6 : o.give.length ? gain - cost >= 0.6 : false;
  return ok ? { give: give.map((c) => c.uid) } : null;
}

// ask the player whose turn it is for a star the robot could use, in return for one it could not
function proposal(game, p) {
  const t = game.turn;
  const active = game.get(t.pid);
  if (!active) return null;
  const mine = unwantedHand(game, p)[0];
  if (!mine) return null;
  const want = t.faceUp.find((c) => worth(p, c.t) >= 3);
  if (!want) return null;
  return { type: 'offer', give: [mine.uid], want: [{ t: want.t, n: 1 }], delay: 2600 };
}

function autoStep(game, p, { forced = false } = {}) {
  const t = game.turn;
  if (!t || game.phase !== 'playing') return null;
  const mine = t.pid === p.id;

  // cashing in is allowed any time (but not when someone is just getting a quiet person moving again)
  if (!forced && (t.phase === 'plant' || t.phase === 'tray' || (t.phase === 'trade' && !mine))) {
    const h = voluntaryHarvest(game, p);
    if (h) return h;
  }

  if (t.phase === 'plant') {
    if (!mine) return null;
    if (t.planted === 0) {
      if (!p.hand.length) return null;
      const ch = chooseField(game, p, p.hand[0]);
      return { type: 'plant', field: ch.field, harvest: ch.harvest, delay: 1000 };
    }
    if (t.planted === 1) {
      if (forced || !p.hand.length) return { type: 'skipPlant', delay: 300 };
      const ch = chooseField(game, p, p.hand[0]);
      if (!ch.harvest && worth(p, p.hand[0].t) >= 1.5) return { type: 'plant', field: ch.field, harvest: false, delay: 800 };
      return { type: 'skipPlant', delay: 600 };
    }
    return null;
  }

  if (t.phase === 'trade') {
    const made = t.made?.[p.id] || 0;
    if (mine) {
      if (!forced && made < 2) {
        const want = wantedType(p);
        const face = unwantedFaceUp(game, p)[0];
        if (face && made === 0 && want && want !== face.t) return { type: 'offer', give: [face.uid], want: [{ t: want, n: 1 }], delay: 1500 };
        if (face) return { type: 'offer', give: [face.uid], want: [], delay: 1500 }; // a gift: better than a forced harvest
        const spare = unwantedHand(game, p)[0];
        if (spare && made === 0 && want && want !== spare.t) return { type: 'offer', give: [spare.uid], want: [{ t: want, n: 1 }], delay: 1800 };
      }
      // wait a few seconds so people can answer, then move on (at once if only robots are playing)
      const humans = game.players.some((x) => !game.isAuto(x));
      const elapsed = Date.now() - (t.tradeAt || Date.now());
      return { type: 'doneTrading', delay: forced ? 0 : Math.max(0, (humans ? 9000 : 5000) - elapsed) };
    }
    if (forced) return null;
    for (const o of t.offers) {
      if (o.from !== t.pid || (o.to && o.to !== p.id)) continue;
      const full = game.offerView(o);
      const ev = evaluateOffer(game, p, full);
      if (ev) return { type: 'accept', id: o.id, give: ev.give, delay: 2200 };
    }
    if (made < 1) return proposal(game, p);
    return null;
  }

  if (t.phase === 'tray') {
    if (!p.tray.length) return null;
    // plant what fits first; what would force a harvest goes last
    let pick = p.tray.find((c) => !chooseField(game, p, c).harvest) || p.tray[0];
    const ch = chooseField(game, p, pick);
    return { type: 'plant', uid: pick.uid, field: ch.field, harvest: ch.harvest, delay: 800 };
  }
  return null;
}

module.exports = { autoStep, worth, chooseField };

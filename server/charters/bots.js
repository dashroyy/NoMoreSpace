// Star Charters: the robot captains. A robot tries every spot the tile fits, and for each one every place it could
// send a probe (or the dreadnought, or calling one home with fuel), guesses what each is worth, and picks the best,
// with a pinch of luck so robots do not all play alike. It is greedy, not deep: it finishes its own lanes and
// stations, grabs anomalies, likes a big station for the dreadnought, keeps a probe or two in reserve, and late in
// the game trawls the void.

const { TILES } = require('./tiles');
const { featureValue, winnersOf } = require('./board');

// what a feature is likely to be worth to whoever wins it, from how open it still is and how much game is left
function estimate(f, left) {
  const late = left < 6;
  if (f.done) return featureValue(f);
  if (f.k === 'L') return late ? f.tiles.size : (f.tiles.size + 1.5) * (f.open <= 1 ? 0.8 : f.open === 2 ? 0.55 : 0.32) + f.tiles.size * 0.3;
  if (f.k === 'S') {
    const whole = 2 * (f.tiles.size + f.cores) + 2;
    if (late) return f.tiles.size + f.cores;
    const p = 1 / (1 + 0.5 * f.open);
    return whole * p + (f.tiles.size + f.cores) * (1 - p);
  }
  if (f.k === 'A' || f.k === 'H') return 1 + f.nb + (late ? 0 : (8 - f.nb) * 0.7);
  if (f.k === 'V') return 3 * (f.stationsDone + (late ? 0 : 0.4) * (f.touch.size - f.stationsDone));
  return 0;
}

// each robot leans a little one way (worked out from its name, so it stays the same all game)
function persona(p) {
  let h = 0;
  for (const ch of p.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ['builder', 'trawler', 'racer', 'steady'][h % 4];
}

function chooseMove(g, p) {
  const t = g.turn;
  const opts = t?.options || [];
  if (!opts.length) return null;
  const board = g.board;
  const before = board.analyze();
  const left = g.bag.length;
  const total = g.settings.length === 'sprint' ? 38 : 75;
  const rivals = Math.max(1, g.players.length - 1);
  const style = persona(p);
  const reserve = p.probes + p.dread;
  const unitCost = (left < 6 ? 0.3 : 1.4) + (reserve <= 2 ? 2.5 : 0);
  const anomalyValue = { fuel: 2, cache: 3, boost: 4 };

  let best = null;
  const consider = (value, move) => {
    const v = value + g.r() * 0.8;
    if (!best || v > best.v) best = { v, move };
  };

  for (const o of opts) {
    const placed = board.add(t.tile, o.x, o.y, o.r, { by: p.id });
    const A = board.analyze();
    const i = A.index.get(placed);
    let base = 0;
    // things it finishes for probes already out there
    for (const c of o.completes) {
      const mine = c.pids.includes(p.id);
      const theirs = c.pids.filter((id) => id !== p.id).length;
      base += (mine ? c.pts : 0) - (c.pts * theirs) / rivals;
    }
    // things it grows (or takes over)
    const grown = new Set();
    TILES[t.tile].shapes[o.r].segs.forEach((_, j) => {
      const f = A.featOf(i, j);
      if (!f || f.done || !f.units.length || grown.has(f)) return;
      grown.add(f);
      const old = new Set();
      for (const [ti, sj] of f.segs) if (ti !== i) old.add(before.featOf(ti, sj));
      let was = 0;
      let wasMine = 0;
      for (const prev of old) {
        const v = estimate(prev, left + 1);
        was += v;
        if (winnersOf(prev).winners.includes(p.id)) wasMine += v;
      }
      const now = estimate(f, left);
      const { winners } = winnersOf(f);
      if (winners.includes(p.id)) base += (now - wasMine) * 0.7;
      else base -= wasMine;
      const theirs = winners.filter((id) => id !== p.id).length;
      base -= ((now - was) * 0.45 * theirs) / rivals;
    });
    if (o.anomaly) base += anomalyValue[o.anomaly] || 0;

    // nothing sent
    consider(base, { type: 'place', x: o.x, y: o.y, r: o.r, deploy: null });
    // a probe, or the dreadnought, onto each place it could go
    for (const tg of o.targets) {
      const q = board.get(tg.x, tg.y);
      const f = A.featOf(A.index.get(q), tg.seg);
      if (!f) continue;
      let v = tg.done ? tg.pts + 0.3 : estimate(f, left) - unitCost;
      if (f.k === 'V') {
        if (left > total * 0.55) continue; // too early to lie down in the void
        v -= 1.2;
        if (style === 'trawler') v *= 1.3;
      }
      if (f.k === 'S' && style === 'builder') v *= 1.2;
      if (f.k === 'L' && style === 'racer') v *= 1.15;
      if (p.probes > 0) consider(base + v, { type: 'place', x: o.x, y: o.y, r: o.r, deploy: { x: tg.x, y: tg.y, seg: tg.seg, dread: false } });
      // the dreadnought, for something worth fighting over
      if (p.dread > 0 && (f.k === 'S' || f.k === 'V') && (tg.done || estimate(f, left) >= 7)) consider(base + v + 0.8 - (p.probes > 0 ? 0.6 : 0), { type: 'place', x: o.x, y: o.y, r: o.r, deploy: { x: tg.x, y: tg.y, seg: tg.seg, dread: true } });
    }
    // calling a stuck probe home
    if (p.fuel > 0 && reserve <= 1)
      for (const q of board.tiles)
        for (const u of q.units) {
          if (u.pid !== p.id) continue;
          const f = A.featOf(A.index.get(q), u.seg);
          if (!f || f.k === 'V' || f.done) continue;
          const hopeless = estimate(f, left) < 3 && f.open >= 2;
          if (hopeless) consider(base + 1.6, { type: 'place', x: o.x, y: o.y, r: o.r, deploy: null, recall: { x: q.x, y: q.y, seg: u.seg } });
        }
    board.pop();
  }
  return best?.move || { type: 'place', x: opts[0].x, y: opts[0].y, r: opts[0].r };
}

module.exports = { chooseMove, estimate };

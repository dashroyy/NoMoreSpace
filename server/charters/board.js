// Star Charters: the board. Where the tiles are, whether a tile fits somewhere, and the "features": the lanes,
// stations, arrays and voids that the pieces of neighbouring tiles join up into (two lanes on two tiles meeting at an
// edge are one lane). Features are worked out afresh from the tiles whenever they are needed, which keeps the rules
// simple: nothing has to be kept in step by hand.
//
// A lane or a station is finished when it has no open ends left. A wormhole counts as an open end until its twin is on
// the board too; from then on the two are one feature, however far apart they are. An array or a black hole is
// finished when all eight tiles round it are there. Void is never finished: it is scored at the very end.

const { N, TILES, portCell } = require('./tiles');

const OPP = [2, 3, 0, 1];
const STEP = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const portSeg = (shape, side, i) => {
  const [x, y] = portCell(side, i);
  return shape.segAt[y * N + x];
};
const shapeOf = (p) => TILES[p.t].shapes[p.r];

// points for a feature: finished, or left unfinished when the game ends
function featureValue(f, final = false) {
  const done = f.done;
  if (f.k === 'L') return f.tiles.size;
  if (f.k === 'S') return (done ? 2 : 1) * (f.tiles.size + f.cores);
  if (f.k === 'A' || f.k === 'H') return done ? 9 : 1 + f.nb;
  if (f.k === 'V') return 3 * f.stationsDone; // (only ever paid at the end)
  return 0;
}

// who wins a feature: the most strength there (a probe is 1, the dreadnought 2); a tie shares the points
function winnersOf(f) {
  const power = {};
  for (const u of f.units) power[u.pid] = (power[u.pid] || 0) + (u.dread ? 2 : 1);
  const best = Math.max(0, ...Object.values(power));
  return { power, winners: best ? Object.keys(power).filter((pid) => power[pid] === best) : [] };
}

class Board {
  constructor() {
    this.tiles = []; // in the order they were placed: { x, y, t, r, units: [{ seg, pid, dread }] }
    this.at = new Map();
  }

  static key(x, y) {
    return `${x},${y}`;
  }
  get(x, y) {
    return this.at.get(Board.key(x, y)) || null;
  }

  add(t, x, y, r, extra = {}) {
    const p = { x, y, t, r, units: [], ...extra };
    this.tiles.push(p);
    this.at.set(Board.key(x, y), p);
    return p;
  }

  // takes the last tile off again (to try a spot out)
  pop() {
    const p = this.tiles.pop();
    if (p) this.at.delete(Board.key(p.x, p.y));
    return p;
  }

  // the empty squares next to the board
  frontier() {
    const out = new Map();
    for (const p of this.tiles)
      for (const [dx, dy] of STEP) {
        const x = p.x + dx;
        const y = p.y + dy;
        if (!this.get(x, y)) out.set(Board.key(x, y), [x, y]);
      }
    return [...out.values()];
  }

  // does tile t, turned r times, go at x, y? (it must touch the board, and every edge must match its neighbour)
  fits(t, x, y, r) {
    if (this.get(x, y)) return false;
    const shape = TILES[t].shapes[r];
    let touching = false;
    for (let side = 0; side < 4; side++) {
      const n = this.get(x + STEP[side][0], y + STEP[side][1]);
      if (!n) continue;
      touching = true;
      if (shapeOf(n).edges[OPP[side]] !== shape.edges[side]) return false;
    }
    return touching;
  }

  // every way tile t can go on the board: [{ x, y, r }]
  placements(t) {
    const out = [];
    for (const [x, y] of this.frontier()) for (const r of TILES[t].uniq) if (this.fits(t, x, y, r)) out.push({ x, y, r });
    return out;
  }

  // the wormhole pairs: both twins placed means they are joined
  links() {
    const byType = new Map();
    for (const p of this.tiles) if (TILES[p.t].pair) byType.set(p.t, [...(byType.get(p.t) || []), p]);
    return [...byType.entries()].filter(([, list]) => list.length >= 2).map(([t, list]) => ({ t, a: list[0], b: list[1] }));
  }

  // ---------------------------------------------------------------------------
  // the features: joins every piece to the pieces it touches
  // ---------------------------------------------------------------------------
  analyze() {
    const tiles = this.tiles;
    const base = [];
    let n = 0;
    for (const p of tiles) {
      base.push(n);
      n += shapeOf(p).segs.length;
    }
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (a) => {
      while (parent[a] !== a) {
        parent[a] = parent[parent[a]];
        a = parent[a];
      }
      return a;
    };
    const union = (a, b) => {
      a = find(a);
      b = find(b);
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    };
    const index = new Map(tiles.map((p, i) => [p, i]));
    tiles.forEach((p, i) => {
      const s = shapeOf(p);
      for (const side of [1, 2]) {
        const q = this.get(p.x + STEP[side][0], p.y + STEP[side][1]);
        if (!q) continue;
        const j = index.get(q);
        const t = shapeOf(q);
        for (let k = 0; k < 3; k++) {
          const a = portSeg(s, side, k);
          const b = portSeg(t, OPP[side], k);
          if (a >= 0 && b >= 0) union(base[i] + a, base[j] + b);
        }
      }
    });
    const linked = new Set();
    for (const { a, b } of this.links()) {
      const sa = shapeOf(a).segs.findIndex((g) => g.portal);
      const sb = shapeOf(b).segs.findIndex((g) => g.portal);
      union(base[index.get(a)] + sa, base[index.get(b)] + sb);
      linked.add(a);
      linked.add(b);
    }

    const byRoot = new Map();
    const featOf = (i, j) => byRoot.get(find(base[i] + j));
    tiles.forEach((p, i) => {
      shapeOf(p).segs.forEach((seg, j) => {
        const root = find(base[i] + j);
        let f = byRoot.get(root);
        if (!f) {
          f = { id: root, k: seg.k, tiles: new Set(), segs: [], cores: 0, open: 0, nb: 0, units: [], touch: new Set(), portals: 0, stationsDone: 0, done: false };
          byRoot.set(root, f);
        }
        f.tiles.add(i);
        f.segs.push([i, j]);
        f.cores += seg.cores;
        for (const side of seg.sides) if (!this.get(p.x + STEP[side][0], p.y + STEP[side][1])) f.open += 1;
        if (seg.portal) {
          f.portals += 1;
          if (!linked.has(p)) f.open += 1;
        }
        if (seg.k === 'A' || seg.k === 'H') {
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && this.get(p.x + dx, p.y + dy)) f.nb += 1;
          f.open = 8 - f.nb;
        }
        for (const u of p.units) if (u.seg === j) f.units.push({ ...u, x: p.x, y: p.y });
      });
    });
    // what each patch of void is next to, once the stations are known
    const features = [...byRoot.values()];
    for (const f of features) f.done = (f.k === 'L' || f.k === 'S' || f.k === 'A' || f.k === 'H') && f.open === 0;
    for (const f of features) {
      if (f.k !== 'V') continue;
      for (const [i, j] of f.segs) for (const t of shapeOf(tiles[i]).segs[j].touches) f.touch.add(featOf(i, t));
      f.stationsDone = [...f.touch].filter((s) => s.done).length;
    }
    return { features, featOf, index, tiles };
  }
}

module.exports = { Board, featureValue, winnersOf, STEP, OPP };

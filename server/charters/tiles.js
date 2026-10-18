// Star Charters: the tiles.
//
// Every tile is drawn as a 7 x 7 map of letters, and everything else is worked out from that drawing: which edge is
// what (so neighbours can be checked), and the separate pieces on the tile (a lane, a station, the empty void on each
// side of a lane...). The same drawing is sent to the browser, which builds the 3D tile from it, so the rules and the
// picture can never disagree.
//
//   .  void (empty space, where trawlers fish for dark matter)
//   S  station (a megastructure; C is a station square with a reactor core in it, Q one with a wormhole)
//   L  warp lane (O is the wormhole a lane runs into)
//   X  a lane hub: lanes stop here (crossroads)
//   A  a deep space array (it calibrates once all eight tiles around it are charted)
//   H  a black hole (scores like an array, and its gravity lets you slingshot a probe onto a tile next to it)
//
// Each side of a tile has three "ports" (its left, middle and right squares), which is how pieces join up with the
// tile next door: a lane uses the middle port and leaves the void on either side of it apart, a station fills all
// three. Ports are numbered side * 3 + i, sides going N, E, S, W.

const N = 7;
const SIDES = ['N', 'E', 'S', 'W'];
const KIND_OF = { '.': 'V', S: 'S', C: 'S', Q: 'S', L: 'L', O: 'L', A: 'A', H: 'H', X: null };

// the square each port sits on
function portCell(side, i) {
  const k = 2 + i;
  if (side === 0) return [k, 0];
  if (side === 1) return [N - 1, k];
  if (side === 2) return [k, N - 1];
  return [0, k];
}

// count: tiles in a Classic game; sprint: tiles in a Sprint game. `pair` tiles are wormholes, joined to each other.
const DEFS = [
  { id: 'dock', name: 'Docking Ring', count: 3, sprint: 1, rows: ['SSSSSSS', '.SSSSS.', '.......', 'LLLLLLL', '.......', '.......', '.......'] },
  { id: 'cap', name: 'Outpost', count: 5, sprint: 3, rows: ['SSSSSSS', '.SSSSS.', '..SSS..', '.......', '.......', '.......', '.......'] },
  { id: 'band-core', name: 'Reactor Bridge', count: 2, sprint: 1, rows: ['.......', '..SSS..', 'SSSSSSS', 'SSSCSSS', 'SSSSSSS', '..SSS..', '.......'] },
  { id: 'band', name: 'Sky Bridge', count: 1, sprint: 0, rows: ['.......', '..SSS..', 'SSSSSSS', 'SSSSSSS', 'SSSSSSS', '..SSS..', '.......'] },
  { id: 'twin-caps', name: 'Twin Outposts', count: 3, sprint: 1, rows: ['SSSSSSS', '.SSSSS.', '.......', '.......', '.......', '.SSSSS.', 'SSSSSSS'] },
  { id: 'corner-caps', name: 'Next-door Neighbours', count: 2, sprint: 1, rows: ['..SSSS.', '...SS..', 'S......', 'SS.....', 'SS.....', 'S......', '.......'] },
  { id: 'corner', name: 'Hab Wedge', count: 3, sprint: 2, rows: ['SSSSS..', 'SSSS...', 'SSS....', 'SS.....', 'S......', '.......', '.......'] },
  { id: 'corner-core', name: 'Reactor Wedge', count: 2, sprint: 1, rows: ['SSSSS..', 'SCSS...', 'SSS....', 'SS.....', 'S......', '.......', '.......'] },
  { id: 'corner-lane', name: 'Wedge Junction', count: 3, sprint: 1, rows: ['SSSSS..', 'SSSS...', 'SSS....', 'SS...LL', 'S...LL.', '...LL..', '...L...'] },
  { id: 'corner-lane-core', name: 'Reactor Junction', count: 2, sprint: 1, rows: ['SSSSS..', 'SCSS...', 'SSS....', 'SS...LL', 'S...LL.', '...LL..', '...L...'] },
  { id: 'three', name: 'Habitat Ring', count: 3, sprint: 1, rows: ['SSSSSSS', 'SSSSSSS', 'SSSSSSS', 'SSSSSSS', 'SS...SS', '.......', '.......'] },
  { id: 'three-core', name: 'Reactor Ring', count: 1, sprint: 1, rows: ['SSSSSSS', 'SSSSSSS', 'SSSCSSS', 'SSSSSSS', 'SS...SS', '.......', '.......'] },
  { id: 'three-lane', name: 'Ring Gate', count: 1, sprint: 1, rows: ['SSSSSSS', 'SSSSSSS', 'SSSSSSS', 'SSSSSSS', 'SS.L.SS', '...L...', '...L...'] },
  { id: 'three-lane-core', name: 'Reactor Gate', count: 2, sprint: 1, rows: ['SSSSSSS', 'SSSSSSS', 'SSSCSSS', 'SSSSSSS', 'SS.L.SS', '...L...', '...L...'] },
  { id: 'full', name: 'Megastation', count: 1, sprint: 0, rows: ['SSSSSSS', 'SSSSSSS', 'SSSSSSS', 'SSSCSSS', 'SSSSSSS', 'SSSSSSS', 'SSSSSSS'] },
  { id: 'array', name: 'Deep Space Array', count: 3, sprint: 2, rows: ['.......', '.......', '.......', '...A...', '.......', '.......', '.......'] },
  { id: 'array-lane', name: 'Array Spur', count: 2, sprint: 1, rows: ['.......', '.......', '.......', '...A...', '...L...', '...L...', '...L...'] },
  { id: 'lane', name: 'Warp Lane', count: 7, sprint: 3, rows: ['...L...', '...L...', '...L...', '...L...', '...L...', '...L...', '...L...'] },
  { id: 'bend', name: 'Lane Bend', count: 8, sprint: 4, rows: ['.......', '.......', '.......', 'LLLL...', '...L...', '...L...', '...L...'] },
  { id: 'tee', name: 'Three-way Hub', count: 4, sprint: 2, rows: ['.......', '.......', '.......', 'LLLXLLL', '...L...', '...L...', '...L...'] },
  { id: 'cross', name: 'Crossroads Hub', count: 1, sprint: 1, rows: ['...L...', '...L...', '...L...', 'LLLXLLL', '...L...', '...L...', '...L...'] },
  { id: 'cap-bend', name: 'Outpost Bend', count: 3, sprint: 1, rows: ['SSSSSSS', '.SSSSS.', '.......', '...LLLL', '...L...', '...L...', '...L...'] },
  { id: 'cap-bend2', name: 'Outpost Swerve', count: 3, sprint: 1, rows: ['SSSSSSS', '.SSSSS.', '.......', 'LLLL...', '...L...', '...L...', '...L...'] },
  { id: 'cap-tee', name: 'Outpost Hub', count: 3, sprint: 1, rows: ['SSSSSSS', '.SSSSS.', '.......', 'LLLXLLL', '...L...', '...L...', '...L...'] },
  { id: 'gate', name: 'Wormhole Gate', count: 2, sprint: 2, pair: true, rows: ['.......', '.......', '.......', '...O...', '...L...', '...L...', '...L...'] },
  { id: 'gate-station', name: 'Wormhole Station', count: 2, sprint: 2, pair: true, rows: ['SSSSSSS', '.SSQSS.', '..SSS..', '.......', '.......', '.......', '.......'] },
  { id: 'hole', name: 'Black Hole', count: 2, sprint: 1, rows: ['.......', '.......', '.......', '...H...', '.......', '.......', '.......'] },
];
const START_TILE = 'dock';

// a quarter turn clockwise: the north side becomes the east side
function rotate(rows) {
  const out = [];
  for (let y = 0; y < N; y++) {
    let s = '';
    for (let x = 0; x < N; x++) s += rows[N - 1 - x][y];
    out.push(s);
  }
  return out;
}

// everything about one tile turned one way: its pieces, which piece is on which port, what each edge is
function shapeOf(rows) {
  const segAt = new Array(N * N).fill(-1);
  const segs = [];
  const ch = (x, y) => rows[y][x];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const k = KIND_OF[ch(x, y)];
      if (!k || segAt[y * N + x] >= 0) continue;
      // flood out over the squares of the same kind (arrays and black holes are one square each)
      const seg = { k, cells: [], ports: [], sides: [], cores: 0, portal: false, touches: [] };
      const idx = segs.length;
      segs.push(seg);
      const todo = [[x, y]];
      segAt[y * N + x] = idx;
      while (todo.length) {
        const [cx, cy] = todo.pop();
        seg.cells.push([cx, cy]);
        if (ch(cx, cy) === 'C') seg.cores += 1;
        if ('OQ'.includes(ch(cx, cy))) seg.portal = true;
        if (k === 'A' || k === 'H') continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N || segAt[ny * N + nx] >= 0 || KIND_OF[ch(nx, ny)] !== k) continue;
          segAt[ny * N + nx] = idx;
          todo.push([nx, ny]);
        }
      }
    }
  for (let side = 0; side < 4; side++)
    for (let i = 0; i < 3; i++) {
      const [x, y] = portCell(side, i);
      const s = segAt[y * N + x];
      if (s < 0) continue;
      segs[s].ports.push(side * 3 + i);
      if (!segs[s].sides.includes(side)) segs[s].sides.push(side);
    }
  // which stations each patch of void (and each lane) is next to
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const a = segAt[y * N + x];
      if (a < 0) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= N || ny >= N) continue;
        const b = segAt[ny * N + nx];
        if (b < 0 || a === b) continue;
        for (const [p, q] of [[a, b], [b, a]]) if (segs[q].k === 'S' && segs[p].k !== 'S' && !segs[p].touches.includes(q)) segs[p].touches.push(q);
      }
    }
  // where a marker for the piece goes: its square nearest the middle of the piece (for a patch of void, the square
  // furthest from anything else on the tile, so its marker sits clear of the lanes and stations)
  const clearance = (x, y, idx) => {
    let d = 3;
    for (let yy = 0; yy < N; yy++)
      for (let xx = 0; xx < N; xx++) if (segAt[yy * N + xx] !== idx) d = Math.min(d, Math.max(Math.abs(xx - x), Math.abs(yy - y)));
    return d;
  };
  for (const [idx, seg] of segs.entries()) {
    const cx = seg.cells.reduce((s, c) => s + c[0], 0) / seg.cells.length;
    const cy = seg.cells.reduce((s, c) => s + c[1], 0) / seg.cells.length;
    let best = seg.cells[0];
    let bestD = Infinity;
    for (const c of seg.cells) {
      const d = (c[0] - cx) ** 2 + (c[1] - cy) ** 2 - (seg.k === 'V' ? clearance(c[0], c[1], idx) * 40 : 0);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    seg.anchor = best;
    // a lane that stops on the tile (at a hub, an array, a station or a wormhole): the square it stops on
    if (seg.k === 'L' && seg.sides.length === 1) {
      const [px, py] = portCell(seg.sides[0], 1);
      let far = [px, py];
      let farD = -1;
      for (const c of seg.cells) {
        const d = Math.abs(c[0] - px) + Math.abs(c[1] - py);
        if (d > farD) {
          farD = d;
          far = c;
        }
      }
      seg.end = far;
    }
  }
  const edges = [0, 1, 2, 3].map((side) => {
    const [x, y] = portCell(side, 1);
    return KIND_OF[ch(x, y)] || 'V';
  });
  return { rows, segAt, segs, edges };
}

const TILES = {};
for (const d of DEFS) {
  const shapes = [];
  let rows = d.rows;
  for (let r = 0; r < 4; r++) {
    shapes.push(shapeOf(rows));
    rows = rotate(rows);
  }
  // turns that look different (a crossroads looks the same every way round)
  const seen = new Set();
  const uniq = [];
  shapes.forEach((s, r) => {
    const key = s.rows.join('');
    if (!seen.has(key)) {
      seen.add(key);
      uniq.push(r);
    }
  });
  TILES[d.id] = { ...d, shapes, uniq };
}

// checks a tile is drawn properly: each edge is all station, all void, or void-lane-void
function checkTile(id) {
  const problems = [];
  for (const [r, s] of TILES[id].shapes.entries()) {
    for (let side = 0; side < 4; side++) {
      const kinds = [0, 1, 2].map((i) => {
        const [x, y] = portCell(side, i);
        return KIND_OF[s.rows[y][x]];
      });
      const e = s.edges[side];
      const ok = e === 'S' ? kinds.every((k) => k === 'S') : e === 'L' ? kinds[0] === 'V' && kinds[2] === 'V' : kinds.every((k) => k === 'V');
      if (!ok) problems.push(`${id} turn ${r}: side ${SIDES[side]} is mixed (${kinds.join('')})`);
    }
    for (const seg of s.segs) if (seg.k === 'V' && !seg.ports.length) problems.push(`${id} turn ${r}: a pocket of void with no way out`);
  }
  return problems;
}

module.exports = { N, SIDES, TILES, DEFS, START_TILE, portCell, rotate, checkTile };

// Star Charters: the tiles, every rule (edges, lanes, stations, arrays, the void, wormholes, black holes, anomalies,
// fuel), the robots, a live game over the socket, and the client's pieces fitting together.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const { TILES, DEFS, checkTile } = require('../server/charters/tiles');
const { Board, featureValue, winnersOf } = require('../server/charters/board');
const data = require('../server/charters/data');
const { ChartersGame } = require('../server/charters/engine');

function seeded(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// the index of the piece of a tile (turned r times) of kind k on these sides
const segOf = (t, r, k, sides = null) =>
  TILES[t].shapes[r].segs.findIndex((s) => s.k === k && (!sides || (s.sides.length === sides.length && sides.every((x) => s.sides.includes(x)))));

// a table of two people (nobody acts by themselves), with a board and a bag set up by hand
function table({ bag = [], players = 2, settings = {} } = {}) {
  const g = new ChartersGame('TEST', { rng: seeded(3), pace: 0 });
  Object.assign(g.settings, settings);
  for (let i = 0; i < players; i++) g.addPlayer(`P${i}`);
  g.start(g.players[0].id);
  g.players.sort((a, b) => a.name.localeCompare(b.name));
  g.recolour();
  g.board = new Board();
  g.board.add('dock', 0, 0, 0);
  g.anomalies = [];
  g.bag = bag.slice().reverse(); // (the bag is drawn from the end)
  g.startTurn(0);
  return g;
}
const [P0, P1] = [0, 1];
const pid = (g, i) => g.players[i].id;
const settle = () => new Promise((r) => setImmediate(r));

test('the tiles: every one drawn properly, 75 in Classic and 38 in a Sprint, wormholes in twins', () => {
  for (const d of DEFS) assert.deepStrictEqual(checkTile(d.id), [], d.id);
  assert.strictEqual(DEFS.reduce((s, d) => s + d.count, 1), 75);
  assert.strictEqual(DEFS.reduce((s, d) => s + d.sprint, 1), 38);
  for (const d of DEFS.filter((x) => x.pair)) {
    assert.strictEqual(d.count, 2, `${d.id}: two in Classic`);
    assert.strictEqual(d.sprint, 2, `${d.id}: two in a Sprint`);
    assert.strictEqual(TILES[d.id].shapes[0].segs.filter((s) => s.portal).length, 1, `${d.id} has one wormhole`);
  }
  // a crossroads looks the same every way round; a bend has four different turns
  assert.deepStrictEqual(TILES.cross.uniq, [0]);
  assert.deepStrictEqual(TILES.bend.uniq, [0, 1, 2, 3]);
  // turning a tile turns its edges
  assert.strictEqual(TILES.dock.shapes[0].edges.join(''), 'SLVL');
  assert.strictEqual(TILES.dock.shapes[1].edges.join(''), 'LSLV');
  // a straight lane has void on both sides that does not join up
  const lane = TILES.lane.shapes[0];
  assert.strictEqual(lane.segs.filter((s) => s.k === 'V').length, 2);
  // the client gets every turn of every tile, with a 49-square map of its pieces
  for (const t of data.CLIENT_DATA.tiles) for (const s of t.shapes) assert.strictEqual(s.segAt.length, 49);
});

test('placing: a tile must touch the map and every edge must match', () => {
  const b = new Board();
  b.add('dock', 0, 0, 0);
  assert.ok(!b.fits('lane', 5, 5, 0), 'not touching');
  assert.ok(!b.fits('lane', 0, 0, 0), 'not on top of another tile');
  assert.ok(b.fits('lane', 1, 0, 1), 'a lane turned east-west continues the lane');
  assert.ok(!b.fits('lane', 1, 0, 0), 'a north-south lane does not meet a lane edge');
  assert.ok(b.fits('cap', 0, -1, 2), 'a station facing down closes the station');
  assert.ok(!b.fits('cap', 0, -1, 0), 'void cannot meet a station edge');
  const spots = b.placements('cap').map((p) => `${p.x},${p.y},${p.r}`);
  assert.ok(spots.includes('0,-1,2'));
  assert.ok(!spots.some((s) => s.startsWith('0,0')));
});

test('a lane is finished when both ends stop, and scores a point a tile for the most probes', async () => {
  const g = table({ bag: ['tee', 'tee', 'lane', 'lane'] });
  const [a, b] = g.players;
  assert.strictEqual(g.turn.pid, a.id);
  const stub = segOf('tee', 0, 'L', [3]);
  g.act(a.id, { type: 'place', x: 1, y: 0, r: 0, deploy: { x: 1, y: 0, seg: stub } });
  assert.strictEqual(a.probes, data.PROBES - 1);
  await settle();
  assert.strictEqual(g.turn.pid, b.id);
  g.act(b.id, { type: 'place', x: -1, y: 0, r: 0 });
  // tee, dock, tee: three tiles, both ends at hubs
  assert.strictEqual(a.score, 3);
  assert.strictEqual(a.probes, data.PROBES, 'the probe came home');
  assert.ok(g.log.some((l) => l.k === 'score' && l.fk === 'L' && l.pts === 3 && l.pids[0] === a.id));
  g.destroy();
});

test('a station sealed by the tile that claims it scores at once: 2 a tile, 2 a reactor core', async () => {
  const g = table({ bag: ['corner-core', 'lane'] });
  const [a] = g.players;
  // a reactor wedge turned to face down and left cannot close the dock's station on its own; the plain cap can
  const b = new Board();
  b.add('dock', 0, 0, 0);
  b.add('cap', 0, -1, 2);
  const A = b.analyze();
  const st = A.features.find((f) => f.k === 'S');
  assert.ok(st.done);
  assert.strictEqual(featureValue(st), 4);
  // cores: a megastation alone is open on four sides; finished values count its core twice over
  const m = new Board();
  m.add('full', 0, 0, 0);
  const f = m.analyze().features[0];
  assert.strictEqual(f.open, 4);
  assert.strictEqual(featureValue(f), 2, 'unfinished: 1 a tile + 1 a core');
  f.done = true;
  assert.strictEqual(featureValue(f), 4, 'finished: 2 a tile + 2 a core');
  // in the game: the dock's station with a cap placed to close it, claimed as it closes
  const g2 = table({ bag: ['cap', 'lane'] });
  const p = g2.players[0];
  const seg = segOf('cap', 2, 'S');
  g2.act(p.id, { type: 'place', x: 0, y: -1, r: 2, deploy: { x: 0, y: -1, seg } });
  assert.strictEqual(p.score, 4);
  assert.strictEqual(p.probes, data.PROBES);
  g.destroy();
  g2.destroy();
});

test('the most strength wins: the dreadnought counts two, and a tie pays everyone in it', () => {
  const f = { units: [{ pid: 'a' }, { pid: 'b', dread: true }] };
  assert.deepStrictEqual(winnersOf(f).winners, ['b']);
  const tie = { units: [{ pid: 'a' }, { pid: 'b' }, { pid: 'c', dread: false }, { pid: 'a' }] };
  assert.deepStrictEqual(winnersOf(tie).winners, ['a']);
  const even = { units: [{ pid: 'a' }, { pid: 'b' }] };
  assert.deepStrictEqual(winnersOf(even).winners.sort(), ['a', 'b']);
  assert.deepStrictEqual(winnersOf({ units: [] }).winners, []);
});

test('nobody may claim a feature that is already claimed, and only on your turn', async () => {
  const g = table({ bag: ['lane', 'lane', 'lane'] });
  const [a, b] = g.players;
  assert.throws(() => g.act(b.id, { type: 'place', x: 1, y: 0, r: 1 }), /not your turn/);
  assert.throws(() => g.act(a.id, { type: 'place', x: 1, y: 0, r: 0 }), /does not fit/);
  g.act(a.id, { type: 'place', x: 1, y: 0, r: 1, deploy: { x: 1, y: 0, seg: segOf('lane', 1, 'L') } });
  await settle();
  // the lane through the dock is now P0's: P1 cannot put a probe on it from the other end
  const opt = g.turn.options.find((o) => o.x === -1 && o.y === 0);
  assert.ok(opt, 'the lane can be continued');
  assert.ok(!opt.targets.some((t) => t.k === 'L'), 'but not claimed');
  assert.throws(() => g.act(b.id, { type: 'place', x: -1, y: 0, r: 1, deploy: { x: -1, y: 0, seg: segOf('lane', 1, 'L') } }), /cannot send a probe there/);
  g.destroy();
});

test('wormhole twins join what runs into them, and are an open end until both are out', () => {
  const b = new Board();
  b.add('dock', 0, 0, 0);
  b.add('gate', 1, 0, 1); // its lane comes in from the west, from the dock
  let A = b.analyze();
  const laneOfDock = A.featOf(0, segOf('dock', 0, 'L'));
  assert.strictEqual(laneOfDock.open, 2, 'the open west end, and the wormhole with no twin yet');
  assert.ok(!laneOfDock.done);
  b.add('gate', 0, 1, 0); // its twin, lane running south
  A = b.analyze();
  const joined = A.featOf(0, segOf('dock', 0, 'L'));
  assert.strictEqual(joined, A.featOf(2, segOf('gate', 0, 'L')), 'one lane through the wormhole');
  assert.strictEqual(joined.tiles.size, 3);
  assert.strictEqual(joined.open, 2, 'the dock’s west end and the new gate’s south end');
  assert.strictEqual(b.links().length, 1);
});

test('arrays and black holes are finished when all eight tiles round them are there', () => {
  const b = new Board();
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) b.add(x === 0 && y === 0 ? 'hole' : 'array', x, y, 0);
  const A = b.analyze();
  const centre = A.featOf(4, segOf('hole', 0, 'H'));
  assert.ok(centre.done);
  assert.strictEqual(featureValue(centre), 9);
  const corner = A.featOf(0, segOf('array', 0, 'A'));
  assert.ok(!corner.done);
  assert.strictEqual(featureValue(corner), 4, 'one, and one for each of its three neighbours');
});

test('the void pays 3 at the end for every finished station it touches', () => {
  const b = new Board();
  b.add('dock', 0, 0, 0);
  b.add('cap', 0, -1, 2);
  const A = b.analyze();
  const north = A.featOf(0, TILES.dock.shapes[0].segs.findIndex((s) => s.k === 'V' && s.touches.length));
  assert.strictEqual(north.stationsDone, 1);
  assert.strictEqual(featureValue(north, true), 3);
});

test('a black hole lets a tile next to it slingshot a probe onto the tiles round it', async () => {
  const g = table({ bag: ['hole', 'array', 'lane'] });
  const [a, b] = g.players;
  g.act(a.id, { type: 'place', x: 0, y: 1, r: 0 }); // the hole, under the dock
  await settle();
  const opt = g.turn.options.find((o) => o.x === 1 && o.y === 1);
  assert.ok(opt, 'the array fits beside the hole');
  const sling = opt.targets.find((t) => t.assist && t.x === 0 && t.y === 0 && t.k === 'L');
  assert.ok(sling, 'the dock’s lane is in reach of the hole');
  assert.ok(!opt.targets.some((t) => t.assist && t.k === 'V'), 'not the void, though');
  g.act(b.id, { type: 'place', x: 1, y: 1, r: 0, deploy: { x: 0, y: 0, seg: sling.seg } });
  assert.ok(g.board.get(0, 0).units.some((u) => u.pid === b.id), 'the probe landed two tiles away');
  assert.ok(g.log.some((l) => l.k === 'deploy' && l.assist));
  g.destroy();
});

test('thruster fuel calls a probe home instead of sending one', async () => {
  const g = table({ bag: ['lane', 'lane', 'lane', 'lane', 'lane', 'lane', 'lane'] });
  const [a, b] = g.players;
  g.act(a.id, { type: 'place', x: 1, y: 0, r: 1, deploy: { x: 1, y: 0, seg: segOf('lane', 1, 'L') } });
  await settle();
  g.act(b.id, { type: 'place', x: 2, y: 0, r: 1 });
  await settle();
  assert.strictEqual(a.probes, data.PROBES - 1);
  g.act(a.id, { type: 'place', x: 3, y: 0, r: 1, recall: { x: 1, y: 0, seg: segOf('lane', 1, 'L') } });
  assert.strictEqual(a.probes, data.PROBES);
  assert.strictEqual(a.fuel, data.START_FUEL - 1);
  assert.ok(!g.board.get(1, 0).units.length);
  // with no fuel left, it is refused
  a.fuel = 0;
  await settle();
  g.act(b.id, { type: 'place', x: -1, y: 0, r: 1, deploy: { x: -1, y: 0, seg: segOf('lane', 1, 'L') } });
  await settle();
  assert.throws(() => g.act(a.id, { type: 'place', x: 4, y: 0, r: 1, recall: { x: -1, y: 0, seg: segOf('lane', 1, 'L') } }), /out of thruster fuel|no probe there/);
  g.destroy();
});

test('anomalies: landing a tile on one grabs it, and a warp boost gives the same captain another turn', async () => {
  const g = table({ bag: ['lane', 'lane', 'lane', 'lane', 'lane', 'lane'] });
  const [a] = g.players;
  g.anomalies = [{ x: 1, y: 0, kind: 'cache' }];
  g.act(a.id, { type: 'place', x: 1, y: 0, r: 1 });
  assert.strictEqual(a.score, 3);
  assert.ok(!g.anomalies.some((x) => x.x === 1 && x.y === 0));
  await settle();
  g.anomalies = [{ x: 2, y: 0, kind: 'boost' }];
  const b = g.active;
  g.act(b.id, { type: 'place', x: 2, y: 0, r: 1 });
  await settle();
  assert.strictEqual(g.turn.pid, b.id, 'the same captain goes again');
  assert.ok(g.turn.extra);
  g.anomalies = [{ x: 3, y: 0, kind: 'fuel' }];
  g.act(b.id, { type: 'place', x: 3, y: 0, r: 1 });
  assert.strictEqual(b.fuel, data.START_FUEL + 1);
  g.destroy();
});

test('new anomalies appear two squares out from the map, never touching it', () => {
  const g = table({ bag: ['lane'] });
  for (let i = 0; i < 6; i++) g.spawnAnomaly();
  for (const a of g.anomalies) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert.ok(!g.board.get(a.x + dx, a.y + dy), 'not next to a tile');
    assert.ok(Math.abs(a.x) <= 2 && Math.abs(a.y) <= 2);
  }
  g.destroy();
});

test('what each person sees: only the captain whose turn it is gets the places their tile fits', () => {
  const g = table({ bag: ['lane', 'lane'] });
  const a = g.viewFor(pid(g, P0));
  const b = g.viewFor(pid(g, P1));
  assert.ok(a.you.options.length > 0);
  assert.strictEqual(b.you.options, null);
  assert.strictEqual(a.turn.tile, 'lane');
  assert.ok(a.board.tiles.length === 1 && a.board.features.length >= 3);
  const watcher = g.addSpectator('W');
  assert.strictEqual(g.viewFor(watcher.id).you.isSpectator, true);
  g.destroy();
});

test('robot-only games always finish, every probe is accounted for, and the scores add up', async () => {
  for (const [length, seed] of [['sprint', 1], ['sprint', 2], ['classic', 3], ['sprint', 4]]) {
    const g = new ChartersGame('BOTS', { rng: seeded(seed), pace: 0 });
    // keep every log line (the game itself only keeps the last 140)
    const all = [];
    const say = g.say.bind(g);
    g.say = (text, extra = {}) => {
      all.push(extra);
      say(text, extra);
    };
    const host = g.addPlayer('Host');
    for (let i = 0; i < 3; i++) g.addBot(host.id);
    host.isBot = true;
    g.settings.length = length;
    g.start(host.id);
    for (let i = 0; i < 4000 && g.phase === 'playing'; i++) await settle();
    assert.strictEqual(g.phase, 'ended', `${length} game ${seed} finished`);
    assert.strictEqual(g.bag.length, 0);
    assert.ok(g.board.tiles.length > 20);
    // every probe is at home or on the map
    for (const p of g.players) {
      const out = g.board.tiles.reduce((n, t) => n + t.units.filter((u) => u.pid === p.id && !u.dread).length, 0);
      const dread = g.board.tiles.reduce((n, t) => n + t.units.filter((u) => u.pid === p.id && u.dread).length, 0);
      assert.strictEqual(p.probes + out, data.PROBES, `${p.name}'s probes`);
      assert.strictEqual(p.dread + dread, 1, `${p.name}'s dreadnought`);
    }
    // the points scored add up to everyone's total
    const total = all.filter((l) => l.k === 'score' || l.k === 'final').reduce((s, l) => s + l.pts * l.pids.length, 0) + all.filter((l) => l.k === 'anomaly' && l.kind === 'cache').length * 3;
    assert.strictEqual(g.players.reduce((s, p) => s + p.score, 0), total, 'every point came from a score line');
    assert.ok(g.players.some((p) => p.score > 10), 'somebody scored');
    assert.deepStrictEqual(
      g.standings.map((s) => s.score),
      [...g.standings.map((s) => s.score)].sort((a, b) => b - a),
    );
    g.destroy();
  }
});

// ---------------------------------------------------------------------------
// A live game over the socket
// ---------------------------------------------------------------------------
const { server } = require('../server/index');
const { io } = require('socket.io-client');

function listen() {
  return new Promise((resolve) => {
    if (server.listening) return resolve(server.address().port);
    server.once('listening', () => resolve(server.address().port));
  });
}
const get = (port, p) =>
  new Promise((resolve, reject) => {
    http
      .get({ port, path: p }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });

test('the page and data routes, and a live practice table over the socket where the human lays a tile', async () => {
  const port = await listen();
  assert.strictEqual((await get(port, '/charters')).status, 200);
  const json = JSON.parse((await get(port, '/charters-data.json')).body);
  assert.strictEqual(json.tiles.length, DEFS.length);
  const sock = io(`http://localhost:${port}/charters`, { transports: ['websocket'], forceNew: true });
  try {
    let latest = null;
    const waitFor = (fn, ms = 15000) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timed out waiting for the game')), ms);
        const check = () => {
          if (latest && fn(latest)) {
            clearTimeout(timer);
            sock.off('state', check);
            resolve(latest);
          }
        };
        sock.on('state', (s) => {
          latest = s;
          check();
        });
        check();
      });
    sock.emit('create', { name: 'Tester', practice: true, bots: 1, length: 'sprint' }, () => {});
    const first = await waitFor((s) => s.phase === 'playing');
    assert.strictEqual(first.players.length, 2);
    assert.strictEqual(first.settings.length, 'sprint');
    const which = JSON.parse((await get(port, `/api/code?code=${first.code}`)).body);
    assert.strictEqual(which.game, 'charters');
    const mine = await waitFor((s) => s.turn && !s.turn.done && s.turn.pid === s.you.id && s.you.options?.length, 20000);
    const o = mine.you.options[0];
    const before = mine.board.tiles.length;
    const reply = await new Promise((resolve) => sock.emit('act', { type: 'place', x: o.x, y: o.y, r: o.r }, resolve));
    assert.strictEqual(reply.ok, true, reply.error);
    const after = await waitFor((s) => s.board.tiles.length > before);
    assert.ok(after.board.tiles.some((t) => t.x === o.x && t.y === o.y));
    const bad = await new Promise((resolve) => sock.emit('act', { type: 'place', x: 99, y: 99, r: 0 }, resolve));
    assert.strictEqual(bad.ok, false);
  } finally {
    sock.close();
  }
});

// ---------------------------------------------------------------------------
// The client: it only runs in a browser, so these check that its pieces fit together
// ---------------------------------------------------------------------------
const ROOT = path.join(__dirname, '..');
const CLIENT = path.join(ROOT, 'public/js/charters');
const clientFiles = () => {
  const out = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.isDirectory()) walk(path.join(dir, f.name));
      else if (f.name.endsWith('.js')) out.push(path.join(dir, f.name));
    }
  };
  walk(CLIENT);
  return out;
};

test('the client is wired together: every import resolves to a real file and a real export', () => {
  const exportsOf = (file) => {
    const src = fs.readFileSync(file, 'utf8');
    const names = new Set([...src.matchAll(/export\s+(?:async\s+)?(?:const|let|function|class)\s+([\w$]+)/g)].map((m) => m[1]));
    for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) for (const part of m[1].split(',')) names.add(part.trim().split(/\s+as\s+/).pop());
    return names;
  };
  assert.ok(clientFiles().length >= 18);
  for (const file of clientFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.{1,2}\/[^']+)'/g)) {
      const target = path.join(path.dirname(file), m[2]);
      assert.ok(fs.existsSync(target), `${path.relative(ROOT, file)} imports ${m[2]}, which does not exist`);
      const have = exportsOf(target);
      for (const raw of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
        const name = raw.split(/\s+as\s+/)[0];
        assert.ok(have.has(name), `${path.relative(ROOT, file)} imports { ${name} } from ${m[2]}, which does not export it`);
      }
    }
  }
});

test('no screen calls a shared helper it forgot to import (a missing import only blows up when the button is clicked)', () => {
  const namesIn = (src) => new Set([...src.matchAll(/export\s+(?:async\s+)?(?:const|let|function|class)\s+([\w$]+)/g)].map((m) => m[1]));
  const vocabulary = new Set();
  for (const file of [...clientFiles(), path.join(ROOT, 'public/js/util.js')]) for (const n of namesIn(fs.readFileSync(file, 'utf8'))) vocabulary.add(n);
  assert.ok(vocabulary.has('unlock') && vocabulary.has('el') && vocabulary.has('sfx') && vocabulary.has('tileArt'));
  for (const file of clientFiles()) {
    const src = fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/^(\s+)(?:static\s+|async\s+|get\s+|set\s+)*[\w$]+(\([^)]*\)\s*\{)/gm, '$1$2');
    const imported = new Set();
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from/g)) for (const part of m[1].split(',')) imported.add(part.trim().split(/\s+as\s+/).pop());
    for (const m of src.matchAll(/import\s+(?:\*\s+as\s+)?([\w$]+)\s+from/g)) imported.add(m[1]);
    for (const name of vocabulary) {
      if (['clamp', 'lerp', 'clear', 'player', 'me', 'banner', 'mats', 'seeded'].includes(name)) continue; // (also plain words in comments and methods)
      const esc = name.replace(/\$/g, '\\$');
      if (!new RegExp(`(?<![.\\w$'"\`])${esc}\\(`).test(src)) continue;
      const declared = new RegExp(`\\b(?:function|const|let|var|class)\\s+${esc}\\b`).test(src);
      assert.ok(imported.has(name) || declared, `${path.relative(ROOT, file)} calls ${name}() but never imports or defines it`);
    }
  }
});

test('every icon the screens ask for is drawn in ui.js, and every sound exists in sound.js', () => {
  const ui = fs.readFileSync(path.join(CLIENT, 'ui.js'), 'utf8');
  const drawn = new Set([...ui.slice(ui.indexOf('const ICONS'), ui.indexOf('export function icon')).matchAll(/^\s+(\w+):\s*'/gm)].map((m) => m[1]));
  for (const file of clientFiles()) for (const m of fs.readFileSync(file, 'utf8').matchAll(/\bicon\('(\w+)'/g)) assert.ok(drawn.has(m[1]), `${path.relative(ROOT, file)} uses the icon "${m[1]}", which is not drawn`);
  const sounds = fs.readFileSync(path.join(CLIENT, 'sound.js'), 'utf8');
  const body = sounds.slice(sounds.indexOf('const SOUNDS = {'), sounds.indexOf('export function sfx'));
  const known = new Set([...body.matchAll(/^ {2}(\w+): /gm)].map((m) => m[1]));
  const asked = new Map();
  for (const file of clientFiles()) for (const m of fs.readFileSync(file, 'utf8').matchAll(/\bsfx\('([\w-]+)'/g)) asked.set(m[1], path.relative(ROOT, file));
  for (const [name, where] of asked) assert.ok(known.has(name), `${where} plays the sound "${name}", which sound.js does not make`);
  assert.ok(asked.size >= 18, 'the check found the sounds');
});

test('the page has the start screen, a look of its own and every element the scripts look up', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/charters.html'), 'utf8');
  assert.ok(html.includes('/css/charters.css') && fs.existsSync(path.join(ROOT, 'public/css/charters.css')));
  for (const other of ['/css/ruler', '/css/bonanza', '/css/style.css']) assert.ok(!html.includes(other), `it does not borrow ${other}`);
  assert.ok(html.includes('/js/charters/main.js'));
  const splash = fs.readFileSync(path.join(CLIENT, 'splash.js'), 'utf8');
  for (const id of [...splash.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1])) assert.ok(html.includes(`id="${id}"`), `charters.html has #${id}`);
  for (const id of ['stage', 'labels', 'screen-home', 'screen-lobby', 'screen-game', 'layer-fx', 'layer-prompt', 'layer-modal', 'toasts', 'problem', 'warp']) assert.ok(html.includes(`id="${id}"`), `charters.html has #${id}`);
  for (const file of clientFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(!/\/(ruler|bonanza)\//.test(src), `${path.relative(ROOT, file)} does not borrow another game's scene`);
  }
});

test('every log line the screen reacts to is one the engine writes, and the important ones are shown', () => {
  const fx = fs.readFileSync(path.join(CLIENT, 'fx.js'), 'utf8');
  const engine = fs.readFileSync(path.join(ROOT, 'server/charters/engine.js'), 'utf8');
  const written = new Set([...engine.matchAll(/k: (?:final \? '[\w-]+' : )?'([\w-]+)'/g)].map((m) => m[1]));
  written.add('final');
  const handled = [...fx.slice(fx.indexOf('function handle')).matchAll(/case '([\w-]+)':/g)].map((m) => m[1]);
  for (const k of handled) assert.ok(written.has(k), `fx.js reacts to "${k}", which the engine never logs`);
  for (const k of ['turn', 'place', 'deploy', 'score', 'final', 'link', 'anomaly', 'last', 'win']) assert.ok(handled.includes(k), `fx.js shows "${k}"`);
});

test('the arcade page lists Star Charters, counts its tables and takes you back to your seat', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  assert.match(html, /href="\/charters"/);
  assert.match(html, /data-live="charters"/);
  const hub = fs.readFileSync(path.join(ROOT, 'public/js/hub.js'), 'utf8');
  assert.match(hub, /stats\.charters/);
  assert.match(hub, /game: 'charters'/);
  const main = fs.readFileSync(path.join(CLIENT, 'main.js'), 'utf8');
  const key = /SEAT_KEY = '([\w-]+)'/.exec(main)[1];
  assert.ok(hub.includes(`'${key}'`), 'the hub reads the seat key the game saves');
});

test('Starcade: every game on the front page plays a clip that exists, and clips can be fetched in byte ranges', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  assert.match(html, /STAR<span>CADE<\/span>/);
  const clips = [...html.matchAll(/<video[^>]*src="\/assets\/hub\/([\w-]+\.webm)"[^>]*poster="\/assets\/hub\/([\w-]+\.webp)"/g)];
  assert.strictEqual(clips.length, 5, 'one clip per game');
  for (const [, clip, poster] of clips) {
    assert.ok(fs.existsSync(path.join(ROOT, 'public/assets/hub', clip)), clip);
    assert.ok(fs.existsSync(path.join(ROOT, 'public/assets/hub', poster)), poster);
  }
  const port = await listen();
  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: `/assets/hub/${clips[0][1]}`, headers: { Range: 'bytes=0-99' } }, (r) => {
      let n = 0;
      r.on('data', (c) => (n += c.length));
      r.on('end', () => resolve({ status: r.statusCode, type: r.headers['content-type'], range: r.headers['content-range'], n }));
    }).on('error', reject);
  });
  assert.strictEqual(res.status, 206);
  assert.strictEqual(res.type, 'video/webm');
  assert.match(res.range, /^bytes 0-99\/\d+$/);
  assert.strictEqual(res.n, 100);
});

test.after(() => {
  server.close();
});

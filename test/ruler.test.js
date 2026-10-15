// Ruler of the Galaxy: the rules, the robots, and a live game over the socket.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

process.env.PORT = '0'; // the server starts on a free port
process.env.NMS_DATA_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rotg-test-'));

const data = require('../server/ruler/data');
const { RulerGame, tally } = require('../server/ruler/engine');
const { decide } = require('../server/ruler/bots');
const { server } = require('../server/index');
const { io } = require('socket.io-client');

const ROOT = path.join(__dirname, '..');

function seeded(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A galaxy of robots with scripted answers (and dice), for testing one rule at a time.
function galaxy(n = 3, { answers = [], seed = 1, contenders = ['mechanova', 'kraken', 'hive', 'stareater', 'chronos', 'goliath'] } = {}) {
  const queue = { answers: [...answers] };
  const g = new RulerGame('TEST', { rng: seeded(seed), pace: 0, chooser: (game, p, req) => (queue.answers.length ? queue.answers.shift()(game, p, req) : decide(game, p, req)) });
  for (let i = 0; i < n; i++) g.addPlayer(`P${i}`, { isBot: true });
  g.hostId = g.players[0].id;
  g.players.forEach((p, i) => (p.contender = contenders[i]));
  g.setup();
  // keep the seat order the test expects
  g.players.sort((a, b) => contenders.indexOf(a.contender) - contenders.indexOf(b.contender));
  g.queue = queue;
  return g;
}
// put dice on the table for p, as if just rolled
function dice(g, p, faces) {
  g.turn = { pid: p.id, rollsLeft: 0, rolls: 3, dice: faces.map((f) => ({ face: f, kept: true })), rolled: true, stage: 'resolve', damage: 0, lasers: 0 };
}

// ---------------------------------------------------------------------------

test('the data: six contenders with three evolutions each, every card does something the engine knows', () => {
  assert.strictEqual(data.CONTENDERS.length, 6);
  for (const c of data.CONTENDERS) {
    assert.strictEqual(c.evolutions.length, 3, c.id);
    assert.ok(c.perk.key && c.perk.text, c.id);
    assert.match(c.color, /^#[0-9a-f]{6}$/i);
  }
  const engine = fs.readFileSync(path.join(ROOT, 'server/ruler/engine.js'), 'utf8');
  for (const c of data.CARDS) {
    assert.ok(c.cost >= 2 && c.cost <= 8, `${c.id} costs ${c.cost}`);
    if (c.kind === 'keep') assert.ok(engine.includes(`'${c.hook}'`), `the engine never checks the ${c.hook} hook (${c.id})`);
    else for (const [step] of c.fx) assert.ok(engine.includes(`case '${step}':`), `the engine has no "${step}" step (${c.id})`);
  }
  for (const e of data.CONTENDERS.flatMap((c) => c.evolutions)) assert.ok(engine.includes(`'${e.id}'`), `the engine never uses the ${e.id} evolution`);
  assert.ok(data.CARDS.length >= 30);
  const ids = [...data.CARDS, ...data.CONTENDERS, ...data.CONTENDERS.flatMap((c) => c.evolutions), ...data.ANOMALIES].map((x) => x.id);
  assert.deepStrictEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], 'duplicate ids');
});

test('the 3D models: every model the scene loads exists, and every model file is used', () => {
  const dir = path.join(ROOT, 'public/assets/models/ruler');
  const scene = ['scene/ships.js', 'scene/arena.js'].map((f) => fs.readFileSync(path.join(ROOT, 'public/js/ruler', f), 'utf8')).join('\n');
  const asked = new Set([...scene.matchAll(/ruler\/([A-Za-z_]+)/g)].map((m) => m[1]));
  // the asteroid belt builds its names from a list
  for (const m of scene.matchAll(/'((?:rock|rocks|meteor)[A-Za-z_]*)'/g)) asked.add(m[1]);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4));
  for (const id of asked) assert.ok(files.includes(id), `ruler/${id}.glb is missing`);
  for (const id of files) assert.ok(asked.has(id), `ruler/${id}.glb is never used`);
  assert.ok(fs.existsSync(path.join(ROOT, 'public/assets/models/characters/anims.glb')));
});

test('triplets score Stars (each extra matching die adds one), in the right order with everything else', async () => {
  const g = galaxy(2);
  const [a] = g.players;
  dice(g, a, ['3', '3', '3', '3', '1', '2']);
  await g.resolve(a);
  assert.strictEqual(a.stars, 4 + 1, 'four 3s = 4 Stars, plus 1 for entering the empty Core');
  assert.strictEqual(a.where, 'core');
  const c = tally([{ face: '1' }, { face: '1' }, { face: 'laser' }]);
  assert.deepStrictEqual([c[1], c.laser, c.shard], [2, 1, 0]);
});

test('repairs heal outside the Core only, never above the maximum', async () => {
  const g = galaxy(2);
  const [a, b] = g.players;
  a.hull = 5;
  g.core = b.id;
  b.where = 'core';
  dice(g, a, ['repair', 'repair', '1', '2', '3', 'shard']);
  await g.resolve(a);
  assert.strictEqual(a.hull, 7);
  b.hull = 4;
  dice(g, b, ['repair', 'repair', 'repair', '1', '2', 'shard']);
  g.settings.evolutions = false;
  await g.resolve(b);
  assert.strictEqual(b.hull, 4, 'radiation lock: no repairs inside the Core');
  a.hull = a.maxHull - 1;
  dice(g, a, ['repair', 'repair', 'repair', '1', '2', 'shard']);
  await g.resolve(a);
  assert.strictEqual(a.hull, a.maxHull);
});

test('lasers from outside hit only the Core; lasers from the Core hit everyone outside', async () => {
  const g = galaxy(3);
  const [a, b, c] = g.players;
  g.core = a.id;
  a.where = 'core';
  dice(g, b, ['laser', 'laser', '1', '2', '3', 'shard']);
  g.queue.answers.push(() => ({ yield: false }));
  await g.resolve(b);
  assert.strictEqual(a.hull, a.maxHull - 2);
  assert.strictEqual(c.hull, c.maxHull, 'the other ship outside is not hit');
  dice(g, a, ['laser', 'laser', 'laser', '1', '2', 'shard']);
  await g.resolve(a);
  assert.strictEqual(b.hull, b.maxHull - 3);
  assert.strictEqual(c.hull, c.maxHull - 3);
});

test('yielding: the hit ship warps out and the attacker takes its seat (and the entry Star)', async () => {
  const g = galaxy(3);
  const [a, b] = g.players;
  g.core = a.id;
  a.where = 'core';
  g.queue.answers.push(() => ({ yield: true }));
  dice(g, b, ['laser', '1', '2', '3', 'shard', 'shard']);
  await g.resolve(b);
  assert.strictEqual(a.where, 'rim');
  assert.strictEqual(g.core, b.id);
  assert.strictEqual(b.where, 'core');
  assert.strictEqual(b.stars, 1);
  // holding the Core pays at the start of your next turn
  g.queue.answers.push(() => ({ action: 'roll', keep: [] }), () => ({ action: 'resolve' }), () => ({ action: 'done' }));
  const before = b.stars;
  b.cards = [];
  await g.takeTurn(b);
  assert.ok(b.stars >= before + 2, 'two Stars for starting a turn in the Core');
});

test('Siege Mode refuses a yield above 3 Hull, and the Kraken can grapple a yielding ship', async () => {
  const g = galaxy(2);
  const [mech, kraken] = g.players;
  g.core = mech.id;
  mech.where = 'core';
  mech.evolutions.push('siege');
  assert.ok(g.validate({ type: 'yield', pid: mech.id }, { yield: true }));
  mech.hull = 3;
  assert.strictEqual(g.validate({ type: 'yield', pid: mech.id }, { yield: true }), null);
  kraken.evolutions.push('grapple');
  kraken.shards = 5;
  g.queue.answers.push(() => ({ yield: true }), () => ({ grapple: true }));
  dice(g, kraken, ['laser', '1', '2', '3', 'shard', 'repair']);
  await g.resolve(kraken);
  assert.strictEqual(g.core, mech.id, 'still trapped inside');
  assert.strictEqual(kraken.shards, 5 - 2 + 1, 'paid 2 for the grapple, then gained a Shard');
});

test('the Binary Pulsar: a second seat with 5 players, collapsing when only four are left', async () => {
  const g = galaxy(5);
  assert.ok(g.pulsarOpen);
  const [a, b, c] = g.players;
  dice(g, a, ['1', '2', '3', '1', '2', 'shard']);
  await g.resolve(a);
  assert.strictEqual(g.core, a.id);
  dice(g, b, ['1', '2', '3', '1', '2', 'shard']);
  g.queue.answers.push(() => ({ yield: false }));
  await g.resolve(b);
  assert.strictEqual(g.pulsar, b.id, 'the Core is taken, so the Pulsar must be');
  assert.strictEqual(b.stars, 1);
  c.hull = 1;
  g.hurt(c, 5, a, 'laser');
  assert.ok(!c.alive);
  assert.ok(!g.pulsarOpen, 'four left: the Pulsar collapses');
  assert.strictEqual(b.where, 'rim');
});

test('a destroyed ship becomes a ghost; the last ship flying wins', async () => {
  const g = galaxy(2);
  const [a, b] = g.players;
  g.core = a.id;
  a.where = 'core';
  a.hull = 2;
  dice(g, b, ['laser', 'laser', 'laser', '1', '2', 'shard']);
  await g.resolve(b);
  assert.ok(!a.alive && a.ghost);
  assert.strictEqual(g.core, null);
  assert.strictEqual(g.winner, b.id);
  assert.strictEqual(g.winKind, 'survivor');
});

test('reaching the Star target wins at once', async () => {
  const g = galaxy(3);
  const [a] = g.players;
  a.stars = 18;
  g.core = g.players[1].id;
  g.players[1].where = 'core';
  dice(g, a, ['2', '2', '2', '1', 'shard', 'shard']);
  await g.resolve(a);
  assert.strictEqual(g.winner, a.id);
  assert.strictEqual(g.winKind, 'stars');
});

test('three repairs evolve your contender: Magma Carapace raises the maximum Hull', async () => {
  const g = galaxy(6);
  const goliath = g.players.find((p) => p.contender === 'goliath');
  g.core = g.players[0].id;
  g.players[0].where = 'core';
  g.pulsar = g.players[1].id;
  g.players[1].where = 'pulsar';
  goliath.hull = 6;
  g.queue.answers.push((game, p, req) => {
    assert.strictEqual(req.type, 'evolve');
    assert.deepStrictEqual(req.options.map((o) => o.id), ['impactors', 'magma', 'bombard']);
    return { id: 'magma' };
  });
  dice(g, goliath, ['repair', 'repair', 'repair', '1', '2', 'shard']);
  await g.resolve(goliath);
  assert.strictEqual(goliath.maxHull, 12);
  assert.strictEqual(goliath.hull, 6 + 3 + 2);
  assert.deepStrictEqual(goliath.evolutions, ['magma']);
});

test('the Bazaar: prices, discounts, flushing, Augments and Directives', async () => {
  const g = galaxy(3);
  const [mech, , hive] = g.players;
  g.market = [{ uid: 'x1', id: 'railgun' }, { uid: 'x2', id: 'claim' }, { uid: 'x3', id: 'storm' }];
  mech.shards = 20;
  assert.strictEqual(g.price(mech, 'railgun'), 5);
  g.anomaly = 'convoy';
  assert.strictEqual(g.price(mech, 'railgun'), 3);
  g.anomaly = null;
  assert.strictEqual(g.flushCost(mech), 2);
  assert.strictEqual(g.flushCost(hive), 1);
  g.turn = { pid: mech.id, stage: 'buy', dice: [], rolled: true };
  g.queue.answers.push(() => ({ action: 'buy', uid: 'x1' }), () => ({ action: 'buy', uid: 'x2' }), () => ({ action: 'flush' }), () => ({ action: 'done' }));
  await g.shop(mech);
  assert.ok(mech.cards.some((c) => c.id === 'railgun'), 'an Augment stays on the ship');
  assert.strictEqual(mech.stars, 2, 'a Directive happens at once');
  assert.strictEqual(mech.shards, 20 - 5 - 4 - 2);
  assert.strictEqual(g.market.length, 3);
  // the railgun adds one to every laser attack
  g.core = hive.id;
  hive.where = 'core';
  g.queue.answers.push(() => ({ yield: false }));
  dice(g, mech, ['laser', '1', '2', '3', 'shard', 'repair']);
  await g.resolve(mech);
  assert.strictEqual(hive.hull, hive.maxHull - 2);
});

test('Goliath never loses Stars; Ablative Plating ignores a hit of exactly 1', () => {
  const g = galaxy(6);
  const goliath = g.players.find((p) => p.contender === 'goliath');
  goliath.stars = 5;
  g.loseStars(goliath, 3, g.players[0], 'test');
  assert.strictEqual(goliath.stars, 5);
  const mech = g.players[0];
  mech.cards.push({ uid: 'a', id: 'ablative' });
  assert.strictEqual(g.hurt(mech, 1, goliath, 'laser'), 0);
  assert.strictEqual(g.hurt(mech, 2, goliath, 'laser'), 2);
});

test('robot-only galaxies always finish, and nobody ends up with impossible numbers', async () => {
  for (let s = 1; s <= 70; s++) {
    const n = 2 + (s % 5);
    const g = new RulerGame('SIM', { rng: seeded(s), pace: 0, chooser: (game, p, req) => decide(game, p, req) });
    for (let i = 0; i < n; i++) g.addPlayer(`B${i}`, { isBot: true });
    g.hostId = g.players[0].id;
    g.settings.anomalies = s % 2 === 0;
    g.settings.blitz = s % 7 === 0;
    g.setup();
    await g.run();
    assert.strictEqual(g.phase, 'ended', `seed ${s}`);
    assert.ok(g.winner, `seed ${s} has a winner`);
    for (const p of g.players) {
      assert.ok(p.hull >= 0 && p.hull <= p.maxHull && p.maxHull <= 12, `seed ${s}: hull ${p.hull}/${p.maxHull}`);
      assert.ok(p.shards >= 0 && p.stars >= 0, `seed ${s}: shards ${p.shards} stars ${p.stars}`);
      if (!p.alive) assert.strictEqual(p.where, 'rim');
    }
    const inside = g.players.filter((p) => p.where !== 'rim');
    assert.ok(inside.length <= 2);
  }
});

// ---------------------------------------------------------------------------
// Over the wire
// ---------------------------------------------------------------------------
async function listen() {
  if (!server.listening) await new Promise((r) => server.once('listening', r));
  return server.address().port;
}
const get = (port, p) =>
  new Promise((resolve, reject) => {
    http.get({ port, path: p }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });

test('the page, its data and a live practice galaxy over the socket', async () => {
  const port = await listen();
  const page = await get(port, '/ruler');
  assert.strictEqual(page.status, 200);
  assert.match(page.body, /Ruler of the Galaxy/);
  const json = JSON.parse((await get(port, '/ruler-data.json')).body);
  assert.strictEqual(json.contenders.length, 6);
  const sock = io(`http://localhost:${port}/ruler`, { transports: ['websocket'], forceNew: true });
  try {
    const state = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no state')), 5000);
      sock.on('state', (s) => {
        if (s.phase === 'playing') {
          clearTimeout(timer);
          resolve(s);
        }
      });
      sock.emit('create', { name: 'Tester', practice: true, bots: 2, contender: 'chronos' }, () => {});
    });
    assert.strictEqual(state.players.length, 3);
    const me = state.players.find((p) => p.id === state.you.id);
    assert.strictEqual(me.contender, 'chronos');
    assert.strictEqual(me.name, 'Tester');
    const code = state.code;
    const which = JSON.parse((await get(port, `/api/code?code=${code}`)).body);
    assert.strictEqual(which.game, 'ruler');
  } finally {
    sock.close();
  }
});

test.after(() => {
  server.close();
});

// ---------------------------------------------------------------------------
// The menus: the start screen, main menu, contender select, lobby and settings
// ---------------------------------------------------------------------------

const CLIENT = path.join(ROOT, 'public/js/ruler');
const clientFiles = () => {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name));
      else if (e.name.endsWith('.js')) out.push(path.join(dir, e.name));
    }
  };
  walk(CLIENT);
  return out;
};

test('the contender select has what it shows: four stats from 1 to 5 and a difficulty for every contender', () => {
  for (const c of data.CONTENDERS) {
    for (const k of ['firepower', 'armour', 'economy', 'control']) assert.ok(c.stats[k] >= 1 && c.stats[k] <= 5, `${c.id} ${k}`);
    assert.ok([1, 2, 3].includes(c.difficulty), `${c.id} difficulty`);
  }
  assert.ok(data.CLIENT_DATA.contenders.every((c) => c.stats && c.difficulty), 'the stats reach the browser');
});

test('the client is wired together: every import resolves to a real file and a real export', () => {
  const exportsOf = (file) => {
    const src = fs.readFileSync(file, 'utf8');
    const names = new Set([...src.matchAll(/export\s+(?:async\s+)?(?:const|let|function|class)\s+([\w$]+)/g)].map((m) => m[1]));
    for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) for (const part of m[1].split(',')) names.add(part.trim().split(/\s+as\s+/).pop());
    return names;
  };
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

test('every icon the screens ask for is drawn in ui.js', () => {
  const ui = fs.readFileSync(path.join(CLIENT, 'ui.js'), 'utf8');
  const drawn = new Set([...ui.slice(ui.indexOf('const ICONS'), ui.indexOf('export function icon')).matchAll(/^\s+(\w+):\s*'/gm)].map((m) => m[1]));
  assert.ok(drawn.size >= 20);
  for (const file of clientFiles()) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/\bicon\('(\w+)'/g)) assert.ok(drawn.has(m[1]), `${path.relative(ROOT, file)} uses the icon "${m[1]}", which is not drawn`);
  }
});

test('the page has the start screen and both stylesheets, and the logo is shared by the title menu', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/ruler.html'), 'utf8');
  for (const css of ['/css/ruler.css', '/css/ruler-menus.css']) {
    assert.ok(html.includes(css), `${css} is linked`);
    assert.ok(fs.existsSync(path.join(ROOT, 'public', css)), `${css} exists`);
  }
  const splash = fs.readFileSync(path.join(CLIENT, 'splash.js'), 'utf8');
  for (const id of [...splash.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1])) assert.ok(html.includes(`id="${id}"`), `ruler.html has #${id}`);
  assert.ok(html.includes('id="warp"') && html.includes('class="logo-lockup"'));
});

test('the settings are remembered and bounded, and old sound switches are carried over', () => {
  const src = fs.readFileSync(path.join(CLIENT, 'settings.js'), 'utf8');
  assert.match(src, /rotg-settings/);
  for (const key of ['master', 'music', 'effects', 'muted', 'quality', 'shake']) assert.match(src, new RegExp(`${key}:`), `${key} has a default`);
  assert.match(src, /rotg-sound/, 'the first version\'s sound switch is still read');
});

test('no screen calls a shared helper it forgot to import (a missing import only blows up when the button is clicked)', () => {
  const namesIn = (src) => new Set([...src.matchAll(/export\s+(?:async\s+)?(?:const|let|function|class)\s+([\w$]+)/g)].map((m) => m[1]));
  // everything the client modules (and the shared util.js) export
  const vocabulary = new Set();
  for (const file of [...clientFiles(), path.join(ROOT, 'public/js/util.js')]) for (const n of namesIn(fs.readFileSync(file, 'utf8'))) vocabulary.add(n);
  assert.ok(vocabulary.has('unlock') && vocabulary.has('el') && vocabulary.has('sfx'));
  for (const file of clientFiles()) {
    const src = fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/^(\s+)(?:static\s+|async\s+|get\s+|set\s+)*[\w$]+(\([^)]*\)\s*\{)/gm, '$1$2'); // (a class method's own name is not a call)
    const imported = new Set();
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from/g)) for (const part of m[1].split(',')) imported.add(part.trim().split(/\s+as\s+/).pop());
    for (const m of src.matchAll(/import\s+(?:\*\s+as\s+)?([\w$]+)\s+from/g)) imported.add(m[1]);
    for (const name of vocabulary) {
      if (['clamp', 'lerp', 'clear', 'step'].includes(name)) continue; // (also names in shaders and methods: too easy to mistake)
      const esc = name.replace(/\$/g, '\\$');
      if (!new RegExp(`(?<![.\\w$'"\`])${esc}\\(`).test(src)) continue; // not called here
      const declared = new RegExp(`\\b(?:function|const|let|var|class)\\s+${esc}\\b`).test(src);
      assert.ok(imported.has(name) || declared, `${path.relative(ROOT, file)} calls ${name}() but never imports or defines it`);
    }
  }
});

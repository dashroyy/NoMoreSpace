// Phase to Space: the cards, the rules, the robots, and the live connection. Run with: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

process.env.PORT = '0';
process.env.PTS_TEST_PACE = '0.01'; // every pause in a live Phase to Space game is almost nothing
const os = require('os');
process.env.NMS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pts-test-'));

const cards = require('../server/phase/cards');
const { PhaseGame, STEPS } = require('../server/phase/engine');
const { decide } = require('../server/phase/bots');
const { server, io: ioServer } = require('../server/index');
const { io } = require('socket.io-client');

const ROOT = path.join(__dirname, '..');
const def = cards.def;

// a small seeded random number generator, so a failing game can be replayed
function seeded(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A table of robots with a script for the dice and for every choice: for testing one rule at a time.
function table(n = 3, { dice = [], answers = [], seed = 1 } = {}) {
  const queue = { dice: [...dice], answers: [...answers] };
  const g = new PhaseGame('TEST', { rng: seeded(seed), pace: 0, chooser: (game, p, req) => (queue.answers.length ? queue.answers.shift()(game, p, req) : decide(game, p, req)) });
  g.d6 = () => (queue.dice.length ? queue.dice.shift() : 1 + Math.floor(g.r() * 6));
  for (let i = 0; i < n; i++) g.addPlayer(`P${i}`, { isBot: true });
  g.hostId = g.players[0].id;
  g.setup();
  g.phase = 'playing';
  g.players.forEach((p, i) => {
    p.captain = { id: ['juno', 'xan', 'rex', 'dolly', 'silas', 'obi'][i] };
    p.hand = [];
  });
  g.turn = { pid: g.players[0].id, ap: 3, maxAp: 3, n: 1 };
  g.queue = queue;
  return g;
}
const card = (g, id) => ({ uid: g.uid(), id });
const crewOf = (g, p, id, extra = {}) => {
  const c = { uid: g.uid(), id, gear: null, shield: false, used: false, ...extra };
  p.crew.push(c);
  return c;
};
const pick = (...keys) => () => ({ keys });

// ---------------------------------------------------------------------------
// The cards
// ---------------------------------------------------------------------------

test('every card has a unique id, a portrait, and a deck of the right size', () => {
  const all = [...cards.CAPTAINS, ...cards.CREW, ...cards.GEAR, ...cards.PROTOCOLS, ...cards.BOOSTS, cards.CHALLENGE, ...cards.BEASTS];
  assert.strictEqual(new Set(all.map((c) => c.id)).size, all.length, 'ids are unique across all kinds');
  for (const c of all) assert.ok(fs.existsSync(path.join(ROOT, 'public/assets/phase/art', `${c.id}.webp`)), `portrait for ${c.id}`);
  const deck = cards.deckList();
  assert.strictEqual(deck.length, 93);
  assert.strictEqual(cards.CREW.length, 36);
  for (const cls of cards.CLASS_IDS) assert.strictEqual(cards.CREW.filter((c) => c.cls === cls).length, 6, `six ${cls} Crew cards`);
  assert.strictEqual(cards.BEASTS.length, 15);
  assert.strictEqual(cards.CAPTAINS.length, 12);
});

test('every effect on a card is a step the engine knows', () => {
  for (const c of [...cards.CREW, ...cards.PROTOCOLS]) for (const [name] of c.fx) assert.ok(STEPS[name], `${c.id}: ${name}`);
});

test('Void Beast requirements: classes can use the Captain, "any" slots need real Crew cards', () => {
  const g = table(2);
  const [a] = g.players;
  const wraith = def('wraith'); // a Psion and one more Crew card
  a.captain = { id: 'xan' }; // a Psion Captain
  assert.strictEqual(g.meetsReqs(a, wraith), false, 'the Captain alone is not enough');
  crewOf(g, a, 'slab');
  assert.strictEqual(g.meetsReqs(a, wraith), true, 'Psion Captain + one Crew card');
  a.captain = { id: 'rex' }; // a Marine Captain
  assert.strictEqual(g.meetsReqs(a, wraith), false, 'a Marine Captain and one Marine Crew card is no Psion');
  crewOf(g, a, 'zorp'); // a Psion Crew card
  assert.strictEqual(g.meetsReqs(a, wraith), true, 'Psion Crew card + another Crew card');
  const gnasher = def('gnasher'); // three Crew cards
  assert.strictEqual(g.meetsReqs(a, gnasher), false);
  crewOf(g, a, 'pug');
  assert.strictEqual(g.meetsReqs(a, gnasher), true);
});

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

test('a Crew effect works on the number or higher, and DESTROY skips protected Crew', async () => {
  const g = table(3, { dice: [4, 5] }); // 9 beats Sgt. Slab's 9+
  const [a, b, c] = g.players;
  const victim = crewOf(g, b, 'pug');
  const decoy = crewOf(g, b, 'wobble');
  const shielded = crewOf(g, c, 'ellie', { shield: true });
  const warded = crewOf(g, c, 'quill', { gear: { uid: g.uid(), id: 'plate' } });
  const slab = crewOf(g, a, 'slab');
  let offered = null;
  g.queue.answers.push((game, p, req) => {
    offered = req.options.map((o) => o.key);
    return { keys: [victim.uid] };
  });
  assert.ok(await g.useCrew(a, slab, { how: 'activate' }));
  assert.deepStrictEqual(offered, [victim.uid, decoy.uid], 'only the unprotected Crew cards can be chosen');
  assert.ok(!b.crew.includes(victim), 'it was destroyed');
  assert.ok(g.discard.some((x) => x.uid === victim.uid));
  assert.ok(c.crew.includes(shielded) && c.crew.includes(warded));
});

test('a failed roll does nothing, and a Ticking Bomb then destroys its own Crew card', async () => {
  const g = table(2, { dice: [1, 2] });
  const [a] = g.players;
  const slab = crewOf(g, a, 'slab', { gear: { uid: g.uid(), id: 'bomb' } });
  assert.strictEqual(await g.useCrew(a, slab, { how: 'activate' }), false);
  assert.ok(!a.crew.includes(slab), 'the bomb went off');
});

test('Signal Jam: a tie goes to the Jammer and wastes the card; a lower roll lets it through', async () => {
  for (const [dice, jammed] of [[[3, 4, 3, 4], true], [[6, 6, 1, 2], false]]) {
    const g = table(2, { dice });
    const [a, b] = g.players;
    b.hand = [{ uid: g.uid(), id: 'jam' }];
    const play = { uid: g.uid(), id: 'supply' };
    a.hand = [play];
    g.queue.answers.push((game, p, req) => ({ uid: req.cards[0].uid })); // b jams
    const ok = await g.playFromHand(a, play.uid, { free: false });
    assert.strictEqual(ok, !jammed);
    assert.strictEqual(a.hand.length, jammed ? 0 : 3, jammed ? 'no cards came of it' : 'Supply Drop drew 3');
    assert.strictEqual(g.turn.ap, 2, 'the Energy is spent either way');
    assert.ok(g.discard.some((x) => x.id === 'jam'), 'the Jam card is discarded');
  }
});

test('Boosts change the total, and a Boost on a rival rolls them down', async () => {
  const g = table(2, { dice: [3, 3] });
  const [a, b] = g.players;
  b.hand = [{ uid: 'boostA', id: 'b31' }]; // +3 or -1
  g.queue.answers.push(() => ({ uid: 'boostA', side: a.id, sign: 'down' }), () => ({ pass: true }), () => ({ pass: true }));
  const [res] = await g.rollDice({ kind: 'check', title: 't', need: 6, sides: [{ pid: a.id, bonus: [{ label: 'x', v: 1 }] }] });
  assert.strictEqual(res.total, 3 + 3 + 1 - 1);
  assert.strictEqual(b.hand.length, 0);
});

test('Gear: a Plasma Blaster adds to the roll and Deflector Plate protects from STEAL', async () => {
  const g = table(2);
  const [a, b] = g.players;
  const slab = crewOf(g, a, 'slab', { gear: { uid: g.uid(), id: 'blaster' } });
  assert.deepStrictEqual(g.effectBonus(a, slab).map((x) => x.v), [2], 'the Blaster is the only bonus');
  const target = crewOf(g, b, 'pug', { gear: { uid: g.uid(), id: 'plate' } });
  assert.ok(g.protectedFrom(b, target, 'steal'));
  assert.ok(g.protectedFrom(b, target, 'destroy'));
});

test('a Crew with one of every discipline wins when the turn ends', async () => {
  const g = table(2);
  const [a] = g.players;
  a.captain = { id: 'rex' }; // Marine
  for (const id of ['ellie', 'pug', 'pete', 'zorp', 'karaoke']) crewOf(g, a, id); // Warden, Scout, Smuggler, Psion, Broadcaster
  assert.strictEqual(g.classes(a).size, 6);
  g.queue.answers.push(() => ({ action: 'end' }));
  await g.takeTurn(a);
  assert.strictEqual(g.winner, a.id);
  assert.strictEqual(g.winKind, 'crew');
});

test('slaying the third Void Beast wins; a roll at or under the fail number costs a Crew card', async () => {
  const g = table(2, { dice: [6, 6, 1, 1] });
  const [a] = g.players;
  a.captain = { id: 'rex' };
  for (const id of ['slab', 'pug']) crewOf(g, a, id);
  a.beasts = [{ uid: 'b1', id: 'slug' }, { uid: 'b2', id: 'gloop' }];
  g.beastRow[0] = { uid: 'wanted', id: 'slug' }; // an easy one: 2 Crew cards, slay on 7
  await g.attack(a, 'wanted');
  assert.strictEqual(g.winner, a.id, 'twelve beats seven');
  assert.strictEqual(g.winKind, 'beasts');

  // and the other way: a one and a one is "2": the Beast fights back and the player sacrifices a Crew card
  const h = table(2, { dice: [1, 1] });
  const [b] = h.players;
  for (const id of ['slab', 'pug']) crewOf(h, b, id);
  h.beastRow[0] = { uid: 'w2', id: 'slug' };
  h.queue.answers.push(() => ({ keys: [b.crew[0].uid] }));
  await h.attack(b, 'w2');
  assert.strictEqual(b.crew.length, 1);
  assert.strictEqual(b.beasts.length, 0);
});

test('the Kraken makes destroyed Crew bounce back to the hand', async () => {
  const g = table(2);
  const [a, b] = g.players;
  b.beasts = [{ uid: 'k', id: 'kraken' }];
  const c = crewOf(g, b, 'pug');
  await g.destroyCrew(a, b, c, 'test');
  assert.ok(b.hand.some((x) => x.id === 'pug'), 'back in hand');
  assert.ok(!b.crew.includes(c));
});

test('your own hand is the only one you can see, and others are only a count', () => {
  const g = table(3);
  g.players[0].hand = [{ uid: 'x1', id: 'slab' }];
  g.players[1].hand = [{ uid: 'x2', id: 'pug' }, { uid: 'x3', id: 'jam' }];
  const view = g.viewFor(g.players[0].id);
  assert.deepStrictEqual(view.you.hand.map((c) => c.id), ['slab']);
  assert.strictEqual(view.players[1].handCount, 2);
  assert.ok(!JSON.stringify(view.players).includes('"jam"'), 'nothing of the others hands leaks');
  assert.deepStrictEqual(g.viewFor('nobody').you.hand, [], 'someone watching has no hand');
});

// ---------------------------------------------------------------------------
// The robots play whole games
// ---------------------------------------------------------------------------

async function robotGame(seed, players) {
  const g = new PhaseGame('SIM', { rng: seeded(seed), pace: 0, chooser: decide });
  for (let i = 0; i < players; i++) g.addPlayer(`Bot${i}`, { isBot: true });
  g.hostId = g.players[0].id;
  const total = cards.deckList().length;
  g.start(g.hostId);
  const started = Date.now();
  while (g.phase !== 'ended' && Date.now() - started < 15000 && g.stats.turns < 700) await new Promise((r) => setTimeout(r, 4));
  const onTable = g.deck.length + g.discard.length + g.players.reduce((n, p) => n + p.hand.length + p.crew.reduce((m, c) => m + 1 + (c.gear ? 1 : 0), 0), 0) + (g.stack ? 1 : 0);
  const result = { ended: g.phase === 'ended', winner: g.winner, kind: g.winKind, turns: g.stats.turns, cardsOk: onTable === total, error: g.log.some((l) => l.k === 'error') };
  g.destroy();
  return result;
}

test('robot-only games always finish, never lose a card and never crash', async () => {
  const results = [];
  for (let i = 1; i <= 60; i++) results.push(await robotGame(i, 2 + (i % 5)));
  for (const r of results) {
    assert.ok(r.ended, `game ended (${JSON.stringify(r)})`);
    assert.ok(r.cardsOk, 'every card is still somewhere');
    assert.ok(!r.error, 'no crash');
    assert.ok(r.winner);
  }
});

// ---------------------------------------------------------------------------
// The live connection
// ---------------------------------------------------------------------------

let base;
const clients = [];
test.before(async () => {
  if (!server.listening) await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});
test.after(() => {
  for (const c of clients) c.close();
  ioServer.close();
  server.close();
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await wait(15);
  }
  throw new Error('timed out');
}
function connect() {
  const c = io(`${base}/phase`, { transports: ['websocket'], forceNew: true });
  c.state = null;
  c.on('state', (s) => (c.state = s));
  clients.push(c);
  return new Promise((r) => c.on('connect', () => r(c)));
}
const call = (c, event, data = {}) => new Promise((resolve) => c.emit(event, data, resolve));
const get = (p) =>
  new Promise((resolve) =>
    http.get(base + p, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }),
  );

test('the front page is the game picker and old invite links still reach No More Space', async () => {
  assert.match((await get('/')).body, /Space Arcade/);
  assert.match((await get('/nms')).body, /No More Space/);
  assert.match((await get('/phase')).body, /Phase to Space/);
  const old = await get('/?join=ABCD');
  assert.strictEqual(old.status, 302);
  assert.strictEqual(old.headers.location, '/nms?join=ABCD');
  assert.strictEqual((await get('/?replay=0123456789ab')).headers.location, '/nms?replay=0123456789ab');
  assert.strictEqual(JSON.parse((await get('/api/code?code=ZZZZ')).body).game, null);
  const data = JSON.parse((await get('/phase-data.json')).body);
  assert.strictEqual(data.crew.length, 36);
  assert.ok(JSON.parse((await get('/hub-stats')).body).phase);
});

test('a live Phase to Space game: create, pick a Captain, take turns, and only see your own hand', async () => {
  const me = await connect();
  const joined = new Promise((r) => me.once('joined', r));
  assert.ok((await call(me, 'create', { name: 'Tester', practice: true, bots: 2 })).ok);
  const { code } = await joined;
  assert.match(JSON.parse((await get(`/api/code?code=${code}`)).body).game, /phase/);
  await until(() => me.state?.you.prompts.some((p) => p.type === 'captain'));
  const prompt = me.state.you.prompts.find((p) => p.type === 'captain');
  assert.strictEqual(prompt.options.length, 3);
  assert.ok((await call(me, 'respond', { rid: prompt.rid, answer: { id: prompt.options[1] } })).ok);
  assert.ok(!(await call(me, 'respond', { rid: prompt.rid, answer: { id: prompt.options[0] } })).ok, 'a question is answered once');

  // a stranger can watch, and does not see anyone's cards
  const watcher = await connect();
  assert.ok((await call(watcher, 'join', { code, name: 'Watcher' })).ok);
  await until(() => watcher.state?.phase === 'playing' || watcher.state?.phase === 'captains');

  // play a few turns by ending them (and passing every Signal Jam and Boost)
  let turnsMine = 0;
  const started = Date.now();
  while (turnsMine < 3 && Date.now() - started < 12000 && me.state.phase !== 'ended') {
    const s = me.state;
    for (const p of s.you.prompts) {
      if (p.type === 'action') {
        turnsMine += 1;
        await call(me, 'respond', { rid: p.rid, answer: { action: 'end' } });
      } else if (p.type === 'react' || p.type === 'boost') await call(me, 'respond', { rid: p.rid, answer: { pass: true } });
      else if (p.type === 'pick') await call(me, 'respond', { rid: p.rid, answer: { keys: p.options.slice(0, p.min).map((o) => o.key) } });
    }
    await wait(20);
  }
  assert.ok(turnsMine >= 3 || me.state.phase === 'ended', 'we got to take turns');
  assert.strictEqual(me.state.you.hand.length > 0 || me.state.phase === 'ended', true);
  assert.strictEqual(watcher.state.you.isSpectator, true);
  assert.deepStrictEqual(watcher.state.you.hand, []);
  assert.ok(me.state.log.length > 5, 'the ship log is filling up');
  const others = me.state.players.filter((p) => p.id !== me.state.you.id);
  for (const p of others) assert.strictEqual(p.hand, undefined, 'no hands of other players in the view');

  // chat and a reaction reach everyone
  await call(me, 'chat', { text: 'good luck all' });
  await until(() => watcher.state.chat.some((m) => m.text === 'good luck all'));
});

test('the lobby: a robot can be added, and the host starts the game', async () => {
  const host = await connect();
  const joined = new Promise((r) => host.once('joined', r));
  assert.ok((await call(host, 'create', { name: 'Host' })).ok);
  await joined;
  await until(() => host.state);
  assert.strictEqual(host.state.phase, 'lobby');
  assert.ok(!(await call(host, 'start')).ok, 'one player is not a game');
  assert.ok((await call(host, 'add-bot')).ok);
  await until(() => host.state.players.length === 2);
  assert.ok((await call(host, 'start')).ok);
  await until(() => host.state.phase === 'captains' || host.state.phase === 'playing');
});

// ---------------------------------------------------------------------------
// The icons
// ---------------------------------------------------------------------------

test('the icon atlas matches the icon map (rebuild it with tools/art if this fails) and every icon in the map exists', () => {
  const map = fs.readFileSync(path.join(ROOT, 'public/js/icon-map.js'), 'utf8');
  const fromMap = JSON.parse(map.match(/icons: (\{[^}]*\})/)[1]);
  const atlas = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/icons/atlas.json'), 'utf8'));
  assert.deepStrictEqual(atlas.icons, fromMap, 'public/assets/icons/atlas.json and public/js/icon-map.js were built from different tables');
  assert.ok(fs.existsSync(path.join(ROOT, 'public/assets/icons/atlas.webp')));
  const used = [...map.matchAll(/^ {2}"[^"]+": "(\w+)",$/gm)].map((m) => m[1]);
  assert.ok(used.length > 300);
  for (const name of used) assert.ok(name in fromMap, `icon ${name} is in the atlas`);
});

test('the fonts and effect sprites the pages ask for are really there', () => {
  for (const f of ['kenney-future', 'kenney-future-narrow', 'kenney-pixel', 'kenney-rocket', 'kenney-space', 'kenney-mini-square']) assert.ok(fs.existsSync(path.join(ROOT, `public/assets/fonts/${f}.ttf`)), f);
  for (const f of ['star_04', 'boom00', 'boom08']) assert.ok(fs.existsSync(path.join(ROOT, `public/assets/phase/fx/${f}.png`)), f);
});

test('every icon the Phase to Space client asks for exists, and has an emoji for when the custom icons are off', () => {
  const map = fs.readFileSync(path.join(ROOT, 'public/js/icon-map.js'), 'utf8');
  const emoji = JSON.parse(map.match(/ICON_EMOJI = (\{.*\});/)[1]);
  const atlas = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/icons/atlas.json'), 'utf8')).icons;
  const dir = path.join(ROOT, 'public/js/phase');
  const asked = new Set();
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/(?:iconEl|btn)\([^)]*?'(\w+)'/g)) if (m[1] in atlas) asked.add(m[1]);
    for (const m of src.matchAll(/icon: '(\w+)'/g)) asked.add(m[1]);
    for (const m of src.matchAll(/CLASS_ICON = \{([^}]*)\}/g)) for (const n of m[1].matchAll(/'(\w+)'/g)) asked.add(n[1]);
  }
  assert.ok(asked.size > 25, `found ${asked.size} icon names`);
  for (const name of asked) {
    assert.ok(name in atlas, `icon ${name} is in the atlas`);
    assert.ok(emoji[name], `icon ${name} has an emoji`);
  }
});

// ---------------------------------------------------------------------------
// The help on the table: odds, the suggested move, and the pictures on the cards
// ---------------------------------------------------------------------------

test('the odds on the table: requirement ticks agree with the attack rule, and the chances are right', () => {
  const g = table(2);
  const [a] = g.players; // Captain Juno: a Scout
  g.beastRow = [{ uid: 'b1', id: 'hound' }, { uid: 'b2', id: 'whale' }, { uid: 'b3', id: 'dragon' }];
  const slab = crewOf(g, a, 'slab'); // a Marine
  let o = g.oddsFor(a);
  assert.deepStrictEqual(o.beasts.b1.reqs.map((r) => r.ok), [true, true], 'Comet Hound: the Captain is the Scout, Sgt. Slab the "any"');
  assert.strictEqual(o.beasts.b1.ready, true);
  assert.deepStrictEqual([o.beasts.b2.reqs[0].have, o.beasts.b2.reqs[0].need, o.beasts.b2.ready], [1, 4, false], 'Gravity Whale wants 4 Crew');
  assert.deepStrictEqual(o.beasts.b3.reqs.map((r) => r.ok), [true, false], 'Void Dragon: a Marine yes, a Warden no');
  // 2d6: 8+ is 15/36, 5 or less is 10/36
  assert.deepStrictEqual([o.beasts.b1.slay, o.beasts.b1.bite], [42, 28]);
  assert.strictEqual(o.crew[slab.uid].pct, 28, 'Sgt. Slab needs 9+');
  slab.gear = { uid: g.uid(), id: 'blaster' }; // +2
  o = g.oddsFor(a);
  assert.deepStrictEqual([o.crew[slab.uid].bonus, o.crew[slab.uid].pct], [2, 58]);
  // and on many random crews the ticks always say the same as the rule the engine attacks by
  const r = seeded(5);
  const ids = cards.CREW.map((c) => c.id);
  for (let i = 0; i < 300; i++) {
    a.crew = [];
    for (let k = Math.floor(r() * 6); k > 0; k--) crewOf(g, a, ids[Math.floor(r() * ids.length)]);
    a.captain = { id: cards.CAPTAINS[Math.floor(r() * cards.CAPTAINS.length)].id };
    for (const b of cards.BEASTS) assert.strictEqual(g.reqStatus(a, b).every((x) => x.ok), g.meetsReqs(a, b), `${b.id} with ${a.crew.map((c) => c.id)}`);
  }
});

test('the suggested move is always allowed, and working it out does not touch the game\'s dice', () => {
  const { suggest } = require('../server/phase/bots');
  const make = () => {
    const g = table(3, { seed: 11 });
    const [a, b] = g.players;
    a.hand = [card(g, 'pug'), card(g, 'supply'), card(g, 'b31'), card(g, 'jam')];
    crewOf(g, a, 'wanda');
    crewOf(g, b, 'slab');
    g.beastRow = [{ uid: 'b1', id: 'hound' }, { uid: 'b2', id: 'slug' }, { uid: 'b3', id: 'eater' }];
    return g;
  };
  const g1 = make();
  const g2 = make();
  const a = g1.players[0];
  for (let i = 0; i < 5; i++) {
    const s = suggest(g1, a);
    assert.ok(s && s.action, 'there is a suggestion');
    assert.strictEqual(g1.validateAction(a, s), null, `allowed: ${JSON.stringify(s)}`);
  }
  for (let i = 0; i < 5; i++) assert.strictEqual(g1.r(), g2.r(), 'the random numbers are the same as in a game nobody asked');
  g1.turn.ap = 0;
  a.freeDrawUsed = true; // (Captain Juno's first draw of the turn is free)
  assert.strictEqual(suggest(g1, a).action, 'end', 'out of Energy: end the turn');
  assert.strictEqual(suggest(g1, g1.players[1]), null, 'nothing to suggest when it is not your turn');
});

test('every card says what it does in pictures, and every picture is a real icon with an emoji', async () => {
  const glyphs = await import('../public/js/phase/glyphs.js');
  const map = fs.readFileSync(path.join(ROOT, 'public/js/icon-map.js'), 'utf8');
  const emoji = JSON.parse(map.match(/ICON_EMOJI = (\{.*\});/)[1]);
  const atlas = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/icons/atlas.json'), 'utf8')).icons;
  const used = new Set();
  const take = (list) => list.forEach((x) => typeof x === 'object' && (used.add(x.icon), x.sub && used.add(x.sub)));
  for (const d of [...cards.CREW, ...cards.PROTOCOLS, ...cards.CAPTAINS, ...cards.BEASTS, ...cards.GEAR, cards.CHALLENGE]) {
    const list = glyphs.glyphsFor(d);
    assert.ok(list.length, `${d.id} has pictures`);
    // one picture (or more) for every step it runs
    if (d.fx) assert.ok(list.filter((x) => typeof x === 'object').length >= d.fx.length, `${d.id}: a picture per step`);
    take(list);
  }
  take(glyphs.LEGEND.map(([g]) => g));
  take(Object.values(glyphs.PENALTY));
  for (const name of used) {
    assert.ok(name in atlas, `icon ${name} is in the atlas`);
    assert.ok(emoji[name], `icon ${name} has an emoji`);
  }
});

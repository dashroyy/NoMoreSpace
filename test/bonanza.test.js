// Star Bonanza: the cards, every rule, the robots, and a live game over the socket.
const test = require('node:test');
const assert = require('node:assert');

const data = require('../server/bonanza/data');
const { BonanzaGame } = require('../server/bonanza/engine');

function seeded(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A table of people (so nobody acts by themselves), already dealt, in the order the players were added.
let uid = 1000;
const card = (t) => ({ uid: `x${++uid}`, t });
function table(n = 3, { seed = 1, settings = {} } = {}) {
  const g = new BonanzaGame('TEST', { rng: seeded(seed), pace: 0 });
  Object.assign(g.settings, settings);
  for (let i = 0; i < n; i++) g.addPlayer(`P${i}`);
  g.hostId = g.players[0].id;
  g.start(g.hostId);
  g.players.sort((a, b) => a.name.localeCompare(b.name));
  g.turnIndex = 0;
  g.turn.pid = g.players[0].id;
  // start the first player's turn again from the planting phase
  g.turn.phase = 'plant';
  g.turn.planted = 0;
  return g;
}
const hand = (p, types) => (p.hand = types.map(card));
const fieldOf = (p, i, type, n) => (p.fields[i] = { type: n ? type : null, cards: Array.from({ length: n }, () => card(type)) });

test('the cards: eleven kinds, 104 in the base set and 154 in the full one, and the payout table the real game uses', () => {
  assert.strictEqual(data.STARS.length, 11);
  assert.strictEqual(data.CLIENT_DATA.deck.base, 104);
  assert.strictEqual(data.CLIENT_DATA.deck.full, 154);
  assert.strictEqual(data.BASE_SET.length, 8);
  // the more common a star, the more of them you need for each lumen
  for (const s of data.STARS) {
    const needs = s.table.filter((x) => x != null);
    assert.deepStrictEqual(needs, [...needs].sort((a, b) => a - b), `${s.id}: payouts go up with the number of stars`);
  }
  const counts = data.STARS.map((s) => s.count);
  assert.deepStrictEqual(counts, [...counts].sort((a, b) => b - a), 'the list runs from common to rare');
  assert.strictEqual(data.payout('red-dwarf', 3), 0);
  assert.strictEqual(data.payout('red-dwarf', 4), 1);
  assert.strictEqual(data.payout('red-dwarf', 6), 1);
  assert.strictEqual(data.payout('red-dwarf', 7), 2);
  assert.strictEqual(data.payout('red-dwarf', 12), 4);
  assert.strictEqual(data.payout('red-dwarf', 20), 4);
  assert.strictEqual(data.payout('quasar', 1), 0);
  assert.strictEqual(data.payout('quasar', 2), 2);
  assert.strictEqual(data.payout('quasar', 3), 3);
  assert.strictEqual(data.payout('quasar', 9), 3);
  assert.strictEqual(data.payout('magnetar', 4), 4);
  assert.deepStrictEqual(data.nextPayout('yellow-dwarf', 4), { stars: 6, lumens: 2, more: 2 });
  assert.strictEqual(data.nextPayout('quasar', 3), null);
});

test('setup: five stars each, three nurseries for three players and two for more, and a deck of the right size', () => {
  for (const n of [3, 4, 5, 6, 7]) {
    const g = new BonanzaGame('TEST', { rng: seeded(n), pace: 0 });
    for (let i = 0; i < n; i++) g.addPlayer(`P${i}`);
    g.hostId = g.players[0].id;
    g.start(g.hostId);
    const total = n >= 6 ? 154 : 104;
    assert.strictEqual(g.deck.length, total - 5 * n, `${n} players`);
    assert.ok(g.players.every((p) => p.hand.length === 5 && p.fields.length === (n === 3 ? 3 : 2)), `${n} players: hands and nurseries`);
    assert.strictEqual(g.setIds.length, n >= 6 ? 11 : 8);
    assert.strictEqual(g.turn.phase, 'plant');
    g.destroy();
  }
  assert.throws(() => {
    const g = new BonanzaGame('TEST', { pace: 0 });
    g.addPlayer('A');
    g.addPlayer('B');
    g.start(g.hostId);
  }, /at least 3/);
});

test('planting: the first star is a must, the second a may; a different kind needs a harvest first', () => {
  const g = table(3);
  const [a, b] = g.players;
  hand(a, ['blue-giant', 'blue-giant', 'pulsar']);
  fieldOf(a, 0, 'pulsar', 0);
  assert.throws(() => g.act(a.id, { type: 'skipPlant' }), /must plant/);
  assert.throws(() => g.act(b.id, { type: 'plant', field: 0 }), /not your turn/);
  g.act(a.id, { type: 'plant', field: 0 });
  assert.strictEqual(a.fields[0].type, 'blue-giant');
  assert.strictEqual(a.hand.length, 2);
  assert.strictEqual(g.turn.phase, 'plant', 'still allowed to plant a second one');
  // the second star is a different kind: planting it in the same nursery needs a harvest
  fieldOf(a, 1, 'red-giant', 1);
  fieldOf(a, 0, 'blue-giant', 3);
  a.hand[0].t = 'pulsar';
  assert.throws(() => g.act(a.id, { type: 'plant', field: 0 }), /harvest it first/);
  // the single red giant is protected while the other nursery holds three, so it cannot be harvested to make room
  assert.throws(() => g.act(a.id, { type: 'plant', field: 1, harvest: true }), /one star/);
  g.act(a.id, { type: 'plant', field: 0, harvest: true }); // harvest the three blue giants (1 lumen) and plant over them
  assert.strictEqual(a.fields[0].type, 'pulsar');
  assert.strictEqual(a.stash.length, 1);
  assert.strictEqual(g.turn.phase, 'trade', 'two stars planted: on to trading');
  assert.strictEqual(g.turn.faceUp.length, 2);
  g.destroy();
});

test('skipping the second planting goes to the trade; an empty hand skips planting altogether', () => {
  const g = table(3);
  const a = g.players[0];
  hand(a, ['pulsar', 'pulsar']);
  g.act(a.id, { type: 'plant', field: 0 });
  g.act(a.id, { type: 'skipPlant' });
  assert.strictEqual(g.turn.phase, 'trade');
  const h = table(3);
  h.players[0].hand = [];
  h.startTurn(0);
  assert.strictEqual(h.turn.phase, 'trade', 'nothing in hand: straight to the trade');
  g.destroy();
  h.destroy();
});

test('harvesting pays by the table, the rest go to the discard, and a lone star is protected', () => {
  const g = table(3);
  const a = g.players[0];
  fieldOf(a, 0, 'yellow-dwarf', 6);
  fieldOf(a, 1, 'pulsar', 1);
  const discard = g.discard.length;
  assert.throws(() => g.act(a.id, { type: 'harvest', field: 1 }), /one star/, 'a single star is protected while another nursery is bigger');
  g.act(a.id, { type: 'harvest', field: 0 });
  assert.strictEqual(a.stash.length, 2, 'six yellow dwarfs pay 2 lumens');
  assert.strictEqual(g.discard.length - discard, 4, 'the other four are discarded');
  assert.strictEqual(a.fields[0].cards.length, 0);
  assert.strictEqual(a.fields[0].type, null);
  g.act(a.id, { type: 'harvest', field: 1 }); // now it is the biggest: allowed (and worth nothing)
  assert.strictEqual(a.stash.length, 2);
  assert.throws(() => g.act(a.id, { type: 'harvest', field: 1 }), /empty/);
  // anyone can harvest at any time, even on someone else's turn
  const b = g.players[1];
  fieldOf(b, 0, 'red-dwarf', 4);
  g.act(b.id, { type: 'harvest', field: 0 });
  assert.strictEqual(b.stash.length, 1);
  g.destroy();
});

test('a third nursery costs three lumens, and the lumens go back to the discard', () => {
  const g = table(4);
  const a = g.players[0];
  assert.throws(() => g.act(a.id, { type: 'buyField' }), /costs 3/);
  a.stash = [card('red-dwarf'), card('red-dwarf'), card('pulsar'), card('pulsar')];
  const discard = g.discard.length;
  g.act(a.id, { type: 'buyField' });
  assert.strictEqual(a.fields.length, 3);
  assert.strictEqual(a.stash.length, 1);
  assert.strictEqual(g.discard.length, discard + 3);
  assert.throws(() => g.act(a.id, { type: 'buyField' }), /already/);
  g.destroy();
});

test('trading: offers, counter-offers, gifts, and only the active player trades with the others', () => {
  const g = table(3);
  const [a, b, c] = g.players;
  hand(a, ['pulsar', 'pulsar']);
  hand(b, ['blue-giant', 'red-giant', 'white-dwarf']);
  hand(c, ['white-dwarf', 'quasar']);
  g.act(a.id, { type: 'plant', field: 0 });
  g.act(a.id, { type: 'skipPlant' });
  const [u1, u2] = g.turn.faceUp;
  assert.throws(() => g.act(b.id, { type: 'plant', field: 0 }), /cannot plant|not your turn/, 'no planting during trades');

  // the active player offers a turned-over star for a white dwarf
  g.act(a.id, { type: 'offer', give: [u1.uid], want: [{ t: 'white-dwarf', n: 1 }] });
  const offer = g.turn.offers[0];
  assert.strictEqual(offer.to, null);
  // b accepts, but gives the wrong star
  assert.throws(() => g.act(b.id, { type: 'accept', id: offer.id, give: [b.hand[0].uid] }), /asked for 1 White Dwarf/);
  assert.throws(() => g.act(b.id, { type: 'accept', id: offer.id, give: [] }), /asked for/);
  g.act(b.id, { type: 'accept', id: offer.id, give: [b.hand[2].uid] });
  assert.deepStrictEqual(b.tray.map((x) => x.t), [u1.t], 'b must plant what they got');
  assert.deepStrictEqual(a.tray.map((x) => x.t), ['white-dwarf']);
  assert.strictEqual(b.hand.length, 2);
  assert.ok(!g.turn.faceUp.some((x) => x.uid === u1.uid), 'the traded star left the table');
  assert.strictEqual(g.turn.offers.length, 0);

  // a proposal from a non-active player goes to the active player only
  g.act(c.id, { type: 'offer', give: [c.hand[1].uid], want: [{ t: 'pulsar', n: 1 }] });
  const prop = g.turn.offers[0];
  assert.strictEqual(prop.to, a.id);
  assert.throws(() => g.act(b.id, { type: 'accept', id: prop.id, give: [] }), /Only P0/);
  assert.throws(() => g.act(c.id, { type: 'accept', id: prop.id, give: [] }), /own offer/);
  g.act(a.id, { type: 'accept', id: prop.id, give: [a.hand[0].uid] });
  assert.deepStrictEqual(c.tray.map((x) => x.t), ['pulsar']);
  assert.ok(a.tray.some((x) => x.t === 'quasar'));

  // a gift: nothing asked in return
  g.act(a.id, { type: 'offer', give: [g.turn.faceUp[0].uid], want: [] });
  const gift = g.turn.offers[0];
  g.act(b.id, { type: 'accept', id: gift.id, give: [] });
  assert.strictEqual(a.stats.gifts, 1);
  g.destroy();
});

test('offers: stars in an open offer disappear from it when traded elsewhere, and nobody can offer what they do not hold', () => {
  const g = table(3);
  const [a, b, c] = g.players;
  hand(a, ['pulsar']);
  hand(b, ['red-giant', 'white-dwarf']);
  hand(c, ['red-giant']);
  g.act(a.id, { type: 'plant', field: 0 });
  assert.strictEqual(g.turn.phase, 'trade');
  const face = g.turn.faceUp[0];
  assert.throws(() => g.act(a.id, { type: 'offer', give: ['nope'], want: [] }), /no longer have/);
  assert.throws(() => g.act(a.id, { type: 'offer', give: [], want: [] }), /Offer a star/);
  assert.throws(() => g.act(b.id, { type: 'offer', give: [face.uid], want: [] }), /no longer have/, 'the turned-over stars are only the active player\'s');
  // two offers for the same star: the second becomes void once the first is taken
  g.act(a.id, { type: 'offer', give: [face.uid], want: [] });
  g.act(a.id, { type: 'offer', give: [face.uid], want: [{ t: 'red-giant', n: 1 }] });
  const [o1, o2] = g.turn.offers;
  g.act(b.id, { type: 'accept', id: o1.id, give: [] });
  assert.ok(!g.turn.offers.find((x) => x.id === o2.id), 'the second offer is gone with the star');
  // only three open offers at once
  g.act(b.id, { type: 'offer', give: [b.hand[0].uid], want: [] });
  g.act(b.id, { type: 'offer', give: [b.hand[1].uid], want: [] });
  g.act(b.id, { type: 'offer', give: [b.hand[0].uid], want: [{ t: 'quasar', n: 1 }] });
  assert.throws(() => g.act(b.id, { type: 'offer', give: [b.hand[0].uid], want: [{ t: 'pulsar', n: 2 }] }), /3 offers/);
  g.destroy();
});

test('ending the trade: everyone plants what they won, then the active player draws three and the next player goes', () => {
  const g = table(3);
  const [a, b] = g.players;
  hand(a, ['pulsar', 'pulsar', 'quasar', 'quasar']);
  g.act(a.id, { type: 'plant', field: 0 });
  g.act(a.id, { type: 'skipPlant' });
  const gift = g.turn.faceUp[0];
  g.act(a.id, { type: 'offer', give: [gift.uid], want: [] });
  g.act(b.id, { type: 'accept', id: g.turn.offers[0].id, give: [] });
  assert.throws(() => g.act(b.id, { type: 'doneTrading' }), /Only the player whose turn/);
  g.act(a.id, { type: 'doneTrading' });
  assert.strictEqual(g.turn.phase, 'tray');
  assert.ok(a.tray.length >= 1, 'the star nobody wanted is the active player\'s to plant');
  const deck = g.deck.length;
  const before = a.hand.length;
  // plant everything
  for (const p of [a, b]) {
    while (p.tray.length) {
      const f = p.fields.findIndex((x) => !x.cards.length || x.type === p.tray[0].t);
      g.act(p.id, f >= 0 ? { type: 'plant', field: f } : { type: 'plant', field: 0, harvest: true });
    }
  }
  assert.strictEqual(a.hand.length, before + 3, 'three new stars at the back of the hand');
  assert.strictEqual(g.deck.length, deck - 3);
  assert.strictEqual(a.hand[a.hand.length - 1].uid !== undefined, true);
  return new Promise((resolve) =>
    setTimeout(() => {
      assert.strictEqual(g.turn.pid, g.players[1].id, 'the next player is up');
      assert.strictEqual(g.turn.phase, 'plant');
      g.destroy();
      resolve();
    }, 30),
  );
});

test('the deck: the last card turns the discards into a new deck, and the final time the game ends after the turn', () => {
  const g = table(3, { settings: { passes: 2 } });
  const a = g.players[0];
  hand(a, ['pulsar']);
  g.act(a.id, { type: 'plant', field: 0 });
  // one star left in the deck, and a few in the discard
  g.deck = [card('red-giant')];
  g.discard = [card('pulsar'), card('white-dwarf'), card('blue-giant')];
  g.drawOne();
  assert.strictEqual(g.deckOuts, 1);
  assert.strictEqual(g.deck.length, 3, 'the discards became the deck');
  assert.strictEqual(g.discard.length, 0);
  assert.strictEqual(g.endPending, false);
  g.deck = [card('red-giant')];
  g.drawOne();
  assert.strictEqual(g.deckOuts, 2);
  assert.strictEqual(g.endPending, true, 'the second time (of two) is the last');
  g.destroy();
});

test('the end: fields are harvested, the most lumens wins, and a tie goes to the bigger hand', () => {
  const g = table(3);
  const [a, b, c] = g.players;
  g.endPending = true;
  fieldOf(a, 0, 'red-dwarf', 4); // 1 lumen
  fieldOf(a, 1, 'pulsar', 3); // 2 lumens
  a.stash = [];
  fieldOf(b, 0, 'pulsar', 3); // 2 lumens
  fieldOf(b, 1, 'red-dwarf', 4); // 1 lumen
  b.stash = [];
  fieldOf(c, 0, 'quasar', 2); // 2
  fieldOf(c, 1, 'red-dwarf', 3); // 0
  c.stash = [];
  a.hand = [card('pulsar')];
  b.hand = [card('pulsar'), card('pulsar'), card('pulsar'), card('pulsar'), card('pulsar'), card('pulsar')]; // (the active player draws three more first)
  c.hand = [];
  g.turn.phase = 'tray';
  g.finishTurn();
  assert.strictEqual(g.phase, 'ended');
  assert.deepStrictEqual(g.players.map((p) => p.stash.length), [3, 3, 2]);
  assert.strictEqual(g.winner, b.id, 'tied on 3: more stars in hand wins');
  assert.deepStrictEqual(g.standings.map((s) => s.rank), [1, 2, 3]);
  assert.ok(g.players.every((p) => p.fields.every((f) => !f.cards.length)));
  g.destroy();
});

test('what each person sees: your own hand, but only how many cards the others hold', () => {
  const g = table(3);
  const [a, b] = g.players;
  const mine = g.viewFor(a.id);
  assert.strictEqual(mine.you.hand.length, a.hand.length);
  assert.ok(mine.players.every((p) => !('hand' in p) && typeof p.handCount === 'number'));
  const theirs = g.viewFor(b.id);
  assert.notDeepStrictEqual(theirs.you.hand, mine.you.hand);
  assert.strictEqual(g.viewFor('nobody').you.isSpectator, true);
  assert.strictEqual(g.viewFor('nobody').you.hand.length, 0);
  assert.strictEqual(mine.you.todo.kind, 'plant');
  assert.strictEqual(theirs.you.todo.kind, 'wait');
  assert.strictEqual(JSON.stringify(g.viewFor(b.id)).includes(a.hand[0].uid), false, 'the others\' hand cards are never sent');
  g.destroy();
});

// ---------------------------------------------------------------------------
// The robots
// ---------------------------------------------------------------------------

async function robotGame(n, seed, settings = {}) {
  const g = new BonanzaGame('TEST', { rng: seeded(seed), pace: 0 });
  Object.assign(g.settings, settings);
  for (let i = 0; i < n; i++) g.addPlayer(`P${i}`, { isBot: true });
  g.hostId = g.players[0].id;
  g.start(g.hostId);
  const total = g.deck.length + g.players.reduce((s, p) => s + p.hand.length, 0);
  const started = Date.now();
  while (g.phase !== 'ended') {
    if (Date.now() - started > 25_000) throw new Error(`a ${n}-player robot game did not finish (turn ${g.turnCount}, phase ${g.turn?.phase})`);
    await new Promise((r) => setTimeout(r, 2));
    const all = g.deck.length + g.discard.length + g.players.reduce((s, p) => s + p.hand.length + p.stash.length + p.tray.length + p.fields.reduce((x, f) => x + f.cards.length, 0), 0) + (g.turn ? g.turn.faceUp.length : 0);
    assert.strictEqual(all, total, `a card was lost or made (turn ${g.turnCount})`);
  }
  return g;
}

test('robot-only games always finish: no star is ever lost, the scores add up, and they really trade', async () => {
  let trades = 0;
  for (const [n, seed, settings] of [[3, 11, {}], [4, 12, { passes: 1 }], [5, 13, {}], [6, 14, {}], [7, 15, { passes: 1 }]]) {
    const g = await robotGame(n, seed, settings);
    assert.strictEqual(g.phase, 'ended');
    assert.ok(g.winner, 'there is a winner');
    assert.strictEqual(g.standings.length, n);
    assert.deepStrictEqual(g.standings.map((s) => s.coins), [...g.standings.map((s) => s.coins)].sort((x, y) => y - x), 'standings are in order');
    for (const p of g.players) {
      assert.ok(p.stash.length >= 0 && p.fields.every((f) => !f.cards.length), 'everything is harvested at the end');
      assert.ok(p.hand.length >= 0);
      trades += p.stats.trades;
    }
    assert.ok(g.deckOuts >= (settings.passes || 2), 'the game ended when the deck ran out the right number of times');
  }
  assert.ok(trades > 10, `the robots should trade now and then (${trades})`);
});

// ---------------------------------------------------------------------------
// The server: a live practice table over the socket
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const http = require('http');
process.env.PORT = '0';
process.env.SBZ_TEST_PACE = '0.05'; // the robots at table speed
process.env.NMS_DATA_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'sbz-test-'));
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
    http.get({ port, path: p }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });

test('the data route, and a live practice table over the socket where the human can plant', async () => {
  const port = await listen();
  const json = JSON.parse((await get(port, '/bonanza-data.json')).body);
  assert.strictEqual(json.stars.length, 11);
  const sock = io(`http://localhost:${port}/bonanza`, { transports: ['websocket'], forceNew: true });
  try {
    let latest = null;
    const waitFor = (test, ms = 8000) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timed out waiting for the game')), ms);
        const check = () => {
          if (latest && test(latest)) {
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
    sock.emit('create', { name: 'Tester', practice: true, bots: 3 }, () => {});
    const first = await waitFor((s) => s.phase === 'playing');
    assert.strictEqual(first.players.length, 4);
    assert.ok(first.players.some((p) => p.isBot));
    assert.strictEqual(first.you.hand.length, 5);
    assert.strictEqual(first.practice, true);
    const which = JSON.parse((await get(port, `/api/code?code=${first.code}`)).body);
    assert.strictEqual(which.game, 'bonanza');
    // wait for the human's turn and plant (the robots take theirs)
    const mine = await waitFor((s) => s.turn && s.turn.pid === s.you.id && s.turn.phase === 'plant', 20000);
    const reply = await new Promise((resolve) => sock.emit('act', { type: 'plant', field: 0 }, resolve));
    assert.strictEqual(reply.ok, true, reply.error);
    const after = await waitFor((s) => s.players.find((p) => p.id === s.you.id).fields[0].n >= 1);
    assert.ok(after.players.find((p) => p.id === after.you.id).fields[0].type);
    // a mistake comes back as an error to just that person
    const bad = await new Promise((resolve) => sock.emit('act', { type: 'harvest', field: 9 }, resolve));
    assert.strictEqual(bad.ok, false);
    assert.ok(mine.you.todo);
  } finally {
    sock.close();
  }
});


// ---------------------------------------------------------------------------
// The client: it only runs in a browser, so these check that its pieces fit together
// ---------------------------------------------------------------------------
const ROOT = path.join(__dirname, '..');
const CLIENT = path.join(ROOT, 'public/js/bonanza');
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
  assert.ok(clientFiles().length >= 15);
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
  assert.ok(vocabulary.has('unlock') && vocabulary.has('el') && vocabulary.has('sfx') && vocabulary.has('starArt'));
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
      if (['clamp', 'lerp', 'clear', 'step', 'star', 'player', 'me'].includes(name)) continue; // (also plain words in comments, shaders and methods)
      const esc = name.replace(/\$/g, '\\$');
      if (!new RegExp(`(?<![.\\w$'"\`])${esc}\\(`).test(src)) continue; // not called here
      const declared = new RegExp(`\\b(?:function|const|let|var|class)\\s+${esc}\\b`).test(src);
      assert.ok(imported.has(name) || declared, `${path.relative(ROOT, file)} calls ${name}() but never imports or defines it`);
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

test('every sound the screens ask for exists in sound.js', () => {
  const sounds = fs.readFileSync(path.join(CLIENT, 'sound.js'), 'utf8');
  const body = sounds.slice(sounds.indexOf('const SOUNDS = {'), sounds.indexOf('export function sfx'));
  const known = new Set([...body.matchAll(/^ {2}(\w+): /gm)].map((m) => m[1]));
  const asked = new Map();
  for (const file of clientFiles()) for (const m of fs.readFileSync(file, 'utf8').matchAll(/\bsfx\('([\w-]+)'\)/g)) asked.set(m[1], path.relative(ROOT, file));
  for (const [name, where] of asked) assert.ok(known.has(name), `${where} plays the sound "${name}", which sound.js does not make`);
  assert.ok(asked.size >= 15, 'the check found the sounds');
});

test('the page has the start screen, its own stylesheet and every element the scripts look up', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/bonanza.html'), 'utf8');
  assert.ok(html.includes('/css/bonanza.css') && fs.existsSync(path.join(ROOT, 'public/css/bonanza.css')), 'bonanza.css is linked and exists');
  assert.ok(!html.includes('/css/ruler'), 'it has a look of its own, not the one Ruler of the Galaxy uses');
  assert.ok(html.includes('/js/bonanza/main.js'));
  const splash = fs.readFileSync(path.join(CLIENT, 'splash.js'), 'utf8');
  for (const id of [...splash.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1])) assert.ok(html.includes(`id="${id}"`), `bonanza.html has #${id}`);
  for (const id of ['stage', 'labels', 'screen-home', 'screen-lobby', 'screen-game', 'layer-fx', 'layer-prompt', 'layer-modal', 'toasts', 'problem', 'warp']) assert.ok(html.includes(`id="${id}"`), `bonanza.html has #${id}`);
  assert.ok(html.includes('class="logo-lockup"'));
  for (const file of clientFiles()) assert.ok(!fs.readFileSync(file, 'utf8').includes('/ruler/'), `${path.relative(ROOT, file)} does not borrow the scene Ruler of the Galaxy uses`);
});

test('every kind of star buddy has its costume, a joke and colours', () => {
  const critters = fs.readFileSync(path.join(CLIENT, 'scene/critters.js'), 'utf8');
  const kinds = critters.slice(critters.indexOf('const KINDS = {'), critters.indexOf('// the dark cartoon outline'));
  for (const s of data.STARS) {
    assert.ok(kinds.includes(`'${s.id}'(`) || kinds.includes(`${s.id}(`), `critters.js dresses up the ${s.id}`);
    assert.ok(s.persona && s.blurb, `${s.id} has a joke`);
    assert.match(s.color, /^#[0-9a-f]{6}$/i);
    assert.match(s.glow, /^#[0-9a-f]{6}$/i);
  }
});

test('the client counts lumens the way the server does', () => {
  // net.js has its own copy of payout and nextPayout (the browser cannot require the server): they must agree for every star
  const src = fs.readFileSync(path.join(CLIENT, 'net.js'), 'utf8');
  const body = src.slice(src.indexOf('export function payout')).replace(/export /g, '');
  const make = new Function('store', 'star', `${body}; return { payout, nextPayout };`);
  const { payout, nextPayout } = make({ data: { stars: data.STARS } }, (id) => data.starDef(id));
  for (const s of data.STARS) {
    for (let n = 0; n <= 14; n++) {
      assert.strictEqual(payout(s.id, n), data.payout(s.id, n), `${s.id} x${n}`);
      const a = nextPayout(s.id, n);
      const b = data.nextPayout(s.id, n);
      assert.strictEqual(a ? a.lumens : null, b ? b.lumens : null, `${s.id} x${n} next`);
    }
  }
});

test('the arcade page lists Star Bonanza, counts its tables and takes you back to your seat', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  assert.match(html, /href="\/bonanza"/);
  assert.match(html, /data-live="bonanza"/);
  const hub = fs.readFileSync(path.join(ROOT, 'public/js/hub.js'), 'utf8');
  assert.match(hub, /stats\.bonanza/);
  assert.match(hub, /game: 'bonanza'/);
  const main = fs.readFileSync(path.join(CLIENT, 'main.js'), 'utf8');
  const key = /SEAT_KEY = '([\w-]+)'/.exec(main)[1];
  assert.ok(hub.includes(`'${key}'`), 'the hub reads the seat key the game saves');
});

test('every log line the screen reacts to is one the engine writes', () => {
  const fx = fs.readFileSync(path.join(CLIENT, 'fx.js'), 'utf8');
  const engine = fs.readFileSync(path.join(__dirname, '../server/bonanza/engine.js'), 'utf8');
  const written = new Set([...engine.matchAll(/k: '([\w-]+)'/g)].map((m) => m[1]));
  const handled = [...fx.slice(fx.indexOf('function handle')).matchAll(/case '([\w-]+)':/g)].map((m) => m[1]);
  assert.ok(handled.length >= 12);
  for (const k of handled) assert.ok(written.has(k), `fx.js reacts to "${k}", which the engine never logs`);
  for (const k of ['plant', 'harvest', 'reveal', 'trade', 'draw', 'reshuffle', 'last', 'win']) assert.ok(handled.includes(k), `fx.js shows "${k}"`);
});

test.after(() => {
  server.close();
});

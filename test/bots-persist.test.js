// Robot crewmates, "who dies tonight?" guesses, and games surviving a restart.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Game } = require('../server/engine');
const { runBots, ROOM_RECTS } = require('../server/bots');
const persist = require('../server/persist');

const quietApi = () => ({ said: [], say(p, text) { this.said.push(`${p.name}: ${text}`); }, emote() {} });

// A ship with one human host and some robots.
function shipWithBots(robots, { pace = 0.05 } = {}) {
  const g = new Game('BOTS');
  const host = g.addPlayer('Host');
  for (let i = 0; i < robots; i++) g.addBot(host.id);
  g.pace = pace;
  return { g, host, room: { code: 'BOTS', game: g, positions: {} } };
}

// Run the game clock and the robots' brains with fake time. The human host
// plays like a robot too (so the game never waits on them).
function play(g, room, api, { start = 1000, maxSteps = 40_000, step = 250 } = {}) {
  let now = start;
  g.players[0].isBot = true;
  for (let i = 0; i < maxSteps && g.phase !== 'ended'; i++) {
    now += step;
    runBots(room, now, api, step / 1000);
    g.tick(now);
  }
  return now;
}

test('robots: the host adds and removes them in the lobby', () => {
  const { g, host } = shipWithBots(0);
  const bot = g.addBot(host.id);
  assert.ok(bot.isBot && bot.name.endsWith('🤖') && bot.bio, 'a robot with a name and a bio');
  assert.ok(g.viewFor(host.id).players.find((p) => p.id === bot.id).bot);
  const other = g.addPlayer('Guest');
  assert.throws(() => g.addBot(other.id), /Only the host/);
  g.removeBots(host.id);
  assert.ok(g.players.every((p) => !p.isBot));
});

test('robots play complete games on their own (5 to 12 players)', () => {
  for (const n of [5, 7, 9, 12]) {
    const { g, host, room } = shipWithBots(n - 1);
    const api = quietApi();
    g.start(host.id, 1000);
    play(g, room, api);
    assert.strictEqual(g.phase, 'ended', `${n}-player robot game finishes`);
    assert.ok(['crew', 'infiltrators'].includes(g.winner));
    assert.ok(Object.keys(g.claims).length > 0, 'robots claim roles');
    assert.ok(api.said.length > 0, 'robots talk');
    assert.ok(g.history.some((h) => h.k === 'day' && h.events.some((e) => e.k === 'nomination')), 'robots nominate and vote');
  }
});

test('robots wander the ship while exploring', () => {
  const { g, host, room } = shipWithBots(6);
  g.start(host.id, 1000);
  g.players[0].isBot = true;
  let now = 1000;
  while (g.phase !== 'roam' && now < 400_000) {
    now += 250;
    runBots(room, now, quietApi());
    g.tick(now);
  }
  const before = JSON.stringify(room.positions);
  for (let i = 0; i < 20; i++) runBots(room, (now += 250), quietApi());
  assert.notStrictEqual(JSON.stringify(room.positions), before, 'they move');
  for (const pos of Object.values(room.positions)) assert.ok(ROOM_RECTS[pos.room] || pos.room === 'corridor');
});

test("robots' room shapes match the 3D ship's floor plan", async () => {
  const layout = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'js', 'world', 'layout.js')).href);
  for (const r of layout.ROOMS) assert.deepStrictEqual(ROOM_RECTS[r.id], r.rect, r.id);
});

test('who dies tonight: right guesses score, the Parasite never does', () => {
  const g = new Game('G', { random: () => 0.3 });
  const p = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((n) => g.addPlayer(n));
  g.start(p[0].id, 0, { deal: ['parasite', 'hacker', 'engineer', 'comms', 'scanner', 'medic', 'marine'] });
  const role = (r) => g.players.find((x) => x.role === r);
  // night 1: nobody dies (the Parasite does not kill on the first night)
  g.setDeathGuess(role('comms').id, 'none');
  g.setDeathGuess(role('medic').id, role('engineer').id);
  assert.throws(() => g.setDeathGuess(role('comms').id, 'nobody-real'), /living player/);
  g.submitChoice(role('hacker').id, [role('comms').id], 500);
  g.submitChoice(role('scanner').id, [role('comms').id, role('medic').id], 500);
  g.resolveNight(1000);
  g.applyDraft(2000);
  assert.deepStrictEqual(g.viewFor(role('comms').id).you.lastGuess, { night: 1, guess: 'none', correct: true });
  assert.strictEqual(g.guessScore[role('comms').id], 1);
  assert.strictEqual(g.guessScore[role('medic').id], undefined);
  // night 2: the Parasite kills the engineer; it guessed its own victim, but that doesn't count
  g.beginRoam(3000);
  g.beginMeeting(3000);
  g.beginNominations(3000);
  g.beginDusk(3000);
  g.beginNight(4000);
  g.setDeathGuess(role('parasite').id, role('engineer').id);
  g.setDeathGuess(role('scanner').id, role('engineer').id);
  g.submitChoice(role('parasite').id, [role('engineer').id], 4500);
  g.submitChoice(role('hacker').id, [role('comms').id], 4500);
  g.submitChoice(role('medic').id, [role('comms').id], 4500);
  g.submitChoice(role('scanner').id, [role('comms').id, role('medic').id], 4500);
  g.resolveNight(5000);
  g.applyDraft(6000);
  assert.strictEqual(g.guessScore[role('scanner').id], 1);
  assert.strictEqual(g.guessScore[role('parasite').id], undefined, 'no points for the killer');
  // the season counts correct guesses as points
  g.endGame(p[0].id, 'crew', 7000);
  const row = g.viewFor(p[0].id).season.rows.find((r) => r.name === role('comms').name);
  assert.strictEqual(row.guesses, 1);
});

test('games survive a restart: save, then restore mid-game', () => {
  const { g, host, room } = shipWithBots(6);
  g.start(host.id, 1000);
  g.players[0].isBot = true;
  let now = 1000;
  while ((g.phase !== 'nominations' || !g.nominators.size) && now < 900_000) {
    now += 250;
    runBots(room, now, quietApi());
    g.tick(now);
  }
  g.players[0].isBot = false;
  g.players[0].connected = true;
  const rooms = new Map([['BOTS', room]]);
  const text = persist.serialize(rooms, now);
  const [{ code, game: back }] = persist.deserialize(text, now + 15_000); // 15 seconds of downtime
  assert.strictEqual(code, 'BOTS');
  assert.ok(back instanceof Game);
  assert.strictEqual(back.phase, g.phase);
  assert.ok(back.nominators instanceof Set && back.nominators.size === g.nominators.size, 'Sets come back as Sets');
  assert.strictEqual(back.phaseEndsAt, g.phaseEndsAt + 15_000, 'the clock waits out the downtime');
  assert.strictEqual(back.players[0].connected, false, 'people have to reconnect');
  assert.ok(back.players.filter((p) => p.isBot).every((p) => p.connected), 'robots never left');
  assert.strictEqual(back.chapter, back.history.at(-1), 'the current chapter points into the history again');
  assert.strictEqual(back.players[0].token, g.players[0].token, 'tokens survive, so seats can be reclaimed');
  // and the game carries on to the end
  back.players[0].isBot = true;
  play(back, { code, game: back, positions: {} }, quietApi(), { start: now + 15_000 });
  assert.strictEqual(back.phase, 'ended');
  // stale saves are ignored
  assert.deepStrictEqual(persist.deserialize(text, now + 60 * 60_000), []);
});

test('robots do tasks, use ship systems, and as ghosts bet and haunt', () => {
  const totals = { tasks: 0, systems: 0, haunts: 0, bets: 0 };
  for (let k = 0; k < 6; k++) {
    const { g, host, room } = shipWithBots(8, { pace: 0.2 });
    g.start(host.id, 1000);
    const api = quietApi();
    api.haunt = () => totals.haunts++;
    play(g, room, api);
    totals.tasks += Object.values(g.stats.tasks).reduce((a, b) => a + b, 0);
    totals.systems += Object.values(g.stats.systems).reduce((a, b) => a + b, 0);
    totals.bets += Object.keys(g.predictions).length;
  }
  assert.ok(totals.tasks > 10, `tasks done: ${totals.tasks}`);
  assert.ok(totals.systems > 0, `ship systems used: ${totals.systems}`);
  assert.ok(totals.bets > 0, `ghost bets: ${totals.bets}`);
  assert.ok(totals.haunts > 0, `haunts: ${totals.haunts}`);
});

test('public ships: the host lists a ship; practice ships stay private', () => {
  const { g, host } = shipWithBots(3);
  assert.throws(() => g.setPublic(g.players[1].id, true), /Only the host/);
  g.setPublic(host.id, true);
  assert.ok(g.viewFor(host.id).isPublic);
  const line = g.listing();
  assert.deepStrictEqual(Object.keys(line).sort(), ['code', 'mode', 'people', 'phase', 'robots', 'round', 'script', 'seats', 'shipName', 'watching']);
  assert.strictEqual(line.robots, 3);
  assert.strictEqual(line.people, 1);
  g.practice = true;
  assert.throws(() => g.setPublic(host.id, true), /private/);
});

test('robots stay out of a room that is locked against them', () => {
  const { g, host, room } = shipWithBots(11);
  const api = quietApi();
  g.start(host.id, 1000);
  g.players[0].isBot = true;
  // get to the exploring phase
  let now = 1000;
  for (let i = 0; i < 40_000 && g.phase !== 'roam'; i++) {
    now += 250;
    runBots(room, now, api, 0.25);
    g.tick(now);
  }
  assert.strictEqual(g.phase, 'roam');
  // the host and one robot are in the galley when it is locked (the server passes who is inside)
  const a = g.players.find((p) => p.isBot && p.id !== host.id);
  room.positions[host.id] = { x: 26, z: 0, r: 0, m: 0, room: 'galley' };
  room.positions[a.id] = { x: 25, z: 1, r: 0, m: 0, room: 'galley' };
  g.systems.lockdowns.length = 0;
  const lock = g.lockRoom(host.id, { here: 'galley', occupants: [host.id, a.id] }, now);
  // (stretched to ten minutes here, so the robots change rooms hundreds of times) nobody who was not let in ever ends up inside
  lock.until = now + 600_000;
  let leaked = 0;
  let changes = 0;
  const wasIn = {};
  while (now < lock.until - 500 && g.phase === 'roam') {
    now += 250;
    runBots(room, now, api, 0.25);
    for (const p of g.players) {
      const where = room.positions[p.id]?.room;
      if (where !== wasIn[p.id]) changes++;
      wasIn[p.id] = where;
      if (where === 'galley' && !lock.allowed.includes(p.id)) leaked++;
    }
  }
  assert.ok(changes > 100, `the robots kept moving between rooms (${changes} changes)`);
  assert.strictEqual(leaked, 0, 'locked-out robots never walked in');
});

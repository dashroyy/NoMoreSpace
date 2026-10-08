// Run with: npm test
const test = require('node:test');
const assert = require('node:assert');
const { Room, ROLES, buildRoleList } = require('../server/game');

// Make a started game where we choose exactly who gets which role.
function setupGame(roles) {
  const room = new Room('TEST');
  const players = roles.map((_, i) => room.addPlayer(`P${i}`));
  room.start(players[0].id);
  players.forEach((p, i) => (p.role = roles[i])); // override the random deal
  return { room, players };
}

test('role list always has one parasite and the right size', () => {
  for (let n = 5; n <= 15; n++) {
    const roles = buildRoleList(n);
    assert.strictEqual(roles.length, n);
    assert.strictEqual(roles.filter((r) => r === 'parasite').length, 1);
    assert.ok(roles.filter((r) => ROLES[r].team === 'infiltrator').length < n / 2);
  }
});

test('cannot start with too few players', () => {
  const room = new Room('TEST');
  const host = room.addPlayer('Host');
  room.addPlayer('Two');
  assert.throws(() => room.start(host.id), /at least/);
});

test('duplicate names are rejected', () => {
  const room = new Room('TEST');
  room.addPlayer('Nova');
  assert.throws(() => room.addPlayer('nova'), /taken/);
});

test('players never see each other\'s roles mid-game', () => {
  const { room, players } = setupGame(['parasite', 'saboteur', 'medic', 'scanner', 'crew']);
  const view = room.viewFor(players[2].id);
  assert.ok(view.players.every((p) => p.role === undefined));
  assert.strictEqual(view.you.role.key, 'medic');
});

test('a full game: scan, kill, protect, vote out the parasite', () => {
  const roles = ['parasite', 'saboteur', 'medic', 'scanner', 'crew', 'crew'];
  const room = new Room('TEST');
  const p = roles.map((_, i) => room.addPlayer(`P${i}`));
  room.start(p[0].id);
  p.forEach((pl, i) => (pl.role = roles[i]));
  // start() already began night 1 using the random roles; restart night with our roles.
  room.beginNight();

  // Night 1: only the scanner acts.
  assert.strictEqual(room.phase, 'night');
  room.nightAction(p[3].id, p[0].id);
  assert.strictEqual(room.phase, 'day');
  assert.match(p[3].messages.at(-1).text, /INFILTRATOR/);

  // Day 1: everyone skips.
  for (const pl of p) room.vote(pl.id, 'skip');
  assert.strictEqual(room.phase, 'night');
  assert.strictEqual(room.round, 2);

  // Night 2: parasite attacks P4, medic shields P4 -> nobody dies.
  room.nightAction(p[0].id, p[4].id);
  room.nightAction(p[2].id, p[4].id);
  room.nightAction(p[3].id, p[1].id);
  assert.strictEqual(room.phase, 'day');
  assert.ok(p[4].alive);

  // Day 2: majority airlocks the parasite.
  for (const pl of p.slice(1)) room.vote(pl.id, p[0].id);
  room.vote(p[0].id, 'skip');
  assert.strictEqual(room.phase, 'ended');
  assert.strictEqual(room.winner, 'crew');
  assert.ok(room.viewFor(p[1].id).players.every((pl) => pl.role)); // roles revealed at the end
});

test('medic cannot shield the same player two nights in a row', () => {
  const { room, players: p } = setupGame(['parasite', 'saboteur', 'medic', 'crew', 'crew']);
  room.lastProtected[p[2].id] = p[3].id;
  room.round = 2;
  room.beginNight();
  assert.throws(() => room.nightAction(p[2].id, p[3].id), /last night/);
});

test('dead players get exactly one ghost vote', () => {
  const { room, players: p } = setupGame(['parasite', 'saboteur', 'crew', 'crew', 'crew']);
  room.beginDay();
  p[4].alive = false;
  room.vote(p[4].id, 'skip');
  assert.strictEqual(p[4].ghostVote, false);
  room.endDay(p[0].id);
  room.beginDay();
  assert.throws(() => room.vote(p[4].id, 'skip'), /no vote/);
});

test('infiltrators win when only two remain', () => {
  const { room, players: p } = setupGame(['parasite', 'saboteur', 'crew', 'crew', 'crew']);
  p[2].alive = false;
  p[3].alive = false;
  p[4].alive = false;
  assert.ok(room.checkWin());
  assert.strictEqual(room.winner, 'infiltrator');
});

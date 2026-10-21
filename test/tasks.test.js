// Tasks that matter: the Observation Array's milestones, the bonus clue, the clue decoded for whoever helped,
// and the day's top technician. Run with: npm test
const test = require('node:test');
const assert = require('node:assert');
const { Game } = require('../server/engine');
const { TASKS } = require('../server/tasks');
const persist = require('../server/persist');

function seeded(seed = 1) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ship(script, deal, seed = 1) {
  const g = new Game('TEST', { random: seeded(seed) });
  g.script = script;
  const p = deal.map((_, i) => g.addPlayer(`P${i}`));
  g.start(p[0].id, 0, { deal });
  const role = (r) => g.players.find((x) => x.role === r);
  return { g, p, role };
}

const CLASSIC = ['parasite', 'hacker', 'comms', 'engineer', 'scanner', 'coroner', 'medic']; // 7 players: the Array needs 11 charges
const TASK_IDS = Object.keys(TASKS);

// day 1 (nothing dies at night 1), with everyone exploring
function startDay(g, now = 1000) {
  g.resolveNight(now);
  g.applyDraft(now + 1);
  g.beginRoam(now + 2);
}

// this player does this many tasks (a player can do each task once a day)
function doTasks(g, player, n) {
  let last;
  for (const id of TASK_IDS.slice(0, n)) last = g.completeTask(player.id, id);
  return last;
}

// a full day of exploring, then the night, then the next dawn
function nextDay(g, now = 5000) {
  g.beginMeeting(now);
  g.beginNominations(now);
  g.beginDusk(now);
  if (g.phase !== 'night') g.beginNight(now + 1);
  g.resolveNight(now + 2);
  g.applyDraft(now + 3);
}

test('a finished task tells you how the Array is doing', () => {
  const { g, p } = ship('classic', CLASSIC);
  startDay(g);
  const r = g.completeTask(p[2].id, 'core');
  assert.deepStrictEqual({ charge: r.charge, needed: r.needed, today: r.today, contributors: r.contributors }, { charge: 1, needed: 11, today: 1, contributors: 1 });
  assert.throws(() => g.completeTask(p[2].id, 'core'), /already/);
  const r2 = g.completeTask(p[3].id, 'core');
  assert.strictEqual(r2.contributors, 2);
  assert.strictEqual(g.viewFor(p[3].id).charge, 2);
});

test('the Array announces half charged, charged and overcharged', () => {
  const { g, p } = ship('classic', CLASSIC);
  startDay(g);
  const said = () => g.log.map((l) => l.text).filter((t) => t.startsWith('📡'));
  doTasks(g, p[2], 6); // 6 = half of 11
  assert.ok(said().some((t) => /half charged/.test(t)));
  for (const q of [p[3], p[4]]) doTasks(g, q, 5); // 16 in all
  assert.ok(said().some((t) => /CHARGED/.test(t) && /clue/.test(t)));
  assert.ok(!said().some((t) => /OVERCHARGED/.test(t)));
  for (const q of [p[5], p[6]]) doTasks(g, q, 6); // 28 in all
  assert.ok(said().some((t) => /OVERCHARGED/.test(t)));
});

test('a charged Array brings a clue at dawn, decoded for everyone who helped, and keeps the leftovers', () => {
  const { g, p } = ship('classic', CLASSIC);
  startDay(g);
  doTasks(g, p[2], 6);
  doTasks(g, p[3], 6); // 12 charges, 11 needed
  nextDay(g);
  assert.ok(g.clue, 'a clue is coming');
  assert.strictEqual(g.clue2, null);
  assert.strictEqual(g.charge, 12 - g.chargeNeeded(), 'whatever is left over carries on (and one died in the night, so fewer are needed)');
  assert.ok(g.charge > 0);
  for (const helper of [p[2], p[3]]) assert.ok(helper.notes.some((n) => /Decoded/.test(n.text)), `${helper.name} got the clue decoded`);
  assert.ok(!p[4].notes.some((n) => /Decoded/.test(n.text)), 'somebody who did nothing has to watch the window');
  assert.strictEqual(g.contributors.size, 0, 'the next cycle starts afresh');
});

test('an overcharged Array brings a second, different clue later the same day', () => {
  const { g, p } = ship('classic', CLASSIC);
  startDay(g);
  for (const q of [p[2], p[3], p[4], p[5], p[6]]) doTasks(g, q, 5); // 25 charges, 22 for two clues
  nextDay(g);
  assert.ok(g.clue && g.clue2, 'two clues');
  assert.notStrictEqual(g.clue.kind, g.clue2.kind, 'never the same kind twice');
  assert.strictEqual(g.clue.team, g.clue2.team);
  assert.strictEqual(g.charge, 25 - 2 * g.chargeNeeded());
  const note = p[2].notes.find((n) => /Decoded/.test(n.text)).text;
  assert.ok(/BONUS/.test(note), 'both clues are decoded');
  g.beginRoam(20_000);
  assert.ok(g.clue.at < g.clue2.at, 'the bonus clue comes later');
  assert.ok(g.clue.until < g.clue2.at, 'and after the first has gone');
  assert.ok(g.clue2.until <= 20_000 + g.dur('roam'), 'and before the day is over');
  // the window shows whichever clue is up
  assert.strictEqual(g.viewFor(p[2].id).clue, null);
  assert.strictEqual(g.viewFor(p[2].id).clue?.kind, undefined);
  assert.strictEqual(g.activeClue(g.clue.at + 1000), g.clue);
  assert.strictEqual(g.activeClue(g.clue2.at + 1000), g.clue2);
  assert.strictEqual(g.clueView(g.clue2, g.clue2.at + 1000).kind, g.clue2.kind);
  assert.strictEqual(g.activeClue(g.clue.until + 3000), null, 'between the two, nothing is up');
});

test('every kind of clue can be put into plain words', () => {
  const { g } = ship('classic', CLASSIC);
  for (const kind of ['dead-constellation', 'living-constellation', 'comets', 'probe', 'drift-count', 'role-comets']) {
    const team = ['dead-constellation', 'comets', 'probe'].includes(kind) ? 'crew' : 'infiltrators';
    const clue = require('../server/storyteller').makeClue(g, seeded(5), { team, kind });
    const text = g.describeClue(clue);
    assert.ok(text && text.length > 10 && !/undefined|\[object/.test(text), `${clue.kind}: ${text}`);
  }
});

test('the top technician of the day gets a small, true secret from ARIA', () => {
  const { g, p, role } = ship('classic', CLASSIC);
  startDay(g);
  doTasks(g, p[2], 3);
  doTasks(g, p[3], 2);
  doTasks(g, p[4], 1); // one task is not enough to qualify
  g.beginMeeting(5000);
  g.beginNominations(5000);
  g.beginDusk(5000);
  if (g.phase !== 'night') g.beginNight(5001);
  const hero = p[2];
  const note = hero.notes.find((n) => /top technician/.test(n.text));
  assert.ok(note, 'the most tasks wins');
  assert.ok(/\(3\)/.test(note.text));
  const named = g.players.find((o) => o !== hero && note.text.includes(`${o.name} is NOT the Parasite`));
  assert.ok(named && named !== role('parasite'), `the secret is true (${note.text})`);
  assert.ok(!p[3].notes.some((n) => /top technician/.test(n.text)));
  assert.ok(g.log.some((l) => /top technician/.test(l.text)));
  assert.ok(g.chapter?.events?.some((e) => e.k === 'hero') || g.history.flatMap((h) => h.events || []).some((e) => e.k === 'hero'));
});

test('nobody is top technician without two tasks, and the Citadel keeps its Shield instead', () => {
  const quiet = ship('classic', CLASSIC);
  startDay(quiet.g);
  doTasks(quiet.g, quiet.p[2], 1);
  quiet.g.beginMeeting(5000);
  quiet.g.beginNominations(5000);
  quiet.g.beginDusk(5000);
  if (quiet.g.phase !== 'night') quiet.g.beginNight(5001);
  assert.ok(!quiet.g.players.some((o) => o.notes.some((n) => /top technician/.test(n.text))));

  const citadel = ship('traitors', ['headtraitor', 'recruiter', 'seer', 'daggerbearer', 'guardian', 'loyalist', 'comms']);
  startDay(citadel.g);
  doTasks(citadel.g, citadel.p[2], 3);
  citadel.g.beginMeeting(5000);
  citadel.g.beginNominations(5000);
  citadel.g.beginDusk(5000);
  if (citadel.g.phase !== 'night') citadel.g.beginNight(5001);
  assert.ok(!citadel.g.players.some((o) => o.notes.some((n) => /top technician/.test(n.text))), 'no hero in the Citadel');
  assert.ok(citadel.p[2].notes.some((n) => /Shield/.test(n.text)), 'the Shield is the reward there');
});

test('ghosts can do tasks, and they count', () => {
  const { g, p } = ship('classic', CLASSIC);
  startDay(g);
  g.kill(p[4], 'test');
  const r = g.completeTask(p[4].id, 'samples');
  assert.strictEqual(r.charge, 1);
  assert.ok(g.contributors.has(p[4].id));
});

test('the Array survives a server restart, with who has helped', () => {
  const { g, p } = ship('classic', CLASSIC);
  startDay(g);
  doTasks(g, p[2], 4);
  const rooms = new Map([['TEST', { code: 'TEST', game: g }]]);
  const [back] = persist.deserialize(persist.serialize(rooms, 1000), 1500);
  assert.strictEqual(back.game.charge, 4);
  assert.ok(back.game.contributors instanceof Set && back.game.contributors.has(p[2].id));
});

test('robots do tasks, so the Array fills in a robot game', () => {
  const { runBots } = require('../server/bots');
  const random = seeded(9);
  const g = new Game('BOTS', { random });
  const host = g.addPlayer('Host');
  for (let i = 1; i < 8; i++) g.addBot(host.id);
  g.pace = 0.05;
  g.start(host.id, 1000);
  g.players[0].isBot = true;
  const room = { code: 'BOTS', game: g, positions: {} };
  const api = { say() {}, sayNear() {}, emote() {} };
  let now = 1000;
  let most = 0;
  for (let i = 0; i < 40_000 && g.phase !== 'ended'; i++) {
    now += 250;
    runBots(room, now, api, 0.25);
    g.tick(now);
    most = Math.max(most, g.charge);
  }
  assert.strictEqual(g.phase, 'ended');
  assert.ok(most > 0, 'robots charged the Array');
});

// The eight newer Demons, two for every script: the Singularity and the Leech (Black Hole Blues), the Fire Eater
// and the Jackpot (Cosmic Carnival), the Mould and the Husk (Outbreak), the Count and the Poisoner (the Citadel).
// Run with: npm test
const test = require('node:test');
const assert = require('node:assert');
const { Game } = require('../server/engine');
const { ROLES } = require('../server/roles');
const { SCRIPTS } = require('../server/scripts');
const { DEMON_ROLES } = require('../server/roles-demons');
const st = require('../server/storyteller');

function seeded(seed = 1) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ship(script, deal, { seed = 1, random = null } = {}) {
  const g = new Game('TEST', { random: random || seeded(seed) });
  g.script = script;
  const p = deal.map((_, i) => g.addPlayer(`P${i}`));
  g.start(p[0].id, 0, { deal });
  const role = (r) => g.players.find((x) => x.role === r);
  return { g, p, role };
}

// One night with these choices, then dawn. So that nothing random gets in the way, anyone not told what to do
// does something harmless: a Hacker glitches themselves, protectors guard the evil team, once-a-game abilities wait.
function night(g, choices = {}, now = 1000) {
  choices = { ...choices };
  const evil = g.players.slice(0, 2);
  for (const [pid, prompt] of Object.entries(g.prompts)) {
    if (pid in choices) continue;
    const p = g.get(pid);
    if (prompt.once) choices[pid] = [];
    else if (p.role === 'hacker') choices[pid] = [pid];
    else if (['medic', 'guardian', 'vaccinator'].includes(p.role)) choices[pid] = [evil.find((e) => e.id !== pid && e.id !== p.lastPick && e.alive).id];
  }
  for (const [pid, targets] of Object.entries(choices)) g.submitChoice(pid, targets, now);
  g.resolveNight(now);
  g.applyDraft(now + 1);
}

// from dawn to the next night, with this player airlocked (or nobody)
function nextNight(g, { airlock = null, now = 3000 } = {}) {
  g.beginRoam(now);
  g.beginMeeting(now);
  g.beginNominations(now);
  if (airlock) g.block = { id: airlock, votes: 9 };
  g.beginDusk(now);
  if (g.phase === 'lastwords') g.finishLastWords(now);
  if (g.winner) return;
  if (g.phase !== 'night') g.beginNight(now + 1);
}

const dead = (g) => g.players.filter((p) => !p.alive).map((p) => p.role).sort();

test('two new Demons in every script, each with a card, a model case and its own rule', () => {
  const ids = Object.keys(DEMON_ROLES);
  assert.strictEqual(ids.length, 8);
  for (const [script, mine] of [['classic', ['singularity', 'leech']], ['carnival', ['fireeater', 'jackpot']], ['outbreak', ['mould', 'husk']], ['traitors', ['count', 'poisoner']]]) {
    for (const id of mine) {
      assert.ok(SCRIPTS[script].demons.includes(id) && SCRIPTS[script].roles.includes(id), `${id} in ${script}`);
      assert.strictEqual(ROLES[id].type, 'parasite');
      assert.ok(ROLES[id].ability && ROLES[id].tips.length >= 3 && ROLES[id].flavor && ROLES[id].icon);
    }
  }
  // each one turns up sometimes, and the script's first Demon still turns up most
  for (const script of ['classic', 'carnival', 'outbreak', 'traitors']) {
    const seen = {};
    for (let seed = 1; seed <= 400; seed++) {
      const roles = st.pickRoles(9, seeded(seed), script);
      const demon = roles.find((r) => ROLES[r].type === 'parasite');
      seen[demon] = (seen[demon] || 0) + 1;
    }
    for (const id of SCRIPTS[script].demons) assert.ok(seen[id] > 20, `${script}: ${id} seen ${seen[id] || 0} times`);
  }
});

test('the Singularity: choosing itself charges up (nobody dies), then it takes three', () => {
  const { g, role } = ship('classic', ['singularity', 'hacker', 'comms', 'engineer', 'scanner', 'coroner', 'medic']);
  const s = role('singularity');
  assert.ok(!g.prompts[s.id], 'no kill on the first night');
  night(g);
  nextNight(g);
  assert.strictEqual(g.prompts[s.id].choose, 1);
  assert.ok(!g.prompts[s.id].notSelf, 'it may choose itself');
  night(g, { [s.id]: [s.id] });
  assert.deepStrictEqual(dead(g), [], 'charging: nobody died');
  assert.ok(s.alive && g.singularityCharged);
  nextNight(g);
  assert.strictEqual(g.prompts[s.id].choose, 3);
  assert.ok(g.prompts[s.id].notSelf && g.prompts[s.id].charged);
  night(g, { [s.id]: [role('comms').id, role('engineer').id, role('scanner').id] });
  assert.deepStrictEqual(dead(g), ['comms', 'engineer', 'scanner']);
  assert.ok(!g.singularityCharged, 'spent');
  nextNight(g);
  assert.strictEqual(g.prompts[s.id]?.choose, 1);
});

test('the Leech: latches on the first night, breaks its host, cannot die while the host lives, dies with it', () => {
  const { g, role } = ship('classic', ['leech', 'hacker', 'comms', 'engineer', 'scanner', 'coroner', 'medic']);
  const l = role('leech');
  const host = role('engineer');
  assert.ok(g.prompts[l.id], 'the Leech wakes on the first night');
  night(g, { [l.id]: [host.id] });
  assert.deepStrictEqual(dead(g), [], 'latching kills nobody');
  assert.deepStrictEqual(g.leech, { id: l.id, host: host.id });
  assert.ok(g.broken(host), "the host's ability malfunctions");
  assert.ok(!g.broken(role('comms')));
  assert.ok(l.notes.some((n) => /latched onto/.test(n.text)));
  // airlocked: it crawls back in
  nextNight(g, { airlock: l.id });
  assert.ok(l.alive && !g.winner);
  assert.strictEqual(g.history.flatMap((h) => h.events || []).filter((e) => e.k === 'leech-hold').length, 1);
  // it kills from the second night on
  night(g, { [l.id]: [role('comms').id] });
  assert.deepStrictEqual(dead(g), ['comms']);
  // kill the host and the Leech goes too: the crew wins
  nextNight(g, { airlock: host.id });
  assert.ok(!host.alive && !l.alive);
  assert.strictEqual(g.winner, 'crew');
});

test('the Fire Eater: two a night, and sometimes spits one of them back out', () => {
  const { g, role } = ship('carnival', ['fireeater', 'hexer', 'liontamer', 'acrobat', 'palmreader', 'tickettaker', 'stagehand'], { random: () => 0.1 });
  const f = role('fireeater');
  night(g);
  nextNight(g);
  assert.strictEqual(g.prompts[f.id].choose, 2);
  night(g, { [f.id]: [role('palmreader').id, role('tickettaker').id] });
  assert.deepStrictEqual(dead(g), ['palmreader', 'tickettaker']);
  assert.deepStrictEqual(g.fireLast.sort(), [role('palmreader').id, role('tickettaker').id].sort());
  nextNight(g);
  night(g, { [f.id]: [role('stagehand').id, role('liontamer').id] });
  // (with luck on its side) one of last night's two came back
  const back = [role('palmreader'), role('tickettaker')].filter((p) => p.alive);
  assert.strictEqual(back.length, 1);
  assert.ok(back[0].notes.some((n) => /spat back out/.test(n.text)));
  assert.ok(!role('stagehand').alive && !role('liontamer').alive);
});

test('the Jackpot: three on the wheel; whoever chooses DIE dies, and if all three choose LIVE, all three die', () => {
  const deal = ['jackpot', 'hexer', 'liontamer', 'acrobat', 'palmreader', 'tickettaker', 'stagehand'];
  const spin = (answers) => {
    const { g, role } = ship('carnival', deal);
    const j = role('jackpot');
    night(g);
    nextNight(g);
    assert.strictEqual(g.prompts[j.id].choose, 3);
    const three = [role('palmreader'), role('tickettaker'), role('stagehand')];
    night(g, { [j.id]: three.map((p) => p.id) });
    assert.deepStrictEqual(dead(g), [], 'nobody dies in the night');
    assert.deepStrictEqual(g.viewFor(three[0].id).you.jackpot, { until: null, chosen: false });
    assert.deepStrictEqual(g.viewFor(role('liontamer').id).wheel.ids, three.map((p) => p.id), 'everyone sees the wheel');
    assert.strictEqual(g.viewFor(role('liontamer').id).you.jackpot, null);
    assert.throws(() => g.chooseJackpot(role('liontamer').id, true), /not on the wheel/);
    answers.forEach((a, i) => a != null && g.chooseJackpot(three[i].id, a, 5000));
    if (g.jackpot) {
      g.tick(5000); // starts the clock
      g.tick(5000 + 31_000); // and runs out: no answer counts as LIVE
    }
    assert.strictEqual(g.jackpot, null);
    return { g, three };
  };
  let r = spin([true, false, true]);
  assert.deepStrictEqual(r.three.map((p) => p.alive), [true, false, true]);
  r = spin([true, true, true]);
  assert.deepStrictEqual(r.three.map((p) => p.alive), [false, false, false]);
  r = spin([false, null, null]);
  assert.deepStrictEqual(r.three.map((p) => p.alive), [false, true, true]);
});

test("the Mould: its spores break the nearest Crew player on each side, and it kills from night 2", () => {
  const { g, role } = ship('outbreak', ['mould', 'quack', 'vaccinator', 'tracer', 'hazmat', 'sensor', 'scanner']);
  const mould = role('mould');
  // seat 6 (the Scanner) on one side; on the other the Quack is a Saboteur, so the spores reach the Vaccinator
  assert.deepStrictEqual(g.sporeTargets().sort(), [role('scanner').id, role('vaccinator').id].sort());
  assert.ok(g.broken(role('scanner')) && g.broken(role('vaccinator')));
  assert.ok(!g.broken(role('tracer')) && !g.broken(role('quack')));
  night(g);
  nextNight(g);
  night(g, { [mould.id]: [role('scanner').id] });
  assert.deepStrictEqual(dead(g), ['scanner']);
  assert.ok(g.broken(role('sensor')), 'the spores reach the next Crew player along');
  // airlock the Mould and the spores stop
  nextNight(g, { airlock: mould.id });
  assert.strictEqual(g.winner, 'crew');
  assert.ok(!g.broken(role('sensor')));
});

test('the Husk: only feeds after a day with no death, and gets back up the first time it dies', () => {
  const { g, role } = ship('outbreak', ['husk', 'quack', 'bioterrorist', 'vaccinator', 'tracer', 'hazmat', 'sensor', 'scanner', 'engineer', 'comms']);
  const h = role('husk');
  night(g);
  nextNight(g, { airlock: role('engineer').id }); // somebody died today
  assert.ok(!g.prompts[h.id], 'hungry tonight');
  night(g);
  nextNight(g); // a quiet day
  assert.ok(g.prompts[h.id], 'feeds tonight');
  night(g, { [h.id]: [role('comms').id] });
  assert.ok(!role('comms').alive);
  // airlocked: dead, but the game goes on
  nextNight(g, { airlock: h.id });
  assert.ok(!h.alive && !g.winner);
  night(g);
  assert.ok(h.alive, 'back up at dawn');
  assert.ok(h.notes.some((n) => /get back up/.test(n.text)));
  // the second time, it stays down
  nextNight(g, { airlock: h.id });
  assert.ok(!h.alive);
  assert.strictEqual(g.winner, 'crew');
});

test('the Count: the first bite turns a Faithful into a Traitor; after that it murders', () => {
  const { g, role } = ship('traitors', ['count', 'recruiter', 'seer', 'daggerbearer', 'guardian', 'loyalist', 'comms']);
  const c = role('count');
  const seer = role('seer');
  night(g);
  nextNight(g);
  night(g, { [c.id]: [seer.id] });
  assert.ok(seer.alive);
  assert.strictEqual(seer.role, 'recruit');
  assert.ok(g.countBit);
  assert.ok(seer.notes.some((n) => /Count has bitten you/.test(n.text)));
  assert.ok(role('recruiter').notes.some((n) => /one of you now/.test(n.text)));
  nextNight(g);
  night(g, { [c.id]: [role('comms').id] });
  assert.ok(!role('comms').alive, 'the second bite kills');

  // a Loyalist cannot be turned: the bite kills them, and the Count may still turn someone later
  const b = ship('traitors', ['count', 'recruiter', 'seer', 'daggerbearer', 'guardian', 'loyalist', 'comms']);
  night(b.g);
  nextNight(b.g);
  night(b.g, { [b.role('count').id]: [b.role('loyalist').id] });
  assert.ok(!b.role('loyalist').alive);
  assert.ok(!b.g.countBit);
});

test('the Poisoner: the victim walks about all day and drops dead at dusk, unless the Poisoner is banished first', () => {
  const deal = ['poisoner', 'recruiter', 'seer', 'daggerbearer', 'guardian', 'loyalist', 'comms'];
  const { g, role } = ship('traitors', deal);
  const pz = role('poisoner');
  night(g);
  nextNight(g);
  night(g, { [pz.id]: [role('comms').id] });
  assert.ok(role('comms').alive, 'alive at breakfast');
  assert.ok(!role('comms').notes.some((n) => /poison/i.test(n.text)), 'and not told');
  nextNight(g);
  assert.ok(!role('comms').alive, 'dropped dead as the day ended');
  assert.ok(g.log.some((l) => /POISONED/.test(l.text)));

  const b = ship('traitors', deal);
  night(b.g);
  nextNight(b.g);
  night(b.g, { [b.role('poisoner').id]: [b.role('comms').id] });
  nextNight(b.g, { airlock: b.role('poisoner').id });
  assert.ok(b.role('comms').alive, 'the Poisoner was banished first: the poison fails');
});

// a valid cast for this script with this Demon in place of the usual one
function castWith(id, script, n, random) {
  const roles = st.pickRoles(n, random, script);
  const i = roles.findIndex((r) => ROLES[r].type === 'parasite');
  roles[i] = id;
  return st.validateRoles(roles, n, script) ? null : roles;
}

test('robots play every new Demon to the end of a game, wheel and all', () => {
  const { runBots } = require('../server/bots');
  const covered = new Set();
  let wheels = 0;
  for (const id of Object.keys(DEMON_ROLES)) {
    const script = Object.values(SCRIPTS).find((s) => s.demons.includes(id));
    for (const n of [7, 10, 13]) {
      const random = seeded(n * 31 + id.length);
      const deal = castWith(id, script.id, n, random);
      assert.ok(deal, `${id}: a valid ${n}-player cast`);
      const g = new Game('BOTS', { random });
      g.script = script.id;
      const host = g.addPlayer('Host');
      for (let i = 1; i < n; i++) g.addBot(host.id);
      g.pace = 0.05;
      g.start(host.id, 1000, { deal: st.shuffle(deal, random) });
      g.players[0].isBot = true;
      const room = { code: 'BOTS', game: g, positions: {} };
      const api = { say() {}, sayNear() {}, emote() {} };
      let now = 1000;
      for (let i = 0; i < 60_000 && g.phase !== 'ended'; i++) {
        now += 250;
        runBots(room, now, api, 0.25);
        g.tick(now);
      }
      assert.strictEqual(g.phase, 'ended', `${script.id} with the ${id} (${n} players): the robot game finishes`);
      assert.ok(['crew', 'infiltrators'].includes(g.winner));
      wheels += g.history.flatMap((h) => h.events || []).filter((e) => e.k === 'jackpot').length;
      covered.add(id);
    }
  }
  assert.strictEqual(covered.size, 8);
  assert.ok(wheels > 0, 'the robots spun the wheel');
});

// The fourth wave of roles: a Crew role, a Drifter and a Saboteur for every script. Run with: npm test
const test = require('node:test');
const assert = require('node:assert');
const { Game } = require('../server/engine');
const { ROLES } = require('../server/roles');
const { SCRIPTS } = require('../server/scripts');
const { WAVE4_ROLES } = require('../server/roles-wave4');
const st = require('../server/storyteller');

function seeded(seed = 1) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ship(script, deal, { seed = 1 } = {}) {
  const g = new Game('TEST', { random: seeded(seed) });
  g.script = script;
  const p = deal.map((_, i) => g.addPlayer(`P${i}`));
  g.start(p[0].id, 0, { deal });
  const role = (r) => g.players.find((x) => x.role === r);
  return { g, p, role };
}

// One night with these choices, then dawn. Anyone not told what to do does something harmless: a Hacker glitches
// themselves, once-a-game abilities wait, and everyone else points at the evil team's second seat (or the first).
function night(g, choices = {}, now = 1000) {
  choices = { ...choices };
  for (const [pid, prompt] of Object.entries(g.prompts)) {
    if (pid in choices) continue;
    const p = g.get(pid);
    if (prompt.once) choices[pid] = [];
    else if (p.role === 'hacker') choices[pid] = [pid];
    else {
      const ok = (o) => o.alive && !(prompt.notSelf && o.id === pid) && !(prompt.notRepeat && p.lastPick === o.id);
      const pool = [g.players[1], g.players[0], ...g.players.slice(2)].filter(ok).filter((o) => o !== g.players[0] || ROLES[p.role].type !== 'crew' || ['medic', 'guardian', 'vaccinator'].includes(p.role));
      choices[pid] = pool.slice(0, prompt.choose).map((o) => o.id);
    }
  }
  for (const [pid, targets] of Object.entries(choices)) g.submitChoice(pid, targets, now);
  g.resolveNight(now);
  g.applyDraft(now + 1);
}

function nextNight(g, { airlock = null, now = 3000, before = null } = {}) {
  g.beginRoam(now);
  before?.();
  g.beginMeeting(now);
  g.beginNominations(now);
  if (airlock) g.block = { id: airlock, votes: 9 };
  g.beginDusk(now);
  if (g.phase === 'lastwords') g.finishLastWords(now);
  if (g.winner) return;
  if (g.phase !== 'night') g.beginNight(now + 1);
}

const events = (g, k) => g.history.flatMap((h) => h.events || []).filter((e) => e.k === k);

test('a Crew role, a Drifter and a Saboteur for every script, each with a card and a model', () => {
  const expected = { classic: ['mentor', 'stargazer', 'airlocktech'], carnival: ['strongman', 'heartthrob', 'showboat'], outbreak: ['pathologist', 'superspreader', 'mutagen'], traitors: ['blacksmith', 'courtfool', 'avenger'] };
  assert.strictEqual(Object.keys(WAVE4_ROLES).length, 12);
  for (const [script, ids] of Object.entries(expected)) {
    assert.deepStrictEqual(ids.map((id) => ROLES[id].type), ['crew', 'drifter', 'saboteur']);
    for (const id of ids) {
      assert.ok(SCRIPTS[script].roles.includes(id), `${id} in ${script}`);
      assert.ok(ROLES[id].ability && ROLES[id].tips.length >= 3 && ROLES[id].flavor && ROLES[id].icon, id);
    }
  }
});

test('Mentor: learns a good player, and dies too if the Parasite kills them', () => {
  const { g, role } = ship('classic', ['parasite', 'hacker', 'mentor', 'engineer', 'scanner', 'coroner', 'medic']);
  const mentor = role('mentor');
  night(g);
  const pupil = g.get(mentor.pupil);
  assert.ok(pupil && pupil !== mentor && ROLES[pupil.role].type !== 'parasite' && pupil.role !== 'hacker');
  assert.ok(mentor.notes.some((n) => n.text.includes(pupil.name) && n.text.includes(ROLES[pupil.role].name)));
  nextNight(g);
  night(g, { [role('parasite').id]: [pupil.id], [role('medic').id]: [role('hacker').id] });
  assert.ok(!pupil.alive && !mentor.alive, 'the Mentor died with their pupil');
  assert.strictEqual(events(g, 'grief').length, 1);
});

test('Stargazer: on death, points at someone; a good player dies, an evil one does not', () => {
  const deal = ['parasite', 'hacker', 'stargazer', 'comms', 'engineer', 'scanner', 'coroner', 'medic'];
  let { g, role } = ship('classic', deal);
  night(g);
  nextNight(g, { airlock: role('stargazer').id });
  assert.deepStrictEqual(g.viewFor(role('stargazer').id).you.wish.role, 'stargazer');
  g.chooseWish(role('stargazer').id, role('comms').id);
  assert.ok(!role('comms').alive, 'a good player falls');
  assert.strictEqual(g.wish, null);

  ({ g, role } = ship('classic', deal));
  night(g);
  nextNight(g, { airlock: role('stargazer').id });
  g.chooseWish(role('stargazer').id, role('hacker').id);
  assert.ok(role('hacker').alive, 'an evil one does not');
});

test('Airlock Tech: the rigged hatch will not open, and not the same player two nights running', () => {
  const { g, role } = ship('classic', ['parasite', 'airlocktech', 'comms', 'engineer', 'scanner', 'coroner', 'medic']);
  const tech = role('airlocktech');
  const demon = role('parasite');
  night(g, { [tech.id]: [demon.id] });
  nextNight(g, { airlock: demon.id });
  assert.ok(demon.alive && !g.winner, 'the Parasite walks back out');
  assert.strictEqual(events(g, 'rigged').length, 1);
  assert.throws(() => g.submitChoice(tech.id, [demon.id], 4000), /last night/);
  // a rig only lasts one day
  night(g, { [tech.id]: [role('comms').id] });
  nextNight(g, { airlock: demon.id });
  assert.strictEqual(g.winner, 'crew');
});

test('Strongman: while both neighbours are good, the Parasite cannot kill them', () => {
  const guarded = ship('carnival', ['parasite', 'hexer', 'liontamer', 'strongman', 'palmreader', 'tickettaker', 'stagehand']);
  night(guarded.g);
  nextNight(guarded.g);
  night(guarded.g, { [guarded.role('parasite').id]: [guarded.role('palmreader').id] });
  assert.ok(guarded.role('palmreader').alive);
  assert.ok(events(guarded.g, 'kill').some((e) => e.result === 'strongman'));
  // next to the Hexer, it protects nobody
  const open = ship('carnival', ['parasite', 'hexer', 'strongman', 'liontamer', 'palmreader', 'tickettaker', 'stagehand']);
  night(open.g);
  nextNight(open.g);
  night(open.g, { [open.role('parasite').id]: [open.role('liontamer').id] });
  assert.ok(!open.role('liontamer').alive);
});

test("Heartthrob: when it dies, someone's ability is broken for the rest of the game", () => {
  const { g, role } = ship('carnival', ['parasite', 'hexer', 'heartthrob', 'liontamer', 'acrobat', 'palmreader', 'tickettaker', 'stagehand']);
  night(g);
  assert.strictEqual(g.heartbroken, null);
  nextNight(g, { airlock: role('heartthrob').id });
  const broken = g.get(g.heartbroken);
  assert.ok(broken && broken.alive);
  assert.ok(g.broken(broken));
  assert.ok(g.log.some((l) => /a heart breaks/.test(l.text)));
});

test('Showboat: claim it, get airlocked the same day, and evil wins', () => {
  const deal = ['parasite', 'showboat', 'liontamer', 'acrobat', 'palmreader', 'tickettaker', 'stagehand'];
  let { g, role } = ship('carnival', deal);
  night(g);
  nextNight(g, { airlock: role('showboat').id, before: () => g.setClaim(role('showboat').id, 'showboat', '') });
  assert.strictEqual(g.winner, 'infiltrators');
  // without the claim it is just an airlocking
  ({ g, role } = ship('carnival', deal));
  night(g);
  nextNight(g, { airlock: role('showboat').id });
  assert.ok(!g.winner);
  // and yesterday's claim does not count
  ({ g, role } = ship('carnival', deal));
  night(g);
  g.beginRoam(2000);
  g.setClaim(role('showboat').id, 'showboat', '');
  nextNight(g);
  night(g);
  nextNight(g, { airlock: role('showboat').id });
  assert.ok(!g.winner);
});

test('Pathologist: dying at night, learns the Demon is 1 of 2 players', () => {
  const { g, role } = ship('outbreak', ['carrier', 'quack', 'pathologist', 'tracer', 'hazmat', 'sensor', 'scanner']);
  const path = role('pathologist');
  night(g, { [role('carrier').id]: [path.id] });
  nextNight(g);
  night(g, { [role('carrier').id]: [role('scanner').id] });
  assert.ok(!path.alive, 'burst');
  const note = path.notes.find((n) => /the Demon is/.test(n.text));
  assert.ok(note && note.text.includes(role('carrier').name));
});

test('Superspreader: bursts all over both neighbours', () => {
  const { g, role } = ship('outbreak', ['carrier', 'quack', 'superspreader', 'tracer', 'hazmat', 'sensor', 'scanner', 'engineer']);
  const ss = role('superspreader');
  night(g, { [role('carrier').id]: [ss.id] });
  nextNight(g);
  night(g, { [role('carrier').id]: [role('scanner').id] });
  assert.ok(!ss.alive);
  assert.ok(role('quack').infected != null && role('tracer').infected != null, 'both neighbours caught it');
});

test('Mutagen: an infected player bursts tonight, even if the Vaccinator gets there', () => {
  const { g, role } = ship('outbreak', ['carrier', 'mutagen', 'vaccinator', 'tracer', 'hazmat', 'sensor', 'scanner']);
  const sick = role('tracer');
  night(g, { [role('carrier').id]: [sick.id] });
  nextNight(g);
  night(g, { [role('mutagen').id]: [sick.id], [role('vaccinator').id]: [sick.id], [role('carrier').id]: [role('scanner').id] });
  assert.ok(!sick.alive);
  assert.ok(events(g, 'mutate').some((e) => e.works));
});

test("Blacksmith: a forged Shield stops one murder, then it's gone", () => {
  const { g, role } = ship('traitors', ['headtraitor', 'recruiter', 'blacksmith', 'seer', 'guardian', 'loyalist', 'comms']);
  const ward = role('comms');
  night(g, { [role('blacksmith').id]: [ward.id] });
  assert.ok(ward.forged);
  assert.ok(ward.notes.some((n) => /forged you a Shield/.test(n.text)));
  nextNight(g);
  night(g, { [role('headtraitor').id]: [ward.id] });
  assert.ok(ward.alive && !ward.forged, 'saved once');
  nextNight(g);
  night(g, { [role('headtraitor').id]: [ward.id] });
  assert.ok(!ward.alive, 'not twice');
});

test('Court Fool: banish it and the Traitors murder two that night', () => {
  const { g, role } = ship('traitors', ['headtraitor', 'recruiter', 'courtfool', 'seer', 'guardian', 'loyalist', 'comms', 'archivist']);
  const ht = role('headtraitor');
  night(g);
  nextNight(g, { airlock: role('courtfool').id });
  assert.strictEqual(g.prompts[ht.id].choose, 2);
  night(g, { [ht.id]: [role('comms').id, role('archivist').id] });
  assert.ok(!role('comms').alive && !role('archivist').alive);
  nextNight(g);
  assert.strictEqual(g.prompts[ht.id].choose, 1, 'only that one night');
});

test('Avenger: only wakes after a Traitor is banished, and kills', () => {
  const { g, role } = ship('traitors', ['headtraitor', 'avenger', 'recruiter', 'seer', 'guardian', 'loyalist', 'comms', 'archivist', 'navigator', 'engineer']);
  const av = role('avenger');
  night(g);
  nextNight(g);
  assert.ok(!g.prompts[av.id], 'nobody to avenge');
  night(g, { [role('headtraitor').id]: [role('navigator').id] });
  nextNight(g, { airlock: role('recruiter').id });
  assert.ok(g.prompts[av.id], 'a Traitor was banished');
  night(g, { [av.id]: [role('comms').id], [role('headtraitor').id]: [role('archivist').id] });
  assert.ok(!role('comms').alive && !role('archivist').alive);
});

// a valid cast for this script with this role in it, in place of another of the same type
function castWith(id, script, n, random) {
  for (let k = 0; k < 50; k++) {
    const roles = st.pickRoles(n, random, script);
    if (roles.includes(id)) return roles;
    const swap = roles.findIndex((r) => ROLES[r].type === ROLES[id].type && !['smuggler', 'drunk'].includes(r));
    if (swap < 0) continue;
    roles[swap] = id;
    if (!st.validateRoles(roles, n, script)) return roles;
  }
  return null;
}

test('robots play every new role to the end of a game', () => {
  const { runBots } = require('../server/bots');
  const covered = new Set();
  for (const id of Object.keys(WAVE4_ROLES)) {
    const script = Object.values(SCRIPTS).find((s) => s.roles.includes(id));
    for (const n of [8, 12]) {
      const random = seeded(n * 53 + id.length);
      const deal = castWith(id, script.id, n, random);
      if (!deal) continue;
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
      covered.add(id);
    }
  }
  assert.deepStrictEqual(Object.keys(WAVE4_ROLES).filter((id) => !covered.has(id)), []);
});

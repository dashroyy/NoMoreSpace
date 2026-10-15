// The new roles of every script: Quartermaster, Diagnostics Tech, Pathfinder, Peacekeeper, Barker, Sniffer Dog,
// Cupbearer, Daredevil, Conspiracy Theorist, Mime, Antibody, Mastermind, Signal Jammer, Framer, Pickpocket,
// the Black-Market Pharmacist and the Cuckoo. Run with: npm test
const test = require('node:test');
const assert = require('node:assert');
const { Game } = require('../server/engine');
const { ROLES } = require('../server/roles');
const { SCRIPTS, inScript } = require('../server/scripts');
const { EXTRA_ROLES } = require('../server/roles-extra');
const st = require('../server/storyteller');

function seeded(seed = 1) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A started game where seat i gets deal[i]. `random` can be a function you control (() => 0.1 and so on).
function ship(script, deal, { seed = 1, random = null } = {}) {
  const g = new Game('TEST', { random: random || seeded(seed) });
  g.script = script;
  const p = deal.map((_, i) => g.addPlayer(`P${i}`));
  g.start(p[0].id, 0, { deal });
  const role = (r) => g.players.find((x) => x.role === r);
  return { g, p, role };
}

// One night with these choices, then dawn. A Hacker nobody told what to do glitches themselves (harmlessly),
// so the tests do not depend on a random glitch landing on someone.
function night(g, choices = {}, now = 1000) {
  const hacker = g.players.find((p) => p.role === 'hacker' && p.alive);
  if (hacker && g.prompts[hacker.id] && !(hacker.id in choices)) choices = { ...choices, [hacker.id]: [hacker.id] };
  for (const [pid, targets] of Object.entries(choices)) g.submitChoice(pid, targets, now);
  g.resolveNight(now);
  g.applyDraft(now + 1);
}

// From dawn to the next night, with this player airlocked (or nobody). `visits` are [player, room] pairs.
function nextNight(g, { airlock = null, now = 3000, visits = [] } = {}) {
  g.beginRoam(now);
  for (const [pid, room] of visits) g.recordVisit(pid, room, now + 1);
  g.beginMeeting(now);
  g.beginNominations(now);
  if (airlock) g.block = { id: airlock, votes: 9 };
  g.beginDusk(now);
  if (g.phase === 'lastwords') g.finishLastWords(now);
  if (g.winner) return;
  if (g.phase !== 'night') g.beginNight(now + 1);
}

// A whole day, ending with this player airlocked (or nobody).
function dayToDusk(g, { airlock = null, now = 6000 } = {}) {
  g.beginRoam(now);
  g.beginMeeting(now);
  g.beginNominations(now);
  if (airlock) g.block = { id: airlock, votes: 9 };
  g.beginDusk(now);
  if (g.phase === 'lastwords') g.finishLastWords(now);
}

// Nominate and run the vote with these players' hands up.
function vote(g, nominator, nominee, voters = [], now = 3000) {
  g.nominate(nominator.id, nominee.id, now);
  for (const v of voters) g.setHand(v.id, true);
  let t = now;
  while (g.nomination) {
    t += 100_000;
    g.tickNomination(t);
  }
}

const last = (p) => p.notes.at(-1)?.text;
// a classic cast: the demon, a saboteur, then five crew
const SEVEN = (...mid) => ['parasite', 'hacker', ...mid];

// ---------------------------------------------------------------------------
// The cast
// ---------------------------------------------------------------------------

test('the new roles: every one is on a script, has a full card, and the scripts deal valid casts', () => {
  const ids = Object.keys(EXTRA_ROLES);
  assert.strictEqual(ids.length, 17);
  for (const id of ids) {
    const r = ROLES[id];
    assert.ok(r.name && r.icon && r.ability && r.flavor && r.tips.length >= 3, `${id} has a whole role card`);
    assert.ok(Object.values(SCRIPTS).some((s) => s.roles.includes(id)), `${id} is on at least one script`);
    if (r.type === 'crew' && r.tags.includes('info')) assert.ok(r.night, `${id}: an information role has to wake up`);
  }
  let cuckoos = 0;
  for (const script of Object.values(SCRIPTS)) {
    for (let n = script.minPlayers; n <= 15; n++) {
      for (let seed = 1; seed <= 30; seed++) {
        const roles = st.pickRoles(n, seeded(seed * 7 + n), script.id);
        assert.strictEqual(st.validateRoles(roles, n, script.id), null, `${script.id} n=${n} seed=${seed}: ${roles}`);
        assert.strictEqual(roles.filter((r) => ROLES[r].type === 'parasite').length, 1, 'exactly one Demon');
        if (roles.includes('cuckoo')) {
          cuckoos++;
          assert.ok(n >= 6, 'the Cuckoo only comes to bigger ships');
        }
        for (const r of roles) assert.ok(ROLES[r].minPlayers <= n, `${r} unlocked too early at ${n}`);
      }
    }
  }
  assert.ok(cuckoos > 0, 'the Cuckoo does get dealt');
  // roles are shared where it makes sense, and some are exclusive
  for (const s of ['classic', 'carnival', 'outbreak', 'traitors']) assert.ok(inScript('pathfinder', s), `the Pathfinder is on ${s}`);
  assert.ok(inScript('pharmacist', 'outbreak') && !inScript('pharmacist', 'classic'));
  assert.ok(inScript('cupbearer', 'traitors') && !inScript('cupbearer', 'carnival'));
  assert.ok(inScript('cuckoo', 'classic') && !inScript('cuckoo', 'carnival'));
});

test('the Daredevil dies with a story of its own', () => {
  for (const script of Object.keys(SCRIPTS)) {
    const story = st.dawnStory([{ name: 'Zed', cause: 'daredevil' }], seeded(3), script);
    assert.ok(st.DAREDEVIL_LINES.some((line) => line.replaceAll('{name}', 'Zed') === story), `${script}: ${story}`);
  }
});

// ---------------------------------------------------------------------------
// Crew
// ---------------------------------------------------------------------------

test('Quartermaster: once per game, learns if two players share a team (and can save it for later)', () => {
  const deal = SEVEN('quartermaster', 'comms', 'engineer', 'scanner', 'coroner');
  const { g, role } = ship('classic', deal);
  const qm = role('quartermaster');
  assert.ok(g.prompts[qm.id].once && g.prompts[qm.id].choose === 2);
  night(g, { [qm.id]: [role('hacker').id, role('parasite').id] });
  assert.match(last(qm), /are on the SAME team/);
  nextNight(g);
  assert.strictEqual(g.prompts[qm.id], undefined, 'the one look is spent');

  const b = ship('classic', deal);
  night(b.g, { [b.role('quartermaster').id]: [b.role('comms').id, b.role('hacker').id] });
  assert.match(last(b.role('quartermaster')), /DIFFERENT teams/);

  // saving it for later keeps it
  const c = ship('classic', deal);
  night(c.g, { [c.role('quartermaster').id]: [] });
  nextNight(c.g);
  assert.ok(c.g.prompts[c.role('quartermaster').id], 'still available on night 2');
});

test('Quartermaster: a glitched one is told the opposite', () => {
  const { g, role } = ship('classic', SEVEN('quartermaster', 'comms', 'engineer', 'scanner', 'coroner'));
  const qm = role('quartermaster');
  night(g, { [role('hacker').id]: [qm.id], [qm.id]: [role('hacker').id, role('parasite').id] });
  assert.match(last(qm), /DIFFERENT teams/, 'two evil players on the same team, read wrong');
});

test('Diagnostics Tech: counts the abilities that malfunctioned tonight (glitched players and the Space Drunk)', () => {
  const { g, role } = ship('classic', ['parasite', 'hacker', 'diagnostics', 'engineer', 'scanner', 'coroner', 'medic', 'drunk']);
  night(g, { [role('hacker').id]: [role('engineer').id] });
  assert.match(last(role('diagnostics')), /^2 abilities malfunctioned tonight/, 'the glitched Engineer and the Space Drunk');
  const clean = ship('classic', ['parasite', 'hacker', 'diagnostics', 'engineer', 'scanner', 'coroner', 'medic', 'stowaway']);
  night(clean.g);
  assert.match(last(clean.role('diagnostics')), /^1 ability malfunctioned/, 'a Hacker who glitches themselves counts once');
});

test('Pathfinder: learns the rooms a player entered today, from the second night on', () => {
  const { g, role } = ship('classic', SEVEN('pathfinder', 'comms', 'engineer', 'scanner', 'coroner'));
  const [pf, comms, parasite, coroner] = [role('pathfinder'), role('comms'), role('parasite'), role('coroner')];
  assert.strictEqual(g.prompts[pf.id], undefined, 'nobody has been anywhere on the first night');
  night(g);
  nextNight(g, { visits: [[comms.id, 'galley'], [comms.id, 'reactor'], [comms.id, 'galley']] });
  night(g, { [pf.id]: [comms.id], [parasite.id]: [coroner.id] }, 5000);
  assert.match(last(pf), /walked into: the Galley, the Reactor\./);
  nextNight(g, { now: 8000 });
  night(g, { [pf.id]: [role('engineer').id], [parasite.id]: [role('scanner').id] }, 9000);
  assert.match(last(pf), /did not set foot in any room today/);
});

test('Pathfinder: a Blackout leaves no footprints, and a glitched Pathfinder is shown the wrong rooms', () => {
  const { g, role } = ship('classic', SEVEN('pathfinder', 'comms', 'engineer', 'scanner', 'coroner'));
  const [pf, comms] = [role('pathfinder'), role('comms')];
  night(g);
  g.beginRoam(3000);
  g.systems.blackoutUntil = 99999;
  g.recordVisit(comms.id, 'galley', 3500);
  assert.deepStrictEqual(g.visits, {}, 'the sensors were dark');
  g.systems.blackoutUntil = 0;
  g.recordVisit(comms.id, 'galley', 3600);
  assert.ok(g.visits.galley.has(comms.id));
  g.beginMeeting(3700);
  g.beginNominations(3700);
  g.beginDusk(3700);
  g.beginNight(3701);
  night(g, { [role('hacker').id]: [pf.id], [pf.id]: [comms.id], [role('parasite').id]: [role('coroner').id] }, 4000);
  assert.ok(!/the Galley/.test(last(pf)), 'a glitched Pathfinder never sees the real rooms');
});

test('Peacekeeper: the airlock jams for a good player one time in two, never for evil, never when glitched', () => {
  let r = 0.1;
  const deal = SEVEN('peacekeeper', 'comms', 'engineer', 'scanner', 'coroner');
  const a = ship('classic', deal, { random: () => r });
  night(a.g);
  dayToDusk(a.g, { airlock: a.role('comms').id });
  assert.ok(a.role('comms').alive, 'it jammed');
  assert.strictEqual(a.g.dusk.cause, 'jam');
  assert.ok(a.g.dusk.survived);
  assert.strictEqual(a.g.executedToday, null, 'nobody was airlocked, so the Coroner learns nothing');
  assert.ok(a.g.dayLog.some((e) => e.k === 'jam'));

  r = 0.9;
  const b = ship('classic', deal, { random: () => r });
  night(b.g);
  dayToDusk(b.g, { airlock: b.role('comms').id });
  assert.ok(!b.role('comms').alive, 'it did not jam this time');

  r = 0.1;
  const c = ship('classic', deal, { random: () => r });
  night(c.g);
  dayToDusk(c.g, { airlock: c.role('hacker').id });
  assert.ok(!c.role('hacker').alive, 'evil players are never saved');

  const d = ship('classic', deal, { random: () => r });
  night(d.g);
  d.g.glitch = { id: d.role('peacekeeper').id, night: 1 };
  dayToDusk(d.g, { airlock: d.role('comms').id });
  assert.ok(!d.role('comms').alive, 'a glitched Peacekeeper jams nothing');
});

test('Peacekeeper: saves the Ambassador, so the crew does not lose', () => {
  const { g, role } = ship('classic', ['parasite', 'hacker', 'peacekeeper', 'comms', 'engineer', 'scanner', 'coroner', 'ambassador'], { random: () => 0.1 });
  night(g);
  dayToDusk(g, { airlock: role('ambassador').id });
  assert.strictEqual(g.winner, null, 'the hatch jammed, so there is no diplomatic incident');
  assert.ok(role('ambassador').alive);
});

test('Barker: learns if a Saboteur nominated today', () => {
  const deal = ['parasite', 'jammer', 'barker', 'engineer', 'scanner', 'coroner', 'medic'];
  const run = (nominator) => {
    const { g, role } = ship('carnival', deal);
    assert.strictEqual(g.prompts[role('barker').id], undefined, 'no first night');
    night(g);
    g.beginRoam(3000);
    g.beginMeeting(3000);
    g.beginNominations(3000);
    vote(g, role(nominator), role('engineer'), []);
    g.beginDusk(9000);
    g.beginNight(9001);
    night(g, { [role('parasite').id]: [role('coroner').id] }, 9500);
    return last(role('barker'));
  };
  assert.match(run('jammer'), /A Saboteur NOMINATED today/);
  assert.match(run('scanner'), /No Saboteur nominated today/);
});

test('Sniffer Dog: counts the sick among the two living neighbours (the Antibody smells sick too)', () => {
  const deal = ['carrier', 'pharmacist', 'sniffer', 'engineer', 'scanner', 'coroner', 'tracer'];
  const a = ship('outbreak', deal);
  night(a.g, { [a.role('carrier').id]: [a.role('engineer').id] }); // the Sniffer sits between the Pharmacist and the Engineer
  assert.match(last(a.role('sniffer')), /^Woof! 1 of your living neighbours \(P1 & P3\) smells sick\./);
  const b = ship('outbreak', deal);
  night(b.g, { [b.role('carrier').id]: [b.role('scanner').id] });
  assert.match(last(b.role('sniffer')), /^Woof! 0 of your living neighbours .* smell sick\./);

  const c = ship('outbreak', ['carrier', 'pharmacist', 'sniffer', 'antibody', 'scanner', 'coroner', 'tracer', 'engineer']);
  night(c.g, { [c.role('carrier').id]: [c.role('scanner').id] });
  assert.match(last(c.role('sniffer')), /^Woof! 1 of your living neighbours/, 'the Antibody next door');
});

test('Cupbearer: counts the Traitors among the three guests across the Round Table', () => {
  const a = ship('traitors', ['comms', 'cupbearer', 'engineer', 'coroner', 'headtraitor', 'framer', 'blackbox']);
  night(a.g, { [a.role('framer').id]: [a.role('comms').id] });
  assert.match(last(a.role('cupbearer')), /Across the Round Table \(.*\): 2 are TRAITORS\./);
  const b = ship('traitors', ['headtraitor', 'framer', 'cupbearer', 'comms', 'engineer', 'coroner', 'blackbox']);
  night(b.g, { [b.role('framer').id]: [b.role('comms').id] });
  assert.match(last(b.role('cupbearer')), /: 0 are TRAITORS\./);
});

// ---------------------------------------------------------------------------
// Drifters
// ---------------------------------------------------------------------------

test('Daredevil: never dies on the first night, and from the second night on dies whatever protects them', () => {
  const deal = ['parasite', 'hacker', 'medic', 'comms', 'engineer', 'scanner', 'coroner', 'daredevil'];
  const a = ship('classic', deal, { random: () => 0.05 });
  night(a.g);
  assert.ok(a.role('daredevil').alive, 'night 1 is safe');
  nextNight(a.g);
  night(a.g, { [a.role('medic').id]: [a.role('daredevil').id], [a.role('parasite').id]: [a.role('comms').id] }, 5000);
  assert.ok(!a.role('daredevil').alive, 'the Daredevil ran out of luck');
  assert.strictEqual(a.g.dawn.deaths.find((d) => d.id === a.role('daredevil').id).cause, 'daredevil');

  const b = ship('classic', deal, { random: () => 0.9 });
  night(b.g);
  nextNight(b.g);
  night(b.g, { [b.role('parasite').id]: [b.role('comms').id] }, 5000);
  assert.ok(b.role('daredevil').alive, 'usually the Daredevil is fine');
});

test('Conspiracy Theorist: a tip every night, right one time in three', () => {
  const deal = ['parasite', 'jammer', 'comms', 'engineer', 'scanner', 'coroner', 'medic', 'conspiracy'];
  const right = ship('classic', deal, { random: () => 0.1 });
  night(right.g);
  assert.ok(last(right.role('conspiracy')).includes(`${right.role('parasite').name} is the Parasite`));
  const wrong = ship('classic', deal, { random: () => 0.9 });
  night(wrong.g);
  const tip = last(wrong.role('conspiracy'));
  assert.match(tip, /is the Parasite/);
  assert.ok(!tip.includes(`${wrong.role('parasite').name} is`), 'a wrong tip never names the Parasite by accident');
  assert.ok(!tip.includes(`${wrong.role('conspiracy').name} is`), 'and never names the Theorist');
  assert.strictEqual(wrong.role('conspiracy').notes.at(-1).kind, 'conspiracy');
});

test('Mime: cannot speak while the ship is awake, cannot leave a written claim, and talks again as a ghost', () => {
  const { g, role } = ship('classic', ['parasite', 'hacker', 'comms', 'engineer', 'scanner', 'coroner', 'medic', 'mime']);
  const mime = role('mime');
  assert.strictEqual(g.isSilent(mime.id), true);
  assert.strictEqual(g.isSilent(role('comms').id), false);
  g.setClaim(mime.id, 'mime', 'I cannot say a word');
  assert.strictEqual(g.claims[mime.id].role, 'mime');
  assert.strictEqual(g.claims[mime.id].text, '', 'no written note either');
  g.setClaim(role('comms').id, 'comms', 'my note');
  assert.strictEqual(g.claims[role('comms').id].text, 'my note');
  mime.alive = false;
  assert.strictEqual(g.isSilent(mime.id), false, 'a ghost can talk');
  const lobby = new Game('L');
  const lp = lobby.addPlayer('A');
  assert.strictEqual(lobby.isSilent(lp.id), false, 'nobody is silent in the lobby');
});

test('Antibody: cannot be infected, but looks infected to the Contact Tracer', () => {
  const { g, role } = ship('outbreak', ['carrier', 'pharmacist', 'vaccinator', 'engineer', 'scanner', 'coroner', 'tracer', 'antibody']);
  const [carrier, tracer, anti] = [role('carrier'), role('tracer'), role('antibody')];
  night(g, { [carrier.id]: [anti.id], [tracer.id]: [anti.id, role('scanner').id] });
  assert.strictEqual(anti.infected, null, 'immune');
  assert.match(last(tracer), /1 of them is infected/);
  assert.ok(g.history.flatMap((h) => h.events || []).some((e) => e.k === 'infect' && e.result === 'immune'));
});

// ---------------------------------------------------------------------------
// Saboteurs
// ---------------------------------------------------------------------------

test('Framer: a framed player looks like the Parasite to the Scanner and the Gunner until the next night', () => {
  const { g, role } = ship('classic', ['parasite', 'framer', 'scanner', 'comms', 'gunner', 'engineer', 'coroner']);
  const [framer, scanner, comms, gunner] = [role('framer'), role('scanner'), role('comms'), role('gunner')];
  night(g, { [framer.id]: [comms.id], [scanner.id]: [comms.id, role('engineer').id] });
  assert.match(last(scanner), /YES, a Parasite signal/);
  g.beginRoam(3000);
  assert.strictEqual(g.reg(comms).demon, true);
  const shot = g.gunnerShot(gunner.id, comms.id, 3100);
  assert.strictEqual(shot.hit, true, 'the Gunner shot the framed player');
  assert.ok(!comms.alive);
  assert.strictEqual(g.winner, null, 'but the real Parasite is still out there');
  g.beginMeeting(3200);
  g.beginNominations(3200);
  g.beginDusk(3300);
  g.beginNight(3301);
  assert.strictEqual(g.decoy, null, 'the frame-up wears off');
});

test('Framer: nothing happens if the Framer is glitched', () => {
  const deal = ['parasite', 'hacker', 'framer', 'scanner', 'comms', 'gunner', 'engineer', 'coroner', 'medic', 'archivist'];
  const { g, role } = ship('classic', deal);
  night(g, { [role('hacker').id]: [role('framer').id], [role('framer').id]: [role('comms').id], [role('scanner').id]: [role('comms').id, role('engineer').id] });
  assert.strictEqual(g.decoy, null);
  assert.ok(!g.reg(role('comms')).demon);
});

test('Pickpocket: reads a copy of the message the target was sent tonight', () => {
  const { g, role } = ship('carnival', ['parasite', 'pickpocket', 'engineer', 'scanner', 'coroner', 'medic', 'firstofficer']);
  const [pp, engineer, officer] = [role('pickpocket'), role('engineer'), role('firstofficer')];
  night(g, { [pp.id]: [engineer.id] });
  assert.ok(last(engineer).length > 0);
  assert.ok(pp.notes.some((n) => n.kind === 'pickpocket' && n.text.includes(`over ${engineer.name}'s shoulder`) && n.text.includes('living neighbours')));
  nextNight(g);
  night(g, { [pp.id]: [officer.id], [role('parasite').id]: [role('coroner').id] }, 5000);
  assert.match(last(pp), /nothing\. No message came for them tonight/);
});

test('Pharmacist: no vaccine works on their pick (an infected player bursts anyway)', () => {
  const deal = ['carrier', 'pharmacist', 'vaccinator', 'engineer', 'scanner', 'coroner', 'tracer'];
  const run = (blockEngineer) => {
    const { g, role } = ship('outbreak', deal);
    const [carrier, pharm, vacc, engineer, scanner, coroner, tracer] = ['carrier', 'pharmacist', 'vaccinator', 'engineer', 'scanner', 'coroner', 'tracer'].map(role);
    night(g, { [carrier.id]: [engineer.id], [vacc.id]: [scanner.id], [pharm.id]: [coroner.id] });
    assert.ok(engineer.infected != null, 'the Engineer is infected');
    nextNight(g);
    night(g, { [carrier.id]: [tracer.id], [vacc.id]: [engineer.id], [pharm.id]: [blockEngineer ? engineer.id : scanner.id] }, 5000);
    return engineer.alive;
  };
  assert.strictEqual(run(false), true, 'the vaccine works');
  assert.strictEqual(run(true), false, 'the fake cure let the Engineer burst');
});

test('Signal Jammer: static hides a player\'s words for a while, and a glitched Jammer fires a dud', () => {
  const deal = ['parasite', 'jammer', 'comms', 'engineer', 'scanner', 'coroner', 'medic'];
  const { g, role } = ship('classic', deal);
  const [jammer, comms] = [role('jammer'), role('comms')];
  night(g);
  g.beginRoam(3000);
  assert.strictEqual(ROLES.jammer.system.id, 'jam');
  g.useSystem(jammer.id, { target: comms.id }, 4000);
  assert.strictEqual(g.shadowMuted(comms.id, 4500), true);
  assert.strictEqual(g.shadowMuted(role('engineer').id, 4500), false);
  assert.strictEqual(g.shadowMuted(comms.id, 4000 + 76_000), false, 'it wears off');
  assert.ok(jammer.notes.at(-1).text.includes('is jammed'));
  assert.throws(() => g.useSystem(jammer.id, { target: comms.id }, 5000), /already used/);

  const b = ship('classic', deal);
  night(b.g);
  b.g.beginRoam(3000);
  b.g.glitch = { id: b.role('jammer').id, night: 1 };
  b.g.useSystem(b.role('jammer').id, { target: b.role('comms').id }, 4000);
  assert.strictEqual(b.g.shadowMuted(b.role('comms').id, 4500), false, 'a dud');
  assert.ok(b.role('jammer').notes.at(-1).text.includes('is jammed'), 'that looks real to the Jammer');
});

test('Mastermind: airlocking the Parasite is not the end, and the crew must airlock a Saboteur the next day', () => {
  const deal = ['parasite', 'mastermind', 'comms', 'engineer', 'scanner', 'coroner', 'medic'];
  const start = () => {
    const s = ship('classic', deal);
    night(s.g);
    dayToDusk(s.g, { airlock: s.role('parasite').id, now: 3000 });
    return s;
  };
  const extraDay = (s, airlock) => {
    s.g.beginNight(3001);
    night(s.g, {}, 4000);
    dayToDusk(s.g, { airlock: airlock ? s.role(airlock).id : null });
  };
  // the Parasite goes out: the game goes on
  let s = start();
  assert.strictEqual(s.g.winner, null);
  assert.ok(s.g.mastermind && s.g.mastermindDone);
  assert.ok(s.g.dayLog.some((e) => e.k === 'mastermind'));
  // ...and airlocking the Mastermind on the extra day wins it for the crew
  extraDay(s, 'mastermind');
  assert.strictEqual(s.g.winner, 'crew');
  // airlocking a good player loses it
  s = start();
  extraDay(s, 'comms');
  assert.strictEqual(s.g.winner, 'infiltrators');
  assert.match(s.g.winReason, /Mastermind/);
  // nobody airlocked loses it too
  s = start();
  extraDay(s, null);
  assert.strictEqual(s.g.winner, 'infiltrators');
  assert.match(s.g.winReason, /Nobody was airlocked/);
});

test('Mastermind: a glitched or dead Mastermind changes nothing', () => {
  const deal = ['parasite', 'mastermind', 'comms', 'engineer', 'scanner', 'coroner', 'medic'];
  const glitched = ship('classic', deal);
  night(glitched.g);
  glitched.g.glitch = { id: glitched.role('mastermind').id, night: 1 };
  dayToDusk(glitched.g, { airlock: glitched.role('parasite').id, now: 3000 });
  assert.strictEqual(glitched.g.winner, 'crew', 'a glitched plan does not work');

  const dead = ship('classic', deal);
  night(dead.g);
  dead.role('mastermind').alive = false;
  dayToDusk(dead.g, { airlock: dead.role('parasite').id, now: 3000 });
  assert.strictEqual(dead.g.winner, 'crew');
});

test('Mastermind: if the Mastermind dies on the extra day before the vote, the crew wins at once', () => {
  const s = ship('classic', ['parasite', 'mastermind', 'comms', 'engineer', 'scanner', 'coroner', 'medic']);
  night(s.g);
  dayToDusk(s.g, { airlock: s.role('parasite').id, now: 3000 });
  assert.strictEqual(s.g.winner, null);
  s.role('mastermind').alive = false;
  s.g.checkWin();
  assert.strictEqual(s.g.winner, 'crew');
});

test('Cuckoo: kills like the Parasite, and once lays its egg in a Drifter, who wakes up evil', () => {
  const deal = ['cuckoo', 'framer', 'comms', 'engineer', 'scanner', 'coroner', 'medic', 'daredevil', 'conspiracy'];
  const { g, role } = ship('classic', deal, { random: () => 0.9 });
  const [cuckoo, framer, dare, conspiracy, comms, medic] = [role('cuckoo'), role('framer'), role('daredevil'), role('conspiracy'), role('comms'), role('medic')];
  assert.strictEqual(g.prompts[cuckoo.id], undefined, 'no kill on the first night');
  night(g, { [framer.id]: [comms.id] });
  nextNight(g);
  night(g, { [cuckoo.id]: [dare.id], [medic.id]: [comms.id] }, 5000);
  assert.ok(!cuckoo.alive, 'the Cuckoo died in the jump');
  assert.ok(dare.alive);
  assert.strictEqual(dare.role, 'cuckoo');
  assert.ok(g.cuckooHopped);
  assert.match(last(dare), /THE CUCKOO.*Your Saboteurs: P1/);
  assert.match(last(framer), /The Cuckoo hopped into P7/);
  assert.strictEqual(g.winner, null, 'the Demon lives on, in a new body');
  // the jump only happens once: the new Cuckoo kills a Drifter like anyone else
  nextNight(g, { now: 8000 });
  night(g, { [dare.id]: [conspiracy.id], [medic.id]: [comms.id] }, 9000);
  assert.ok(!conspiracy.alive);
  assert.strictEqual(conspiracy.role, 'conspiracy');
});

test('Cuckoo: a protected Drifter is not hatched into, and airlocking the Cuckoo wins as usual', () => {
  const deal = ['cuckoo', 'framer', 'medic', 'comms', 'engineer', 'scanner', 'coroner', 'daredevil'];
  const { g, role } = ship('classic', deal, { random: () => 0.9 });
  night(g);
  nextNight(g);
  night(g, { [role('cuckoo').id]: [role('daredevil').id], [role('medic').id]: [role('daredevil').id] }, 5000);
  assert.ok(role('cuckoo').alive && role('daredevil').role === 'daredevil', 'the Medic stopped it');
  nextNight(g, { airlock: role('cuckoo').id, now: 8000 });
  assert.strictEqual(g.winner, 'crew');
});

// ---------------------------------------------------------------------------
// Whole games
// ---------------------------------------------------------------------------

// A random valid cast for this script that includes this role (swapping out another role of the same type).
function castWith(roleId, script, n, random) {
  const roles = st.pickRoles(n, random, script);
  if (roles.includes(roleId)) return roles;
  const swappable = roles.map((r, i) => i).filter((i) => ROLES[roles[i]].type === ROLES[roleId].type && !['smuggler', 'drunk'].includes(roles[i]));
  if (!swappable.length) return null;
  const copy = [...roles];
  copy[swappable[Math.floor(random() * swappable.length)]] = roleId;
  return st.validateRoles(copy, n, script) ? null : copy;
}

// Play a game to the end with random choices, random nominations and a bit of wandering around the ship.
function autopilot(g, random, { limit = 30000 } = {}) {
  let now = 0;
  let steps = 0;
  while (g.phase !== 'ended' && steps < limit) {
    steps++;
    now += 1000;
    if (g.phase === 'night') {
      for (const [pid, prompt] of Object.entries(g.prompts)) {
        if (g.choices[pid] || g.draft) continue;
        const pool = g.players.filter((t) => (prompt.target === 'any' || (prompt.target === 'dead' ? !t.alive : t.alive)) && !(prompt.notSelf && t.id === pid) && !(prompt.notRepeat && g.get(pid).lastPick === t.id));
        if (prompt.once && random() < 0.5) g.submitChoice(pid, [], now);
        else g.submitChoice(pid, st.sample(pool, prompt.choose, random).map((t) => t.id), now);
      }
      if (g.blackbox && !g.blackbox.target) g.submitChoice(g.blackbox.id, [g.players[0].id], now);
    }
    if (g.phase === 'roam' && random() < 0.3) {
      for (const p of g.players) if (p.alive) g.recordVisit(p.id, ['galley', 'reactor', 'bridge', 'medbay'][Math.floor(random() * 4)], now);
    }
    if (g.phase === 'nominations' && !g.nomination && random() < 0.3) {
      const alive = g.alive();
      const a = alive.find((x) => !g.nominators.has(x.id) && g.gagged?.id !== x.id);
      const b = alive.find((x) => !g.nominees.has(x.id));
      if (a && b) {
        g.nominate(a.id, b.id, now);
        for (const v of g.players) if (g.nomination && g.canVote(v) && random() < 0.6) g.setHand(v.id, true);
      }
    }
    g.tick(now);
  }
  return steps;
}

test('every new role plays whole games: it is dealt into a real cast and the game still ends', () => {
  let games = 0;
  for (const id of Object.keys(EXTRA_ROLES)) {
    for (const script of Object.values(SCRIPTS).filter((s) => s.roles.includes(id))) {
      for (const n of [7, 10, 15].filter((k) => k >= script.minPlayers && k >= ROLES[id].minPlayers)) {
        for (let seed = 1; seed <= 2; seed++) {
          const random = seeded(seed * 1000 + n + id.length);
          const deal = castWith(id, script.id, n, random);
          if (!deal) continue;
          const g = new Game('SIM', { random });
          g.script = script.id;
          const players = Array.from({ length: n }, (_, i) => g.addPlayer(`B${i}`));
          g.start(players[0].id, 0, { deal: st.shuffle(deal, random) });
          autopilot(g, random);
          assert.strictEqual(g.phase, 'ended', `${script.id} n=${n} with ${id} (seed ${seed}) did not finish`);
          assert.ok(['crew', 'infiltrators'].includes(g.winner));
          games++;
        }
      }
    }
  }
  assert.ok(games > 100, `played ${games} games`);
});

test('autopilot plays complete games in every script at every size', () => {
  for (const script of Object.values(SCRIPTS)) {
    for (let n = script.minPlayers; n <= 15; n++) {
      for (let seed = 1; seed <= 3; seed++) {
        const random = seeded(seed * 311 + n);
        const g = new Game('SIM', { random });
        g.script = script.id;
        const players = Array.from({ length: n }, (_, i) => g.addPlayer(`B${i}`));
        g.start(players[0].id, 0);
        autopilot(g, random);
        assert.strictEqual(g.phase, 'ended', `${script.id} n=${n} seed=${seed} did not finish`);
        for (const p of g.players) assert.ok(ROLES[p.role] && ROLES[p.believed], `${p.name} always has a real role`);
      }
    }
  }
});

test('robots play every new role too: they choose targets, use the Jammer, stay quiet as Mimes, and the game ends', () => {
  const { runBots } = require('../server/bots');
  let games = 0;
  const covered = new Set();
  for (const id of Object.keys(EXTRA_ROLES)) {
    for (const script of Object.values(SCRIPTS).filter((s) => s.roles.includes(id))) {
      const n = Math.max(ROLES[id].type === 'drifter' ? 12 : 10, script.minPlayers, ROLES[id].minPlayers); // (some sizes have no Drifters at all)
      const random = seeded(n * 31 + id.length);
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
      const said = [];
      const api = { say(p, text) { said.push([p, text]); }, sayNear(p, text) { said.push([p, text]); }, emote() {} };
      let now = 1000;
      for (let i = 0; i < 60_000 && g.phase !== 'ended'; i++) {
        now += 250;
        runBots(room, now, api, 0.25);
        g.tick(now);
      }
      assert.strictEqual(g.phase, 'ended', `${script.id} with ${id}: the robot game finishes`);
      covered.add(id);
      games++;
    }
  }
  assert.deepStrictEqual(Object.keys(EXTRA_ROLES).filter((id) => !covered.has(id)), [], 'every new role was played by robots');
  assert.ok(games >= 25, `played ${games} robot games`);
});

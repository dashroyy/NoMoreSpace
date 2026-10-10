// Rules tests. Run with: npm test
const test = require('node:test');
const assert = require('node:assert');
const { Game } = require('../server/engine');
const { ROLES, DISTRIBUTION } = require('../server/roles');
const st = require('../server/storyteller');

// Repeatable "random" numbers so tests behave the same every run.
function seeded(seed = 1) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A started game where seat i gets deal[i].
function setup(deal, { seed = 1, drunkAs, mode = 'autopilot' } = {}) {
  const g = new Game('TEST', { mode, random: seeded(seed) });
  let captain = null;
  if (mode === 'captain') captain = g.addCaptain('Cap');
  const p = deal.map((_, i) => g.addPlayer(`P${i}`));
  g.start(captain ? captain.id : p[0].id, 0, { deal, drunkAs });
  const role = (r) => g.players.find((x) => x.role === r);
  return { g, p, role, captain };
}

// Finish the night with exactly these choices, then go to nominations.
function playNight(g, choices = {}, now = 1000) {
  for (const [pid, targets] of Object.entries(choices)) g.submitChoice(pid, targets, now);
  g.resolveNight(now);
  return g.draft;
}

function dawnToNominations(g, now = 2000) {
  g.applyDraft(now);
  g.beginRoam(now);
  g.beginMeeting(now);
  g.beginNominations(now);
}

// Nominate and run the vote with these players' hands up.
function runVote(g, nominator, nominee, voters, now = 3000) {
  g.nominate(nominator.id, nominee.id, now);
  if (!g.nomination) return; // Sentinel fired
  for (const v of voters) g.setHand(v.id, true);
  let t = now;
  while (g.nomination) {
    t += 100_000;
    g.tickNomination(t);
  }
  return g.lastNomination;
}

const lastNote = (p) => p.notes.at(-1)?.text;

// Go to dusk; if someone is on the block, skip their last words straight to the airlock.
function dusk(g, now) {
  g.beginDusk(now);
  if (g.phase === 'lastwords') g.finishLastWords(now);
}

// ---------------------------------------------------------------------------

test('role lists follow the setup table for every player count and seed', () => {
  for (let n = 3; n <= 15; n++) {
    for (let seed = 1; seed <= 25; seed++) {
      const roles = st.pickRoles(n, seeded(seed));
      assert.strictEqual(st.validateRoles(roles, n), null, `n=${n} seed=${seed}: ${roles}`);
      assert.strictEqual(roles.filter((r) => r === 'parasite').length, 1);
      for (const r of roles) assert.ok(ROLES[r].minPlayers <= n, `${r} unlocked too early at ${n}`);
      const crew = roles.filter((r) => ROLES[r].type === 'crew');
      const info = crew.filter((r) => ROLES[r].tags.includes('info'));
      assert.ok(info.length >= Math.ceil(crew.length / 2), 'enough information roles');
    }
  }
});

test('the Smuggler swaps 2 Crew for 2 Drifters', () => {
  const counts = st.typeCounts(9, ['smuggler']);
  assert.deepStrictEqual(counts, { crew: 3, drifter: 4, saboteur: 1, parasite: 1 });
  assert.match(st.validateRoles(['parasite', 'smuggler', 'comms', 'engineer', 'scanner', 'medic', 'coroner', 'droid', 'drunk'], 9), /3 crew/);
});

test('setup: the Space Drunk, bluffs and the ghost signal', () => {
  const { g, role } = setup(['parasite', 'hacker', 'drunk', 'comms', 'engineer', 'scanner', 'medic', 'marine'], { drunkAs: 'gunner' });
  const drunk = role('drunk');
  assert.strictEqual(drunk.believed, 'gunner');
  const inPlay = new Set(g.players.map((p) => p.role));
  assert.strictEqual(g.bluffs.length, 3);
  for (const b of g.bluffs) {
    assert.ok(!inPlay.has(b) && b !== 'gunner' && b !== 'drunk', `bad bluff ${b}`);
    assert.ok(['crew', 'drifter'].includes(ROLES[b].type));
  }
  const herring = g.get(g.redHerringId);
  assert.ok(['crew', 'drifter'].includes(ROLES[herring.role].type), 'ghost signal is a good player');
  // The drunk sees their fake role, never "Space Drunk".
  assert.strictEqual(g.viewFor(drunk.id).you.role, 'gunner');
});

test('evil learn each other only in games of 7 or more', () => {
  const small = setup(['parasite', 'hacker', 'comms', 'engineer', 'scanner']);
  assert.strictEqual(small.role('parasite').notes.length, 0);
  assert.strictEqual(small.g.viewFor(small.role('hacker').id).you.evilTeam, null);

  const big = setup(['parasite', 'hacker', 'comms', 'engineer', 'scanner', 'medic', 'marine']);
  assert.match(lastNote(big.role('parasite')), /bluffs/);
  assert.match(big.role('hacker').notes[0].text, /The Parasite is P0/);
  assert.strictEqual(big.g.viewFor(big.role('hacker').id).you.evilTeam.length, 2);
});

test('night prompts follow the night order rules', () => {
  const { g, role } = setup(['parasite', 'hacker', 'medic', 'scanner', 'droid', 'comms']);
  assert.ok(!g.prompts[role('parasite').id], 'no kill on night 1');
  assert.ok(!g.prompts[role('medic').id], 'medic rests on night 1');
  assert.strictEqual(g.prompts[role('hacker').id].choose, 1);
  assert.strictEqual(g.prompts[role('scanner').id].choose, 2);
  assert.ok(g.prompts[role('droid').id].notSelf);
  assert.ok(!g.prompts[role('comms').id], 'comms just receives info');
});

test('Short Haul: with 3 players the Parasite first kills on night 3', () => {
  const { g, role } = setup(['parasite', 'scanner', 'medic']);
  assert.strictEqual(g.firstKillNight, 3);
  playNight(g, { [role('scanner').id]: [role('medic').id, role('scanner').id] });
  dawnToNominations(g);
  dusk(g, 4000);
  g.beginNight(5000);
  assert.ok(!g.prompts[role('parasite').id], 'night 2: still hungry, but waiting');
  assert.ok(g.prompts[role('medic').id], 'medic is awake on night 2');
});

test('Comms Officer learns a true pair', () => {
  const { g, role } = setup(['parasite', 'hacker', 'comms', 'medic', 'engineer']);
  playNight(g, { [role('hacker').id]: [role('engineer').id] });
  const msg = g.draft.messages.find((m) => m.role === 'comms');
  assert.ok(msg.truthful);
  const named = msg.players.map((id) => g.get(id));
  assert.ok(named.some((p) => p.role === msg.learned), 'one of the pair really has the role');
  assert.ok(ROLES[msg.learned].type === 'crew');
});

test('a glitched Engineer gets a wrong number', () => {
  for (let seed = 1; seed < 10; seed++) {
    const { g, role } = setup(['parasite', 'hacker', 'engineer', 'medic', 'comms'], { seed });
    playNight(g, { [role('hacker').id]: [role('engineer').id] });
    const msg = g.draft.messages.find((m) => m.role === 'engineer');
    const truth = g.aliveNeighbours(role('engineer')).filter((o) => g.reg(o).evil).length;
    assert.strictEqual(msg.truthful, false);
    assert.notStrictEqual(msg.value, truth);
  }
});

test('Engineer reads the nearest LIVING neighbours', () => {
  // Seats: 0 engineer, 1 comms, 2 medic, 3 hacker, 4 parasite (4 sits next to 0)
  const { g, p, role } = setup(['engineer', 'comms', 'medic', 'hacker', 'parasite']);
  assert.deepStrictEqual(g.aliveNeighbours(p[0]).map((x) => x.id).sort(), [p[4].id, p[1].id].sort());
  p[1].alive = false;
  p[4].alive = false;
  assert.deepStrictEqual(g.aliveNeighbours(p[0]).map((x) => x.id).sort(), [p[3].id, p[2].id].sort());
  playNight(g, { [role('hacker').id]: [role('medic').id] });
  assert.strictEqual(g.draft.messages.find((m) => m.role === 'engineer').value, 1);
});

test('Navigator counts neighbouring evil pairs', () => {
  const { g } = setup(['parasite', 'hacker', 'navigator', 'comms', 'engineer', 'medic', 'scanner']);
  playNight(g, { [g.players[1].id]: [g.players[3].id], [g.players[6].id]: [g.players[0].id, g.players[2].id] });
  assert.strictEqual(g.draft.messages.find((m) => m.role === 'navigator').value, 1);
});

test('Scanner pings the Parasite and the ghost signal', () => {
  const { g, role } = setup(['parasite', 'hacker', 'scanner', 'medic', 'comms']);
  const scanner = role('scanner');
  g.redHerringId = role('comms').id;
  playNight(g, { [role('hacker').id]: [role('medic').id], [scanner.id]: [role('parasite').id, role('medic').id] });
  assert.strictEqual(g.draft.messages.find((m) => m.role === 'scanner').value, true);
});

test('ghost signal registers as the Parasite to the Scanner', () => {
  const { g, role } = setup(['parasite', 'hacker', 'scanner', 'medic', 'comms']);
  g.redHerringId = role('comms').id;
  playNight(g, { [role('hacker').id]: [role('parasite').id], [role('scanner').id]: [role('comms').id, role('medic').id] });
  assert.strictEqual(g.draft.messages.find((m) => m.role === 'scanner').value, true);
});

test('the Parasite kills, the Medic and Marine protect', () => {
  const deal = ['parasite', 'hacker', 'medic', 'marine', 'comms', 'engineer', 'scanner'];
  const { g, role } = setup(deal);
  const par = role('parasite');
  playNight(g, { [role('hacker').id]: [role('comms').id], [role('scanner').id]: [role('comms').id, role('medic').id] });
  dawnToNominations(g);
  dusk(g, 4000);
  g.beginNight(5000);
  playNight(g, { [role('hacker').id]: [role('comms').id], [role('medic').id]: [role('engineer').id], [par.id]: [role('engineer').id], [role('scanner').id]: [role('comms').id, role('medic').id] }, 6000);
  assert.strictEqual(g.draft.deaths.length, 0, 'medic saved the engineer');
  g.applyDraft(7000);
  assert.ok(role('engineer').alive);

  g.beginRoam(7000);
  g.beginMeeting(7000);
  g.beginNominations(7000);
  dusk(g, 8000);
  g.beginNight(9000);
  playNight(g, { [role('hacker').id]: [role('comms').id], [role('medic').id]: [role('engineer').id], [par.id]: [role('marine').id], [role('scanner').id]: [role('comms').id, role('medic').id] }, 10000);
  assert.strictEqual(g.draft.deaths.length, 0, 'the marine is safe');
  assert.strictEqual(g.draft.events.find((e) => e.k === 'kill').result, 'marine');
});

test('a glitched Marine can be killed', () => {
  const { g, role } = setup(['parasite', 'hacker', 'marine', 'comms', 'engineer']);
  playNight(g, { [role('hacker').id]: [role('comms').id] });
  dawnToNominations(g);
  dusk(g, 4000);
  g.beginNight(5000);
  playNight(g, { [role('hacker').id]: [role('marine').id], [role('parasite').id]: [role('marine').id] }, 6000);
  assert.deepStrictEqual(g.draft.deaths.map((d) => d.id), [role('marine').id]);
});

test('the Space Drunk: false info and no protection', () => {
  const { g, role } = setup(['parasite', 'hacker', 'drunk', 'comms', 'engineer', 'scanner'], { drunkAs: 'medic' });
  const drunk = role('drunk');
  playNight(g, { [role('hacker').id]: [role('comms').id], [role('scanner').id]: [role('comms').id, role('engineer').id] });
  dawnToNominations(g);
  dusk(g, 4000);
  g.beginNight(5000);
  assert.ok(g.prompts[drunk.id], 'the drunk "medic" still gets to choose');
  playNight(g, { [role('hacker').id]: [role('comms').id], [drunk.id]: [role('engineer').id], [role('parasite').id]: [role('engineer').id], [role('scanner').id]: [role('comms').id, role('engineer').id] }, 6000);
  assert.deepStrictEqual(g.draft.deaths.map((d) => d.id), [role('engineer').id]);
  assert.strictEqual(g.draft.events.find((e) => e.k === 'protect').works, false);
});

test('jumping hosts: the Parasite kills itself and the Incubator takes over', () => {
  const { g, role } = setup(['parasite', 'incubator', 'comms', 'engineer', 'scanner', 'medic', 'marine']);
  const par = role('parasite');
  const inc = role('incubator');
  playNight(g, { [role('scanner').id]: [role('comms').id, role('medic').id] });
  dawnToNominations(g);
  dusk(g, 4000);
  g.beginNight(5000);
  playNight(g, { [par.id]: [par.id], [role('medic').id]: [role('comms').id], [role('scanner').id]: [role('comms').id, role('medic').id] }, 6000);
  g.applyDraft(7000);
  assert.ok(!par.alive);
  assert.strictEqual(inc.role, 'parasite');
  assert.strictEqual(g.winner, null, 'game goes on');
  assert.match(lastNote(inc), /You are now the Parasite/);
});

test('Incubator takes over when the Parasite is airlocked with 5+ alive', () => {
  const { g, p, role } = setup(['parasite', 'incubator', 'comms', 'engineer', 'scanner', 'medic', 'marine']);
  playNight(g, { [role('scanner').id]: [role('comms').id, role('medic').id] });
  dawnToNominations(g);
  runVote(g, role('comms'), role('parasite'), p);
  dusk(g, 9000);
  assert.ok(!role('parasite')?.alive || role('parasite') === role('incubator'));
  assert.strictEqual(g.get(p[1].id).role, 'parasite', 'the incubator is the new Parasite');
  assert.strictEqual(g.winner, null);
});

test('airlocking the Parasite wins the game for the crew', () => {
  const { g, p, role } = setup(['parasite', 'hacker', 'comms', 'engineer', 'scanner']);
  playNight(g, { [role('hacker').id]: [role('comms').id], [role('scanner').id]: [role('comms').id, role('engineer').id] });
  dawnToNominations(g);
  runVote(g, role('comms'), role('parasite'), p.slice(1));
  assert.strictEqual(g.block.id, role('parasite').id);
  dusk(g, 9000);
  assert.strictEqual(g.winner, 'crew');
  assert.strictEqual(g.phase, 'dusk', 'airlock animation plays first');
  g.tick(9000 + g.dur('dusk') + 1);
  assert.strictEqual(g.phase, 'ended');
  assert.ok(g.viewFor(p[2].id).players.every((x) => x.role), 'roles are revealed');
  assert.ok(g.viewFor(p[2].id).history.length > 2, 'history is sent for the reveal');
});

test('votes: half the living needed, highest wins, ties save everyone', () => {
  const { g, p } = setup(['parasite', 'hacker', 'comms', 'engineer', 'scanner', 'medic', 'marine']);
  playNight(g, { [g.players[1].id]: [p[2].id], [g.players[4].id]: [p[2].id, p[3].id] });
  dawnToNominations(g);
  const a = runVote(g, p[0], p[2], [p[0], p[1], p[3]]); // 3 < 4 needed
  assert.strictEqual(a.result, 'safe');
  assert.strictEqual(g.block, null);
  runVote(g, p[1], p[3], [p[0], p[1], p[2], p[4]]); // 4 votes
  assert.strictEqual(g.block.id, p[3].id);
  runVote(g, p[2], p[4], [p[0], p[1], p[2], p[5]]); // tie at 4
  assert.deepStrictEqual(g.block, { id: null, votes: 4 });
  runVote(g, p[3], p[5], [p[0], p[1], p[2], p[3], p[4]]); // 5 beats the tie
  assert.strictEqual(g.block.id, p[5].id);
  assert.throws(() => g.nominate(p[0].id, p[6].id, 1), /already nominated/);
  assert.throws(() => g.nominate(p[6].id, p[5].id, 1), /already nominated today/);
});

test('dead players get exactly one ghost vote', () => {
  const { g, p } = setup(['parasite', 'hacker', 'comms', 'engineer', 'scanner', 'medic', 'marine']);
  playNight(g, { [p[1].id]: [p[2].id], [p[4].id]: [p[2].id, p[3].id] });
  dawnToNominations(g);
  g.kill(p[6], 'captain');
  runVote(g, p[0], p[2], [p[6]]);
  assert.strictEqual(p[6].ghostVote, false);
  assert.throws(() => runVote(g, p[1], p[3], [p[6]]), /no vote left/);
});

test('the Service Droid only votes with its master', () => {
  const { g, p, role } = setup(['parasite', 'hacker', 'droid', 'comms', 'engineer', 'scanner']);
  const droid = role('droid');
  playNight(g, { [role('hacker').id]: [role('comms').id], [droid.id]: [role('comms').id], [role('scanner').id]: [role('comms').id, role('engineer').id] });
  dawnToNominations(g);
  const r = runVote(g, p[0], role('engineer'), [droid]);
  assert.deepStrictEqual(r.ignored, [droid.id]);
  const r2 = runVote(g, p[1], role('scanner'), [droid, role('comms')]);
  assert.ok(r2.voters.includes(droid.id));
});

test('the Sentinel zaps a Crew nominator, once', () => {
  const { g, role } = setup(['parasite', 'hacker', 'sentinel', 'comms', 'engineer', 'scanner', 'medic']);
  playNight(g, { [role('hacker').id]: [role('medic').id], [role('scanner').id]: [role('comms').id, role('medic').id] });
  dawnToNominations(g);
  g.nominate(role('comms').id, role('sentinel').id, 3000);
  assert.ok(!role('comms').alive, 'crew nominator airlocked');
  assert.strictEqual(g.phase, 'dusk');
  assert.strictEqual(g.executedToday, role('comms').id);
});

test('the Sentinel does nothing to an evil nominator', () => {
  const { g, role } = setup(['parasite', 'hacker', 'sentinel', 'comms', 'engineer', 'scanner', 'medic']);
  playNight(g, { [role('hacker').id]: [role('medic').id], [role('scanner').id]: [role('comms').id, role('medic').id] });
  dawnToNominations(g);
  g.nominate(role('hacker').id, role('sentinel').id, 3000);
  assert.ok(role('hacker').alive);
  assert.ok(g.nomination, 'normal vote goes ahead');
  assert.ok(role('sentinel').used);
});

test('the Gunner: one shot, kills only the Parasite', () => {
  const { g, role } = setup(['parasite', 'hacker', 'gunner', 'comms', 'engineer', 'scanner', 'medic']);
  playNight(g, { [role('hacker').id]: [role('medic').id], [role('scanner').id]: [role('comms').id, role('medic').id] });
  g.applyDraft(2000);
  g.beginRoam(2000);
  assert.strictEqual(g.gunnerShot(role('gunner').id, role('hacker').id).hit, false);
  assert.throws(() => g.gunnerShot(role('gunner').id, role('parasite').id), /spent/);

  const second = setup(['parasite', 'hacker', 'gunner', 'comms', 'engineer', 'scanner', 'medic']);
  playNight(second.g, { [second.role('hacker').id]: [second.role('medic').id], [second.role('scanner').id]: [second.role('comms').id, second.role('medic').id] });
  second.g.applyDraft(2000);
  second.g.beginRoam(2000);
  assert.strictEqual(second.g.gunnerShot(second.role('gunner').id, second.role('parasite').id).hit, true);
  assert.strictEqual(second.g.winner, 'crew');
});

test('airlocking the Ambassador loses the game for the crew', () => {
  const { g, p, role } = setup(['parasite', 'hacker', 'ambassador', 'comms', 'engineer', 'scanner']);
  playNight(g, { [role('hacker').id]: [role('comms').id], [role('scanner').id]: [role('comms').id, role('engineer').id] });
  dawnToNominations(g);
  runVote(g, p[0], role('ambassador'), p);
  dusk(g, 9000);
  assert.strictEqual(g.winner, 'infiltrators');
});

test('First Officer: 3 alive and no airlocking wins for the crew', () => {
  const { g, p, role } = setup(['parasite', 'hacker', 'firstofficer', 'comms', 'engineer']);
  playNight(g, { [role('hacker').id]: [role('comms').id] });
  dawnToNominations(g);
  g.kill(role('comms'), 'captain');
  g.kill(role('engineer'), 'captain');
  assert.strictEqual(g.aliveCount(), 3);
  dusk(g, 9000);
  assert.strictEqual(g.winner, 'crew');
});

test('evil wins when only 2 players are alive', () => {
  const { g, role } = setup(['parasite', 'scanner', 'medic']);
  playNight(g, { [role('scanner').id]: [role('medic').id, role('scanner').id] });
  dawnToNominations(g);
  runVote(g, role('scanner'), role('medic'), [role('scanner'), role('parasite')]);
  dusk(g, 9000);
  assert.strictEqual(g.winner, 'infiltrators');
});

test('Coroner learns the airlocked role; Black Box checks someone when killed', () => {
  const { g, p, role } = setup(['parasite', 'hacker', 'coroner', 'blackbox', 'engineer', 'scanner', 'medic']);
  playNight(g, { [role('hacker').id]: [role('medic').id], [role('scanner').id]: [role('engineer').id, role('medic').id] });
  dawnToNominations(g);
  runVote(g, p[0], role('engineer'), p);
  dusk(g, 9000);
  g.beginNight(10000);
  playNight(g, { [role('hacker').id]: [role('medic').id], [role('parasite').id]: [role('blackbox').id], [role('medic').id]: [role('coroner').id], [role('scanner').id]: [role('coroner').id, role('medic').id] }, 11000);
  assert.match(g.draft.messages.find((m) => m.role === 'coroner').text, /Engineer/);
  assert.ok(g.blackbox && g.blackbox.id === role('blackbox').id, 'black box wakes');
  assert.ok(!g.draftReady());
  g.submitChoice(role('blackbox').id, [role('hacker').id], 11500);
  assert.ok(g.draftReady());
  g.applyDraft(12000);
  assert.match(lastNote(role('blackbox')), /P1 is the Hacker/);
});

test('players only see their own secrets; the Captain sees everything', () => {
  const { g, p, captain } = setup(['parasite', 'hacker', 'comms', 'engineer', 'scanner'], { mode: 'captain' });
  const view = g.viewFor(p[2].id);
  assert.ok(view.players.every((x) => x.role === undefined));
  assert.strictEqual(view.you.role, 'comms');
  assert.strictEqual(view.grimoire, undefined);
  const cap = g.viewFor(captain.id);
  assert.strictEqual(cap.grimoire.players.length, 5);
  assert.ok(cap.grimoire.players.every((x) => x.role));
  assert.throws(() => g.advance(p[0].id), /Captain/);
});

test('Captain mode: review and edit the night before dawn', () => {
  const { g, captain, role } = setup(['parasite', 'hacker', 'comms', 'engineer', 'scanner'], { mode: 'captain' });
  g.submitChoice(role('hacker').id, [role('comms').id], 100);
  g.submitChoice(role('scanner').id, [role('comms').id, role('engineer').id], 100);
  assert.ok(g.draft, 'draft is ready as soon as everyone chose');
  const i = g.draft.messages.findIndex((m) => m.role === 'comms');
  g.editDraft(captain.id, { messageIndex: i, text: 'Edited by the Captain', story: 'A spooky tale', toggleDeath: role('engineer').id, anims: { [role('engineer').id]: 'duck' } });
  g.advance(captain.id, 200);
  assert.strictEqual(g.phase, 'dawn');
  assert.strictEqual(lastNote(role('comms')), 'Edited by the Captain');
  assert.ok(!role('engineer').alive);
  assert.strictEqual(g.dawn.story, 'A spooky tale');
  assert.strictEqual(g.dawn.deaths[0].anim, 'duck');
});

test('tasks charge the Observation Array and a clue appears at dawn', () => {
  const { g, p, role } = setup(['parasite', 'hacker', 'comms', 'engineer', 'scanner']);
  playNight(g, { [role('hacker').id]: [role('comms').id], [role('scanner').id]: [role('comms').id, role('engineer').id] });
  g.applyDraft(2000);
  assert.throws(() => g.completeTask(p[0].id, 'cat'), /exploring/);
  g.beginRoam(2000);
  const tasks = ['cat', 'vents', 'core', 'plants'];
  for (const pl of p) for (const t of tasks) g.completeTask(pl.id, t);
  assert.throws(() => g.completeTask(p[0].id, 'cat'), /already/);
  assert.ok(g.charge >= g.chargeNeeded());
  g.beginMeeting(3000);
  g.beginNominations(3000);
  dusk(g, 3000);
  g.beginNight(4000);
  playNight(g, { [role('hacker').id]: [role('comms').id], [role('parasite').id]: [role('comms').id], [role('scanner').id]: [role('comms').id, role('engineer').id] }, 5000);
  g.applyDraft(6000);
  assert.ok(g.clue, 'a clue appears');
  assert.ok(g.clue.caption.length > 10);
});

test('drawings: night only, published at dawn', () => {
  const { g, p, role } = setup(['parasite', 'hacker', 'comms', 'engineer', 'scanner']);
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  g.submitDrawing(p[0].id, png, true);
  assert.throws(() => g.submitDrawing(p[1].id, 'javascript:alert(1)'), /too big/);
  assert.strictEqual(g.viewFor(p[1].id).drawings.length, 0, 'hidden until dawn');
  playNight(g, { [role('hacker').id]: [role('comms').id], [role('scanner').id]: [role('comms').id, role('engineer').id] });
  g.applyDraft(2000);
  assert.deepStrictEqual(g.viewFor(p[1].id).drawings.map((d) => d.signedBy), ['P0']);
  assert.throws(() => g.submitDrawing(p[0].id, png), /night/);
});

test('reset returns everyone to the lobby with their suits', () => {
  const { g, p } = setup(['parasite', 'hacker', 'comms', 'engineer', 'scanner']);
  const suit = p[3].cosmetics.suit;
  g.reset(p[0].id);
  assert.strictEqual(g.phase, 'lobby');
  assert.strictEqual(g.players.length, 5);
  assert.ok(g.players.every((x) => x.alive && x.role === null && x.notes.length === 0));
  assert.strictEqual(p[3].cosmetics.suit, suit);
});

// A robot playtest: random players, ARIA running the timers. Every game must end.
test('autopilot plays complete games at every player count', () => {
  for (let n = 3; n <= 15; n++) {
    for (let seed = 1; seed <= 6; seed++) {
      const random = seeded(seed * 100 + n);
      const g = new Game('AUTO', { random });
      const players = Array.from({ length: n }, (_, i) => g.addPlayer(`Bot${i}`));
      g.start(players[0].id, 0);
      let now = 0;
      let steps = 0;
      while (g.phase !== 'ended' && steps < 20000) {
        steps++;
        now += 1000;
        if (g.phase === 'night') {
          for (const [pid, prompt] of Object.entries(g.prompts)) {
            if (g.choices[pid] || g.draft) continue;
            const pool = g.players.filter((t) => (prompt.target === 'any' || t.alive) && !(prompt.notSelf && t.id === pid));
            g.submitChoice(pid, st.sample(pool, prompt.choose, random).map((t) => t.id), now);
          }
          if (g.blackbox && !g.blackbox.target) g.submitChoice(g.blackbox.id, [g.players[0].id], now);
        }
        if (g.phase === 'nominations' && !g.nomination && random() < 0.3) {
          const alive = g.alive();
          const a = alive.find((x) => !g.nominators.has(x.id));
          const b = alive.find((x) => !g.nominees.has(x.id));
          if (a && b) {
            g.nominate(a.id, b.id, now);
            for (const v of g.players) if (g.nomination && g.canVote(v) && random() < 0.6) g.setHand(v.id, true);
          }
        }
        g.tick(now);
      }
      assert.strictEqual(g.phase, 'ended', `n=${n} seed=${seed} did not finish`);
      assert.ok(['crew', 'infiltrators'].includes(g.winner));
      assert.ok(now / 60000 < 400, 'sane length');
    }
  }
});

test('setup table matches Blood on the Clocktower for 5-15 players', () => {
  assert.deepStrictEqual(DISTRIBUTION[5], [3, 0, 1, 1]);
  assert.deepStrictEqual(DISTRIBUTION[7], [5, 0, 1, 1]);
  assert.deepStrictEqual(DISTRIBUTION[10], [7, 0, 2, 1]);
  assert.deepStrictEqual(DISTRIBUTION[15], [9, 2, 3, 1]);
});

test('a dead Service Droid votes freely', () => {
  const { g, p, role } = setup(['parasite', 'hacker', 'droid', 'comms', 'engineer', 'scanner']);
  const droid = role('droid');
  playNight(g, { [role('hacker').id]: [role('comms').id], [droid.id]: [role('comms').id], [role('scanner').id]: [role('comms').id, role('engineer').id] });
  dawnToNominations(g);
  g.kill(droid, 'captain');
  const r = runVote(g, p[0], role('engineer'), [droid]);
  assert.deepStrictEqual(r.ignored, []);
  assert.ok(r.voters.includes(droid.id), 'ghost vote counts without the master');
});

test("the Hacker's glitch ends when the Hacker dies", () => {
  // at night: killed by the Parasite, so the Engineer acting later gets true info
  const { g, role } = setup(['parasite', 'hacker', 'engineer', 'comms', 'scanner', 'medic', 'marine']);
  const hacker = role('hacker');
  const engineer = role('engineer');
  playNight(g, { [hacker.id]: [role('comms').id], [role('scanner').id]: [role('comms').id, role('medic').id] });
  dawnToNominations(g);
  dusk(g, 3000);
  g.beginNight(4000);
  const d = playNight(g, { [hacker.id]: [engineer.id], [role('parasite').id]: [hacker.id], [role('medic').id]: [role('comms').id], [role('scanner').id]: [role('comms').id, role('medic').id] }, 5000);
  assert.strictEqual(d.glitch, null);
  assert.ok(d.messages.find((m) => m.to === engineer.id).truthful, 'Engineer info is true');
  assert.ok(d.events.some((e) => e.k === 'unglitch'));

  // by day: airlocking the Hacker unglitches their target straight away
  const second = setup(['parasite', 'hacker', 'engineer', 'comms', 'scanner', 'medic', 'marine']);
  const h2 = second.role('hacker');
  playNight(second.g, { [h2.id]: [second.role('comms').id], [second.role('scanner').id]: [second.role('comms').id, second.role('medic').id] });
  dawnToNominations(second.g);
  assert.ok(second.g.glitch);
  runVote(second.g, second.role('comms'), h2, second.g.players);
  dusk(second.g, 9000);
  assert.ok(!h2.alive);
  assert.strictEqual(second.g.glitch, null);
});

test('a dead Mimic stops seeing the manifest', () => {
  const { g, role } = setup(['parasite', 'mimic', 'engineer', 'comms', 'scanner', 'medic', 'marine']);
  const mimic = role('mimic');
  assert.ok(g.viewFor(mimic.id).you.manifest);
  g.kill(mimic, 'captain');
  assert.strictEqual(g.viewFor(mimic.id).you.manifest, null);
});

test('when every connected player is ready, the day moves on early', () => {
  const { g, p, role } = setup(['parasite', 'hacker', 'engineer', 'comms', 'scanner', 'medic', 'marine']);
  playNight(g, { [role('hacker').id]: [role('comms').id], [role('scanner').id]: [role('comms').id, role('medic').id] });
  g.applyDraft(2000);
  g.beginRoam(2000);
  assert.throws(() => g.setReady('nobody', true), /Only players/);
  p.slice(0, 6).forEach((x) => g.setReady(x.id, true));
  assert.strictEqual(g.tick(3000), false, 'one player still exploring');
  p[6].connected = false; // they dropped out, so they no longer hold the ship up
  assert.strictEqual(g.tick(3000), true);
  assert.strictEqual(g.phase, 'meeting');
  assert.strictEqual(g.ready.size, 0, 'readiness resets each phase');

  g.beginNominations(4000);
  p.slice(0, 5).forEach((x) => g.setReady(x.id, true));
  g.nominate(p[0].id, p[1].id, 4000);
  assert.strictEqual(g.ready.size, 0, 'a nomination is worth talking about');
  g.nomination = null;
  g.phase = 'dusk';
  assert.throws(() => g.setReady(p[0].id, true), /Nothing to hurry/);
});

test('private door locks: who can lock, how long it lasts, letting people in, and when it opens itself', () => {
  const { g, p } = setup(['parasite', 'hacker', 'engineer', 'comms', 'scanner', 'medic', 'marine']);
  playNight(g, {});
  g.applyDraft(2000);
  g.beginRoam(2000);
  const [a, b, c, d, e] = p;
  const T = 10_000;
  // rules for locking
  assert.throws(() => g.lockRoom(a.id, { here: 'galley', occupants: [a.id] }, T), /private chats/, 'alone in a room: nothing to lock');
  assert.throws(() => g.lockRoom(a.id, { here: 'bridge', occupants: [a.id, b.id] }, T), /bridge/);
  assert.throws(() => g.lockRoom(a.id, { here: 'corridor', occupants: [a.id, b.id] }, T), /inside a room/);
  assert.throws(() => g.lockRoom('nobody', { here: 'galley', occupants: [] }, T), /Only players/);
  const lock = g.lockRoom(a.id, { here: 'galley', occupants: [a.id, b.id] }, T);
  assert.deepStrictEqual(lock.allowed.sort(), [a.id, b.id].sort());
  assert.strictEqual(lock.until, T + 90_000, 'a lock lasts 90 seconds');
  assert.ok(g.activeLockdown('galley', T + 1), 'it seals the room (movement and sound)');
  assert.throws(() => g.lockRoom(b.id, { here: 'galley', occupants: [a.id, b.id] }, T + 1), /already locked/);
  assert.throws(() => g.lockRoom(a.id, { here: 'medbay', occupants: [a.id, c.id] }, T + 1), /already locked a door/, 'one door each');
  // what everyone sees
  const view = g.systemsView(T + 1).lockdowns.find((l) => l.room === 'galley');
  assert.ok(view.private && view.allowed.includes(a.id));
  // a Comms Officer's intercept still hears a privately locked room, but not a Security Chief lockdown
  g.systems.intercepts.push({ by: d.id, room: 'galley', until: T + 60_000, works: true });
  assert.deepStrictEqual(g.listeners('galley', T + 1), [d.id]);

  // knocking and letting in
  assert.throws(() => g.knock(a.id, 'galley', T + 2), /allowed in already/);
  assert.throws(() => g.knock(c.id, 'medbay', T + 2), /not locked/);
  assert.strictEqual(g.knock(c.id, 'galley', T + 2).room, 'galley');
  assert.throws(() => g.knock(c.id, 'galley', T + 3), /just knocked/);
  assert.strictEqual(g.knock(c.id, 'galley', T + 9000).room, 'galley', 'knock again after a few seconds');
  assert.throws(() => g.admit(e.id, c.id, { here: 'galley' }, T + 10), /Only the people inside/);
  assert.ok(g.admit(b.id, c.id, { here: 'galley' }, T + 10).allowed.includes(c.id));

  // only people inside can unlock; then the locker waits before locking again
  assert.throws(() => g.unlockRoom(e.id, { here: 'galley' }, T + 20), /Only the people inside/);
  g.unlockRoom(b.id, { here: 'galley' }, T + 20);
  assert.strictEqual(g.activeLockdown('galley', T + 21), null);
  assert.throws(() => g.lockRoom(a.id, { here: 'galley', occupants: [a.id, b.id] }, T + 30), /recharging/);
  assert.ok(g.lockRoom(a.id, { here: 'galley', occupants: [a.id, b.id] }, T + 20 + 45_000), 'after the cooldown');

  // at most three doors at a time
  const x = setup(['parasite', 'hacker', 'engineer', 'comms', 'scanner', 'medic', 'marine', 'droid']);
  playNight(x.g, {});
  x.g.applyDraft(2000);
  x.g.beginRoam(2000);
  const q = x.p;
  x.g.lockRoom(q[0].id, { here: 'galley', occupants: [q[0].id, q[1].id] }, T);
  x.g.lockRoom(q[2].id, { here: 'medbay', occupants: [q[2].id, q[3].id] }, T);
  x.g.lockRoom(q[4].id, { here: 'comms', occupants: [q[4].id, q[5].id] }, T);
  assert.throws(() => x.g.lockRoom(q[6].id, { here: 'hydroponics', occupants: [q[6].id, q[7].id] }, T), /Too many doors/);

  // time runs out, or the room empties
  const inRoom = { galley: [a.id, b.id], medbay: [c.id] };
  const here = (r) => inRoom[r] || [];
  const y = setup(['parasite', 'hacker', 'engineer', 'comms', 'scanner', 'medic', 'marine']);
  playNight(y.g, {});
  y.g.applyDraft(2000);
  y.g.beginRoam(2000);
  const yl = y.g.lockRoom(y.p[0].id, { here: 'galley', occupants: [y.p[0].id, y.p[1].id] }, T);
  const yh = (r) => (r === 'galley' ? [y.p[0].id, y.p[1].id] : []);
  assert.deepStrictEqual(y.g.sweepLocks(yh, T + 1000), [], 'both still inside');
  assert.deepStrictEqual(y.g.sweepLocks(() => [y.p[0].id], T + 2000), [], 'one left: a grace period');
  assert.deepStrictEqual(y.g.sweepLocks(() => [y.p[0].id], T + 4000), []);
  const ended = y.g.sweepLocks(() => [y.p[0].id], T + 9000);
  assert.strictEqual(ended.length, 1);
  assert.strictEqual(ended[0].ended, 'empty');
  assert.strictEqual(y.g.activeLockdown('galley', T + 9001), null, 'the room opens up');
  const z = setup(['parasite', 'hacker', 'engineer', 'comms', 'scanner', 'medic', 'marine']);
  playNight(z.g, {});
  z.g.applyDraft(2000);
  z.g.beginRoam(2000);
  z.g.lockRoom(z.p[0].id, { here: 'galley', occupants: [z.p[0].id, z.p[1].id] }, T);
  const zh = () => [z.p[0].id, z.p[1].id];
  assert.deepStrictEqual(z.g.sweepLocks(zh, T + 89_000), []);
  assert.strictEqual(z.g.sweepLocks(zh, T + 90_001)[0].ended, 'time');
  assert.ok(here('galley').length === 2 && yl.private, 'sanity');

  // locks never outlive the exploring phase
  g.beginMeeting(T + 1);
  assert.deepStrictEqual(g.systems.lockdowns, []);
});

test('the night only ends early when everyone has chosen AND is ready; the timer is the backstop', () => {
  const { g, p, role } = setup(['parasite', 'hacker', 'engineer', 'comms', 'scanner', 'medic', 'marine']);
  g.beginNight(1000);
  const early = 1000 + g.dur('nightMin') + 1;
  for (const [pid] of Object.entries(g.prompts)) g.choices[pid] = g.prompts[pid].choose === 2 ? [p[0].id, p[1].id] : [p[1].id];
  assert.ok(g.allChosen());
  assert.strictEqual(g.tick(early), false, 'everyone chose, but nobody said they were ready: the night goes on');
  p.slice(0, 6).forEach((x) => g.setReady(x.id, true));
  assert.strictEqual(g.tick(early), false, 'one player is still painting');
  g.setReady(p[6].id, true);
  assert.strictEqual(g.tick(early), true, 'all ready: dawn comes early');
  assert.ok(g.draft);

  // and if somebody never presses Ready, the (longer) timer still ends the night
  const second = setup(['parasite', 'hacker', 'engineer', 'comms', 'scanner', 'medic', 'marine']);
  second.g.beginNight(1000);
  assert.ok(second.g.dur('nightMax') >= 150_000, 'a roomy night');
  assert.strictEqual(second.g.tick(1000 + second.g.dur('nightMax') - 1), false);
  assert.strictEqual(second.g.tick(1000 + second.g.dur('nightMax') + 1), true);
});

test('dawn lasts long enough to read, and everyone ready skips the rest of it', () => {
  const { g, p } = setup(['parasite', 'hacker', 'engineer', 'comms', 'scanner', 'medic', 'marine']);
  g.beginNight(1000);
  g.resolveNight(1000);
  g.applyDraft(2000);
  assert.strictEqual(g.phase, 'dawn');
  assert.ok(g.dur('dawn') >= 24_000, 'at least 24 seconds at dawn');
  p.slice(0, 6).forEach((x) => g.setReady(x.id, true));
  assert.strictEqual(g.tick(3000), false);
  g.setReady(p[6].id, true);
  assert.strictEqual(g.tick(3000), true);
  assert.strictEqual(g.phase, 'roam');
});

test('a drawing that arrives just as the night ends is still pinned up; much later it is refused', () => {
  const { g, p } = setup(['parasite', 'hacker', 'engineer', 'comms', 'scanner', 'medic', 'marine']);
  const png = 'data:image/png;base64,AAAA';
  g.beginNight(1000);
  g.submitDrawing(p[0].id, png, false, 1500);
  assert.strictEqual(g.drawings[0].published, false, 'drawn at night: shown at dawn');
  g.resolveNight(1000);
  g.applyDraft(2000);
  assert.ok(g.drawings[0].published);
  const late = g.submitDrawing(p[1].id, png, true, 2500);
  assert.ok(late.published, 'late but within the grace period: straight onto the wall');
  assert.throws(() => g.submitDrawing(p[2].id, png, false, 2000 + 20_000), /only draw at night/);
  g.beginRoam(2000);
  assert.throws(() => g.submitDrawing(p[2].id, png, false, 2600), /only draw at night/, 'not once the day has begun');
});

test('Captain mode: readiness does not skip ahead unless auto-advance is on', () => {
  const { g, p, captain, role } = setup(['parasite', 'hacker', 'engineer', 'comms', 'scanner', 'medic', 'marine'], { mode: 'captain' });
  playNight(g, { [role('hacker').id]: [role('comms').id], [role('scanner').id]: [role('comms').id, role('medic').id] });
  g.applyDraft(2000);
  g.beginRoam(2000);
  p.forEach((x) => g.setReady(x.id, true));
  assert.strictEqual(g.tick(3000), false);
  assert.strictEqual(g.viewFor(captain.id).ready.length, 7, 'the Captain sees who is ready');
  g.setAutoAdvance(captain.id, true);
  assert.strictEqual(g.tick(3000), true);
  assert.strictEqual(g.phase, 'meeting');
});

// ---------------------------------------------------------------------------
// Voting made for online play, and ⚡ ship systems
// ---------------------------------------------------------------------------

test('everyone votes at once: votes can change, stay secret, and the count starts early when all have voted', () => {
  const { g, p } = setup(['comms', 'engineer', 'medic', 'hacker', 'parasite']);
  playNight(g);
  dawnToNominations(g);
  g.nominate(p[0].id, p[3].id, 3000);
  // votes can be cast during the speeches and changed
  g.setHand(p[1].id, true);
  g.setHand(p[1].id, false);
  g.setHand(p[2].id, true);
  assert.strictEqual(g.nomination.hands[p[1].id], false);
  // other players can't see anyone's vote before the count, only who has voted
  const view = g.viewFor(p[4].id);
  assert.deepStrictEqual(view.nomination.hands, {});
  assert.ok(view.nomination.cast.includes(p[2].id));
  assert.strictEqual(g.viewFor(p[2].id).nomination.hands[p[2].id], true);
  // skip the speeches, then everyone votes and the ballot closes without waiting
  g.tickNomination(3000 + 100_000);
  g.tickNomination(3000 + 200_000);
  assert.strictEqual(g.nomination.stage, 'vote');
  for (const v of [p[0], p[3], p[4]]) g.setHand(v.id, true);
  g.tickNomination(3000 + 200_001);
  assert.strictEqual(g.nomination.stage, 'count');
  assert.throws(() => g.setHand(p[0].id, false), /counted/);
  let t = 3000 + 200_001;
  while (g.nomination) g.tickNomination((t += 1000));
  assert.strictEqual(g.lastNomination.votes, 4);
  assert.strictEqual(g.votesToday.length, 1);
  assert.strictEqual(g.block.id, p[3].id);
});

test('ship systems: door logs, med-scan, sensor sweep, spoofs and duds for the Space Drunk', () => {
  const { g, p, role } = setup(['archivist', 'medic', 'engineer', 'drunk', 'hacker', 'parasite'], { drunkAs: 'comms' });
  playNight(g, { [role('hacker').id]: [role('medic').id] });
  g.applyDraft(2000);
  g.beginRoam(2000);
  g.recordVisit(p[1].id, 'galley');
  g.recordVisit(role('parasite').id, 'galley');
  g.recordVisit(p[2].id, 'medbay');
  // the real Archivist reads the true door log
  g.useSystem(role('archivist').id, { room: 'galley' }, 2100);
  assert.match(role('archivist').notes.at(-1).text, /Galley today: P1, P5/);
  assert.throws(() => g.useSystem(role('archivist').id, { room: 'galley' }, 2200), /already used/);
  // the Medic is glitched by the Hacker, so their scan is a dud (but still used up)
  g.useSystem(role('medic').id, { target: role('engineer').id }, 2300);
  assert.ok(role('medic').systemUsed);
  // the Engineer counts the evil players standing in a room
  g.useSystem(role('engineer').id, { room: 'galley', occupants: [p[1].id, role('parasite').id, role('hacker').id] }, 2400);
  assert.match(role('engineer').notes.at(-1).text, /3 aboard, 2 evil/);
  // the Space Drunk believes they are the Comms Officer: their intercept looks fine but hears nothing
  assert.strictEqual(role('drunk').believed, 'comms');
  g.useSystem(role('drunk').id, { room: 'medbay' }, 2500);
  assert.match(role('drunk').notes.at(-1).text, /tap into the Medbay/);
  assert.deepStrictEqual(g.listeners('medbay', 2600), []);
  // the Hacker's spoof needs words, then hands the server a message to deliver
  assert.throws(() => g.useSystem(role('hacker').id, { target: p[1].id, text: '   ' }, 2600), /fake message/);
  const res = g.useSystem(role('hacker').id, { target: p[1].id, text: 'I am the Parasite lol' }, 2600);
  assert.deepStrictEqual(res.spoof, { as: p[1].id, text: 'I am the Parasite lol' });
  assert.ok(g.history.some((ch) => ch.events?.some((e) => e.k === 'system' && e.sys === 'spoof')));
  // systems only work in the right phase, and never for the dead
  g.beginMeeting(3000);
  assert.throws(() => g.useSystem(role('parasite').id, {}, 3100), /exploring/);
});

test('ship systems: blackout hides door logs, disguises expire, lockdowns stop eavesdroppers', () => {
  const { g, p, role } = setup(['comms', 'security', 'engineer', 'stowaway', 'mimic', 'parasite']);
  playNight(g);
  g.applyDraft(2000);
  g.beginRoam(2000);
  g.useSystem(role('parasite').id, {}, 2000);
  assert.ok(g.blackout(2500));
  g.recordVisit(p[0].id, 'cargo', 2500);
  assert.ok(!g.visits.cargo, 'nothing is logged in the dark');
  assert.throws(() => g.useSystem(role('engineer').id, { room: 'cargo', occupants: [] }, 2600), /sensors are dead/);
  assert.ok(!g.blackout(2000 + 46_000));
  g.useSystem(role('mimic').id, { target: role('comms').id }, 3000);
  assert.strictEqual(g.disguiseOf(role('mimic').id, 3500), role('comms').id);
  assert.strictEqual(g.disguiseOf(role('mimic').id, 3000 + 61_000), null);
  // lockdown: only the people inside stay, and nobody can intercept the room
  assert.throws(() => g.useSystem(role('security').id, { here: 'corridor' }, 4000), /Stand inside a room/);
  g.useSystem(role('comms').id, { room: 'galley' }, 4000);
  assert.deepStrictEqual(g.listeners('galley', 4100), [role('comms').id]);
  g.useSystem(role('security').id, { here: 'galley', occupants: [role('security').id, p[2].id] }, 4100);
  assert.deepStrictEqual(g.listeners('galley', 4200), []);
  assert.deepStrictEqual(g.systemsView(4200).lockdowns[0].allowed, [role('security').id, p[2].id]);
  // everything timed ends with the exploring phase
  g.beginMeeting(5000);
  assert.strictEqual(g.activeLockdown('galley', 5001), null);
});

test('clues drift past at a set moment while exploring, and only task-doers get a warning', () => {
  const { g, p, role } = setup(['comms', 'engineer', 'medic', 'hacker', 'parasite']);
  playNight(g);
  g.charge = 999; // the Observation Array is full, so a clue comes tomorrow
  g.applyDraft(2000);
  assert.ok(g.clue, 'a clue is ready');
  assert.strictEqual(g.viewFor(p[0].id).clue, null, 'nobody sees it before exploring');
  g.beginRoam(10_000);
  const { at, until } = g.clue;
  const roam = g.dur('roam');
  assert.ok(at >= 10_000 + roam * 0.3 && at <= 10_000 + roam * 0.65, 'arrives partway through exploring');
  assert.strictEqual(until - at, 20_000);
  assert.strictEqual(g.clueView(g.clue, at - 25_000), null, 'still secret 25s before');
  assert.ok(g.clueView(g.clue, at - 15_000), 'sent 20s ahead so clients can get ready');
  assert.strictEqual(g.clueView(g.clue, until + 1), null, 'gone afterwards');
  // the server re-sends state when it appears and disappears
  g.tick(at - 30_000);
  assert.strictEqual(g.tick(at - 19_000), true);
  // task-doers get the warning
  g.completeTask(p[1].id, Object.keys(require('../server/tasks').TASKS)[0]);
  assert.strictEqual(g.viewFor(p[1].id).you.clueWarning, true);
  assert.strictEqual(g.viewFor(p[2].id).you.clueWarning, false);
  assert.ok(role('parasite'));
});

test('the Holo-Jester makes one player see a fake clue (and things that are not there) for a day', () => {
  const { g, p, role } = setup(['comms', 'engineer', 'medic', 'jester', 'parasite']);
  const victim = role('engineer');
  playNight(g, { [role('jester').id]: [victim.id] });
  assert.ok(g.draft.events.some((e) => e.k === 'hallucinate' && e.t === victim.id && e.works));
  g.applyDraft(2000);
  assert.strictEqual(g.hallucination.id, victim.id);
  g.beginRoam(10_000);
  const at = g.hallucination.clue.at;
  assert.ok(at, 'the fake clue is scheduled even with no real clue');
  const seen = g.viewFor(victim.id);
  assert.ok(seen.you.fx && seen.you.fx.seed != null, 'the victim gets hallucinations');
  assert.strictEqual(g.viewFor(p[0].id).you.fx, null, 'nobody else does');
  // only the victim sees the fake clue when it arrives
  const realNow = Date.now;
  Date.now = () => at + 1000;
  try {
    assert.ok(g.viewFor(victim.id).clue, 'victim sees a clue');
    assert.strictEqual(g.viewFor(p[0].id).clue, null, 'others see nothing');
  } finally {
    Date.now = realNow;
  }
  // it wears off at night, and the Captain/Mimic manifest shows it
  assert.ok(g.manifest().find((m) => m.id === victim.id).hallucinating);
  g.beginNight(20_000);
  assert.strictEqual(g.hallucination, null);
});

test('last words: the airlocked player gets a spotlight first, and can finish early', () => {
  const { g, p } = setup(['comms', 'engineer', 'medic', 'hacker', 'parasite']);
  playNight(g);
  dawnToNominations(g);
  runVote(g, p[0], p[1], [p[0], p[2], p[3], p[4]]);
  g.beginDusk(5000);
  assert.strictEqual(g.phase, 'lastwords');
  assert.strictEqual(g.viewFor(p[2].id).lastWords.id, p[1].id);
  assert.ok(p[1].alive, 'not airlocked yet');
  g.doneSpeaking(p[2].id, 5100); // only they (or the host) can cut it short
  assert.strictEqual(g.phase, 'lastwords');
  g.doneSpeaking(p[1].id, 5200);
  assert.strictEqual(g.phase, 'dusk');
  assert.ok(!p[1].alive);
  assert.ok(g.dayLog.some((e) => e.k === 'airlock' && e.id === p[1].id));
  // and the timer does it too
  const second = setup(['comms', 'engineer', 'medic', 'hacker', 'parasite']);
  playNight(second.g);
  dawnToNominations(second.g);
  runVote(second.g, second.p[0], second.p[2], second.p);
  second.g.beginDusk(5000);
  second.g.tick(5000 + second.g.dur('lastwords') + 1);
  assert.strictEqual(second.g.phase, 'dusk');
});

test('claims, the day log and the end-of-game awards', () => {
  const { g, p, role } = setup(['comms', 'engineer', 'medic', 'hacker', 'parasite']);
  playNight(g);
  dawnToNominations(g);
  assert.ok(g.dayLog.some((e) => e.k === 'dawn'));
  g.setClaim(p[0].id, 'comms', 'Bea or Cid is the Medic');
  g.setClaim(role('hacker').id, 'medic', '');
  assert.strictEqual(g.baseView().claims[p[0].id].text, 'Bea or Cid is the Medic');
  assert.throws(() => g.setClaim(p[0].id, 'banana'), /Unknown role/);
  g.setClaim(p[0].id, null, '');
  assert.strictEqual(g.claims[p[0].id], undefined, 'claims can be taken back');
  for (let i = 0; i < 6; i++) g.noteChat(p[2].id);
  g.bump('tasks', p[1].id, 2); // (tasks only happen while exploring)
  runVote(g, p[0], role('parasite'), [p[0], p[1], p[2]]);
  assert.ok(g.dayLog.some((e) => e.k === 'vote' && e.votes === 3));
  dusk(g, 9000);
  assert.strictEqual(g.winner, 'crew');
  const titles = g.awards.map((a) => a.title);
  assert.ok(titles.includes('Sharpest Eye'));
  assert.ok(titles.includes('Chatterbox'));
  assert.ok(titles.includes('Hardest Worker'));
  assert.ok(titles.includes('Best Liar'));
  const sum = g.summary();
  assert.strictEqual(sum.winner, 'crew');
  assert.strictEqual(sum.roles.length, 5);
});

test('the Captain can start silly ship events', () => {
  const { g, captain } = setup(['comms', 'engineer', 'medic', 'hacker', 'parasite'], { mode: 'captain' });
  g.shipEventStart(captain.id, 'zerog', 1000);
  assert.strictEqual(g.shipEvent.kind, 'zerog');
  assert.throws(() => g.shipEventStart(captain.id, 'explode', 1000), /Unknown/);
  assert.throws(() => g.shipEventStart(g.players[0].id, 'disco', 1000), /Captain/);
});

// ---------------------------------------------------------------------------
// Party features: ghosts, AFK, bios, ship names, rematches and the season
// ---------------------------------------------------------------------------

const SEVEN = ['parasite', 'hacker', 'engineer', 'comms', 'scanner', 'medic', 'marine'];

// Night 1, then day 1 exploring.
function toRoam(g, role, now = 2000) {
  playNight(g, { [role('hacker').id]: [role('comms').id], [role('scanner').id]: [role('comms').id, role('medic').id] });
  g.applyDraft(now);
  g.beginRoam(now);
}

test('ghost predictions: first bet free, then one change a day, and the Psychic award', () => {
  const { g, p, role } = setup(SEVEN);
  toRoam(g, role);
  const ghost = role('comms');
  assert.throws(() => g.predict(ghost.id, role('parasite').id), /Only ghosts/);
  g.kill(ghost, 'captain');
  g.predict(ghost.id, role('hacker').id, 3000);
  g.predict(ghost.id, role('parasite').id, 4000); // the one change today
  assert.throws(() => g.predict(ghost.id, role('medic').id, 5000), /once a day/);
  assert.throws(() => g.predict(ghost.id, ghost.id), /another player/);
  g.day += 1; // tomorrow
  g.predict(ghost.id, role('medic').id, 6000);
  g.day -= 1;
  g.predictions[ghost.id] = { id: role('parasite').id, since: 4000, day: 1, changedDay: 1 };
  assert.strictEqual(g.viewFor(ghost.id).you.prediction.id, role('parasite').id);
  g.endGame(p[0].id, 'crew', 9000);
  const psychic = g.awards.find((a) => a.title === 'Psychic');
  assert.strictEqual(psychic?.id, ghost.id);
  assert.deepStrictEqual(g.viewFor(p[1].id).predictions, [{ id: ghost.id, target: role('parasite').id, day: 1 }]);
});

test('poltergeist: ghosts haunt the room they float in, 3 times a day with a cooldown', () => {
  const { g, p, role } = setup(SEVEN);
  toRoam(g, role);
  const ghost = role('medic');
  assert.throws(() => g.haunt(ghost.id, 'flicker', 'medbay', 3000), /Only ghosts/);
  g.kill(ghost, 'captain');
  assert.throws(() => g.haunt(ghost.id, 'flicker', 'corridor', 3000), /room first/);
  assert.throws(() => g.haunt(ghost.id, 'explode', 'medbay', 3000), /Unknown/);
  assert.deepStrictEqual(g.haunt(ghost.id, 'flicker', 'medbay', 3000), { kind: 'flicker', room: 'medbay', at: 3000 });
  assert.throws(() => g.haunt(ghost.id, 'crate', 'medbay', 4000), /sink in/);
  g.haunt(ghost.id, 'crate', 'cargo', 10_000);
  g.haunt(ghost.id, 'cackle', 'galley', 20_000);
  assert.strictEqual(g.viewFor(ghost.id).you.haunts.left, 0);
  assert.throws(() => g.haunt(ghost.id, 'flicker', 'medbay', 30_000), /ectoplasm/);
  g.day += 1;
  assert.strictEqual(g.viewFor(ghost.id).you.haunts.left, 3, 'fresh pranks tomorrow');
  g.beginMeeting(40_000);
  assert.throws(() => g.haunt(ghost.id, 'flicker', 'medbay', 50_000), /exploring/);
  g.endGame(p[0].id, 'crew', 60_000);
  assert.strictEqual(g.awards.find((a) => a.title === 'Poltergeist')?.id, ghost.id);
});

test('away from keyboard: idle players show a sleep icon and count as ready', () => {
  const { g, p, role } = setup(SEVEN);
  toRoam(g, role, 100_000);
  for (const x of p) g.touch(x.id, 100_000);
  p.slice(1).forEach((x) => g.setReady(x.id, true));
  assert.strictEqual(g.updateAfk(150_000), false, 'not idle long enough yet');
  assert.strictEqual(g.everyoneReady(), false);
  p.slice(1).forEach((x) => g.touch(x.id, 180_000));
  assert.strictEqual(g.updateAfk(195_000), true);
  assert.deepStrictEqual([...g.afk], [p[0].id]);
  assert.ok(g.everyoneReady(), 'the idle player no longer holds the ship up');
  assert.ok(g.viewFor(p[0].id).afk.includes(p[0].id));
  assert.strictEqual(g.touch(p[0].id, 196_000), true, 'moving the mouse wakes them up');
  assert.strictEqual(g.everyoneReady(), false);
  // each day starts fresh
  g.afk.add(p[0].id);
  g.beginRoam(300_000);
  assert.strictEqual(g.afk.size, 0);
});

test('bios end up in the stories; ship names', () => {
  const g = new Game('TEST', { random: seeded(3) });
  const a = g.addPlayer('Zorp');
  g.setBio(a.id, '  is allergic to zero gravity. ');
  assert.strictEqual(a.bio, 'allergic to zero gravity');
  assert.ok(g.shipName.length > 0, 'every ship gets a silly name');
  assert.throws(() => g.setShipName('nobody', 'Hax'), /Only the host/);
  g.setShipName(a.id, '  The   Leaky Teapot ');
  assert.strictEqual(g.shipName, 'The Leaky Teapot');
  g.setShipName(a.id, '');
  assert.ok(g.shipName.length > 0, 'a blank name gets a random one');
  const story = st.dawnStory([{ name: 'Zorp', bio: 'allergic to zero gravity' }], () => 0);
  assert.match(story, /Zorp, who is allergic to zero gravity/);
  assert.match(st.dawnStory(['Pip'], () => 0), /Pip/, 'plain names still work');
  assert.match(st.executionStory('Zorp', () => 0, 'allergic to cheese'), /allergic to cheese/);
});

test('rematch keeps the crew and their suits, and the season keeps score', () => {
  const { g, p, role } = setup(SEVEN);
  const suits = p.map((x) => x.cosmetics.suit);
  assert.throws(() => g.rematch(p[3].id), /Only the host/, 'mid-game only the host can stop it');
  g.endGame(p[0].id, 'infiltrators', 5000);
  const evil = [role('parasite'), role('hacker')];
  const medic = role('medic');
  assert.strictEqual(g.viewFor(p[3].id).season.games, 1);
  g.rematch(p[3].id, 6000); // anyone can call it once the game is over
  assert.strictEqual(g.phase, 'lobby');
  assert.strictEqual(g.rematchAt, 6000);
  assert.deepStrictEqual(g.players.map((x) => x.cosmetics.suit), suits);
  const season = g.viewFor(p[0].id).season;
  assert.strictEqual(season.games, 1);
  for (const e of evil) assert.strictEqual(season.rows.find((r) => r.name === e.name).wins, 1);
  assert.strictEqual(season.rows.find((r) => r.name === medic.name).wins, 0);
  assert.ok(season.rows[0].points >= 3, 'winners top the table');
  assert.strictEqual(g.viewFor(p[0].id).round, 2);
  // a second game adds to the same season
  g.start(p[0].id, 7000, { deal: SEVEN });
  g.endGame(p[0].id, 'crew', 8000);
  assert.strictEqual(g.viewFor(p[0].id).season.games, 2);
  assert.strictEqual(g.viewFor(p[0].id).season.rows.find((r) => r.name === p[0].name).games, 2);
});

test('last words: the most laughed-at ones make the share card', () => {
  const { g, p, role } = setup(SEVEN);
  playNight(g, { [role('hacker').id]: [role('comms').id], [role('scanner').id]: [role('comms').id, role('medic').id] });
  dawnToNominations(g);
  runVote(g, role('comms'), role('engineer'), g.players);
  g.beginDusk(9000);
  assert.strictEqual(g.phase, 'lastwords');
  const victim = role('engineer');
  g.noteLastWords(victim.id, 'Tell my cat');
  g.noteLastWords(victim.id, 'I was the Engineer!');
  g.noteLastWords(p[1].id, 'not my turn'); // ignored
  g.react(p[3].id, '🤣');
  g.react(p[4].id, '😱');
  g.react(victim.id, '🤣'); // laughing at yourself does not count
  assert.throws(() => g.react(p[1].id, '💩'), /Unknown reaction/);
  g.endGame(p[0].id, 'crew', 10_000);
  const best = g.viewFor(p[0].id).bestLastWords;
  assert.strictEqual(best.id, victim.id);
  assert.strictEqual(best.text, 'Tell my cat … I was the Engineer!');
  assert.strictEqual(best.laughs, 1);
  assert.strictEqual(best.reactions, 2);
});

test('late friends watch as spectators and join the crew at the rematch', () => {
  const { g, p } = setup(SEVEN);
  assert.throws(() => new Game('X').addSpectator('Pat'), /still docked/);
  const pat = g.addSpectator('Pat');
  assert.throws(() => g.addSpectator('pat'), /taken/);
  const view = g.viewFor(pat.id);
  assert.deepStrictEqual(view.you, { id: pat.id, name: 'Pat', isSpectator: true });
  assert.strictEqual(view.grimoire, undefined, 'spectators never see roles');
  assert.ok(view.players.every((x) => x.role === undefined));
  assert.strictEqual(g.viewFor(p[0].id).spectators[0].name, 'Pat');
  g.endGame(p[0].id, 'crew', 5000);
  g.react(pat.id, '👀'); // spectators can react
  g.rematch(p[2].id, 6000);
  const joined = g.get(pat.id);
  assert.ok(joined, 'the spectator is now a player, with the same id');
  assert.strictEqual(joined.token, pat.token);
  assert.strictEqual(g.players.length, 8);
  assert.strictEqual(g.spectators.length, 0);
});

test('a quiet host in the lobby lets anyone launch', () => {
  const g = new Game('X', { random: seeded(2) });
  const host = g.addPlayer('Host');
  const others = ['A', 'B', 'C', 'D'].map((n) => g.addPlayer(n));
  g.touch(host.id, 1000);
  assert.strictEqual(g.hostAway(30_000), false);
  assert.throws(() => g.start(others[0].id, 30_000), /Only the host/);
  assert.strictEqual(g.hostAway(70_000), true, 'a minute without touching anything');
  assert.ok(g.viewFor(others[0].id).hostAway !== undefined);
  g.start(others[0].id, 70_000);
  assert.strictEqual(g.phase, 'night');
  // a disconnected host counts as away straight away
  const g2 = new Game('Y');
  const h2 = g2.addPlayer('Host');
  g2.addPlayer('A');
  h2.connected = false;
  assert.strictEqual(g2.hostAway(0), true);
  assert.strictEqual(new Game('Z', { mode: 'captain' }).hostAway(), false, 'only in Autopilot games');
});

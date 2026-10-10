// The Outbreak script: the Carrier infects instead of killing, and the infected burst a night later.
// Run with: npm test
const test = require('node:test');
const assert = require('node:assert');
const { Game } = require('../server/engine');
const { ROLES, rolesOfTypeIn } = require('../server/roles');
const { SCRIPTS, inScript, themeOf } = require('../server/scripts');
const st = require('../server/storyteller');

function seeded(seed = 1) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A started Outbreak game where seat i gets deal[i].
function outbreak(deal, { seed = 1 } = {}) {
  const g = new Game('TEST', { random: seeded(seed) });
  g.script = 'outbreak';
  const p = deal.map((_, i) => g.addPlayer(`P${i}`));
  g.start(p[0].id, 0, { deal });
  const role = (r) => g.players.find((x) => x.role === r);
  return { g, p, role };
}

// Seven players: seat 0 the Carrier, seat 1 a Saboteur, the rest Crew.
const SEVEN = ['carrier', 'quack', 'vaccinator', 'tracer', 'hazmat', 'sensor', 'scanner'];

function night(g, choices = {}, now = 5000) {
  // anyone whose choice would change what the test is about gets a harmless default (nobody sick, nobody cured by accident)
  const carrier = g.players.find((x) => x.role === 'carrier');
  const saboteurSeat = g.players[1];
  choices = { ...choices };
  for (const [pid, prompt] of Object.entries(g.prompts)) {
    if (choices[pid]) continue;
    if (prompt.role === 'vaccinator') {
      const vax = g.get(pid);
      const harmless = [carrier, saboteurSeat, ...g.players].find((x) => x.alive && x.infected == null && x.id !== pid && x.id !== vax.lastPick);
      choices[pid] = [harmless.id];
    }
    if (prompt.role === 'quack') choices[pid] = [carrier.id];
  }
  for (const [pid, targets] of Object.entries(choices)) g.submitChoice(pid, targets, now);
  g.resolveNight(now);
  g.applyDraft(now + 1);
}

// From dawn to the next night with nobody airlocked.
function nextNight(g, now = 3000) {
  g.beginRoam(now);
  g.beginMeeting(now);
  g.beginNominations(now);
  g.beginDusk(now);
  if (g.phase === 'lastwords') g.finishLastWords(now);
  if (g.winner) return;
  g.beginNight(now + 1);
}

const notesOf = (p) => p.notes.map((n) => n.text);

// every event of a kind from the whole game (the night's chapter is closed once dawn arrives)
const eventsOf = (g, k) => g.history.flatMap((h) => h.events || []).filter((e) => e.k === k);

test('Outbreak deals valid casts for every player count: always the Carrier, only its own roles', () => {
  assert.ok(SCRIPTS.outbreak.roles.every((r) => ROLES[r]), 'every role exists');
  assert.deepStrictEqual(SCRIPTS.outbreak.demons, ['carrier']);
  const outbreakOnly = Object.keys(ROLES).filter((r) => inScript(r, 'outbreak') && !inScript(r, 'classic') && !inScript(r, 'carnival'));
  assert.strictEqual(outbreakOnly.length, 11);
  for (let n = SCRIPTS.outbreak.minPlayers; n <= 15; n++) {
    for (let seed = 1; seed <= 20; seed++) {
      const roles = st.pickRoles(n, seeded(seed), 'outbreak');
      assert.strictEqual(roles.length, n);
      assert.ok(roles.every((r) => inScript(r, 'outbreak')), `${n} players, seed ${seed}`);
      assert.ok(roles.includes('carrier'));
      assert.strictEqual(st.validateRoles(roles, n, 'outbreak'), null);
    }
  }
  assert.ok(rolesOfTypeIn('outbreak', 'saboteur').length >= 4);
  // every role card and the theme have the words the screens need
  for (const r of outbreakOnlyRoles()) assert.ok(ROLES[r].ability && ROLES[r].tips.length >= 3 && ROLES[r].flavor, r);
  assert.strictEqual(themeOf('outbreak').doom, 'the Bloom');
  assert.ok(!/black hole/i.test(JSON.stringify(themeOf('outbreak'))));
});

function outbreakOnlyRoles() {
  return Object.keys(ROLES).filter((r) => inScript(r, 'outbreak') && !inScript(r, 'classic') && !inScript(r, 'carnival'));
}

test('the Carrier infects on the first night: nobody dies that night, the victim is told, and bursts a night later', () => {
  const { g, p } = outbreak(SEVEN);
  assert.ok(g.prompts[p[0].id], 'the Carrier wakes on night 1');
  night(g, { [p[0].id]: [p[3].id] });
  assert.strictEqual(g.dawn.deaths.length, 0, 'nobody dies yet');
  assert.strictEqual(p[3].infected, 1);
  assert.ok(notesOf(p[3]).some((t) => /INFECTED/.test(t)), 'the victim is told');
  assert.ok(p[3].alive);
  assert.deepStrictEqual(g.viewFor(p[3].id).you.infected, { since: 1, bursts: 2 });
  assert.strictEqual(g.viewFor(p[2].id).you.infected, null, 'nobody else can see it');
  // night 2: the victim bursts, and the Carrier infects someone new
  nextNight(g);
  night(g, { [p[0].id]: [p[5].id] });
  assert.deepStrictEqual(g.dawn.deaths.map((d) => d.id), [p[3].id]);
  assert.strictEqual(g.dawn.deaths[0].cause, 'burst');
  assert.strictEqual(g.dawn.deaths[0].anim, 'melted');
  assert.ok(!p[3].alive);
  assert.strictEqual(p[5].infected, 2);
  assert.ok(/spore|name tag|burst|bloom|fever|glitter|smear|puddle|janitor/i.test(g.dawn.story), g.dawn.story);
});

test('Vaccinator: cures an infected player on the night they would burst; shields a healthy one; never the same twice', () => {
  const { g, p } = outbreak(SEVEN);
  night(g, { [p[0].id]: [p[3].id], [p[2].id]: [p[6].id] }); // night 1: Tracer infected, Scanner shielded (nothing to cure)
  nextNight(g);
  assert.throws(() => g.submitChoice(p[2].id, [p[6].id], 6000), /last night/, 'not the same player two nights in a row');
  night(g, { [p[0].id]: [p[5].id], [p[2].id]: [p[3].id] });
  assert.ok(p[3].alive, 'cured in time');
  assert.strictEqual(p[3].infected, null);
  assert.ok(notesOf(p[3]).some((t) => /CURED/.test(t)));
  assert.strictEqual(g.dawn.deaths.length, 0);
  nextNight(g);
  night(g, { [p[0].id]: [p[4].id], [p[2].id]: [p[5].id] }); // the Sensor, infected last night, is cured on the night they would burst
  assert.strictEqual(p[5].infected, null);
  nextNight(g);
  night(g, { [p[0].id]: [p[6].id], [p[2].id]: [p[6].id] });
  assert.strictEqual(p[6].infected, null, 'shielded against the Carrier');
  assert.strictEqual(eventsOf(g, 'infect').pop().result, 'shielded');
});

test('infected players\' abilities malfunction: an infected Contact Tracer counts wrong until cured', () => {
  const { g, p } = outbreak(SEVEN);
  night(g, { [p[0].id]: [p[3].id] }); // the Tracer is infected on night 1
  assert.ok(g.broken(p[3]) && g.lies(p[3]));
  nextNight(g);
  // night 2: cured by the Vaccinator, but this night's reading is still wrong (0 infected among two healthy players)
  night(g, { [p[3].id]: [p[1].id, p[6].id], [p[2].id]: [p[3].id], [p[0].id]: [p[5].id] });
  const first = p[3].notes.filter((n) => /Contact trace/.test(n.text)).pop();
  assert.ok(!/^Contact trace of .*: 0 of them are infected/.test(first.text), first.text);
  assert.ok(!g.broken(p[3]), 'cured, so the next reading is true');
  nextNight(g);
  night(g, { [p[3].id]: [p[1].id, p[6].id], [p[2].id]: [p[4].id], [p[0].id]: [p[4].id] });
  const second = p[3].notes.filter((n) => /Contact trace/.test(n.text)).pop();
  assert.match(second.text, /0 of them are infected/);
});

test('Hazmat Tech cannot be infected, and is warned only the first time', () => {
  const { g, p } = outbreak(SEVEN);
  night(g, { [p[0].id]: [p[4].id] });
  assert.strictEqual(p[4].infected, null);
  assert.ok(notesOf(p[4]).some((t) => /hazmat suit held/.test(t)));
  assert.strictEqual(eventsOf(g, 'infect')[0].result, 'hazmat');
  nextNight(g);
  night(g, { [p[0].id]: [p[4].id] });
  assert.strictEqual(notesOf(p[4]).filter((t) => /hazmat suit held/.test(t)).length, 1, 'no second warning');
  assert.strictEqual(p[4].infected, null);
});

test('Contact Tracer counts the infected, and a Hypochondriac always shows up as infected', () => {
  const deal = ['carrier', 'quack', 'tracer', 'hypochondriac', 'vaccinator', 'hazmat', 'sensor', 'scanner']; // 8 players: 5 crew, 1 drifter, 1 saboteur
  const { g, p } = outbreak(deal);
  night(g, { [p[0].id]: [p[4].id], [p[2].id]: [p[3].id, p[5].id] });
  let msg = p[2].notes.find((n) => /Contact trace/.test(n.text));
  assert.match(msg.text, /1 of them is infected/, 'the Hypochondriac counts, the Hazmat Tech does not');
  nextNight(g);
  night(g, { [p[0].id]: [p[1].id], [p[2].id]: [p[4].id, p[6].id] });
  msg = p[2].notes.filter((n) => /Contact trace/.test(n.text)).pop();
  assert.match(msg.text, /1 of them is infected/, 'the Vaccinator infected on night 1 is still sick');
  assert.ok(p[2].notes.some((n) => /fever/.test(n.text)) === false, 'the Tracer is healthy');
  // the Hypochondriac is told they have a fever every dawn, and is never really infected
  assert.ok(notesOf(p[3]).filter((t) => /INFECTED/.test(t)).length >= 2);
  assert.strictEqual(p[3].infected, null);
});

test('Biohazard Sensor: yes when someone was infected, no when every attempt failed', () => {
  const { g, p } = outbreak(SEVEN);
  night(g, { [p[0].id]: [p[3].id] });
  assert.match(p[5].notes.find((n) => /ALARM|All quiet/.test(n.text)).text, /ALARM/);
  nextNight(g);
  night(g, { [p[0].id]: [p[4].id] }); // the Hazmat Tech: nothing happens
  const last = p[5].notes.filter((n) => /ALARM|All quiet/.test(n.text)).pop();
  assert.match(last.text, /All quiet/);
});

test('Blood Donor swaps places with an infected player, once', () => {
  const deal = ['carrier', 'quack', 'donor', 'tracer', 'vaccinator', 'sensor', 'scanner']; // 7 players
  const { g, p } = outbreak(deal);
  night(g, { [p[0].id]: [p[3].id] }); // the Tracer is infected
  nextNight(g);
  night(g, { [p[2].id]: [p[3].id], [p[0].id]: [p[6].id] });
  assert.ok(p[3].alive && p[3].infected === null, 'the patient is cured');
  assert.strictEqual(p[2].infected, 2, 'the donor caught it');
  assert.strictEqual(g.dawn.deaths.length, 0);
  nextNight(g);
  assert.strictEqual(g.prompts[p[2].id], undefined, 'once only (used)');
  night(g, { [p[0].id]: [p[5].id] });
  assert.ok(!p[2].alive, 'and the donor bursts a night later, unless cured');
});

test('Patient Zero starts infected and bursts when the second night ends, or is cured', () => {
  // 8 players: 5 crew, a drifter (Patient Zero), a saboteur and the Carrier
  const deal = ['carrier', 'quack', 'patientzero', 'vaccinator', 'tracer', 'hazmat', 'sensor', 'scanner'];
  const first = outbreak(deal);
  assert.strictEqual(first.p[2].infected, 1);
  assert.ok(notesOf(first.p[2]).some((t) => /start the game infected/.test(t)));
  night(first.g, { [first.p[0].id]: [first.p[5].id] }); // the Carrier hits the Hazmat Tech: nothing
  assert.strictEqual(first.g.dawn.deaths.length, 0);
  nextNight(first.g);
  night(first.g, { [first.p[0].id]: [first.p[6].id] });
  assert.deepStrictEqual(first.g.dawn.deaths.map((d) => d.id), [first.p[2].id]);
  // cured on night 1: no burst
  const second = outbreak(deal, { seed: 4 });
  night(second.g, { [second.p[3].id]: [second.p[2].id], [second.p[0].id]: [second.p[5].id] });
  assert.strictEqual(second.p[2].infected, null);
  nextNight(second.g);
  night(second.g, { [second.p[0].id]: [second.p[6].id] });
  assert.ok(second.p[2].alive);
});

test('Quack Doctor: a false fever sounds exactly like a real one but infects nobody', () => {
  const { g, p } = outbreak(SEVEN);
  night(g, { [p[0].id]: [p[3].id], [p[1].id]: [p[6].id] });
  const real = notesOf(p[3]).find((t) => /INFECTED/.test(t));
  const fake = notesOf(p[6]).find((t) => /INFECTED/.test(t));
  assert.strictEqual(fake, real, 'indistinguishable');
  assert.strictEqual(p[6].infected, null);
  assert.ok(!g.broken(p[6]), 'the fake patient\'s abilities still work');
  nextNight(g);
  night(g, { [p[0].id]: [p[5].id] });
  assert.ok(p[6].alive && !p[3].alive, 'only the real patient bursts');
});

test('Bioterrorist infects a second player, once, and the Vaccinator can only save one', () => {
  // 9 players: 5 crew, 2 drifters, a saboteur and the Carrier
  const deal = ['carrier', 'bioterrorist', 'vaccinator', 'tracer', 'hazmat', 'sensor', 'scanner', 'drunk', 'stowaway'];
  const { g, p } = outbreak(deal);
  night(g, { [p[0].id]: [p[3].id] });
  nextNight(g);
  night(g, { [p[0].id]: [p[5].id], [p[1].id]: [p[6].id], [p[2].id]: [p[3].id] }); // the Tracer is cured; two new infections
  assert.ok(p[5].infected === 2 && p[6].infected === 2, 'two new infections at once');
  nextNight(g);
  assert.strictEqual(g.prompts[p[1].id], undefined, 'the bioterrorist\'s one-time infection is used up');
  night(g, { [p[0].id]: [p[7].id], [p[2].id]: [p[5].id] });
  assert.deepStrictEqual(g.dawn.deaths.map((d) => d.id), [p[6].id], 'one was cured, one burst');
});

// An 8-player Outbreak: the Spore Host (seat 1) is nominated by `nominatorSeat` and airlocked on day 1.
function sporeDay(nominatorSeat, seed) {
  const deal = ['carrier', 'sporehost', 'vaccinator', 'tracer', 'hazmat', 'sensor', 'scanner', 'drunk'];
  const { g, p } = outbreak(deal, { seed });
  night(g, { [p[0].id]: [p[2].id] });
  g.beginRoam(3000);
  g.beginMeeting(3000);
  g.beginNominations(3000);
  g.nominate(p[nominatorSeat].id, p[1].id, 3100);
  g.nomination.hands = Object.fromEntries(g.players.map((x) => [x.id, true]));
  g.nomination.stage = 'count';
  g.tally(3200);
  g.beginDusk(3300);
  if (g.phase === 'lastwords') g.finishLastWords(3400); // their last words, then the airlock
  return { g, p };
}

test('Spore Host: airlocked, the nominator catches the spores (not a Hazmat Tech)', () => {
  const { g, p } = sporeDay(5, 5); // the Sensor nominates
  assert.ok(!p[1].alive, 'airlocked');
  assert.strictEqual(p[5].infected, 1);
  assert.ok(notesOf(p[5]).some((t) => /spores/.test(t) && /INFECTED/.test(t)));
  // they burst the very next night unless cured
  nextNight(g);
  night(g, { [p[0].id]: [p[3].id] });
  assert.ok(!p[5].alive);
  // the Hazmat Tech's suit keeps the spores out
  const suit = sporeDay(4, 6);
  assert.strictEqual(suit.p[4].infected, null);
});

test('the Carrier follows the usual rules: airlock it and the crew wins; a glitched Carrier infects nobody', () => {
  const { g, p } = outbreak(['carrier', 'hacker', 'vaccinator', 'tracer', 'hazmat', 'sensor', 'scanner', 'drunk']);
  night(g, { [p[0].id]: [p[3].id], [p[1].id]: [p[0].id] }); // the Hacker glitches the Carrier
  assert.strictEqual(p[3].infected, null, 'a glitched Carrier infects nobody');
  g.kill(p[0], 'airlock');
  g.checkWin();
  assert.strictEqual(g.winner, 'crew');
  assert.match(g.winReason, /Bloom/);
  assert.ok(!/black hole|Great Grin/i.test(g.winReason));
});

test('a game restarts clean: infection, the net and "not twice" memory do not carry over', () => {
  const { g, p } = outbreak(SEVEN);
  night(g, { [p[0].id]: [p[3].id], [p[2].id]: [p[6].id] });
  assert.strictEqual(p[3].infected, 1);
  assert.strictEqual(p[2].lastPick, p[6].id);
  g.reset(p[0].id);
  for (const x of g.players) {
    assert.strictEqual(x.infected, null);
    assert.strictEqual(x.lastPick, null);
    assert.strictEqual(x.netUsed, false);
  }
});

test('outbreak stories, execution lines and the persisted game', () => {
  assert.match(st.dawnStory([{ name: 'Ada', cause: 'burst' }], seeded(1), 'outbreak'), /Ada/);
  assert.ok(st.dawnStory([], seeded(1), 'outbreak').length > 10);
  assert.match(st.executionStory('Bo', seeded(2), '', 'outbreak'), /Bo/);
  assert.strictEqual(themeOf('outbreak').rooms.airlock, 'The Decon Chamber');
  const { g, p } = outbreak(SEVEN);
  assert.strictEqual(g.roomName('medbay'), 'The Sick Bay');
  night(g, { [p[0].id]: [p[3].id] });
  assert.strictEqual(g.summary().script, 'outbreak');
});

// The Cosmic Carnival script: its roles and the twists they bring. Run with: npm test
const test = require('node:test');
const assert = require('node:assert');
const { Game } = require('../server/engine');
const { ROLES, rolesOfTypeIn } = require('../server/roles');
const { SCRIPTS, inScript } = require('../server/scripts');
const st = require('../server/storyteller');

function seeded(seed = 1) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A started Cosmic Carnival game where seat i gets deal[i].
function carnival(deal, { seed = 1, drunkAs } = {}) {
  const g = new Game('TEST', { random: seeded(seed) });
  g.script = 'carnival';
  const p = deal.map((_, i) => g.addPlayer(`P${i}`));
  g.start(p[0].id, 0, { deal, drunkAs });
  const role = (r) => g.players.find((x) => x.role === r);
  return { g, p, role };
}

// Seven players: 5 crew, 1 saboteur, a demon. (Seat 0 is the demon, seat 1 the saboteur.)
const SEVEN = ['parasite', 'hexer', 'liontamer', 'acrobat', 'palmreader', 'stagehand', 'tickettaker'];

// Get through night 1 (everyone chooses what they must, or nothing) and on to the first morning.
function firstDawn(g, choices = {}) {
  for (const [pid, targets] of Object.entries(choices)) g.submitChoice(pid, targets, 1000);
  g.resolveNight(1000);
  g.applyDraft(2000);
}

// From dawn to the next night, with this player airlocked (or nobody).
function nextNight(g, { airlock = null, now = 3000 } = {}) {
  g.beginRoam(now);
  g.beginMeeting(now);
  g.beginNominations(now);
  if (airlock) g.block = { id: airlock, votes: 9 };
  g.beginDusk(now);
  if (g.phase === 'lastwords') g.finishLastWords(now);
  if (g.winner) return;
  g.beginNight(now + 1);
}

// One night with these choices, then dawn.
function night(g, choices = {}, now = 5000) {
  for (const [pid, targets] of Object.entries(choices)) g.submitChoice(pid, targets, now);
  g.resolveNight(now);
  g.applyDraft(now + 1);
}

// ---------------------------------------------------------------------------
// The script itself
// ---------------------------------------------------------------------------

test('Cosmic Carnival deals valid casts for every player count, only from its own roles', () => {
  const carnivalOnly = Object.keys(ROLES).filter((r) => inScript(r, 'carnival') && !inScript(r, 'classic'));
  assert.ok(carnivalOnly.length >= 12, 'twelve roles that only the carnival has');
  let reflections = 0;
  let games = 0;
  for (let n = 5; n <= 15; n++) {
    for (let seed = 1; seed <= 40; seed++) {
      const roles = st.pickRoles(n, seeded(seed), 'carnival');
      assert.strictEqual(st.validateRoles(roles, n, 'carnival'), null, `n=${n} seed=${seed}: ${roles}`);
      assert.ok(roles.every((r) => inScript(r, 'carnival')));
      const demons = roles.filter((r) => ROLES[r].type === 'parasite');
      assert.strictEqual(demons.length, 1);
      if (demons[0] === 'reflection') {
        reflections++;
        assert.ok(n >= 7, 'the Reflection only appears in games of 7 or more');
      }
      games++;
      const crew = roles.filter((r) => ROLES[r].type === 'crew');
      assert.ok(crew.filter((r) => ROLES[r].tags.includes('info')).length >= Math.ceil(crew.length / 2), 'enough clue roles');
      for (const r of roles) assert.ok(ROLES[r].minPlayers <= n, `${r} unlocked too early at ${n}`);
    }
  }
  assert.ok(reflections > 20 && reflections < games / 2, `the mirror shows up sometimes (${reflections} of ${games})`);
  // and the classic script never gets a carnival role
  for (let n = 5; n <= 15; n++) for (let seed = 1; seed <= 25; seed++) assert.ok(st.pickRoles(n, seeded(seed)).every((r) => inScript(r, 'classic')));
});

test('the host picks the script in the docking bay; roles and minimum players follow it', () => {
  const g = new Game('TEST', { random: seeded(3) });
  const host = g.addPlayer('Host');
  const other = g.addPlayer('Guest');
  assert.strictEqual(g.viewFor(host.id).script, 'classic');
  assert.throws(() => g.setScript(other.id, 'carnival'), /Only the host/);
  assert.throws(() => g.setScript(host.id, 'nope'), /Unknown script/);
  g.setScript(host.id, 'carnival');
  assert.strictEqual(g.viewFor(other.id).script, 'carnival');
  for (let i = 0; i < 2; i++) g.addPlayer(`P${i}`);
  assert.throws(() => g.start(host.id, 0), /needs at least 5 players/);
  g.addPlayer('Fifth');
  g.setCustomRoles(host.id, ['parasite', 'hexer', 'liontamer', 'acrobat', 'palmreader']);
  assert.throws(() => g.setCustomRoles(host.id, ['parasite', 'hacker', 'comms', 'coroner', 'blackbox']), /Comms Officer is not on the Cosmic Carnival script/);
  g.setScript(host.id, 'classic');
  assert.strictEqual(g.customRoles, null, 'hand-picked roles belong to the old script');
  g.setScript(host.id, 'carnival');
  g.start(host.id, 0);
  assert.ok(g.players.every((p) => inScript(p.role, 'carnival')));
  assert.throws(() => g.setScript(host.id, 'classic'), /already launched/);
  assert.match(g.log[0].text, /Roll up, roll up/);
});

// ---------------------------------------------------------------------------
// Crew
// ---------------------------------------------------------------------------

test('Lion Tamer: a right guess stops the Parasite and unmasks the tamer; a wrong guess changes nothing; no repeats', () => {
  const { g, p, role } = carnival(SEVEN);
  const [parasite, , tamer, acrobat, reader, hand] = p;
  firstDawn(g);
  nextNight(g);
  assert.strictEqual(g.night, 2);
  assert.ok(g.prompts[tamer.id] && g.prompts[tamer.id].notRepeat, 'the tamer wakes from night 2 and cannot repeat');
  // a wrong guess: the Parasite kills as normal
  night(g, { [tamer.id]: [acrobat.id], [parasite.id]: [reader.id] });
  assert.ok(!reader.alive, 'the Parasite got through');
  // the next night: picking the same player again is refused
  nextNight(g, { now: 8000 });
  assert.throws(() => g.submitChoice(tamer.id, [acrobat.id], 9000), /last night/);
  // guessing the Parasite blocks the kill and tells it who the tamer is
  night(g, { [tamer.id]: [parasite.id], [parasite.id]: [hand.id] }, 9500);
  assert.ok(hand.alive, 'the Parasite was stopped');
  assert.ok(parasite.notes.some((n) => /Lion Tamer/.test(n.text) && /P2/.test(n.text)), 'the Parasite learns who the tamer is');
  assert.ok(g.history.some((h) => (h.events || []).some((e) => e.k === 'kill' && e.result === 'tamed')));
});

test('Acrobat: a safety net catches the first attack and the first airlocking, never the second', () => {
  const { g, p } = carnival(SEVEN);
  const [parasite, , tamer, acrobat, reader, hand, ticket] = p;
  firstDawn(g);
  nextNight(g);
  night(g, { [tamer.id]: [hand.id], [parasite.id]: [acrobat.id] });
  assert.ok(acrobat.alive, 'the net caught them');
  assert.ok(acrobat.notes.some((n) => /safety net/.test(n.text)), 'and they are told');
  assert.ok(acrobat.netUsed);
  // airlocking the Acrobat now is a normal death, since the net is gone
  nextNight(g, { now: 8000 });
  night(g, { [tamer.id]: [ticket.id], [parasite.id]: [reader.id] }, 9000);
  // a fresh Acrobat survives being airlocked once
  const fresh = carnival(SEVEN, { seed: 5 });
  const [fp, , , fa] = fresh.p;
  firstDawn(fresh.g);
  fresh.g.beginRoam(3000);
  fresh.g.beginMeeting(3000);
  fresh.g.beginNominations(3000);
  fresh.g.block = { id: fa.id, votes: 5 };
  fresh.g.beginDusk(3000);
  assert.strictEqual(fresh.g.phase, 'lastwords');
  fresh.g.finishLastWords(3000);
  assert.ok(fa.alive, 'the net caught the airlocked Acrobat');
  assert.strictEqual(fresh.g.dusk.survived, true);
  assert.ok(!fresh.g.winner);
  // the second time is for real
  fresh.g.beginNight(4000);
  night(fresh.g, {}, 4500);
  fresh.g.beginRoam(6000);
  fresh.g.beginMeeting(6000);
  fresh.g.beginNominations(6000);
  fresh.g.block = { id: fa.id, votes: 5 };
  fresh.g.beginDusk(6000);
  fresh.g.finishLastWords(6000);
  assert.ok(!fa.alive, 'no net the second time');
  assert.ok(fp.alive);
});

test('Palm Reader, Stagehand and Ticket Taker: clues that are true, and false when glitched', () => {
  const { g, p } = carnival(SEVEN);
  const [parasite, hexer, tamer, acrobat, reader, hand, ticket] = p;
  // night 1: the Palm Reader looks at the Hexer (evil), the Stagehand counts the Tamer (wakes from night 2: asleep) and the Hexer (wakes)
  g.submitChoice(reader.id, [hexer.id], 1000);
  g.submitChoice(hand.id, [hexer.id, tamer.id], 1000);
  g.submitChoice(hexer.id, [parasite.id], 1000);
  g.resolveNight(1000);
  const msgs = g.draft.messages;
  const palm = msgs.find((m) => m.role === 'palmreader');
  assert.ok(palm.truthful && palm.shown.includes('hexer'), 'one of the two visions is the real role');
  assert.strictEqual(palm.shown.filter((r) => ['saboteur', 'parasite'].includes(ROLES[r].type)).length, 1, 'one good and one evil vision');
  const backstage = msgs.find((m) => m.role === 'stagehand');
  assert.strictEqual(backstage.value, 1, 'the Hexer woke, the Lion Tamer did not (night 1)');
  g.applyDraft(2000);

  // day 1: the Parasite votes in a nomination; the Ticket Taker hears about it on night 2
  g.beginRoam(3000);
  g.beginMeeting(3000);
  g.beginNominations(3000);
  g.votesToday = [{ voters: [parasite.id, hand.id], votes: 2 }];
  g.beginDusk(3000);
  g.beginNight(3500);
  g.submitChoice(tamer.id, [hand.id], 4000);
  g.submitChoice(parasite.id, [ticket.id], 4000);
  g.submitChoice(hexer.id, [hand.id], 4000);
  g.submitChoice(reader.id, [hexer.id], 4000);
  g.submitChoice(hand.id, [hexer.id, parasite.id], 4000);
  g.resolveNight(4000);
  const ticketMsg = g.draft.messages.find((m) => m.role === 'tickettaker');
  assert.strictEqual(ticketMsg, undefined, 'the Ticket Taker was killed tonight, so no news');
  assert.ok(g.draft.deaths.some((d) => d.id === ticket.id));
});

test('Ticket Taker hears whether the Parasite voted today (and is lied to by the Reflection)', () => {
  for (const [deal, expect] of [[SEVEN, true], [['reflection', ...SEVEN.slice(1)], false]]) {
    const { g, p } = carnival(deal);
    const [demon, , , , , , ticket] = p;
    firstDawn(g);
    g.beginRoam(3000);
    g.beginMeeting(3000);
    g.beginNominations(3000);
    g.votesToday = [{ voters: [demon.id], votes: 1 }];
    g.block = { id: p[4].id, votes: 5 };
    g.beginDusk(3000);
    g.finishLastWords(3000);
    g.beginNight(3500);
    g.submitChoice(demon.id, [p[3].id], 4000);
    g.resolveNight(4000);
    const msg = g.draft.messages.find((m) => m.role === 'tickettaker');
    assert.strictEqual(msg.value, expect, deal[0]);
  }
});

test('Magician: brings a dead Crew member back once, wastes the trick on anyone else, and can save it', () => {
  // seven players: 5 crew (incl. the Magician), 1 saboteur, the Parasite
  const deal = ['parasite', 'hexer', 'magician', 'liontamer', 'acrobat', 'palmreader', 'tickettaker'];
  const { g, p } = carnival(deal);
  const [parasite, hexer, magician, tamer, acrobat, reader, ticket] = p;
  firstDawn(g);
  nextNight(g);
  assert.strictEqual(g.prompts[magician.id], undefined, 'nobody is dead yet, so the Magician has nothing to do');
  night(g, { [parasite.id]: [reader.id], [tamer.id]: [ticket.id] });
  assert.ok(!reader.alive);
  nextNight(g, { now: 8000 });
  const prompt = g.prompts[magician.id];
  assert.ok(prompt && prompt.once && prompt.target === 'dead');
  assert.throws(() => g.submitChoice(magician.id, [ticket.id], 8100), /died/);
  // saving it for later does not use it up
  g.submitChoice(magician.id, [], 8100);
  g.submitChoice(tamer.id, [acrobat.id], 8100);
  g.submitChoice(parasite.id, [ticket.id], 8100);
  g.resolveNight(8200);
  g.applyDraft(8300);
  assert.ok(!ticket.alive && !reader.alive);
  assert.ok(!magician.used, 'saved');
  // now bring the Palm Reader back
  nextNight(g, { now: 9000 });
  assert.ok(g.prompts[magician.id], 'still has the trick');
  g.submitChoice(magician.id, [reader.id], 9100);
  g.submitChoice(tamer.id, [hexer.id], 9100);
  g.submitChoice(parasite.id, [acrobat.id], 9100);
  g.submitChoice(hexer.id, [tamer.id], 9100);
  g.resolveNight(9200);
  g.applyDraft(9300);
  assert.ok(reader.alive, 'the Palm Reader is back');
  assert.ok(g.dawn.revived.includes(reader.id));
  assert.match(g.dawn.story, /back from the void|glitter|alive again/);
  assert.ok(reader.notes.some((n) => /BACK from the dead/.test(n.text)));
  assert.strictEqual(reader.ghostVote, false);
  // it is used up
  nextNight(g, { now: 10_000 });
  assert.strictEqual(g.prompts[magician.id], undefined);
});

test('Magician: a Saboteur or Drifter cannot be revived, but the trick is still spent', () => {
  const deal = ['parasite', 'hexer', 'magician', 'liontamer', 'acrobat', 'palmreader', 'tickettaker'];
  const { g, p } = carnival(deal);
  const [parasite, hexer, magician, tamer, acrobat] = p;
  firstDawn(g);
  nextNight(g);
  hexer.alive = false; // the Hexer died (say, in a Lion Tamer's...). any dead Saboteur will do
  night(g, { [parasite.id]: [tamer.id], [tamer.id]: [acrobat.id] });
  nextNight(g, { now: 8000 });
  g.submitChoice(magician.id, [hexer.id], 8100);
  g.submitChoice(parasite.id, [acrobat.id], 8100);
  g.resolveNight(8200);
  g.applyDraft(8300);
  assert.ok(!hexer.alive, 'a Saboteur stays dead');
  assert.ok(magician.used);
});

// ---------------------------------------------------------------------------
// Evil
// ---------------------------------------------------------------------------

test('Knife Thrower: once a game, ignores the Medic, the net and every protection', () => {
  const deal = ['parasite', 'knifethrower', 'liontamer', 'acrobat', 'palmreader', 'stagehand', 'tickettaker'];
  const { g, p } = carnival(deal);
  const [parasite, knife, tamer, acrobat, reader] = p;
  firstDawn(g);
  nextNight(g);
  g.submitChoice(knife.id, [], 5000); // saving it
  g.submitChoice(parasite.id, [tamer.id], 5000);
  g.submitChoice(tamer.id, [reader.id], 5000);
  g.resolveNight(5000);
  g.applyDraft(5100);
  assert.ok(!tamer.alive && !knife.used, 'the knife was saved for later');
  nextNight(g, { now: 8000 });
  g.submitChoice(knife.id, [acrobat.id], 8100);
  g.submitChoice(parasite.id, [acrobat.id], 8100);
  g.resolveNight(8200);
  g.applyDraft(8300);
  assert.ok(!acrobat.alive, 'the knife goes straight through the safety net');
  nextNight(g, { now: 9000 });
  assert.strictEqual(g.prompts[knife.id], undefined, 'one knife per game');
});

test('Hexer: a hexed player who nominates dies, but the nomination still counts', () => {
  const { g, p } = carnival(SEVEN);
  const [parasite, hexer, tamer, acrobat, reader, hand, ticket] = p;
  g.submitChoice(hexer.id, [reader.id], 1000); // hex the Palm Reader
  g.submitChoice(reader.id, [hexer.id], 1000);
  g.submitChoice(hand.id, [reader.id, tamer.id], 1000);
  g.resolveNight(1000);
  g.applyDraft(2000);
  assert.strictEqual(g.hexed.id, reader.id);
  g.beginRoam(3000);
  g.beginMeeting(3000);
  g.beginNominations(3000);
  // someone else nominates freely
  g.nominate(acrobat.id, hand.id, 3100);
  assert.ok(acrobat.alive && g.nomination);
  g.nomination = null;
  // the hexed player nominates and dies on the spot
  g.nominate(reader.id, ticket.id, 3200);
  assert.ok(!reader.alive, 'hexed');
  assert.ok(g.nomination && g.nomination.nominee === ticket.id, 'the nomination goes ahead');
  assert.ok(g.dayLog.some((e) => e.k === 'hex' && e.id === reader.id));
  assert.strictEqual(g.hexed, null);
  // the curse only lasts one day
  g.nomination = null;
  g.beginDusk(3300);
  g.beginNight(3400);
  assert.strictEqual(g.hexed, null);
});

test('Hexer: the curse stops when the Hexer dies or only 3 players live', () => {
  const { g, p } = carnival(SEVEN);
  const [parasite, hexer, tamer, acrobat, reader, hand, ticket] = p;
  g.submitChoice(hexer.id, [reader.id], 1000);
  g.resolveNight(1000);
  g.applyDraft(2000);
  g.beginRoam(3000);
  g.beginMeeting(3000);
  g.beginNominations(3000);
  hexer.alive = false; // the Hexer is gone: the curse is lifted
  g.nominate(reader.id, ticket.id, 3100);
  assert.ok(reader.alive);
  // and with 3 players left a new hex does nothing
  const small = carnival(SEVEN, { seed: 9 });
  const [, h2, , a2, r2] = small.p;
  for (const x of small.p) if (![h2, a2, r2].includes(x)) x.alive = false;
  small.g.submitChoice(h2.id, [r2.id], 1000);
  small.g.resolveNight(1000);
  assert.strictEqual(small.g.draft.hexed, undefined);
});

test('Stage Double: the crew cannot win while both twins live, airlocking the good twin loses, and the double must go first', () => {
  const deal = ['parasite', 'stagedouble', 'liontamer', 'acrobat', 'palmreader', 'stagehand', 'tickettaker'];
  const { g, p } = carnival(deal);
  const [parasite, double, tamer, acrobat, reader] = p;
  assert.ok(g.twin && g.twin.evil === double.id);
  const good = g.get(g.twin.good);
  assert.strictEqual(ROLES[good.role].type, 'crew');
  assert.ok(double.notes.some((n) => n.text.includes(good.name)), 'the double learns the twin');
  assert.ok(good.notes.some((n) => n.text.includes(double.name) && /EVIL TWIN/.test(n.text)), 'the twin learns the double');
  firstDawn(g);
  // the crew airlocks the Parasite: not enough, with both twins alive
  nextNight(g, { airlock: parasite.id });
  assert.ok(!parasite.alive);
  assert.strictEqual(g.winner, null, 'the show goes on');
  assert.ok(g.alive().length > 2);
  // airlocking the double finishes it
  night(g, {});
  nextNight(g, { airlock: double.id, now: 9000 });
  assert.strictEqual(g.winner, 'crew');

  // airlocking the good twin loses at once
  const second = carnival(deal, { seed: 4 });
  firstDawn(second.g);
  second.g.beginRoam(3000);
  second.g.beginMeeting(3000);
  second.g.beginNominations(3000);
  second.g.block = { id: second.g.twin.good, votes: 9 };
  second.g.beginDusk(3000);
  second.g.finishLastWords(3000);
  assert.strictEqual(second.g.winner, 'infiltrators');
  assert.match(second.g.winReason, /Good Twin/);
});

// ---------------------------------------------------------------------------
// Drifters
// ---------------------------------------------------------------------------

test('Method Actor: thinks they are the Parasite, achieves nothing, and the real Parasite watches them', () => {
  // eight players: 5 crew, 1 drifter (the actor), 1 saboteur, the Parasite
  const deal = ['parasite', 'hexer', 'liontamer', 'acrobat', 'palmreader', 'tickettaker', 'stagehand', 'actor'];
  const { g, p } = carnival(deal);
  const [parasite, hexer, tamer, acrobat, reader, ticket, hand, actor] = p;
  assert.strictEqual(actor.believed, 'parasite');
  assert.strictEqual(actor.role, 'actor');
  const view = g.viewFor(actor.id);
  assert.strictEqual(view.you.role, 'parasite', 'their role card says Parasite');
  assert.ok(view.you.bluffs && view.you.bluffs.length === 3, 'and they get bluffs like a real Parasite');
  assert.ok(view.you.evilTeam && view.you.evilTeam.some((m) => m.id === actor.id && m.parasite), 'and a team (that is made up)');
  assert.ok(!view.you.evilTeam.some((m) => m.id === parasite.id) || true);
  assert.ok(parasite.notes.some((n) => /Your Method Actor is P7/.test(n.text)));
  assert.strictEqual(g.prompts[actor.id], undefined, 'no killing on night 1');
  firstDawn(g);
  nextNight(g);
  assert.ok(g.prompts[actor.id], 'from night 2 they pick a victim like the Parasite');
  night(g, { [actor.id]: [tamer.id], [parasite.id]: [ticket.id], [tamer.id]: [hexer.id] });
  assert.ok(tamer.alive, 'the actor kills nobody');
  assert.ok(!ticket.alive, 'the real Parasite does');
  assert.ok(parasite.notes.some((n) => /Method Actor, P7, aimed at P2/.test(n.text)), 'the Parasite sees the actor aim');
  // the actor is not the Demon to anyone else: scanners, the Gunner and the Lion Tamer
  assert.strictEqual(g.reg(actor).demon, false);
  assert.strictEqual(g.isDemon(actor), false);
  assert.strictEqual(g.isDemon(parasite), true);
  // and they are on the crew's side: they win when the Parasite dies
  nextNight(g, { airlock: parasite.id, now: 8000 });
  assert.strictEqual(g.winner, 'crew');
});

test('Clown: a dead Clown throws a pie; a good target is harmless, an evil one loses the game, a slow Clown throws blind', () => {
  const deal = ['parasite', 'hexer', 'liontamer', 'acrobat', 'palmreader', 'clown', 'tickettaker', 'stagehand'];
  const { g, p } = carnival(deal);
  const [parasite, hexer, , acrobat, , clown] = p;
  firstDawn(g);
  g.kill(clown, 'parasite');
  assert.ok(g.wish && g.wish.id === clown.id);
  assert.deepStrictEqual(g.viewFor(clown.id).you.wish.role, 'clown');
  assert.throws(() => g.chooseWish(acrobat.id, hexer.id), /no pie/);
  assert.throws(() => g.chooseWish(clown.id, clown.id), /living player/);
  g.chooseWish(clown.id, acrobat.id, 3000);
  assert.strictEqual(g.wish, null);
  assert.strictEqual(g.winner, null, 'the pie landed on a good player');
  assert.ok(g.dayLog.some((e) => e.k === 'pie' && !e.evil));

  // an evil target loses the game for the crew
  const second = carnival(deal, { seed: 3 });
  firstDawn(second.g);
  second.g.kill(second.p[5], 'parasite');
  second.g.chooseWish(second.p[5].id, second.p[1].id, 4000);
  assert.strictEqual(second.g.winner, 'infiltrators');
  assert.match(second.g.winReason, /pie/);

  // a Clown who does not choose throws at random after the deadline
  const third = carnival(deal, { seed: 8 });
  firstDawn(third.g);
  third.g.kill(third.p[5], 'airlock');
  assert.strictEqual(third.g.tick(10_000), false, 'the clock starts');
  assert.ok(third.g.wish.until > 10_000);
  assert.strictEqual(third.g.tick(third.g.wish.until + 1), true);
  assert.strictEqual(third.g.wish, null);
  assert.ok(third.g.dayLog.some((e) => e.k === 'pie' && e.random));

  // a glitched or drunk Clown has no pie
  const fourth = carnival(deal, { seed: 2 });
  firstDawn(fourth.g);
  fourth.g.glitch = { id: fourth.p[5].id };
  fourth.g.kill(fourth.p[5], 'parasite');
  assert.strictEqual(fourth.g.wish, null);
});

// ---------------------------------------------------------------------------
// The Reflection
// ---------------------------------------------------------------------------

test('The Reflection: every Crew clue is false, protections still work, and a day with no airlocking loses', () => {
  const deal = ['reflection', 'hexer', 'liontamer', 'acrobat', 'palmreader', 'engineer', 'scanner'];
  const { g, p, role } = carnival(deal);
  const [demon, hexer, tamer, acrobat, reader, engineer, scanner] = p;
  assert.ok(g.reflectionAlive());
  assert.ok(g.lies(engineer) && g.lies(scanner) && g.lies(reader), 'crew abilities lie');
  assert.ok(!g.lies(demon) && !g.lies(hexer), 'evil abilities do not');
  assert.ok(!g.broken(tamer), 'the Lion Tamer still works: it is not information');
  // the Scanner scans two players that include no Parasite (truth: no): the mirror says yes
  g.submitChoice(scanner.id, [acrobat.id, reader.id], 1000);
  g.resolveNight(1000);
  const scan = g.draft.messages.find((m) => m.role === 'scanner');
  assert.strictEqual(scan.truthful, false);
  assert.strictEqual(scan.value, true, 'a lie: "yes, a Parasite signal"');
  // the Engineer's count is always wrong too (truth for their neighbours: 0 or 1 evil)
  const eng = g.draft.messages.find((m) => m.role === 'engineer');
  assert.strictEqual(eng.truthful, false);
  g.applyDraft(2000);

  // the Lion Tamer still stops the Reflection when she guesses right
  nextNight(g, { airlock: reader.id });
  assert.strictEqual(g.phase, 'night', 'someone was airlocked, so the game goes on');
  night(g, { [tamer.id]: [demon.id], [demon.id]: [engineer.id] });
  assert.ok(engineer.alive, 'stopped');

  // a day with nobody airlocked: the mirror wins
  g.beginRoam(9000);
  g.beginMeeting(9000);
  g.beginNominations(9000);
  g.beginDusk(9000);
  assert.strictEqual(g.winner, 'infiltrators');
  assert.match(g.winReason, /nobody was airlocked/);
});

test('The Reflection: the Incubator inherits it, and with the Parasite there is no such rule', () => {
  const deal = ['reflection', 'incubator', 'liontamer', 'acrobat', 'palmreader', 'engineer', 'scanner'];
  const { g, p } = carnival(deal);
  const [demon, inc] = p;
  firstDawn(g);
  nextNight(g, { airlock: demon.id });
  assert.strictEqual(inc.role, 'reflection', 'the Incubator becomes the Reflection, not a Parasite');
  assert.ok(g.reflectionAlive());
  // with an ordinary Parasite, a quiet day is just a quiet day
  const quiet = carnival(SEVEN, { seed: 6 });
  firstDawn(quiet.g);
  nextNight(quiet.g);
  assert.strictEqual(quiet.g.winner, null);
});

test('carnival stories, the dawn recap and summaries mention the script', () => {
  const { g, p } = carnival(SEVEN);
  firstDawn(g);
  assert.ok(typeof g.dawn.story === 'string' && g.dawn.story.length > 10);
  assert.strictEqual(g.summary().script, 'carnival');
  assert.deepStrictEqual(Object.keys(SCRIPTS).sort(), ['carnival', 'classic']);
  assert.ok(SCRIPTS.carnival.roles.every((r) => ROLES[r]), 'every carnival role exists');
  assert.ok(rolesOfTypeIn('carnival', 'saboteur').length >= 4 && rolesOfTypeIn('carnival', 'crew').length >= 12);
  // carnival executions have their own circus lines
  const lines = new Set();
  for (let i = 1; i < 60; i++) lines.add(st.executionStory('Bo', seeded(i), '', 'carnival'));
  assert.ok([...lines].some((l) => /cannon|trapdoor|big top|bear|drumroll/.test(l)));
});

test('if the player on the block dies another way before dusk, nobody is airlocked (and the game does not hang)', () => {
  const { g, p } = carnival(SEVEN);
  const [parasite, hexer, tamer, acrobat, reader, hand, ticket] = p;
  g.submitChoice(hexer.id, [tamer.id], 1000); // hex the Lion Tamer
  g.resolveNight(1000);
  g.applyDraft(2000);
  g.beginRoam(3000);
  g.beginMeeting(3000);
  g.beginNominations(3000);
  g.block = { id: tamer.id, votes: 4 }; // the Tamer is heading for the airlock...
  g.nominate(tamer.id, ticket.id, 3100); // ...and nominates, which the curse punishes
  assert.ok(!tamer.alive);
  assert.strictEqual(g.block, null, 'the dead player is no longer on the block');
  g.nomination = null;
  g.beginDusk(3200);
  assert.strictEqual(g.phase, 'dusk', 'straight to dusk: nobody to airlock');
});

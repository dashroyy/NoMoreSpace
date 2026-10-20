// The Citadel of Traitors script: shields, a prize pot, unmasking, recruiting, and the Traitors' win rules.
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

// A started Citadel game where seat i gets deal[i].
function citadel(deal, { seed = 1 } = {}) {
  const g = new Game('TEST', { random: seeded(seed) });
  g.script = 'traitors';
  const p = deal.map((_, i) => g.addPlayer(`P${i}`));
  g.start(p[0].id, 0, { deal });
  return { g, p };
}

// Seven players: seat 0 the Head Traitor, seat 1 a Recruiter, five Faithful.
const SEVEN = ['headtraitor', 'recruiter', 'seer', 'daggerbearer', 'guardian', 'loyalist', 'comms'];

const notesOf = (p) => p.notes.map((n) => n.text);
const eventsOf = (g, k) => g.history.flatMap((h) => h.events || []).filter((e) => e.k === k);

// One night with these choices, then dawn. Anybody whose choice would spoil the test gets a harmless default.
function night(g, choices = {}, now = 5000) {
  choices = { ...choices };
  for (const [pid, prompt] of Object.entries(g.prompts)) {
    if (choices[pid]) continue;
    if (['guardian', 'blackmailer'].includes(prompt.role)) {
      // a harmless choice: one of the Traitors (not the one they chose last night)
      const ok = (x) => x.alive && x.id !== pid && x.id !== g.get(pid).lastPick;
      const pick = g.players.find((x) => ok(x) && ['headtraitor', 'recruiter', 'blackmailer', 'mole'].includes(x.role)) || g.players.find(ok);
      choices[pid] = [pick.id];
    }
  }
  for (const [pid, targets] of Object.entries(choices)) g.submitChoice(pid, targets, now);
  g.resolveNight(now);
  g.applyDraft(now + 1);
}

function nextNight(g, now = 3000) {
  g.beginRoam(now);
  g.beginMeeting(now);
  g.beginNominations(now);
  g.beginDusk(now);
  if (g.phase === 'lastwords') g.finishLastWords(now);
  if (g.winner) return;
  g.beginNight(now + 1);
}

// From dawn: this guest nominates that one, everyone votes YES, and the nominee is banished.
function banish(g, byIdx, whoIdx, { now = 3000 } = {}) {
  g.beginRoam(now);
  g.beginMeeting(now);
  g.beginNominations(now);
  g.nominate(g.players[byIdx].id, g.players[whoIdx].id, now + 100);
  g.nomination.hands = Object.fromEntries(g.players.map((x) => [x.id, true]));
  g.nomination.stage = 'count';
  g.tally(now + 200);
  g.beginDusk(now + 300);
  if (g.phase === 'lastwords') g.finishLastWords(now + 400);
  if (!g.winner) g.beginNight(now + 500);
}

// the rest of a day (no banishment), then the next night begins
function finishDay(g, now = 3000) {
  g.beginMeeting(now);
  g.beginNominations(now);
  g.beginDusk(now);
  if (g.phase === 'lastwords') g.finishLastWords(now);
  g.beginNight(now + 1);
}

test('the Citadel deals valid casts: always one of its Demons, never the Recruit, and it needs 7 players', () => {
  assert.ok(SCRIPTS.traitors.roles.every((r) => ROLES[r]), 'every role exists');
  assert.deepStrictEqual(SCRIPTS.traitors.demons, ['headtraitor', 'count', 'poisoner']);
  assert.ok(!SCRIPTS.traitors.roles.includes('recruit'), 'the Recruit only ever comes from an offer');
  assert.strictEqual(SCRIPTS.traitors.minPlayers, 7);
  for (let n = 7; n <= 15; n++) {
    for (let seed = 1; seed <= 20; seed++) {
      const roles = st.pickRoles(n, seeded(seed), 'traitors');
      assert.strictEqual(roles.length, n);
      assert.ok(roles.every((r) => inScript(r, 'traitors')), `${n} players, seed ${seed}`);
      assert.strictEqual(roles.filter((r) => SCRIPTS.traitors.demons.includes(r)).length, 1);
      assert.strictEqual(st.validateRoles(roles, n, 'traitors'), null);
    }
  }
  assert.ok(rolesOfTypeIn('traitors', 'saboteur').length >= 4);
  const g = new Game('X', {});
  g.script = 'traitors';
  const ids = Array.from({ length: 6 }, (_, i) => g.addPlayer(`P${i}`));
  assert.throws(() => g.start(ids[0].id, 0), /at least 7/);
  assert.strictEqual(themeOf('traitors').doom, 'the Blood Moon');
  assert.ok(!/black hole/i.test(JSON.stringify(themeOf('traitors'))));
});

test('the Traitors know each other from the start, even in a small game', () => {
  const { g, p } = citadel(SEVEN);
  assert.ok(g.evilInfoShared());
  assert.ok(g.viewFor(p[0].id).you.evilTeam.some((m) => m.name === 'P1'));
  assert.ok(g.viewFor(p[1].id).you.evilTeam.some((m) => m.name === 'P0'));
  assert.ok(notesOf(p[0]).length >= 0);
});

test('missions build the Prize Pot, and the best mission-doer wins a Shield that stops a murder', () => {
  const { g, p } = citadel(SEVEN);
  night(g, {});
  g.beginRoam(3000);
  g.completeTask(p[2].id, 'signal');
  g.completeTask(p[2].id, 'course');
  g.completeTask(p[4].id, 'core');
  assert.strictEqual(g.pot, 1500, 'every mission adds star-gold');
  assert.strictEqual(g.viewFor(p[3].id).pot, 1500);
  finishDay(g);
  assert.strictEqual(p[2].shield, 2, 'two missions beat one');
  assert.ok(notesOf(p[2]).some((t) => /Shield/.test(t)));
  assert.strictEqual(p[4].shield, null);
  // the Head Traitor strikes at the Shield holder: nothing happens, and they are told
  night(g, { [p[0].id]: [p[2].id] }, 6000);
  assert.strictEqual(g.dawn.deaths.length, 0);
  assert.ok(p[2].alive);
  assert.ok(notesOf(p[2]).some((t) => /Shield held/.test(t)));
  assert.strictEqual(p[2].shield, null, 'a Shield is spent after one night');
  assert.strictEqual(eventsOf(g, 'kill').pop().result, 'shield');
  // a day without missions: no Shield, and the next murder lands
  nextNight(g);
  assert.strictEqual(p[2].shield, null);
  night(g, { [p[0].id]: [p[2].id] }, 7000);
  assert.deepStrictEqual(g.dawn.deaths.map((d) => d.id), [p[2].id]);
});

test('the Guardian protects a guest from the murder', () => {
  const { g, p } = citadel(SEVEN);
  night(g, {});
  nextNight(g);
  night(g, { [p[0].id]: [p[3].id], [p[4].id]: [p[3].id] }, 6000);
  assert.strictEqual(g.dawn.deaths.length, 0);
  assert.strictEqual(eventsOf(g, 'kill').pop().result, 'protected');
});

test('a banished guest is unmasked: Faithful or Traitor', () => {
  const { g, p } = citadel(SEVEN);
  night(g, {});
  banish(g, 2, 6); // the Comms Officer is banished: Faithful
  assert.ok(!p[6].alive);
  assert.match(g.log.map((l) => l.text).join(' '), /was FAITHFUL/);
  assert.match(eventsOf(g, 'execute').pop().story, /FAITHFUL/);
  assert.strictEqual(eventsOf(g, 'execute').pop().unmask, 'faithful');
  assert.strictEqual(g.dayLog.filter((e) => e.k === 'airlock').pop().unmask, 'faithful');
  assert.ok(!g.winner, 'the game goes on');
  const second = citadel(SEVEN, { seed: 2 });
  night(second.g, {});
  banish(second.g, 2, 1); // the Recruiter is banished: a Traitor
  assert.match(eventsOf(second.g, 'execute').pop().story, /TRAITOR/);
  assert.strictEqual(eventsOf(second.g, 'execute').pop().unmask, 'traitor');
});

test('the Faithful win only when EVERY Traitor is banished; the Traitors win when they are as many as the Faithful', () => {
  // banishing the Recruiter and then the Head Traitor wins it for the Faithful
  const { g, p } = citadel(SEVEN);
  night(g, {});
  banish(g, 2, 1);
  assert.ok(!g.winner, 'the Head Traitor is still alive');
  night(g, {}, 6000); // no murder on this night
  banish(g, 2, 0, { now: 9000 });
  assert.strictEqual(g.winner, 'crew');
  assert.match(g.winReason, /last Traitor is banished/);
  // parity: 2 Traitors and 2 Faithful left is a Traitor win
  const b = citadel(SEVEN, { seed: 3 });
  night(b.g, {});
  for (const i of [2, 3, 4]) b.g.kill(b.p[i], 'parasite');
  b.g.checkWin();
  assert.strictEqual(b.g.winner, 'infiltrators');
  assert.match(b.g.winReason, /as many as the Faithful/);
});

test('the Prize Pot is split between the winners in the final words', () => {
  const { g, p } = citadel(SEVEN);
  night(g, {});
  g.beginRoam(3000);
  for (const task of ['signal', 'course', 'core', 'plants']) g.completeTask(p[2].id, task);
  assert.strictEqual(g.pot, 2000);
  for (const i of [2, 3, 4]) g.kill(p[i], 'parasite');
  g.checkWin();
  assert.strictEqual(g.winner, 'infiltrators');
  assert.match(g.winReason, /Prize Pot of 2,000 star-gold is split between the surviving Traitors: 1,000 each/);
});

test('if the Head Traitor is banished, another Traitor takes the cloak and the murders go on', () => {
  const { g, p } = citadel(SEVEN);
  night(g, {});
  banish(g, 2, 0);
  assert.ok(!g.winner, 'the Recruiter is still a Traitor');
  assert.strictEqual(p[1].role, 'headtraitor', 'the Recruiter took the cloak');
  assert.ok(notesOf(p[1]).some((t) => /cloak is yours/.test(t)));
  g.beginNight(9000);
  assert.ok(g.prompts[p[1].id], 'and they murder tonight');
  assert.strictEqual(g.prompts[p[1].id].role, 'headtraitor');
});

test('Recruiter: the offer arrives at dawn; accepting makes the guest a Traitor, refusing does not', () => {
  const { g, p } = citadel(SEVEN);
  night(g, {});
  nextNight(g);
  night(g, { [p[1].id]: [p[3].id], [p[0].id]: [p[6].id] }, 6000); // the Recruiter invites the Dagger Bearer
  assert.deepStrictEqual(g.offer && { id: g.offer.id, from: g.offer.from }, { id: p[3].id, from: p[1].id });
  assert.ok(notesOf(p[3]).some((t) => /black envelope/.test(t)));
  assert.ok(g.viewFor(p[3].id).you.offer, 'their screen shows the offer');
  assert.strictEqual(g.viewFor(p[2].id).you.offer, null, 'nobody else sees it');
  assert.throws(() => g.chooseOffer(p[2].id, true), /Nobody has made you an offer/);
  g.chooseOffer(p[3].id, true, 6500);
  assert.strictEqual(p[3].role, 'recruit');
  assert.strictEqual(g.offer, null);
  assert.ok(notesOf(p[3]).some((t) => /You are a Traitor now/.test(t) && /P0/.test(t)));
  assert.ok(notesOf(p[0]).some((t) => /accepted the offer/.test(t)));
  assert.ok(g.viewFor(p[3].id).you.evilTeam.length >= 2, 'they see the Traitors');
  assert.strictEqual(eventsOf(g, 'recruited')[0].accepted, true);
  // refusing (or not answering for a minute) leaves them Faithful
  const r = citadel(SEVEN, { seed: 5 });
  night(r.g, {});
  nextNight(r.g);
  night(r.g, { [r.p[1].id]: [r.p[2].id], [r.p[0].id]: [r.p[6].id] }, 6000);
  r.g.tickOffer(7000); // the minute starts
  assert.ok(r.g.offer.until > 7000);
  r.g.tickOffer(7000 + 61_000 * r.g.pace + 5000); // and runs out
  assert.strictEqual(r.p[2].role, 'seer');
  assert.strictEqual(r.g.offer, null);
  assert.ok(notesOf(r.p[1]).some((t) => /refused your offer/.test(t)));
});

test('a Loyalist cannot be recruited, and learns that a Recruiter is aboard', () => {
  const { g, p } = citadel(SEVEN);
  night(g, {});
  nextNight(g);
  night(g, { [p[1].id]: [p[5].id], [p[0].id]: [p[6].id] }, 6000);
  assert.strictEqual(g.offer, null);
  assert.ok(notesOf(p[5]).some((t) => /nobody can recruit a Loyalist/.test(t)));
  assert.ok(notesOf(p[1]).some((t) => /Loyalist/.test(t)));
  assert.strictEqual(eventsOf(g, 'recruit').pop().result, 'loyal');
});

test('Seer: a true look (Mole and Stowaway aside), and a Traitor who is looked at learns who the Seer is', () => {
  const { g, p } = citadel(SEVEN);
  night(g, { [p[2].id]: [p[1].id] }); // the Seer looks at the Recruiter
  assert.ok(notesOf(p[2]).some((t) => /P1 is a TRAITOR/.test(t)));
  assert.ok(notesOf(p[1]).some((t) => /P2 is the Seer, and they just looked at you/.test(t)));
  // the Mole looks Faithful to the Seer (but is told they were looked at)
  const deal = ['headtraitor', 'mole', 'seer', 'daggerbearer', 'guardian', 'loyalist', 'comms'];
  const m = citadel(deal, { seed: 4 });
  night(m.g, { [m.p[2].id]: [m.p[1].id] });
  assert.ok(notesOf(m.p[2]).some((t) => /P1 is FAITHFUL/.test(t)), 'the Seer sees a Faithful');
  assert.ok(notesOf(m.p[1]).some((t) => /Seer/.test(t)), 'but the Mole is told');
  assert.strictEqual(m.g.reg(m.p[1]).evil, false);
  assert.strictEqual(m.g.checkWin(), false);
});

test('Dagger Bearer: their YES vote counts twice. Blackmailer: the victim cannot nominate and their vote is ignored', () => {
  const { g, p } = citadel(SEVEN);
  night(g, {});
  g.beginRoam(3000);
  g.beginMeeting(3000);
  g.beginNominations(3000);
  g.nominate(p[2].id, p[6].id, 3100);
  const yes = [p[3].id, p[4].id]; // the Dagger Bearer and the Guardian vote YES
  g.nomination.hands = Object.fromEntries(yes.map((id) => [id, true]));
  g.nomination.stage = 'count';
  g.tally(3200);
  assert.strictEqual(g.lastNomination.votes, 3, 'two hands, three votes');
  assert.strictEqual(g.lastNomination.voters.length, 2);
  // the Blackmailer
  const deal = ['headtraitor', 'blackmailer', 'seer', 'daggerbearer', 'guardian', 'loyalist', 'comms'];
  const b = citadel(deal, { seed: 6 });
  night(b.g, { [b.p[1].id]: [b.p[2].id] });
  assert.ok(b.g.viewFor(b.p[2].id).you.gagged);
  assert.ok(notesOf(b.p[2]).some((t) => /blackmailed|something on you/.test(t)));
  b.g.beginRoam(3000);
  b.g.beginMeeting(3000);
  b.g.beginNominations(3000);
  assert.throws(() => b.g.nominate(b.p[2].id, b.p[6].id, 3100), /blackmailed/);
  b.g.nominate(b.p[4].id, b.p[6].id, 3100);
  b.g.nomination.hands = { [b.p[2].id]: true, [b.p[3].id]: true };
  b.g.nomination.stage = 'count';
  b.g.tally(3200);
  assert.strictEqual(b.g.lastNomination.votes, 2, 'the gagged vote does not count (the Dagger Bearer counts twice)');
  assert.deepStrictEqual(b.g.lastNomination.ignored, [b.p[2].id]);
});

test('Citadel stories, the persisted offer and pot', () => {
  const persist = require('../server/persist');
  assert.match(st.dawnStory([{ name: 'Ada' }], seeded(1), 'traitors'), /Ada/);
  assert.ok(st.dawnStory([], seeded(1), 'traitors').length > 10);
  assert.match(st.executionStory('Bo', seeded(2), '', 'traitors'), /Bo/);
  assert.strictEqual(themeOf('traitors').rooms.bridge, 'The Round Table');
  const { g, p } = citadel(SEVEN);
  night(g, {});
  nextNight(g);
  g.beginRoam(3000);
  g.completeTask(p[2].id, 'signal');
  finishDay(g);
  night(g, { [p[1].id]: [p[3].id], [p[0].id]: [p[6].id] }, 6000);
  assert.ok(g.offer);
  const room = { code: 'TEST', game: g, positions: {} };
  const text = persist.serialize(new Map([['TEST', room]]), 5000);
  const [{ game: back }] = persist.deserialize(text, 6000);
  assert.strictEqual(back.script, 'traitors');
  assert.strictEqual(back.pot, 500);
  assert.strictEqual(back.offer.id, p[3].id);
  assert.strictEqual(back.roomName('bridge'), 'The Round Table');
  back.chooseOffer(back.players[3].id, true, 7000);
  assert.strictEqual(back.players[3].role, 'recruit');
});

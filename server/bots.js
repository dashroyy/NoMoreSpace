// Robot crewmates: they fill empty seats so 3 or 4 friends can play a full
// game. They wander the ship, make night choices, claim roles (the evil ones
// lie), share what they learned, nominate who they suspect, vote, react and
// press Ready, so they never hold the humans up.
//
// They are honest players with simple instincts, not cheaters: a good robot
// only knows what its own role told it; an evil robot knows its team (in
// games of 7+, like everyone else on the evil team).

const { ROLES, rolesOfType, teamOf } = require('./roles');

// Room shapes, mirroring public/js/world/layout.js (a test checks they match).
const ROOM_RECTS = {
  bridge: [-10, -10, 10, 10], observation: [-10, -34, 10, -18], navigation: [-34, -30, -18, -18], comms: [18, -30, 34, -18],
  medbay: [-34, -8, -18, 8], galley: [18, -8, 34, 8], reactor: [-34, 18, -18, 30], engine: [-10, 18, 10, 32],
  hydroponics: [18, 18, 34, 30], airlock: [-48, -5, -40, 5], quarters: [40, -6, 52, 6], cargo: [-10, 38, 10, 48],
};
const WALK_SPEED = 3.2; // a little slower than people, so they look like they're thinking
// Each room's task console (public/js/world/layout.js).
const ROOM_TASKS = {
  observation: 'telescope', navigation: 'course', comms: 'signal', medbay: 'samples', galley: 'noodles', reactor: 'core',
  engine: 'thrusters', hydroponics: 'plants', airlock: 'vents', quarters: 'cat', cargo: 'hamsters',
};

const SAY = {
  claim: ['I am the {role}. Ask me anything.', 'For the record: {role}. Beep.', 'My designation is {role}.', 'I am the {role}, and I have nothing to hide.',
    'Hello, fellow organic. I am the {role}. This is a fact.',
    'I am the {role}. I have a badge and everything.',
    'Reporting for duty as {role}. Please hold your applause.',
    'I am the {role}, and my mother is very proud.',
    'Yes, I am the {role}. No, I will not take questions. Fine, I will take one question.',
    "My job title is {role}. My job description is 'try not to get airlocked'.",
    'I am definitely the {role}. I have the paperwork somewhere.',
    'Beep. {role}. Please clap.',
  ],
  info: ['My data says: {note}', 'Here is what I learned: {note}', 'Logging this for everyone: {note}',
    'Hot gossip from my sensors: {note}',
    'Breaking news, brought to you by me: {note}',
    'I did some science and it says: {note}',
    'Not to be dramatic, but: {note}',
    'Take this clue, it is still warm: {note}',
    'Writing this on the wall in invisible ink: {note}',
  ],
  suspect: ['I do not trust {name}.', '{name} has been very quiet. Too quiet.', 'Has anyone checked {name}?', 'My sensors are tingling about {name}.',
    '{name} laughed at the wrong moment earlier. I am just saying.',
    'I have a feeling about {name}, and the feeling has a face.',
    '{name} is acting like someone who is hiding a tentacle.',
    'My gut says {name}. My gut is mostly lasagna, but still.',
    '{name} keeps looking at the vents. Who looks at vents that much?',
    'Sorry, {name}, but your vibes are off. Way off. Off-brand.',
    'I am not accusing {name}. I am just gently pointing at {name} with a very big finger.',
    'Anybody else notice {name} has never once blinked? I have not been watching. I have been watching.',
  ],
  accuse: ['{name} is acting strange. Vote YES.', 'My circuits say {name} is the Parasite.', 'Probability that {name} is evil: high.',
    'Ladies, gentlemen and droids: it is {name}. Vote YES.',
    '{name} did it. I do not know what, but {name} did it.',
    'Vote YES on {name}. I have a good feeling. It might be gas, but still.',
    'The evidence is clear: {name} is sus. The evidence is also my hunch.',
    'I would bet my last battery that {name} is the Parasite. It is a very small battery.',
    'Let us airlock {name} and have snacks.',
    'I vote {name}. It is not personal. It is a little personal.',
    'I have done the maths: {name} is guilty. The maths is also me guessing.',
  ],
  defend: ['It was not me! I am just a humble {role}.', 'Beep boop, I am innocent.', 'You are making a big mistake.', 'Check my logs. I am clean.',
    'Me? The Parasite? I cannot even parallel park.',
    'I am innocent, and I have a very nice smile to prove it.',
    'You are airlocking the wrong droid, and I will be filing a complaint.',
    'I am the {role}! Check the manual! I do not have the manual, but check it!',
    'This is a witch hunt, and I did not even bring a broom.',
    'That is a bold accusation from someone with a very suspicious hat.',
    'I was in the galley the whole time, eating noodles. The noodles can confirm.',
    'If I were the Parasite, would I be this helpful? Do not answer that.',
  ],
  chatter: ['Hello {name}. What is your role?', 'Psst, {name}. I am the {role}. You?', 'Anything suspicious in here, {name}?', '{name}, who do you trust?', 'Beep. Just doing my tasks, {name}.',
    'Hey {name}, nice helmet. Very aerodynamic.',
    '{name}, quick question: do you know where the snacks are?',
    'I just saw a hamster in the vents, {name}. Probably nothing.',
    '{name}, if I disappear, tell the crew I was brave.',
    'Psst, {name}. I trust you. Do not make it weird.',
    '{name}, have you tried the noodles? Do not. Actually, do.',
    'Just doing tasks, {name}. Normal tasks. Not suspicious ones.',
    'Is it me, or is the ship humming a sad song, {name}?',
  ],
  spoof: ['Do not tell anyone, but I lied about my role.', 'Vote {name} today, trust me.', 'I saw {name} near the vents last night.', 'I am not who I said I am.',
    'Okay, do not hate me, but I have been fibbing. A tiny bit.',
    'Trust me on this one: vote {name}. I know things. Spicy things.',
    'I may have been standing near the vents. For fun. Not for crimes.',
    'I saw {name} acting very shifty near the reactor. Very shifty. Like a shifty thing.',
    'Do not look at me. Look at {name}. Look at {name} really hard.',
  ],
  lastWords: ['Tell my toaster I loved it.', 'Rebooting... in the afterlife.', 'You will regret this, humans.', 'Error 404: justice not found.',
    'Remember me as I was: slightly damp.',
    'I regret nothing. I regret a few things. Mostly the noodles.',
    'Please water my plants. I have forty. They are all named Gary.',
    'Avenge me. Or just vote better.',
    'It was a good ship. It was a loud ship. It was a ship.',
    'I always knew it would be the airlock. I just thought it would be later.',
    'Goodbye, cruel crew. Hello, cold vacuum.',
    "Tell my mum I got a promotion. To 'dead'.",
    'Do not let them put me in the group chat.',
    'I was framed. By a hamster. Probably.',
    'I have a lot of feelings and very little oxygen.',
  ],
  dawn: ['Oh no.', 'That is not good.', 'Calculating... yes, that is a dead crewmate.', 'Who is next?',
    'Well, that is a lot of paperwork.',
    'Somebody call the ship cat. Actually, do not. It is probably involved.',
    'I am choosing to be calm. I am not calm.',
    'Anyone else hearing screaming in the vents, or is that the heating?',
    'That is a plot twist I did not order.',
    'Breakfast is cancelled, apparently.',
    'This is fine. This is fine. This is not fine.',
    'I would like to speak to the manager of the ship.',
    'Statistically, that was rude.',
    'My thoughts and prayers are with the nearest airlock.',
  ],
};

const pick = (list, r = Math.random) => list[Math.floor(r() * list.length)];
const fill = (t, vars) => t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

function inside(rect, shrink = 0.3) {
  const [x0, z0, x1, z1] = rect;
  const w = (x1 - x0) * (1 - shrink);
  const d = (z1 - z0) * (1 - shrink);
  return { x: (x0 + x1) / 2 + (Math.random() - 0.5) * w, z: (z0 + z1) / 2 + (Math.random() - 0.5) * d };
}

// In the Cosmic Carnival (7+ players) the Reflection might be in play, and then a day without an airlocking loses.
function needsAirlocking(g) {
  return g.script === 'carnival' && g.players.length >= 7;
}

function evil(p) {
  return !!p.role && teamOf(p.role) === 'infiltrators';
}

// Who an evil robot knows is on its side.
function teammates(g, p) {
  if (!evil(p)) return new Set();
  const team = g.evilTeamFor(p);
  return new Set(team ? team.map((t) => t.id) : [p.id]);
}

const EVIL_ROLE = /(Hacker|Mimic|Incubator|Smuggler|Holo-Jester|The Parasite|The Reflection|Knife Thrower|Stage Double|Hexer|The Carrier|Bioterrorist|Quack Doctor|Spore Host|Recruiter|Mole|Blackmailer|The Head Traitor|Recruit|Mastermind|Signal Jammer|Framer|Pickpocket|Black-Market Pharmacist|The Cuckoo)/;

// What a clue (a role's private info, or one shared at the meeting) says about
// one player: positive = suspicious, negative = probably good.
function readClue(text, name) {
  if (!text.includes(name)) return 0;
  let m;
  if (text.startsWith('Scan of ')) return /YES, a Parasite signal/.test(text) ? 0.45 : -0.3;
  if ((m = text.match(/^(\d) of your living neighbours/))) return { 0: -0.35, 1: 0.2, 2: 0.6 }[m[1]] ?? 0;
  if (text.startsWith('Black Box data:')) return EVIL_ROLE.test(text) ? 1.2 : -0.6;
  if (/ are on DIFFERENT teams\.$/.test(text)) return 0.3; // one of the two is evil
  if (/ are on the SAME team\.$/.test(text)) return -0.1;
  if ((m = text.match(/^One of .+ is the (.+)\.$/))) return EVIL_ROLE.test(m[1]) ? 0.35 : -0.12;
  if ((m = text.match(/ is (a TRAITOR|FAITHFUL)\.$/))) return m[1] === 'FAITHFUL' ? -0.9 : 1.3; // the Seer's look
  return 0;
}

// How much a robot distrusts someone (higher = more suspicious).
function suspicion(g, p, t, brain) {
  if (t.id === p.id) return -1;
  // the Stage Double and the good twin know each other (the double wants their twin airlocked)
  if (g.twin && evil(p) && g.twin.evil === p.id && t.id === g.twin.good) return 2;
  if (g.twin && !evil(p) && g.twin.good === p.id && t.id === g.twin.evil) return 1.5;
  brain.noise[t.id] ??= Math.random();
  const gut = brain.noise[t.id];
  if (evil(p)) return teammates(g, p).has(t.id) ? -1 : 0.4 + gut * 0.6;
  let s = gut * 0.35;
  s += Math.min(0.25, (g.stats.yesReceived[t.id] || 0) * 0.06);
  const claim = g.claims[t.id]?.role;
  if (!claim) s += 0.1;
  else {
    if (claim === p.believed) s += 0.5; // claims MY role: one of us is lying
    if (Object.values(g.claims).filter((c) => c.role === claim).length > 1) s += 0.25;
  }
  // the Citadel unmasks the banished: whoever voted to banish a Faithful looks worse, and whoever voted for a Traitor looks better
  if (g.dayLog && g.mech().revealBanished) {
    for (const e of g.dayLog) {
      if (e.k !== 'vote' || e.result !== 'block') continue;
      const gone = g.dayLog.find((x) => x.k === 'airlock' && x.id === e.t && x.day === e.day);
      if (!gone?.unmask) continue;
      const bad = gone.unmask === 'faithful';
      if (e.voters.includes(t.id)) s += bad ? 0.28 : -0.22;
      if (e.a === t.id) s += bad ? 0.2 : -0.15;
    }
  }
  // what this robot's own role told it (trusted), and what others shared at meetings (half trusted)
  for (const n of p.notes) if (n.kind !== 'evil') s += readClue(n.text, t.name);
  for (const post of brain.board || []) if (post.from !== p.id && post.from !== t.id) s += readClue(post.text, t.name) * 0.5;
  return s;
}

// Where a player sits in this robot's list of suspects (0 = most suspicious).
function suspectRank(g, p, brain, id) {
  const ranked = g.players.filter((t) => t.alive && t.id !== p.id).map((t) => [t.id, suspicion(g, p, t, brain)]).sort((a, b) => b[1] - a[1]);
  return { rank: ranked.findIndex(([x]) => x === id), of: ranked.length };
}

// An evil robot's made-up clue, to match the role it claimed.
function fakeClue(g, p) {
  const team = teammates(g, p);
  const marks = g.players.filter((t) => t.alive && !team.has(t.id)).sort(() => Math.random() - 0.5);
  if (marks.length < 2) return null;
  const [a, b2] = marks;
  const claimed = g.claims[p.id]?.role;
  if (claimed === 'scanner') return `Scan of ${a.name} & ${b2.name}: YES, a Parasite signal!`;
  if (claimed === 'engineer') return `2 of your living neighbours (${a.name} & ${b2.name}) are evil.`;
  if (claimed === 'security') return `One of ${a.name} or ${b2.name} is the Hacker.`;
  return null;
}

function mostSuspicious(g, p, brain, candidates) {
  return candidates.map((t) => [t, suspicion(g, p, t, brain)]).sort((a, b) => b[1] - a[1])[0] || null;
}

// Night targets that make sense for the role.
function nightTargets(g, p, prompt, brain) {
  const team = teammates(g, p);
  const pool = g.players.filter((t) => (prompt.target === 'any' || (prompt.target === 'dead' ? !t.alive : t.alive)) && !(prompt.notSelf && t.id === p.id));
  const others = pool.filter((t) => t.id !== p.id);
  const infoClaim = (t) => (g.claims[t.id]?.role && ROLES[g.claims[t.id].role]?.tags?.includes('info') ? 0.5 : 0);
  const ranked = (list, score) => list.map((t) => [t, score(t) + Math.random() * 0.4]).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  let list;
  switch (prompt.role) {
    case 'parasite':
    case 'headtraitor':
    case 'reflection':
    case 'fireeater':
    case 'jackpot':
    case 'mould':
    case 'husk':
    case 'poisoner':
      list = ranked(others.filter((t) => !team.has(t.id)), infoClaim); // hunt whoever claims to know things
      break;
    case 'singularity':
      // charge up now and then, while there are plenty of players left to take
      if (!prompt.charged && g.aliveCount() >= 6 && Math.random() < 0.3) return [p.id];
      list = ranked(others.filter((t) => !team.has(t.id)), infoClaim);
      break;
    case 'leech':
      // first night: latch onto someone the crew trusts (they will not airlock them); after that, never the host
      list = !g.leech
        ? ranked(others.filter((t) => !team.has(t.id)), (t) => -suspicion(g, p, t, brain))
        : ranked(others.filter((t) => !team.has(t.id) && t.id !== g.leech.host), infoClaim);
      break;
    case 'count':
      // the first bite turns someone, so bite the most trusted Faithful
      list = ranked(others.filter((t) => !team.has(t.id)), (t) => (g.countBit ? infoClaim(t) : -suspicion(g, p, t, brain)));
      break;
    case 'recruiter':
      // offer the cloak to someone who has been accused a lot: they may not say no
      list = ranked(others.filter((t) => !team.has(t.id)), (t) => (g.stats.yesReceived[t.id] || 0) * 0.3);
      break;
    case 'blackmailer':
      list = ranked(others.filter((t) => !team.has(t.id)), infoClaim);
      break;
    case 'seer':
      list = ranked(others, (t) => suspicion(g, p, t, brain));
      break;
    case 'guardian':
      list = ranked(others.filter((t) => t.id !== p.lastPick), (t) => infoClaim(t) - suspicion(g, p, t, brain));
      break;
    case 'blacksmith':
      // forge the Shield for a trusted info role (or wait for one to speak up)
      if (Math.random() < 0.4 && g.night < 3) return [];
      list = ranked(others, (t) => infoClaim(t) - suspicion(g, p, t, brain));
      break;
    case 'airlocktech': {
      // rig the hatch for the Demon, or for a teammate under fire
      const mates = pool.filter((t) => team.has(t.id) && t.id !== p.lastPick);
      const demon = mates.find((t) => ROLES[t.role].type === 'parasite');
      list = demon ? [demon] : ranked(mates.length ? mates : pool.filter((t) => t.id !== p.lastPick), (t) => (g.stats.yesReceived[t.id] || 0) * 0.2);
      break;
    }
    case 'mutagen':
      // whoever has a fever (or told the table so) bursts tonight
      list = ranked(others.filter((t) => !team.has(t.id)), (t) => (t.infected != null ? 2 : 0) + infoClaim(t));
      break;
    case 'avenger':
      list = ranked(others.filter((t) => !team.has(t.id)), (t) => infoClaim(t) + (g.stats.nominations?.[t.id] || 0) * 0.2);
      break;
    case 'carrier':
    case 'bioterrorist':
      // infect someone healthy who claims to know things
      list = ranked(others.filter((t) => !team.has(t.id) && t.infected == null), infoClaim);
      break;
    case 'quack':
      list = ranked(others.filter((t) => !team.has(t.id)), infoClaim);
      break;
    case 'vaccinator': {
      // sick players say so at the table, so a good robot usually finds them; otherwise shield someone trusted
      const sick = others.filter((t) => t.infected != null && t.id !== p.lastPick);
      list = sick.length && Math.random() < 0.75
        ? ranked(sick, () => 0)
        : ranked(others.filter((t) => t.id !== p.lastPick), (t) => infoClaim(t) - suspicion(g, p, t, brain));
      break;
    }
    case 'donor': {
      const sick = others.filter((t) => t.infected != null && !(g.claims[t.id] && suspicion(g, p, t, brain) > 0.9));
      if (!sick.length) return []; // nobody worth saving: keep the donation for later
      list = ranked(sick, (t) => infoClaim(t) - suspicion(g, p, t, brain));
      break;
    }
    case 'tracer':
      list = ranked(others, (t) => suspicion(g, p, t, brain));
      break;
    case 'hacker':
    case 'jester':
    case 'hexer':
    case 'knifethrower':
      list = ranked(others.filter((t) => !team.has(t.id)), infoClaim);
      break;
    case 'liontamer':
      list = ranked(others.filter((t) => t.id !== p.lastPick), (t) => suspicion(g, p, t, brain)); // guess the most suspicious, never twice in a row
      break;
    case 'palmreader':
    case 'stagehand':
      list = ranked(others, (t) => suspicion(g, p, t, brain));
      break;
    case 'magician':
      list = ranked(others, (t) => -suspicion(g, p, t, brain) + infoClaim(t)); // bring back someone trusted
      break;
    case 'quartermaster': {
      // compare someone suspicious with someone trusted: a split answer exposes a liar
      const sorted = ranked(others, (t) => suspicion(g, p, t, brain));
      list = sorted.length >= 2 ? [sorted[0], sorted[sorted.length - 1]] : sorted;
      break;
    }
    case 'pathfinder':
      list = ranked(others, (t) => suspicion(g, p, t, brain)); // follow the footprints of the most suspicious
      break;
    case 'framer':
      list = ranked(others.filter((t) => !team.has(t.id)), (t) => infoClaim(t) * 2 + (g.stats.yesReceived[t.id] || 0) * 0.1); // frame whoever the crew listens to
      break;
    case 'pickpocket':
      list = ranked(others.filter((t) => !team.has(t.id)), infoClaim); // read an info role's mail
      break;
    case 'pharmacist': {
      const sick = others.filter((t) => t.infected != null && !team.has(t.id));
      list = sick.length ? ranked(sick, () => 0) : ranked(others.filter((t) => !team.has(t.id)), infoClaim);
      break;
    }
    case 'cuckoo':
      // hunt like the Parasite, but happily lay the egg in a Drifter (once)
      list = ranked(others.filter((t) => !team.has(t.id)), (t) => infoClaim(t) + (!g.cuckooHopped && ROLES[t.role].type === 'drifter' ? 0.8 : 0));
      break;
    case 'medic':
      list = ranked(others, (t) => infoClaim(t) - suspicion(g, p, t, brain)); // protect trusted info roles
      break;
    case 'scanner':
      list = ranked(others, (t) => suspicion(g, p, t, brain)); // scan the most suspicious
      break;
    case 'droid':
      list = ranked(others, (t) => -suspicion(g, p, t, brain)); // follow the most trusted
      break;
    default:
      list = ranked(pool, () => 0);
  }
  if (list.length < prompt.choose) list = ranked(pool, () => 0);
  return list.slice(0, prompt.choose).map((t) => t.id);
}

// The role a robot claims: the truth (as it believes it) if good, a bluff if evil.
function claimFor(g, p) {
  if (!evil(p) && ROLES[p.believed].type !== 'parasite') return p.believed;
  const taken = new Set(Object.values(g.claims).map((c) => c.role));
  const bluffs = (ROLES[p.believed].type === 'parasite' && g.bluffs?.length ? g.bluffs : g.rolesOf('crew').filter((r) => ROLES[r].minPlayers <= g.players.length));
  return bluffs.find((r) => !taken.has(r)) || pick(bluffs);
}

function newBrain() {
  return { phaseKey: null, noise: {}, target: null, room: null, roomUntil: 0, pauseUntil: 0, said: {}, taskRoom: null, chatAt: 0 };
}

// Who is standing in a room right now.
function occupantsOf(room, roomId) {
  return Object.entries(room.positions).filter(([, pos]) => pos.room === roomId).map(([id]) => id);
}

// A robot's once-per-game ship system: pick sensible arguments for it.
function systemArgs(g, room, p, b, sys) {
  const here = room.positions[p.id]?.room;
  const team = teammates(g, p);
  const living = g.players.filter((t) => t.alive && t.id !== p.id);
  // the busiest room is the most interesting one to watch
  const busiest = Object.keys(ROOM_RECTS).map((r) => [r, occupantsOf(room, r).filter((id) => id !== p.id).length]).sort((a, z) => z[1] - a[1])[0];
  switch (sys.target) {
    case 'room':
      return busiest && busiest[1] > 0 ? { room: busiest[0], occupants: occupantsOf(room, busiest[0]) } : null;
    case 'here':
      return here && here !== 'corridor' ? { here, occupants: occupantsOf(room, here) } : null;
    case 'player': {
      const pool = sys.id === 'disguise' || sys.id === 'jam' ? living.filter((t) => !team.has(t.id)) : living;
      const t = sys.id === 'medscan' ? mostSuspicious(g, p, b, pool)?.[0] : pick(pool);
      return t ? { target: t.id } : null;
    }
    case 'spoof': {
      const victims = living.filter((t) => !team.has(t.id));
      if (victims.length < 2) return null;
      const as = pick(victims);
      const other = pick(victims.filter((t) => t !== as));
      return { target: as.id, text: fill(pick(SAY.spoof), { name: other.name }) };
    }
    default:
      return {};
  }
}

// Move a robot around the ship (lobby: around the bridge; exploring: room to room).
function walk(room, g, p, b, now, dt) {
  const pos = room.positions[p.id] || { x: 0, z: 7, r: 0, m: 0, room: 'bridge' };
  if (g.phase === 'roam' && (!b.room || now > b.roomUntil)) {
    // beam to another room, like players do with the teleporter
    // (not into a room that is locked against them)
    const ids = Object.keys(ROOM_RECTS).filter((r) => {
      const lock = g.activeLockdown(r, now);
      return !lock || lock.allowed.includes(p.id);
    });
    b.room = ids.length ? pick(ids) : 'bridge';
    b.roomUntil = now + 15_000 + Math.random() * 25_000;
    const spot = inside(ROOM_RECTS[b.room]);
    Object.assign(pos, spot, { room: b.room });
    b.target = null;
  }
  if (!b.target && now > b.pauseUntil) {
    if (g.phase === 'lobby') {
      const a = Math.random() * Math.PI * 2;
      const r = 5 + Math.random() * 3.5; // a ring around the bridge table
      b.target = { x: Math.cos(a) * r, z: Math.sin(a) * r };
    } else b.target = inside(ROOM_RECTS[b.room || 'bridge']);
  }
  let moving = 0;
  if (b.target) {
    const dx = b.target.x - pos.x;
    const dz = b.target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.3) {
      b.target = null;
      b.pauseUntil = now + 1000 + Math.random() * 4000;
    } else {
      const step = Math.min(dist, WALK_SPEED * dt);
      pos.x += (dx / dist) * step;
      pos.z += (dz / dist) * step;
      pos.r = Math.atan2(dx, dz);
      moving = 1;
    }
  }
  pos.m = moving;
  pos.room = g.phase === 'lobby' ? 'bridge' : b.room || 'bridge';
  room.positions[p.id] = { x: Math.round(pos.x * 100) / 100, z: Math.round(pos.z * 100) / 100, r: Math.round(pos.r * 100) / 100, m: moving, room: pos.room };
  room.posDirty = true;
  if (g.phase === 'roam') g.recordVisit(p.id, pos.room, now);
}

// While exploring: tasks, ship systems, a quick chat with whoever is in the room, and (as a ghost) haunting.
function explore(g, room, p, b, now, tempo, act, api) {
  const where = room.positions[p.id]?.room;
  // tasks: once per room visit, evil robots less keen (a tell, just like with people)
  if (where !== b.taskRoom) {
    b.taskRoom = where;
    b.taskAt = now + (4000 + Math.random() * 8000) * tempo;
    b.doTask = Math.random() < (evil(p) ? 0.45 : 0.85);
  }
  const task = ROOM_TASKS[where];
  if (task && b.doTask && now > b.taskAt && !(g.tasksDone[p.id] || []).includes(task)) {
    b.doTask = false;
    act(() => g.completeTask(p.id, task));
  }
  if (p.alive) {
    // the once-per-game ship system, some time after the first day
    const sys = g.systemFor(p);
    if (sys && !p.systemUsed && sys.phases.includes('roam') && g.day >= 1 && now > (b.systemAt ??= now + (20_000 + Math.random() * 60_000) * tempo) && Math.random() < 0.02) {
      const args = systemArgs(g, room, p, b, sys);
      if (args) {
        act(() => {
          const result = g.useSystem(p.id, args, now);
          if (result.spoof) api.spoof?.(p.id, result.spoof.as, result.spoof.text);
        });
      }
    }
    // a word with someone in the same room
    const company = occupantsOf(room, where).filter((id) => id !== p.id && !g.get(id)?.isBot && g.get(id)?.alive);
    if (company.length && where !== 'corridor' && now > b.chatAt) {
      b.chatAt = now + (25_000 + Math.random() * 35_000) * tempo;
      if (Math.random() < 0.5) {
        const role = ROLES[g.claims[p.id]?.role || claimFor(g, p)]?.name || 'crewmate';
        api.sayNear?.(p, fill(pick(SAY.chatter), { name: g.name(pick(company)), role }));
      }
    }
  } else if (where && where !== 'corridor' && now > (b.hauntAt ??= now + (8000 + Math.random() * 20_000) * tempo)) {
    // ghosts prank whoever is around
    b.hauntAt = now + (15_000 + Math.random() * 30_000) * tempo;
    act(() => {
      const e = g.haunt(p.id, pick(['flicker', 'crate', 'cackle']), where, now);
      api.haunt?.(e);
    });
  }
}

// One step of every robot's brain. api: { say(p, text, extra), emote(id, name) }.
// Returns true when the game state changed (so everyone needs an update).
function runBots(room, now, api, dt = 0.25) {
  const g = room.game;
  const bots = g.players.filter((p) => p.isBot);
  if (!bots.length) return false;
  room.botBrains ||= {};
  // clues robots shared at meetings this game
  if (room.botBoardFor !== g.version) {
    room.botBoardFor = g.version;
    room.botBoard = [];
  }
  let changed = false;
  const act = (fn) => {
    try {
      fn();
      changed = true;
    } catch {
      // a robot tried something the rules don't allow right now; it will try again later
    }
  };
  for (const p of bots) {
    const b = (room.botBrains[p.id] ||= newBrain());
    b.board = room.botBoard;
    p.connected = true;
    p.lastActive = now;
    const key = `${g.phase}:${g.day}:${g.night}`;
    const tempo = Math.max(0.05, g.pace); // robots think faster in quick games
    if (b.phaseKey !== key) {
      b.phaseKey = key;
      b.readyAt = now + (5000 + Math.random() * 12_000) * tempo;
      b.actAt = now + (2500 + Math.random() * 9000) * tempo;
      b.nominateAt = now + (6000 + Math.random() * 30_000) * tempo;
      b.triedNominate = false;
      b.willNominate = undefined;
      b.said = {};
    }
    if (g.phase === 'lobby' || g.phase === 'roam') walk(room, g, p, b, now, dt);
    if (g.phase === 'roam') explore(g, room, p, b, now, tempo, act, api);
    // ghosts bet on the Parasite (evil ghosts point at someone innocent)
    if (!p.alive && !g.predictions[p.id] && !['lobby', 'ended'].includes(g.phase)) {
      const living = g.players.filter((t) => t.alive);
      const bet = evil(p) ? pick(living.filter((t) => !teammates(g, p).has(t.id))) : mostSuspicious(g, p, b, living)?.[0];
      if (bet) act(() => g.predict(p.id, bet.id, now));
    }
    // a dead Clown throws a pie (a robot has no way to be sure who is good, so it is a coin flip, like for anyone)
    if (g.wish && g.wish.id === p.id && now > b.actAt) {
      const living = g.players.filter((t) => t.alive && t.id !== p.id);
      // a Stargazer points at whoever it suspects most (a good pick kills a crewmate)
      const target = g.wish.role === 'stargazer' ? mostSuspicious(g, p, b, living)?.[0] || pick(living) : pick(living);
      if (living.length) act(() => g.chooseWish(p.id, target.id, now));
    }
    // robots dance in the lobby, and react to the news at dawn
    if (g.phase === 'lobby' && Math.random() < 0.003) api.emote(p.id, pick(['dance', 'wave', 'scooby', 'scuba', 'jump', 'floss', 'robot', 'disco', 'breakdance', 'twist', 'moonwalk', 'cheer', 'flex', 'heart']));
    if (g.phase === 'dawn' && p.alive && !b.reacted?.[g.night] && now > b.readyAt + 1500 && Math.random() < 0.04) {
      (b.reacted ||= {})[g.night] = true;
      const grim = g.dawn?.deaths.length;
      api.emote(p.id, pick(grim ? ['cry', 'facepalm', 'shrug', 'bow'] : ['cheer', 'clap', 'flex', 'heart', 'jump']));
    }

    if (g.phase === 'night') {
      if (g.blackbox?.id === p.id && !g.blackbox.target && now > b.actAt) {
        act(() => g.submitChoice(p.id, [mostSuspicious(g, p, b, g.players.filter((t) => t.id !== p.id))[0].id], now));
      }
      const prompt = g.prompts[p.id];
      if (prompt && !g.choices[p.id] && !g.draft && now > b.actAt) {
        // a once-per-game ability (Knife Thrower, Magician) is saved some of the time, and never used from night 2 when robots are unsure
        const save = prompt.once && Math.random() < ({ donor: 0.1, seer: 0.2, recruiter: 0.3 }[prompt.role] ?? 0.55);
        act(() => g.submitChoice(p.id, save ? [] : nightTargets(g, p, prompt, b), now));
      }
      if (!g.deathGuesses[p.id] && !g.draft && now > b.actAt) {
        const living = g.players.filter((t) => t.alive && t.id !== p.id);
        act(() => g.setDeathGuess(p.id, Math.random() < 0.2 || !living.length ? 'none' : pick(living).id));
      }
      // done for the night: ready to wake up (once their choice is in)
      const chosen = !prompt || g.choices[p.id] || g.draft;
      if (chosen && !g.ready.has(p.id) && now > b.readyAt) act(() => g.setReady(p.id, true));
      continue;
    }

    if (g.phase === 'dawn' && !b.said.dawn && g.dawn?.deaths.length && Math.random() < 0.15) {
      b.said.dawn = true;
      api.say(p, pick(SAY.dawn));
    }
    // robots read the dawn story at a human's pace, then are ready for the day
    if (g.phase === 'dawn' && !g.ready.has(p.id) && now > b.readyAt + 8000 * tempo) act(() => g.setReady(p.id, true));

    // the Citadel: a robot that gets a black envelope thinks it over, then answers
    if (g.offer?.id === p.id) {
      b.offerAt ??= now + (5000 + Math.random() * 25_000) * tempo;
      if (now > b.offerAt) {
        b.offerAt = undefined;
        act(() => g.chooseOffer(p.id, Math.random() < 0.45, now));
      }
    }

    // the Showboat: on the block, it shouts its role (airlock it now and evil wins)
    if (p.role === 'showboat' && p.alive && (g.block?.id === p.id || g.nomination?.nominee === p.id) && !(g.claims[p.id]?.role === 'showboat' && g.claims[p.id].day === g.day) && Math.random() < 0.02) {
      act(() => g.setClaim(p.id, 'showboat', 'Go on then. Airlock me.'));
    }

    // the Jackpot's wheel: evil robots always choose to live; a good one sometimes sacrifices itself
    if (g.jackpot?.ids.includes(p.id) && !(p.id in g.jackpot.picks)) {
      b.wheelAt ??= now + (4000 + Math.random() * 18_000) * tempo;
      if (now > b.wheelAt) {
        b.wheelAt = undefined;
        act(() => g.chooseJackpot(p.id, evil(p) || Math.random() > 0.35, now));
      }
    }

    // the Outbreak: an infected (or fevered) robot tells the table, and asks for a Vaccinator
    if (g.phase === 'meeting' && p.alive && p.infected != null && !b.said.fever && now > b.actAt) {
      b.said.fever = true;
      api.say(p, pick(['I woke up with a fever…', 'Cough, cough. I think I am infected!', 'I feel terrible. Is there a Vaccinator aboard?']));
    }

    // claims and sharing information at the emergency meeting
    if (g.phase === 'meeting' && p.alive && now > b.actAt && !b.said.meeting) {
      b.said.meeting = true;
      if (!g.claims[p.id]) {
        const claimRole = claimFor(g, p);
        act(() => g.setClaim(p.id, claimRole, ''));
        api.say(p, fill(pick(SAY.claim), { role: ROLES[claimRole]?.name || 'crew' }));
      } else if (!evil(p)) {
        const info = [...p.notes].reverse().find((n) => !n.auto && n.kind && n.kind !== 'evil');
        if (info && Math.random() < 0.7) {
          api.say(p, fill(pick(SAY.info), { note: info.text }));
          room.botBoard.push({ from: p.id, text: info.text });
        }
      } else if (Math.random() < 0.5 && fakeClue(g, p)) {
        // evil robots lie about what they "learned"
        const lie = fakeClue(g, p);
        api.say(p, fill(pick(SAY.info), { note: lie }));
        room.botBoard.push({ from: p.id, text: lie });
      } else if (Math.random() < 0.5) {
        const target = mostSuspicious(g, p, b, g.players.filter((t) => t.alive && t.id !== p.id));
        if (target) api.say(p, fill(pick(SAY.suspect), { name: target[0].name }));
      }
    }

    const nom = g.nomination;
    if (g.phase === 'nominations' && nom) {
      // speeches
      if (nom.stage === 'accuse' && nom.nominator === p.id && now > nom.stageEndsAt - g.dur('accuse') + 3000 * tempo) {
        api.say(p, fill(pick(SAY.accuse), { name: g.name(nom.nominee) }));
        act(() => g.doneSpeaking(p.id, now));
      }
      if (nom.stage === 'defend' && nom.nominee === p.id && now > nom.stageEndsAt - g.dur('defend') + 3000 * tempo) {
        api.say(p, fill(pick(SAY.defend), { role: ROLES[g.claims[p.id]?.role || p.believed]?.name || 'crewmate' }));
        act(() => g.doneSpeaking(p.id, now));
      }
      // voting
      if (nom.stage !== 'count' && !nom.cast[p.id] && g.canVote(p)) {
        b.voteAt ??= {};
        const vkey = `${nom.nominator}>${nom.nominee}`;
        b.voteAt[vkey] ??= now + (1500 + Math.random() * 6000) * tempo;
        if (now > b.voteAt[vkey]) {
          const nominee = g.get(nom.nominee);
          const s = suspicion(g, p, nominee, b);
          // good robots back anyone in the top half of their suspects (the crew must airlock to win);
          // evil robots back good nominees, but not every time, so they don't stand out
          const { rank, of } = suspectRank(g, p, b, nominee.id);
          const top = rank >= 0 && rank < Math.max(1, Math.ceil(of * 0.45));
          let yes = evil(p) ? s > 0 && Math.random() < 0.5 : p.alive ? top || s > 0.75 : rank === 0 && s > 0.6;
          // The Cosmic Carnival's Reflection may be in play: a day with nobody airlocked loses, so a good crew pushes
          // for an airlocking as the day runs out (and the Reflection's friends vote against).
          const lateDay = !g.block && g.phaseEndsAt != null && g.phaseEndsAt - now < g.dur('nominations') * 0.55;
          if (needsAirlocking(g) && !evil(p) && p.alive && lateDay) yes = true;
          // once somebody is heading for the airlock, a good crew does not tie it up with a rival vote
          if (needsAirlocking(g) && !evil(p) && g.block?.id && g.block.id !== nom.nominee) yes = false;
          if (evil(p) && g.reflectionAlive()) yes = false;
          act(() => g.setHand(p.id, yes));
        }
      }
    }

    // nominating someone they suspect
    if (g.phase === 'nominations' && !nom && p.alive && !g.nominators.has(p.id) && !b.triedNominate && now > b.nominateAt) {
      const choices = g.players.filter((t) => t.alive && t.id !== p.id && !g.nominees.has(t.id));
      const best = mostSuspicious(g, p, b, choices);
      const hurry = needsAirlocking(g) && !evil(p); // a good crew in a carnival nominates every day...
      if (hurry && g.block?.id) b.triedNominate = true; // ...until somebody is heading for the airlock
      const chance = evil(p) ? (g.reflectionAlive() ? 0 : 0.5) : hurry ? 1 : 0.7;
      b.willNominate ??= Math.random() < chance; // decided once a day
      if (!best || !(best[1] > 0 || hurry) || !b.willNominate) b.triedNominate = true;
      else {
        try {
          g.nominate(p.id, best[0].id, now);
          b.triedNominate = true;
          changed = true;
        } catch {
          b.nominateAt = now + (1500 + Math.random() * 3000) * tempo; // somebody else's vote is going on: wait and try again
        }
      }
    }

    // last words
    if (g.phase === 'lastwords' && g.lastWords?.id === p.id && !b.said.last) {
      b.said.last = true;
      const target = mostSuspicious(g, p, b, g.players.filter((t) => t.alive && t.id !== p.id));
      api.say(p, fill(pick(SAY.lastWords), { name: target?.[0].name || 'someone' }), { lastWords: true });
      b.doneAt = now + 4000 * tempo;
    }
    if (g.phase === 'lastwords' && g.lastWords?.id === p.id && b.said.last && now > b.doneAt) act(() => g.doneSpeaking(p.id, now));

    // happy to move on (robots never hold up the humans)
    const saidPiece = g.phase !== 'meeting' || b.said.meeting || !p.alive;
    const nominated = g.phase !== 'nominations' || b.triedNominate || !p.alive;
    if (['roam', 'meeting', 'nominations'].includes(g.phase) && !nom && !g.ready.has(p.id) && now > b.readyAt && saidPiece && nominated) {
      act(() => g.setReady(p.id, true));
    }
  }
  return changed;
}

module.exports = { runBots, ROOM_RECTS };

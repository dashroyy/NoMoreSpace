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
  claim: ['I am the {role}. Ask me anything.', 'For the record: {role}. Beep.', 'My designation is {role}.', 'I am the {role}, and I have nothing to hide.'],
  info: ['My data says: {note}', 'Here is what I learned: {note}', 'Logging this for everyone: {note}'],
  suspect: ['I do not trust {name}.', '{name} has been very quiet. Too quiet.', 'Has anyone checked {name}?', 'My sensors are tingling about {name}.'],
  accuse: ['{name} is acting strange. Vote YES.', 'My circuits say {name} is the Parasite.', 'Probability that {name} is evil: high.'],
  defend: ['It was not me! I am just a humble {role}.', 'Beep boop, I am innocent.', 'You are making a big mistake.', 'Check my logs. I am clean.'],
  chatter: ['Hello {name}. What is your role?', 'Psst, {name}. I am the {role}. You?', 'Anything suspicious in here, {name}?', '{name}, who do you trust?', 'Beep. Just doing my tasks, {name}.'],
  spoof: ['Do not tell anyone, but I lied about my role.', 'Vote {name} today, trust me.', 'I saw {name} near the vents last night.', 'I am not who I said I am.'],
  lastWords: ['Tell my toaster I loved it.', 'Rebooting... in the afterlife.', 'You will regret this, humans.', 'Error 404: justice not found.'],
  dawn: ['Oh no.', 'That is not good.', 'Calculating... yes, that is a dead crewmate.', 'Who is next?'],
};

const pick = (list, r = Math.random) => list[Math.floor(r() * list.length)];
const fill = (t, vars) => t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

function inside(rect, shrink = 0.3) {
  const [x0, z0, x1, z1] = rect;
  const w = (x1 - x0) * (1 - shrink);
  const d = (z1 - z0) * (1 - shrink);
  return { x: (x0 + x1) / 2 + (Math.random() - 0.5) * w, z: (z0 + z1) / 2 + (Math.random() - 0.5) * d };
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

const EVIL_ROLE = /(Hacker|Mimic|Incubator|Smuggler|Holo-Jester|The Parasite)/;

// What a clue (a role's private info, or one shared at the meeting) says about
// one player: positive = suspicious, negative = probably good.
function readClue(text, name) {
  if (!text.includes(name)) return 0;
  let m;
  if (text.startsWith('Scan of ')) return /YES, a Parasite signal/.test(text) ? 0.45 : -0.3;
  if ((m = text.match(/^(\d) of your living neighbours/))) return { 0: -0.35, 1: 0.2, 2: 0.6 }[m[1]] ?? 0;
  if (text.startsWith('Black Box data:')) return EVIL_ROLE.test(text) ? 1.2 : -0.6;
  if ((m = text.match(/^One of .+ is the (.+)\.$/))) return EVIL_ROLE.test(m[1]) ? 0.35 : -0.12;
  return 0;
}

// How much a robot distrusts someone (higher = more suspicious).
function suspicion(g, p, t, brain) {
  if (t.id === p.id) return -1;
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
  const pool = g.players.filter((t) => (prompt.target === 'any' || t.alive) && !(prompt.notSelf && t.id === p.id));
  const others = pool.filter((t) => t.id !== p.id);
  const infoClaim = (t) => (g.claims[t.id]?.role && ROLES[g.claims[t.id].role]?.tags?.includes('info') ? 0.5 : 0);
  const ranked = (list, score) => list.map((t) => [t, score(t) + Math.random() * 0.4]).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  let list;
  switch (prompt.role) {
    case 'parasite':
      list = ranked(others.filter((t) => !team.has(t.id)), infoClaim); // hunt whoever claims to know things
      break;
    case 'hacker':
    case 'jester':
      list = ranked(others.filter((t) => !team.has(t.id)), infoClaim);
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
  if (!evil(p)) return p.believed;
  const taken = new Set(Object.values(g.claims).map((c) => c.role));
  const bluffs = (p.role === 'parasite' && g.bluffs?.length ? g.bluffs : rolesOfType('crew').filter((r) => ROLES[r].minPlayers <= g.players.length));
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
      const pool = sys.id === 'disguise' ? living.filter((t) => !team.has(t.id)) : living;
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
    if (g.phase === 'lobby' && Math.random() < 0.002) api.emote(p.id, pick(['dance', 'wave', 'scooby', 'scuba', 'jump']));

    if (g.phase === 'night') {
      if (g.blackbox?.id === p.id && !g.blackbox.target && now > b.actAt) {
        act(() => g.submitChoice(p.id, [mostSuspicious(g, p, b, g.players.filter((t) => t.id !== p.id))[0].id], now));
      }
      const prompt = g.prompts[p.id];
      if (prompt && !g.choices[p.id] && !g.draft && now > b.actAt) act(() => g.submitChoice(p.id, nightTargets(g, p, prompt, b), now));
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
          const yes = evil(p) ? s > 0 && Math.random() < 0.5 : p.alive ? top || s > 0.75 : rank === 0 && s > 0.6;
          act(() => g.setHand(p.id, yes));
        }
      }
    }

    // nominating someone they suspect
    if (g.phase === 'nominations' && !nom && p.alive && !g.nominators.has(p.id) && !b.triedNominate && now > b.nominateAt) {
      b.triedNominate = true;
      const choices = g.players.filter((t) => t.alive && t.id !== p.id && !g.nominees.has(t.id));
      const best = mostSuspicious(g, p, b, choices);
      if (best && best[1] > 0 && Math.random() < (evil(p) ? 0.5 : 0.7)) act(() => g.nominate(p.id, best[0].id, now));
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

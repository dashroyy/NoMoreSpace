// ARIA, the ship's autopilot storyteller.
//
// In Blood on the Clocktower a human Storyteller makes many small choices:
// which roles to put in the game, what false info a drunk player sees, whether
// the Recluse shows up as evil... This file makes those choices automatically.
// The human Captain can override any of them from the Command Station.

const { ROLES, DISTRIBUTION, rolesOfType, teamOf } = require('./roles');

function pick(list, random) {
  return list[Math.floor(random() * list.length)];
}

function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sample(list, count, random) {
  return shuffle(list, random).slice(0, count);
}

function allowed(roleId, playerCount) {
  return ROLES[roleId].minPlayers <= playerCount;
}

// ---------------------------------------------------------------------------
// Choosing roles
// ---------------------------------------------------------------------------

// Counts of each type after the Smuggler (Baron) adjusts them.
function typeCounts(playerCount, roleIds = []) {
  const [crew, drifter, saboteur, parasite] = DISTRIBUTION[playerCount];
  const smuggler = roleIds.includes('smuggler') ? 2 : 0;
  return { crew: crew - smuggler, drifter: drifter + smuggler, saboteur, parasite };
}

// Build a balanced random role list. Rules of thumb borrowed from experienced
// storytellers: keep at least half the crew on information roles, and never
// leave the crew without any information at all.
function pickRoles(playerCount, random = Math.random) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const base = typeCounts(playerCount);
    const saboteurs = sample(rolesOfType('saboteur').filter((r) => allowed(r, playerCount)), base.saboteur, random);
    const counts = typeCounts(playerCount, saboteurs);
    const drifterPool = rolesOfType('drifter').filter((r) => allowed(r, playerCount));
    if (counts.drifter > drifterPool.length) continue;
    const drifters = sample(drifterPool, counts.drifter, random);
    const crew = sample(rolesOfType('crew').filter((r) => allowed(r, playerCount)), counts.crew, random);

    const infoRoles = crew.filter((r) => ROLES[r].tags.includes('info')).length;
    if (infoRoles < Math.ceil(crew.length / 2)) continue;
    return ['parasite', ...saboteurs, ...drifters, ...crew];
  }
  throw new Error('Could not build a role list.');
}

// Check a Captain's hand-picked role list against the setup table.
function validateRoles(roleIds, playerCount) {
  if (!DISTRIBUTION[playerCount]) return `No setup for ${playerCount} players.`;
  if (roleIds.length !== playerCount) return `Pick exactly ${playerCount} roles (you picked ${roleIds.length}).`;
  if (new Set(roleIds).size !== roleIds.length) return 'Each role can only be used once.';
  for (const id of roleIds) if (!ROLES[id]) return `Unknown role: ${id}`;
  const want = typeCounts(playerCount, roleIds);
  for (const type of ['crew', 'drifter', 'saboteur', 'parasite']) {
    const have = roleIds.filter((id) => ROLES[id].type === type).length;
    if (have !== want[type]) return `Need ${want[type]} ${type} role(s), you picked ${have}.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// False information (for glitched or drunk players)
// ---------------------------------------------------------------------------

function otherNumber(truth, max, random) {
  const options = [];
  for (let i = 0; i <= max; i++) if (i !== truth) options.push(i);
  return options.length ? pick(options, random) : truth;
}

// ---------------------------------------------------------------------------
// Stories for the Captain's cloud bubble
// ---------------------------------------------------------------------------

const NIGHT_DEATH_LINES = [
  '{name} went to fetch a midnight snack. The fridge light flickered. The snack fetched {name}.',
  'At 03:00 ship time, {name}\'s bunk was found empty, apart from a single, damp tentacle print.',
  '{name} heard whispering from the vents and, being brave and not very clever, went to investigate.',
  'The cleaning droid reports "a mess" in corridor C. The mess used to be {name}.',
  '{name} was last seen floating past the observation window, waving politely.',
  'Something slithered out of the reactor at midnight. {name} will not be attending breakfast.',
  'Medical log: {name}, deceased. Cause: "extremely rude alien". Time of death: way too early.',
  '{name} tried to pet the thing under the bed. It was not the ship cat.',
];

const QUIET_NIGHT_LINES = [
  'The night passes. Something scratched at every door... but no door opened.',
  'A quiet night. Too quiet. The ship cat refuses to come out from under the reactor.',
  'Everyone wakes up. Everyone! The Parasite must be having an off night.',
  'The lights flickered, the hull groaned, and yet the whole crew made it to breakfast.',
];

const EXECUTION_LINES = [
  'The airlock hisses. {name} drifts gracefully toward the black hole, still protesting.',
  '{name} is escorted to the airlock. Their last words: "You will regret this!" (Probably.)',
  'With a polite "mind the gap", the crew sends {name} into the void.',
  '{name} pirouettes out of the airlock. Ten out of ten for style.',
];

const NIGHT_ANIMS = ['consumed', 'spaghettified', 'abducted', 'melted', 'confetti', 'frozen', 'duck', 'floataway', 'balloon', 'disco', 'tiny', 'rocket'];

function fill(template, name) {
  return template.replaceAll('{name}', name);
}

function dawnStory(deadNames, random = Math.random) {
  if (!deadNames.length) return pick(QUIET_NIGHT_LINES, random);
  return deadNames.map((n) => fill(pick(NIGHT_DEATH_LINES, random), n)).join(' ');
}

function executionStory(name, random = Math.random) {
  return fill(pick(EXECUTION_LINES, random), name);
}

function nightDeathAnim(random = Math.random) {
  return pick(NIGHT_ANIMS, random);
}

// ---------------------------------------------------------------------------
// Window clues: a small, cryptic hint for whichever team is losing.
// ---------------------------------------------------------------------------

// Rough "who is behind" measure. Progress toward the black hole (players dying)
// hurts the crew; dead or exposed evil players hurt the infiltrators.
function losingTeam(game) {
  const total = game.players.length;
  const alive = game.players.filter((p) => p.alive).length;
  const evil = game.players.filter((p) => teamOf(p.role) === 'infiltrators');
  const deadEvil = evil.filter((p) => !p.alive).length;
  const crewPressure = (total - alive) / Math.max(1, total - 2);
  let evilPressure = deadEvil / Math.max(1, evil.length);
  const parasite = game.players.find((p) => p.role === 'parasite');
  if (parasite && game.lastParasiteVotes >= Math.ceil(alive / 2)) evilPressure += 0.35;
  return crewPressure >= evilPressure ? 'crew' : 'infiltrators';
}

function makeClue(game, random = Math.random, forced = null) {
  const team = forced?.team || losingTeam(game);
  const inPlay = new Set(game.players.map((p) => p.role));
  const goodRoles = [...rolesOfType('crew'), ...rolesOfType('drifter')].filter((r) => r !== 'drunk');
  const living = game.players.filter((p) => p.alive);

  const kinds = team === 'crew' ? ['dead-constellation', 'comets', 'probe'] : ['living-constellation', 'drift-count', 'role-comets'];
  const kind = forced?.kind && kinds.includes(forced.kind) ? forced.kind : pick(kinds, random);

  if (kind === 'dead-constellation') {
    // A good role that is NOT aboard. Prefer one of the Parasite's bluffs.
    const notInPlay = goodRoles.filter((r) => !inPlay.has(r));
    const bluffs = (game.bluffs || []).filter((r) => notInPlay.includes(r));
    const role = pick(bluffs.length && random() < 0.6 ? bluffs : notInPlay, random);
    return { kind, team, role, caption: 'A dead constellation hangs outside the window tonight. Dead stars tell no truths.' };
  }
  if (kind === 'living-constellation') {
    const roles = goodRoles.filter((r) => inPlay.has(r));
    const role = pick(roles.length ? roles : goodRoles, random);
    return { kind, team, role, caption: 'A new constellation burns bright beside the black hole. Its light is still alive.' };
  }
  if (kind === 'comets') {
    const evil = living.filter((p) => teamOf(p.role) === 'infiltrators');
    const good = living.filter((p) => teamOf(p.role) === 'crew');
    if (!evil.length || good.length < 2) return makeClue(game, random, { team, kind: 'probe' });
    const chosen = shuffle([pick(evil, random), ...sample(good, 2, random)], random);
    return { kind, team, players: chosen.map((p) => p.id), caption: 'Three comets streak past the hull. One of them carries spores.' };
  }
  if (kind === 'probe') {
    const notParasite = living.filter((p) => p.role !== 'parasite');
    const target = pick(notParasite.length ? notParasite : living, random);
    return { kind, team, players: [target.id], caption: 'A derelict probe drifts by, its beacon blinking a familiar colour. It hums: "this one is not the hunger".' };
  }
  if (kind === 'drift-count') {
    const drifters = game.players.filter((p) => ROLES[p.role].type === 'drifter').length;
    return { kind, team, count: drifters, caption: 'Small lights blink in the debris field, then go still. Count them before they drift away.' };
  }
  // role-comets: one of three players is a particular crew role.
  const crewPlayers = living.filter((p) => ROLES[p.role].type === 'crew');
  if (!crewPlayers.length || living.length < 3) return makeClue(game, random, { team, kind: 'drift-count' });
  const holder = pick(crewPlayers, random);
  const others = sample(living.filter((p) => p !== holder), 2, random);
  return {
    kind: 'role-comets',
    team,
    role: holder.role,
    players: shuffle([holder, ...others], random).map((p) => p.id),
    caption: 'Three comets cross a familiar constellation. One of them shares its shape.',
  };
}

// The Holo-Jester's victim sees a clue that isn't there: same kinds and
// captions as real clues, with random (often false) contents.
const CLUE_KINDS = ['dead-constellation', 'living-constellation', 'comets', 'probe', 'drift-count', 'role-comets'];
function fakeClue(game, random = Math.random) {
  const real = makeClue(game, random, { team: pick(['crew', 'infiltrators'], random), kind: pick(CLUE_KINDS, random) });
  const goodRoles = [...rolesOfType('crew'), ...rolesOfType('drifter')].filter((r) => r !== 'drunk');
  const living = game.players.filter((p) => p.alive);
  const fake = { ...real };
  if (fake.role) fake.role = pick(goodRoles, random);
  if (fake.players) fake.players = sample(living, fake.players.length, random).map((p) => p.id);
  if (fake.count != null) fake.count = Math.floor(random() * 4);
  return fake;
}

module.exports = {
  fakeClue,
  pick,
  shuffle,
  sample,
  typeCounts,
  pickRoles,
  validateRoles,
  otherNumber,
  dawnStory,
  executionStory,
  nightDeathAnim,
  losingTeam,
  makeClue,
  NIGHT_ANIMS,
};

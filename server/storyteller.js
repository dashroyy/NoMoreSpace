// ARIA, the ship's autopilot storyteller.
//
// In Blood on the Clocktower a human Storyteller makes many small choices:
// which roles to put in the game, what false info a drunk player sees, whether
// the Recluse shows up as evil... This file makes those choices automatically.
// The human Captain can override any of them from the Command Station.

const { ROLES, DISTRIBUTION, rolesOfType, rolesOfTypeIn, teamOf } = require('./roles');
const { scriptOf, themeOf, inScript } = require('./scripts');

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
function pickRoles(playerCount, random = Math.random, scriptId = 'classic') {
  const script = scriptOf(scriptId);
  for (let attempt = 0; attempt < 50; attempt++) {
    const base = typeCounts(playerCount);
    const saboteurs = sample(rolesOfTypeIn(script.id, 'saboteur').filter((r) => allowed(r, playerCount)), base.saboteur, random);
    const counts = typeCounts(playerCount, saboteurs);
    const drifterPool = rolesOfTypeIn(script.id, 'drifter').filter((r) => allowed(r, playerCount));
    if (counts.drifter > drifterPool.length) continue;
    const drifters = sample(drifterPool, counts.drifter, random);
    const crew = sample(rolesOfTypeIn(script.id, 'crew').filter((r) => allowed(r, playerCount)), counts.crew, random);

    const infoRoles = crew.filter((r) => ROLES[r].tags.includes('info')).length;
    if (infoRoles < Math.ceil(crew.length / 2)) continue;
    return [pickDemon(script, playerCount, random), ...saboteurs, ...drifters, ...crew];
  }
  throw new Error('Could not build a role list.');
}

// Which Demon haunts this game. Scripts with more than one list a chance for each extra one.
function pickDemon(script, playerCount, random) {
  const options = script.demons.filter((r) => allowed(r, playerCount));
  for (const id of options.slice(1).reverse()) {
    if (random() < (script.demonChance?.[id] ?? 0.5)) return id;
  }
  return options[0];
}

// Check a Captain's hand-picked role list against the setup table.
function validateRoles(roleIds, playerCount, scriptId = 'classic') {
  if (!DISTRIBUTION[playerCount]) return `No setup for ${playerCount} players.`;
  if (roleIds.length !== playerCount) return `Pick exactly ${playerCount} roles (you picked ${roleIds.length}).`;
  if (new Set(roleIds).size !== roleIds.length) return 'Each role can only be used once.';
  for (const id of roleIds) if (!ROLES[id]) return `Unknown role: ${id}`;
  for (const id of roleIds) if (!inScript(id, scriptId)) return `${ROLES[id].name} is not on the ${scriptOf(scriptId).name} script.`;
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
  '{name} said the ship was totally safe, right up until the ship disagreed.',
  '{name} followed a trail of glowing slime in the middle of the night. It was a short trail.',
  "At 02:47 the intercom whispered {name}'s name. At 02:48 the intercom stopped, because {name} stopped answering.",
  "The laundry droid found {name}'s socks, {name}'s helmet and a note that just said 'burp'.",
  '{name} tried to hug the Parasite. In fairness, it hugged back.',
  'The hamster wheel in Cargo is still spinning. {name} is not in it, which is the problem.',
  '{name} opened the vent cover to ask if anyone was in there. Somebody was.',
  '{name} went looking for the source of the humming. It was the Parasite, humming a little song about {name}.',
  'ARIA would like to note that {name} ignored fourteen separate warnings. She does not enjoy being right this much.',
  '{name} found a suspicious puddle and licked it for science. Science lost.',
  'Whatever took {name} left the bunk made. Neatly. Corners tucked. It is a very tidy Parasite.',
  '{name} followed the smell of fresh noodles into a dark corridor. The noodles were bait. The noodles are always bait.',
];

const QUIET_NIGHT_LINES = [
  'The night passes. Something scratched at every door... but no door opened.',
  'A quiet night. Too quiet. The ship cat refuses to come out from under the reactor.',
  'Everyone wakes up. Everyone! The Parasite must be having an off night.',
  'The lights flickered, the hull groaned, and yet the whole crew made it to breakfast.',
  'Nobody died. The Parasite is either scared, full, or running a very slow, very evil spreadsheet.',
  'The whole crew wakes up complete, which is suspicious on a ship this haunted. ARIA has run the numbers twice and still does not like them.',
  'A peaceful night. Somewhere in the vents, a Parasite is writing a strongly worded email to itself.',
  'No victims tonight. The cleaning droid is thrilled. The ship cat is not buying it.',
  'All present, all alive, all deeply suspicious of each other. Breakfast is going to be awkward.',
  'The Parasite skipped a night. Experts say this is either mercy or a very elaborate plan.',
  "Nothing happened. ARIA would like it noted that 'nothing' is extremely unusual for this ship.",
  'Everyone made it to dawn, and every single one of them is looking at everyone else.',
];

const EXECUTION_LINES = [
  'The airlock hisses. {name} drifts gracefully toward the black hole, still protesting.',
  '{name} is escorted to the airlock. Their last words: "You will regret this!" (Probably.)',
  'With a polite "mind the gap", the crew sends {name} into the void.',
  '{name} pirouettes out of the airlock. Ten out of ten for style.',
  "{name} is airlocked with great ceremony and the world's smallest violin.",
  "The crew votes, the hatch opens, and {name} departs for the black hole in what ARIA calls 'a bold exit'.",
  '{name} drifts away, still explaining in great detail why this is a mistake. The vacuum does not care.',
  '{name} grabs the doorframe, then the door, then briefly the cat, and is finally airlocked. Eleven out of ten for grip.',
  "As the hatch closes, {name} mouths 'I am telling the captain', and floats off into the dark.",
  '{name} leaves by the airlock with a salute, a shrug and one very passionate interpretive dance.',
  'The airlock cycles. {name} is gone. The crew votes to feel bad about it later.',
  "{name} is shown the airlock and says 'Fine, I will walk.' There is no floor out there, but it was a nice thought.",
  "A small cheer, a small gasp and a very small 'oops'. {name} is now a spaceman in the technical sense.",
  '{name} waves goodbye from the hatch, which is brave, and also the last thing {name} does with air.',
];

const NIGHT_ANIMS = ['consumed', 'spaghettified', 'abducted', 'melted', 'confetti', 'frozen', 'duck', 'floataway', 'balloon', 'disco', 'tiny', 'rocket'];

function fill(template, name) {
  return template.replaceAll('{name}', name);
}

// Lines that use a player's own lobby bio ("Zorp is… allergic to zero gravity").
const BIO_DEATH_LINES = [
  '{name}, who is {bio}, floated out of bed and straight into the tentacles.',
  'Everyone knew {name} was {bio}. Nobody knew {name} was also delicious.',
  '{name}, famously {bio}, went to check a noise in the vents. The vents won.',
  'Here lies {name}: {bio}, and now also deceased.',
  'Ship log: {name} ({bio}) was taken in the night. The Parasite left a one-star review.',
  'Doctors say {name} was {bio} until quite recently. Now {name} is mostly a rumour.',
  'It is a sad day. {name}, a person who was {bio}, did not come out of the vents.',
  'Last night, {name}, proudly {bio}, met something that was not.',
  '{name}, who is {bio}, will be remembered fondly, and also for the sound.',
  'They say being {bio} builds character. It did not build escape routes, {name}.',
];

const BIO_EXECUTION_LINES = [
  '{name}, who is {bio}, is shown the airlock. The airlock is not impressed.',
  'Being {bio} was not enough to save {name}. Out they go.',
  '{name}, who is {bio}, protests all the way to the hatch. Being {bio} is not a defence in space law.',
  'The crew regrets this deeply. {name} is {bio}, after all. Out they go anyway.',
  'Look, {name} is lovely, and {bio}, but the vote is the vote.',
  '{name}, {bio} to the last, is shown the hatch. The hatch is not {bio}. The hatch is just a hatch.',
  "'I am {bio}!' says {name}. 'We know,' says the crew, and presses the button.",
  'Nobody thought {name}, who is {bio}, was evil. Nobody thought that hard, either.',
];

function fillBio(template, name, bio) {
  return template.replaceAll('{name}', name).replaceAll('{bio}', bio);
}

// dead: names, or { name, bio } (bios are used most of the time when set)
// The Cosmic Carnival tells its stories in a circus voice.
const CARNIVAL_NIGHT_DEATH_LINES = [
  '{name} wandered into the Hall of Mirrors. Only the mirror came out.',
  '{name} volunteered to be sawn in half. Nobody volunteered to put them back together.',
  'The cotton-candy machine was hungry again. {name} was the last thing it was seen with.',
  '{name} went to feed the fire-breathing lizard. The lizard says it was a misunderstanding.',
  'The human cannon went off at midnight with {name} inside. Nobody remembers loading it.',
  '{name} took the Ghost Train alone. The Ghost Train says it was not alone.',
  'Somebody found {name}\'s big shoes in the ball pit. Just the shoes.',
  'The Parasite did a card trick: "Pick a card, any card." It picked {name}.',
  '{name} tried to ride the carousel backwards. The carousel took it personally.',
  '{name} went to win the giant teddy bear. The giant teddy bear won.',
  'The Parasite wore the balloon-animal costume last night. {name} is now, regrettably, a balloon animal.',
  '{name} followed a trail of popcorn into the dark side of the big top. The popcorn was a trap.',
  'The tightrope walker reports a gap in the show where {name} used to be. Everyone is pretending not to see it.',
  "{name} stuck their head in the lion's mouth for a laugh. The lion, a professional, did not find it funny.",
];

const CARNIVAL_QUIET_NIGHT_LINES = [
  'The big top creaked, the calliope played one wrong note, and everyone woke up. The Parasite must be rehearsing.',
  'A quiet night under the canvas. Even the clowns are suspicious.',
  'Not a single act went missing. The audience feels strangely cheated.',
  'The lights flickered over the midway, and yet the whole troupe made it to breakfast.',
  'Not one clown went missing. The clowns are insulted.',
  'The calliope played the whole night and nobody screamed. The ringmaster would like a refund on the dread.',
  'A quiet night under the canvas. The Parasite is probably practising its juggling.',
  'Every act is accounted for. The audience, which is also the troupe, is quietly furious.',
];

const CARNIVAL_EXECUTION_LINES = [
  '{name} is fired out of the airlock cannon, trailing streamers. Ten out of ten from the judges.',
  'With a drumroll and a rude noise, the troupe sends {name} out of the big top for good.',
  '{name} takes a bow, and the trapdoor takes {name}.',
  '{name} is escorted to the airlock. "I was only the dancing bear!" they protest. (Nobody believes them.)',
  '{name} is driven out of the airlock in a tiny car, honking, with twenty-three clowns who were not invited.',
  'The troupe holds a very short, very silly funeral. {name} gets a custard pie as a send-off.',
  '{name} makes a dramatic exit through the trapdoor, which is a little more dramatic than planned.',
  'With a flourish, a cymbal crash and an unfortunate squeak, {name} is shown out of the show.',
  'The crew pulls the lever, the floor drops, and {name} lands in the void with a honk.',
];

// A little extra when the Magician brings someone back.
const REVIVE_LINES = [
  'Then, in a puff of glitter, {name} steps out of the Magician\'s cabinet and takes a bow. Nobody asked how.',
  'A wand flashes, a rabbit looks embarrassed, and {name} is somehow alive again.',
  'And then, with a drumroll nobody ordered, {name} came back from the void. Please do not ask questions.',
  'A cloud of confetti, one startled pigeon, and there is {name}, back from the dead and a little embarrassed.',
  "The Magician says 'Ta-da!' and {name} says 'I was in the middle of something.'",
  '{name} reappears wearing a cape that does not belong to them. The Magician says to ask no questions.',
  'It was a bit of a trick, mostly mirrors, partly glue, and {name} is back. Applause is optional.',
  '{name} is back. They would like it on record that the afterlife has very poor snacks.',
];

function reviveStory(name, random = Math.random) {
  return fill(pick(REVIVE_LINES, random), name);
}

// The Outbreak script's stories: bursts, quiet nights and decontamination.
const OUTBREAK_BURST_LINES = [
  '{name} coughed once, twice, and then, with a wet pop, was gone. The vents are full of glittering spores.',
  'Sick Bay found only a puddle, a stethoscope and a name tag that read "{name}".',
  '{name} burst in the night like a very sad balloon. The janitor is on the way, and he is not happy.',
  'The fever took {name} at 03:00. All that is left is a bright green smear and a faint smell of mushrooms.',
  '{name} was sneezing glitter at midnight. By dawn, the glitter was all that remained.',
  'Something in {name} bloomed in the night. It was not a flower.',
  '{name} sneezed once, and then not at all. The mop bucket has been called.',
  "The lab report on {name} simply reads 'ew'.",
  'By morning, {name} had bloomed into something not covered by the staff handbook.',
  '{name} went to the vending machine at midnight. The vending machine gave {name} a spore, and kept the change.',
];

const OUTBREAK_QUIET_NIGHT_LINES = [
  'A quiet night in the station. The only sound is somebody coughing in the vents. Somebody, or something.',
  'Nobody burst overnight. The lab smells of disinfectant and held breath.',
  'The fever dreams passed, and every bunk is still occupied. The Carrier must be feeling patient.',
  'No bursts, no screams, no mess. The janitor is deeply suspicious.',
  'A peaceful night, apart from the usual coughing. Somebody has been coughing since Tuesday. It is getting concerning.',
  'No new cases. The decontamination officer is dancing, quietly, in the corridor.',
  'Everybody is still themselves, probably. The Carrier is playing the long game, and washing its hands very loudly.',
];

const OUTBREAK_EXECUTION_LINES = [
  '{name} is marched into the decontamination chamber and sealed in. The shower runs for a long time. The red light does not come back on.',
  '{name} is led to the airlock in a hazmat suit two sizes too small. "I feel fine!" they protest. (That is exactly what an infected person would say.)',
  'With a hiss of disinfectant, the airlock cycles and {name} goes out into the Bloom.',
  '{name} is quarantined... permanently. The door is welded shut by committee.',
  '{name} is decontaminated, re-decontaminated and then, for good measure, decontaminated. The airlock does the rest.',
  '{name} is sent out of the hatch with a surgical mask and a heartfelt apology from the committee.',
  "'It is just a cold!' cries {name}. The committee notes that is exactly what the cold would say.",
  '{name} is shown out, wrapped in six layers of hazard tape, to a single sad round of applause.',
];

// The Citadel of Traitors' stories: murders, quiet nights and banishments.
const TRAITORS_MURDER_LINES = [
  '{name} was found at the foot of the tower stairs, smiling. Nobody smiles at the foot of the stairs.',
  'A single black feather lay on {name}\'s pillow. {name} was not breathing.',
  'In the night, the Traitors came for {name}. {name}\'s chair at the Round Table is empty.',
  'A black envelope lay unopened on {name}\'s bed. So was {name}\'s breakfast.',
  '{name} went to fetch a candle and never came back. The candle did.',
  'The Round Table is one chair short this morning. The chair belonged to {name}.',
  '{name} left the great hall last night to find the bathroom. The Citadel has a lot of bathrooms, and apparently one of them has a Traitor.',
  'The Faithful woke to a raven on the windowsill and a very quiet room where {name} used to be.',
  'A velvet glove lay on the stairs, a trail of crumbs led away, and {name} did not come to breakfast.',
  "{name} said 'I am sure I am safe, I am extremely Faithful.' The Traitors were very impressed, and also hungry.",
];

const TRAITORS_QUIET_NIGHT_LINES = [
  'A Shield, a Guardian or a change of heart: nobody was murdered last night. The Faithful do not know whether to cheer.',
  'The night passed with a thud and a creak, and no body. The Traitors will have some explaining to do to each other.',
  'No murder. The Traitors are either very clever, very cruel or very confused.',
  'Every chair at the Round Table is full this morning. Somebody is smiling a little too widely.',
  "No murder tonight. The Traitors are bickering over whose turn it was. It was nobody's. They forgot.",
  'The cloaks stayed on their hooks and every plate is full. The Prize Pot is not impressed.',
  'A whole night with no murders. Somebody in the Citadel is very pleased with themselves.',
];

const TRAITORS_BANISH_LINES = [
  '{name} walks the long gallery to the Banishment Gate, and the great doors boom shut behind them.',
  'The Round Table has spoken. {name} puts down their goblet, bows once, and is escorted out into the night.',
  '"I have nothing to hide," says {name}, which is exactly what everyone says. The gate swings open.',
  '{name} is banished from the Citadel by a very small majority and a very large silence.',
  '{name} is escorted out of the gate to the sound of a very long organ chord and a very short sneeze.',
  'The Banishment Gate creaks open. {name} bows to the crowd, adjusts their cloak, and gets a polite round of boos.',
  '{name} is sent into the night with a candle, a sandwich and no clear plan.',
  "The vote is in, the gate is open, and {name} makes a final speech that is mostly 'this is a mistake' repeated.",
];

// The Daredevil's luck runs out (told the same way in every script).
const DAREDEVIL_LINES = [
  '{name} tried to fly the shuttle through the reactor coolant ring. For the first time in history, it did not work.',
  '{name} shouted "watch this!" at 03:00. Nobody was awake to watch it.',
  '{name} bet the ship cat they could surf an airlock door. The cat now owns all of {name}\'s snacks.',
  '{name} was found upside down in the vents, grinning, and unfortunately very dead.',
  'The last words of {name}, logged by the cleaning droid: "hold my helmet."',
  '{name} said "what is the worst that could happen?" The ship was happy to answer.',
  '{name} attempted a triple backflip over the reactor. Gravity attempted a very firm no.',
  "{name} said 'what could go wrong?' and then started a list.",
  "{name}'s stunt helmet was found intact. The rest of the stunt was found elsewhere.",
  '{name} tried to skateboard down the airlock ramp. The ramp was, tragically, not a ramp.',
];

function dawnStory(dead, random = Math.random, scriptId = 'classic') {
  const carnival = scriptId === 'carnival';
  const outbreak = scriptId === 'outbreak';
  const traitors = scriptId === 'traitors';
  if (!dead.length) return pick(traitors ? TRAITORS_QUIET_NIGHT_LINES : outbreak ? OUTBREAK_QUIET_NIGHT_LINES : carnival ? CARNIVAL_QUIET_NIGHT_LINES : QUIET_NIGHT_LINES, random);
  const lines = traitors ? TRAITORS_MURDER_LINES : outbreak ? OUTBREAK_BURST_LINES : carnival ? CARNIVAL_NIGHT_DEATH_LINES : NIGHT_DEATH_LINES;
  return dead
    .map((d) => (typeof d === 'string' ? { name: d } : d))
    .map(({ name, bio, cause }) => (cause === 'daredevil' ? fill(pick(DAREDEVIL_LINES, random), name) : bio && random() < 0.7 ? fillBio(pick(BIO_DEATH_LINES, random), name, bio) : fill(pick(lines, random), name)))
    .join(' ');
}

function executionStory(name, random = Math.random, bio = '', scriptId = 'classic') {
  if (bio && random() < 0.5) return fillBio(pick(BIO_EXECUTION_LINES, random), name, bio);
  return fill(pick(scriptId === 'traitors' ? TRAITORS_BANISH_LINES : scriptId === 'outbreak' ? OUTBREAK_EXECUTION_LINES : scriptId === 'carnival' ? CARNIVAL_EXECUTION_LINES : EXECUTION_LINES, random), name);
}

const SHIP_NAMES = [
  'The Wobbly Goose', 'The Last Biscuit', 'HMS Questionable', 'The Space Noodle', 'SS Probably Fine',
  'The Cosmic Kettle', 'The Doomed Duckling', 'The Midnight Snack', 'The Gravity Skeptic', 'The Unsinkable II',
  'The Soggy Biscuit',
  'HMS Oops',
  'The Flying Colander',
  'SS Not Today',
  'The Reluctant Comet',
  'The Tin of Doom',
  'The Unlucky Teapot',
  'The Mildly Haunted',
  'The Rusty Pickle',
  'SS Please Hold',
  'The Nervous Wreck',
  'The Wobbly Cheese',
  'The Lost Sock',
  'HMS Not My Fault',
  'The Brave Little Toaster',
  'The Void Mitten',
  'SS Free Gravity',
  'The Cosmic Casserole',
];

function shipName(random = Math.random) {
  return pick(SHIP_NAMES, random);
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
  const parasite = game.players.find((p) => ROLES[p.role].type === 'parasite');
  if (parasite && game.lastParasiteVotes >= Math.ceil(alive / 2)) evilPressure += 0.35;
  return crewPressure >= evilPressure ? 'crew' : 'infiltrators';
}

function makeClue(game, random = Math.random, forced = null) {
  const team = forced?.team || losingTeam(game);
  const inPlay = new Set(game.players.map((p) => p.role));
  const goodRoles = [...rolesOfType('crew'), ...rolesOfType('drifter')].filter((r) => r !== 'drunk');
  const living = game.players.filter((p) => p.alive);

  const kinds = team === 'crew' ? ['dead-constellation', 'comets', 'probe'] : ['living-constellation', 'drift-count', 'role-comets'];
  const kind = forced?.kind && kinds.includes(forced.kind) ? forced.kind : pick(kinds.filter((k) => k !== forced?.avoid), random); // (a bonus clue is never the same kind as the first)

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
    return { kind, team, role, caption: themeOf(game.script).constellation };
  }
  if (kind === 'comets') {
    const evil = living.filter((p) => teamOf(p.role) === 'infiltrators');
    const good = living.filter((p) => teamOf(p.role) === 'crew');
    if (!evil.length || good.length < 2) return makeClue(game, random, { team, kind: 'probe' });
    const chosen = shuffle([pick(evil, random), ...sample(good, 2, random)], random);
    return { kind, team, players: chosen.map((p) => p.id), caption: 'Three comets streak past the hull. One of them carries spores.' };
  }
  if (kind === 'probe') {
    const notParasite = living.filter((p) => ROLES[p.role].type !== 'parasite');
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
  reviveStory,
  fakeClue,
  pick,
  shuffle,
  sample,
  typeCounts,
  pickRoles,
  validateRoles,
  otherNumber,
  dawnStory,
  DAREDEVIL_LINES,
  shipName,
  executionStory,
  nightDeathAnim,
  losingTeam,
  makeClue,
  NIGHT_ANIMS,
};

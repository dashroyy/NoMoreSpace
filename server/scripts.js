// Scripts: the cast of characters and the story of a game. This is our version
// of Blood on the Clocktower's "scripts" (Trouble Brewing, Bad Moon Rising...).
// The host picks one in the docking bay; the Storyteller (the Captain, or ARIA)
// then deals only roles that are on that script.
//
//   classic   "Black Hole Blues"  the original game, a ship falling into a black hole
//   carnival  "Cosmic Carnival"   a space circus drifting into the Great Grin (a clown-faced moon),
//                                 with twins, tricks, pies and a mirror demon
//   outbreak  "Outbreak"          a research station in a spreading spore cloud (the Bloom), where
//                                 the Demon infects people instead of killing them
//
// Each script has a `theme`: what the disaster is called and how every screen talks about it,
// plus (optionally) its own names for the rooms.
//
// This file is plain data (plus two tiny helpers) so the browser can show it too.

const CLASSIC_ROLES = [
  // crew
  'comms', 'archivist', 'security', 'navigator', 'engineer', 'scanner', 'coroner', 'medic', 'blackbox', 'sentinel', 'gunner', 'marine', 'firstofficer',
  // drifters
  'droid', 'drunk', 'stowaway', 'ambassador',
  // saboteurs
  'hacker', 'mimic', 'incubator', 'smuggler', 'jester',
  // the Parasite
  'parasite',
];

const CARNIVAL_ROLE_IDS = [
  // crew
  'engineer', 'scanner', 'coroner', 'medic', 'blackbox', 'firstofficer', 'gunner',
  'liontamer', 'acrobat', 'palmreader', 'tickettaker', 'stagehand', 'magician',
  // drifters
  'drunk', 'stowaway', 'clown', 'actor',
  // saboteurs
  'hacker', 'incubator', 'knifethrower', 'stagedouble', 'hexer',
  // the Demon: one of these two is in play
  'parasite', 'reflection',
];

const OUTBREAK_ROLE_IDS = [
  // crew
  'engineer', 'scanner', 'coroner', 'blackbox', 'firstofficer', 'gunner', 'comms', 'security',
  'vaccinator', 'tracer', 'hazmat', 'donor', 'sensor',
  // drifters
  'drunk', 'stowaway', 'patientzero', 'hypochondriac',
  // saboteurs
  'hacker', 'incubator', 'bioterrorist', 'quack', 'sporehost',
  // the Demon
  'carrier',
];

const SCRIPTS = {
  classic: {
    id: 'classic',
    name: 'Black Hole Blues',
    icon: '🕳️',
    minPlayers: 3,
    tagline: 'The original: a ship falling into a black hole, and something hungry aboard.',
    blurb: 'Clues, bluffs and a Parasite that kills one crewmate a night. The easiest script to learn, and the one every group should start with.',
    rules: [
      'The crew wins by airlocking the Parasite.',
      'Evil wins when only 2 players are left alive.',
    ],
    roles: CLASSIC_ROLES,
    demons: ['parasite'],
    narrator: 'ARIA, ship AI',
    // the disaster the story is about, and the words every screen uses for it
    theme: {
      doom: 'the black hole',
      doomIcon: '🕳️',
      doomTip: 'How close the black hole is. It creeps closer every night and every death.',
      lurch: 'The ship lurches. The black hole is {pct}% of the way to swallowing us…',
      howTitle: '🕳️ No More Space',
      howIntro: 'Your ship is falling into a black hole.',
      evilGoal: 'The ship falls in. No more space.',
      nightSub: 'The ship sleeps. Something in the vents does not.',
      crewWinTitle: '🛡️ The crew escapes the black hole!',
      evilWinTitle: '🦑 The infiltrators win. No more space.',
      shareTitle: 'NO MORE SPACE',
      shareCrew: 'THE CREW ESCAPES!',
      shareEvil: 'NO MORE SPACE…',
      crewReason: 'The Parasite is dead! The crew fires the engines and breaks free of the black hole.',
      evilReason: 'Only two remain. The Parasite steers the ship into the black hole. There is no more space.',
      officerReason: 'Three survivors and no airlocking: First Officer {name} takes the helm and pulls the ship free!',
      constellation: 'A new constellation burns bright beside the black hole. Its light is still alive.',
      demonName: 'The Parasite',
      demonDoes: 'Every night it kills.',
      plants: 'Water the 6 wilting moon plants before the black hole dries them out.',
      jokes: [],
      rooms: {},
    },
    intro: 'The ship has launched. Ahead, the black hole waits. Somewhere aboard, something is hungry.',
  },
  carnival: {
    id: 'carnival',
    name: 'Cosmic Carnival',
    icon: '🎪',
    minPlayers: 5,
    tagline: 'The Greatest Show in the Galaxy, drifting into the grin of a giant clown moon, with a Parasite in the troupe.',
    blurb: 'A travelling space circus. Lion Tamers guess who the Parasite is, a Method Actor is sure it IS the Parasite, Clowns throw pies that can lose the game, Magicians bring people back, and a Stage Double has a twin the crew cannot afford to lose. One of two Demons lurks, and one of them is a mirror that makes every clue lie.',
    rules: [
      'The crew wins by airlocking the Parasite. Evil wins when only 2 players are left alive.',
      'The Stage Double: the crew cannot win while the Stage Double and their good twin are both alive. If the good twin is airlocked, evil wins.',
      'One of two Demons is aboard: the Parasite or the Reflection. If it is the Reflection (7+ players), every clue the Crew receives is FALSE, and evil wins if a day ends with nobody airlocked.',
      'So always airlock someone: a day with no airlocking is a gift to the Reflection.',
    ],
    roles: CARNIVAL_ROLE_IDS,
    demons: ['parasite', 'reflection'],
    // the Reflection only shows up in bigger games, and not every time
    demonChance: { reflection: 0.4 },
    narrator: 'ARIA, Ringmaster of the Big Top',
    // little stories that show what a game of this script is like (the wiki lists them)
    moments: [
      ['🥧', 'The Great Pie Fight', 'The crew airlocks the Clown. A hush falls. The Clown, with one last pie, points at the player everybody trusts... who turns out to be the Stage Double. The crew loses to a custard pie.'],
      ['🦁', 'The Lion Tamer\'s gamble', 'Night 3: the Lion Tamer picks Dana and nobody dies. Night 4 she cannot pick Dana again, so she picks Priya... a death. Was it Dana all along? (Or did the Parasite simply have a quiet night?)'],
      ['👯', 'Twin trouble', 'You have been secretly told that Sam is your evil twin. Sam is claiming YOUR role, loudly, and everyone believes Sam. The crew must not airlock you... and cannot win while you both live.'],
      ['🎬', 'The method actor', 'Rex is absolutely certain he is the Parasite. Every night he "kills" someone. Nobody dies. He is getting suspicious of himself. The real Parasite is delighted.'],
      ['💥', 'Poof!', 'Everyone nominates carefully, except Kit, who nominates the second the clock starts and vanishes in purple smoke. Now everyone knows there is a Hexer... and nobody dares speak first.'],
      ['🪞', 'The mirror cracks', 'Every clue the crew has is a lie, and the Reflection wins if a day ends with nobody airlocked. Trust nothing, and airlock somebody. Anybody. Quickly.'],
    ],
    // the disaster the story is about, and the words every screen uses for it
    theme: {
      doom: 'the Great Grin',
      doomIcon: '🤡',
      doomTip: 'How close the Great Grin is, a clown-faced moon with a bottomless mouth. It creeps closer every night and every death.',
      lurch: 'The Big Top shudders. The Great Grin is {pct}% of the way to swallowing the whole show…',
      howTitle: '🎪 No More Show',
      howIntro: 'Your travelling circus has drifted into the orbit of the Great Grin, a colossal clown-faced moon whose mouth is a bottomless pit of laughter.',
      evilGoal: 'The Great Grin swallows the Big Top. The final curtain falls. No more show.',
      nightSub: 'The Big Top sleeps. Something under the canvas does not.',
      crewWinTitle: '🎪 The show goes on! The troupe escapes the Great Grin!',
      evilWinTitle: '🤡 The Great Grin swallows the Big Top. No more show.',
      shareTitle: 'NO MORE SHOW',
      shareCrew: 'THE SHOW GOES ON!',
      shareEvil: 'THE FINAL CURTAIN…',
      crewReason: 'The Parasite is dead! The troupe cranks the calliope to full blast and the Big Top bounces free of the Great Grin, trailing streamers.',
      evilReason: 'Only two remain. The Parasite steers the Big Top straight into the Great Grin. The mouth closes, the lights go out, and the final curtain falls. There is no more show.',
      officerReason: 'Three performers and no airlocking: First Officer {name} grabs the ringmaster\'s whip and cracks the Big Top out of the Great Grin\'s grip!',
      constellation: 'A new constellation of party hats twinkles beside the Great Grin. Its light is still alive.',
      demonName: 'The Parasite',
      demonDoes: 'Every night it kills.',
      plants: 'Water the 6 wilting balloon-flowers before the Great Grin pops them.',
      jokes: [
        '📢 Attention troupe: the Great Grin would like everyone to know it is not laughing AT us. It is laughing NEAR us.',
        '📢 Lost: one (1) unicycle. Last seen being ridden by someone who was definitely not the Parasite.',
        '📢 Reminder: the human cannon is NOT a bin. It is also not a taxi. It is a cannon.',
        '📢 Today\'s snack stand special: cotton candy with extra mystery. The mystery is what\'s in it.',
        '📢 The Great Grin has asked us to stop calling it "the maw". It prefers "Kevin".',
        '📢 Will whoever keeps honking at 3am: we can all hear you. We all know what you are.',
        '📢 Ten clowns got out of the clown car. Eleven got in. Please count your clowns.',
      ],
      rooms: {
        bridge: 'The Center Ring', observation: 'The Ferris Wheel', navigation: 'The Carousel', comms: 'The Calliope', medbay: 'The Clown Clinic', galley: 'The Snack Stand',
        reactor: 'The Spark Tent', engine: 'The Cannon Bay', hydroponics: 'The Topiary Garden', airlock: 'The Human Cannon', quarters: 'The Caravans', cargo: 'The Prop Room',
      },
    },
    intro: 'Roll up, roll up! The Greatest Show in the Galaxy begins. Above the Big Top, the Great Grin hangs in the sky, a clown moon with a bottomless mouth, waiting for the final act. Somewhere in the troupe, something hungry is wearing a costume.',
  },
  outbreak: {
    id: 'outbreak',
    name: 'Outbreak',
    icon: '🦠',
    minPlayers: 5,
    tagline: 'A research station adrift in a spreading spore cloud, and a Carrier among the staff.',
    blurb: 'The Demon does not kill: it INFECTS. Infected players are told at once, their abilities go haywire, and they burst a night later unless a Vaccinator gets to them first. Contact Tracers count the sick, a Blood Donor can swap places with the infected, a Hazmat Tech cannot catch it at all, and a Quack Doctor makes healthy people feel feverish just to waste your cures.',
    rules: [
      'The crew wins by airlocking the Carrier. Evil wins when only 2 players are left alive.',
      'The Carrier does not kill. It infects a player each night. An infected player is told at once, and bursts (dies) when the NEXT night ends, unless cured.',
      'While infected, a player\'s abilities malfunction: their information is false and their protections fail.',
      'The Vaccinator cures the infected, or shields a healthy player. Find the sick in time: but beware the Quack Doctor, whose fake fevers sound just like the real thing.',
    ],
    roles: OUTBREAK_ROLE_IDS,
    demons: ['carrier'],
    narrator: 'ARIA, Station Containment AI',
    // little stories that show what a game of this script is like (the wiki lists them)
    moments: [
      ['🤒', 'The first fever', 'Morning. Dana wakes up burning and announces she is infected. Nobody knows if it is true: an evil Quack Doctor can give anyone the same message. She will burst tonight unless the Vaccinator guesses right.'],
      ['💉', 'The Vaccinator\'s guess', 'Three people claim to have a fever. The Vaccinator can only jab one. She picks the quietest one, because the loudest one is always lying. Dawn: the quiet one is cured. The loud one is a smear on the floor.'],
      ['🩸', 'The Blood Donor', 'Priya is sure Sam is truly infected, and Sam is the only person who can prove the Carrier is a Saboteur. She gives her blood, cures Sam, and catches the sickness herself. Now she has one night to find a Vaccinator.'],
      ['🥽', 'Nothing happens', 'The Carrier breathes on Kit three nights in a row. Kit is wearing a hazmat suit and says nothing. Finally, on night four, Kit speaks up: "Somebody has been trying to infect me for three nights."'],
      ['🍄', 'Nominating a mushroom', 'Rex nominates Ali, and the crew airlocks him. A cloud of spores puffs out of the airlock and Rex starts to cough. Ali was the Spore Host. Rex bursts tomorrow, unless somebody finds the Vaccinator.'],
      ['😷', 'The professional patient', 'Mo wakes up every single morning sure they are infected. The Contact Tracer, checking Mo for the third night in a row, is getting very suspicious that Mo is the Carrier. (Mo is just Mo.)'],
    ],
    // the disaster the story is about, and the words every screen uses for it
    theme: {
      doom: 'the Bloom',
      doomIcon: '🦠',
      doomTip: 'How close the Bloom is, a spreading cloud of spores. It creeps closer every night and every death.',
      lurch: 'The Bloom presses against the hull. It is {pct}% of the way to swallowing Station Petri…',
      howTitle: '🦠 Quarantine Failed',
      howIntro: 'Your research station is adrift in the Bloom, a spreading cloud of spores.',
      evilGoal: 'The Bloom swallows the station. Quarantine fails.',
      nightSub: 'The station sleeps behind sealed doors. Something in the vents is breathing.',
      crewWinTitle: '💉 The cure works! The staff contains the outbreak!',
      evilWinTitle: '🦠 The Bloom swallows Station Petri. Quarantine failed.',
      shareTitle: 'QUARANTINE FAILED',
      shareCrew: 'THE CURE WORKS!',
      shareEvil: 'THE BLOOM WINS…',
      crewReason: 'The Carrier is dead! The last sample is incinerated, the spores settle, and the Bloom drifts away from Station Petri.',
      evilReason: 'Only two remain. The Carrier throws open every airlock and lets the Bloom in. Quarantine has failed.',
      officerReason: 'Three survivors and no airlocking: First Officer {name} slams the emergency quarantine lever and seals the Bloom out!',
      constellation: 'A new constellation of glowing spores shines beside the Bloom. Its light is still alive.',
      demonName: 'The Carrier',
      demonDoes: 'Every night it infects someone, and the infected burst a night later unless they are cured.',
      plants: 'Water the 6 wilting sample plants before the Bloom spores take over.',
      jokes: [
        '📢 Attention staff: please do not lick the samples. This includes the blue ones. This especially includes the blue ones.',
        '📢 The Bloom has asked us to stop calling it "the Bloom". It would like to be called "Dave".',
        '📢 Reminder: if you feel feverish, please report to Sick Bay. If you feel perfectly fine, please also report to Sick Bay. Better safe.',
        '📢 Lost: one (1) clipboard. Contains the only copy of the cure. Smells of mushrooms.',
        '📢 The cafeteria mystery meat is now officially a different mystery. Please do not ask which.',
        '📢 Would the person who keeps coughing in the vents please stop. We know it is not the vents.',
        '📢 Today\'s decontamination shower is brought to you by "Panic". Please queue in an orderly panic.',
      ],
      rooms: {
        bridge: 'The Containment Hub', observation: 'The Specimen Gallery', navigation: 'The Genome Lab', comms: 'The Alarm Center', medbay: 'The Sick Bay', galley: 'The Test Kitchen',
        reactor: 'The Incinerator', engine: 'The Ventilation Plant', hydroponics: 'The Mold Garden', airlock: 'The Decon Chamber', quarters: 'The Quarantine Cells', cargo: 'The Cold Storage',
      },
    },
    intro: 'Station Petri is sealed. Outside, the Bloom presses against the glass, a cloud of spores as big as a moon. Inside, one of the staff is a Carrier, and the first fever is already on its way.',
  },
};

const DEFAULT_SCRIPT = 'classic';

function scriptOf(id) {
  return SCRIPTS[id] || SCRIPTS[DEFAULT_SCRIPT];
}

function themeOf(id) {
  return scriptOf(id).theme;
}

// "the Bridge" for a classic ship, "The Center Ring" in the Carnival (room ids never change)
function roomLabel(scriptId, roomId, fallback) {
  return themeOf(scriptId).rooms[roomId] || fallback;
}

function inScript(roleId, scriptId) {
  return scriptOf(scriptId).roles.includes(roleId);
}

module.exports = { SCRIPTS, DEFAULT_SCRIPT, scriptOf, themeOf, roomLabel, inScript };

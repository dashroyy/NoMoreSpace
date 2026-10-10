// Scripts: the cast of characters and the story of a game. This is our version
// of Blood on the Clocktower's "scripts" (Trouble Brewing, Bad Moon Rising...).
// The host picks one in the docking bay; the Storyteller (the Captain, or ARIA)
// then deals only roles that are on that script.
//
//   classic   "Black Hole Blues"  the original game, a ship falling into a black hole
//   carnival  "Cosmic Carnival"   a space circus drifting into the Great Grin (a clown-faced moon),
//                                 with twins, tricks, pies and a mirror demon
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

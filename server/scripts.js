// Scripts: the cast of characters and the story of a game. This is our version
// of Blood on the Clocktower's "scripts" (Trouble Brewing, Bad Moon Rising...).
// The host picks one in the docking bay; the Storyteller (the Captain, or ARIA)
// then deals only roles that are on that script.
//
//   classic   "Black Hole Blues"  the original game, a ship falling into a black hole
//   carnival  "Cosmic Carnival"   a space circus, with twins, tricks, pies and a mirror demon
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
    intro: 'The ship has launched. Ahead, the black hole waits. Somewhere aboard, something is hungry.',
  },
  carnival: {
    id: 'carnival',
    name: 'Cosmic Carnival',
    icon: '🎪',
    minPlayers: 5,
    tagline: 'The Greatest Show in the Galaxy, tumbling into a black hole, with a Parasite in the troupe.',
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
    intro: 'Roll up, roll up! The Greatest Show in the Galaxy begins. Ahead, the black hole waits in the wings. Somewhere in the troupe, something hungry is wearing a costume.',
  },
};

const DEFAULT_SCRIPT = 'classic';

function scriptOf(id) {
  return SCRIPTS[id] || SCRIPTS[DEFAULT_SCRIPT];
}

function inScript(roleId, scriptId) {
  return scriptOf(scriptId).roles.includes(roleId);
}

module.exports = { SCRIPTS, DEFAULT_SCRIPT, scriptOf, inScript };

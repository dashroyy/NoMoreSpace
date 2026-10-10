// The rules of No More Space for one ship (room).
//
// It follows Blood on the Clocktower's "Trouble Brewing" rules closely:
// hidden roles, a night order, glitched (poisoned) and drunk players getting
// false information, nominations with a clockwise vote, ghost votes, and the
// same win conditions. Nothing here knows about networking, so it can be
// tested on its own (see test/engine.test.js).

const crypto = require('crypto');
const { ROLES, TYPES, MIN_PLAYERS, MAX_PLAYERS, EVIL_INFO_MIN, rolesOfType, rolesOfTypeIn, teamOf } = require('./roles');
const { SCRIPTS, scriptOf } = require('./scripts');
const st = require('./storyteller');
const cosmetics = require('./cosmetics');
const { TASKS } = require('./tasks');

const DAY_PHASES = ['roam', 'meeting', 'nominations'];
// Ready buttons also work at night (to end it) and at dawn (to skip the story).
const READY_PHASES = ['night', 'dawn', ...DAY_PHASES];
// A drawing that is still being sent as the night ends is still pinned up if it arrives within this long.
const DRAWING_GRACE_MS = 8000;
// Private door locks (see lockRoom): anyone can lock the room they are talking in.
const LOCK_SECONDS = 90; // a lock lasts this long at most
const LOCK_COOLDOWN_SECONDS = 45; // then the person who locked it must wait this long before locking again
const MAX_PRIVATE_LOCKS = 3; // doors locked across the whole ship at once
const LOCK_GRACE_MS = 6000; // a lock with fewer than two of its people inside opens itself after this long
const KNOCK_GAP_MS = 8000; // between knocks from the same person on the same door
const TARGET_RULE = { hacker: 'alive', jester: 'alive', medic: 'alive', parasite: 'alive', reflection: 'alive', scanner: 'any', droid: 'any', blackbox: 'any' };
const DEATH_ANIMS = ['airlock', ...st.NIGHT_ANIMS, 'fainted', 'shot'];
const HAUNTS = ['flicker', 'crate', 'cackle']; // a ghost's harmless pranks
const HAUNTS_PER_DAY = 3;
const HAUNT_COOLDOWN_MS = 6000;
const REACTIONS = ['😱', '🤣', '🙄', '👀', '🫡'];
const AFK_MS = 90_000; // no input for this long by day = away from keyboard
const HOST_AWAY_MS = 60_000; // a quiet host in the lobby lets anyone launch
const MAX_SPECTATORS = 10;
// Robot crewmates fill empty seats. Each gets a name and a lobby bio.
const BOTS = [
  ['Unit-7', 'programmed to be suspicious'], ['Beep', 'running on 3% battery'], ['Sputnik', 'older than the ship'],
  ['Rivet', 'afraid of magnets'], ['Zap-9', 'a former toaster'], ['Bolt', 'in love with the airlock'],
  ['Gizmo', 'collecting space dust'], ['Cog', 'certain it is a real boy'], ['Pixel', 'buffering'],
  ['Servo', 'allergic to water'], ['Orbit', 'dizzy all the time'], ['Widget', 'mostly glue'],
  ['Quark', 'too small to notice'], ['Nebula', 'full of secrets'],
];
const CLUE_MS = 20_000; // a clue drifts past the Observation Deck for this long
const CLUE_WARN_MS = 20_000; // players who did a task today get this much warning
const ROOM_NAMES = {
  bridge: 'the Bridge', observation: 'the Observation Deck', navigation: 'Navigation', comms: 'Comms', medbay: 'the Medbay', galley: 'the Galley',
  reactor: 'the Reactor', engine: 'the Engine Room', hydroponics: 'Hydroponics', airlock: 'the Airlock', quarters: 'Crew Quarters', cargo: 'the Cargo Bay',
};

function randomId(bytes = 8) {
  return crypto.randomBytes(bytes).toString('hex');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function freshPlayerState() {
  return {
    alive: true,
    role: null, // true role
    believed: null, // what the player thinks they are (differs for the Space Drunk)
    ghostVote: true, // dead players get one vote for the rest of the game
    used: false, // once-per-game abilities (Gunner, Sentinel)
    systemUsed: false, // once-per-game ship system (see roles.js `system`)
    master: null, // Service Droid's chosen master for today
    notes: [], // private information this player has learned
    haunts: { day: 0, used: 0, lastAt: 0 }, // a ghost's pranks today
    lastActive: 0, // last time this player touched the keyboard or mouse
  };
}

class Game {
  constructor(code, { mode = 'autopilot', random = Math.random } = {}) {
    this.code = code;
    this.mode = mode; // 'autopilot' (ARIA runs the game) | 'captain' (a human game master)
    this.random = random;
    this.players = []; // seat order = array order (clockwise around the bridge table)
    this.captain = null; // { id, token, name, connected } in captain mode
    this.hostId = null;
    this.pace = 1; // timer multiplier: 1.3 relaxed, 1 standard, 0.7 quick
    this.autoAdvance = mode === 'autopilot';
    this.customRoles = null;
    this.script = 'classic'; // which cast of characters and story (scripts.js)
    this.regPolicy = { stowaway: 'auto', mimic: 'auto' };
    this.shipName = st.shipName(random);
    // the evening's running scores, kept across rematches (by player name)
    this.season = { games: 0, rows: {} };
    this.spectators = []; // late friends watching until the next rematch: { id, token, name, connected }
    this.isPublic = false; // listed in "Join a public ship" on the title screen
    this.resetState();
  }

  resetState() {
    this.phase = 'lobby';
    this.day = 0;
    this.night = 0;
    this.phaseEndsAt = null;
    this.phaseStartedAt = null;
    this.pausedRemaining = null;
    this.prompts = {};
    this.choices = {};
    this.draft = null;
    this.blackbox = null;
    this.glitch = null;
    this.bluffs = [];
    this.redHerringId = null;
    this.firstKillNight = 2;
    this.nominators = new Set();
    this.nominees = new Set();
    this.nomination = null;
    this.ready = new Set(); // players happy to move on to the next part of the day
    this.block = null;
    this.lastNomination = null;
    this.executedToday = null;
    this.executedYesterday = null;
    this.dawn = null;
    this.dusk = null;
    this.bubble = null;
    this.log = [];
    this.history = [];
    this.chapter = null;
    this.winner = null;
    this.winReason = null;
    this.charge = 0;
    this.clue = null;
    this.hallucination = null; // the Holo-Jester's victim for today: { id, seed, clue }
    this.claims = {}; // public role claims: pid -> { role, text, at }
    this.dayLog = []; // public record of the game: votes, deaths, clues, claims
    this.lastWords = null; // { id } while the airlocked player gets their last words
    this.twin = null; // the Stage Double's twin: { evil, good }
    this.hexed = null; // the Hexer's victim for today: { id }
    this.wish = null; // a dead Clown's pie: { id, until }
    this.shipEvent = null; // the Captain's fun: { kind, until }
    this.awards = null;
    this.startedAt = null;
    this.predictions = {}; // ghosts' bets on who the Parasite is: pid -> { id, since, day, changedDay }
    this.deathGuesses = {}; // tonight's "who dies tonight?" guesses: pid -> player id or 'none'
    this.guessScore = {}; // correct guesses this game
    this.lastGuess = {}; // pid -> { night, guess, correct } for the dawn toast
    this.replayId = null;
    this.lastWordsLog = []; // { id, day, text, reactions, laughs } for the share card
    this.afk = new Set(); // players away from the keyboard (count as ready)
    this.activeFloor = 0; // idle time is measured from the start of each day
    this.seasonCounted = false;
    this.rematchAt = null;
    // for the end-of-game awards
    this.stats = { chat: {}, tasks: {}, yesOnEvil: {}, yesOnGood: {}, nominations: {}, yesReceived: {}, systems: {}, haunts: {}, hallucinated: [] };
    this.tasksDone = {};
    this.drawings = [];
    this.regCache = {};
    this.lastParasiteVotes = 0;
    this.mimicManifest = null;
    this.resetSystems();
    this.visits = {}; // room -> Set of players seen inside today (door logs)
    this.votesToday = []; // results of today's nominations
    this.version = (this.version || 0) + 1;
    for (const p of this.players) Object.assign(p, freshPlayerState());
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  get(id) {
    return this.players.find((p) => p.id === id);
  }

  alive() {
    return this.players.filter((p) => p.alive);
  }

  aliveCount() {
    return this.alive().length;
  }

  name(id) {
    return this.get(id)?.name ?? 'someone';
  }

  isController(id) {
    return this.mode === 'captain' ? this.captain?.id === id : this.hostId === id;
  }

  requireController(id) {
    if (!this.isController(id)) throw new Error(this.mode === 'captain' ? 'Only the Captain can do that.' : 'Only the host can do that.');
  }

  isGlitched(p) {
    return !!this.glitch && this.glitch.id === p.id;
  }

  // Ability does not work: the Space Drunk always, glitched players for a night and a day.
  broken(p, glitch = this.glitch) {
    return p.role === 'drunk' || (!!glitch && glitch.id === p.id);
  }

  // The Demon is "the Parasite" in every script, but some scripts have more than one kind (the Reflection).
  isDemon(p) {
    return ROLES[p.role].type === 'parasite';
  }

  demonRole() {
    return this.players.find((p) => this.isDemon(p))?.role || 'parasite';
  }

  rolesOf(type) {
    return rolesOfTypeIn(this.script, type);
  }

  reflectionAlive() {
    return this.players.some((p) => p.alive && p.role === 'reflection');
  }

  // Information from this player's ability is false: broken abilities, and every Crew ability
  // while the Reflection lives. (Protections and attacks are not information, so they still work.)
  lies(p, glitch = this.glitch) {
    return this.broken(p, glitch) || (this.reflectionAlive() && ROLES[p.believed].type === 'crew');
  }

  // The public record (the "day log"): things everyone at the table saw happen.
  logEvent(e) {
    this.dayLog.push({ day: this.day, night: this.night, phase: this.phase, at: Date.now(), ...e });
    if (this.dayLog.length > 400) this.dayLog.shift();
  }

  bump(stat, id, by = 1) {
    this.stats[stat][id] = (this.stats[stat][id] || 0) + by;
  }

  announce(text, kind = 'info') {
    this.log.push({ text, kind, day: this.day, night: this.night, phase: this.phase, at: Date.now() });
    if (this.log.length > 80) this.log.shift();
  }

  tell(p, text, extra = {}) {
    p.notes.push({ text, night: this.night, day: this.day, phase: this.phase, ...extra });
  }

  ev(event) {
    if (this.chapter) this.chapter.events.push(event);
  }

  newChapter(kind, n) {
    this.chapter = { k: kind, n, events: [] };
    this.history.push(this.chapter);
  }

  setPhase(phase, durationMs, now) {
    this.phase = phase;
    this.phaseStartedAt = now;
    this.phaseEndsAt = durationMs == null ? null : now + durationMs;
    this.pausedRemaining = null;
    this.ready.clear();
    // timed ship systems only last while exploring
    if (phase !== 'roam' && this.systems) this.resetSystems();
  }

  // Ship systems and door locks only last while exploring: everything starts afresh.
  resetSystems() {
    this.systems = { intercepts: [], lockdowns: [], disguises: {}, blackoutUntil: 0, lockReady: {}, knocked: {} };
  }

  // How long each part of the day lasts. Tuned so a 10-player game runs about
  // an hour, like a game of Blood on the Clocktower.
  dur(kind) {
    const alive = this.aliveCount();
    const seconds = {
      nightMin: 10, // the earliest everyone-ready can end the night
      nightMax: 150, // the night ends by itself after this, ready or not
      blackbox: 40,
      dawn: 24 + 6 * (this.dawn?.deaths.length || 0), // time to read the story, watch the deaths and see the recap
      roam: clamp(alive * 25, 100, 360) + (this.day === 1 ? 90 : 0),
      meeting: clamp(alive * 12, 60, 180),
      nominations: clamp(alive * 30, 150, 420),
      accuse: 20,
      defend: 20,
      ballot: 15, // everyone votes at once
      voteStep: 0.45, // then the clock hand sweeps round revealing each vote
      lastwords: 15,
      wish: 40, // a dead Clown has this long to pick a target for their pie
      dusk: 9,
    }[kind];
    return Math.round(seconds * 1000 * this.pace);
  }

  // ---------------------------------------------------------------------------
  // Lobby
  // ---------------------------------------------------------------------------

  cleanName(name) {
    const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 18);
    if (!clean) throw new Error('Pick a name first.');
    const taken = [...this.players.map((p) => p.name), ...(this.spectators || []).map((s) => s.name), this.captain?.name].filter(Boolean);
    if (taken.some((n) => n.toLowerCase() === clean.toLowerCase())) throw new Error('That name is taken on this ship.');
    return clean;
  }

  addPlayer(name, look = {}) {
    if (this.phase !== 'lobby') throw new Error('The ship has already launched.');
    if (this.players.length >= MAX_PLAYERS) throw new Error('This ship is full (15 players).');
    const clean = this.cleanName(name);
    const taken = this.players.map((p) => p.cosmetics.suit);
    const look2 = cosmetics.clean(look, cosmetics.defaults(taken));
    if (taken.includes(look2.suit)) look2.suit = cosmetics.defaults(taken).suit;
    const player = { id: randomId(), token: randomId(16), name: clean, bio: '', connected: true, cosmetics: look2, ...freshPlayerState() };
    this.players.push(player);
    if (!this.hostId && this.mode === 'autopilot') this.hostId = player.id;
    this.version++;
    return player;
  }

  addCaptain(name) {
    if (this.captain) throw new Error('This ship already has a Captain.');
    this.captain = { id: randomId(), token: randomId(16), name: this.cleanName(name), connected: true };
    return this.captain;
  }

  removePlayer(id) {
    if (this.phase !== 'lobby') return;
    this.players = this.players.filter((p) => p.id !== id);
    if (this.hostId === id) this.hostId = this.players[0]?.id ?? null;
    this.version++;
  }

  setCosmetics(id, look) {
    const p = this.get(id);
    if (!p) throw new Error('Not on this ship.');
    const next = cosmetics.clean(look, p.cosmetics);
    if (next.suit !== p.cosmetics.suit && this.players.some((o) => o !== p && o.cosmetics.suit === next.suit)) {
      throw new Error('Someone is already wearing that colour.');
    }
    p.cosmetics = next;
  }

  moveSeat(byId, id, dir) {
    this.requireController(byId);
    if (this.phase !== 'lobby') throw new Error('Seats are locked once the ship launches.');
    const i = this.players.findIndex((p) => p.id === id);
    const j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= this.players.length) return;
    [this.players[i], this.players[j]] = [this.players[j], this.players[i]];
  }

  shuffleSeats(byId) {
    this.requireController(byId);
    if (this.phase !== 'lobby') throw new Error('Seats are locked once the ship launches.');
    this.players = st.shuffle(this.players, this.random);
  }

  setPace(byId, pace) {
    this.requireController(byId);
    const value = Number(pace);
    if (![0.7, 1, 1.3].includes(value)) throw new Error('Pick relaxed, standard or quick.');
    this.pace = value;
  }

  setScript(byId, id) {
    this.requireController(byId);
    if (this.phase !== 'lobby') throw new Error('The ship has already launched.');
    if (!SCRIPTS[id]) throw new Error('Unknown script.');
    if (this.script !== id) this.customRoles = null; // hand-picked roles belong to the old script
    this.script = id;
  }

  setCustomRoles(byId, roleIds) {
    this.requireController(byId);
    if (this.phase !== 'lobby') throw new Error('Roles are dealt already.');
    if (roleIds == null) {
      this.customRoles = null;
      return;
    }
    if (!Array.isArray(roleIds)) throw new Error('Bad role list.');
    const error = st.validateRoles(roleIds, this.players.length, this.script);
    if (error) throw new Error(error);
    this.customRoles = [...roleIds];
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  // deal: optional exact role per seat (the Captain assigning roles by hand).
  // drunkAs: optional Crew role the Space Drunk believes they are.
  start(byId, now = Date.now(), { deal = null, drunkAs = null } = {}) {
    // if the host has gone quiet in the lobby, any player can launch
    if (!(this.hostAway(now) && this.get(byId))) this.requireController(byId);
    if (this.phase !== 'lobby') throw new Error('Already launched.');
    const n = this.players.length;
    if (n < MIN_PLAYERS) throw new Error(`Need at least ${MIN_PLAYERS} players.`);
    const script = scriptOf(this.script);
    if (n < script.minPlayers) throw new Error(`${script.name} needs at least ${script.minPlayers} players.`);

    let roles;
    if (deal) {
      const error = st.validateRoles(deal, n, this.script);
      if (error) throw new Error(error);
      roles = [...deal];
    } else {
      roles = this.customRoles;
      if (roles && st.validateRoles(roles, n, this.script)) roles = null; // player count changed since they were picked
      roles = st.shuffle(roles || st.pickRoles(n, this.random, this.script), this.random);
    }

    this.resetState();
    this.startedAt = now;
    this.players.forEach((p, i) => {
      p.role = roles[i];
      p.believed = roles[i];
    });

    const inPlay = new Set(roles);
    const goodNotInPlay = (type) => this.rolesOf(type).filter((r) => !inPlay.has(r) && ROLES[r].minPlayers <= n);

    // The Space Drunk believes they are a Crew role that is not in play.
    const drunk = this.players.find((p) => p.role === 'drunk');
    if (drunk) {
      const options = goodNotInPlay('crew');
      drunk.believed = options.includes(drunkAs) ? drunkAs : st.pick(options, this.random);
      inPlay.add(drunk.believed);
    }

    // The Scanner's "ghost signal" (Fortune Teller red herring) is a good player.
    if (n >= 5) {
      const good = this.players.filter((p) => teamOf(p.role) === 'crew');
      this.redHerringId = st.pick(good, this.random).id;
    }

    // In 3-player games the Parasite waits an extra night (Short Haul rule).
    this.firstKillNight = n === 3 ? 3 : 2;

    // The Parasite's bluffs: 3 good roles that are not in play.
    const bluffPool = [...goodNotInPlay('crew'), ...goodNotInPlay('drifter').filter((r) => r !== 'drunk')].filter((r) => !inPlay.has(r));
    this.bluffs = st.sample(bluffPool, 3, this.random);

    // The Method Actor believes they are the Demon that is in play.
    const demonRole = roles.find((r) => ROLES[r].type === 'parasite');
    for (const p of this.players) if (p.role === 'actor') p.believed = demonRole;
    // The Stage Double has a good twin (a Crew player), and they know each other.
    this.twin = null;
    const double = this.players.find((p) => p.role === 'stagedouble');
    const twinPool = this.players.filter((p) => ROLES[p.role].type === 'crew');
    if (double && twinPool.length) this.twin = { evil: double.id, good: st.pick(twinPool, this.random).id };

    this.history.push({
      k: 'setup',
      twin: this.twin,
      seats: this.players.map((p) => p.id),
      roles: Object.fromEntries(this.players.map((p) => [p.id, p.role])),
      believed: Object.fromEntries(this.players.map((p) => [p.id, p.believed])),
      redHerring: this.redHerringId,
      bluffs: this.bluffs,
    });
    this.mimicManifest = this.manifest();
    for (const p of this.players) p.lastActive = now;
    this.announce(script.intro, 'system');
    this.beginNight(now);
  }

  evilInfoShared() {
    return this.players.length >= EVIL_INFO_MIN;
  }

  // ---------------------------------------------------------------------------
  // Night
  // ---------------------------------------------------------------------------

  promptFor(p) {
    if (!p.alive) return null;
    const def = ROLES[p.believed].night;
    if (!def || !def.choose || def.onDeath) return null;
    if (this.night === 1 ? !def.first : !def.other) return null;
    if (ROLES[p.believed].type === 'parasite' && this.night < this.firstKillNight) return null;
    if (def.once && p.used) return null; // a once-per-game ability that has been used
    if (def.target === 'dead' && !this.players.some((o) => !o.alive)) return null; // nobody to choose yet
    return {
      role: p.believed, choose: def.choose, notSelf: !!def.notSelf, target: def.target || TARGET_RULE[p.believed] || 'alive',
      once: !!def.once, notRepeat: !!def.notRepeat,
    };
  }

  // Did this player wake tonight because of their own ability? (The Stagehand counts these.)
  wakesTonight(o) {
    if (!o.alive) return false;
    if (this.prompts[o.id]) return true;
    const def = ROLES[o.believed].night;
    if (!def || def.choose || def.onDeath) return false;
    return this.night === 1 ? !!def.first : !!def.other;
  }

  beginNight(now) {
    this.night += 1;
    this.deathGuesses = {};
    this.executedYesterday = this.executedToday;
    this.executedToday = null;
    this.glitch = null; // last night's glitch wore off at dusk
    this.hallucination = null; // and so did the hallucinations
    this.choices = {};
    this.draft = null;
    this.blackbox = null;
    this.nomination = null;
    this.block = null;
    this.dusk = null;
    this.nominators.clear();
    this.nominees.clear();
    this.prompts = {};
    for (const p of this.players) {
      const prompt = this.promptFor(p);
      if (prompt) this.prompts[p.id] = prompt;
    }
    this.newChapter('night', this.night);
    this.setPhase('night', this.dur('nightMax'), now);

    if (this.night === 1) {
      this.shareEvilInfo();
      this.shareTwins();
    }
    this.announce(`Night ${this.night}. The lights dim. Everyone returns to their sleep pods...`, 'night');
    this.maybeResolve(now);
  }

  // The Stage Double and the good twin are told about each other.
  shareTwins() {
    if (!this.twin) return;
    const good = this.get(this.twin.good);
    const evil = this.get(this.twin.evil);
    this.tell(evil, `Your twin is ${good.name}, the ${ROLES[good.role].name}. If the crew airlocks ${good.name}, evil wins. And the crew cannot win while you both live.`, { kind: 'evil' });
    this.tell(good, `You have an EVIL TWIN: ${evil.name} is the Stage Double. If the crew airlocks YOU, evil wins. The crew cannot win while you both live, so they must airlock ${evil.name} first.`, { kind: 'twin' });
  }

  // Minion & Demon info, only in games of 7 or more (like Blood on the Clocktower).
  shareEvilInfo() {
    if (!this.evilInfoShared()) return;
    const parasite = this.players.find((p) => this.isDemon(p));
    const saboteurs = this.players.filter((p) => ROLES[p.role].type === 'saboteur');
    // The Method Actor thinks they are the Parasite and is shown made-up Saboteurs and the Parasite's bluffs.
    const actor = this.players.find((p) => p.role === 'actor');
    if (actor && parasite) {
      this.tell(parasite, `Your Method Actor is ${actor.name}. They believe they are the Parasite, and each night you will see who they aim at.`, { kind: 'evil' });
      const fake = st.sample(this.players.filter((o) => o !== actor), saboteurs.length, this.random);
      actor.fakeTeam = fake.map((o) => o.id);
      this.tell(actor, `Your Saboteurs: ${fake.map((s) => s.name).join(', ')}.`, { kind: 'evil' });
      this.tell(actor, `Safe bluffs (good roles NOT aboard): ${this.bluffs.map((r) => ROLES[r].name).join(', ')}.`, { kind: 'evil' });
    }
    for (const s of saboteurs) {
      const others = saboteurs.filter((o) => o !== s).map((o) => o.name);
      this.tell(s, `The Parasite is ${parasite.name}.${others.length ? ` Your fellow Saboteurs: ${others.join(', ')}.` : ''}`, { kind: 'evil' });
    }
    this.tell(parasite, `Your Saboteurs: ${saboteurs.map((s) => s.name).join(', ')}.`, { kind: 'evil' });
    this.tell(parasite, `Safe bluffs (good roles NOT aboard): ${this.bluffs.map((r) => ROLES[r].name).join(', ')}.`, { kind: 'evil' });
  }

  submitChoice(pid, targets, now = Date.now()) {
    if (this.phase !== 'night') throw new Error('It is not night.');
    if (this.blackbox && this.blackbox.id === pid && !this.blackbox.target) return this.submitBlackbox(pid, targets);
    const prompt = this.prompts[pid];
    if (!prompt) throw new Error('You have nothing to choose tonight. Draw something!');
    if (this.choices[pid]) throw new Error('You already chose tonight.');
    if (this.draft) throw new Error('Too late, dawn is coming.');
    // a once-per-game ability can be saved for another night: choose nobody
    if (prompt.once && Array.isArray(targets) && targets.length === 0) {
      this.choices[pid] = [];
      this.maybeResolve(now);
      return;
    }
    this.choices[pid] = this.checkTargets(pid, targets, prompt);
    const p = this.get(pid);
    if (prompt.once) p.used = true;
    if (prompt.notRepeat) p.lastPick = this.choices[pid][0];
    this.maybeResolve(now);
  }

  checkTargets(pid, targets, prompt) {
    if (!Array.isArray(targets) || targets.length !== prompt.choose) throw new Error(`Choose ${prompt.choose} player(s).`);
    if (new Set(targets).size !== targets.length) throw new Error('Choose different players.');
    for (const id of targets) {
      const t = this.get(id);
      if (!t) throw new Error('Unknown player.');
      if (prompt.target === 'alive' && !t.alive) throw new Error('Choose a living player.');
      if (prompt.target === 'dead' && t.alive) throw new Error('Choose a player who has died.');
      if (prompt.notSelf && id === pid) throw new Error('You cannot choose yourself.');
      if (prompt.notRepeat && this.get(pid)?.lastPick === id) throw new Error(`${t.name} was your choice last night. Pick someone else.`);
    }
    return [...targets];
  }

  allChosen() {
    return Object.keys(this.prompts).every((id) => this.choices[id]);
  }

  // Captain mode: show the Captain the night's results as soon as everyone chose.
  maybeResolve(now) {
    if (this.phase !== 'night' || this.draft) return;
    if (this.mode === 'captain' && !this.autoAdvance && this.allChosen()) this.resolveNight(now);
  }

  // Fill in a random choice for anyone who did not choose in time.
  fillMissingChoices() {
    for (const [pid, prompt] of Object.entries(this.prompts)) {
      if (this.choices[pid]) continue;
      if (prompt.once) {
        this.choices[pid] = []; // a once-per-game ability is never used by accident: it is saved for later
        continue;
      }
      const side = (t) => (prompt.target === 'any' ? true : prompt.target === 'dead' ? !t.alive : t.alive);
      const pool = this.players.filter((t) => side(t) && !(prompt.notSelf && t.id === pid) && !(prompt.notRepeat && this.get(pid).lastPick === t.id));
      const ids = pool.map((t) => t.id).filter((id) => !(ROLES[prompt.role].type === 'parasite' && id === pid));
      this.choices[pid] = st.sample(ids.length >= prompt.choose ? ids : pool.map((t) => t.id), prompt.choose, this.random);
      if (prompt.notRepeat) this.get(pid).lastPick = this.choices[pid][0];
      this.get(pid).notes.push({ text: 'You did not choose in time, so ARIA chose for you.', night: this.night, auto: true });
    }
  }

  resolveNight(now) {
    if (this.draft) return;
    this.fillMissingChoices();
    this.draft = this.computeDraft();
    const bb = this.draft.blackboxPending && this.get(this.draft.blackboxPending);
    if (bb) {
      this.blackbox = { id: bb.id, target: null, deadline: now + this.dur('blackbox') };
      this.tell(bb, 'You were killed in the night! Your Black Box still has power: choose a player to learn their role.', { kind: 'blackbox' });
    }
  }

  submitBlackbox(pid, targets) {
    const [targetId] = this.checkTargets(pid, targets, { choose: 1, target: 'any' });
    this.blackbox.target = targetId;
    const p = this.get(pid);
    const t = this.get(targetId);
    const truthful = !this.lies(p, this.draft.glitch);
    const role = truthful ? this.reg(t).role : st.pick(Object.keys(ROLES).filter((r) => r !== t.role), this.random);
    const text = `Black Box data: ${t.name} is the ${ROLES[role].name}.`;
    this.draft.messages.push({ to: pid, role: 'blackbox', text, truthful });
    this.draft.events.push({ k: 'blackbox', a: pid, t: targetId, text, truthful });
  }

  // Registration: what a player "shows up as" to other abilities tonight.
  // The Stowaway might look evil; the Mimic might look good. Cached per night so
  // the answers stay consistent.
  reg(p) {
    const key = `${this.night}:${p.id}`;
    if (this.regCache[key]) return this.regCache[key];
    const r = { evil: teamOf(p.role) === 'infiltrators', type: ROLES[p.role].type, role: p.role, demon: this.isDemon(p) };
    const flip = (policy, yes) => (policy === 'auto' ? this.random() < 0.5 : policy === yes);
    if (p.role === 'stowaway' && flip(this.regPolicy.stowaway, 'evil')) {
      r.evil = true;
      r.demon = this.random() < 0.4;
      r.type = r.demon ? 'parasite' : 'saboteur';
      r.role = r.demon ? this.demonRole() : st.pick(this.rolesOf('saboteur'), this.random);
    }
    if (p.role === 'mimic' && flip(this.regPolicy.mimic, 'good')) {
      const inPlay = new Set(this.players.map((o) => o.role));
      const options = [...this.rolesOf('crew'), ...this.rolesOf('drifter')].filter((x) => !inPlay.has(x) && x !== 'drunk');
      r.evil = false;
      r.role = st.pick(options.length ? options : this.rolesOf('crew'), this.random);
      r.type = ROLES[r.role].type;
    }
    this.regCache[key] = r;
    return r;
  }

  // The two nearest living neighbours (skipping the dead), excluding anyone dying tonight.
  aliveNeighbours(p, dying = []) {
    const n = this.players.length;
    const i = this.players.indexOf(p);
    const isAlive = (o) => o.alive && !dying.includes(o.id);
    const found = [];
    for (const step of [-1, 1]) {
      for (let k = 1; k < n; k++) {
        const o = this.players[(i + step * k + n * n) % n];
        if (o !== p && isAlive(o)) {
          if (!found.includes(o)) found.push(o);
          break;
        }
      }
    }
    return found;
  }

  // 1 of 2 players is a particular role of the given type.
  oneOfTwo(p, type, truthful) {
    const others = this.players.filter((o) => o !== p);
    let candidates = others.filter((o) => this.reg(o).type === type);
    if (type === 'saboteur' && !candidates.length) candidates = others.filter((o) => ROLES[o.role].type === 'saboteur');
    if (!truthful) {
      const options = this.rolesOf(type).filter((r) => ROLES[r].minPlayers <= this.players.length);
      if (type === 'drifter' && this.random() < 0.3) return { text: 'There are zero Drifters aboard.', zero: true };
      const pair = st.sample(others, 2, this.random);
      const role = st.pick(options, this.random);
      return { text: `One of ${pair[0].name} or ${pair[1].name} is the ${ROLES[role].name}.`, players: pair.map((x) => x.id), learned: role };
    }
    if (!candidates.length) return { text: type === 'drifter' ? 'There are zero Drifters aboard.' : 'Your scans found nothing.', zero: true };
    const target = st.pick(candidates, this.random);
    const decoy = st.pick(others.filter((o) => o !== target), this.random);
    const pair = st.shuffle([target, decoy], this.random);
    const role = this.reg(target).role;
    return { text: `One of ${pair[0].name} or ${pair[1].name} is the ${ROLES[role].name}.`, players: pair.map((x) => x.id), learned: role };
  }

  computeDraft() {
    const N = this.night;
    const d = { night: N, glitch: null, protectedId: null, deaths: [], messages: [], events: [], starpass: null, masters: {}, blackboxPending: null, story: null, anims: {} };
    const aliveRole = (role) => this.players.find((p) => p.alive && p.role === role);
    const believers = (role) => this.players.filter((p) => p.alive && p.believed === role);
    const choice = (p) => this.choices[p.id];
    const broken = (p) => this.broken(p, d.glitch);
    const lies = (p) => this.lies(p, d.glitch);
    const say = (p, role, text, truthful, extra = {}) => {
      d.messages.push({ to: p.id, ...extra, role, text, truthful });
      d.events.push({ k: 'info', a: p.id, role, text, truthful });
    };

    // Hacker glitches first, so the glitch affects everyone else tonight.
    const hacker = aliveRole('hacker');
    if (hacker && choice(hacker)) {
      d.glitch = { id: choice(hacker)[0], night: N };
      d.events.push({ k: 'hack', a: hacker.id, t: d.glitch.id });
    }

    // The Holo-Jester picks tomorrow's hallucinating player (a glitched Jester's projector fizzles).
    const jester = aliveRole('jester');
    if (jester && choice(jester)) {
      const t = choice(jester)[0];
      const works = !broken(jester);
      if (works) d.hallucinate = t;
      d.events.push({ k: 'hallucinate', a: jester.id, t, works });
    }

    // The Hexer curses a player: if they nominate tomorrow, they die. (The Hexer loses the power at 3 alive.)
    const hexer = aliveRole('hexer');
    if (hexer && choice(hexer)) {
      const t = choice(hexer)[0];
      const works = !broken(hexer) && this.aliveCount() > 3;
      if (works && t) d.hexed = t;
      d.events.push({ k: 'hex', a: hexer.id, t, works });
    }

    // First night information roles.
    if (N === 1) {
      for (const p of believers('comms')) {
        const info = this.oneOfTwo(p, 'crew', !lies(p));
        say(p, 'comms', info.text, !lies(p), info);
      }
      for (const p of believers('archivist')) {
        const info = this.oneOfTwo(p, 'drifter', !lies(p));
        say(p, 'archivist', info.text, !lies(p), info);
      }
      for (const p of believers('security')) {
        const info = this.oneOfTwo(p, 'saboteur', !lies(p));
        say(p, 'security', info.text, !lies(p), info);
      }
      for (const p of believers('navigator')) {
        const n = this.players.length;
        let pairs = 0;
        for (let i = 0; i < n; i++) if (this.reg(this.players[i]).evil && this.reg(this.players[(i + 1) % n]).evil) pairs++;
        const evilCount = this.players.filter((o) => teamOf(o.role) === 'infiltrators').length;
        const value = lies(p) ? st.otherNumber(pairs, Math.max(1, evilCount - 1), this.random) : pairs;
        say(p, 'navigator', `There ${value === 1 ? 'is 1 pair' : `are ${value} pairs`} of evil players sitting next to each other.`, !lies(p), { value });
      }
    }

    // The Palm Reader sees two roles for a player: one is real, one is a decoy from the other side.
    const goodSide = (r) => ['crew', 'drifter'].includes(ROLES[r].type);
    for (const p of believers('palmreader')) {
      const [t] = choice(p) || [];
      if (!t) continue;
      const target = this.get(t);
      const truth = this.reg(target).role;
      const pool = scriptOf(this.script).roles.filter((r) => r !== 'drunk' && r !== truth);
      let shown;
      if (lies(p)) shown = [st.pick(pool.filter(goodSide), this.random), st.pick(pool.filter((r) => !goodSide(r)), this.random)];
      else shown = [truth, st.pick(pool.filter((r) => goodSide(r) !== goodSide(truth)), this.random)];
      shown = st.shuffle(shown, this.random);
      say(p, 'palmreader', `Your palm reading of ${target.name}: the ${ROLES[shown[0]].name} or the ${ROLES[shown[1]].name}.`, !lies(p), { players: [t], shown });
    }

    // The Stagehand counts how many of two players were woken by their abilities tonight.
    for (const p of believers('stagehand')) {
      const picked = (choice(p) || []).map((id) => this.get(id));
      if (picked.length < 2) continue;
      const truth = picked.filter((o) => this.wakesTonight(o)).length;
      const value = lies(p) ? st.otherNumber(truth, 2, this.random) : truth;
      say(p, 'stagehand', `Backstage count for ${picked[0].name} & ${picked[1].name}: ${value} of them ${value === 1 ? 'was' : 'were'} woken tonight.`, !lies(p), { value, players: picked.map((o) => o.id) });
    }

    // Medic protects.
    for (const p of believers('medic')) {
      const [t] = choice(p) || [];
      if (!t) continue;
      const works = !broken(p);
      if (works) d.protectedId = t;
      d.events.push({ k: 'protect', a: p.id, t, works });
    }

    // The Lion Tamer guesses who the Parasite is: a right guess stops it tonight.
    for (const p of believers('liontamer')) {
      const [t] = choice(p) || [];
      if (!t) continue;
      const works = !broken(p);
      const hit = works && this.isDemon(this.get(t));
      if (hit && !d.tamed) d.tamed = p.id;
      d.events.push({ k: 'tame', a: p.id, t, works, hit });
    }

    // The Parasite strikes.
    const parasite = this.players.find((p) => p.alive && this.isDemon(p));
    d.parasiteId = parasite?.id || null;
    if (parasite && choice(parasite)) {
      const target = this.get(choice(parasite)[0]);
      const kill = (victim, result, extra = {}) => d.events.push({ k: 'kill', a: parasite.id, t: target.id, result, victim: victim?.id, ...extra });
      const safe = (p) => p.id === d.protectedId || (p.role === 'marine' && !broken(p));
      if (d.tamed) {
        const tamer = this.get(d.tamed);
        kill(null, 'tamed', { by: tamer.id });
        say(parasite, 'liontamer', `CRACK! ${tamer.name} is the Lion Tamer, and guessed who you are. You were stopped tonight.`, true);
      } else if (broken(parasite)) {
        kill(null, 'glitched');
      } else if (target === parasite) {
        // Jumping hosts: the Parasite dies and a Saboteur takes over.
        d.deaths.push({ id: parasite.id, cause: 'starpass' });
        const minions = this.players.filter((p) => p.alive && ROLES[p.role].type === 'saboteur');
        const heir = minions.find((p) => p.role === 'incubator') || st.pick(minions, this.random);
        d.starpass = heir ? { from: parasite.id, to: heir.id, role: parasite.role } : null;
        kill(parasite, 'starpass', { to: heir?.id });
      } else if (target.id === d.protectedId) {
        kill(null, 'protected');
      } else if (target.role === 'marine' && !broken(target)) {
        kill(null, 'marine');
      } else if (target.role === 'acrobat' && !target.netUsed && !broken(target)) {
        // the Acrobat's safety net: caught this time, and used up
        (d.netUsed ||= []).push(target.id);
        say(target, 'acrobat', 'Something struck at you in the night... and your safety net caught you! The net is used up now.', true);
        kill(null, 'net');
      } else if (target.role === 'firstofficer' && !broken(target) && this.random() < 0.5) {
        // The First Officer might be saved, with someone else dying instead.
        const others = this.alive().filter((p) => p !== parasite && p !== target);
        const swap = others.length ? st.pick(others, this.random) : null;
        if (swap && !safe(swap)) {
          d.deaths.push({ id: swap.id, cause: 'parasite' });
          kill(swap, 'bounced');
        } else {
          kill(null, 'bounced-safe');
        }
      } else {
        d.deaths.push({ id: target.id, cause: 'parasite' });
        kill(target, 'died');
      }
    }
    // The Method Actor's "kills" do nothing at all, but the real Parasite sees them.
    for (const p of this.players.filter((x) => x.alive && x.role === 'actor')) {
      const [t] = choice(p) || [];
      if (t && parasite) say(parasite, 'actor', `Your Method Actor, ${p.name}, aimed at ${this.name(t)} tonight. (Nothing happened. It never does.)`, true);
      d.events.push({ k: 'actor', a: p.id, t: t || null });
    }

    // The Knife Thrower's once-a-game knife ignores every kind of protection.
    for (const p of this.players.filter((x) => x.alive && x.role === 'knifethrower')) {
      const [t] = choice(p) || [];
      if (!t) continue;
      const works = !broken(p) && !d.deaths.some((x) => x.id === t);
      if (works) d.deaths.push({ id: t, cause: 'knife' });
      d.events.push({ k: 'knife', a: p.id, t, works });
    }

    // The Magician's once-a-game trick: a dead Crew member comes back.
    for (const p of believers('magician')) {
      const [t] = choice(p) || [];
      if (!t) continue;
      const target = this.get(t);
      const works = !broken(p) && !!target && !target.alive && ROLES[target.role].type === 'crew';
      if (works) d.revive = t;
      d.events.push({ k: 'revive', a: p.id, t, works });
    }

    const dying = d.deaths.map((x) => x.id);

    // A dead Hacker's glitch stops working at once, so later abilities tonight get true info.
    if (hacker && d.glitch && dying.includes(hacker.id)) {
      d.events.push({ k: 'unglitch', a: hacker.id, t: d.glitch.id });
      d.glitch = null;
    }

    // A Black Box (real or drunk) killed tonight wakes to check someone.
    const bb = dying.map((id) => this.get(id)).find((p) => p.believed === 'blackbox');
    if (bb) d.blackboxPending = bb.id;

    // Coroner learns who was airlocked today.
    if (N > 1 && this.executedYesterday) {
      const ex = this.get(this.executedYesterday);
      for (const p of believers('coroner')) {
        if (dying.includes(p.id)) continue;
        const truthful = !lies(p);
        const role = truthful ? this.reg(ex).role : st.pick(scriptOf(this.script).roles.filter((r) => r !== ex.role), this.random);
        say(p, 'coroner', `${ex.name}, who was airlocked today, was the ${ROLES[role].name}.`, truthful);
      }
    }

    // The Ticket Taker learns whether the Parasite voted today.
    if (N > 1) {
      for (const p of believers('tickettaker')) {
        if (dying.includes(p.id)) continue;
        const truth = this.votesToday.some((v) => v.voters.some((id) => this.isDemon(this.get(id))));
        const value = lies(p) ? !truth : truth;
        say(p, 'tickettaker', value ? 'The Parasite VOTED today.' : 'The Parasite did not vote today.', !lies(p), { value });
      }
    }

    // Engineer reads their two living neighbours.
    for (const p of believers('engineer')) {
      if (dying.includes(p.id)) continue;
      const truth = this.aliveNeighbours(p, dying).filter((o) => this.reg(o).evil).length;
      const value = lies(p) ? st.otherNumber(truth, 2, this.random) : truth;
      const names = this.aliveNeighbours(p, dying).map((o) => o.name).join(' & ');
      say(p, 'engineer', `${value} of your living neighbours (${names}) ${value === 1 ? 'is' : 'are'} evil.`, !lies(p), { value });
    }

    // Scanner checks two players for the Parasite.
    for (const p of believers('scanner')) {
      if (dying.includes(p.id)) continue;
      const targets = (choice(p) || []).map((id) => this.get(id));
      if (targets.length < 2) continue;
      const truth = targets.some((t) => this.reg(t).demon || t.id === this.redHerringId);
      const value = lies(p) ? !truth : truth;
      say(p, 'scanner', `Scan of ${targets[0].name} & ${targets[1].name}: ${value ? 'YES, a Parasite signal!' : 'no Parasite signal.'}`, !lies(p), { value, players: targets.map((t) => t.id) });
    }

    // Service Droid picks tomorrow's master.
    for (const p of this.players.filter((x) => x.alive && x.role === 'droid')) {
      const [t] = choice(p) || [];
      if (t) {
        d.masters[p.id] = t;
        d.events.push({ k: 'master', a: p.id, t });
      }
    }

    d.messages.sort((a, b) => (ROLES[a.role].night?.order ?? 99) - (ROLES[b.role].night?.order ?? 99));
    return d;
  }

  // Captain edits before dawn.
  editDraft(byId, { messageIndex, text, toggleDeath, story, anims } = {}) {
    this.requireController(byId);
    if (this.phase !== 'night' || !this.draft) throw new Error('Nothing to edit yet.');
    const d = this.draft;
    if (messageIndex != null && d.messages[messageIndex]) d.messages[messageIndex].text = String(text).slice(0, 300);
    if (toggleDeath) {
      const i = d.deaths.findIndex((x) => x.id === toggleDeath);
      if (i >= 0) d.deaths.splice(i, 1);
      else if (this.get(toggleDeath)?.alive) d.deaths.push({ id: toggleDeath, cause: 'captain' });
    }
    if (story != null) d.story = String(story).slice(0, 600);
    if (anims) for (const [id, anim] of Object.entries(anims)) if (DEATH_ANIMS.includes(anim)) d.anims[id] = anim;
  }

  draftReady() {
    return !!this.draft && !(this.blackbox && !this.blackbox.target);
  }

  applyDraft(now) {
    const d = this.draft;
    if (!d || !this.draftReady()) return;
    this.glitch = d.glitch;
    this.hexed = d.hexed ? { id: d.hexed } : null; // the Hexer's curse lasts through today
    for (const id of d.netUsed || []) this.get(id).netUsed = true;

    for (const m of d.messages) this.tell(this.get(m.to), m.text, { kind: m.role, auto: false });
    for (const [droid, master] of Object.entries(d.masters)) this.get(droid).master = master;
    this.chapter.events.push(...d.events);

    const deaths = [];
    for (const { id, cause } of d.deaths) {
      const p = this.get(id);
      if (!p.alive) continue;
      this.kill(p, cause);
      deaths.push({ id, cause, anim: d.anims[id] || st.nightDeathAnim(this.random) });
    }
    if (d.starpass && this.get(d.starpass.to)?.alive) {
      const heir = this.get(d.starpass.to);
      heir.role = d.starpass.role || 'parasite';
      heir.believed = heir.role;
      this.tell(heir, 'The Parasite abandoned its old host and crawled into YOU. You are now the Parasite!', { kind: 'evil' });
      this.ev({ k: 'become-parasite', a: heir.id, cause: 'starpass' });
    }

    // the Magician's trick (a dead Crew member comes back)
    const revived = [];
    const back = d.revive && this.get(d.revive);
    if (back && !back.alive) {
      this.revive(back);
      revived.push(back.id);
    }

    this.chapter.deaths = deaths;
    this.scoreDeathGuesses(deaths, d.parasiteId);
    this.logEvent({ k: 'dawn', deaths: deaths.map((x) => x.id), day: this.night });
    let story = d.story || st.dawnStory(deaths.map((x) => ({ name: this.name(x.id), bio: this.get(x.id)?.bio })), this.random, this.script);
    for (const id of revived) story += ` ${st.reviveStory(this.name(id), this.random)}`;
    this.chapter.story = story;
    this.dawn = { night: this.night, deaths, revived, story, at: now };
    if (d.hallucinate && !this.stats.hallucinated.includes(d.hallucinate)) this.stats.hallucinated.push(d.hallucinate);
    this.hallucination = d.hallucinate && this.get(d.hallucinate)?.alive
      ? { id: d.hallucinate, seed: Math.floor(this.random() * 1e9), clue: st.fakeClue(this, this.random) }
      : null;
    this.mimicManifest = this.manifest();
    this.draft = null;
    this.blackbox = null;

    // New day.
    this.day = this.night;
    this.tasksDone = {};
    this.drawings.forEach((dr) => (dr.published = true));
    const needed = this.chargeNeeded();
    if (this.charge >= needed) {
      this.clue = st.makeClue(this, this.random);
      this.charge = 0;
    } else {
      this.clue = null;
    }

    this.newChapter('day', this.day);
    this.announce((deaths.length ? `Dawn. ${deaths.map((x) => this.name(x.id)).join(' and ')} did not wake up.` : 'Dawn. Everyone survived the night.') + revived.map((id) => ` ✨ ${this.name(id)} is back from the dead!`).join(''), 'dawn');
    this.checkWin();
    this.setPhase('dawn', this.dur('dawn'), now);
  }

  // ---------------------------------------------------------------------------
  // Death and winning
  // ---------------------------------------------------------------------------

  // The Magician's trick: someone who died comes back to life (and keeps their role).
  revive(p) {
    p.alive = true;
    p.ghostVote = false;
    delete this.predictions[p.id];
    this.ev({ k: 'revived', id: p.id });
    this.logEvent({ k: 'revive', id: p.id });
    this.tell(p, 'A top-hatted figure waved a wand... and you are BACK from the dead!', { kind: 'magician' });
  }

  kill(p, cause) {
    if (!p.alive) return;
    const aliveBefore = this.aliveCount();
    p.alive = false;
    p.ghostVote = true;
    this.ev({ k: 'death', id: p.id, cause });
    this.ready.delete(p.id);
    if (this.block?.id === p.id) this.block = null; // whoever was heading for the airlock died another way first

    // The Clown's last act: a pie in someone's face (if it lands on a villain, the crew loses).
    if (p.role === 'clown' && !this.broken(p) && !this.winner) {
      this.wish = { id: p.id, role: 'clown', until: null };
      this.announce(`🥧 ${p.name} was the Clown! One last pie to throw...`, 'death');
    }

    // The Hacker's glitch ends when the Hacker dies.
    if (p.role === 'hacker') this.glitch = null;

    // Incubator (Scarlet Woman) takes over if the Parasite dies with 5+ alive.
    if (this.isDemon(p) && cause !== 'starpass' && aliveBefore >= 5) {
      const inc = this.players.find((o) => o.alive && o.role === 'incubator' && !this.isGlitched(o));
      if (inc) {
        inc.role = p.role;
        inc.believed = p.role;
        this.tell(inc, 'The Parasite is dead... but its spawn hatches inside YOU. You are now the Parasite!', { kind: 'evil' });
        this.ev({ k: 'become-parasite', a: inc.id, cause: 'incubator' });
      }
    }
  }

  // ---- the Clown's pie ----

  chooseWish(pid, targetId, now = Date.now()) {
    const w = this.wish;
    if (!w || w.id !== pid) throw new Error('You have no pie to throw.');
    const target = this.get(targetId);
    if (!target || !target.alive || target.id === pid) throw new Error('Pick a living player.');
    this.resolveWish(target, now, false);
  }

  resolveWish(target, now, random) {
    const clown = this.get(this.wish.id);
    this.wish = null;
    const evil = teamOf(target.role) === 'infiltrators';
    this.ev({ k: 'pie', a: clown.id, t: target.id, evil, random });
    this.logEvent({ k: 'pie', a: clown.id, t: target.id, evil, random });
    const how = random ? 'The pie flies wild and lands on' : 'The pie sails across the bridge and lands on';
    if (evil) {
      this.announce(`🥧 ${how} ${target.name}... and ${target.name} was EVIL! The crowd cheers for the villain!`, 'death');
      this.finish('infiltrators', `${clown.name} the Clown threw a pie at ${target.name}, and it was an infiltrator! The crowd goes wild for the wrong team.`);
      this.dusk = { id: null, cause: 'pie', story: `${clown.name}'s pie lands on ${target.name}. A hush falls over the big top. Then a villainous laugh.` };
      this.setPhase('dusk', this.dur('dusk'), now);
    } else {
      this.announce(`🥧 ${how} ${target.name}! A direct hit. ${target.name} wipes off the custard. (They are good. Phew.)`, 'vote');
    }
  }

  // A Clown who never picks gets a random pie after a while.
  tickWish(now) {
    const w = this.wish;
    if (!w || this.winner || this.phase === 'ended' || this.pausedRemaining != null) return false;
    if (w.until == null) {
      w.until = now + this.dur('wish');
      return true; // tell the Clown's screen when the pie flies on its own
    }
    if (now < w.until) return false;
    const pool = this.players.filter((p) => p.alive && p.id !== w.id);
    if (!pool.length) {
      this.wish = null;
      return true;
    }
    this.resolveWish(st.pick(pool, this.random), now, true);
    return true;
  }

  finish(winner, reason) {
    if (this.winner) return true;
    this.wish = null;
    this.winner = winner;
    this.winReason = reason;
    this.history.push({ k: 'end', winner, reason });
    this.awards = this.computeAwards();
    this.endedAt = Date.now();
    this.updateSeason();
    return true;
  }

  // Everyone who was the Parasite at any point this game (it can jump hosts).
  parasiteIds() {
    const ids = new Set(this.players.filter((p) => this.isDemon(p)).map((p) => p.id));
    const setup = this.history.find((h) => h.k === 'setup');
    for (const [id, r] of Object.entries(setup?.roles || {})) if (ROLES[r]?.type === 'parasite') ids.add(id);
    for (const ch of this.history) for (const e of ch.events || []) if (e.k === 'become-parasite') ids.add(e.a);
    return ids;
  }

  // The evening's running scores: 3 points a win, 1 per award.
  updateSeason() {
    if (this.seasonCounted) return;
    this.seasonCounted = true;
    this.season.games += 1;
    const deaths = {};
    for (const ch of this.history) for (const e of ch.events || []) if (e.k === 'death') deaths[e.id] = e.cause;
    for (const p of this.players.filter((x) => x.role)) {
      const key = p.name.toLowerCase();
      const row = (this.season.rows[key] ||= { name: p.name, games: 0, wins: 0, eaten: 0, airlocked: 0, awards: 0, liar: 0, psychic: 0, guesses: 0, points: 0 });
      row.guesses = (row.guesses || 0) + (this.guessScore[p.id] || 0);
      row.name = p.name;
      row.games += 1;
      if (teamOf(p.role) === this.winner) row.wins += 1;
      if (deaths[p.id] === 'parasite') row.eaten += 1;
      if (deaths[p.id] === 'airlock' || deaths[p.id] === 'sentinel') row.airlocked += 1;
      const mine = (this.awards || []).filter((a) => a.id === p.id);
      row.awards += mine.length;
      row.liar += mine.filter((a) => a.title === 'Best Liar').length;
      row.psychic += mine.filter((a) => a.title === 'Psychic').length;
      row.points = row.wins * 3 + row.awards + row.guesses; // a correct "who dies tonight?" guess is a point
    }
  }

  seasonView() {
    if (!this.season.games) return null;
    const rows = Object.values(this.season.rows).sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));
    return { games: this.season.games, rows };
  }

  // The last words that got the biggest reaction (laughs count double).
  bestLastWords() {
    const score = (w) => w.laughs * 2 + w.reactions;
    return this.lastWordsLog.slice().sort((a, b) => score(b) - score(a) || b.day - a.day)[0] || null;
  }

  // Silly end-of-game awards, from what actually happened.
  computeAwards() {
    const s = this.stats;
    const players = this.players.filter((p) => p.role);
    const n = (map, p) => (p ? map[p.id] || 0 : 0);
    const most = (map, min, filter = () => true) => {
      let top = null;
      for (const p of players) if (filter(p) && n(map, p) >= min && (!top || n(map, p) > n(map, top))) top = p;
      return top;
    };
    const evil = (p) => teamOf(p.role) === 'infiltrators';
    const out = [];
    const add = (p, icon, title, why) => p && out.push({ id: p.id, icon, title, why });
    // Best Liar: the evil player the crew trusted most
    const liars = players.filter(evil).sort((a, b) => n(s.yesReceived, a) - n(s.yesReceived, b) || Number(b.alive) - Number(a.alive));
    if (liars[0]) add(liars[0], '🎭', 'Best Liar', `${n(s.yesReceived, liars[0])} YES vote${n(s.yesReceived, liars[0]) === 1 ? '' : 's'} against them all game, as ${ROLES[liars[0].role].name.startsWith('The ') ? ROLES[liars[0].role].name : `the ${ROLES[liars[0].role].name}`}.`);
    const sharp = most(s.yesOnEvil, 1, (p) => !evil(p));
    add(sharp, '🕵️', 'Sharpest Eye', `Voted to airlock evil ${n(s.yesOnEvil, sharp)} time${n(s.yesOnEvil, sharp) === 1 ? '' : 's'}.`);
    const wrong = most(s.yesOnGood, 2, (p) => !evil(p));
    add(wrong, '🤦', 'Wrong Every Time', `Voted to airlock good crewmates ${n(s.yesOnGood, wrong)} times.`);
    const sus = most(s.yesReceived, 2);
    add(sus, '👀', 'Most Suspicious', `${n(s.yesReceived, sus)} YES votes against them.`);
    const trigger = most(s.nominations, 2);
    add(trigger, '☝️', 'Trigger Happy', `Nominated ${n(s.nominations, trigger)} people.`);
    const chatty = most(s.chat, 5);
    add(chatty, '🗣️', 'Chatterbox', `${n(s.chat, chatty)} messages sent.`);
    if (players.length >= 4) {
      const quiet = players.slice().sort((a, b) => n(s.chat, a) - n(s.chat, b))[0];
      if (quiet && quiet !== chatty && n(s.chat, quiet) <= 3) add(quiet, '🤐', 'Strong Silent Type', `Only ${n(s.chat, quiet)} message${n(s.chat, quiet) === 1 ? '' : 's'} all game.`);
    }
    const worker = most(s.tasks, 2);
    add(worker, '🛠️', 'Hardest Worker', `${n(s.tasks, worker)} tasks done.`);
    for (const id of s.hallucinated) add(this.get(id), '🦆', 'Talked to the Ducks', 'Saw things that were not there (thanks, Holo-Jester).');
    // Psychic: the ghost who first bet on the Parasite (and stuck with it)
    const parasites = this.parasiteIds();
    const psychic = Object.entries(this.predictions).filter(([, b]) => parasites.has(b.id)).sort((a, b) => a[1].since - b[1].since)[0];
    if (psychic) add(this.get(psychic[0]), '👻', 'Psychic', `Called it from beyond the grave: bet on ${this.name(psychic[1].id)} on day ${psychic[1].day || 1}.`);
    const seer = most(this.guessScore, 2);
    add(seer, '🔮', 'Clairvoyant', `Guessed who would die (or that nobody would) ${n(this.guessScore, seer)} nights.`);
    const spooky = most(s.haunts, 2);
    add(spooky, '🎃', 'Poltergeist', `Haunted the ship ${n(s.haunts, spooky)} times.`);
    return out;
  }

  // A one-line summary of a finished game, for the play stats file.
  summary() {
    return {
      at: new Date().toISOString(),
      mode: this.mode,
      players: this.players.length,
      winner: this.winner,
      days: this.day,
      minutes: this.startedAt ? Math.round(((this.endedAt || Date.now()) - this.startedAt) / 600) / 100 : null,
      script: this.script,
      roles: this.players.map((p) => p.role),
      survivors: this.players.filter((p) => p.alive).map((p) => p.role),
    };
  }

  // ---------------------------------------------------------------------------
  // Claims: say publicly which role you are (truthfully or not)
  // ---------------------------------------------------------------------------

  setClaim(pid, role, text) {
    if (!this.get(pid)) throw new Error('Only players can claim.');
    if (this.phase === 'lobby') throw new Error('Wait for the game to start.');
    if (role && !ROLES[role]) throw new Error('Unknown role.');
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const before = this.claims[pid];
    if (!role && !clean) delete this.claims[pid];
    else this.claims[pid] = { role: role || null, text: clean, at: Date.now() };
    if (role && role !== before?.role) this.logEvent({ k: 'claim', id: pid, role });
  }

  noteChat(pid) {
    if (this.phase !== 'lobby' && this.get(pid)) this.bump('chat', pid);
  }

  // ---------------------------------------------------------------------------
  // The Captain's fun: ship-wide events
  // ---------------------------------------------------------------------------

  shipEventStart(byId, kind, now = Date.now()) {
    this.requireController(byId);
    const seconds = { zerog: 25, disco: 25, alarm: 8, confetti: 6 }[kind];
    if (!seconds) throw new Error('Unknown ship event.');
    this.shipEvent = { kind, until: now + seconds * 1000 };
  }

  checkWin() {
    if (this.winner) return true;
    const alive = this.alive();
    const demonDead = !alive.some((p) => this.isDemon(p));
    if (demonDead && !this.twinsAlive()) {
      return this.finish('crew', 'The Parasite is dead! The crew fires the engines and breaks free of the black hole.');
    }
    if (alive.length <= 2) {
      return this.finish('infiltrators', demonDead
        ? 'Only two remain. The Parasite is gone, but the Stage Double and their twin are still on stage, and the show goes on without the crew.'
        : 'Only two remain. The Parasite steers the ship into the black hole. There is no more space.');
    }
    return false;
  }

  // The Stage Double and their good twin both live: the crew cannot win yet.
  twinsAlive() {
    if (!this.twin) return false;
    const good = this.get(this.twin.good);
    const evil = this.get(this.twin.evil);
    return !!good?.alive && !!evil?.alive && !this.isGlitched(evil);
  }

  end(now) {
    this.phase = 'ended';
    this.phaseEndsAt = null;
    this.phaseStartedAt = now;
    this.announce(this.winReason, 'end');
  }

  // ---------------------------------------------------------------------------
  // Day
  // ---------------------------------------------------------------------------

  beginRoam(now) {
    this.setPhase('roam', this.dur('roam'), now);
    this.activeFloor = now;
    this.afk.clear();
    this.visits = {};
    // clues drift past at a random moment while everyone is exploring
    const when = () => now + Math.round(this.dur('roam') * (0.3 + this.random() * 0.35));
    if (this.clue) this.scheduleClue(this.clue, when());
    if (this.hallucination) this.scheduleClue(this.hallucination.clue, this.clue?.at ?? when());
    this.announce(`Day ${this.day}. Explore the ship, do tasks and whisper with crewmates.`, 'day');
  }

  beginMeeting(now) {
    this.setPhase('meeting', this.dur('meeting'), now);
    this.announce('EMERGENCY MEETING. Everyone to the bridge!', 'meeting');
  }

  beginNominations(now) {
    this.setPhase('nominations', this.dur('nominations'), now);
    this.votesToday = [];
    this.announce('Nominations are open. Who should be airlocked?', 'meeting');
  }

  canVote(p) {
    return p.alive || p.ghostVote;
  }

  nominate(aId, bId, now = Date.now()) {
    if (this.phase !== 'nominations') throw new Error('Nominations are not open.');
    if (this.nomination) throw new Error('Wait for the current vote to finish.');
    const a = this.get(aId);
    const b = this.get(bId);
    if (!a || !a.alive) throw new Error('Dead players cannot nominate.');
    if (!b || !b.alive) throw new Error('Nominate a living player.');
    if (this.nominators.has(aId)) throw new Error('You already nominated today.');
    if (this.nominees.has(bId)) throw new Error(`${b.name} was already nominated today.`);
    this.nominators.add(aId);
    this.nominees.add(bId);
    this.ready.clear(); // a new accusation is worth talking about
    this.announce(`${a.name} nominates ${b.name}!`, 'nominate');

    // The Hexer's curse: a hexed player who nominates dies (the nomination still counts).
    const hexer = this.players.find((x) => x.alive && x.role === 'hexer');
    if (this.hexed && this.hexed.id === aId && hexer && this.aliveCount() > 3) {
      this.hexed = null;
      this.ev({ k: 'hexed', id: aId, by: hexer.id });
      this.announce(`💥 ${a.name} was HEXED! The nomination goes ahead, but ${a.name} vanishes in a puff of purple smoke.`, 'death');
      this.logEvent({ k: 'hex', id: aId });
      this.kill(a, 'hex');
      this.checkWin();
      if (this.winner) {
        this.nomination = null;
        this.dusk = { id: a.id, cause: 'hex', anim: 'confetti', story: `${a.name} nominates ${b.name}, and the Hexer's curse finishes the job. Poof.` };
        this.setPhase('dusk', this.dur('dusk'), now);
        return;
      }
    }

    // Sentinel (Virgin): zaps a Crew nominator, once.
    if (b.role === 'sentinel' && !b.used) {
      b.used = true;
      if (!this.isGlitched(b) && this.reg(a).type === 'crew') {
        this.ev({ k: 'sentinel', a: aId, t: bId });
        this.announce(`The floor crackles... the ship's defences seize ${a.name}!`, 'death');
        this.execute(a, now, 'sentinel');
        return;
      }
    }

    // Votes go clockwise, starting after the nominee and ending with them.
    const n = this.players.length;
    const start = this.players.indexOf(b);
    const order = [];
    for (let k = 1; k <= n; k++) order.push(this.players[(start + k) % n].id);
    // hands: who votes YES; cast: who has made up their mind (YES or NO). Votes can be
    // cast from the moment of the nomination and changed until the count starts.
    this.nomination = { nominator: aId, nominee: bId, stage: 'accuse', stageEndsAt: now + this.dur('accuse'), order, hands: {}, cast: {}, locked: {}, index: -1 };
  }

  // Players whose vote we wait for before counting early (connected and able to vote).
  ballotVoters() {
    return this.players.filter((p) => p.connected && this.canVote(p));
  }

  everyoneVoted() {
    const nom = this.nomination;
    return !!nom && this.ballotVoters().every((p) => nom.cast[p.id]);
  }

  setHand(pid, up) {
    const nom = this.nomination;
    if (!nom) throw new Error('No vote right now.');
    const p = this.get(pid);
    if (!p || !this.canVote(p)) throw new Error('You have no vote left.');
    if (nom.stage === 'count') throw new Error('The votes are being counted.');
    nom.hands[pid] = !!up;
    nom.cast[pid] = true;
  }

  // Nominator or nominee (or someone giving their last words) can finish speaking early.
  doneSpeaking(pid, now) {
    if (this.phase === 'lastwords' && this.lastWords && (pid === this.lastWords.id || this.isController(pid))) {
      this.finishLastWords(now);
      return;
    }
    const nom = this.nomination;
    if (!nom) return;
    if ((nom.stage === 'accuse' && pid === nom.nominator) || (nom.stage === 'defend' && pid === nom.nominee) || (nom.stage !== 'count' && this.isController(pid))) {
      nom.stageEndsAt = now;
      this.tickNomination(now);
    }
  }

  tickNomination(now) {
    const nom = this.nomination;
    if (!nom) return false;
    // the ballot closes early once everyone has voted
    if (nom.stage === 'vote' && now < nom.stageEndsAt && this.everyoneVoted()) nom.stageEndsAt = now;
    if (now < nom.stageEndsAt) return false;
    if (nom.stage === 'accuse') {
      nom.stage = 'defend';
      nom.stageEndsAt = now + this.dur('defend');
      return true;
    }
    if (nom.stage === 'defend') {
      nom.stage = 'vote';
      nom.stageEndsAt = now + this.dur('ballot');
      return true;
    }
    if (nom.stage === 'vote') {
      nom.stage = 'count';
      nom.index = 0;
      nom.stageEndsAt = now + 800;
      return true;
    }
    // The clock hand reaches the next voter and reveals their vote.
    const id = nom.order[nom.index];
    nom.locked[id] = true;
    nom.index += 1;
    if (nom.index >= nom.order.length) this.tally(now);
    else nom.stageEndsAt = now + this.dur('voteStep');
    return true;
  }

  tally(now) {
    const nom = this.nomination;
    const voters = [];
    const ignored = [];
    for (const id of nom.order) {
      const p = this.get(id);
      if (!nom.hands[id] || !this.canVote(p)) continue;
      // A living Service Droid's vote only counts if their master voted too (the dead lose their abilities).
      if (p.role === 'droid' && p.alive && p.master && !this.isGlitched(p) && !nom.hands[p.master]) {
        ignored.push(id);
        continue;
      }
      voters.push(id);
    }
    for (const id of voters) {
      const p = this.get(id);
      if (!p.alive) p.ghostVote = false;
    }
    const votes = voters.length;
    const threshold = Math.ceil(this.aliveCount() / 2);
    let result = 'safe';
    if (votes >= threshold) {
      if (!this.block || votes > this.block.votes) {
        this.block = { id: nom.nominee, votes };
        result = 'block';
      } else if (votes === this.block.votes) {
        this.block = { id: null, votes };
        result = 'tie';
      }
    }
    const nominee = this.get(nom.nominee);
    if (this.isDemon(nominee)) this.lastParasiteVotes = Math.max(this.lastParasiteVotes, votes);
    this.lastNomination = { nominator: nom.nominator, nominee: nom.nominee, voters, ignored, votes, threshold, result, at: now };
    this.votesToday.push(this.lastNomination);
    this.logEvent({ k: 'vote', a: nom.nominator, t: nom.nominee, voters, votes, threshold, result });
    const nomineeEvil = teamOf(nominee.role) === 'infiltrators';
    for (const id of voters) this.bump(nomineeEvil ? 'yesOnEvil' : 'yesOnGood', id);
    this.bump('nominations', nom.nominator);
    this.bump('yesReceived', nom.nominee, votes);
    this.ev({ k: 'nomination', a: nom.nominator, t: nom.nominee, voters, votes, threshold, result });
    const outcome = {
      block: `${nominee.name} has ${votes} votes and is heading for the airlock!`,
      tie: `Tied at ${votes} votes. Nobody is heading for the airlock... yet.`,
      safe: `${votes} vote${votes === 1 ? '' : 's'} (needed ${Math.max(threshold, (this.block?.votes || 0) + 1)}). ${nominee.name} is safe for now.`,
    }[result];
    this.announce(outcome, 'vote');
    this.nomination = null;
  }

  gunnerShot(aId, tId, now = Date.now()) {
    if (!DAY_PHASES.includes(this.phase)) throw new Error('You can only shoot during the day.');
    const a = this.get(aId);
    const t = this.get(tId);
    if (!a || !a.alive || a.believed !== 'gunner') throw new Error('You are not the Gunner.');
    if (a.used) throw new Error('Your one shot is spent.');
    if (!t || !t.alive) throw new Error('Pick a living player.');
    a.used = true;
    const hit = a.role === 'gunner' && !this.isGlitched(a) && this.reg(t).demon;
    this.ev({ k: 'shot', a: aId, t: tId, hit });
    this.logEvent({ k: 'shot', a: aId, t: tId, hit });
    if (!hit) {
      this.announce(`${a.name} fires at ${t.name}! ...The plasma fizzles. Nothing happens.`, 'shot');
      return { hit };
    }
    this.announce(`${a.name} fires at ${t.name}! ${t.name} is vaporised!`, 'death');
    this.kill(t, 'shot');
    this.checkWin();
    if (this.winner) {
      this.dusk = { id: t.id, cause: 'shot', anim: 'shot', story: `${a.name}'s plasma bolt finds its mark. Something inhuman shrieks.` };
      this.setPhase('dusk', this.dur('dusk'), now);
    }
    return { hit };
  }

  beginDusk(now) {
    if (this.nomination) throw new Error('Finish the current vote first.');
    const victim = this.block?.id ? this.get(this.block.id) : null;
    if (victim?.alive) {
      // a spotlight and 15 seconds for their last words, then the airlock
      this.lastWords = { id: victim.id };
      this.setPhase('lastwords', this.dur('lastwords'), now);
      this.announce(`🎤 ${victim.name} is walked to the airlock. Any last words?`, 'dusk');
      return;
    }
    this.ev({ k: 'noexec' });
    this.announce('Nobody is airlocked today.', 'dusk');
    this.logEvent({ k: 'noexec' });
    const fo = this.players.find((p) => p.alive && p.role === 'firstofficer');
    if (this.aliveCount() === 3 && fo && !this.isGlitched(fo)) {
      this.finish('crew', `Three survivors and no airlocking: First Officer ${fo.name} takes the helm and pulls the ship free!`);
    }
    this.dusk = { id: null, cause: null, story: 'The crew stares at each other in silence as the lights go down.' };
    if (!this.winner && this.reflectionAlive()) {
      this.finish('infiltrators', 'A whole day passed and nobody was airlocked. The Reflection smiles in every mirror: the show goes on without the crew.');
      this.dusk.story = 'Nobody is airlocked. In the glass of every window, something smiles back.';
    }
    this.setPhase('dusk', this.dur('dusk'), now);
  }

  finishLastWords(now) {
    const victim = this.get(this.lastWords?.id);
    this.lastWords = null;
    if (victim?.alive) this.execute(victim, now, 'airlock');
    else this.beginDusk(now);
  }

  execute(p, now, cause) {
    // The Acrobat's safety net catches them the first time (unless the net has a hole in it).
    if (p.role === 'acrobat' && !p.netUsed && !this.broken(p) && cause !== 'sentinel') {
      p.netUsed = true;
      const saved = `${p.name} is sent out of the airlock... and bounces back off a safety net, unharmed! The Acrobat takes a bow.`;
      this.ev({ k: 'net', id: p.id, votes: this.block?.votes || 0, story: saved });
      this.executedToday = p.id;
      this.announce(`${p.name} is airlocked... but a safety net catches them! ${p.name} is the Acrobat, and still alive!`, 'vote');
      this.logEvent({ k: 'net', id: p.id, votes: this.block?.votes || 0 });
      this.dusk = { id: p.id, cause: 'net', anim: null, survived: true, story: saved };
      this.setPhase('dusk', this.dur('dusk'), now);
      return;
    }
    const story = cause === 'sentinel' ? `${p.name} is fried by the Sentinel's defences and swept out of the airlock.` : st.executionStory(p.name, this.random, p.bio, this.script);
    this.ev({ k: 'execute', id: p.id, cause, votes: this.block?.votes || 0, story });
    this.kill(p, cause === 'sentinel' ? 'sentinel' : 'airlock');
    this.executedToday = p.id;
    this.announce(`${p.name} is airlocked.`, 'death');
    this.logEvent({ k: cause === 'sentinel' ? 'sentinel' : 'airlock', id: p.id, votes: this.block?.votes || 0 });
    if (p.role === 'ambassador' && !this.isGlitched(p)) {
      this.finish('infiltrators', `${p.name} was the Ambassador! Diplomatic incident: the galaxy declares war on the crew.`);
    }
    if (this.twin && p.id === this.twin.good) {
      const double = this.get(this.twin.evil);
      if (double?.alive && !this.isGlitched(double)) {
        this.finish('infiltrators', `${p.name} was the Good Twin! The crew airlocked the wrong twin, and the Stage Double takes over the show.`);
      }
    }
    this.checkWin();
    this.dusk = { id: p.id, cause, anim: 'airlock', story };
    this.setPhase('dusk', this.dur('dusk'), now);
  }

  // ---------------------------------------------------------------------------
  // ⚡ Ship systems: once-per-game day abilities that only work online, using
  // the live rooms, chat and 3D ship. The Space Drunk and glitched players
  // get duds that look like they worked.
  // ---------------------------------------------------------------------------

  systemFor(p) {
    return p ? ROLES[p.believed]?.system || null : null;
  }

  blackout(now = Date.now()) {
    return now < (this.systems?.blackoutUntil || 0);
  }

  // Remember who has been inside each room today (for the Archivist's door logs).
  recordVisit(pid, room, now = Date.now()) {
    if (this.phase !== 'roam' || !ROOM_NAMES[room] || this.blackout(now)) return;
    (this.visits[room] ||= new Set()).add(pid);
  }

  activeLockdown(room, now = Date.now()) {
    return this.systems.lockdowns.find((l) => l.room === room && l.works && now < l.until) || null;
  }

  // ---------------------------------------------------------------------------
  // 🔒 Private door locks: anyone exploring can lock the room they are in so
  // nobody else walks in or listens at the door. It only exists for private
  // chats (two or more people inside), lasts 90 seconds at most, and the
  // people inside can open it from within, or let a knocker in.
  // ---------------------------------------------------------------------------

  privateLock(room, now = Date.now()) {
    return this.systems.lockdowns.find((l) => l.private && !l.ended && l.room === room && now < l.until) || null;
  }

  // here: the room the player stands in; occupants: who is in it right now (the server knows, from live positions).
  lockRoom(pid, { here, occupants = [] } = {}, now = Date.now()) {
    const p = this.get(pid);
    if (!p) throw new Error('Only players can lock doors.');
    if (this.phase !== 'roam') throw new Error('Doors only lock while you are exploring the ship.');
    if (this.pausedRemaining != null) throw new Error('The game is paused.');
    if (!p.alive) throw new Error('Ghosts cannot work the doors.');
    if (here === 'bridge') throw new Error('The bridge cannot be locked: everyone needs it for meetings.');
    if (!ROOM_NAMES[here]) throw new Error('Stand inside a room first (not a corridor).');
    if (this.activeLockdown(here, now)) throw new Error('This room is already locked.');
    const inside = [...new Set([pid, ...occupants])].filter((id) => this.get(id));
    if (inside.length < 2) throw new Error('Locking is for private chats: wait until someone is in here with you.');
    if (this.systems.lockdowns.some((l) => l.private && !l.ended && l.by === pid && now < l.until)) throw new Error('You already locked a door. Unlock it first.');
    const ready = this.systems.lockReady[pid] || 0;
    if (now < ready) throw new Error(`The lock is recharging: ${Math.ceil((ready - now) / 1000)} more seconds.`);
    if (this.systems.lockdowns.filter((l) => l.private && !l.ended && now < l.until).length >= MAX_PRIVATE_LOCKS) throw new Error('Too many doors are locked already. Try again in a minute.');
    const lock = { room: here, until: now + LOCK_SECONDS * 1000, allowed: inside, by: pid, works: true, private: true, since: now, ended: null, thinSince: null };
    this.systems.lockdowns.push(lock);
    return lock;
  }

  releaseLock(lock, now, why) {
    lock.until = Math.min(lock.until, now);
    lock.ended = why;
    this.systems.lockReady[lock.by] = now + LOCK_COOLDOWN_SECONDS * 1000;
  }

  // Anyone the door was locked around can open it from inside.
  unlockRoom(pid, { here } = {}, now = Date.now()) {
    const lock = this.privateLock(here, now);
    if (!lock) throw new Error('This room is not locked.');
    if (!lock.allowed.includes(pid)) throw new Error('Only the people inside can unlock it.');
    this.releaseLock(lock, now, 'unlocked');
    return lock;
  }

  // Let someone who knocked in (or anyone else): they can now walk in and hear.
  admit(pid, targetId, { here } = {}, now = Date.now()) {
    const lock = this.privateLock(here, now);
    if (!lock) throw new Error('This room is not locked.');
    if (!lock.allowed.includes(pid)) throw new Error('Only the people inside can open the door.');
    if (!this.get(targetId)) throw new Error('Unknown player.');
    if (!lock.allowed.includes(targetId)) lock.allowed.push(targetId);
    return lock;
  }

  // A knock on a locked door. Returns the lock; the server tells the people inside.
  knock(pid, roomId, now = Date.now()) {
    if (!this.get(pid)) throw new Error('Only players can knock.');
    if (this.phase !== 'roam') throw new Error('Nobody is behind a door right now.');
    const lock = this.privateLock(roomId, now);
    if (!lock) throw new Error('That door is not locked.');
    if (lock.allowed.includes(pid)) throw new Error('You are allowed in already.');
    const key = `${pid}>${roomId}`;
    if (now - (this.systems.knocked[key] || 0) < KNOCK_GAP_MS) throw new Error('You just knocked. Give them a moment.');
    this.systems.knocked[key] = now;
    return lock;
  }

  // Called a few times a second with a function giving who is inside each room now. Locks end when their
  // time is up, or when fewer than two of the people they were locked around are still inside (after a short
  // grace, so stepping out for a second doesn't matter). Returns the locks that just ended.
  sweepLocks(presentIn, now = Date.now()) {
    const ended = [];
    for (const l of this.systems.lockdowns) {
      if (!l.private || l.ended) continue;
      if (now >= l.until) {
        this.releaseLock(l, now, 'time');
        ended.push(l);
        continue;
      }
      const inside = presentIn(l.room).filter((id) => l.allowed.includes(id));
      if (inside.length >= 2) l.thinSince = null;
      else {
        l.thinSince ??= now;
        if (now - l.thinSince >= LOCK_GRACE_MS) {
          this.releaseLock(l, now, 'empty');
          ended.push(l);
        }
      }
    }
    return ended;
  }

  // Who is secretly listening to this room right now. (A Security Chief's lockdown keeps listeners out;
  // an ordinary private lock does not: it keeps people out, not the Comms Officer's intercept.)
  listeners(room, now = Date.now()) {
    const lock = this.activeLockdown(room, now);
    if (lock && !lock.private) return [];
    return this.systems.intercepts.filter((i) => i.room === room && i.works && now < i.until && this.get(i.by)?.alive).map((i) => i.by);
  }

  disguiseOf(pid, now = Date.now()) {
    const d = this.systems.disguises[pid];
    return d && now < d.until && this.get(pid)?.alive ? d.as : null;
  }

  // args: { room, target, text } from the player, plus { here, occupants } filled in by the server
  // from live positions: the room the user stands in, and who is in the chosen room.
  useSystem(pid, args = {}, now = Date.now()) {
    const p = this.get(pid);
    const sys = this.systemFor(p);
    if (!sys) throw new Error('Your role has no ship system.');
    if (!p.alive) throw new Error('The dead cannot use ship systems.');
    if (p.systemUsed) throw new Error(`You already used ${sys.name}.`);
    if (!sys.phases.includes(this.phase)) throw new Error(`${sys.name} only works ${sys.phases.includes('meeting') ? 'during the day' : 'while exploring the ship'}.`);
    if (this.pausedRemaining != null) throw new Error('The game is paused.');
    const works = !this.broken(p);
    const until = now + (sys.seconds || 0) * 1000;
    const room = sys.target === 'here' ? args.here : args.room;
    if (['room', 'here'].includes(sys.target) && !ROOM_NAMES[room]) throw new Error(sys.target === 'here' ? 'Stand inside a room first (not a corridor).' : 'Pick a room.');
    const target = sys.target === 'player' || sys.target === 'spoof' ? this.get(args.target) : null;
    if ((sys.target === 'player' || sys.target === 'spoof') && (!target || target.id === pid)) throw new Error('Pick another player.');
    if (sys.id === 'disguise' && !target.alive) throw new Error('Pick a living player.');
    const occupants = (args.occupants || []).filter((id) => this.get(id));
    const where = ROOM_NAMES[room];
    const result = {};

    switch (sys.id) {
      case 'intercept':
        this.systems.intercepts.push({ by: pid, room, until, works });
        this.tell(p, `🎧 You tap into ${where}'s comms for ${sys.seconds} seconds…`, { kind: 'system' });
        result.until = until;
        break;
      case 'accesslog': {
        let names;
        if (works) names = [...(this.visits[room] || [])].map((id) => this.get(id)?.name).filter(Boolean);
        else names = st.sample(this.players.filter((o) => o.id !== pid), Math.floor(this.random() * 4), this.random).map((o) => o.name);
        this.tell(p, `🗂️ Door log for ${where} today: ${names.length ? names.join(', ') : 'nobody'}.`, { kind: 'system' });
        break;
      }
      case 'lockdown':
        this.systems.lockdowns.push({ room, until, allowed: occupants, by: pid, works });
        this.tell(p, `🔐 ${where[0].toUpperCase()}${where.slice(1)} is sealed for ${sys.seconds} seconds. Nobody else can get in or listen in.`, { kind: 'system' });
        break;
      case 'sweep': {
        if (this.blackout(now)) throw new Error('The sensors are dead during the blackout. Try again when the lights come back.');
        const inside = occupants.map((id) => this.get(id));
        const evil = works ? inside.filter((o) => this.reg(o).evil).length : Math.floor(this.random() * Math.min(3, inside.length + 1));
        this.tell(p, `📶 Sensor sweep of ${where}: ${inside.length} aboard, ${evil} evil.`, { kind: 'system' });
        break;
      }
      case 'medscan': {
        const glitched = works ? this.isGlitched(target) : this.random() < 0.3;
        this.tell(p, `🩺 Med-scan: ${target.name}'s systems are ${glitched ? 'GLITCHED ⚠️' : 'clean ✅'}.`, { kind: 'system' });
        break;
      }
      case 'spoof': {
        const text = String(args.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
        if (!text) throw new Error('Write the fake message first.');
        result.spoof = { as: target.id, text };
        this.tell(p, `👾 You sent a message as ${target.name}: "${text}"`, { kind: 'system' });
        break;
      }
      case 'disguise':
        this.systems.disguises[pid] = { as: target.id, until };
        this.tell(p, `🎭 You look exactly like ${target.name} for ${sys.seconds} seconds. Your chat shows their name too.`, { kind: 'system' });
        break;
      case 'blackout':
        this.systems.blackoutUntil = until;
        this.tell(p, `🌑 The lights are out for ${sys.seconds} seconds.`, { kind: 'system' });
        break;
      default:
        throw new Error('Unknown system.');
    }
    p.systemUsed = true;
    this.bump('systems', pid);
    this.ev({ k: 'system', a: pid, sys: sys.id, t: target?.id || null, room: room || null, works });
    return result;
  }

  // What everyone can see about ship systems right now (only systems that really work).
  systemsView(now = Date.now()) {
    const s = this.systems;
    return {
      lockdowns: s.lockdowns.filter((l) => l.works && now < l.until).map((l) => ({ room: l.room, until: l.until, allowed: l.allowed, private: !!l.private })),
      disguises: Object.entries(s.disguises).filter(([id]) => this.disguiseOf(id, now)).map(([id, d]) => ({ id, as: d.as, until: d.until })),
      blackoutUntil: this.blackout(now) ? s.blackoutUntil : 0,
    };
  }

  // Players can say they are happy to move on, like a Storyteller asking
  // "any more nominations?". When everyone still connected agrees, the ship
  // skips the rest of that part of the day (autopilot, or a Captain with auto-advance on).
  setReady(pid, on) {
    if (!READY_PHASES.includes(this.phase)) throw new Error('Nothing to hurry along right now.');
    if (!this.get(pid)) throw new Error('Only players can do that.');
    if (on) this.ready.add(pid);
    else this.ready.delete(pid);
  }

  readyVoters() {
    return this.players.filter((p) => p.connected);
  }

  everyoneReady() {
    const voters = this.readyVoters();
    return voters.length > 0 && voters.some((p) => !this.afk.has(p.id)) && voters.every((p) => this.ready.has(p.id) || this.afk.has(p.id));
  }

  // ---------------------------------------------------------------------------
  // Away from keyboard: after 90 seconds without input by day, a player shows
  // 💤 and counts as ready, so one distracted friend can't hold everyone up.
  // ---------------------------------------------------------------------------

  // Returns true if the player was marked away (so everyone needs an update).
  touch(pid, now = Date.now()) {
    const p = this.get(pid);
    if (!p) return false;
    p.lastActive = now;
    return this.afk.delete(pid);
  }

  updateAfk(now = Date.now()) {
    if (!DAY_PHASES.includes(this.phase)) return false;
    let changed = false;
    for (const p of this.players) {
      if (!p.connected || p.isBot || this.afk.has(p.id)) continue;
      if (now - Math.max(p.lastActive || 0, this.activeFloor) > AFK_MS) {
        this.afk.add(p.id);
        changed = true;
      }
    }
    return changed;
  }

  // ---------------------------------------------------------------------------
  // Ghosts: bets on the Parasite and harmless haunting
  // ---------------------------------------------------------------------------

  // Dead players secretly bet on who the Parasite is. The first bet is free;
  // after that you can change it once a day.
  predict(pid, targetId, now = Date.now()) {
    const p = this.get(pid);
    if (!p) throw new Error('Only players can do that.');
    if (['lobby', 'ended'].includes(this.phase)) throw new Error('No game running.');
    if (p.alive) throw new Error('Only ghosts can place bets. Stay alive!');
    const t = this.get(targetId);
    if (!t || t.id === pid) throw new Error('Pick another player.');
    const cur = this.predictions[pid];
    if (cur?.id === targetId) return cur;
    if (cur && cur.changedDay === this.day) throw new Error('You can only change your bet once a day.');
    this.predictions[pid] = { id: targetId, since: now, day: this.day, changedDay: cur ? this.day : null };
    return this.predictions[pid];
  }

  hauntsLeft(p) {
    return HAUNTS_PER_DAY - (p.haunts.day === this.day ? p.haunts.used : 0);
  }

  // A ghost's prank in the room they are floating in. Anonymous to the living.
  haunt(pid, kind, room, now = Date.now()) {
    const p = this.get(pid);
    if (!p || p.alive) throw new Error('Only ghosts can haunt the ship.');
    if (this.phase !== 'roam') throw new Error('Haunt the ship while the crew is exploring.');
    if (!HAUNTS.includes(kind)) throw new Error('Unknown haunting.');
    if (!room || room === 'corridor' || !ROOM_NAMES[room]) throw new Error('Float into a room first.');
    if (p.haunts.day !== this.day) p.haunts = { day: this.day, used: 0, lastAt: 0 };
    if (p.haunts.used >= HAUNTS_PER_DAY) throw new Error('You are out of ectoplasm until tomorrow.');
    if (p.haunts.lastAt && now - p.haunts.lastAt < HAUNT_COOLDOWN_MS) throw new Error('Let the spookiness sink in first…');
    p.haunts.used += 1;
    p.haunts.lastAt = now;
    this.bump('haunts', pid);
    this.ev({ k: 'haunt', a: pid, kind, room });
    return { kind, room, at: now };
  }

  // ---------------------------------------------------------------------------
  // Reactions, last words, bios, the ship's name and rematches
  // ---------------------------------------------------------------------------

  react(pid, emoji) {
    if (!REACTIONS.includes(emoji)) throw new Error('Unknown reaction.');
    if (!this.get(pid) && this.captain?.id !== pid && !this.getSpectator(pid)) throw new Error('Join a ship first.');
    if (this.phase === 'night' || this.phase === 'lobby') throw new Error('Not now.');
    // reactions to last words decide the "funniest last words" on the share card
    const w = this.phase === 'lastwords' && this.lastWordsLog.find((x) => x.day === this.day && x.id === this.lastWords?.id);
    if (w && pid !== w.id) {
      w.reactions += 1;
      if (emoji === '🤣') w.laughs += 1;
    }
  }

  noteLastWords(pid, text) {
    if (this.phase !== 'lastwords' || this.lastWords?.id !== pid) return;
    let w = this.lastWordsLog.find((x) => x.day === this.day && x.id === pid);
    if (!w) this.lastWordsLog.push((w = { id: pid, day: this.day, text: '', reactions: 0, laughs: 0 }));
    w.text = (w.text ? `${w.text} … ${text}` : text).slice(0, 160);
  }

  // ---------------------------------------------------------------------------
  // "Who dies tonight?": everyone can guess at night (even players with nothing
  // to choose). Right guesses score a point on the season. The Parasite may
  // guess too (so nobody can tell who it is), but its guesses never count.
  // ---------------------------------------------------------------------------

  setDeathGuess(pid, target) {
    if (this.phase !== 'night' || this.draft) throw new Error('Guesses close at dawn.');
    if (!this.get(pid)) throw new Error('Only players can guess.');
    if (target !== 'none' && !this.get(target)?.alive) throw new Error('Pick a living player, or nobody.');
    this.deathGuesses[pid] = target;
  }

  scoreDeathGuesses(deaths, parasiteId) {
    const died = deaths.map((x) => x.id);
    for (const [pid, guess] of Object.entries(this.deathGuesses)) {
      const correct = guess === 'none' ? died.length === 0 : died.includes(guess);
      this.lastGuess[pid] = { night: this.night, guess, correct };
      if (correct && pid !== parasiteId) this.guessScore[pid] = (this.guessScore[pid] || 0) + 1;
    }
    this.deathGuesses = {};
  }

  // ---------------------------------------------------------------------------
  // Robot crewmates (their brains live in bots.js)
  // ---------------------------------------------------------------------------

  addBot(byId) {
    this.requireController(byId);
    if (this.phase !== 'lobby') throw new Error('Robots can only board in the docking bay.');
    if (this.players.length >= MAX_PLAYERS) throw new Error('This ship is full (15 players).');
    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    const free = BOTS.filter(([n]) => !taken.has(`${n} 🤖`.toLowerCase()));
    if (!free.length) throw new Error('No more robots in storage.');
    const [name, bio] = free[Math.floor(this.random() * free.length)];
    const p = this.addPlayer(`${name} 🤖`, {});
    p.isBot = true;
    p.bio = bio;
    p.lastActive = Date.now();
    return p;
  }

  removeBots(byId) {
    this.requireController(byId);
    if (this.phase !== 'lobby') throw new Error('Robots can only leave from the docking bay.');
    for (const p of this.players.filter((x) => x.isBot)) this.removePlayer(p.id);
  }

  // ---------------------------------------------------------------------------
  // Late friends: spectators watch a game in progress and join at the rematch
  // ---------------------------------------------------------------------------

  addSpectator(name) {
    if (this.phase === 'lobby') throw new Error('The ship is still docked: join the crew instead.');
    if (this.spectators.length >= MAX_SPECTATORS) throw new Error('The viewing gallery is full.');
    const s = { id: randomId(), token: randomId(16), name: this.cleanName(name), connected: true };
    this.spectators.push(s);
    return s;
  }

  getSpectator(id) {
    return this.spectators.find((s) => s.id === id) || null;
  }

  // Back in the docking bay, spectators join the crew (keeping their id, so their connection carries on).
  absorbSpectators() {
    for (const s of this.spectators.splice(0)) {
      if (this.players.length >= MAX_PLAYERS) continue;
      const p = this.addPlayer(s.name, {});
      if (this.hostId === p.id) this.hostId = s.id;
      p.id = s.id;
      p.token = s.token;
      p.connected = s.connected;
      p.lastActive = Date.now();
    }
  }

  // Autopilot lobby only: the host has left or not touched anything for a minute.
  hostAway(now = Date.now()) {
    if (this.mode !== 'autopilot' || this.phase !== 'lobby') return false;
    const h = this.get(this.hostId);
    return !h || !h.connected || (!!h.lastActive && now - h.lastActive > HOST_AWAY_MS);
  }

  // "Finish the sentence: Zorp is…" ARIA weaves it into the stories.
  setBio(pid, text) {
    const p = this.get(pid);
    if (!p) throw new Error('Only players have bios.');
    if (this.phase !== 'lobby') throw new Error('Bios are written in the docking bay.');
    p.bio = String(text || '').replace(/\s+/g, ' ').trim().replace(/^(who is|who's|is)\s+/i, '').replace(/[.!?]+$/, '').slice(0, 48);
  }

  setShipName(byId, name) {
    this.requireController(byId);
    if (this.phase !== 'lobby') throw new Error('Name the ship in the docking bay.');
    const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 28);
    this.shipName = clean || st.shipName(this.random);
  }

  // The host can list the ship publicly, so people without a group can join.
  setPublic(byId, on) {
    this.requireController(byId);
    if (this.practice) throw new Error('Practice ships are private.');
    this.isPublic = !!on;
  }

  // One line for the public ships list (no secrets).
  listing() {
    return {
      code: this.code,
      shipName: this.shipName,
      script: this.script,
      phase: this.phase,
      mode: this.mode,
      people: this.players.filter((p) => !p.isBot && p.connected).length,
      robots: this.players.filter((p) => p.isBot).length,
      seats: this.players.length,
      watching: this.spectators.filter((s) => s.connected).length,
      round: this.season.games + 1,
    };
  }

  // Back to the docking bay with the same crew, seats and suits. Once a game
  // is over anyone can call it; mid-game only the host or Captain.
  rematch(byId, now = Date.now()) {
    const anyone = this.phase === 'ended' && (this.get(byId) || this.captain?.id === byId);
    if (!anyone) this.requireController(byId);
    this.resetState();
    this.absorbSpectators();
    this.rematchAt = now;
    this.announce(`Round ${this.season.games + 1}! Same crew, fresh lies. Warm up those dance moves.`, 'system');
  }

  // ---------------------------------------------------------------------------
  // Tasks & drawings
  // ---------------------------------------------------------------------------

  chargeNeeded() {
    return Math.max(3, Math.round(this.aliveCount() * 1.5));
  }

  completeTask(pid, taskId) {
    if (this.phase !== 'roam') throw new Error('Tasks can only be done while exploring.');
    if (!TASKS[taskId]) throw new Error('Unknown task.');
    if (!this.get(pid)) throw new Error('Not on this ship.');
    const done = (this.tasksDone[pid] ||= []);
    if (done.includes(taskId)) throw new Error('You already did that task today.');
    done.push(taskId);
    this.charge += 1;
    this.bump('tasks', pid);
    return { charge: this.charge, needed: this.chargeNeeded() };
  }

  submitDrawing(pid, data, signed, now = Date.now()) {
    // a drawing the player's screen sent as the night ended is still pinned up (straight onto the wall)
    const late = this.phase === 'dawn' && this.dawn?.night === this.night && now - this.phaseStartedAt < DRAWING_GRACE_MS;
    if (this.phase !== 'night' && !late) throw new Error('You can only draw at night.');
    if (!this.get(pid)) throw new Error('Not on this ship.');
    if (typeof data !== 'string' || !data.startsWith('data:image/png;base64,') || data.length > 200_000) {
      throw new Error('That drawing is too big.');
    }
    this.drawings = this.drawings.filter((d) => d.author !== pid);
    const drawing = { id: randomId(6), author: pid, data, signed: !!signed, night: this.night, published: late };
    this.drawings.push(drawing);
    if (this.drawings.length > 15) this.drawings.shift();
    return drawing;
  }

  removeDrawing(byId, drawingId) {
    this.requireController(byId);
    this.drawings = this.drawings.filter((d) => d.id !== drawingId);
  }

  // ---------------------------------------------------------------------------
  // Captain's Command Station
  // ---------------------------------------------------------------------------

  advance(byId, now = Date.now()) {
    this.requireController(byId);
    switch (this.phase) {
      case 'night':
        if (!this.draft) this.resolveNight(now);
        else if (this.draftReady()) this.applyDraft(now);
        else throw new Error('Waiting for the Black Box to choose.');
        break;
      case 'dawn':
        if (this.winner) this.end(now);
        else this.beginRoam(now);
        break;
      case 'roam':
        this.beginMeeting(now);
        break;
      case 'meeting':
        this.beginNominations(now);
        break;
      case 'nominations':
        this.beginDusk(now);
        break;
      case 'lastwords':
        this.finishLastWords(now);
        break;
      case 'dusk':
        if (this.winner) this.end(now);
        else this.beginNight(now);
        break;
      default:
        throw new Error('Nothing to advance.');
    }
  }

  addTime(byId, seconds, now = Date.now()) {
    this.requireController(byId);
    if (this.phaseEndsAt) this.phaseEndsAt = Math.max(now, this.phaseEndsAt) + seconds * 1000;
  }

  togglePause(byId, now = Date.now()) {
    this.requireController(byId);
    if (this.pausedRemaining != null) {
      this.phaseEndsAt = now + this.pausedRemaining;
      this.pausedRemaining = null;
    } else if (this.phaseEndsAt) {
      this.pausedRemaining = Math.max(0, this.phaseEndsAt - now);
    }
  }

  setAutoAdvance(byId, on) {
    this.requireController(byId);
    this.autoAdvance = !!on;
  }

  handToAutopilot(byId) {
    this.requireController(byId);
    this.mode = 'autopilot';
    this.autoAdvance = true;
    if (!this.hostId) this.hostId = this.players[0]?.id ?? null;
  }

  setRegPolicy(byId, role, policy) {
    this.requireController(byId);
    if (!['stowaway', 'mimic'].includes(role) || !['auto', 'evil', 'good'].includes(policy)) throw new Error('Bad setting.');
    this.regPolicy[role] = policy;
  }

  captainToggleDead(byId, pid) {
    this.requireController(byId);
    const p = this.get(pid);
    if (!p || this.phase === 'lobby' || this.phase === 'ended') throw new Error('Cannot do that now.');
    if (p.alive) {
      this.kill(p, 'captain');
      this.announce(`By order of the Captain, ${p.name} is dead.`, 'death');
    } else {
      p.alive = true;
      this.announce(`By order of the Captain, ${p.name} lives again!`, 'system');
    }
    this.checkWin();
  }

  forceClue(byId, kind, now = Date.now()) {
    this.requireController(byId);
    if (this.phase === 'lobby' || this.phase === 'ended') throw new Error('No game running.');
    const team = ['dead-constellation', 'comets', 'probe'].includes(kind) ? 'crew' : ['living-constellation', 'drift-count', 'role-comets'].includes(kind) ? 'infiltrators' : null;
    this.clue = st.makeClue(this, this.random, team ? { team, kind } : null);
    // while exploring it arrives in 20 seconds; otherwise during the next exploring phase
    if (this.phase === 'roam') this.scheduleClue(this.clue, now + CLUE_WARN_MS);
  }

  // ---------------------------------------------------------------------------
  // Clues: objects that drift past the Observation Deck for a few seconds
  // ---------------------------------------------------------------------------

  scheduleClue(clue, at) {
    clue.at = at;
    clue.until = at + CLUE_MS;
  }

  // Clients only learn about a clue shortly before it arrives, and it vanishes after.
  clueView(clue, now = Date.now()) {
    if (!clue?.at || now < clue.at - CLUE_WARN_MS || now > clue.until) return null;
    const { kind, players, role, count, caption, at, until } = clue;
    return { kind, players, role, count, caption, at, until };
  }

  // A key that changes whenever a clue appears or disappears for anyone (so the server re-sends state).
  clueKey(now = Date.now()) {
    return `${!!this.clueView(this.clue, now)}|${!!this.clueView(this.hallucination?.clue, now)}`;
  }

  say(byId, text, now = Date.now()) {
    this.requireController(byId);
    const clean = String(text || '').trim().slice(0, 400);
    if (!clean) throw new Error('Say something!');
    this.bubble = { text: clean, at: now };
    this.ev({ k: 'story', text: clean });
  }

  endGame(byId, winner, now = Date.now()) {
    this.requireController(byId);
    if (!['crew', 'infiltrators'].includes(winner)) throw new Error('Pick a winner.');
    this.finish(winner, winner === 'crew' ? 'The Captain declares victory for the crew!' : 'The Captain declares victory for the infiltrators!');
    this.end(now);
  }

  reset(byId) {
    this.requireController(byId);
    this.resetState();
    this.absorbSpectators();
    this.announce('The Captain reset the ship. Back to the docking bay!', 'system');
  }

  // ---------------------------------------------------------------------------
  // Timers (called a few times per second by the server)
  // ---------------------------------------------------------------------------

  // Returns true when something changed and everyone needs a fresh state.
  tick(now = Date.now()) {
    const clues = this.clueKey(now);
    const cluesChanged = clues !== (this.lastClueKey ?? 'false|false');
    if (this.clue?.at && now >= this.clue.at && !this.clue.logged) {
      this.clue.logged = true;
      this.logEvent({ k: 'clue', caption: this.clue.caption });
    }
    this.lastClueKey = clues;
    const afk = this.updateAfk(now);
    const away = this.hostAway(now);
    const awayChanged = away !== !!this.lastHostAway;
    this.lastHostAway = away;
    const wished = this.tickWish(now);
    return this.tickPhase(now) || cluesChanged || afk || awayChanged || wished;
  }

  tickPhase(now) {
    if (this.pausedRemaining != null) return false;
    const due = this.phaseEndsAt != null && now >= this.phaseEndsAt;
    const auto = this.autoAdvance;
    switch (this.phase) {
      case 'night': {
        if (!this.draft) {
          const minDone = now >= this.phaseStartedAt + this.dur('nightMin');
          if (due || (auto && minDone && this.allChosen() && this.everyoneReady())) {
            this.resolveNight(now);
            return true;
          }
          return false;
        }
        if (this.blackbox && !this.blackbox.target && now >= this.blackbox.deadline) {
          const pool = this.players.filter((p) => p.id !== this.blackbox.id).map((p) => p.id);
          this.submitBlackbox(this.blackbox.id, [st.pick(pool, this.random)]);
          return true;
        }
        if (auto && this.draftReady()) {
          this.applyDraft(now);
          return true;
        }
        return false;
      }
      case 'dawn':
        if (!(due || (auto && this.everyoneReady()))) return false;
        if (this.winner) this.end(now);
        else this.beginRoam(now);
        return true;
      case 'roam':
        if (!(auto && (due || this.everyoneReady()))) return false;
        this.beginMeeting(now);
        return true;
      case 'meeting':
        if (!(auto && (due || this.everyoneReady()))) return false;
        this.beginNominations(now);
        return true;
      case 'nominations':
        if (this.nomination) return this.tickNomination(now);
        if (!(auto && (due || this.everyoneReady()))) return false;
        this.beginDusk(now);
        return true;
      case 'lastwords':
        if (!due) return false;
        this.finishLastWords(now);
        return true;
      case 'dusk':
        if (!due) return false;
        if (this.winner) this.end(now);
        else this.beginNight(now);
        return true;
      default:
        return false;
    }
  }

  // ---------------------------------------------------------------------------
  // What each person is allowed to see
  // ---------------------------------------------------------------------------

  manifest() {
    return this.players.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      believed: p.believed,
      alive: p.alive,
      glitched: this.isGlitched(p),
      hallucinating: this.hallucination?.id === p.id,
      redHerring: p.id === this.redHerringId,
      ghostVote: p.ghostVote,
      used: p.used,
      master: p.master,
    }));
  }

  publicPlayers() {
    return this.players.map((p, seat) => ({
      id: p.id,
      name: p.name,
      seat,
      alive: p.alive,
      ghostVote: !p.alive && p.ghostVote,
      connected: p.connected,
      cosmetics: p.cosmetics,
      bio: p.bio || '',
      bot: !!p.isBot,
      nominated: this.nominees.has(p.id),
      nominatedSomeone: this.nominators.has(p.id),
      role: this.phase === 'ended' ? p.role : undefined,
    }));
  }

  evilTeamFor(p) {
    // the Method Actor sees a team of Saboteurs that is not real
    if (p.role === 'actor' && p.fakeTeam && this.evilInfoShared()) {
      return [{ id: p.id, name: p.name, parasite: true }, ...p.fakeTeam.map((id) => ({ id, name: this.name(id), parasite: false }))];
    }
    if (!p.role || teamOf(p.role) !== 'infiltrators' || !this.evilInfoShared()) return null;
    return this.players.filter((o) => teamOf(o.role) === 'infiltrators').map((o) => ({ id: o.id, name: o.name, parasite: this.isDemon(o) }));
  }

  baseView() {
    const nom = this.nomination;
    return {
      code: this.code,
      script: this.script,
      shipName: this.shipName,
      round: this.season.games + (this.phase === 'ended' ? 0 : 1),
      season: this.seasonView(),
      rematchAt: this.rematchAt,
      afk: [...this.afk],
      hostAway: this.hostAway(Date.now()),
      spectators: this.spectators.map((s) => ({ id: s.id, name: s.name, connected: s.connected })),
      mode: this.mode,
      phase: this.phase,
      day: this.day,
      night: this.night,
      phaseEndsAt: this.phaseEndsAt,
      paused: this.pausedRemaining != null,
      pausedRemaining: this.pausedRemaining,
      autoAdvance: this.autoAdvance,
      pace: this.pace,
      hostId: this.hostId,
      captain: this.captain ? { name: this.captain.name, connected: this.captain.connected } : null,
      players: this.publicPlayers(),
      playerCount: this.players.length,
      aliveCount: this.aliveCount(),
      threshold: Math.ceil(this.aliveCount() / 2),
      nomination: nom && {
        nominator: nom.nominator,
        nominee: nom.nominee,
        stage: nom.stage,
        stageEndsAt: nom.stageEndsAt,
        order: nom.order,
        index: nom.index,
        hands: nom.hands,
        cast: Object.keys(nom.cast),
        locked: nom.locked,
      },
      block: this.block,
      votesToday: this.phase === 'nominations' || this.phase === 'dusk' ? this.votesToday : [],
      claims: this.claims,
      dayLog: this.dayLog,
      lastWords: this.lastWords,
      shipEvent: this.shipEvent && this.shipEvent.until > Date.now() ? this.shipEvent : null,
      awards: this.phase === 'ended' ? this.awards : null,
      predictions: this.phase === 'ended' ? Object.entries(this.predictions).map(([id, b]) => ({ id, target: b.id, day: b.day })) : null,
      bestLastWords: this.phase === 'ended' ? this.bestLastWords() : null,
      replayId: this.phase === 'ended' ? this.replayId : null,
      practice: !!this.practice,
      isPublic: !!this.isPublic,
      systems: this.systemsView(),
      ready: [...this.ready],
      readyNeeded: this.readyVoters().length,
      lastNomination: this.lastNomination,
      log: this.log.slice(-40),
      dawn: this.dawn,
      dusk: this.dusk,
      bubble: this.bubble,
      clue: this.clueView(this.clue),
      charge: this.charge,
      chargeNeeded: this.chargeNeeded(),
      drawings: this.drawings.filter((d) => d.published).map((d) => ({ id: d.id, signedBy: d.signed ? this.name(d.author) : null })),
      customRoles: this.customRoles,
      winner: this.phase === 'ended' ? this.winner : null,
      winReason: this.phase === 'ended' ? this.winReason : null,
      history: this.phase === 'ended' ? this.history : null,
      evilChatOpen: this.evilInfoShared(),
    };
  }

  viewFor(pid) {
    const view = this.baseView();
    const p = this.get(pid);
    if (this.captain && this.captain.id === pid) {
      view.you = { id: pid, name: this.captain.name, isCaptain: true, isController: this.isController(pid) };
      view.grimoire = this.grimoire();
      view.clue = this.clue && { ...this.clue, live: !!this.clueView(this.clue) };
      return view;
    }
    const watcher = this.getSpectator(pid);
    if (watcher) {
      view.you = { id: pid, name: watcher.name, isSpectator: true };
      return view;
    }
    if (!p) return view;
    const prompt = this.phase === 'night' ? this.prompts[pid] : null;
    view.you = {
      id: p.id,
      name: p.name,
      isCaptain: false,
      isController: this.isController(pid),
      role: p.believed,
      alive: p.alive,
      ghostVote: p.ghostVote,
      notes: p.notes,
      prompt: prompt && { ...prompt, done: !!this.choices[pid], chosen: this.choices[pid] || null },
      blackbox: this.blackbox && this.blackbox.id === pid ? { done: !!this.blackbox.target } : null,
      gunner: p.believed === 'gunner' && p.alive && !p.used,
      evilTeam: this.evilTeamFor(p),
      bluffs: ROLES[p.believed]?.type === 'parasite' && this.evilInfoShared() ? this.bluffs : null,
      wish: this.wish && this.wish.id === pid ? { role: this.wish.role, until: this.wish.until } : null,
      manifest: p.role === 'mimic' && p.alive ? this.mimicManifest : null,
      master: p.role === 'droid' && p.alive ? p.master : null,
      ready: this.ready.has(pid),
      afk: this.afk.has(pid),
      prediction: this.predictions[pid] || null,
      deathGuess: this.phase === 'night' ? this.deathGuesses[pid] || null : null,
      lastGuess: this.lastGuess[pid] || null,
      guesses: this.guessScore[pid] || 0,
      haunts: !p.alive && this.phase !== 'ended' ? { left: this.hauntsLeft(p) } : null,
      tasksDone: this.tasksDone[pid] || [],
      drew: this.drawings.some((d) => d.author === pid && d.night === this.night && !d.published),
      hand: this.nomination ? !!this.nomination.hands[pid] : false,
      cast: this.nomination ? !!this.nomination.cast[pid] : false,
      system: this.systemFor(p) && p.alive ? { id: this.systemFor(p).id, used: p.systemUsed } : null,
      lockReady: this.systems.lockReady?.[pid] || 0,
      intercepting: this.systems.intercepts.filter((i) => i.by === pid && Date.now() < i.until).map((i) => ({ room: i.room, until: i.until }))[0] || null,
    };
    // Players who did a task today get a heads-up before a clue arrives.
    view.you.clueWarning = (this.tasksDone[pid] || []).length > 0;
    // The Holo-Jester's victim sees their own (fake) clue and a few other things that aren't there.
    const h = this.hallucination;
    view.you.fx = h && h.id === pid && p.alive && DAY_PHASES.concat('dawn').includes(this.phase) ? { seed: h.seed } : null;
    if (view.you.fx) view.clue = this.clueView(h.clue);
    // Votes stay secret until the clock hand reveals them (you always see your own).
    if (view.nomination) view.nomination = this.secretBallot(view.nomination, pid);
    return view;
  }

  secretBallot(nom, pid) {
    const hands = {};
    for (const [id, up] of Object.entries(nom.hands)) if (id === pid || nom.locked[id]) hands[id] = up;
    return { ...nom, hands };
  }

  grimoire() {
    const d = this.draft;
    return {
      players: this.manifest(),
      bluffs: this.bluffs,
      redHerringId: this.redHerringId,
      regPolicy: this.regPolicy,
      prompts: Object.fromEntries(Object.entries(this.prompts).map(([id, pr]) => [id, { ...pr, chosen: this.choices[id] || null }])),
      draft: d && {
        messages: d.messages,
        deaths: d.deaths,
        events: d.events,
        starpass: d.starpass,
        story: d.story,
        anims: d.anims,
        blackboxWaiting: !!(this.blackbox && !this.blackbox.target),
      },
      draftReady: this.draftReady(),
      notes: Object.fromEntries(this.players.map((p) => [p.id, p.notes.slice(-6)])),
    };
  }
}

module.exports = { Game, DEATH_ANIMS, DAY_PHASES, ROOM_NAMES, HAUNTS, REACTIONS, HAUNTS_PER_DAY, AFK_MS };

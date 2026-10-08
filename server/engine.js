// The rules of No More Space for one ship (room).
//
// It follows Blood on the Clocktower's "Trouble Brewing" rules closely:
// hidden roles, a night order, glitched (poisoned) and drunk players getting
// false information, nominations with a clockwise vote, ghost votes, and the
// same win conditions. Nothing here knows about networking, so it can be
// tested on its own (see test/engine.test.js).

const crypto = require('crypto');
const { ROLES, TYPES, MIN_PLAYERS, MAX_PLAYERS, EVIL_INFO_MIN, rolesOfType, teamOf } = require('./roles');
const st = require('./storyteller');
const cosmetics = require('./cosmetics');
const { TASKS } = require('./tasks');

const DAY_PHASES = ['roam', 'meeting', 'nominations'];
const TARGET_RULE = { hacker: 'alive', medic: 'alive', parasite: 'alive', scanner: 'any', droid: 'any', blackbox: 'any' };
const DEATH_ANIMS = ['airlock', ...st.NIGHT_ANIMS, 'fainted', 'shot'];

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
    master: null, // Service Droid's chosen master for today
    notes: [], // private information this player has learned
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
    this.regPolicy = { stowaway: 'auto', mimic: 'auto' };
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
    this.tasksDone = {};
    this.drawings = [];
    this.regCache = {};
    this.lastParasiteVotes = 0;
    this.mimicManifest = null;
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
  }

  // How long each part of the day lasts. Tuned so a 10-player game runs about
  // an hour, like a game of Blood on the Clocktower.
  dur(kind) {
    const alive = this.aliveCount();
    const seconds = {
      nightMin: 40,
      nightMax: 110,
      blackbox: 40,
      dawn: 10 + 4 * (this.dawn?.deaths.length || 0),
      roam: clamp(alive * 25, 100, 360) + (this.day === 1 ? 90 : 0),
      meeting: clamp(alive * 12, 60, 180),
      nominations: clamp(alive * 30, 150, 420),
      accuse: 20,
      defend: 20,
      voteStep: 1.4,
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
    const taken = [...this.players.map((p) => p.name), this.captain?.name].filter(Boolean);
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
    const player = { id: randomId(), token: randomId(16), name: clean, connected: true, cosmetics: look2, ...freshPlayerState() };
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

  setCustomRoles(byId, roleIds) {
    this.requireController(byId);
    if (this.phase !== 'lobby') throw new Error('Roles are dealt already.');
    if (roleIds == null) {
      this.customRoles = null;
      return;
    }
    if (!Array.isArray(roleIds)) throw new Error('Bad role list.');
    const error = st.validateRoles(roleIds, this.players.length);
    if (error) throw new Error(error);
    this.customRoles = [...roleIds];
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  // deal: optional exact role per seat (the Captain assigning roles by hand).
  // drunkAs: optional Crew role the Space Drunk believes they are.
  start(byId, now = Date.now(), { deal = null, drunkAs = null } = {}) {
    this.requireController(byId);
    if (this.phase !== 'lobby') throw new Error('Already launched.');
    const n = this.players.length;
    if (n < MIN_PLAYERS) throw new Error(`Need at least ${MIN_PLAYERS} players.`);

    let roles;
    if (deal) {
      const error = st.validateRoles(deal, n);
      if (error) throw new Error(error);
      roles = [...deal];
    } else {
      roles = this.customRoles;
      if (roles && st.validateRoles(roles, n)) roles = null; // player count changed since they were picked
      roles = st.shuffle(roles || st.pickRoles(n, this.random), this.random);
    }

    this.resetState();
    this.players.forEach((p, i) => {
      p.role = roles[i];
      p.believed = roles[i];
    });

    const inPlay = new Set(roles);
    const goodNotInPlay = (type) => rolesOfType(type).filter((r) => !inPlay.has(r) && ROLES[r].minPlayers <= n);

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

    this.history.push({
      k: 'setup',
      seats: this.players.map((p) => p.id),
      roles: Object.fromEntries(this.players.map((p) => [p.id, p.role])),
      believed: Object.fromEntries(this.players.map((p) => [p.id, p.believed])),
      redHerring: this.redHerringId,
      bluffs: this.bluffs,
    });
    this.mimicManifest = this.manifest();
    this.announce('The ship has launched. Ahead, the black hole waits. Somewhere aboard, something is hungry.', 'system');
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
    if (p.believed === 'parasite' && this.night < this.firstKillNight) return null;
    return { role: p.believed, choose: def.choose, notSelf: !!def.notSelf, target: TARGET_RULE[p.believed] || 'alive' };
  }

  beginNight(now) {
    this.night += 1;
    this.executedYesterday = this.executedToday;
    this.executedToday = null;
    this.glitch = null; // last night's glitch wore off at dusk
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

    if (this.night === 1) this.shareEvilInfo();
    this.announce(`Night ${this.night}. The lights dim. Everyone returns to their sleep pods...`, 'night');
    this.maybeResolve(now);
  }

  // Minion & Demon info, only in games of 7 or more (like Blood on the Clocktower).
  shareEvilInfo() {
    if (!this.evilInfoShared()) return;
    const parasite = this.players.find((p) => p.role === 'parasite');
    const saboteurs = this.players.filter((p) => ROLES[p.role].type === 'saboteur');
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
    this.choices[pid] = this.checkTargets(pid, targets, prompt);
    this.maybeResolve(now);
  }

  checkTargets(pid, targets, prompt) {
    if (!Array.isArray(targets) || targets.length !== prompt.choose) throw new Error(`Choose ${prompt.choose} player(s).`);
    if (new Set(targets).size !== targets.length) throw new Error('Choose different players.');
    for (const id of targets) {
      const t = this.get(id);
      if (!t) throw new Error('Unknown player.');
      if (prompt.target === 'alive' && !t.alive) throw new Error('Choose a living player.');
      if (prompt.notSelf && id === pid) throw new Error('You cannot choose yourself.');
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
      const pool = this.players.filter((t) => (prompt.target === 'any' || t.alive) && !(prompt.notSelf && t.id === pid));
      const ids = pool.map((t) => t.id).filter((id) => !(prompt.role === 'parasite' && id === pid));
      this.choices[pid] = st.sample(ids.length >= prompt.choose ? ids : pool.map((t) => t.id), prompt.choose, this.random);
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
    const truthful = !this.broken(p, this.draft.glitch);
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
    const r = { evil: teamOf(p.role) === 'infiltrators', type: ROLES[p.role].type, role: p.role, demon: p.role === 'parasite' };
    const flip = (policy, yes) => (policy === 'auto' ? this.random() < 0.5 : policy === yes);
    if (p.role === 'stowaway' && flip(this.regPolicy.stowaway, 'evil')) {
      r.evil = true;
      r.demon = this.random() < 0.4;
      r.type = r.demon ? 'parasite' : 'saboteur';
      r.role = r.demon ? 'parasite' : st.pick(rolesOfType('saboteur'), this.random);
    }
    if (p.role === 'mimic' && flip(this.regPolicy.mimic, 'good')) {
      const inPlay = new Set(this.players.map((o) => o.role));
      const options = [...rolesOfType('crew'), ...rolesOfType('drifter')].filter((x) => !inPlay.has(x) && x !== 'drunk');
      r.evil = false;
      r.role = st.pick(options.length ? options : rolesOfType('crew'), this.random);
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
      const options = rolesOfType(type).filter((r) => ROLES[r].minPlayers <= this.players.length);
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

    // First night information roles.
    if (N === 1) {
      for (const p of believers('comms')) {
        const info = this.oneOfTwo(p, 'crew', !broken(p));
        say(p, 'comms', info.text, !broken(p), info);
      }
      for (const p of believers('archivist')) {
        const info = this.oneOfTwo(p, 'drifter', !broken(p));
        say(p, 'archivist', info.text, !broken(p), info);
      }
      for (const p of believers('security')) {
        const info = this.oneOfTwo(p, 'saboteur', !broken(p));
        say(p, 'security', info.text, !broken(p), info);
      }
      for (const p of believers('navigator')) {
        const n = this.players.length;
        let pairs = 0;
        for (let i = 0; i < n; i++) if (this.reg(this.players[i]).evil && this.reg(this.players[(i + 1) % n]).evil) pairs++;
        const evilCount = this.players.filter((o) => teamOf(o.role) === 'infiltrators').length;
        const value = broken(p) ? st.otherNumber(pairs, Math.max(1, evilCount - 1), this.random) : pairs;
        say(p, 'navigator', `There ${value === 1 ? 'is 1 pair' : `are ${value} pairs`} of evil players sitting next to each other.`, !broken(p), { value });
      }
    }

    // Medic protects.
    for (const p of believers('medic')) {
      const [t] = choice(p) || [];
      if (!t) continue;
      const works = !broken(p);
      if (works) d.protectedId = t;
      d.events.push({ k: 'protect', a: p.id, t, works });
    }

    // The Parasite strikes.
    const parasite = aliveRole('parasite');
    if (parasite && choice(parasite)) {
      const target = this.get(choice(parasite)[0]);
      const kill = (victim, result, extra = {}) => d.events.push({ k: 'kill', a: parasite.id, t: target.id, result, victim: victim?.id, ...extra });
      const safe = (p) => p.id === d.protectedId || (p.role === 'marine' && !broken(p));
      if (broken(parasite)) {
        kill(null, 'glitched');
      } else if (target === parasite) {
        // Jumping hosts: the Parasite dies and a Saboteur takes over.
        d.deaths.push({ id: parasite.id, cause: 'starpass' });
        const minions = this.players.filter((p) => p.alive && ROLES[p.role].type === 'saboteur');
        const heir = minions.find((p) => p.role === 'incubator') || st.pick(minions, this.random);
        d.starpass = heir ? { from: parasite.id, to: heir.id } : null;
        kill(parasite, 'starpass', { to: heir?.id });
      } else if (target.id === d.protectedId) {
        kill(null, 'protected');
      } else if (target.role === 'marine' && !broken(target)) {
        kill(null, 'marine');
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
    const dying = d.deaths.map((x) => x.id);

    // A Black Box (real or drunk) killed tonight wakes to check someone.
    const bb = dying.map((id) => this.get(id)).find((p) => p.believed === 'blackbox');
    if (bb) d.blackboxPending = bb.id;

    // Coroner learns who was airlocked today.
    if (N > 1 && this.executedYesterday) {
      const ex = this.get(this.executedYesterday);
      for (const p of believers('coroner')) {
        if (dying.includes(p.id)) continue;
        const truthful = !broken(p);
        const role = truthful ? this.reg(ex).role : st.pick(Object.keys(ROLES).filter((r) => r !== ex.role), this.random);
        say(p, 'coroner', `${ex.name}, who was airlocked today, was the ${ROLES[role].name}.`, truthful);
      }
    }

    // Engineer reads their two living neighbours.
    for (const p of believers('engineer')) {
      if (dying.includes(p.id)) continue;
      const truth = this.aliveNeighbours(p, dying).filter((o) => this.reg(o).evil).length;
      const value = broken(p) ? st.otherNumber(truth, 2, this.random) : truth;
      const names = this.aliveNeighbours(p, dying).map((o) => o.name).join(' & ');
      say(p, 'engineer', `${value} of your living neighbours (${names}) ${value === 1 ? 'is' : 'are'} evil.`, !broken(p), { value });
    }

    // Scanner checks two players for the Parasite.
    for (const p of believers('scanner')) {
      if (dying.includes(p.id)) continue;
      const targets = (choice(p) || []).map((id) => this.get(id));
      if (targets.length < 2) continue;
      const truth = targets.some((t) => this.reg(t).demon || t.id === this.redHerringId);
      const value = broken(p) ? !truth : truth;
      say(p, 'scanner', `Scan of ${targets[0].name} & ${targets[1].name}: ${value ? 'YES, a Parasite signal!' : 'no Parasite signal.'}`, !broken(p), { value, players: targets.map((t) => t.id) });
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
      heir.role = 'parasite';
      heir.believed = 'parasite';
      this.tell(heir, 'The Parasite abandoned its old host and crawled into YOU. You are now the Parasite!', { kind: 'evil' });
      this.ev({ k: 'become-parasite', a: heir.id, cause: 'starpass' });
    }

    this.chapter.deaths = deaths;
    const story = d.story || st.dawnStory(deaths.map((x) => this.name(x.id)), this.random);
    this.chapter.story = story;
    this.dawn = { night: this.night, deaths, story, at: now };
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
    this.announce(deaths.length ? `Dawn. ${deaths.map((x) => this.name(x.id)).join(' and ')} did not wake up.` : 'Dawn. Everyone survived the night.', 'dawn');
    this.checkWin();
    this.setPhase('dawn', this.dur('dawn'), now);
  }

  // ---------------------------------------------------------------------------
  // Death and winning
  // ---------------------------------------------------------------------------

  kill(p, cause) {
    if (!p.alive) return;
    const aliveBefore = this.aliveCount();
    p.alive = false;
    p.ghostVote = true;
    this.ev({ k: 'death', id: p.id, cause });

    // Incubator (Scarlet Woman) takes over if the Parasite dies with 5+ alive.
    if (p.role === 'parasite' && cause !== 'starpass' && aliveBefore >= 5) {
      const inc = this.players.find((o) => o.alive && o.role === 'incubator' && !this.isGlitched(o));
      if (inc) {
        inc.role = 'parasite';
        inc.believed = 'parasite';
        this.tell(inc, 'The Parasite is dead... but its spawn hatches inside YOU. You are now the Parasite!', { kind: 'evil' });
        this.ev({ k: 'become-parasite', a: inc.id, cause: 'incubator' });
      }
    }
  }

  finish(winner, reason) {
    if (this.winner) return true;
    this.winner = winner;
    this.winReason = reason;
    this.history.push({ k: 'end', winner, reason });
    return true;
  }

  checkWin() {
    if (this.winner) return true;
    const alive = this.alive();
    if (!alive.some((p) => p.role === 'parasite')) {
      return this.finish('crew', 'The Parasite is dead! The crew fires the engines and breaks free of the black hole.');
    }
    if (alive.length <= 2) {
      return this.finish('infiltrators', 'Only two remain. The Parasite steers the ship into the black hole. There is no more space.');
    }
    return false;
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
    this.announce(`Day ${this.day}. Explore the ship, do tasks and whisper with crewmates.`, 'day');
  }

  beginMeeting(now) {
    this.setPhase('meeting', this.dur('meeting'), now);
    this.announce('EMERGENCY MEETING. Everyone to the bridge!', 'meeting');
  }

  beginNominations(now) {
    this.setPhase('nominations', this.dur('nominations'), now);
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
    this.announce(`${a.name} nominates ${b.name}!`, 'nominate');

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
    this.nomination = { nominator: aId, nominee: bId, stage: 'accuse', stageEndsAt: now + this.dur('accuse'), order, hands: {}, locked: {}, index: -1 };
  }

  setHand(pid, up) {
    const nom = this.nomination;
    if (!nom) throw new Error('No vote right now.');
    const p = this.get(pid);
    if (!p || !this.canVote(p)) throw new Error('You have no vote left.');
    if (nom.locked[pid]) throw new Error('Your vote is locked in.');
    nom.hands[pid] = !!up;
  }

  // Nominator or nominee can finish speaking early.
  doneSpeaking(pid, now) {
    const nom = this.nomination;
    if (!nom) return;
    if ((nom.stage === 'accuse' && pid === nom.nominator) || (nom.stage === 'defend' && pid === nom.nominee) || this.isController(pid)) {
      nom.stageEndsAt = now;
      this.tickNomination(now);
    }
  }

  tickNomination(now) {
    const nom = this.nomination;
    if (!nom || now < nom.stageEndsAt) return false;
    if (nom.stage === 'accuse') {
      nom.stage = 'defend';
      nom.stageEndsAt = now + this.dur('defend');
      return true;
    }
    if (nom.stage === 'defend') {
      nom.stage = 'vote';
      nom.index = 0;
      nom.stageEndsAt = now + this.dur('voteStep') + 1500 * this.pace;
      return true;
    }
    // The clock hand reaches the next voter and locks their hand in.
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
      // The Service Droid's vote only counts if their master voted too.
      if (p.role === 'droid' && p.master && !this.isGlitched(p) && !nom.hands[p.master]) {
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
    if (nominee.role === 'parasite') this.lastParasiteVotes = Math.max(this.lastParasiteVotes, votes);
    this.lastNomination = { nominator: nom.nominator, nominee: nom.nominee, voters, ignored, votes, threshold, result, at: now };
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
    if (victim) {
      this.execute(victim, now, 'airlock');
      return;
    }
    this.ev({ k: 'noexec' });
    this.announce('Nobody is airlocked today.', 'dusk');
    const fo = this.players.find((p) => p.alive && p.role === 'firstofficer');
    if (this.aliveCount() === 3 && fo && !this.isGlitched(fo)) {
      this.finish('crew', `Three survivors and no airlocking: First Officer ${fo.name} takes the helm and pulls the ship free!`);
    }
    this.dusk = { id: null, cause: null, story: 'The crew stares at each other in silence as the lights go down.' };
    this.setPhase('dusk', this.dur('dusk'), now);
  }

  execute(p, now, cause) {
    const story = cause === 'sentinel' ? `${p.name} is fried by the Sentinel's defences and swept out of the airlock.` : st.executionStory(p.name, this.random);
    this.ev({ k: 'execute', id: p.id, cause, votes: this.block?.votes || 0, story });
    this.kill(p, cause === 'sentinel' ? 'sentinel' : 'airlock');
    this.executedToday = p.id;
    this.announce(`${p.name} is airlocked.`, 'death');
    if (p.role === 'ambassador' && !this.isGlitched(p)) {
      this.finish('infiltrators', `${p.name} was the Ambassador! Diplomatic incident: the galaxy declares war on the crew.`);
    }
    this.checkWin();
    this.dusk = { id: p.id, cause, anim: 'airlock', story };
    this.setPhase('dusk', this.dur('dusk'), now);
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
    return { charge: this.charge, needed: this.chargeNeeded() };
  }

  submitDrawing(pid, data, signed) {
    if (this.phase !== 'night') throw new Error('You can only draw at night.');
    if (!this.get(pid)) throw new Error('Not on this ship.');
    if (typeof data !== 'string' || !data.startsWith('data:image/png;base64,') || data.length > 200_000) {
      throw new Error('That drawing is too big.');
    }
    this.drawings = this.drawings.filter((d) => d.author !== pid);
    const drawing = { id: randomId(6), author: pid, data, signed: !!signed, night: this.night, published: false };
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

  forceClue(byId, kind) {
    this.requireController(byId);
    if (this.phase === 'lobby' || this.phase === 'ended') throw new Error('No game running.');
    const team = ['dead-constellation', 'comets', 'probe'].includes(kind) ? 'crew' : ['living-constellation', 'drift-count', 'role-comets'].includes(kind) ? 'infiltrators' : null;
    this.clue = st.makeClue(this, this.random, team ? { team, kind } : null);
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
    this.announce('The Captain reset the ship. Back to the docking bay!', 'system');
  }

  // ---------------------------------------------------------------------------
  // Timers (called a few times per second by the server)
  // ---------------------------------------------------------------------------

  tick(now = Date.now()) {
    if (this.pausedRemaining != null) return false;
    const due = this.phaseEndsAt != null && now >= this.phaseEndsAt;
    const auto = this.autoAdvance;
    switch (this.phase) {
      case 'night': {
        if (!this.draft) {
          const minDone = now >= this.phaseStartedAt + this.dur('nightMin');
          if (due || (auto && minDone && this.allChosen())) {
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
        if (!due) return false;
        if (this.winner) this.end(now);
        else this.beginRoam(now);
        return true;
      case 'roam':
        if (!(auto && due)) return false;
        this.beginMeeting(now);
        return true;
      case 'meeting':
        if (!(auto && due)) return false;
        this.beginNominations(now);
        return true;
      case 'nominations':
        if (this.nomination) return this.tickNomination(now);
        if (!(auto && due)) return false;
        this.beginDusk(now);
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
      nominated: this.nominees.has(p.id),
      nominatedSomeone: this.nominators.has(p.id),
      role: this.phase === 'ended' ? p.role : undefined,
    }));
  }

  evilTeamFor(p) {
    if (!p.role || teamOf(p.role) !== 'infiltrators' || !this.evilInfoShared()) return null;
    return this.players.filter((o) => teamOf(o.role) === 'infiltrators').map((o) => ({ id: o.id, name: o.name, parasite: o.role === 'parasite' }));
  }

  baseView() {
    const nom = this.nomination;
    return {
      code: this.code,
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
        locked: nom.locked,
      },
      block: this.block,
      lastNomination: this.lastNomination,
      log: this.log.slice(-40),
      dawn: this.dawn,
      dusk: this.dusk,
      bubble: this.bubble,
      clue: this.clue,
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
      bluffs: p.role === 'parasite' && this.evilInfoShared() ? this.bluffs : null,
      manifest: p.role === 'mimic' ? this.mimicManifest : null,
      master: p.role === 'droid' ? p.master : null,
      tasksDone: this.tasksDone[pid] || [],
      drew: this.drawings.some((d) => d.author === pid && d.night === this.night && !d.published),
      hand: this.nomination ? !!this.nomination.hands[pid] : false,
    };
    return view;
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

module.exports = { Game, DEATH_ANIMS, DAY_PHASES };

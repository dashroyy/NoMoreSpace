// Game rules for No More Space.
// This file knows nothing about networking — it just holds the state of one
// game ("room") and the rules for changing it. That makes it easy to test.

const crypto = require('crypto');

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 15;

// Every role in the game. `night` is the action the role takes at night (or null).
const ROLES = {
  parasite: {
    name: 'The Parasite',
    team: 'infiltrator',
    night: 'kill',
    description: 'Each night (after the first), choose a crew member to consume. If the crew airlocks you, you lose.',
  },
  saboteur: {
    name: 'Saboteur',
    team: 'infiltrator',
    night: null,
    description: 'You know who the Parasite is. Lie, mislead, and keep it alive.',
  },
  medic: {
    name: 'Medic',
    team: 'crew',
    night: 'protect',
    description: 'Each night, choose a player to shield. They cannot be consumed tonight. Not the same player two nights in a row.',
  },
  scanner: {
    name: 'Scanner',
    team: 'crew',
    night: 'scan',
    description: 'Each night, scan one player to learn whether they are crew or infiltrator.',
  },
  captain: {
    name: 'Captain',
    team: 'crew',
    night: null,
    description: 'Your airlock vote counts twice.',
  },
  crew: {
    name: 'Crew Member',
    team: 'crew',
    night: null,
    description: 'No special ability. Talk, observe, and vote wisely.',
  },
};

const CREW_ROLE_ORDER = ['medic', 'scanner', 'captain'];

function randomId(bytes = 8) {
  return crypto.randomBytes(bytes).toString('hex');
}

function shuffle(list, random = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// How many saboteurs for a given player count (always exactly one Parasite).
function saboteurCount(playerCount) {
  return Math.max(1, Math.floor((playerCount - 2) / 3));
}

function buildRoleList(playerCount) {
  const roles = ['parasite'];
  for (let i = 0; i < saboteurCount(playerCount); i++) roles.push('saboteur');
  for (const role of CREW_ROLE_ORDER) {
    if (roles.length < playerCount) roles.push(role);
  }
  while (roles.length < playerCount) roles.push('crew');
  return roles;
}

class Room {
  constructor(code) {
    this.code = code;
    this.players = []; // { id, token, name, connected, alive, role, ghostVote, messages: [] }
    this.hostId = null;
    this.phase = 'lobby'; // lobby | night | day | ended
    this.round = 0;
    this.nightActions = {}; // playerId -> targetId
    this.votes = {}; // playerId -> targetId | 'skip'
    this.lastProtected = {}; // medicId -> targetId
    this.log = [];
    this.winner = null;
  }

  // ---------- helpers ----------

  getPlayer(id) {
    return this.players.find((p) => p.id === id);
  }

  alivePlayers() {
    return this.players.filter((p) => p.alive);
  }

  announce(text) {
    this.log.push({ round: this.round, phase: this.phase, text });
    if (this.log.length > 100) this.log.shift();
  }

  tell(player, text) {
    player.messages.push({ round: this.round, text });
  }

  // ---------- lobby ----------

  addPlayer(name) {
    if (this.phase !== 'lobby') throw new Error('The game has already started.');
    if (this.players.length >= MAX_PLAYERS) throw new Error('This ship is full.');
    const clean = String(name || '').trim().slice(0, 20);
    if (!clean) throw new Error('Pick a name first.');
    if (this.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error('That name is taken on this ship.');
    }
    const player = {
      id: randomId(),
      token: randomId(16),
      name: clean,
      connected: true,
      alive: true,
      role: null,
      ghostVote: true,
      messages: [],
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = player.id;
    return player;
  }

  removePlayer(id) {
    if (this.phase !== 'lobby') return; // mid-game, players stay seated
    this.players = this.players.filter((p) => p.id !== id);
    if (this.hostId === id) this.hostId = this.players[0]?.id ?? null;
  }

  start(byId, random = Math.random) {
    if (byId !== this.hostId) throw new Error('Only the host can launch the ship.');
    if (this.phase !== 'lobby') throw new Error('Already launched.');
    if (this.players.length < MIN_PLAYERS) {
      throw new Error(`Need at least ${MIN_PLAYERS} players.`);
    }

    const roles = shuffle(buildRoleList(this.players.length), random);
    this.players.forEach((p, i) => {
      p.role = roles[i];
      p.alive = true;
      p.ghostVote = true;
      p.messages = [];
    });

    // Infiltrators learn who each other are.
    const infiltrators = this.players.filter((p) => ROLES[p.role].team === 'infiltrator');
    for (const p of infiltrators) {
      const others = infiltrators.filter((o) => o !== p).map((o) => `${o.name} (${ROLES[o.role].name})`);
      this.tell(p, `Your fellow infiltrators: ${others.join(', ') || 'none'}.`);
    }

    this.round = 1;
    this.beginNight();
  }

  // ---------- night ----------

  beginNight() {
    this.phase = 'night';
    this.nightActions = {};
    this.announce(`Night ${this.round} falls. The ship's lights dim...`);
    this.maybeResolveNight();
  }

  // Players who still need to act tonight.
  pendingNightActors() {
    return this.alivePlayers().filter((p) => {
      const action = ROLES[p.role].night;
      if (!action) return false;
      if (action === 'kill' && this.round === 1) return false; // no kill on the first night
      if (action === 'protect' && this.round === 1) return false; // nothing to protect from yet
      return !(p.id in this.nightActions);
    });
  }

  nightAction(byId, targetId) {
    if (this.phase !== 'night') throw new Error('It is not night.');
    const actor = this.getPlayer(byId);
    const target = this.getPlayer(targetId);
    if (!actor || !actor.alive) throw new Error('You cannot act.');
    if (!target || !target.alive) throw new Error('Pick a living player.');
    if (!this.pendingNightActors().includes(actor)) throw new Error('You have nothing to do tonight.');

    const action = ROLES[actor.role].night;
    if (action === 'kill' && target.id === actor.id) throw new Error('You cannot consume yourself.');
    if (action === 'scan' && target.id === actor.id) throw new Error('You already know yourself.');
    if (action === 'protect' && this.lastProtected[actor.id] === target.id) {
      throw new Error('You shielded them last night. Pick someone else.');
    }

    this.nightActions[actor.id] = target.id;
    this.maybeResolveNight();
  }

  maybeResolveNight() {
    if (this.phase === 'night' && this.pendingNightActors().length === 0) this.resolveNight();
  }

  resolveNight() {
    let killTarget = null;
    const protectedIds = new Set();

    for (const [actorId, targetId] of Object.entries(this.nightActions)) {
      const actor = this.getPlayer(actorId);
      const target = this.getPlayer(targetId);
      const action = ROLES[actor.role].night;
      if (action === 'kill') killTarget = target;
      if (action === 'protect') {
        protectedIds.add(target.id);
        this.lastProtected[actor.id] = target.id;
      }
      if (action === 'scan') {
        const team = ROLES[target.role].team === 'infiltrator' ? 'an INFILTRATOR' : 'crew';
        this.tell(actor, `Scan result: ${target.name} is ${team}.`);
      }
    }

    if (killTarget && !protectedIds.has(killTarget.id)) {
      killTarget.alive = false;
      this.announce(`Morning. ${killTarget.name} was found drifting outside the hull.`);
    } else {
      this.announce('Morning. Everyone made it through the night.');
    }

    if (!this.checkWin()) this.beginDay();
  }

  // ---------- day ----------

  beginDay() {
    this.phase = 'day';
    this.votes = {};
    this.announce(`Day ${this.round}. Discuss, then vote on who to airlock.`);
  }

  canVote(player) {
    return player.alive || player.ghostVote;
  }

  pendingVoters() {
    return this.players.filter((p) => this.canVote(p) && !(p.id in this.votes));
  }

  vote(byId, targetId) {
    if (this.phase !== 'day') throw new Error('Voting happens during the day.');
    const voter = this.getPlayer(byId);
    if (!voter || !this.canVote(voter)) throw new Error('You have no vote left.');
    if (byId in this.votes) throw new Error('You already voted.');
    if (targetId !== 'skip') {
      const target = this.getPlayer(targetId);
      if (!target || !target.alive) throw new Error('Pick a living player or skip.');
    }
    this.votes[byId] = targetId;
    if (!voter.alive) voter.ghostVote = false; // dead players get one vote for the rest of the game
    if (this.pendingVoters().length === 0) this.resolveDay();
  }

  // Host can close voting early (e.g. someone is AFK).
  endDay(byId) {
    if (byId !== this.hostId) throw new Error('Only the host can close the vote.');
    if (this.phase !== 'day') throw new Error('It is not day.');
    this.resolveDay();
  }

  resolveDay() {
    const tally = {};
    for (const [voterId, targetId] of Object.entries(this.votes)) {
      const weight = this.getPlayer(voterId).role === 'captain' && this.getPlayer(voterId).alive ? 2 : 1;
      tally[targetId] = (tally[targetId] || 0) + weight;
    }

    const needed = Math.ceil(this.alivePlayers().length / 2);
    const ranked = Object.entries(tally)
      .filter(([id]) => id !== 'skip')
      .sort((a, b) => b[1] - a[1]);
    const [top, second] = ranked;
    const skipVotes = tally.skip || 0;

    if (top && top[1] >= needed && top[1] > skipVotes && (!second || top[1] > second[1])) {
      const ejected = this.getPlayer(top[0]);
      ejected.alive = false;
      this.announce(`${ejected.name} was airlocked with ${top[1]} votes.`);
    } else {
      this.announce(`No one was airlocked (needed ${needed} votes and a clear majority).`);
    }

    if (!this.checkWin()) {
      this.round += 1;
      this.beginNight();
    }
  }

  // ---------- winning ----------

  checkWin() {
    const parasite = this.players.find((p) => p.role === 'parasite');
    if (!parasite.alive) return this.end('crew', 'The Parasite is gone. The crew survives!');
    if (this.alivePlayers().length <= 2) {
      return this.end('infiltrator', 'Only two remain. The Parasite has taken the ship.');
    }
    return false;
  }

  end(winner, text) {
    this.phase = 'ended';
    this.winner = winner;
    this.announce(text);
    return true;
  }

  // ---------- what each player is allowed to see ----------

  viewFor(playerId) {
    const me = this.getPlayer(playerId);
    const ended = this.phase === 'ended';
    const myRole = me?.role ? { key: me.role, ...ROLES[me.role] } : null;

    return {
      code: this.code,
      phase: this.phase,
      round: this.round,
      hostId: this.hostId,
      winner: this.winner,
      minPlayers: MIN_PLAYERS,
      log: this.log,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        alive: p.alive,
        canVote: this.canVote(p),
        hasVoted: p.id in this.votes,
        // Roles stay secret until the game ends.
        role: ended ? ROLES[p.role].name : undefined,
        team: ended ? ROLES[p.role].team : undefined,
      })),
      you: me
        ? {
            id: me.id,
            role: myRole,
            alive: me.alive,
            canVote: this.canVote(me),
            hasVoted: me.id in this.votes,
            mustActTonight: this.phase === 'night' && this.pendingNightActors().includes(me),
            messages: me.messages,
          }
        : null,
    };
  }
}

module.exports = { Room, ROLES, MIN_PLAYERS, MAX_PLAYERS, buildRoleList, saboteurCount };

// Ruler of the Galaxy: the rules.
//
// One long async function runs the game (run). Whenever someone has to decide something (which dice to keep,
// whether to hold the Core or yield it, what to buy) it asks them (ask) and waits for the answer; robots, and
// people who are away, are answered by bots.js. The server rolls every die and checks every answer.
//
// A turn: roll six dice up to three times, keeping any between rolls; then they count, in this order:
//   triplets of 1/2/3  -> Dominion Stars        repairs -> Hull (not inside the Core); three of them -> an Evolution
//   lasers             -> damage                shards  -> Dark Matter
// Lasers from outside hit whoever holds the Core (and the Pulsar); lasers from inside hit everyone outside.
// Someone hit in the Core may yield: they leave, and the attacker takes their seat. An empty Core must be
// entered. Holding it pays 1 Star on the way in and 2 at the start of each of your turns, but you cannot repair.
// Then you may spend Dark Matter in the Bazaar. First to the Star target, or the last ship flying, wins.

const { FACES, CONTENDERS, CARDS, ANOMALIES, GHOST_FACES, START_HULL, MAX_HULL_CAP, TARGETS, cardDef, contenderDef, evolutionDef, anomalyDef } = require('./data');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const DICE = 6;
const ROLLS = 3;
const LOG_KEEP = 90;
const EMOTES = ['😂', '😱', '👏', '🔥', '😈', '🤔', '😭', '🎉'];

// How long (ms) people get to answer before a robot answers for them. "pace" scales every pause.
const TIMERS = { dice: 60_000, buy: 45_000, yield: 15_000, evolve: 30_000, grapple: 12_000 };
const NAMES = ['Nova', 'Orbit', 'Zip', 'Comet', 'Quasar', 'Pixel', 'Blip', 'Cosmo', 'Widget', 'Lumen', 'Static', 'Pogo'];
const BOT_AVATARS = ['🤖', '👾', '🛸', '🦾', '🪐', '☄️'];
const AVATARS = ['🧑‍🚀', '👩‍🚀', '🐱', '🐶', '🦊', '🐸', '🐼', '🦄', '🐙', '🦖', '🐧', '🦉'];

const sleepFor = (ms) => new Promise((r) => setTimeout(r, ms).unref?.());

function cleanName(name) {
  return String(name || '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 18);
}

// Count the faces showing on a set of dice
function tally(dice) {
  const c = { 1: 0, 2: 0, 3: 0, repair: 0, laser: 0, shard: 0 };
  for (const d of dice) if (d.face) c[d.face] += 1;
  return c;
}

class RulerGame {
  constructor(code, { rng = Math.random, pace = 1, chooser = null } = {}) {
    this.code = code;
    this.rng = rng;
    this.pace = pace; // 1 = normal; 0 = no waiting at all (tests)
    this.chooser = chooser; // tests: (game, player, request) => answer, used instead of people and bots
    this.version = 0;
    this.phase = 'lobby'; // lobby | playing | ended
    this.players = [];
    this.spectators = [];
    this.hostId = null;
    this.core = null; // who holds the Galactic Core
    this.pulsar = null; // who holds the Binary Pulsar (5-6 players)
    this.pulsarOpen = false;
    this.deck = [];
    this.market = [];
    this.discard = [];
    this.round = 0;
    this.anomaly = null;
    this.anomalyDeck = [];
    this.turn = null;
    this.pending = new Map();
    this.log = [];
    this.seq = 0;
    this.uids = 0;
    this.winner = null;
    this.winKind = null;
    this.chat = [];
    this.stats = { turns: 0, damage: 0, entries: 0, yields: 0, destroyed: 0, bought: 0 };
    this.settings = { speed: 'normal', target: 20, evolutions: true, anomalies: true, ghosts: true, blitz: false };
    this.onChange = () => {};
    this.running = null;
    this.stopped = false;
    this.nameCount = 0;
    this.practice = false;
  }

  // ----- small helpers -----
  r() {
    return this.rng();
  }
  shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.r() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }
  uid() {
    this.uids += 1;
    return `u${this.uids}`;
  }
  face() {
    return FACES[Math.floor(this.r() * 6)];
  }
  changed() {
    this.version += 1;
    this.onChange();
  }
  async wait(ms) {
    const t = ms * this.pace;
    if (t > 0 && !this.stopped) await sleepFor(t);
    else await Promise.resolve();
  }
  get(id) {
    return this.players.find((p) => p.id === id) || null;
  }
  get alive() {
    return this.players.filter((p) => p.alive);
  }
  rivals(p) {
    return this.players.filter((o) => o.alive && o.id !== p.id);
  }
  isAuto(p) {
    return p.isBot || !p.connected || p.afk;
  }
  has(p, hook) {
    return p.cards.some((c) => cardDef(c.id)?.hook === hook);
  }
  count(p, hook) {
    return p.cards.filter((c) => cardDef(c.id)?.hook === hook).length;
  }
  evolved(p, id) {
    return p.evolutions.includes(id);
  }
  inside(p) {
    return p.where === 'core' || p.where === 'pulsar';
  }
  say(text, extra = {}) {
    this.seq += 1;
    this.log.push({ seq: this.seq, text, at: Date.now(), ...extra });
    if (this.log.length > LOG_KEEP) this.log.shift();
    this.changed();
  }

  // ---------------------------------------------------------------------------
  // The lobby
  // ---------------------------------------------------------------------------
  addPlayer(name, { isBot = false } = {}) {
    if (this.phase !== 'lobby') throw new Error('The game has already started.');
    if (this.players.length >= MAX_PLAYERS) throw new Error('The galaxy is full (6 contenders).');
    const taken = new Set(this.players.map((p) => p.avatar));
    const pool = isBot ? BOT_AVATARS : AVATARS;
    const p = {
      id: `p${++this.nameCount}${Math.floor(this.r() * 1e6).toString(36)}`,
      token: Math.floor(this.r() * 1e12).toString(36) + Date.now().toString(36),
      name: cleanName(name) || (isBot ? this.botName() : `Player ${this.players.length + 1}`),
      isBot,
      connected: !isBot,
      afk: false,
      avatar: pool.find((a) => !taken.has(a)) || pool[0],
      contender: null,
      wins: 0,
    };
    this.resetPlayer(p);
    this.players.push(p);
    if (!this.hostId && !isBot) this.hostId = p.id;
    this.changed();
    return p;
  }

  resetPlayer(p) {
    p.hull = START_HULL;
    p.maxHull = START_HULL;
    p.stars = 0;
    p.shards = 0;
    p.alive = true;
    p.ghost = false;
    p.where = 'rim';
    p.cards = [];
    p.evolutions = [];
    p.slipReady = false;
    p.extraTurn = false;
    p.afk = false;
  }

  addSpectator(name) {
    const s = { id: `s${++this.nameCount}${Math.floor(this.r() * 1e6).toString(36)}`, token: Math.floor(this.r() * 1e12).toString(36), name: cleanName(name) || 'Watcher', connected: true };
    this.spectators.push(s);
    this.changed();
    return s;
  }

  botName() {
    const used = new Set(this.players.map((p) => p.name));
    return NAMES.find((n) => !used.has(n)) || `Bot ${this.players.length + 1}`;
  }

  addBot(byId) {
    this.requireHost(byId);
    return this.addPlayer(this.botName(), { isBot: true });
  }

  removePlayer(id) {
    if (this.phase === 'lobby') {
      this.players = this.players.filter((p) => p.id !== id);
      if (this.hostId === id) this.hostId = this.players.find((p) => !p.isBot)?.id || null;
      this.changed();
    } else {
      const p = this.get(id);
      if (p) {
        p.connected = false;
        if (this.hostId === id) this.hostId = this.players.find((x) => !x.isBot && x.connected && x.id !== id)?.id || this.hostId;
        this.changed();
      }
    }
    this.spectators = this.spectators.filter((s) => s.id !== id);
  }

  wake(id) {
    const p = this.get(id);
    if (p && p.afk) {
      p.afk = false;
      this.say(`${p.name} is back at the helm.`, { k: 'afk', pid: id });
    }
  }

  requireHost(id) {
    if (id !== this.hostId) throw new Error('Only the host can do that.');
  }

  rename(id, name) {
    const p = this.get(id) || this.spectators.find((s) => s.id === id);
    if (p && cleanName(name)) p.name = cleanName(name);
    this.changed();
  }

  // pick your contender in the lobby (each one can only be played once)
  choose(id, contenderId) {
    if (this.phase !== 'lobby') throw new Error('The game has already started.');
    const p = this.get(id);
    if (!p) throw new Error('Join the game first.');
    if (contenderId == null) {
      p.contender = null;
      return this.changed();
    }
    if (!contenderDef(contenderId)) throw new Error('Unknown contender.');
    const holder = this.players.find((x) => x.contender === contenderId && x.id !== id);
    if (holder) {
      if (!holder.isBot) throw new Error(`${holder.name} has already picked them.`);
      holder.contender = null; // a robot lets a person have it
    }
    p.contender = contenderId;
    this.changed();
  }

  setSettings(byId, s = {}) {
    this.requireHost(byId);
    if (this.phase !== 'lobby') throw new Error('Change the rules in the lobby.');
    if (s.speed != null) {
      if (!['chill', 'normal', 'quick'].includes(s.speed)) throw new Error('Unknown speed.');
      this.settings.speed = s.speed;
    }
    if (s.target != null) {
      if (!TARGETS.includes(Number(s.target))) throw new Error('The Star target is 15, 20 or 25.');
      this.settings.target = Number(s.target);
    }
    for (const k of ['evolutions', 'anomalies', 'ghosts', 'blitz']) if (s[k] != null) this.settings[k] = !!s[k];
    this.changed();
  }

  timeoutFor(kind) {
    const k = { chill: 1.8, normal: 1, quick: 0.5 }[this.settings.speed] || 1;
    return Math.round(TIMERS[kind] * k * (this.settings.blitz ? 0.5 : 1));
  }

  get target() {
    return this.settings.blitz ? 15 : this.settings.target;
  }

  start(byId) {
    this.requireHost(byId);
    if (this.phase !== 'lobby') throw new Error('Already started.');
    if (this.players.length < MIN_PLAYERS) throw new Error('You need at least 2 contenders (add a robot!).');
    this.setup();
    this.running = this.run().catch((err) => {
      console.error('[ruler] game crashed:', err);
      this.say('💥 A rift tore through the galaxy and the game had to stop. Sorry!', { k: 'error' });
      this.phase = 'ended';
      this.changed();
    });
  }

  setup() {
    this.stopped = false;
    this.winner = null;
    this.winKind = null;
    this.round = 0;
    this.anomaly = null;
    this.anomalyDeck = [];
    this.core = null;
    this.pulsar = null;
    this.stats = { turns: 0, damage: 0, entries: 0, yields: 0, destroyed: 0, bought: 0 };
    // contenders: people keep theirs, everyone else gets one of the rest
    const free = this.shuffle(CONTENDERS.map((c) => c.id).filter((id) => !this.players.some((p) => p.contender === id)));
    for (const p of this.players) if (!p.contender) p.contender = free.shift();
    for (const p of this.players) {
      this.resetPlayer(p);
      const blitz = this.settings.blitz;
      p.maxHull = blitz ? 8 : START_HULL;
      if (p.contender === 'mechanova') p.maxHull += 1;
      p.hull = p.maxHull;
      if (blitz) p.shards += 3;
      if (p.contender === 'stareater') p.shards += 2;
      if (p.contender === 'chronos') p.slipReady = true;
    }
    this.shuffle(this.players); // who goes first
    this.pulsarOpen = this.players.length >= 5;
    this.deck = this.shuffle(CARDS.map((c) => ({ uid: this.uid(), id: c.id })));
    this.discard = [];
    this.market = [];
    this.fillMarket();
    this.phase = 'playing';
    this.say(`🌌 ${this.players.length} contenders converge on the Galactic Core. First to ${this.target} Stars rules the galaxy!`, { k: 'start' });
  }

  // back to the lobby for another game with the same people
  toLobby(byId) {
    this.requireHost(byId);
    if (this.phase !== 'ended') throw new Error('The game is still going.');
    this.players = this.players.filter((p) => p.isBot || p.connected);
    for (const p of this.players) {
      this.resetPlayer(p);
      if (p.isBot) p.contender = null;
    }
    this.phase = 'lobby';
    this.turn = null;
    this.core = null;
    this.pulsar = null;
    this.winner = null;
    this.winKind = null;
    this.log = [];
    this.anomaly = null;
    this.running = null;
    this.changed();
  }

  destroy() {
    this.stopped = true;
    for (const rec of [...this.pending.values()]) rec.finish(this.safeAnswer(rec.req));
  }

  // ---------------------------------------------------------------------------
  // Asking people (and robots)
  // ---------------------------------------------------------------------------
  ask(pid, req, timeoutKind) {
    const p = this.get(pid);
    const rid = `r${++this.uids}`;
    return new Promise((resolve) => {
      const record = { pid, req: { rid, pid, ...req }, resolve, timer: null, bot: null };
      this.pending.set(rid, record);
      const finish = (answer) => {
        if (!this.pending.has(rid)) return;
        clearTimeout(record.timer);
        clearTimeout(record.bot);
        this.pending.delete(rid);
        this.changed();
        resolve(answer);
      };
      record.finish = finish;
      const auto = () => {
        const answer = this.autoAnswer(p, record.req);
        finish(answer && !this.validate(record.req, answer) ? answer : this.safeAnswer(record.req));
      };
      if (this.stopped) return finish(this.safeAnswer(record.req));
      if (this.chooser) {
        Promise.resolve().then(() => {
          const answer = this.chooser(this, p, record.req);
          finish(answer && !this.validate(record.req, answer) ? answer : this.safeAnswer(record.req));
        });
      } else if (this.isAuto(p)) {
        const think = { dice: 1100, buy: 1300, yield: 900, evolve: 1000, grapple: 800 }[req.type] || 900;
        record.bot = setTimeout(auto, think * this.pace * (0.6 + this.r() * 0.8));
        record.bot.unref?.();
      } else {
        const ms = this.timeoutFor(timeoutKind || req.type);
        record.req.until = Date.now() + ms;
        record.timer = setTimeout(() => {
          // nobody wants a robot making their big calls: a silent "hold" stays put, a silent shop leaves the shop
          if (req.type === 'yield') return finish({ yield: false });
          if (req.type === 'grapple') return finish({ grapple: false });
          if ((req.type === 'dice' || req.type === 'buy') && !p.afk) {
            p.afk = true;
            this.say(`💤 ${p.name} went quiet, so a robot is flying for them.`, { k: 'afk', pid: p.id });
          }
          auto();
        }, ms);
        record.timer.unref?.();
      }
      this.changed();
    });
  }

  respond(pid, rid, answer) {
    const rec = this.pending.get(rid);
    if (!rec || rec.pid !== pid) return 'That question is no longer open.';
    const err = this.validate(rec.req, answer);
    if (err) return err;
    const p = this.get(pid);
    if (p) p.afk = false;
    rec.finish(answer);
    return null;
  }

  validate(req, a) {
    if (!a || typeof a !== 'object') return 'Bad answer.';
    const p = this.get(req.pid);
    switch (req.type) {
      case 'dice': {
        const t = this.turn;
        if (!t || t.pid !== p.id) return 'It is not your turn.';
        if (a.action === 'roll') {
          if (t.rollsLeft <= 0) return 'No rolls left.';
          if (a.keep != null && (!Array.isArray(a.keep) || !a.keep.every((i) => Number.isInteger(i) && i >= 0 && i < t.dice.length))) return 'Keep which dice?';
          if (!t.rolled && a.keep?.length) return 'Roll first.';
          return null;
        }
        if (a.action === 'resolve') return t.rolled ? null : 'Roll first.';
        if (a.action === 'critical') {
          if (!this.evolved(p, 'critical') || t.criticalUsed) return 'You cannot do that now.';
          if (!t.rolled) return 'Roll first.';
          if (!Number.isInteger(a.die) || a.die < 0 || a.die >= t.dice.length) return 'Which die?';
          if (a.face !== 'laser' && a.face !== 'shard') return 'Laser or Shard?';
          return null;
        }
        return 'Roll or resolve.';
      }
      case 'buy': {
        if (a.action === 'done') return null;
        if (a.action === 'flush') return p.shards >= this.flushCost(p) ? null : 'Not enough Dark Matter to flush the Bazaar.';
        if (a.action === 'heal') {
          if (!this.has(p, 'bay')) return 'You need a Rapid Repair Bay.';
          if (p.hull >= p.maxHull) return 'Your hull is already full.';
          return p.shards >= 2 ? null : 'Healing costs 2 Dark Matter.';
        }
        if (a.action === 'buy') {
          const c = this.market.find((x) => x.uid === a.uid);
          if (!c) return 'That card is not in the Bazaar.';
          return p.shards >= this.price(p, c.id) ? null : 'Not enough Dark Matter.';
        }
        return 'Buy, flush or done.';
      }
      case 'yield':
        if (a.yield && !this.canYield(p)) return 'Siege Mode: you can only yield at 3 Hull or less.';
        return null;
      case 'grapple':
        if (a.grapple && p.shards < 2) return 'The grapple costs 2 Dark Matter.';
        return null;
      case 'evolve':
        return req.options.some((o) => o.id === a.id) ? null : 'Choose one of the evolutions.';
      default:
        return 'Unknown question.';
    }
  }

  safeAnswer(req) {
    switch (req.type) {
      case 'dice':
        return this.turn?.rolled ? { action: 'resolve' } : { action: 'roll', keep: [] };
      case 'buy':
        return { action: 'done' };
      case 'yield':
        return { yield: false };
      case 'grapple':
        return { grapple: false };
      case 'evolve':
        return { id: req.options[0]?.id };
      default:
        return {};
    }
  }

  autoAnswer(p, req) {
    const { decide } = require('./bots');
    try {
      return decide(this, p, req);
    } catch (err) {
      console.error('[ruler] robot error:', err);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // The game
  // ---------------------------------------------------------------------------
  async run() {
    await this.wait(900);
    let i = 0;
    let first = true;
    while (!this.winner && !this.stopped) {
      if (i === 0) await this.newRound(first);
      first = false;
      const p = this.players[i];
      if (p.alive) {
        await this.takeTurn(p);
        while (p.extraTurn && p.alive && !this.winner && !this.stopped) {
          p.extraTurn = false;
          this.say(`🔥 ${p.name} goes again!`, { k: 'extra', pid: p.id });
          await this.takeTurn(p);
        }
      } else if (p.ghost && this.settings.ghosts) await this.ghostTurn(p);
      i = (i + 1) % this.players.length;
    }
    this.finish();
  }

  async newRound(first) {
    this.round += 1;
    this.anomaly = null;
    if (!first && this.settings.anomalies && this.round % 3 === 0) {
      if (!this.anomalyDeck.length) this.anomalyDeck = this.shuffle(ANOMALIES.map((a) => a.id));
      this.anomaly = this.anomalyDeck.shift();
      const a = anomalyDef(this.anomaly);
      this.say(`${a.art} Cosmic anomaly: ${a.name}! ${a.text}`, { k: 'anomaly', id: a.id });
      await this.wait(1800);
      if (a.id === 'wormhole') {
        for (const slot of ['core', 'pulsar']) {
          const holder = this.get(this[slot]);
          if (holder) {
            holder.where = 'rim';
            this[slot] = null;
            this.say(`🌀 ${holder.name} is flung out of the ${slot === 'core' ? 'Core' : 'Pulsar'}!`, { k: 'flung', pid: holder.id, from: slot });
          }
        }
        await this.wait(900);
      }
    } else if (this.round > 1) this.say(`🛰️ Orbit ${this.round}`, { k: 'round', n: this.round });
  }

  async takeTurn(p) {
    this.stats.turns += 1;
    const dice = DICE + this.count(p, 'extraDie');
    let rolls = ROLLS + this.count(p, 'extraRoll');
    let slip = false;
    if (p.contender === 'chronos' && p.slipReady) {
      rolls += 1;
      p.slipReady = false;
      slip = true;
    }
    this.turn = { pid: p.id, rollsLeft: rolls, rolls, dice: Array.from({ length: dice }, () => ({ face: null, kept: false })), rolled: false, stage: 'roll', damage: 0, lasers: 0, criticalUsed: false, slip };
    this.say(`🚀 ${p.name}'s turn`, { k: 'turn', pid: p.id });
    if (slip) this.say(`⏳ Temporal Slip: ${p.name} gets a 4th roll this turn.`, { k: 'slip', pid: p.id });
    await this.wait(500);

    // holding the Core (or the Pulsar) pays at the start of your turn
    if (this.inside(p)) {
      const n = (this.evolved(p, 'siege') && p.where === 'core' ? 3 : 2) + this.count(p, 'throne');
      this.gainStars(p, n, p.where === 'core' ? 'holds the Core' : 'holds the Pulsar');
      await this.wait(700);
      if (this.checkWin()) return;
    }

    // roll
    while (!this.winner && !this.stopped) {
      const t = this.turn;
      if (t.rollsLeft <= 0) break;
      const a = await this.ask(p.id, { type: 'dice' });
      if (a.action === 'resolve') break;
      if (a.action === 'critical') {
        t.criticalUsed = true;
        t.dice[a.die].face = a.face;
        this.say(`☀️ Critical Mass: ${p.name} burns 1 Hull to turn a die into a ${a.face === 'laser' ? 'Laser' : 'Shard'}.`, { k: 'critical', pid: p.id });
        this.hurt(p, 1, null, 'self');
        if (!p.alive) break;
        continue;
      }
      const keep = new Set(t.rolled ? a.keep || [] : []);
      t.dice.forEach((d, i) => {
        d.kept = keep.has(i);
        if (!d.kept) d.face = this.face();
      });
      t.rolled = true;
      t.rollsLeft -= 1;
      t.rollId = (t.rollId || 0) + 1;
      this.say(`🎲 ${p.name} rolls`, { k: 'roll', pid: p.id, faces: t.dice.map((d) => d.face), kept: [...keep], left: t.rollsLeft });
      await this.wait(1300);
    }
    if (!p.alive || this.winner || this.stopped) return this.endTurn(p);

    this.turn.stage = 'resolve';
    for (const d of this.turn.dice) d.kept = true;
    this.changed();
    await this.resolve(p);
    if (this.winner || this.stopped) return;
    if (p.alive) {
      this.turn.stage = 'buy';
      await this.shop(p);
    }
    this.endTurn(p);
  }

  endTurn(p) {
    if (p.alive && !this.winner) {
      const t = this.turn;
      if (this.has(p, 'sails') && p.shards === 0) this.gainShards(p, 1, 'Solar Sails');
      if (this.has(p, 'hoard') && p.shards >= 6) this.gainStars(p, Math.floor(p.shards / 6) * this.count(p, 'hoard'), 'Dark Matter Hoard');
      if (this.anomaly === 'collapse' && p.where === 'rim' && t && !t.lasers) {
        this.say(`🕳️ Gravity Collapse crushes ${p.name}'s hull.`, { k: 'collapse', pid: p.id });
        this.hurt(p, 1, null, 'anomaly');
      }
    }
    this.checkWin();
    this.turn = this.winner ? this.turn : null;
    this.changed();
  }

  // ----- the dice count -----
  async resolve(p) {
    const t = this.turn;
    const c = tally(t.dice);
    this.say(`✨ ${p.name}'s dice: ${['1', '2', '3'].map((n) => (c[n] ? `${c[n]}×${n}` : null)).filter(Boolean).concat(c.repair ? [`${c.repair}🛡️`] : [], c.laser ? [`${c.laser}🎯`] : [], c.shard ? [`${c.shard}⚡`] : []).join(' ') || 'nothing'}`, { k: 'resolve', pid: p.id, faces: t.dice.map((d) => d.face) });
    await this.wait(600);

    // 1. triplets
    for (const n of [1, 2, 3]) {
      const k = c[n];
      if (k >= 3) {
        const stars = n + (k - 3) + this.count(p, 'echo');
        this.gainStars(p, stars, `${k}× ${n}`);
        await this.wait(500);
      }
    }
    if (this.evolved(p, 'paradox') && c[1] && c[2] && c[3]) {
      this.say(`⏳ Paradox Loop! ${p.name} folds time.`, { k: 'paradox', pid: p.id });
      this.gainStars(p, 2, 'Paradox Loop');
      this.gainShards(p, 2, 'Paradox Loop');
      await this.wait(500);
    }
    if (this.checkWin()) return;

    // 2. repairs (and evolutions)
    if (c.repair) {
      if (p.where === 'rim') {
        let n = c.repair + this.count(p, 'drones');
        if (this.evolved(p, 'brood') && c.repair >= 2) n += 1;
        this.heal(p, n, 'Nanite Repair');
      } else this.say(`☢️ Radiation lock: ${p.name} cannot repair inside the ${p.where === 'core' ? 'Core' : 'Pulsar'}.`, { k: 'locked', pid: p.id });
      await this.wait(500);
      if (c.repair >= 3) {
        if (this.evolved(p, 'impactors') && p.where === 'core') {
          this.say(`🪨 Kinetic Impactors! ${p.name} hurls rock at everyone outside.`, { k: 'impactors', pid: p.id });
          await this.volley(p, this.rivals(p).filter((o) => o.where === 'rim'), 2, 'impactors');
        }
        if (this.settings.evolutions) await this.evolve(p);
        if (this.winner || !p.alive) return;
      }
    }

    // 3. lasers
    t.lasers = c.laser;
    let dmg = c.laser;
    if (c.laser >= 4 && this.evolved(p, 'prominence')) this.gainStars(p, 2, 'Solar Prominence');
    if (c.laser >= 3) dmg += this.count(p, 'ion');
    if (c.laser >= 1) dmg += this.count(p, 'railgun');
    dmg += this.count(p, 'ram');
    if (this.anomaly === 'flare') dmg *= 2;
    if (this.anomaly === 'summit' && dmg > 0) {
      this.say(`🕊️ Peace Summit: ${p.name}'s weapons stay quiet.`, { k: 'summit', pid: p.id });
      dmg = 0;
    }
    if (dmg > 0) {
      const targets = this.inside(p) ? this.rivals(p).filter((o) => o.where === 'rim') : this.rivals(p).filter((o) => this.inside(o));
      if (targets.length) await this.attack(p, targets, dmg);
      else this.say(`🎯 ${p.name}'s lasers find nobody to hit.`, { k: 'miss', pid: p.id });
      if (this.winner || this.stopped || !p.alive) return;
    }

    // 4. Dark Matter
    if (c.shard) {
      let n = c.shard + this.count(p, 'feeder');
      if (this.anomaly === 'nebula') n += 1;
      this.gainShards(p, n, 'Dark Matter');
      await this.wait(400);
    }

    // 5. an empty Core (or Pulsar) must be taken
    if (p.alive && p.where === 'rim') {
      if (!this.core) this.enter(p, 'core');
      else if (this.pulsarOpen && !this.pulsar) this.enter(p, 'pulsar');
      await this.wait(700);
    }
    this.checkWin();
  }

  // lasers hit every target; the ones inside may then yield to the attacker
  async attack(p, targets, dmg) {
    this.stats.damage += dmg * targets.length;
    this.say(`🎯 ${p.name} fires ${dmg} at ${targets.map((o) => o.name).join(', ')}!`, { k: 'laser', pid: p.id, targets: targets.map((o) => o.id), n: dmg });
    await this.wait(900);
    const hit = [];
    for (const o of targets) {
      const before = o.hull;
      const done = this.hurt(o, dmg, p, 'laser');
      if (done > 0) {
        hit.push(o);
        this.turn.damage += done;
        if (this.has(p, 'siphon') && this.inside(o) && o.shards > 0) {
          o.shards -= 1;
          p.shards += 1;
          this.say(`🧲 ${p.name} siphons 1 Dark Matter from ${o.name}.`, { k: 'steal', pid: p.id, from: o.id, n: 1 });
        }
        if (this.evolved(p, 'leech') && (!o.alive || (before >= 3 && o.hull < 3))) this.heal(p, 2, 'Bio-Leech Tendrils', true);
      }
    }
    if (hit.length && this.has(p, 'banner')) this.gainStars(p, this.count(p, 'banner'), 'Warlord Banner');
    if (this.turn.damage >= 3 && this.evolved(p, 'spores')) for (const o of hit) this.loseStars(o, 1, p, 'Void Spores');
    if (this.checkWin()) return;
    await this.wait(400);

    // whoever was hit inside may yield to an attacker from outside
    if (p.where !== 'rim' || !p.alive) return;
    let seatTaken = false;
    for (const slot of ['core', 'pulsar']) {
      const o = this.get(this[slot]);
      if (!o || !o.alive || !hit.includes(o)) continue;
      const a = await this.ask(o.id, { type: 'yield', attacker: p.id, slot, hull: o.hull, damage: dmg });
      if (this.stopped) return;
      if (a.yield) {
        // the Kraken can hold them in place
        if (this.evolved(p, 'grapple') && p.shards >= 2) {
          const g = await this.ask(p.id, { type: 'grapple', victim: o.id });
          if (g.grapple && p.shards >= 2) {
            p.shards -= 2;
            this.say(`🦑 Hyperspace Grapple! ${p.name} pays 2 Dark Matter and keeps ${o.name} trapped inside.`, { k: 'grapple', pid: p.id, victim: o.id });
            await this.wait(700);
            continue;
          }
        }
        this.stats.yields += 1;
        o.where = 'rim';
        this[slot] = null;
        this.say(`🏳️ ${o.name} yields the ${slot === 'core' ? 'Core' : 'Pulsar'} and warps out!`, { k: 'yield', pid: o.id, from: slot, to: p.id });
        await this.wait(600);
        if (p.contender === 'kraken' && o.shards > 0) {
          o.shards -= 1;
          p.shards += 1;
          this.say(`🦑 Abyssal Hunger: ${p.name} drinks 1 Dark Matter from ${o.name}.`, { k: 'steal', pid: p.id, from: o.id, n: 1 });
        }
        if (this.evolved(o, 'ejection')) {
          this.say(`☀️ Supernova Ejection! ${o.name} blasts everyone on the way out.`, { k: 'ejection', pid: o.id });
          await this.volley(o, this.rivals(o), 1, 'ejection');
          if (this.winner || !p.alive) return;
        }
        // the attacker takes the seat (only one: if both yield, the Pulsar stays empty)
        if (!seatTaken && p.alive && p.where === 'rim') {
          seatTaken = true;
          this.enter(p, slot);
          await this.wait(700);
        }
      } else {
        this.say(`💪 ${o.name} holds the ${slot === 'core' ? 'Core' : 'Pulsar'}!`, { k: 'hold', pid: o.id, slot });
        if (this.evolved(o, 'thorns') && slot === 'core' && p.alive) {
          this.say(`🤖 Thorns of the Core: ${o.name} hits back!`, { k: 'thorns', pid: o.id, target: p.id });
          this.hurt(p, 1, o, 'thorns');
        }
        await this.wait(500);
      }
      if (this.checkWin()) return;
    }
  }

  // one source hits several ships for the same damage (cards, evolutions)
  async volley(p, targets, dmg, kind) {
    if (!targets.length || dmg <= 0) return;
    this.say(`💥 ${dmg} damage to ${targets.map((o) => o.name).join(', ')}`, { k: 'volley', pid: p.id, targets: targets.map((o) => o.id), n: dmg, kind });
    await this.wait(600);
    for (const o of targets) this.hurt(o, dmg, p, kind);
    this.checkWin();
    await this.wait(300);
  }

  enter(p, slot) {
    this[slot] = p.id;
    p.where = slot;
    this.stats.entries += 1;
    if (p.contender === 'chronos') p.slipReady = true;
    this.say(`👑 ${p.name} docks in the ${slot === 'core' ? 'Galactic Core' : 'Binary Pulsar'}!`, { k: 'enter', pid: p.id, slot });
    this.gainStars(p, this.anomaly === 'flare' ? 3 : 1, slot === 'core' ? 'entering the Core' : 'entering the Pulsar');
  }

  // ----- damage, healing, Stars, Dark Matter -----
  // returns how much damage really landed
  hurt(o, amount, by, kind) {
    if (!o.alive || amount <= 0) return 0;
    let n = amount;
    if (by && by.id !== o.id) {
      if (this.has(o, 'ablative') && n === 1) n = 0;
      if (n > 0 && this.evolved(o, 'stasis') && o.shards >= 2) n -= 1;
      if (n > 0 && this.has(o, 'cloak')) {
        let dodged = 0;
        for (let i = 0; i < n; i++) if (this.r() < 1 / 6) dodged += 1;
        if (dodged) this.say(`🌫️ ${o.name}'s Nebula Cloak dodges ${dodged}.`, { k: 'dodge', pid: o.id, n: dodged });
        n -= dodged;
      }
    }
    if (n <= 0) {
      this.say(`🛡️ ${o.name} shrugs the hit off.`, { k: 'block', pid: o.id });
      return 0;
    }
    o.hull = Math.max(0, o.hull - n);
    this.say(`💥 ${o.name} takes ${n} damage${o.hull ? ` (${o.hull} Hull left)` : ''}.`, { k: 'damage', pid: o.id, n, by: by?.id || null, kind });
    if (o.hull <= 0) this.destroyShip(o, by);
    return n;
  }

  destroyShip(o, by) {
    o.alive = false;
    o.hull = 0;
    o.ghost = !!this.settings.ghosts;
    this.stats.destroyed += 1;
    for (const slot of ['core', 'pulsar']) if (this[slot] === o.id) this[slot] = null;
    o.where = 'rim';
    this.say(`☠️ ${o.name}'s flagship is destroyed${by && by.id !== o.id ? ` by ${by.name}` : ''}!${o.ghost ? ' It returns as a ghost ship.' : ''}`, { k: 'destroy', pid: o.id, by: by?.id || null });
    for (const x of this.alive) if (this.has(x, 'salvage')) this.gainShards(x, 3 * this.count(x, 'salvage'), 'Salvage Drones');
    // the Pulsar collapses once only four contenders are left
    if (this.pulsarOpen && this.alive.length <= 4) {
      this.pulsarOpen = false;
      const holder = this.get(this.pulsar);
      this.pulsar = null;
      if (holder) holder.where = 'rim';
      this.say('💫 The Binary Pulsar collapses! Only the Core remains.', { k: 'collapse-pulsar', pid: holder?.id || null });
    }
  }

  heal(p, n, why, evenInside = false) {
    if (!p.alive || n <= 0) return 0;
    if (this.inside(p) && !evenInside) return 0;
    const got = Math.min(n, p.maxHull - p.hull);
    if (got <= 0) return 0;
    p.hull += got;
    this.say(`🛡️ ${p.name} repairs ${got} Hull${why ? ` (${why})` : ''}.`, { k: 'heal', pid: p.id, n: got });
    return got;
  }

  gainStars(p, n, why) {
    if (n <= 0) return;
    p.stars += n;
    this.say(`⭐ ${p.name} gains ${n} Star${n === 1 ? '' : 's'}${why ? ` (${why})` : ''}.`, { k: 'stars', pid: p.id, n });
  }

  loseStars(o, n, by, why) {
    if (!o.alive || n <= 0 || o.stars <= 0) return;
    if (o.contender === 'goliath') {
      this.say(`🪨 Tectonic Mass: ${o.name} keeps every Star.`, { k: 'block', pid: o.id });
      return;
    }
    const lost = Math.min(o.stars, n);
    o.stars -= lost;
    this.say(`🌑 ${o.name} loses ${lost} Star${lost === 1 ? '' : 's'}${why ? ` (${why})` : ''}.`, { k: 'lose-stars', pid: o.id, n: lost, by: by?.id || null });
  }

  gainShards(p, n, why) {
    if (n <= 0) return;
    p.shards += n;
    this.say(`⚡ ${p.name} gains ${n} Dark Matter${why && why !== 'Dark Matter' ? ` (${why})` : ''}.`, { k: 'shards', pid: p.id, n });
  }

  // ----- evolutions -----
  async evolve(p) {
    const c = contenderDef(p.contender);
    const options = c.evolutions.filter((e) => !p.evolutions.includes(e.id));
    if (!options.length) return;
    this.say(`🧬 Triple repair! ${p.name} evolves...`, { k: 'evolving', pid: p.id });
    const a = await this.ask(p.id, { type: 'evolve', options: options.map((e) => ({ id: e.id, name: e.name, kind: e.kind, text: e.text })) });
    const e = evolutionDef(a.id);
    if (!e) return;
    p.evolutions.push(e.id);
    this.say(`🧬 ${p.name} evolves: ${e.name}!`, { k: 'evolve', pid: p.id, id: e.id });
    await this.wait(900);
    switch (e.id) {
      case 'capacitor':
        this.gainShards(p, Math.floor((p.maxHull - p.hull) / 2), 'Overcharged Capacitor');
        break;
      case 'acid':
        await this.volley(p, this.rivals(p), 2, 'acid');
        this.gainShards(p, 3, 'Acidic Spore Cloud');
        break;
      case 'rewind':
        this.heal(p, 3, 'Time Rewind', true);
        break;
      case 'magma':
        p.maxHull = Math.min(MAX_HULL_CAP, p.maxHull + 2);
        this.heal(p, 2, 'Magma Carapace', true);
        break;
      case 'bombard':
        await this.volley(p, this.rivals(p), Math.max(2, Math.floor(p.stars / 3)), 'bombard');
        break;
      default:
        break;
    }
    this.checkWin();
  }

  // ----- the Xenotech Bazaar -----
  fillMarket() {
    while (this.market.length < 3) {
      if (!this.deck.length) {
        if (!this.discard.length) break;
        this.deck = this.shuffle(this.discard);
        this.discard = [];
      }
      this.market.push(this.deck.shift());
    }
  }

  price(p, id) {
    const c = cardDef(id);
    let cost = c.cost - this.count(p, 'discount');
    if (c.kind === 'keep' && this.evolved(p, 'reverse')) cost -= 1;
    if (this.anomaly === 'convoy') cost -= 2;
    return Math.max(1, cost);
  }

  flushCost(p) {
    return p.contender === 'hive' ? 1 : 2;
  }

  async shop(p) {
    while (p.alive && !this.winner && !this.stopped) {
      const a = await this.ask(p.id, { type: 'buy' });
      if (a.action === 'done') break;
      if (a.action === 'flush') {
        p.shards -= this.flushCost(p);
        this.discard.push(...this.market);
        this.market = [];
        this.fillMarket();
        this.say(`🔄 ${p.name} flushes the Bazaar.`, { k: 'flush', pid: p.id });
        await this.wait(600);
        continue;
      }
      if (a.action === 'heal') {
        p.shards -= 2;
        this.heal(p, 1, 'Rapid Repair Bay', true);
        await this.wait(300);
        continue;
      }
      const i = this.market.findIndex((x) => x.uid === a.uid);
      const card = this.market[i];
      const d = cardDef(card.id);
      p.shards -= this.price(p, card.id);
      this.market.splice(i, 1);
      this.stats.bought += 1;
      this.say(`${d.art} ${p.name} buys ${d.name}.`, { k: 'buy', pid: p.id, card: d.id });
      await this.wait(700);
      if (this.has(p, 'cartographer')) this.gainStars(p, this.count(p, 'cartographer'), 'Star Cartographer');
      if (d.kind === 'keep') {
        p.cards.push(card);
        if (d.hook === 'megahull') {
          p.maxHull = Math.min(MAX_HULL_CAP, p.maxHull + 2);
          this.heal(p, 2, d.name, true);
        }
      } else {
        this.discard.push(card);
        await this.runEffect(p, d);
      }
      this.fillMarket();
      if (this.checkWin()) return;
      await this.wait(300);
    }
  }

  async runEffect(p, d) {
    for (const [step, n] of d.fx) {
      if (!p.alive || this.winner) return;
      switch (step) {
        case 'stars':
          this.gainStars(p, n, d.name);
          break;
        case 'shards':
          this.gainShards(p, n, d.name);
          break;
        case 'heal':
          this.heal(p, n, d.name, true);
          break;
        case 'hurtSelf':
          this.hurt(p, n, null, 'self');
          break;
        case 'hurtOthers':
          await this.volley(p, this.rivals(p), n, 'card');
          break;
        case 'hurtAll':
          await this.volley(p, this.alive, n, 'card');
          break;
        case 'othersLoseStars':
          for (const o of this.rivals(p)) this.loseStars(o, n, p, d.name);
          break;
        case 'halveShards':
          for (const o of this.rivals(p)) {
            const lost = Math.floor(o.shards / 2);
            if (lost) {
              o.shards -= lost;
              this.say(`🌪️ ${o.name} loses ${lost} Dark Matter.`, { k: 'lose-shards', pid: o.id, n: lost });
            }
          }
          break;
        case 'takeCore': {
          if (p.where === 'core') break;
          const holder = this.get(this.core);
          if (p.where === 'pulsar') this.pulsar = null;
          if (holder) {
            holder.where = 'rim';
            this.say(`🌀 ${holder.name} is pushed out of the Core.`, { k: 'flung', pid: holder.id, from: 'core' });
          }
          p.where = 'rim';
          this.enter(p, 'core');
          break;
        }
        case 'extraTurn':
          p.extraTurn = true;
          break;
        default:
          break;
      }
      await this.wait(400);
    }
    this.checkWin();
  }

  // ----- ghost ships -----
  async ghostTurn(p) {
    const faces = [GHOST_FACES[Math.floor(this.r() * 6)], GHOST_FACES[Math.floor(this.r() * 6)]];
    this.turn = { pid: p.id, ghost: true, faces, rollsLeft: 0, dice: [], rolled: true, stage: 'ghost' };
    this.say(`👻 ${p.name}'s ghost ship rolls`, { k: 'ghost', pid: p.id, faces });
    await this.wait(1400);
    for (const f of faces) {
      if (this.winner) break;
      if (f === 'haunt') {
        const holder = this.get(this.core);
        if (holder) {
          this.say(`👻 ${p.name} haunts ${holder.name} in the Core!`, { k: 'haunt', pid: p.id, target: holder.id });
          await this.wait(500);
          this.hurt(holder, 1, p, 'ghost');
        }
      } else if (f === 'drain') {
        const leader = this.leader();
        if (leader && leader.shards > 0) {
          leader.shards -= 1;
          this.say(`👻 ${p.name} drains 1 Dark Matter from ${leader.name}.`, { k: 'drain', pid: p.id, target: leader.id });
        }
      }
      await this.wait(400);
    }
    this.checkWin();
    this.turn = null;
    this.changed();
  }

  leader() {
    const alive = this.alive;
    if (!alive.length) return null;
    return alive.reduce((a, b) => (b.stars > a.stars ? b : a));
  }

  // ----- the end -----
  checkWin() {
    if (this.winner) return true;
    const alive = this.alive;
    const top = alive.filter((p) => p.stars >= this.target).sort((a, b) => b.stars - a.stars)[0];
    if (top) {
      this.winner = top.id;
      this.winKind = 'stars';
    } else if (alive.length === 1) {
      this.winner = alive[0].id;
      this.winKind = 'survivor';
    } else if (alive.length === 0) {
      this.winner = 'none';
      this.winKind = 'none';
    }
    if (this.winner) this.changed();
    return !!this.winner;
  }

  finish() {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    const w = this.get(this.winner);
    if (w) {
      w.wins += 1;
      this.say(this.winKind === 'stars' ? `👑 ${w.name} reaches ${w.stars} Stars and rules the galaxy!` : `👑 ${w.name} is the last ship flying and rules the galaxy!`, { k: 'win', pid: w.id, kind: this.winKind });
    } else this.say('🌑 Every flagship is gone. The galaxy has no ruler.', { k: 'win', pid: null, kind: 'none' });
    this.turn = null;
    for (const rec of [...this.pending.values()]) rec.finish(this.safeAnswer(rec.req));
    this.changed();
  }

  // ---------------------------------------------------------------------------
  // What each person sees (everything is public in this game, except whose questions are whose)
  // ---------------------------------------------------------------------------
  publicPlayer(p) {
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isBot: p.isBot,
      connected: p.connected || p.isBot,
      afk: p.afk,
      contender: p.contender,
      hull: p.hull,
      maxHull: p.maxHull,
      stars: p.stars,
      shards: p.shards,
      alive: p.alive,
      ghost: p.ghost,
      where: p.where,
      cards: p.cards,
      evolutions: p.evolutions,
      slipReady: p.slipReady,
      wins: p.wins,
      isHost: p.id === this.hostId,
    };
  }

  // what the dice would do if they were counted now (shown while you roll)
  preview(p) {
    const t = this.turn;
    if (!t || t.pid !== p.id || !t.rolled || t.ghost) return null;
    const c = tally(t.dice);
    let stars = 0;
    for (const n of [1, 2, 3]) if (c[n] >= 3) stars += n + (c[n] - 3) + this.count(p, 'echo');
    let dmg = c.laser;
    if (c.laser >= 3) dmg += this.count(p, 'ion');
    if (c.laser >= 1) dmg += this.count(p, 'railgun');
    dmg += this.count(p, 'ram');
    if (this.anomaly === 'flare') dmg *= 2;
    if (this.anomaly === 'summit') dmg = 0;
    const targets = this.inside(p) ? this.rivals(p).filter((o) => o.where === 'rim') : this.rivals(p).filter((o) => this.inside(o));
    let heal = 0;
    if (c.repair && p.where === 'rim') heal = Math.min(p.maxHull - p.hull, c.repair + this.count(p, 'drones') + (this.evolved(p, 'brood') && c.repair >= 2 ? 1 : 0));
    let shards = c.shard ? c.shard + this.count(p, 'feeder') + (this.anomaly === 'nebula' ? 1 : 0) : 0;
    if (this.evolved(p, 'paradox') && c[1] && c[2] && c[3]) {
      stars += 2;
      shards += 2;
    }
    return { stars, heal, healBlocked: !!c.repair && p.where !== 'rim', evolve: c.repair >= 3 && this.settings.evolutions, damage: targets.length ? dmg : 0, targets: targets.map((o) => o.id), shards, enter: p.where === 'rim' && (!this.core || (this.pulsarOpen && !this.pulsar)) };
  }

  viewFor(id) {
    const me = this.get(id);
    const prompts = [...this.pending.values()].filter((r) => r.pid === id).map((r) => r.req);
    const waitingOn = [...new Set([...this.pending.values()].map((r) => r.pid))];
    return {
      code: this.code,
      phase: this.phase,
      version: this.version,
      hostId: this.hostId,
      settings: this.settings,
      target: this.target,
      practice: this.practice,
      round: this.round,
      anomaly: this.anomaly,
      core: this.core,
      pulsar: this.pulsar,
      pulsarOpen: this.pulsarOpen,
      market: this.market,
      deckCount: this.deck.length,
      turn: this.turn,
      players: this.players.map((p) => this.publicPlayer(p)),
      spectators: this.spectators.length,
      waitingOn,
      log: this.log.slice(-60),
      chat: this.chat.slice(-40),
      winner: this.winner,
      winKind: this.winKind,
      stats: this.stats,
      you: {
        id,
        isSpectator: !me,
        prompts,
        prices: me ? Object.fromEntries(this.market.map((c) => [c.uid, this.price(me, c.id)])) : {},
        flushCost: me ? this.flushCost(me) : 2,
        preview: me ? this.preview(me) : null,
      },
    };
  }

  canYield(p) {
    return !(this.evolved(p, 'siege') && p.where === 'core' && p.hull > 3);
  }

  // ----- chat and reactions -----
  addChat(id, text) {
    const p = this.get(id) || this.spectators.find((s) => s.id === id);
    const clean = String(text || '')
      .replace(/[\u0000-\u001f]/g, '')
      .trim()
      .slice(0, 200);
    if (!p || !clean) return;
    this.chat.push({ at: Date.now(), name: p.name, avatar: p.avatar || '👀', text: clean, pid: id });
    if (this.chat.length > 60) this.chat.shift();
    this.changed();
  }

  emote(id, emote) {
    const p = this.get(id);
    if (!p || !EMOTES.includes(emote)) return;
    this.seq += 1;
    this.log.push({ seq: this.seq, text: `${p.name} ${emote}`, at: Date.now(), k: 'emote', pid: id, emote });
    if (this.log.length > LOG_KEEP) this.log.shift();
    this.changed();
  }
}

module.exports = { RulerGame, tally, MIN_PLAYERS, MAX_PLAYERS, DICE, ROLLS, TIMERS, EMOTES };

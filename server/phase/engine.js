// Phase to Space: the rules.
//
// A game is one long async function (run) that walks through turns. Whenever it needs a decision
// from somebody (what to do with their Energy, which Crew card to destroy, whether to Signal Jam a
// card, whether to play a Boost on a roll) it calls ask() and waits. People answer through respond();
// robots, and people who have gone quiet, are answered by bots.js. So the rules read like the rulebook
// ("DESTROY a Crew card" is: choose one, destroy it) and never have to remember where they were.
//
// Everything here is server-side. Players only ever see viewFor(), which hides other hands.

const { CLASSES, CLASS_IDS, CAPTAINS, BEASTS, def, deckList } = require('./cards');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const HAND_SIZE = 5;
const BASE_ENERGY = 3;
const WIN_BEASTS = 3;
const LOG_KEEP = 80;

// How long (ms) people get to answer, before a robot answers for them. "pace" scales every pause.
const TIMERS = { action: 75_000, pick: 40_000, react: 7_000, boost: 7_000, captain: 45_000 };
const NAMES = ['Nova', 'Orbit', 'Zip', 'Comet', 'Quasar', 'Pixel', 'Blip', 'Cosmo', 'Widget', 'Lumen', 'Static', 'Pogo'];
const BOT_AVATARS = ['🤖', '👾', '🛸', '🦾', '🪐', '☄️'];
const AVATARS = ['🧑‍🚀', '👩‍🚀', '🐱', '🐶', '🦊', '🐸', '🐼', '🦄', '🐙', '🦖', '🐧', '🦉'];

const EMOTES = ['😂', '😱', '👏', '🔥', '😈', '🤔', '😭', '🎉'];
const sleepFor = (ms) => new Promise((r) => setTimeout(r, ms).unref?.());

class PhaseGame {
  constructor(code, { rng = Math.random, pace = 1, chooser = null } = {}) {
    this.code = code;
    this.rng = rng;
    this.pace = pace; // 1 = normal; 0 = no waiting at all (tests); 0.5 = brisk
    this.chooser = chooser; // tests: (game, player, request) => answer, used instead of people and bots
    this.version = 0;
    this.phase = 'lobby'; // lobby | captains | playing | ended
    this.players = [];
    this.spectators = [];
    this.hostId = null;
    this.deck = [];
    this.discard = [];
    this.beastDeck = [];
    this.beastRow = [];
    this.turn = null; // { pid, n, ap, maxAp }
    this.stack = null; // the card being played right now, while others may Signal Jam it
    this.roll = null; // the dice on the table
    this.pending = new Map(); // request id -> { pid, req, resolve, timer }
    this.log = [];
    this.seq = 0;
    this.uids = 0;
    this.winner = null;
    this.winKind = null;
    this.round = 0;
    this.chat = [];
    this.stats = { turns: 0, attacks: 0, slays: 0, jams: 0, destroys: 0 };
    this.settings = { speed: 'normal' };
    this.onChange = () => {};
    this.running = null;
    this.stopped = false;
    this.nameCount = 0;
  }

  // ----- small helpers -----
  r() {
    return this.rng();
  }
  pick(list) {
    return list[Math.floor(this.r() * list.length)];
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
    return `c${this.uids}`;
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
  get active() {
    return this.turn ? this.get(this.turn.pid) : null;
  }
  others(p) {
    return this.players.filter((o) => o.id !== p.id);
  }
  isAuto(p) {
    return p.isBot || !p.connected || p.afk;
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
  addPlayer(name, { isBot = false, avatar = null } = {}) {
    if (this.phase !== 'lobby') throw new Error('The game has already started.');
    if (this.players.length >= MAX_PLAYERS) throw new Error('The table is full (6 players).');
    const taken = new Set(this.players.map((p) => p.avatar));
    const pool = isBot ? BOT_AVATARS : AVATARS;
    const p = {
      id: `p${++this.nameCount}${Math.floor(this.r() * 1e6).toString(36)}`,
      token: Math.floor(this.r() * 1e12).toString(36) + Date.now().toString(36),
      name: cleanName(name) || (isBot ? this.botName() : `Player ${this.players.length + 1}`),
      isBot,
      connected: !isBot,
      afk: false,
      avatar: avatar && !taken.has(avatar) ? avatar : pool.find((a) => !taken.has(a)) || pool[0],
      hand: [],
      crew: [],
      beasts: [],
      captain: null,
      options: [],
      wins: 0,
      used: {},
      buff: 0,
      noJam: false,
      freeDrawUsed: false,
    };
    this.players.push(p);
    if (!this.hostId && !isBot) this.hostId = p.id;
    this.changed();
    return p;
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

  // someone whose turns a robot has been taking asks for the wheel back
  wake(id) {
    const p = this.get(id);
    if (p && p.afk) {
      p.afk = false;
      this.say(`${p.name} is back at the controls.`, { k: 'afk', pid: id });
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

  setSpeed(byId, speed) {
    this.requireHost(byId);
    if (!['chill', 'normal', 'quick'].includes(speed)) throw new Error('Unknown speed.');
    this.settings.speed = speed;
    this.changed();
  }

  timeoutFor(kind) {
    const k = { chill: 1.8, normal: 1, quick: 0.5 }[this.settings.speed] || 1;
    return Math.round(TIMERS[kind] * k);
  }

  start(byId) {
    this.requireHost(byId);
    if (this.phase !== 'lobby') throw new Error('Already started.');
    if (this.players.length < MIN_PLAYERS) throw new Error('You need at least 2 players (add a robot!).');
    this.setup();
    this.running = this.run().catch((err) => {
      console.error('[phase] game crashed:', err);
      this.say('💥 The ship hit turbulence and the game had to stop. Sorry!', { k: 'error' });
      this.phase = 'ended';
      this.changed();
    });
  }

  setup() {
    this.stopped = false;
    this.winner = null;
    this.winKind = null;
    this.round = 0;
    this.deck = this.shuffle(deckList().map((d) => ({ uid: this.uid(), id: d.id })));
    this.discard = [];
    this.beastDeck = this.shuffle(BEASTS.map((d) => ({ uid: this.uid(), id: d.id })));
    this.beastRow = [];
    for (let i = 0; i < 3; i++) this.flipBeast();
    for (const p of this.players) {
      p.hand = [];
      p.crew = [];
      p.beasts = [];
      p.captain = null;
      p.used = {};
      p.buff = 0;
      p.noJam = false;
      p.afk = false;
    }
    // each player is offered different Captains (three each, or two when the table is big), none repeated across the table
    const pool = this.shuffle(CAPTAINS.map((c) => c.id));
    const each = Math.min(3, Math.floor(pool.length / this.players.length));
    for (const p of this.players) p.options = pool.splice(0, each);
    this.phase = 'captains';
    this.say('🚀 The game begins! Pick your Captains.', { k: 'start' });
  }

  // ---------------------------------------------------------------------------
  // Asking people (and robots) to decide things
  // ---------------------------------------------------------------------------

  // Ask one player something; resolves with their answer. req: { type, title, ...payload }
  // type: 'pick' (options, min, max) | 'action' | 'react' (a Signal Jam) | 'boost' | 'captain'
  ask(pid, req, timeoutKind = 'pick') {
    const p = this.get(pid);
    const rid = `r${++this.uids}`;
    return new Promise((resolve) => {
      const record = { pid, req: { rid, ...req }, resolve, timer: null, bot: null };
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
      // robots (and people who left or fell asleep) get a robot answer after a human-sized pause
      const auto = () => {
        const answer = this.autoAnswer(p, record.req);
        if (answer == null) return;
        const err = this.validate(record.req, answer);
        if (err) {
          // the robot got it wrong: fall back to the safest answer
          finish(this.safeAnswer(record.req));
        } else finish(answer);
      };
      if (this.chooser) {
        // tests: answered at once, without waiting for a timer
        Promise.resolve().then(() => {
          const answer = this.chooser(this, p, record.req);
          const err = answer && this.validate(record.req, answer);
          finish(err || !answer ? this.safeAnswer(record.req) : answer);
        });
      } else if (this.isAuto(p)) {
        const think = req.type === 'action' ? 900 : req.type === 'react' || req.type === 'boost' ? 700 : 800;
        record.bot = setTimeout(auto, think * this.pace * (0.6 + this.r() * 0.9));
        record.bot.unref?.();
      } else {
        const ms = this.timeoutFor(timeoutKind);
        record.req.until = Date.now() + ms;
        record.timer = setTimeout(() => {
          // nobody wants a robot spending their Boosts and Signal Jams: no answer means "pass"
          if (req.type === 'react' || req.type === 'boost') return finish({ pass: true });
          // asleep at the wheel: a robot takes over for them from now on
          if (req.type === 'action' && !p.afk) {
            p.afk = true;
            this.say(`💤 ${p.name} went quiet, so a robot is steering for them.`, { k: 'afk', pid: p.id });
          }
          auto();
        }, ms);
        record.timer.unref?.();
      }
      this.changed();
    });
  }

  // A person answers: returns an error message, or null when accepted.
  respond(pid, rid, answer) {
    const rec = this.pending.get(rid);
    if (!rec || rec.pid !== pid) return 'That question is no longer open.';
    const err = this.validate(rec.req, answer);
    if (err) return err;
    const p = this.get(pid);
    if (p) p.afk = false; // they are back
    rec.finish(answer);
    return null;
  }

  // Is this a legal answer? Returns an error message or null.
  validate(req, a) {
    if (!a || typeof a !== 'object') return 'Bad answer.';
    const p = this.get(req.pid);
    switch (req.type) {
      case 'pick': {
        const keys = Array.isArray(a.keys) ? a.keys.map(String) : null;
        if (!keys) return 'Pick something.';
        if (new Set(keys).size !== keys.length) return 'Pick each thing once.';
        if (keys.length < req.min || keys.length > req.max) return req.min === req.max ? `Pick ${req.min}.` : `Pick ${req.min} to ${req.max}.`;
        const ok = new Set(req.options.map((o) => o.key));
        if (!keys.every((k) => ok.has(k))) return 'That is not one of the choices.';
        return null;
      }
      case 'captain':
        return req.options.includes(a.id) ? null : 'Pick one of your three Captains.';
      case 'react':
        if (a.pass) return null;
        return req.cards.some((c) => c.uid === a.uid) ? null : 'You do not have that card.';
      case 'boost': {
        if (a.pass) return null;
        const card = req.cards.find((c) => c.uid === a.uid);
        if (!card) return 'You do not have that card.';
        if (!this.roll || !this.roll.sides.some((s) => s.pid === a.side)) return 'Pick whose roll to change.';
        if (a.sign !== 'up' && a.sign !== 'down') return 'Plus or minus?';
        return null;
      }
      case 'action':
        return this.validateAction(p, a);
      default:
        return 'Unknown question.';
    }
  }

  // Safe fallback answers (used when a robot slips, or a chooser answers nonsense).
  safeAnswer(req) {
    switch (req.type) {
      case 'pick':
        return { keys: req.options.slice(0, req.min).map((o) => o.key) };
      case 'captain':
        return { id: req.options[0] };
      case 'react':
      case 'boost':
        return { pass: true };
      default:
        return { action: 'end' };
    }
  }

  autoAnswer(p, req) {
    // bots.js is loaded lazily so tests can use the engine without it
    const { decide } = require('./bots');
    try {
      return decide(this, p, req);
    } catch (err) {
      console.error('[phase] bot error:', err);
      return this.safeAnswer(req);
    }
  }

  // ---------------------------------------------------------------------------
  // What each person is allowed to see
  // ---------------------------------------------------------------------------
  publicPlayer(p) {
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isBot: p.isBot,
      connected: p.connected || p.isBot,
      afk: p.afk,
      handCount: p.hand.length,
      jammed: !!p.jammed,
      captain: p.captain,
      crew: p.crew.map((c) => ({ uid: c.uid, id: c.id, gear: c.gear, shield: c.shield, used: c.used })),
      beasts: p.beasts.map((b) => ({ uid: b.uid, id: b.id })),
      classes: [...this.classes(p)],
      wins: p.wins,
      isHost: p.id === this.hostId,
    };
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
      round: this.round,
      you: { id, isSpectator: !me, hand: me ? me.hand : [], prompts, hints: me ? this.hintsFor(me) : null },
      players: this.players.map((p) => this.publicPlayer(p)),
      spectators: this.spectators.length,
      deckCount: this.deck.length,
      discardCount: this.discard.length,
      discardTop: this.discard.length ? this.discard[this.discard.length - 1] : null,
      beastRow: this.beastRow,
      beastDeckCount: this.beastDeck.length,
      turn: this.turn,
      stack: this.stack,
      roll: this.roll,
      waitingOn,
      log: this.log.slice(-50),
      chat: this.chat.slice(-40),
      winner: this.winner,
      winKind: this.winKind,
    };
  }

  // what the person whose turn it is can do right now (so the buttons can say why they are greyed out)
  hintsFor(p) {
    if (this.phase !== 'playing' || !this.turn || this.turn.pid !== p.id) return null;
    const hints = { playable: {}, activate: {}, attack: {}, draw: this.validateAction(p, { action: 'draw' }), flush: this.validateAction(p, { action: 'flush' }), drawCost: this.drawCost(p), abilities: this.freeAbilities(p).map((a) => ({ key: a.key, label: a.label, art: a.art })), costs: {} };
    for (const c of p.hand) hints.playable[c.uid] = this.validateAction(p, { action: 'play', uid: c.uid });
    for (const c of p.crew) {
      hints.activate[c.uid] = this.validateAction(p, { action: 'activate', uid: c.uid });
      hints.costs[c.uid] = this.energyCost(p, c);
    }
    for (const b of this.beastRow) hints.attack[b.uid] = this.validateAction(p, { action: 'attack', uid: b.uid });
    return hints;
  }

  // back to the lobby for another game with the same people
  toLobby(byId) {
    this.requireHost(byId);
    if (this.phase !== 'ended') throw new Error('The game is still going.');
    this.players = this.players.filter((p) => p.isBot || p.connected);
    for (const p of this.players) {
      p.hand = [];
      p.crew = [];
      p.beasts = [];
      p.captain = null;
      p.options = [];
    }
    this.phase = 'lobby';
    this.turn = null;
    this.stack = null;
    this.roll = null;
    this.winner = null;
    this.winKind = null;
    this.log = [];
    this.stats = { turns: 0, attacks: 0, slays: 0, jams: 0, destroys: 0 };
    this.running = null;
    this.changed();
  }

  // stop the game for good (the room was abandoned): answer everything so no promise is left hanging
  destroy() {
    this.stopped = true;
    for (const rec of [...this.pending.values()]) rec.finish(this.safeAnswer(rec.req));
  }

  addChat(pid, text) {
    const who = this.get(pid) || this.spectators.find((s) => s.id === pid);
    const clean = String(text || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 160);
    if (!who || !clean) return;
    this.seq += 1;
    this.chat.push({ seq: this.seq, from: pid, name: who.name, avatar: who.avatar || '👀', text: clean, at: Date.now() });
    if (this.chat.length > 60) this.chat.shift();
    this.changed();
  }

  emote(pid, emote) {
    const who = this.get(pid);
    if (!who || !EMOTES.includes(emote)) return;
    this.seq += 1;
    this.log.push({ seq: this.seq, text: `${who.name} ${emote}`, at: Date.now(), k: 'emote', pid, emote });
    if (this.log.length > LOG_KEEP) this.log.shift();
    this.changed();
  }

  // ---------------------------------------------------------------------------
  // The game
  // ---------------------------------------------------------------------------
  async run() {
    // captains
    await Promise.all(
      this.players.map(async (p) => {
        const a = await this.ask(p.id, { type: 'captain', title: 'Pick your Captain', options: p.options }, 'captain');
        p.captain = def(a.id) ? { id: a.id } : { id: p.options[0] };
        this.changed();
      }),
    );
    for (const p of this.players) this.say(`${p.avatar} ${p.name} will command with ${def(p.captain.id).name}.`, { k: 'captain', pid: p.id });
    await this.wait(900);
    // the first hand
    for (const p of this.players) this.draw(p, HAND_SIZE, { quiet: true });
    this.say('🃏 Everyone draws five cards.', { k: 'deal' });
    await this.wait(900);
    // a random first player
    let idx = Math.floor(this.r() * this.players.length);
    this.phase = 'playing';
    this.changed();
    while (!this.winner && !this.stopped) {
      const p = this.players[idx];
      await this.takeTurn(p);
      if (this.winner) break;
      idx = (idx + 1) % this.players.length;
      if (idx === 0) this.round += 1;
    }
    this.phase = 'ended';
    this.turn = null;
    this.stack = null;
    this.changed();
  }

  maxEnergy(p) {
    return BASE_ENERGY + (this.has(p, 'energy') ? this.count(p, 'energy') : 0);
  }

  async takeTurn(p) {
    this.stats.turns += 1;
    // a new turn: everything gets ready again
    for (const c of p.crew) {
      c.used = false;
      c.shield = false; // a Shield lasts until your next turn begins
    }
    p.used = {};
    p.buff = 0;
    p.noJam = false;
    p.jammed = false; // a player can only be Signal Jammed once per turn
    p.freeDrawUsed = false;
    const max = this.maxEnergy(p);
    this.turn = { pid: p.id, n: this.stats.turns, ap: max, maxAp: max };
    this.stack = null;
    this.say(`🎲 ${p.name}'s turn`, { k: 'turn', pid: p.id });
    await this.wait(700);
    if (this.has(p, 'startdraw')) {
      this.say(`${beastName(p, 'startdraw')} lets ${p.name} draw a card.`, { k: 'passive', pid: p.id });
      this.draw(p, 1);
    }
    while (!this.winner && !this.stopped) {
      const canAct = this.turn.ap > 0 || this.freeAbilities(p).length > 0;
      if (!canAct) break;
      const a = await this.ask(p.id, { type: 'action', title: 'Your move', pid: p.id }, 'action');
      if (a.action === 'end') break;
      await this.doAction(p, a);
    }
    p.buff = 0;
    p.noJam = false;
    if (this.winner) return;
    // end of turn: six disciplines wins
    if (this.classes(p).size >= CLASS_IDS.length) {
      this.finish(p, 'crew');
      return;
    }
    this.say(`${p.name} ends their turn.`, { k: 'end', pid: p.id });
    await this.wait(400);
  }

  finish(p, kind) {
    this.winner = p.id;
    this.winKind = kind;
    p.wins += 1;
    this.say(kind === 'crew' ? `🏆 ${p.name} assembled a crew of all six disciplines and WINS!` : `🏆 ${p.name} slayed three Void Beasts and WINS!`, { k: 'win', pid: p.id });
    this.changed();
  }

  // ---------------------------------------------------------------------------
  // Looking at the table
  // ---------------------------------------------------------------------------
  classes(p) {
    const set = new Set();
    if (p.captain) set.add(def(p.captain.id).cls);
    for (const c of p.crew) set.add(def(c.id).cls);
    return set;
  }

  // passives a player has from their Captain and slain Beasts
  has(p, passive) {
    return this.count(p, passive) > 0;
  }
  count(p, passive) {
    let n = 0;
    if (p.captain && def(p.captain.id).passive === passive) n += 1;
    for (const b of p.beasts) if (def(b.id).passive === passive) n += 1;
    return n;
  }

  allCrew() {
    const list = [];
    for (const p of this.players) for (const c of p.crew) list.push({ owner: p, crew: c });
    return list;
  }

  findCrew(uid) {
    for (const p of this.players) {
      const c = p.crew.find((x) => x.uid === uid);
      if (c) return { owner: p, crew: c };
    }
    return null;
  }

  protectedFrom(owner, crew, how) {
    if (crew.shield) return true;
    const gear = crew.gear && def(crew.gear.id);
    if (gear?.ward) return true;
    if (how === 'steal' && this.has(owner, 'ward')) return true;
    return false;
  }

  // ---------------------------------------------------------------------------
  // Moving cards
  // ---------------------------------------------------------------------------
  draw(p, n = 1, { quiet = false } = {}) {
    const got = [];
    for (let i = 0; i < n; i++) {
      if (!this.deck.length) {
        if (!this.discard.length) break;
        this.deck = this.shuffle(this.discard.splice(0));
        this.say('♻️ The discard pile is shuffled back into the deck.', { k: 'shuffle' });
      }
      const card = this.deck.pop();
      p.hand.push(card);
      got.push(card);
    }
    if (got.length && !quiet) this.say(`${p.name} draws ${got.length === 1 ? 'a card' : `${got.length} cards`}.`, { k: 'draw', pid: p.id, n: got.length });
    this.changed();
    return got;
  }

  discardCard(card) {
    this.discard.push({ uid: card.uid, id: card.id });
  }

  takeFromHand(p, uid) {
    const i = p.hand.findIndex((c) => c.uid === uid);
    if (i < 0) return null;
    return p.hand.splice(i, 1)[0];
  }

  // a Crew card leaves play: its Gear goes where `gear` says ('discard' | 'hand' | 'with')
  removeCrew(owner, crew, gearTo = 'discard') {
    const i = owner.crew.indexOf(crew);
    if (i >= 0) owner.crew.splice(i, 1);
    const g = crew.gear;
    crew.gear = null;
    if (g) {
      if (gearTo === 'hand') owner.hand.push(g);
      else this.discardCard(g);
    }
  }

  flipBeast() {
    if (!this.beastDeck.length) return;
    const b = this.beastDeck.pop();
    this.beastRow.push(b);
  }

  // ---------------------------------------------------------------------------
  // Picking: a generic "choose from these" question
  // ---------------------------------------------------------------------------
  // options: [{ key, kind: 'crew'|'player'|'card'|'beast'|'text', label, ... }]
  // Returns the chosen keys. A single, forced choice is made for you.
  async choose(p, { title, options, min = 1, max = 1, style = 'board', hint = null, force = false, purpose = null }) {
    if (!options.length) return [];
    if (!force && options.length <= min && min === max) return options.slice(0, min).map((o) => o.key);
    const a = await this.ask(p.id, { type: 'pick', pid: p.id, title, options, min: Math.min(min, options.length), max: Math.min(max, options.length), style, hint, purpose }, 'pick');
    return a.keys;
  }

  crewOption(owner, crew) {
    return { key: crew.uid, kind: 'crew', ownerId: owner.id, uid: crew.uid, id: crew.id, label: def(crew.id).name };
  }

  cardOption(card) {
    return { key: card.uid, kind: 'card', uid: card.uid, id: card.id, label: def(card.id).name };
  }

  playerOption(o, extra = '') {
    return { key: o.id, kind: 'player', id: o.id, label: o.name, hint: extra };
  }

  // choose a Crew card (of rivals, yours, or anyone's) that passes the filter
  async chooseCrew(p, title, { who = 'others', filter = () => true, purpose = null } = {}) {
    const options = [];
    for (const { owner, crew } of this.allCrew()) {
      if (who === 'others' && owner.id === p.id) continue;
      if (who === 'own' && owner.id !== p.id) continue;
      if (!filter(owner, crew)) continue;
      options.push(this.crewOption(owner, crew));
    }
    if (!options.length) return null;
    const [key] = await this.choose(p, { title, options, style: 'board', purpose });
    return this.findCrew(key);
  }

  async choosePlayer(p, title, filter = () => true, hintFn = null, purpose = null) {
    const options = this.others(p).filter(filter).map((o) => this.playerOption(o, hintFn ? hintFn(o) : ''));
    if (!options.length) return null;
    const [key] = await this.choose(p, { title, options, style: 'board', purpose });
    return this.get(key);
  }

  // ---------------------------------------------------------------------------
  // Dice
  // ---------------------------------------------------------------------------
  d6() {
    return 1 + Math.floor(this.r() * 6);
  }

  // Rolls 2 dice for each of the sides, lets everyone play Boosts, and returns the final totals.
  // sides: [{ pid, label?, bonus: [{ label, v }] }]; need: a number for a check, null for a duel.
  async rollDice({ kind, title, sides, need = null, tie = null }) {
    this.uids += 1;
    this.roll = {
      id: `roll${this.uids}`,
      kind,
      title,
      need,
      tie,
      open: true,
      sides: sides.map((s) => {
        const dice = [this.d6(), this.d6()];
        const mods = (s.bonus || []).filter((m) => m.v !== 0).map((m) => ({ label: m.label, v: m.v, auto: true }));
        return { pid: s.pid, dice, mods, total: 0 };
      }),
    };
    this.recompute();
    this.say(`🎲 ${this.roll.sides.map((s) => `${this.get(s.pid).name} rolls ${s.dice[0]} + ${s.dice[1]}`).join(', ')}`, { k: 'roll', roll: this.roll.id });
    await this.wait(1500); // the dice tumble
    await this.boostWindow();
    this.roll.open = false;
    this.recompute();
    const result = this.roll.sides.map((s) => ({ pid: s.pid, total: s.total, dice: s.dice }));
    this.changed();
    await this.wait(1100); // everyone reads the total
    this.roll = null;
    this.changed();
    return result;
  }

  recompute() {
    for (const s of this.roll.sides) s.total = s.dice[0] + s.dice[1] + s.mods.reduce((n, m) => n + m.v, 0);
  }

  // Anyone holding a Boost can add it to the roll. We keep asking until a whole round passes.
  async boostWindow() {
    for (let round = 0; round < 10; round++) {
      let played = false;
      const eligible = this.players.filter((p) => p.hand.some((c) => def(c.id).kind === 'boost'));
      if (!eligible.length) break;
      await Promise.all(
        eligible.map(async (p) => {
          const cards = p.hand.filter((c) => def(c.id).kind === 'boost');
          if (!cards.length) return;
          const a = await this.ask(p.id, { type: 'boost', pid: p.id, title: 'Play a Boost?', cards, rollId: this.roll.id }, 'boost');
          if (a.pass) return;
          const card = this.takeFromHand(p, a.uid);
          if (!card) return;
          this.applyBoost(p, card, a.side, a.sign);
          played = true;
        }),
      );
      if (!played) break;
      await this.wait(700);
    }
  }

  applyBoost(p, card, sidePid, sign) {
    const d = def(card.id);
    let v = sign === 'up' ? d.up : d.down;
    if (sign === 'up' && this.has(p, 'amplify')) v += 1;
    const side = this.roll.sides.find((s) => s.pid === sidePid);
    side.mods.push({ label: `${d.name} (${this.get(p.id).name})`, v, by: p.id, card: card.id });
    this.discardCard(card);
    // some beasts make rivals' Boosts help you
    const owner = this.get(sidePid);
    if (p.id !== sidePid && this.has(owner, 'boostbonus')) side.mods.push({ label: beastName(owner, 'boostbonus'), v: 1, auto: true });
    this.recompute();
    this.say(`${d.art} ${p.name} plays ${d.name} on ${p.id === sidePid ? 'their own roll' : `${owner.name}'s roll`}: ${v > 0 ? '+' : ''}${v}.`, { k: 'boost', pid: p.id, card: card.id, v });
  }

  // a roll for a Crew card's effect, or an attack
  effectBonus(p, crew) {
    const bonus = [];
    if (this.has(p, 'lucky')) bonus.push({ label: 'Lucky Star', v: this.count(p, 'lucky') });
    if (this.has(p, 'effect')) bonus.push({ label: 'Beast power', v: this.count(p, 'effect') });
    if (this.has(p, 'rolls')) bonus.push({ label: 'Void Dragon', v: this.count(p, 'rolls') });
    const g = crew?.gear && def(crew.gear.id);
    if (g?.roll) bonus.push({ label: g.name, v: g.roll });
    if (p.buff) bonus.push({ label: 'Hype', v: p.buff });
    return bonus;
  }
  attackBonus(p) {
    const bonus = [];
    if (this.has(p, 'hunter')) bonus.push({ label: 'Void Hunter', v: 1 });
    if (this.has(p, 'attack')) bonus.push({ label: 'Rust Ripper', v: 2 * this.count(p, 'attack') });
    if (this.has(p, 'rolls')) bonus.push({ label: 'Void Dragon', v: this.count(p, 'rolls') });
    if (p.buff) bonus.push({ label: 'Hype', v: p.buff });
    return bonus;
  }
  duelBonus(p) {
    const bonus = [];
    if (this.has(p, 'challenger')) bonus.push({ label: 'Sun Scorpion', v: 2 * this.count(p, 'challenger') });
    if (this.has(p, 'rolls')) bonus.push({ label: 'Void Dragon', v: this.count(p, 'rolls') });
    if (p.buff) bonus.push({ label: 'Hype', v: p.buff });
    return bonus;
  }

  // ---------------------------------------------------------------------------
  // Actions on your turn
  // ---------------------------------------------------------------------------
  freeAbilities(p) {
    const list = [];
    const cap = p.captain && def(p.captain.id);
    if (cap?.ability && !p.used[`cap:${cap.ability}`]) list.push({ key: `cap:${cap.ability}`, ability: cap.ability, label: cap.title, art: cap.art });
    if (this.has(p, 'loot') && !p.used['beast:loot']) list.push({ key: 'beast:loot', ability: 'loot', label: beastName(p, 'loot'), art: '🐾' });
    return list.filter((a) => this.abilityUsable(p, a.ability));
  }

  abilityUsable(p, ability) {
    if (ability === 'pickpocket') return this.others(p).some((o) => o.hand.length);
    if (ability === 'mindread') return this.others(p).some((o) => o.hand.length);
    if (ability === 'loot') return p.hand.length > 0;
    return false;
  }

  energyCost(p, crew) {
    const g = crew.gear && def(crew.gear.id);
    if (g?.free) return 0;
    return 1 + (g?.cost || 0);
  }

  // Can the chosen action be done right now? Returns an error message or null.
  validateAction(p, a) {
    if (!this.turn || this.turn.pid !== p.id) return 'It is not your turn.';
    const ap = this.turn.ap;
    switch (a.action) {
      case 'end':
        return null;
      case 'draw':
        return ap < this.drawCost(p) ? 'Not enough Energy.' : null;
      case 'flush':
        return ap < 3 ? 'Swapping your whole hand costs 3 Energy.' : null;
      case 'play': {
        const card = p.hand.find((c) => c.uid === a.uid);
        if (!card) return 'You do not have that card.';
        const d = def(card.id);
        if (!['crew', 'gear', 'protocol'].includes(d.kind)) return d.kind === 'boost' ? 'Boosts are played when someone rolls.' : 'Signal Jams are played when someone else plays a card.';
        if (ap < 1) return 'Not enough Energy.';
        if (d.kind === 'gear' && !this.gearTargets(p, d).length) return d.cursed ? 'No rival Crew card without Gear to curse.' : 'You need a Crew card without Gear to carry it.';
        return null;
      }
      case 'activate': {
        const c = p.crew.find((x) => x.uid === a.uid);
        if (!c) return 'That is not your Crew card.';
        if (c.used) return 'That Crew card already acted this turn.';
        if (c.gear && def(c.gear.id).silence) return 'The Silence Collar stops this Crew card.';
        return ap < this.energyCost(p, c) ? 'Not enough Energy.' : null;
      }
      case 'attack': {
        if (ap < 2) return 'Attacking costs 2 Energy.';
        const b = this.beastRow.find((x) => x.uid === a.uid);
        if (!b) return 'That Beast is not there.';
        return this.meetsReqs(p, def(b.id)) ? null : 'Your crew does not meet its requirements.';
      }
      case 'ability':
        return this.freeAbilities(p).some((x) => x.key === a.key) ? null : 'You cannot use that now.';
      default:
        return 'Unknown action.';
    }
  }

  drawCost(p) {
    if (this.has(p, 'quickdraw') && !p.freeDrawUsed) return 0;
    return 1;
  }

  spend(n) {
    this.turn.ap = Math.max(0, this.turn.ap - n);
    this.changed();
  }

  async doAction(p, a) {
    switch (a.action) {
      case 'draw': {
        const cost = this.drawCost(p);
        if (cost === 0) {
          p.freeDrawUsed = true;
          this.say(`${p.name}'s Captain draws for free.`, { k: 'passive', pid: p.id });
        }
        this.spend(cost);
        this.draw(p, 1);
        await this.wait(350);
        break;
      }
      case 'flush': {
        this.spend(3);
        const n = p.hand.length;
        for (const c of p.hand.splice(0)) this.discardCard(c);
        this.say(`${p.name} flushes their hand (${n} cards) and draws five new ones.`, { k: 'flush', pid: p.id });
        this.draw(p, HAND_SIZE);
        await this.wait(600);
        break;
      }
      case 'play':
        await this.playFromHand(p, a.uid, { free: false });
        break;
      case 'activate': {
        const c = p.crew.find((x) => x.uid === a.uid);
        this.spend(this.energyCost(p, c));
        await this.useCrew(p, c, { how: 'activate' });
        break;
      }
      case 'attack':
        this.spend(2);
        await this.attack(p, a.uid);
        break;
      case 'ability': {
        p.used[a.key] = true;
        await this.runAbility(p, a.key.startsWith('cap:') ? a.key.slice(4) : 'loot');
        break;
      }
      default:
        break;
    }
  }

  async runAbility(p, ability) {
    switch (ability) {
      case 'pickpocket':
        await this.runSteps(p, [['pull']], { source: def(p.captain.id) });
        break;
      case 'mindread':
        await this.runSteps(p, [['peekHand', 'none']], { source: def(p.captain.id) });
        break;
      case 'loot':
        await this.runSteps(p, [['discard', 1], ['draw', 1]], { source: p.captain ? def(p.captain.id) : null });
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Playing a card from your hand (and being Signal Jammed)
  // ---------------------------------------------------------------------------
  gearTargets(p, d) {
    const targets = [];
    for (const { owner, crew } of this.allCrew()) {
      if (crew.gear) continue;
      if (d.cursed ? owner.id !== p.id : owner.id === p.id) targets.push({ owner, crew });
    }
    return targets;
  }

  // Plays the card (it has been chosen). Returns true if it resolved (was not jammed).
  async playFromHand(p, uid, { free }) {
    const card = this.takeFromHand(p, uid);
    if (!card) return false;
    const d = def(card.id);
    let target = null;
    if (d.kind === 'gear') {
      const targets = this.gearTargets(p, d);
      const options = targets.map((t) => this.crewOption(t.owner, t.crew));
      const [key] = await this.choose(p, { title: d.cursed ? `Curse which rival Crew card with ${d.name}?` : `Equip ${d.name} to which of your Crew cards?`, options, style: 'board', purpose: d.cursed ? 'gear-curse' : 'gear-own' });
      target = this.findCrew(key);
      if (!target) {
        p.hand.push(card);
        return false;
      }
    }
    if (!free) this.spend(1);
    this.stack = { card: { uid: card.uid, id: card.id }, by: p.id, target: target ? target.crew.uid : null, jammed: false, window: null };
    this.say(`${d.art} ${p.name} plays ${d.name}${target ? ` on ${this.get(target.owner.id).id === p.id ? 'their' : `${target.owner.name}'s`} ${def(target.crew.id).name}` : ''}.`, { k: 'play', pid: p.id, card: card.id, kind: d.kind });
    await this.wait(1100);
    const jammed = await this.signalJam(p, card);
    if (jammed) {
      this.discardCard(card);
      this.stack = null;
      this.changed();
      return false;
    }
    this.stack = null;
    // it works
    if (d.kind === 'crew') {
      const entry = { uid: card.uid, id: card.id, gear: null, shield: false, used: true };
      p.crew.push(entry);
      this.changed();
      if (this.has(p, 'playdraw')) {
        this.say(`${beastName(p, 'playdraw')} lets ${p.name} draw a card.`, { k: 'passive', pid: p.id });
        this.draw(p, 1);
      }
      await this.wait(500);
      await this.useCrew(p, entry, { how: 'play' });
    } else if (d.kind === 'gear') {
      const live = this.findCrew(target.crew.uid);
      if (live && !live.crew.gear) {
        live.crew.gear = { uid: card.uid, id: card.id };
        this.say(`${d.art} ${d.name} is fitted to ${def(live.crew.id).name}.`, { k: 'gear', card: card.id });
      } else this.discardCard(card);
      if (this.has(p, 'rigger')) {
        this.say(`${p.name}'s Captain draws a card.`, { k: 'passive', pid: p.id });
        this.draw(p, 1);
      }
      await this.wait(500);
    } else {
      // a Protocol
      this.discardCard(card);
      if (this.has(p, 'echo')) {
        this.say(`${p.name}'s Captain draws a card.`, { k: 'passive', pid: p.id });
        this.draw(p, 1);
      }
      await this.runSteps(p, d.fx, { source: d });
    }
    return true;
  }

  // Someone may answer with a Signal Jam. Returns true when the card was jammed.
  async signalJam(p, card) {
    if (p.noJam || p.jammed) return false;
    const eligible = this.others(p).filter((o) => o.hand.some((c) => c.id === 'jam'));
    if (!eligible.length) {
      await this.wait(500);
      return false;
    }
    this.stack.window = { until: Date.now() + this.timeoutFor('react') * this.pace };
    this.changed();
    let challenger = null;
    let jam = null;
    await Promise.all(
      eligible.map(async (o) => {
        const cards = o.hand.filter((c) => c.id === 'jam');
        const a = await this.ask(o.id, { type: 'react', pid: o.id, title: `Signal Jam ${def(card.id).name}?`, cards, by: p.id, card: card.id }, 'react');
        if (a.pass || challenger) return;
        challenger = o;
        jam = this.takeFromHand(o, a.uid);
        // the others do not need to answer any more
        for (const [rid, rec] of this.pending) if (rec.req.type === 'react' && rec.pid !== o.id) rec.finish({ pass: true });
      }),
    );
    if (this.stack) this.stack.window = null;
    if (!challenger || !jam) return false;
    this.discardCard(jam);
    p.jammed = true;
    this.stats.jams += 1;
    this.say(`📻 ${challenger.name} plays SIGNAL JAM on ${p.name}'s ${def(card.id).name}!`, { k: 'jam', pid: challenger.id });
    this.stack.challenger = challenger.id;
    this.changed();
    await this.wait(700);
    const defenseBonus = this.duelBonus(p);
    const jamBonus = this.duelBonus(challenger);
    const res = await this.rollDice({
      kind: 'duel',
      title: 'Signal Jam!',
      tie: 'second',
      sides: [
        { pid: p.id, bonus: defenseBonus },
        { pid: challenger.id, bonus: jamBonus },
      ],
    });
    const mine = res.find((r) => r.pid === p.id).total;
    const theirs = res.find((r) => r.pid === challenger.id).total;
    if (theirs >= mine) {
      this.say(`📻 The Jam works! ${p.name}'s ${def(card.id).name} fizzles (${theirs} vs ${mine}).`, { k: 'jam-win', pid: challenger.id });
      if (this.has(challenger, 'jamdraw')) {
        this.say(`${beastName(challenger, 'jamdraw')} lets ${challenger.name} draw a card.`, { k: 'passive', pid: challenger.id });
        this.draw(challenger, 1);
      }
      return true;
    }
    this.say(`${p.name} shrugs the Jam off (${mine} vs ${theirs}) and the card goes through.`, { k: 'jam-lose', pid: p.id });
    if (this.has(p, 'jamdraw')) this.draw(p, 1);
    return false;
  }

  // ---------------------------------------------------------------------------
  // Crew effects
  // ---------------------------------------------------------------------------
  // Roll for a Crew card's effect. (Not challengeable: only playing a card from hand is.)
  async useCrew(p, entry, { how }) {
    entry.used = true;
    const d = def(entry.id);
    const gear = entry.gear && def(entry.gear.id);
    if (gear?.silence) {
      this.say(`🔇 The Silence Collar stops ${d.name}.`, { k: 'fizzle' });
      return false;
    }
    const [res] = await this.rollDice({
      kind: 'check',
      title: `${d.name}: roll ${d.req}+`,
      need: d.req,
      sides: [{ pid: p.id, bonus: this.effectBonus(p, entry) }],
    });
    if (res.total >= d.req) {
      this.say(`✅ ${d.name} succeeds (${res.total} vs ${d.req}+).`, { k: 'effect', pid: p.id, card: d.id });
      if (gear?.loot) {
        this.say(`🍀 The Lucky Clover pays off: ${p.name} draws a card.`, { k: 'passive', pid: p.id });
        this.draw(p, 1);
      }
      await this.runSteps(p, d.fx, { source: d, crew: entry });
      return true;
    }
    this.say(`❌ ${d.name} fizzles (${res.total} vs ${d.req}+).`, { k: 'fizzle', pid: p.id, card: d.id });
    if (gear?.bomb && p.crew.includes(entry)) {
      this.say(`💣 The Ticking Bomb goes off! ${d.name} is destroyed.`, { k: 'destroy', card: d.id });
      this.removeCrew(p, entry, 'discard');
      this.discardCard({ uid: entry.uid, id: entry.id });
      this.changed();
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Void Beasts
  // ---------------------------------------------------------------------------
  meetsReqs(p, b) {
    // crew cards (not the Captain) can fill a class slot or an "any" slot, each only once
    const crew = p.crew.map((c) => def(c.id).cls);
    const capCls = p.captain ? def(p.captain.id).cls : null;
    const classSlots = b.reqs.filter((r) => r.cls).map((r) => r.cls);
    let anyNeeded = b.reqs.filter((r) => r.any).reduce((n, r) => n + r.any, 0);
    // assign each class slot to the Captain first (if it matches), else to a Crew card of that class
    const pool = [...crew];
    let capUsed = false;
    for (const cls of classSlots) {
      if (!capUsed && capCls === cls) {
        capUsed = true;
        continue;
      }
      const i = pool.indexOf(cls);
      if (i < 0) return false;
      pool.splice(i, 1);
    }
    return pool.length >= anyNeeded;
  }

  async attack(p, beastUid) {
    const b = this.beastRow.find((x) => x.uid === beastUid);
    if (!b) return;
    const d = def(b.id);
    this.stats.attacks += 1;
    this.say(`${d.art} ${p.name} attacks the ${d.name}!`, { k: 'attack', pid: p.id, card: d.id });
    await this.wait(700);
    const [res] = await this.rollDice({ kind: 'check', title: `Attack ${d.name}: ${d.slay}+ to slay`, need: d.slay, sides: [{ pid: p.id, bonus: this.attackBonus(p) }] });
    if (res.total >= d.slay) {
      this.beastRow = this.beastRow.filter((x) => x.uid !== b.uid);
      p.beasts.push(b);
      this.stats.slays += 1;
      this.say(`⚔️ ${p.name} SLAYS the ${d.name}! (${res.total} vs ${d.slay}+)`, { k: 'slay', pid: p.id, card: d.id });
      this.flipBeast();
      this.changed();
      if (p.beasts.length < WIN_BEASTS) {
        this.say(`${p.name} draws 2 cards for the kill.`, { k: 'draw', pid: p.id, n: 2 });
        this.draw(p, 2, { quiet: true });
      }
      await this.wait(900);
      if (p.beasts.length >= WIN_BEASTS) this.finish(p, 'beasts');
      return;
    }
    if (res.total <= d.fail) {
      this.say(`💥 The ${d.name} fights back! (${res.total}, ${d.fail} or less)`, { k: 'fightback', pid: p.id, card: d.id });
      await this.wait(500);
      if (d.penalty === 'sacrifice') await this.runSteps(p, [['sacrifice']], { source: d });
      else if (d.penalty === 'discard2') await this.runSteps(p, [['discard', 2]], { source: d });
    } else this.say(`The ${d.name} shrugs it off. Nothing happens. (${res.total})`, { k: 'nothing', pid: p.id, card: d.id });
  }

  // ---------------------------------------------------------------------------
  // The steps cards are made of
  // ---------------------------------------------------------------------------
  async runSteps(p, steps, ctx = {}) {
    ctx.last = ctx.last || {};
    for (const step of steps) {
      if (this.winner || this.stopped) return;
      const [name, ...args] = step;
      const fn = this.steps[name];
      if (!fn) throw new Error(`Unknown step ${name}`);
      await fn.call(this, p, ctx, ...args);
      this.changed();
    }
  }

  get steps() {
    return STEPS;
  }

  // Crew leaves play by being destroyed. Returns whether it really was destroyed.
  async destroyCrew(by, owner, crew, why) {
    this.stats.destroys += 1;
    if (this.has(owner, 'rebound') || crew.gear?.id === 'jetpack') {
      const gearGoes = crew.gear;
      this.removeCrew(owner, crew, 'hand');
      owner.hand.push({ uid: crew.uid, id: crew.id });
      const why2 = gearGoes?.id === 'jetpack' && !this.has(owner, 'rebound') ? 'the Emergency Jetpack' : 'its rebound';
      this.say(`🚀 ${def(crew.id).name} bounces back to ${owner.name}'s hand with ${why2}.`, { k: 'rebound', card: crew.id });
    } else {
      this.removeCrew(owner, crew, 'discard');
      this.discardCard({ uid: crew.uid, id: crew.id });
      this.say(`💥 ${def(crew.id).name} is destroyed${why ? ` by ${why}` : ''}!`, { k: 'destroy', pid: owner.id, card: crew.id, uid: crew.uid });
    }
    this.changed();
    await this.wait(500);
    if (this.has(owner, 'grit')) {
      this.say(`${owner.name}'s Captain draws a card.`, { k: 'passive', pid: owner.id });
      this.draw(owner, 1);
    }
    if (by && by.id !== owner.id && this.has(by, 'bounty')) {
      this.say(`${by.name}'s Captain draws a card.`, { k: 'passive', pid: by.id });
      this.draw(by, 1);
    }
    return true;
  }

  // Take a Crew card from someone's party into yours (Gear goes with it).
  stealCrew(by, owner, crew) {
    owner.crew.splice(owner.crew.indexOf(crew), 1);
    crew.shield = false;
    crew.used = false;
    by.crew.push(crew);
    this.say(`🦝 ${by.name} STEALS ${def(crew.id).name} from ${owner.name}!`, { k: 'steal', pid: by.id, from: owner.id, card: crew.id });
    this.changed();
    if (this.has(by, 'fence')) {
      this.say(`${by.name}'s Captain draws a card.`, { k: 'passive', pid: by.id });
      this.draw(by, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// The steps
// ---------------------------------------------------------------------------
const STEPS = {
  async draw(p, ctx, n) {
    this.draw(p, n);
    await this.wait(300);
  },

  // DISCARD n cards of your choice
  async discard(p, ctx, n) {
    const count = Math.min(n, p.hand.length);
    if (!count) return;
    const keys = await this.choose(p, { title: `DISCARD ${count} card${count > 1 ? 's' : ''}`, options: p.hand.map((c) => this.cardOption(c)), min: count, max: count, style: 'cards', force: p.hand.length > count, purpose: 'discard' });
    for (const k of keys) {
      const c = this.takeFromHand(p, k);
      if (c) this.discardCard(c);
    }
    this.say(`${p.name} discards ${count} card${count > 1 ? 's' : ''}.`, { k: 'discard', pid: p.id, n: count });
  },

  async othersDiscard(p, ctx, n) {
    for (const o of this.others(p)) {
      if (!o.hand.length) continue;
      const count = Math.min(n, o.hand.length);
      const keys = await this.choose(o, { title: `${p.name}'s card makes you DISCARD ${count}`, options: o.hand.map((c) => this.cardOption(c)), min: count, max: count, style: 'cards', force: o.hand.length > count, purpose: 'discard' });
      for (const k of keys) {
        const c = this.takeFromHand(o, k);
        if (c) this.discardCard(c);
      }
      this.say(`${o.name} discards ${count}.`, { k: 'discard', pid: o.id, n: count });
    }
  },

  // DESTROY a rival's Crew card
  async destroy(p, ctx) {
    const t = await this.chooseCrew(p, 'DESTROY which Crew card?', { who: 'others', purpose: 'destroy', filter: (o, c) => !this.protectedFrom(o, c, 'destroy') });
    if (!t) return this.say(`${p.name} finds nothing to destroy.`, { k: 'nothing' });
    await this.destroyCrew(p, t.owner, t.crew, ctx.source?.name);
  },

  async steal(p, ctx) {
    const t = await this.chooseCrew(p, 'STEAL which Crew card?', { who: 'others', purpose: 'steal', filter: (o, c) => !this.protectedFrom(o, c, 'steal') });
    if (!t) {
      ctx.last.stolen = null;
      return this.say(`${p.name} finds nothing to steal.`, { k: 'nothing' });
    }
    this.stealCrew(p, t.owner, t.crew);
    ctx.last.stolen = t.crew;
    ctx.last.victim = t.owner;
    await this.wait(500);
  },

  // STEAL, then roll to use it straight away (for free)
  async stealUse(p, ctx) {
    await STEPS.steal.call(this, p, ctx);
    const c = ctx.last.stolen;
    if (c && p.crew.includes(c) && (ctx.depth || 0) < 3) {
      c.used = true;
      const d = def(c.id);
      const [res] = await this.rollDice({ kind: 'check', title: `${d.name}: roll ${d.req}+`, need: d.req, sides: [{ pid: p.id, bonus: this.effectBonus(p, c) }] });
      if (res.total >= d.req) {
        this.say(`✅ ${d.name} obeys its new owner (${res.total} vs ${d.req}+).`, { k: 'effect', pid: p.id, card: d.id });
        await this.runSteps(p, d.fx, { source: d, crew: c, depth: (ctx.depth || 0) + 1 });
      } else this.say(`❌ ${d.name} fizzles (${res.total} vs ${d.req}+).`, { k: 'fizzle', pid: p.id, card: d.id });
    }
  },

  // PULL a random card from another player's hand
  async pull(p, ctx) {
    const o = await this.choosePlayer(p, 'PULL a card from whose hand?', (x) => x.hand.length > 0, (x) => `${x.hand.length} cards`, 'player-hand');
    if (!o) return this.say(`${p.name} finds nobody with cards to pull.`, { k: 'nothing' });
    const card = o.hand.splice(Math.floor(this.r() * o.hand.length), 1)[0];
    p.hand.push(card);
    this.say(`🤏 ${p.name} PULLS a random card from ${o.name}'s hand.`, { k: 'pull', pid: p.id, from: o.id });
    await this.wait(500);
  },

  async pullFromLast(p, ctx) {
    const o = ctx.last.victim;
    if (!o || !o.hand.length) return;
    const card = o.hand.splice(Math.floor(this.r() * o.hand.length), 1)[0];
    p.hand.push(card);
    this.say(`🤏 ${p.name} also PULLS a random card from ${o.name}'s hand.`, { k: 'pull', pid: p.id, from: o.id });
  },

  // LOOK at a hand. mode: 'none' | 'discard' (discard one) | 'take' (take one) | 'jam' (discard every Signal Jam)
  async peekHand(p, ctx, mode) {
    const o = await this.choosePlayer(p, 'LOOK at whose hand?', (x) => x.hand.length > 0, (x) => `${x.hand.length} cards`, 'player-hand');
    if (!o) return this.say(`${p.name} finds nobody with cards.`, { k: 'nothing' });
    this.say(`👀 ${p.name} looks at ${o.name}'s hand.`, { k: 'peek', pid: p.id, from: o.id });
    const cards = o.hand.map((c) => this.cardOption(c));
    if (mode === 'none') {
      await this.choose(p, { title: `${o.name}'s hand`, options: cards, min: 0, max: 0, style: 'cards', force: true, purpose: 'look', hint: 'Just looking. Close it when you are done.' });
    } else if (mode === 'jam') {
      const jams = o.hand.filter((c) => c.id === 'jam');
      await this.choose(p, { title: `${o.name}'s hand (every Signal Jam goes)`, options: cards, min: 0, max: 0, style: 'cards', force: true, purpose: 'look', hint: jams.length ? `${jams.length} Signal Jam${jams.length > 1 ? 's' : ''} will be discarded.` : 'No Signal Jams in there.' });
      for (const c of jams) {
        o.hand.splice(o.hand.indexOf(c), 1);
        this.discardCard(c);
      }
      if (jams.length) this.say(`📻 ${p.name} jams ${o.name}'s Signal Jams (${jams.length} discarded).`, { k: 'discard', pid: o.id, n: jams.length });
    } else {
      const [key] = await this.choose(p, { title: mode === 'take' ? `TAKE a card from ${o.name}'s hand` : `DISCARD a card from ${o.name}'s hand`, options: cards, style: 'cards', force: true, purpose: mode === 'take' ? 'take-from-hand' : 'discard-theirs' });
      const c = this.takeFromHand(o, key);
      if (!c) return;
      if (mode === 'take') {
        p.hand.push(c);
        this.say(`${p.name} takes a card from ${o.name}.`, { k: 'pull', pid: p.id, from: o.id });
      } else {
        this.discardCard(c);
        this.say(`${p.name} discards a card from ${o.name}'s hand.`, { k: 'discard', pid: o.id, n: 1 });
      }
    }
  },

  // SEARCH the discard pile for a card of a kind
  async search(p, ctx, what) {
    const pool = this.discard.filter((c) => (what === 'any' ? true : def(c.id).kind === what));
    if (!pool.length) return this.say(`${p.name} searches the discard pile but finds nothing useful.`, { k: 'nothing' });
    const [key] = await this.choose(p, { title: `SEARCH the discard pile: take a ${what === 'any' ? 'card' : `${def(pool[0].id).kind} card`}`, options: pool.map((c) => this.cardOption(c)), style: 'cards', force: true, purpose: 'search' });
    const i = this.discard.findIndex((c) => c.uid === key);
    if (i < 0) return;
    const c = this.discard.splice(i, 1)[0];
    p.hand.push(c);
    this.say(`♻️ ${p.name} fishes ${def(c.id).name} out of the discard pile.`, { k: 'search', pid: p.id, card: c.id });
    await this.wait(400);
  },

  // play a card of a kind from your hand for free (it can still be Signal Jammed). `fallback`: 'draw'
  async playFree(p, ctx, kind, fallback = null) {
    const cards = p.hand.filter((c) => def(c.id).kind === kind && (kind !== 'gear' || this.gearTargets(p, def(c.id)).length));
    if (!cards.length) {
      if (fallback === 'draw') this.draw(p, 1);
      else this.say(`${p.name} has no ${kind} card to play.`, { k: 'nothing' });
      return;
    }
    const [key] = await this.choose(p, { title: `Play a ${kind} card for free`, options: cards.map((c) => this.cardOption(c)), style: 'cards', force: true, purpose: 'play-free' });
    await this.playFromHand(p, key, { free: true });
  },

  async drawPlay(p, ctx) {
    const [c] = this.draw(p, 1);
    if (c && def(c.id).kind === 'crew') {
      await this.wait(500);
      await this.playFromHand(p, c.uid, { free: true });
    }
  },

  async attackFree(p, ctx) {
    const options = this.beastRow.filter((b) => this.meetsReqs(p, def(b.id))).map((b) => ({ key: b.uid, kind: 'beast', uid: b.uid, id: b.id, label: def(b.id).name }));
    if (!options.length) return this.say(`${p.name}'s crew cannot attack any Void Beast yet.`, { k: 'nothing' });
    const [key] = await this.choose(p, { title: 'ATTACK which Void Beast (free)?', options, style: 'board', force: true, purpose: 'attack' });
    await this.attack(p, key);
  },

  async shield(p, ctx, which) {
    const mine = p.crew;
    if (!mine.length) return;
    if (which === 'all') {
      for (const c of mine) c.shield = true;
      this.say(`🛡️ ${p.name} shields their whole crew until their next turn.`, { k: 'shield', pid: p.id });
    } else {
      const [key] = await this.choose(p, { title: 'SHIELD which of your Crew cards?', options: mine.map((c) => this.crewOption(p, c)), style: 'board', purpose: 'shield' });
      const c = mine.find((x) => x.uid === key);
      if (c) {
        c.shield = true;
        this.say(`🛡️ ${def(c.id).name} is shielded until ${p.name}'s next turn.`, { k: 'shield', pid: p.id });
      }
    }
  },

  async returnOwn(p, ctx) {
    if (!p.crew.length) return this.say(`${p.name} has no Crew to return.`, { k: 'nothing' });
    const [key] = await this.choose(p, { title: 'Return which of your Crew cards to your hand?', options: p.crew.map((c) => this.crewOption(p, c)), style: 'board', purpose: 'return-own' });
    const c = p.crew.find((x) => x.uid === key);
    if (!c) return;
    this.removeCrew(p, c, 'hand');
    p.hand.push({ uid: c.uid, id: c.id });
    this.say(`↩️ ${p.name} takes ${def(c.id).name} back into their hand.`, { k: 'bounce', pid: p.id, card: c.id });
  },

  // return any Crew card to its owner's hand
  async bounce(p, ctx) {
    const t = await this.chooseCrew(p, "Return which Crew card to its owner's hand?", { who: 'any', purpose: 'bounce', filter: (o, c) => !(o.id !== p.id && this.protectedFrom(o, c, 'destroy')) });
    if (!t) return;
    this.removeCrew(t.owner, t.crew, 'hand');
    t.owner.hand.push({ uid: t.crew.uid, id: t.crew.id });
    this.say(`🫥 ${def(t.crew.id).name} phases out and returns to ${t.owner.name}'s hand.`, { k: 'bounce', pid: t.owner.id, card: t.crew.id });
    await this.wait(500);
  },

  async noChallenge(p, ctx) {
    p.noJam = true;
    this.say(`🔕 ${p.name}'s cards cannot be Signal Jammed for the rest of this turn.`, { k: 'nojam', pid: p.id });
  },

  // look at the top n cards, take one, the rest go to the bottom
  async peekDeck(p, ctx, n) {
    const top = [];
    for (let i = 0; i < n; i++) {
      if (!this.deck.length && this.discard.length) this.deck = this.shuffle(this.discard.splice(0));
      if (this.deck.length) top.push(this.deck.pop());
    }
    if (!top.length) return;
    const [key] = await this.choose(p, { title: `Take 1 of the top ${top.length} cards (the rest go to the bottom)`, options: top.map((c) => this.cardOption(c)), style: 'cards', force: true, purpose: 'search' });
    for (const c of top) {
      if (c.uid === key) p.hand.push(c);
      else this.deck.unshift(c);
    }
    this.say(`🔭 ${p.name} picks a card from the top of the deck.`, { k: 'draw', pid: p.id, n: 1 });
  },

  async topBoosts(p, ctx, n) {
    const top = [];
    for (let i = 0; i < n; i++) {
      if (!this.deck.length && this.discard.length) this.deck = this.shuffle(this.discard.splice(0));
      if (this.deck.length) top.push(this.deck.pop());
    }
    const boosts = top.filter((c) => def(c.id).kind === 'boost');
    const rest = top.filter((c) => def(c.id).kind !== 'boost');
    for (const c of rest) this.deck.unshift(c);
    for (const c of boosts) p.hand.push(c);
    this.say(`📢 ${p.name} reveals ${top.length} cards and keeps ${boosts.length} Boost${boosts.length === 1 ? '' : 's'}.`, { k: 'draw', pid: p.id, n: boosts.length });
    await this.wait(600);
  },

  async energy(p, ctx, n) {
    if (this.turn && this.turn.pid === p.id) {
      this.turn.ap += n;
      this.say(`⚡ ${p.name} gains ${n} Energy.`, { k: 'energy', pid: p.id, n });
    }
  },

  async rollBuff(p, ctx, n) {
    p.buff += n;
    this.say(`📈 ${p.name} gets +${n} to all rolls for the rest of this turn.`, { k: 'buff', pid: p.id });
  },

  async everyoneDraw(p, ctx, n) {
    for (const o of this.players) this.draw(o, n, { quiet: true });
    this.say(`🎶 Everybody draws ${n === 1 ? 'a card' : `${n} cards`}!`, { k: 'draw', n });
    await this.wait(500);
  },

  async swapHands(p, ctx) {
    const o = await this.choosePlayer(p, 'SWAP hands with whom?', () => true, null, 'swap-hands');
    if (!o) return;
    [p.hand, o.hand] = [o.hand, p.hand];
    this.say(`🔄 ${p.name} swaps hands with ${o.name}!`, { k: 'swap', pid: p.id, from: o.id });
    await this.wait(600);
  },

  async passHands(p, ctx) {
    const list = this.players;
    const hands = list.map((x) => x.hand);
    list.forEach((x, i) => (x.hand = hands[(i + list.length - 1) % list.length]));
    this.say('🎤 Everyone passes their hand to the left!', { k: 'swap' });
    await this.wait(700);
  },

  async hardReset(p, ctx, n) {
    for (const o of this.players) {
      for (const c of o.hand.splice(0)) this.discardCard(c);
    }
    for (const o of this.players) this.draw(o, n, { quiet: true });
    this.say(`🔄 HARD RESET: everyone discards their hand and draws ${n}.`, { k: 'flush' });
    await this.wait(700);
  },

  async forceSacrifice(p, ctx) {
    const o = await this.choosePlayer(p, 'Who must SACRIFICE a Crew card?', (x) => x.crew.length > 0, (x) => `${x.crew.length} Crew`, 'player-crew');
    if (!o) return this.say(`${p.name} finds nobody with Crew to sacrifice.`, { k: 'nothing' });
    await STEPS.sacrifice.call(this, o, ctx, p);
  },

  // SACRIFICE one of your own Crew cards
  async sacrifice(p, ctx, forcedBy = null) {
    if (!p.crew.length) return this.say(`${p.name} has no Crew to sacrifice.`, { k: 'nothing' });
    const [key] = await this.choose(p, { title: forcedBy ? `${forcedBy.name} forces you to SACRIFICE a Crew card` : 'SACRIFICE one of your Crew cards', options: p.crew.map((c) => this.crewOption(p, c)), style: 'board', force: p.crew.length > 1, purpose: 'sacrifice' });
    const c = p.crew.find((x) => x.uid === key);
    if (!c) return;
    this.removeCrew(p, c, 'discard');
    this.discardCard({ uid: c.uid, id: c.id });
    this.say(`🕯️ ${p.name} sacrifices ${def(c.id).name}.`, { k: 'destroy', pid: p.id, card: c.id });
    await this.wait(500);
  },

  // move a Gear card onto one of your own Crew cards that has none
  async gearMove(p, ctx) {
    const carriers = p.crew.filter((c) => !c.gear);
    if (!carriers.length) return this.say(`${p.name} has no free Crew card to carry Gear.`, { k: 'nothing' });
    const t = await this.chooseCrew(p, 'Take Gear from which Crew card?', { who: 'any', purpose: 'gear-take', filter: (o, c) => !!c.gear && !(o.id !== p.id && this.protectedFrom(o, c, 'steal')) && !(o.id === p.id && carriers.length === 1 && carriers[0] === c) });
    if (!t) return this.say(`${p.name} finds no Gear to move.`, { k: 'nothing' });
    const targets = p.crew.filter((c) => !c.gear);
    const [key] = await this.choose(p, { title: 'Give it to which of your Crew cards?', options: targets.map((c) => this.crewOption(p, c)), style: 'board', purpose: 'gear-own' });
    const dest = p.crew.find((x) => x.uid === key);
    if (!dest) return;
    dest.gear = t.crew.gear;
    t.crew.gear = null;
    this.say(`🔧 ${p.name} moves ${def(dest.gear.id).name} onto ${def(dest.id).name}.`, { k: 'gear', pid: p.id });
    await this.wait(500);
  },

  async gearDestroy(p, ctx) {
    const t = await this.chooseCrew(p, 'DESTROY the Gear on which Crew card?', { who: 'any', purpose: 'gear-destroy', filter: (o, c) => !!c.gear });
    if (!t) return this.say(`${p.name} finds no Gear to destroy.`, { k: 'nothing' });
    const g = t.crew.gear;
    t.crew.gear = null;
    this.discardCard(g);
    this.say(`💥 ${def(g.id).name} on ${def(t.crew.id).name} is destroyed!`, { k: 'destroy', card: g.id });
    await this.wait(500);
  },

  async gearsHome(p, ctx) {
    let n = 0;
    for (const { owner, crew } of this.allCrew()) {
      if (!crew.gear) continue;
      owner.hand.push(crew.gear);
      crew.gear = null;
      n += 1;
    }
    this.say(`🌀 ${n} Gear card${n === 1 ? '' : 's'} fly back to their owners' hands.`, { k: 'bounce' });
    await this.wait(600);
  },

  async swapCrew(p, ctx) {
    if (!p.crew.length) return this.say(`${p.name} has no Crew to swap.`, { k: 'nothing' });
    const theirs = await this.chooseCrew(p, "SWAP for which rival's Crew card?", { who: 'others', purpose: 'steal', filter: (o, c) => !this.protectedFrom(o, c, 'steal') });
    if (!theirs) return this.say(`${p.name} finds no Crew card to swap with.`, { k: 'nothing' });
    const [key] = await this.choose(p, { title: 'Give up which of your Crew cards?', options: p.crew.map((c) => this.crewOption(p, c)), style: 'board', purpose: 'sacrifice' });
    const mine = p.crew.find((x) => x.uid === key);
    if (!mine) return;
    p.crew.splice(p.crew.indexOf(mine), 1, theirs.crew);
    theirs.owner.crew.splice(theirs.owner.crew.indexOf(theirs.crew), 1, mine);
    for (const c of [mine, theirs.crew]) {
      c.shield = false;
      c.used = false;
    }
    this.say(`🔁 ${p.name} swaps ${def(mine.id).name} for ${theirs.owner.name}'s ${def(theirs.crew.id).name}.`, { k: 'swap', pid: p.id });
    await this.wait(600);
  },

  // you and another player each roll: the winner takes a random card from the loser
  async luckDuel(p, ctx) {
    const o = await this.choosePlayer(p, 'Roll against whom?', () => true, null, 'duel');
    if (!o) return;
    const res = await this.rollDice({ kind: 'duel', title: 'Lucky roll-off!', tie: 'draw', sides: [{ pid: p.id, bonus: this.duelBonus(p) }, { pid: o.id, bonus: this.duelBonus(o) }] });
    const a = res.find((r) => r.pid === p.id).total;
    const b = res.find((r) => r.pid === o.id).total;
    const [from, to] = a > b ? [o, p] : a < b ? [p, o] : [null, null];
    if (!from || !from.hand.length) return this.say(a === b ? 'A tie! Nobody takes anything.' : `${(from || {}).name || 'The loser'} has no cards to lose.`, { k: 'nothing' });
    const card = from.hand.splice(Math.floor(this.r() * from.hand.length), 1)[0];
    to.hand.push(card);
    this.say(`🎰 ${to.name} wins the roll-off and takes a card from ${from.name}.`, { k: 'pull', pid: to.id, from: from.id });
    await this.wait(500);
  },
};

function cleanName(name) {
  return String(name || '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 16);
}

// the name of the Beast that gives a player a passive (for the log)
function beastName(p, passive) {
  const b = p.beasts.find((x) => def(x.id).passive === passive);
  if (b) return def(b.id).name;
  return p.captain ? def(p.captain.id).title : 'A power';
}

module.exports = { PhaseGame, STEPS, MIN_PLAYERS, MAX_PLAYERS, HAND_SIZE, WIN_BEASTS, CLASSES, TIMERS, EMOTES };

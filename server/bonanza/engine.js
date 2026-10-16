// Star Bonanza: the rules.
//
// Unlike a turn-by-turn dice game, this one never waits on a single person: anyone can harvest at any moment, and
// people trade while it is someone else's turn. So the game is a small state machine. A turn has four phases:
//
//   plant   the active player MUST plant the first star in their hand (stars stay in the order they were dealt) and
//           MAY plant the next one
//   trade   two stars are turned over; the active player trades them, and any star in their hand, with the others
//   tray    everyone plants the stars they got by trading (the active player also plants any left over)
//   draw    the active player draws three stars to the back of their hand, and the next player goes
//
// People act with act(); robots, and people who have gone quiet, are driven by bots.js through the very same
// calls. The server checks everything and each person only ever sees viewFor(id).

const { STARS, starDef, BASE_SET, FULL_SET, MIN_PLAYERS, MAX_PLAYERS, START_HAND, DRAW_COUNT, FACE_UP, FIELD_PRICE, MAX_OFFERS, AVATARS, BOT_AVATARS, EMOTES, PASSES, SPEEDS, payout, nextPayout } = require('./data');
const { autoStep } = require('./bots');

const LOG_KEEP = 120;
// how long people get (ms) before a robot acts for them; "speed" scales these
const TIMERS = { plant: 45_000, trade: 80_000, tray: 45_000 };
const SPEED = { chill: 1.8, normal: 1, quick: 0.55 };
const NAMES = ['Nova', 'Orbit', 'Zip', 'Comet', 'Quasar', 'Pixel', 'Blip', 'Cosmo', 'Widget', 'Lumen', 'Static', 'Pogo'];

function cleanName(name) {
  return String(name || '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 18);
}

class BonanzaGame {
  constructor(code, { rng = Math.random, pace = 1 } = {}) {
    this.code = code;
    this.rng = rng;
    this.pace = pace; // 1 = normal; 0 = robots act at once (tests)
    this.version = 0;
    this.phase = 'lobby'; // lobby | playing | ended
    this.players = [];
    this.spectators = [];
    this.hostId = null;
    this.deck = [];
    this.discard = [];
    this.deckOuts = 0; // how many times the deck has run out
    this.endPending = false; // the deck ran out for the last time: the game ends when this turn is done
    this.turn = null;
    this.turnIndex = 0;
    this.turnCount = 0;
    this.setIds = BASE_SET;
    this.log = [];
    this.seq = 0;
    this.uids = 0;
    this.chat = [];
    this.settings = { speed: 'normal', passes: 2, full: false };
    this.standings = null;
    this.winner = null;
    this.onChange = () => {};
    this.nameCount = 0;
    this.practice = false;
    this.stopped = false;
    this.timer = null;
    this.autoTimers = new Map();
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
  changed() {
    this.version += 1;
    this.onChange();
  }
  get(id) {
    return this.players.find((p) => p.id === id) || null;
  }
  isAuto(p) {
    return p.isBot || !p.connected || p.afk;
  }
  get active() {
    return this.turn ? this.get(this.turn.pid) : null;
  }
  say(text, extra = {}) {
    this.seq += 1;
    this.log.push({ seq: this.seq, text, at: Date.now(), ...extra });
    if (this.log.length > LOG_KEEP) this.log.shift();
    this.changed();
  }
  name(id) {
    return this.get(id)?.name || 'Someone';
  }
  starName(t) {
    return starDef(t)?.name || t;
  }

  // ---------------------------------------------------------------------------
  // The lobby
  // ---------------------------------------------------------------------------
  addPlayer(name, { isBot = false } = {}) {
    if (this.phase !== 'lobby') throw new Error('The game has already started.');
    if (this.players.length >= MAX_PLAYERS) throw new Error(`The table is full (${MAX_PLAYERS} players).`);
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
      wins: 0,
    };
    this.resetPlayer(p);
    this.players.push(p);
    if (!this.hostId && !isBot) this.hostId = p.id;
    this.changed();
    return p;
  }

  resetPlayer(p) {
    p.hand = [];
    p.fields = [];
    p.stash = []; // lumens: harvested stars, turned face down
    p.tray = []; // stars won in trades, waiting to be planted
    p.afk = false;
    p.stats = { harvests: 0, best: 0, trades: 0, gifts: 0, bought: 0, earned: {} };
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
        this.runAuto();
      }
    }
    this.spectators = this.spectators.filter((s) => s.id !== id);
  }

  wake(id) {
    const p = this.get(id);
    if (p && p.afk) {
      p.afk = false;
      this.say(`${p.name} is back at the table.`, { k: 'afk', pid: id });
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

  setSettings(byId, s = {}) {
    this.requireHost(byId);
    if (this.phase !== 'lobby') throw new Error('Change the rules in the lobby.');
    if (s.speed != null) {
      if (!SPEEDS.includes(s.speed)) throw new Error('Unknown speed.');
      this.settings.speed = s.speed;
    }
    if (s.passes != null) {
      if (!PASSES.some((x) => x.id === Number(s.passes))) throw new Error('The deck can run out 1, 2 or 3 times.');
      this.settings.passes = Number(s.passes);
    }
    if (s.full != null) this.settings.full = !!s.full;
    this.changed();
  }

  timeoutFor(kind) {
    return Math.round(TIMERS[kind] * (SPEED[this.settings.speed] || 1));
  }

  start(byId) {
    this.requireHost(byId);
    if (this.phase !== 'lobby') throw new Error('Already started.');
    if (this.players.length < MIN_PLAYERS) throw new Error(`You need at least ${MIN_PLAYERS} players (add a robot!).`);
    this.setup();
  }

  setup() {
    const n = this.players.length;
    this.setIds = this.settings.full || n >= 6 ? FULL_SET : BASE_SET;
    this.deck = [];
    for (const id of this.setIds) for (let i = 0; i < starDef(id).count; i++) this.deck.push({ uid: `c${++this.uids}`, t: id });
    this.shuffle(this.deck);
    this.discard = [];
    this.deckOuts = 0;
    this.endPending = false;
    this.log = [];
    this.winner = null;
    this.standings = null;
    this.turnCount = 0;
    this.shuffle(this.players); // who sits where, and who goes first
    for (const p of this.players) {
      this.resetPlayer(p);
      p.fields = Array.from({ length: n === 3 ? 3 : 2 }, () => ({ type: null, cards: [] }));
      for (let i = 0; i < START_HAND; i++) p.hand.push(this.deck.pop());
    }
    this.phase = 'playing';
    this.say(`${n} players, ${this.setIds.length} kinds of star, ${this.deck.length} stars left in the deck. Plant well!`, { k: 'start' });
    this.startTurn(0);
  }

  // back to the lobby for another game with the same people
  toLobby(byId) {
    this.requireHost(byId);
    if (this.phase !== 'ended') throw new Error('The game is still going.');
    this.players = this.players.filter((p) => p.isBot || p.connected);
    for (const p of this.players) this.resetPlayer(p);
    this.phase = 'lobby';
    this.turn = null;
    this.deck = [];
    this.discard = [];
    this.winner = null;
    this.standings = null;
    this.log = [];
    this.clearTimers();
    this.changed();
  }

  clearTimers() {
    clearTimeout(this.timer);
    this.timer = null;
    for (const t of this.autoTimers.values()) clearTimeout(t);
    this.autoTimers.clear();
  }

  destroy() {
    this.stopped = true;
    this.clearTimers();
  }

  // ---------------------------------------------------------------------------
  // The deck
  // ---------------------------------------------------------------------------
  // The last card drawn from the deck turns the discard pile into a new deck, the third time it ends the game.
  drawOne() {
    if (!this.deck.length && this.discard.length && !this.endPending) this.reshuffle();
    const card = this.deck.pop();
    if (!card) return null;
    if (!this.deck.length) {
      this.deckOuts += 1;
      if (this.deckOuts >= this.settings.passes) {
        this.endPending = true;
        this.say('The deck has run out for the last time! This turn is the last.', { k: 'last' });
      } else this.reshuffle();
    }
    return card;
  }

  reshuffle() {
    this.deck = this.shuffle(this.discard.splice(0));
    this.say(`The deck runs out and is shuffled again (${this.deckOuts} of ${this.settings.passes}).`, { k: 'reshuffle', n: this.deckOuts });
  }

  // ---------------------------------------------------------------------------
  // The turn
  // ---------------------------------------------------------------------------
  startTurn(index) {
    if (this.stopped) return;
    this.turnIndex = index % this.players.length;
    const p = this.players[this.turnIndex];
    this.turn = { pid: p.id, n: ++this.turnCount, phase: 'plant', planted: 0, faceUp: [], offers: [], deadline: null };
    this.say(`${p.name}'s turn`, { k: 'turn', pid: p.id });
    if (!p.hand.length) return this.beginTrade();
    this.setDeadline('plant');
    this.runAuto();
  }

  setDeadline(kind) {
    clearTimeout(this.timer);
    const ms = this.timeoutFor(kind);
    const n = this.turn.n;
    this.turn.deadline = Date.now() + ms;
    this.timer = setTimeout(() => this.onDeadline(kind, n), ms);
    this.timer.unref?.();
    this.changed();
  }

  // somebody (or a robot) has gone quiet: a robot takes over for them
  onDeadline(kind, n) {
    if (this.stopped || this.phase !== 'playing' || !this.turn || this.turn.n !== n || this.turn.phase !== kind) return;
    if (kind === 'trade') return this.beginTray();
    const who = kind === 'plant' ? [this.active] : this.players.filter((p) => p.tray.length);
    for (const p of who) {
      if (!p.isBot && !p.afk) {
        p.afk = true;
        this.say(`💤 ${p.name} went quiet, so a robot is planting for them.`, { k: 'afk', pid: p.id });
      }
    }
    let guard = 40;
    while (guard-- > 0 && this.turn && this.turn.n === n && this.turn.phase === kind) {
      let moved = false;
      for (const p of who) {
        const a = autoStep(this, p, { forced: true });
        if (a && this.perform(p, a)) moved = true;
      }
      if (!moved) break;
    }
  }

  beginTrade() {
    const t = this.turn;
    t.phase = 'trade';
    t.faceUp = [];
    for (let i = 0; i < FACE_UP; i++) {
      const c = this.drawOne();
      if (c) t.faceUp.push(c);
    }
    t.tradeAt = Date.now();
    this.say(`${this.name(t.pid)} turns over ${t.faceUp.map((c) => this.starName(c.t)).join(' and ') || 'nothing'}.`, { k: 'reveal', pid: t.pid, cards: t.faceUp.map((c) => c.t) });
    this.setDeadline('trade');
    this.runAuto();
  }

  beginTray() {
    const t = this.turn;
    t.phase = 'tray';
    t.offers = [];
    const p = this.active;
    p.tray.push(...t.faceUp);
    t.faceUp = [];
    this.say('Time to plant everything you won.', { k: 'tray', pid: t.pid });
    if (this.players.every((x) => !x.tray.length)) return this.finishTurn();
    this.setDeadline('tray');
    this.runAuto();
  }

  finishTurn() {
    const p = this.active;
    this.turn.phase = 'draw';
    let drawn = 0;
    for (let i = 0; i < DRAW_COUNT; i++) {
      const c = this.drawOne();
      if (!c) break;
      p.hand.push(c);
      drawn += 1;
    }
    this.say(`${p.name} draws ${drawn} star${drawn === 1 ? '' : 's'}.`, { k: 'draw', pid: p.id, n: drawn });
    clearTimeout(this.timer);
    if (this.endPending) return this.finishGame();
    // a breath between turns, so the table can be seen
    this.later(500, () => this.startTurn(this.turnIndex + 1));
  }

  later(ms, fn) {
    const t = ms * this.pace;
    if (t <= 0) return Promise.resolve().then(() => !this.stopped && fn());
    const timer = setTimeout(() => !this.stopped && fn(), t);
    timer.unref?.();
    return timer;
  }

  // ---------------------------------------------------------------------------
  // What people can do
  // ---------------------------------------------------------------------------
  // The one door for people. Returns nothing; throws a plain message when something is not allowed.
  act(pid, a) {
    const p = this.get(pid);
    if (!p) throw new Error('You are watching this game.');
    if (this.phase !== 'playing') throw new Error('The game is not running.');
    if (!a || typeof a !== 'object') throw new Error('Bad action.');
    p.afk = false;
    this.apply(p, a);
    this.runAuto();
  }

  // the same, for robots: true if it worked
  perform(p, a) {
    try {
      this.apply(p, a);
      return true;
    } catch (err) {
      return false;
    }
  }

  apply(p, a) {
    switch (a.type) {
      case 'plant':
        return this.plant(p, a);
      case 'skipPlant':
        return this.skipPlant(p);
      case 'harvest':
        return this.harvest(p, Number(a.field));
      case 'buyField':
        return this.buyField(p);
      case 'offer':
        return this.postOffer(p, a);
      case 'cancelOffer':
        return this.cancelOffer(p, String(a.id));
      case 'accept':
        return this.acceptOffer(p, a);
      case 'doneTrading':
        return this.doneTrading(p);
      default:
        throw new Error('Unknown action.');
    }
  }

  // ----- planting -----
  plant(p, { field, uid, harvest }) {
    const t = this.turn;
    let card;
    if (t.phase === 'plant') {
      if (t.pid !== p.id) throw new Error('It is not your turn.');
      if (!p.hand.length || t.planted >= 2) throw new Error('You have nothing more to plant now.');
      card = p.hand[0];
    } else if (t.phase === 'tray') {
      card = uid != null ? p.tray.find((c) => c.uid === uid) : p.tray[0];
      if (!card) throw new Error('You have nothing to plant.');
    } else throw new Error('You cannot plant right now.');
    const f = p.fields[Number(field)];
    if (!f) throw new Error('Which nursery?');
    if (f.cards.length && f.type !== card.t) {
      if (!harvest) {
        const err = new Error(`That nursery grows ${this.starName(f.type)}s: harvest it first to plant a ${this.starName(card.t)}.`);
        err.code = 'mismatch';
        throw err;
      }
      this.harvest(p, Number(field)); // may refuse (a single star while another nursery is bigger)
    }
    if (t.phase === 'plant') {
      p.hand.shift();
      t.planted += 1;
    } else p.tray.splice(p.tray.indexOf(card), 1);
    f.type = card.t;
    f.cards.push(card);
    this.say(`${p.name} plants ${/^[aeiou]/i.test(this.starName(card.t)) ? 'an' : 'a'} ${this.starName(card.t)}.`, { k: 'plant', pid: p.id, field: Number(field), t: card.t, n: f.cards.length });
    if (t.phase === 'plant') {
      if (t.planted >= 2 || !p.hand.length) this.beginTrade();
    } else if (this.players.every((x) => !x.tray.length)) this.finishTurn();
  }

  skipPlant(p) {
    const t = this.turn;
    if (t.phase !== 'plant' || t.pid !== p.id) throw new Error('Nothing to skip.');
    if (t.planted < 1 && p.hand.length) throw new Error('You must plant your first star.');
    this.beginTrade();
  }

  // ----- harvesting -----
  canHarvest(p, idx) {
    const f = p.fields[idx];
    if (!f || !f.cards.length) return false;
    // a single star is protected while any other nursery has more than one
    return !(f.cards.length === 1 && p.fields.some((g, j) => j !== idx && g.cards.length > 1));
  }

  harvest(p, idx, { force = false } = {}) {
    if (this.phase !== 'playing' && !force) throw new Error('The game is not running.');
    const f = p.fields[idx];
    if (!f || !f.cards.length) throw new Error('That nursery is empty.');
    if (!force && !this.canHarvest(p, idx)) throw new Error('A nursery with one star can only be harvested when none of your others has more.');
    const n = f.cards.length;
    const type = f.type;
    const k = payout(type, n);
    const cards = f.cards;
    f.cards = [];
    f.type = null;
    p.stash.push(...cards.slice(0, k));
    this.discard.push(...cards.slice(k));
    p.stats.harvests += 1;
    p.stats.best = Math.max(p.stats.best, k);
    p.stats.earned[type] = (p.stats.earned[type] || 0) + k;
    this.say(k ? `${p.name} harvests ${n} ${this.starName(type)}${n === 1 ? '' : 's'} for ${k} lumen${k === 1 ? '' : 's'}.` : `${p.name} lets ${n} ${this.starName(type)}${n === 1 ? '' : 's'} burn out for nothing.`, { k: 'harvest', pid: p.id, field: idx, t: type, n, lumens: k });
    return k;
  }

  buyField(p) {
    if (p.fields.length >= 3) throw new Error('You already have three nurseries.');
    if (p.stash.length < FIELD_PRICE) throw new Error(`A third nursery costs ${FIELD_PRICE} lumens.`);
    this.discard.push(...p.stash.splice(0, FIELD_PRICE));
    p.fields.push({ type: null, cards: [] });
    p.stats.bought += 1;
    this.say(`${p.name} pays ${FIELD_PRICE} lumens for a third nursery.`, { k: 'field', pid: p.id });
  }

  // ----- trading -----
  findTradable(p, uid) {
    if (!p) return null;
    const t = this.turn;
    return p.hand.find((c) => c.uid === uid) || (t && t.pid === p.id ? t.faceUp.find((c) => c.uid === uid) : null) || null;
  }

  removeCards(p, cards) {
    const t = this.turn;
    for (const c of cards) {
      const i = p.hand.indexOf(c);
      if (i >= 0) p.hand.splice(i, 1);
      else if (t) {
        const j = t.faceUp.indexOf(c);
        if (j >= 0) t.faceUp.splice(j, 1);
      }
    }
  }

  postOffer(p, a) {
    const t = this.turn;
    if (t.phase !== 'trade') throw new Error('Trading is only open while stars are turned over.');
    const active = p.id === t.pid;
    const uids = [...new Set((Array.isArray(a.give) ? a.give : []).map(String))];
    const give = uids.map((uid) => this.findTradable(p, uid));
    if (give.some((c) => !c)) throw new Error('You no longer have one of those stars.');
    const want = (Array.isArray(a.want) ? a.want : [])
      .map((w) => ({ t: String(w.t), n: Math.max(1, Math.min(4, Math.floor(Number(w.n) || 1))) }))
      .filter((w) => this.setIds.includes(w.t));
    if (!give.length && !want.length) throw new Error('Offer a star, or ask for one.');
    if (give.length > 6 || want.reduce((s, w) => s + w.n, 0) > 6) throw new Error('That is too many stars at once.');
    if (t.offers.filter((o) => o.from === p.id).length >= MAX_OFFERS) throw new Error(`You can have ${MAX_OFFERS} offers open at once.`);
    let to = null;
    if (!active) to = t.pid; // everybody else trades with the player whose turn it is
    else if (a.to && a.to !== p.id && this.get(a.to)) to = a.to;
    const offer = { id: `o${++this.uids}`, from: p.id, to, give: give.map((c) => c.uid), want, at: Date.now() };
    t.offers.push(offer);
    t.made = t.made || {};
    t.made[p.id] = (t.made[p.id] || 0) + 1; // how many offers each player has made this turn (robots stop after a couple)
    this.say(`${p.name} offers ${give.map((c) => this.starName(c.t)).join(', ') || 'a gift of nothing'}${want.length ? ` for ${want.map((w) => `${w.n} ${this.starName(w.t)}`).join(', ')}` : ' as a gift'}.`, { k: 'offer', pid: p.id, offer: offer.id });
  }

  cancelOffer(p, id) {
    const t = this.turn;
    const i = t.offers.findIndex((o) => o.id === id && o.from === p.id);
    if (i < 0) throw new Error('That offer is gone.');
    t.offers.splice(i, 1);
    this.changed();
  }

  acceptOffer(p, a) {
    const t = this.turn;
    if (t.phase !== 'trade') throw new Error('Trading is closed.');
    const o = t.offers.find((x) => x.id === String(a.id));
    if (!o) throw new Error('That offer is gone.');
    const owner = this.get(o.from);
    if (!owner || owner.id === p.id) throw new Error('You cannot accept your own offer.');
    if (o.from === t.pid) {
      if (o.to && o.to !== p.id) throw new Error('That offer is for someone else.');
    } else if (p.id !== t.pid) throw new Error(`Only ${this.name(t.pid)} can accept that.`);
    const offered = o.give.map((uid) => this.findTradable(owner, uid));
    if (offered.some((c) => !c)) {
      t.offers = t.offers.filter((x) => x.id !== o.id);
      this.changed();
      throw new Error('Those stars are no longer available.');
    }
    const giveUids = [...new Set((Array.isArray(a.give) ? a.give : []).map(String))];
    const given = giveUids.map((uid) => this.findTradable(p, uid));
    if (given.some((c) => !c)) throw new Error('You no longer have one of those stars.');
    // what they asked for must match exactly
    const need = {};
    for (const w of o.want) need[w.t] = (need[w.t] || 0) + w.n;
    const have = {};
    for (const c of given) have[c.t] = (have[c.t] || 0) + 1;
    const keys = new Set([...Object.keys(need), ...Object.keys(have)]);
    for (const k of keys) if ((need[k] || 0) !== (have[k] || 0)) throw new Error(`They asked for ${o.want.map((w) => `${w.n} ${this.starName(w.t)}`).join(', ') || 'nothing'}.`);
    // do it: every star traded must be planted by its new owner
    this.removeCards(owner, offered);
    this.removeCards(p, given);
    owner.tray.push(...given);
    p.tray.push(...offered);
    owner.stats.trades += 1;
    p.stats.trades += 1;
    if (!given.length) owner.stats.gifts += 1; // the offerer gave something for nothing
    else if (!offered.length) p.stats.gifts += 1; // the other side did
    this.say(`${owner.name} and ${p.name} trade${!offered.length || !given.length ? ' (a gift)' : ''}.`, { k: 'trade', from: owner.id, to: p.id, gave: offered.map((c) => c.t), got: given.map((c) => c.t) });
    t.offers = t.offers.filter((x) => x.id !== o.id && x.give.every((uid) => this.findTradable(this.get(x.from), uid)));
  }

  doneTrading(p) {
    const t = this.turn;
    if (t.phase !== 'trade' || t.pid !== p.id) throw new Error('Only the player whose turn it is can end the trading.');
    this.beginTray();
  }

  // ---------------------------------------------------------------------------
  // Robots, and people who have gone quiet
  // ---------------------------------------------------------------------------
  runAuto() {
    if (this.phase !== 'playing' || this.stopped || !this.turn) return;
    for (const p of this.players) {
      if (!this.isAuto(p) || this.autoTimers.has(p.id)) continue;
      const a = autoStep(this, p);
      if (!a) continue;
      const humans = this.players.some((x) => !this.isAuto(x));
      // ending the trading always comes a moment after everyone else's answers, so a robot's offer can be taken first
      const delay = (a.delay ?? 900) * (humans ? 1 : 0.4) * this.pace * (0.6 + this.r() * 0.8) + (a.type === 'doneTrading' ? 25 : 0);
      const version = this.version;
      const timer = setTimeout(() => {
        this.autoTimers.delete(p.id);
        if (this.stopped || this.phase !== 'playing') return;
        // the state may have moved on: decide again, then do it
        const now = this.version === version ? a : autoStep(this, p);
        if (now) this.perform(p, now);
        this.runAuto();
      }, delay);
      timer.unref?.();
      this.autoTimers.set(p.id, timer);
    }
  }

  // ---------------------------------------------------------------------------
  // The end
  // ---------------------------------------------------------------------------
  finishGame() {
    clearTimeout(this.timer);
    for (const p of this.players) {
      for (let i = 0; i < p.fields.length; i++) if (p.fields[i].cards.length) this.harvest(p, i, { force: true });
    }
    const n = this.players.length;
    const first = this.turnIndex;
    const seatFromStart = (p) => (this.players.indexOf(p) - first - 1 + n * 2) % n; // how far past the player who just went
    const ranked = [...this.players].sort((a, b) => b.stash.length - a.stash.length || b.hand.length - a.hand.length || seatFromStart(b) - seatFromStart(a));
    this.standings = ranked.map((p, i) => ({ pid: p.id, coins: p.stash.length, hand: p.hand.length, rank: i + 1 }));
    const top = ranked[0];
    this.winner = top?.id || null;
    if (top) top.wins += 1;
    this.phase = 'ended';
    this.turn = null;
    this.clearTimers();
    this.say(top ? `🏆 ${top.name} wins with ${top.stash.length} lumens!` : 'The game is over.', { k: 'win', pid: top?.id });
  }

  // ---------------------------------------------------------------------------
  // What each person sees
  // ---------------------------------------------------------------------------
  publicPlayer(p) {
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isBot: p.isBot,
      connected: p.connected,
      afk: p.afk,
      wins: p.wins,
      handCount: p.hand.length,
      coins: p.stash.length,
      fields: p.fields.map((f) => ({ type: f.type, n: f.cards.length })),
      tray: p.tray.map((c) => ({ uid: c.uid, t: c.t })),
      stats: p.stats,
    };
  }

  offerView(o) {
    const owner = this.get(o.from);
    return {
      id: o.id,
      from: o.from,
      to: o.to,
      give: o.give.map((uid) => this.findTradable(owner, uid)).filter(Boolean).map((c) => ({ uid: c.uid, t: c.t })),
      want: o.want,
      at: o.at,
    };
  }

  // what you should be doing right now (so the screen can tell you)
  todo(me) {
    const t = this.turn;
    if (!me || !t || this.phase !== 'playing') return null;
    const mine = t.pid === me.id;
    if (t.phase === 'plant') return mine ? { kind: 'plant', must: t.planted < 1, card: me.hand[0]?.t || null, second: t.planted === 1 } : { kind: 'wait', on: t.pid };
    if (t.phase === 'trade') return mine ? { kind: 'trade-active' } : { kind: 'trade-other', on: t.pid };
    if (t.phase === 'tray') return me.tray.length ? { kind: 'tray', n: me.tray.length } : { kind: 'wait', on: this.players.filter((p) => p.tray.length).map((p) => p.id) };
    return null;
  }

  viewFor(id) {
    const me = this.get(id);
    const t = this.turn;
    return {
      code: this.code,
      phase: this.phase,
      version: this.version,
      hostId: this.hostId,
      settings: this.settings,
      practice: this.practice,
      setIds: this.setIds,
      deckCount: this.deck.length,
      discardCount: this.discard.length,
      deckOuts: this.deckOuts,
      passes: this.settings.passes,
      endPending: this.endPending,
      turnCount: this.turnCount,
      turn: t
        ? {
            pid: t.pid,
            n: t.n,
            phase: t.phase,
            planted: t.planted,
            faceUp: t.faceUp.map((c) => ({ uid: c.uid, t: c.t })),
            offers: t.offers.map((o) => this.offerView(o)),
            deadline: t.deadline,
          }
        : null,
      players: this.players.map((p) => this.publicPlayer(p)),
      spectators: this.spectators.length,
      log: this.log.slice(-70),
      chat: this.chat.slice(-40),
      winner: this.winner,
      standings: this.standings,
      you: {
        id,
        isSpectator: !me,
        hand: me ? me.hand.map((c) => ({ uid: c.uid, t: c.t })) : [],
        todo: this.todo(me),
        harvestable: me ? me.fields.map((f, i) => ({ ok: this.canHarvest(me, i), lumens: f.cards.length ? payout(f.type, f.cards.length) : 0, next: f.cards.length ? nextPayout(f.type, f.cards.length) : null })) : [],
        canBuyField: !!me && me.fields.length < 3 && me.stash.length >= FIELD_PRICE,
      },
    };
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

module.exports = { BonanzaGame, MAX_PLAYERS, MIN_PLAYERS, EMOTES, STARS, payout };

// Star Charters: the rules.
//
// A turn is one move: the captain whose turn it is takes the next sector tile, puts it next to the map so every edge
// matches, and may send one probe (or the dreadnought) onto a piece of that tile, as long as nobody is on that
// feature yet. Or, instead of a probe, they can burn a thruster fuel to call one of their probes home. Then
// anything finished is scored: the captain with the most strength on it gets the points and the probes come back.
//
// The twists: wormhole twins join whatever runs into them, however far apart they are; a black hole lets a tile
// placed next to it slingshot a probe onto any open feature round the hole; and anomalies wait out in the unknown
// for the first tile to land on them.
//
// People act with act(); robots, and people who have gone quiet, are driven by bots.js through the same call. The
// server checks everything, and each person only ever sees viewFor(id).

const { TILES, START_TILE } = require('./tiles');
const { Board, featureValue, winnersOf } = require('./board');
const { MIN_PLAYERS, MAX_PLAYERS, PROBES, START_FUEL, MAX_FUEL, COLOURS, AVATARS, BOT_AVATARS, EMOTES, LENGTHS, SPEEDS, ANOMALIES } = require('./data');
const { chooseMove } = require('./bots');

const LOG_KEEP = 140;
const TURN_MS = 60_000; // before a robot takes over (scaled by the speed setting)
const SPEED = { chill: 1.8, normal: 1, quick: 0.55 };
const NAMES = ['Robbie', 'Captain Bolt', 'Sputnik', 'Unit Nine', 'Zappo', 'Astro', 'Rivet', 'Nova', 'Beeper', 'Major Tom-Tom'];
const KIND_NAME = { L: 'warp lane', S: 'station', A: 'array', H: 'black hole', V: 'void' };

function cleanName(name) {
  return String(name || '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 18);
}

class ChartersGame {
  constructor(code, { rng = Math.random, pace = 1 } = {}) {
    this.code = code;
    this.rng = rng;
    this.pace = pace; // 1 = normal; 0 = robots move at once (tests)
    this.version = 0;
    this.phase = 'lobby'; // lobby | playing | ended
    this.players = [];
    this.spectators = [];
    this.hostId = null;
    this.board = new Board();
    this.bag = [];
    this.anomalies = [];
    this.turn = null;
    this.turnIndex = 0;
    this.turnCount = 0;
    this.log = [];
    this.seq = 0;
    this.chat = [];
    this.settings = { length: 'sprint', speed: 'normal', voids: true };
    this.standings = null;
    this.winner = null;
    this.onChange = () => {};
    this.nameCount = 0;
    this.practice = false;
    this.stopped = false;
    this.timer = null;
    this.botTimer = null;
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
  }
  name(id) {
    return this.get(id)?.name || 'Someone';
  }

  // ---------------------------------------------------------------------------
  // The lobby
  // ---------------------------------------------------------------------------
  addPlayer(name, { isBot = false } = {}) {
    if (this.phase !== 'lobby') throw new Error('The game has already started.');
    if (this.players.length >= MAX_PLAYERS) throw new Error(`The table is full (${MAX_PLAYERS} captains).`);
    const taken = new Set(this.players.map((p) => p.avatar));
    const pool = isBot ? BOT_AVATARS : AVATARS;
    const p = {
      id: `p${++this.nameCount}${Math.floor(this.r() * 1e6).toString(36)}`,
      token: Math.floor(this.r() * 1e12).toString(36) + Date.now().toString(36),
      name: cleanName(name) || (isBot ? this.botName() : `Captain ${this.players.length + 1}`),
      isBot,
      connected: !isBot,
      afk: false,
      avatar: pool.find((a) => !taken.has(a)) || pool[0],
      colour: null,
      wins: 0,
    };
    this.resetPlayer(p);
    this.players.push(p);
    this.recolour();
    if (!this.hostId && !isBot) this.hostId = p.id;
    this.changed();
    return p;
  }

  resetPlayer(p) {
    p.score = 0;
    p.probes = PROBES;
    p.dread = 1;
    p.fuel = START_FUEL;
    p.afk = false;
    p.stats = { tiles: 0, sealed: 0, bestStation: 0, bestLane: 0, arrays: 0, anomalies: 0, recalls: 0, steals: 0, voids: 0 };
  }

  // everyone gets a different colour, in seat order
  recolour() {
    this.players.forEach((p, i) => (p.colour = COLOURS[i % COLOURS.length].id));
  }

  addSpectator(name) {
    const s = { id: `s${++this.nameCount}${Math.floor(this.r() * 1e6).toString(36)}`, token: Math.floor(this.r() * 1e12).toString(36), name: cleanName(name) || 'Watcher', connected: true };
    this.spectators.push(s);
    this.changed();
    return s;
  }

  botName() {
    const used = new Set(this.players.map((p) => p.name));
    return NAMES.find((n) => !used.has(n)) || `Robot ${this.players.length + 1}`;
  }

  addBot(byId) {
    this.requireHost(byId);
    return this.addPlayer(this.botName(), { isBot: true });
  }

  removePlayer(id) {
    if (this.phase === 'lobby') {
      this.players = this.players.filter((p) => p.id !== id);
      this.recolour();
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
      this.say(`${p.name} is back at the controls.`, { k: 'afk', pid: id });
      this.changed();
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
    if (s.length != null) {
      if (!LENGTHS.some((l) => l.id === s.length)) throw new Error('Unknown game length.');
      this.settings.length = s.length;
    }
    if (s.voids != null) this.settings.voids = !!s.voids;
    this.changed();
  }

  start(byId) {
    this.requireHost(byId);
    if (this.phase !== 'lobby') throw new Error('Already started.');
    if (this.players.length < MIN_PLAYERS) throw new Error(`You need at least ${MIN_PLAYERS} captains (add a robot!).`);
    this.setup();
  }

  setup() {
    this.board = new Board();
    this.bag = [];
    const sprint = this.settings.length === 'sprint';
    for (const t of Object.values(TILES)) for (let i = 0; i < (sprint ? t.sprint : t.count); i++) this.bag.push(t.id);
    this.shuffle(this.bag);
    this.board.add(START_TILE, 0, 0, 0, { by: null, n: 0 });
    this.anomalies = [];
    this.log = [];
    this.winner = null;
    this.standings = null;
    this.turnCount = 0;
    this.shuffle(this.players); // who sits where, and who goes first
    this.recolour();
    for (const p of this.players) this.resetPlayer(p);
    this.phase = 'playing';
    for (let i = 0; i < (sprint ? 2 : 3); i++) this.spawnAnomaly();
    this.say(`${this.players.length} captains, ${this.bag.length + 1} sectors to chart. Good hunting!`, { k: 'start' });
    this.startTurn(0);
  }

  // back to the lobby for another game with the same crew
  toLobby(byId) {
    this.requireHost(byId);
    if (this.phase !== 'ended') throw new Error('The game is still going.');
    this.players = this.players.filter((p) => p.isBot || p.connected);
    this.recolour();
    for (const p of this.players) this.resetPlayer(p);
    this.phase = 'lobby';
    this.turn = null;
    this.board = new Board();
    this.bag = [];
    this.anomalies = [];
    this.winner = null;
    this.standings = null;
    this.log = [];
    this.clearTimers();
    this.changed();
  }

  clearTimers() {
    clearTimeout(this.timer);
    clearTimeout(this.botTimer);
    this.timer = null;
    this.botTimer = null;
  }

  destroy() {
    this.stopped = true;
    this.clearTimers();
  }

  later(ms, fn) {
    const t = ms * this.pace;
    if (t <= 0) return Promise.resolve().then(() => !this.stopped && fn());
    const timer = setTimeout(() => !this.stopped && fn(), t);
    timer.unref?.();
    return timer;
  }

  // ---------------------------------------------------------------------------
  // Anomalies: glowing markers a couple of squares out from the edge of the map
  // ---------------------------------------------------------------------------
  spawnAnomaly() {
    const near = new Map();
    for (const p of this.board.tiles)
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const x = p.x + dx;
          const y = p.y + dy;
          near.set(`${x},${y}`, [x, y]);
        }
    const spots = [...near.values()].filter(([x, y]) => {
      if (this.board.get(x, y) || this.anomalies.some((a) => a.x === x && a.y === y)) return false;
      // not right next to the map (that would be too easy), but two squares out
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.board.get(x + dx, y + dy)) return false;
      return true;
    });
    if (!spots.length) return null;
    const [x, y] = spots[Math.floor(this.r() * spots.length)];
    const kinds = Object.keys(ANOMALIES);
    const a = { x, y, kind: kinds[Math.floor(this.r() * kinds.length)] };
    this.anomalies.push(a);
    return a;
  }

  // ---------------------------------------------------------------------------
  // The turn
  // ---------------------------------------------------------------------------
  startTurn(index, { extra = false } = {}) {
    if (this.stopped || this.phase !== 'playing') return;
    this.turnIndex = index % this.players.length;
    const p = this.players[this.turnIndex];
    // draw a tile that fits somewhere (one that fits nowhere goes back in the box)
    let tile = null;
    let options = null;
    while (this.bag.length) {
      const t = this.bag.pop();
      options = this.optionsFor(t, p);
      if (options.length) {
        tile = t;
        break;
      }
      this.say(`A ${TILES[t].name} fits nowhere, so it is put back in the box.`, { k: 'skip', t });
    }
    if (!tile) return this.finishGame();
    this.turn = { pid: p.id, n: ++this.turnCount, tile, options, deadline: Date.now() + this.turnMs(), extra };
    if (!extra) this.say(`${p.name}'s turn`, { k: 'turn', pid: p.id, t: tile });
    else this.say(`Warp boost! ${p.name} goes again.`, { k: 'extra', pid: p.id, t: tile });
    clearTimeout(this.timer);
    const n = this.turn.n;
    this.timer = setTimeout(() => this.onDeadline(n), this.turnMs());
    this.timer.unref?.();
    this.changed();
    this.runAuto();
  }

  turnMs() {
    return Math.round(TURN_MS * (SPEED[this.settings.speed] || 1));
  }

  // somebody has gone quiet: a robot plays the turn for them
  onDeadline(n) {
    if (this.stopped || this.phase !== 'playing' || !this.turn || this.turn.n !== n) return;
    const p = this.active;
    if (!p.isBot && !p.afk) {
      p.afk = true;
      this.say(`💤 ${p.name} dozed off, so a robot is flying for them.`, { k: 'afk', pid: p.id });
    }
    this.perform(p, chooseMove(this, p));
  }

  // every way the tile can go, and for each one: where a probe can be sent, and what it would finish
  optionsFor(t, p) {
    const board = this.board;
    const out = [];
    const holes = board.tiles.filter((q) => q.t === 'hole');
    for (const { x, y, r } of board.placements(t)) {
      const placed = board.add(t, x, y, r, { by: p.id });
      const A = board.analyze();
      const i = A.index.get(placed);
      const targets = [];
      const seen = new Set();
      TILES[t].shapes[r].segs.forEach((seg, j) => {
        const f = A.featOf(i, j);
        if (f.units.length || seen.has(f.id) || (f.k === 'V' && !this.settings.voids)) return;
        seen.add(f.id);
        targets.push({ x, y, seg: j, k: f.k, done: f.done, pts: f.done ? featureValue(f) : 0, size: f.tiles.size });
      });
      // a black hole's gravity: slingshot a probe onto any open feature on the tiles round it
      const wells = [...holes, ...(t === 'hole' ? [placed] : [])].filter((h) => Math.abs(h.x - x) <= 1 && Math.abs(h.y - y) <= 1);
      for (const h of wells)
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const q = board.get(h.x + dx, h.y + dy);
            if (!q || q === placed) continue;
            const qi = A.index.get(q);
            TILES[q.t].shapes[q.r].segs.forEach((seg, j) => {
              const f = A.featOf(qi, j);
              if (f.k === 'V' || f.done || f.units.length || seen.has(f.id)) return;
              seen.add(f.id);
              targets.push({ x: q.x, y: q.y, seg: j, k: f.k, done: false, pts: 0, size: f.tiles.size, assist: true });
            });
          }
      // what placing it finishes (for probes already out there)
      const completes = A.features.filter((f) => f.done && f.units.length && f.tiles.has(i)).map((f) => ({ k: f.k, pts: featureValue(f), pids: winnersOf(f).winners }));
      // (arrays next to it are finished by it too, though they are not "on" it)
      for (const f of A.features) if ((f.k === 'A' || f.k === 'H') && f.done && f.units.length && !f.tiles.has(i)) completes.push({ k: f.k, pts: 9, pids: winnersOf(f).winners });
      board.pop();
      out.push({ x, y, r, targets, completes, anomaly: this.anomalies.find((a) => a.x === x && a.y === y)?.kind || null });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // What people can do
  // ---------------------------------------------------------------------------
  act(pid, a) {
    const p = this.get(pid);
    if (!p) throw new Error('You are watching this game.');
    if (this.phase !== 'playing') throw new Error('The game is not running.');
    if (!a || typeof a !== 'object') throw new Error('Bad action.');
    p.afk = false;
    if (a.type !== 'place') throw new Error('Unknown action.');
    this.place(p, a);
  }

  // the same, for robots: true if it worked
  perform(p, a) {
    try {
      this.place(p, a);
      return true;
    } catch (err) {
      // a robot's move should always be fine; if not, play the first spot with no probe so the game goes on
      try {
        const o = this.turn?.options[0];
        if (o && this.turn.pid === p.id) this.place(p, { x: o.x, y: o.y, r: o.r });
      } catch {}
      return false;
    }
  }

  // the move: { x, y, r, deploy: { x, y, seg, dread } | null, recall: { x, y, seg } | null }
  place(p, a) {
    const t = this.turn;
    if (!t || t.pid !== p.id) throw new Error('It is not your turn.');
    const x = Math.round(Number(a.x));
    const y = Math.round(Number(a.y));
    const r = ((Math.round(Number(a.r)) % 4) + 4) % 4;
    const opt = t.options.find((o) => o.x === x && o.y === y && TILES[t.tile].shapes[o.r].rows.join('') === TILES[t.tile].shapes[r].rows.join(''));
    if (!opt) throw new Error('That tile does not fit there.');
    let deploy = null;
    if (a.deploy) {
      const d = a.deploy;
      deploy = opt.targets.find((g) => g.x === Number(d.x) && g.y === Number(d.y) && g.seg === Number(d.seg));
      if (!deploy) throw new Error('You cannot send a probe there.');
      if (d.dread ? p.dread < 1 : p.probes < 1) throw new Error(d.dread ? 'Your dreadnought is already out.' : 'You have no probes left.');
      deploy = { ...deploy, dread: !!d.dread };
    }
    let recall = null;
    if (a.recall && !deploy) {
      if (p.fuel < 1) throw new Error('You are out of thruster fuel.');
      const q = this.board.get(Number(a.recall.x), Number(a.recall.y));
      const u = q?.units.find((u) => u.seg === Number(a.recall.seg) && u.pid === p.id);
      if (!u) throw new Error('You have no probe there.');
      recall = { q, u };
    }

    // ----- the tile
    const placed = this.board.add(t.tile, x, y, opt.r, { by: p.id, n: t.n });
    p.stats.tiles += 1;
    const turnText = `${p.name} charts a ${TILES[t.tile].name}`;
    this.say(turnText, { k: 'place', pid: p.id, x, y, t: t.tile, r: opt.r });
    const link = this.board.links().find((l) => l.a === placed || l.b === placed);
    if (link) this.say(`🌀 The wormholes open! Everything joined to one is now joined to the other.`, { k: 'link', pid: p.id, t: link.t, a: [link.a.x, link.a.y], b: [link.b.x, link.b.y] });

    // ----- a probe goes out, or one comes home
    if (deploy) {
      const q = this.board.get(deploy.x, deploy.y);
      q.units.push({ seg: deploy.seg, pid: p.id, dread: deploy.dread });
      if (deploy.dread) p.dread -= 1;
      else p.probes -= 1;
      this.say(`${p.name} sends ${deploy.dread ? 'the dreadnought' : 'a probe'} to ${deploy.k === 'V' ? 'trawl the void' : `the ${KIND_NAME[deploy.k]}`}${deploy.assist ? ', slingshotting round the black hole' : ''}.`, { k: 'deploy', pid: p.id, x: deploy.x, y: deploy.y, seg: deploy.seg, dread: deploy.dread, assist: !!deploy.assist, fk: deploy.k });
    } else if (recall) {
      recall.q.units.splice(recall.q.units.indexOf(recall.u), 1);
      if (recall.u.dread) p.dread += 1;
      else p.probes += 1;
      p.fuel -= 1;
      p.stats.recalls += 1;
      this.say(`🔥 ${p.name} burns thruster fuel and calls a probe home.`, { k: 'recall', pid: p.id, x: recall.q.x, y: recall.q.y, seg: recall.u.seg, dread: recall.u.dread });
    }

    // ----- anything finished is scored
    this.scoreFinished();

    // ----- an anomaly under the tile
    let boost = false;
    const ai = this.anomalies.findIndex((an) => an.x === x && an.y === y);
    if (ai >= 0) {
      const an = this.anomalies.splice(ai, 1)[0];
      p.stats.anomalies += 1;
      if (an.kind === 'fuel') p.fuel = Math.min(MAX_FUEL, p.fuel + 1);
      if (an.kind === 'cache') p.score += 3;
      if (an.kind === 'boost') boost = this.bag.length > 0;
      this.say(`${ANOMALIES[an.kind].icon} ${p.name} finds a ${ANOMALIES[an.kind].name}: ${ANOMALIES[an.kind].text.toLowerCase()}!`, { k: 'anomaly', pid: p.id, x, y, kind: an.kind });
      if (this.bag.length > 3) this.spawnAnomaly();
    }

    clearTimeout(this.timer);
    this.turn = { ...t, options: [], done: true };
    this.changed();
    if (!this.bag.length) return this.later(900, () => this.finishGame());
    this.later(boost ? 1100 : 700, () => this.startTurn(boost ? this.turnIndex : this.turnIndex + 1, { extra: boost }));
  }

  // scores every finished feature that has probes on it (only the newly finished ones can), and sends them home
  scoreFinished() {
    const A = this.board.analyze();
    for (const f of A.features) {
      if (!f.done || !f.units.length) continue;
      this.award(f, A, false);
    }
  }

  award(f, A, final) {
    const pts = featureValue(f, final);
    const { winners, power } = winnersOf(f);
    for (const pid of winners) {
      const w = this.get(pid);
      if (!w) continue;
      w.score += pts;
      if (!final) w.stats.sealed += 1;
      if (f.k === 'S') w.stats.bestStation = Math.max(w.stats.bestStation, f.tiles.size);
      if (f.k === 'L') w.stats.bestLane = Math.max(w.stats.bestLane, f.tiles.size);
      if ((f.k === 'A' || f.k === 'H') && f.done) w.stats.arrays += 1;
      if (f.k === 'V') w.stats.voids += pts;
      // a steal: winning a feature someone else got to first
      if (Object.keys(power).length > 1 && winners.length === 1) w.stats.steals += 1;
    }
    const tiles = [...f.tiles].map((i) => [A.tiles[i].x, A.tiles[i].y]);
    const units = f.units.map((u) => ({ x: u.x, y: u.y, seg: u.seg, pid: u.pid, dread: u.dread }));
    const names = winners.map((id) => this.name(id));
    const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '';
    const what = f.k === 'V' ? 'trawling the void' : final ? `an unfinished ${KIND_NAME[f.k]}` : f.k === 'S' ? 'sealing a station' : f.k === 'L' ? 'finishing a warp lane' : f.k === 'H' ? 'circling the black hole' : 'calibrating an array';
    this.say(pts ? `${who} ${winners.length > 1 ? 'share' : 'scores'} ${pts} for ${what}.` : `${who}: nothing for ${what}.`, { k: final ? 'final' : 'score', fk: f.k, pts, pids: winners, tiles, units, size: f.tiles.size });
    // the probes come home (trawlers stay out until the very end)
    if (!final) {
      for (const u of f.units) {
        const q = this.board.get(u.x, u.y);
        const i = q.units.findIndex((v) => v.seg === u.seg && v.pid === u.pid);
        if (i >= 0) q.units.splice(i, 1);
        const owner = this.get(u.pid);
        if (owner) {
          if (u.dread) owner.dread += 1;
          else owner.probes += 1;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Robots, and people who have gone quiet
  // ---------------------------------------------------------------------------
  runAuto() {
    if (this.phase !== 'playing' || this.stopped || !this.turn || this.turn.done) return;
    const p = this.active;
    if (!p || !this.isAuto(p)) return;
    clearTimeout(this.botTimer);
    const humans = this.players.some((x) => !this.isAuto(x));
    const n = this.turn.n;
    const delay = (humans ? 1700 : 800) * this.pace * (0.7 + this.r() * 0.6);
    const go = () => {
      if (this.stopped || this.phase !== 'playing' || !this.turn || this.turn.n !== n || this.turn.done) return;
      this.perform(p, chooseMove(this, p));
    };
    if (delay <= 0) return Promise.resolve().then(go);
    this.botTimer = setTimeout(go, delay);
    this.botTimer.unref?.();
  }

  // ---------------------------------------------------------------------------
  // The end
  // ---------------------------------------------------------------------------
  finishGame() {
    if (this.phase !== 'playing') return;
    clearTimeout(this.timer);
    this.turn = null;
    this.say('The last sector is charted! Counting up the unfinished business…', { k: 'last' });
    // unfinished lanes, stations and arrays, then the void
    const A = this.board.analyze();
    const order = { L: 0, S: 1, A: 2, H: 2, V: 3 };
    const left = A.features.filter((f) => f.units.length).sort((a, b) => order[a.k] - order[b.k]);
    for (const f of left) this.award(f, A, true);
    const n = this.players.length;
    const ranked = [...this.players].sort((a, b) => b.score - a.score || b.stats.sealed - a.stats.sealed);
    this.standings = ranked.map((p, i) => ({ pid: p.id, score: p.score, rank: i + 1 }));
    const top = ranked[0];
    this.winner = top?.id || null;
    if (top) top.wins += 1;
    this.phase = 'ended';
    this.clearTimers();
    this.say(top ? `🏆 ${top.name} wins with ${top.score} points!` : 'The game is over.', { k: 'win', pid: top?.id, n });
    this.changed();
  }

  // ---------------------------------------------------------------------------
  // What each person sees
  // ---------------------------------------------------------------------------
  publicPlayer(p) {
    return { id: p.id, name: p.name, avatar: p.avatar, colour: p.colour, isBot: p.isBot, connected: p.connected, afk: p.afk, wins: p.wins, score: p.score, probes: p.probes, dread: p.dread, fuel: p.fuel, stats: p.stats };
  }

  // the board, and what every feature on it is worth right now (for the live read-outs)
  boardView() {
    const A = this.board.analyze();
    const fid = new Map(A.features.map((f, i) => [f, i]));
    return {
      tiles: this.board.tiles.map((p, i) => ({ x: p.x, y: p.y, t: p.t, r: p.r, by: p.by || null, n: p.n || 0, f: TILES[p.t].shapes[p.r].segs.map((_, j) => fid.get(A.featOf(i, j))), u: p.units.map((u) => ({ seg: u.seg, pid: u.pid, dread: u.dread })) })),
      features: A.features.map((f) => {
        const { power } = winnersOf(f);
        return { k: f.k, n: f.tiles.size, cores: f.cores, open: f.open, done: f.done, now: featureValue(f), full: f.k === 'S' ? 2 * (f.tiles.size + f.cores) : f.k === 'A' || f.k === 'H' ? 9 : f.k === 'L' ? f.tiles.size : featureValue(f), power, stations: f.k === 'V' ? f.touch.size : 0, stationsDone: f.stationsDone };
      }),
      links: this.board.links().map((l) => ({ t: l.t, a: [l.a.x, l.a.y], b: [l.b.x, l.b.y] })),
    };
  }

  viewFor(id) {
    const me = this.get(id);
    const t = this.turn;
    const mine = !!(me && t && t.pid === me.id && !t.done && this.phase === 'playing');
    return {
      code: this.code,
      phase: this.phase,
      version: this.version,
      hostId: this.hostId,
      settings: this.settings,
      practice: this.practice,
      bagCount: this.bag.length,
      queue: this.bag.slice(-2).reverse(),
      turnCount: this.turnCount,
      turn: t ? { pid: t.pid, n: t.n, tile: t.tile, deadline: t.deadline, extra: t.extra, done: !!t.done } : null,
      board: this.phase === 'lobby' ? null : this.boardView(),
      anomalies: this.anomalies,
      players: this.players.map((p) => this.publicPlayer(p)),
      spectators: this.spectators.length,
      log: this.log.slice(-80),
      chat: this.chat.slice(-40),
      winner: this.winner,
      standings: this.standings,
      you: {
        id,
        isSpectator: !me,
        options: mine ? t.options.map((o) => ({ x: o.x, y: o.y, r: o.r, targets: o.targets, completes: o.completes, anomaly: o.anomaly })) : null,
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

module.exports = { ChartersGame, MIN_PLAYERS, MAX_PLAYERS, EMOTES };

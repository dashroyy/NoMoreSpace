// The 3D world: scene, camera, players moving around the ship.
import * as THREE from 'three';
import { Avatar, makeTextSprite, disposeTree } from './avatar.js';
import { buildShip } from './ship.js';
import { SpaceCanvases, buildBackdrop } from './sky.js';
import { Flyby } from './flyby.js';
import { Hallucinations } from './hallucinate.js';
import { PartyFx } from './party-fx.js';
import { ArrayBeacon } from './array-beacon.js';
import { PostFx } from './postfx.js';
import { Dust } from './dust.js';
import { buildAmbience } from './ambience.js';
import { Soundscape } from './soundscape.js';
import { CarnivalDecor } from './carnival.js';
import { CarnivalRooms } from './carnival-rooms.js';
import { CarnivalExterior } from './carnival-exterior.js';
import { OutbreakRooms } from './outbreak-rooms.js';
import { OutbreakExterior } from './outbreak-exterior.js';
import { TraitorsRooms } from './traitors-rooms.js';
import { ClassicRooms } from './classic-rooms.js';
import { ClassicExterior } from './classic-exterior.js';
import { preloadCharacters, CITADEL_ROLES } from './models.js';
import { TraitorsExterior } from './traitors-exterior.js';
import { DoomFx } from './doomfx.js';
import { moveWithCollision, roomAt, roomById, walkable, seatPosition, TASK_STATIONS, SPAWN, DRAWING_SLOTS } from './layout.js';

const SEATED = ['dawn', 'meeting', 'nominations', 'lastwords', 'dusk'];
// Each new part of the day opens with a camera move, like a cut in a film: the camera starts swung round (angle,
// radians) and higher up (lift), and glides into place over a few seconds.
const SWEEPS = {
  dawn: { angle: -0.8, lift: 16, dur: 3.2 },
  roam: { angle: 0, lift: 9, dur: 2 },
  meeting: { angle: 1.0, lift: 7, dur: 2.8 },
  nominations: { angle: -0.45, lift: 4, dur: 2.2 },
  lastwords: { angle: 0.35, lift: -4, dur: 2.2 },
  dusk: { angle: 0.7, lift: 6, dur: 2.6 },
};
const UP = new THREE.Vector3(0, 1, 0);
export const CAMERA_ZOOM = { close: 0.72, normal: 1, far: 1.3 };
// The ship's lighting mood for each phase: a colour to tint the room lights toward, and how much.
const MOODS = {
  night: { color: 0x2c3cff, amount: 0.45 },
  dawn: { color: 0xffc890, amount: 0.3 },
  meeting: { color: 0xff2030, amount: 0.12 },
  nominations: { color: 0xff3040, amount: 0.22 },
  lastwords: { color: 0xffc070, amount: 0.3 },
  dusk: { color: 0xff7a3a, amount: 0.4 },
};
const ALARM_SECONDS = 5; // red alert pulse when an emergency meeting is called
const SPEED = 5.5;
export const NEAR_RADIUS = 7; // same as the server: proximity chat distance
const TELEPORT_COOLDOWN = 2.5; // seconds

export class World {
  constructor(container, data, { onSendPos, onNearTask, onStep, onDuckBump, onBlocked } = {}) {
    this.data = data;
    this.onDuckBump = onDuckBump;
    this.onBlocked = onBlocked; // you walked into a locked door: (roomId, lock)
    this.onSendPos = onSendPos;
    this.onNearTask = onNearTask;
    this.onStep = onStep;
    // Low graphics mode (?lowfx=1, or remembered): lower resolution and ~20 fps for weak devices.
    let low = new URLSearchParams(location.search).get('lowfx');
    try {
      if (low != null) localStorage.setItem('nms-lowfx', low);
      low = localStorage.getItem('nms-lowfx');
    } catch {}
    this.lowFx = low === '1';
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.lowFx, powerPreference: 'high-performance' });
    // Adaptive resolution: drop the pixel ratio when frames get slow, raise it again when there is headroom.
    this.maxRatio = this.lowFx ? 0.6 : Math.min(window.devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2);
    this.minRatio = this.lowFx ? 0.6 : Math.max(0.6, this.maxRatio * 0.5);
    this.ratio = this.maxRatio;
    this.perf = { frames: 0, time: 0, calmWindows: 0 };
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020208);
    this.scene.fog = new THREE.Fog(0x05060f, 40, 120);
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1500);
    // bloom, colour grading and a little film grain (skipped with low graphics)
    this.post = new PostFx(this.renderer, this.scene, this.camera, { lowFx: this.lowFx });
    this.post.setSize(window.innerWidth, window.innerHeight, this.ratio);
    this.camera.position.set(0, 30, 30);
    this.camTarget = new THREE.Vector3();
    this.camPos = new THREE.Vector3(0, 30, 30);
    this._want = new THREE.Vector3(); // scratch vectors (no per-frame allocations)
    this._offset = new THREE.Vector3();
    // camera options (Settings): default zoom and whether the screen shakes
    let zoomPref = 'normal';
    try {
      zoomPref = localStorage.getItem('nms-zoom') || 'normal';
      this.noShake = localStorage.getItem('nms-shake') === 'off';
    } catch {}
    this.zoom = CAMERA_ZOOM[zoomPref] || 1;

    this.hemi = new THREE.HemisphereLight(0x9aa8ff, 0x2a1830, 1.6);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0x404a70, 0.6);
    this.scene.add(this.ambient);
    const moon = new THREE.DirectionalLight(0xb8c4ff, 0.7);
    moon.position.set(-20, 40, 20);
    this.scene.add(moon);

    this.space = new SpaceCanvases();
    this.backdrop = buildBackdrop(this.scene, { lowFx: this.lowFx });
    this.backdrop.group.traverse((o) => o.material && (o.material.fog = false));
    this.ship = buildShip(this.scene, this.space);
    // the rooms' little moving details, and their sounds (louder the closer you are)
    this.ambience = buildAmbience(this.ship.group, { lowFx: this.lowFx });
    this.carnival = new CarnivalDecor(this.scene, { lowFx: this.lowFx }); // the circus ring (only shown for the Cosmic Carnival script)
    this.carnivalRooms = new CarnivalRooms(this.ship.group, { lowFx: this.lowFx }); // circus dressing for every room (same)
    this.carnivalExterior = new CarnivalExterior(this.ship.group, { lowFx: this.lowFx }); // the fairground outside (same)
    this.outbreakRooms = new OutbreakRooms(this.ship.group, { lowFx: this.lowFx }); // the lab gone wrong: dressing for every room (Outbreak script only)
    this.outbreakExterior = new OutbreakExterior(this.ship.group, { lowFx: this.lowFx }); // the research complex outside (same)
    this.classicRooms = new ClassicRooms(this.ship.group); // real models in the station's rooms (Black Hole Blues only)
    this.classicRooms.setActive(true); // the station is the default: fetch its models right away
    this.classicExterior = new ClassicExterior(this.ship.group, { lowFx: this.lowFx }); // docked ships, turrets, patrol craft and drifting rocks (same)
    this.classicExterior.setActive(true);
    this.traitorsRooms = new TraitorsRooms(this.ship.group, { lowFx: this.lowFx }); // the castle: dressing for every room (Citadel of Traitors only)
    this.traitorsExterior = new TraitorsExterior(this.ship.group, { lowFx: this.lowFx }); // the crag, towers and drawbridge outside (same)
    this.doomFx = new DoomFx(this); // the disaster outside: underglow, vignette, lightning, laughs and shudders
    this.soundscape = new Soundscape();
    this.ambience.onVent = (x, z) => this.soundscape.oneShot('vent', { x, z }, this.listener());
    this.ambience.onChirp = (x, z) => this.soundscape.oneShot('chirp', { x, z }, this.listener());
    this.backdrop.setProgress(0);
    if (this.lowFx) {
      // per-room coloured lights are the most expensive part on weak GPUs
      for (const light of this.ship.lights) light.visible = false;
      this.ambient.intensity = 1.4;
    }

    this.avatars = new Map();
    this.local = { x: SPAWN.x, z: SPAWN.z, r: Math.PI, moving: false };
    this.keys = new Set();
    this.joy = { x: 0, z: 0 };
    this.phase = 'home';
    this.homeD = 1; // how far out the title camera is (1 = the usual distance); the start screen holds it far away
    this.homeWant = 1;
    this.titleMenu = true; // false on the start screen: the ship stays in the middle until the menu comes up
    this.shiftX = 0; // the title screen slides the ship across, clear of the menu (a fraction of the screen)
    this.shiftY = 0;
    this.myId = null;
    this.spectator = false;
    this.sendTimer = 0;
    this.lastSent = '';
    this.heartbeat = 0;
    this.nearTask = null;
    this.room = 'bridge';
    this.beams = [];
    this.serverNow = () => Date.now(); // main.js swaps in the server clock
    this.teleportReadyAt = 0;
    this.progress = 0;
    this.night = false;
    this.paused = false; // the reveal cinematic takes over rendering
    this.drawingCache = new Map(); // id -> texture
    this.drawingSlots = new Map(); // id -> slot index
    this.doneTasks = new Set();
    this.clock = new THREE.Clock();
    this.fx = new PartyFx(this);
    // the Observation Array's beacon floats over the telescope console
    this.dust = new Dust(this.scene, { lowFx: this.lowFx });
    this.beacon = new ArrayBeacon();
    this.ship.stations.telescope?.group.add(this.beacon.group);
    this.alarmUntil = 0;
    this.moodColor = new THREE.Color();
    this._tint = new THREE.Color();
    for (const light of this.ship.lights) light.userData.color = light.color.clone();
    this.hemiColor = this.hemi.color.clone();

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, textarea, select')) return;
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    this.renderer.domElement.addEventListener('wheel', (e) => {
      this.zoom = Math.max(0.55, Math.min(1.8, this.zoom * (e.deltaY > 0 ? 1.08 : 0.93)));
    }, { passive: true });

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.post.setSize(window.innerWidth, window.innerHeight, this.ratio);
  }

  // ---------------------------------------------------------------------------
  // Players
  // ---------------------------------------------------------------------------

  syncPlayers(state) {
    this.myId = state.you?.id;
    this.spectator = !!(state.you?.isCaptain || state.you?.isSpectator);
    const seen = new Set();
    for (const p of state.players) {
      seen.add(p.id);
      let a = this.avatars.get(p.id);
      if (!a) {
        a = new Avatar({ look: p.cosmetics, name: p.name, suits: this.data.suits, visors: this.data.visors });
        a.addedTo(this.scene);
        // start standing just behind your own chair at the bridge table
        const seat = seatPosition(p.seat, Math.max(state.players.length, 5));
        const start = { x: seat.x * 1.28, z: seat.z * 1.28 };
        if (p.id === this.myId) Object.assign(this.local, start, { r: seat.facing });
        a.root.position.set(start.x, 0, start.z);
        a.target = { x: start.x, z: start.z, r: seat.facing, m: 0 };
        this.avatars.set(p.id, a);
      }
      // the Mimic's disguise: wear someone else's suit and name tag
      const shown = (this.disguise?.[p.id] && state.players.find((x) => x.id === this.disguise[p.id])) || p;
      if (JSON.stringify(a.look) !== JSON.stringify(shown.cosmetics)) a.setLook(shown.cosmetics);
      if (a.pet && !a.pet.parent) this.scene.add(a.pet);
      const labelColor = p.id === this.myId ? '#6cf0ff' : p.alive ? '#ffffff' : '#9aa0b8';
      if (a.name !== shown.name || a.labelColor !== labelColor) {
        a.setName(shown.name, labelColor);
        a.labelColor = labelColor;
      }
      if (!p.alive && !a.ghost && !a.deathState && !a.pendingDeath) a.setGhost(true);
      if (p.alive && a.ghost) {
        // back from the dead (the Magician's trick)
        a.setGhost(false);
        a.deathState = null;
        a.burst(70, null, 4);
      }
      a.seat = p.seat;
    }
    for (const [id, a] of this.avatars) {
      if (!seen.has(id)) {
        a.dispose();
        this.avatars.delete(id);
      }
    }
    this.lastState = state;
    for (const a of this.avatars.values()) if (a.label) a.label.visible = !this.blackout;
    this.playerCount = state.players.length;
    if (this.seatCount !== this.playerCount) {
      this.ship.setSeats(this.playerCount);
      this.seatCount = this.playerCount;
    }
  }

  setPhase(phase, state) {
    const prev = this.phase;
    this.phase = phase;
    if (prev !== phase && prev !== 'home' && SWEEPS[phase] && !matchMedia('(prefers-reduced-motion: reduce)').matches) this.sweep = { ...SWEEPS[phase], t: 0 };
    this.setNight(phase === 'night');
    if (phase === 'meeting' && prev !== 'meeting') this.alarmUntil = this.clock.elapsedTime + ALARM_SECONDS;
    if (SEATED.includes(phase) && !SEATED.includes(prev)) this.seatEveryone();
    if (phase === 'roam' && SEATED.includes(prev)) {
      // stand up next to your chair
      const me = this.avatars.get(this.myId);
      if (me) {
        const seat = seatPosition(me.seat, this.playerCount);
        const out = 1.4;
        this.local.x = seat.x * (1 + out / 5.6);
        this.local.z = seat.z * (1 + out / 5.6);
      }
    }
    if (phase === 'lobby' && prev !== 'lobby') {
      const mine = this.avatars.get(this.myId);
      const seat = seatPosition(mine?.seat ?? 0, Math.max(this.playerCount || 5, 5));
      this.local.x = seat.x * 1.28;
      this.local.z = seat.z * 1.28;
      for (const a of this.avatars.values()) {
        a.setGhost(false);
        a.deathState = null;
        a.clearExtras();
        a.body.visible = true;
      }
    }
    if (state) this.setProgressFromState(state);
  }

  seatEveryone() {
    for (const a of this.avatars.values()) {
      const s = seatPosition(a.seat ?? 0, this.playerCount);
      a.root.position.set(s.x, 0, s.z);
      a.root.rotation.y = s.facing;
      a.target = { x: s.x, z: s.z, r: s.facing, m: 0 };
      if (a === this.avatars.get(this.myId)) Object.assign(this.local, { x: s.x, z: s.z, r: s.facing });
    }
  }

  setNight(on) {
    this.night = on;
    for (const a of this.avatars.values()) a.setVisible(!on);
  }

  canMove() {
    if (this.paused || this.spectator) return false;
    if (!this.avatars.has(this.myId)) return false;
    return this.phase === 'lobby' || this.phase === 'roam';
  }

  // Positions from the server: { id: [x, z, r, moving] }
  // Updates arrive about 10 times a second, so we also estimate each player's
  // velocity and glide them forward between updates instead of stuttering.
  applyPositions(packed) {
    if (SEATED.includes(this.phase) || this.phase === 'night') return;
    const now = performance.now();
    for (const [id, [x, z, r, m]] of Object.entries(packed)) {
      if (id === this.myId) continue;
      const a = this.avatars.get(id);
      if (!a) continue;
      const prev = a.target;
      if (!prev || prev.x !== x || prev.z !== z) {
        const gap = (now - (a.movedAt || 0)) / 1000;
        let vx = 0;
        let vz = 0;
        if (prev && m && gap > 0.03 && gap < 0.5) {
          vx = (x - prev.x) / gap;
          vz = (z - prev.z) / gap;
          const speed = Math.hypot(vx, vz);
          const max = SPEED * 1.3;
          if (speed > max) {
            vx *= max / speed;
            vz *= max / speed;
          }
        }
        a.vel = { x: vx, z: vz };
        a.movedAt = now;
      }
      if (!m) a.vel = { x: 0, z: 0 };
      a.target = { x, z, r, m };
    }
  }

  emote(id, name) {
    this.avatars.get(id)?.emote(name);
  }

  say(id, text) {
    const a = this.avatars.get(id);
    if (a && a.root.visible) a.say(text);
  }

  // Play death animations (dawn and dusk); they turn into ghosts afterwards.
  playDeaths(deaths) {
    for (const { id, anim } of deaths) {
      const a = this.avatars.get(id);
      if (!a) continue;
      a.setGhost(false);
      a.pendingDeath = true;
      // the camera goes to them (not while you are exploring: you keep control of your own walk)
      if (this.phase !== 'roam' && this.phase !== 'lobby' && !this.focus) this.focus = { id, t: 0, dur: 4.6 };
      setTimeout(() => {
        a.die(anim || 'fainted', () => (a.pendingDeath = false));
        this.gaspNear(a.root.position, id);
      }, 1200);
    }
  }

  // A reaction that only plays on this screen (the accuser points, the accused gasps...). Never interrupts a dance.
  react(id, emote) {
    const a = this.avatars.get(id);
    if (!a || !a.root.visible || a.ghost || a.deathState || a.pendingDeath || a.emoteState) return;
    a.emote(emote);
  }

  // Everyone close enough to see somebody go gasps and hops back (a few at a time, not in perfect step).
  gaspNear(pos, exceptId) {
    for (const [id, o] of this.avatars) {
      if (id === exceptId || o.ghost || !o.root.visible || o.pendingDeath || o.deathState || o.emoteState) continue;
      if (o.root.position.distanceTo(pos) > 9) continue;
      setTimeout(() => !o.emoteState && !o.deathState && o.emote('gasp'), Math.random() * 400);
    }
  }

  // ---------------------------------------------------------------------------
  // Black hole, clues, drawings
  // ---------------------------------------------------------------------------

  // How close the black hole is (0 = far away, 1 = swallowing the ship).
  // It creeps closer every night, and lurches closer whenever someone dies.
  setProgressFromState(state) {
    const p = blackHoleProgress(state);
    this.progress = p;
    this.space.progress = p;
    this.backdrop.setProgress(p);
    this.ship.holo.scale.setScalar(1 + p * 0.8);
    this.traitorsRooms.setPot(state.pot);
    for (const light of this.ship.lights) light.userData.base = 40 * (1 - p * 0.35);
  }

  // The Holo-Jester's victim sees things that aren't there (see hallucinate.js).
  setHallucination(fx, phase, onWhisper) {
    this.hallucinations ||= new Hallucinations(this);
    this.hallucinations.onWhisper = onWhisper;
    this.hallucinations.set(fx, phase);
  }

  // Clues are objects drifting past outside the ship for a few seconds (see flyby.js).
  setClue(clue, players, roles) {
    this.flyby ||= new Flyby(this.scene);
    this.flyby.set(clue, {
      colorOf: (id) => {
        const p = players.find((x) => x.id === id);
        return p ? this.data.suits[p.cosmetics.suit] : '#ffffff';
      },
      iconOf: (roleId) => roles[roleId]?.icon || '★',
    });
  }

  // How charged the Observation Array is (the beacon over the telescope shows it).
  setArrayCharge(charge, needed) {
    this.beacon.set(charge || 0, needed || 1);
  }

  setDoneTasks(list) {
    this.doneTasks = new Set(list);
    for (const [taskId, st] of Object.entries(this.ship.stations)) {
      const done = this.doneTasks.has(taskId);
      st.screenMat.emissiveIntensity = done ? 0.2 : 1.4;
      st.ring.visible = !done;
      st.icon.visible = !done;
      st.beam.visible = !done;
    }
  }

  addDrawingImage(id, dataUrl) {
    if (this.drawingCache.has(id)) return;
    const img = new Image();
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      this.drawingCache.set(id, tex);
      this.placeDrawings();
    };
    img.src = dataUrl;
  }

  setDrawings(list) {
    this.drawingList = list;
    this.placeDrawings();
  }

  clearDrawings() {
    this.drawingCache.clear();
    this.drawingList = [];
    this.placeDrawings();
  }

  placeDrawings() {
    const list = this.drawingList || [];
    this.ship.easels.forEach((e) => (e.group.visible = false));
    list.forEach((d, i) => {
      const easel = this.ship.easels[i % DRAWING_SLOTS.length];
      const tex = this.drawingCache.get(d.id);
      if (!tex) return;
      easel.art.material.map = tex;
      easel.art.material.needsUpdate = true;
      easel.group.visible = true;
    });
  }

  // ---------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------

  loop(now) {
    requestAnimationFrame(this.loop);
    if (this.lowFx && now - (this.lastFrame || 0) < 50) return;
    this.lastFrame = now;
    const raw = this.clock.getDelta();
    const dt = Math.min(0.05, raw);
    const t = this.clock.elapsedTime;
    this.adaptResolution(raw);
    if (this.paused) return;
    this.updateLocal(dt);
    this.updateAvatars(dt, t);
    this.updateCamera(dt);
    this.updateAmbience(dt, t);
    this.ship.decor.update(t, { night: this.night, progress: this.progress });
    this.carnival.update(t, dt);
    this.carnivalRooms.update(t, dt);
    this.carnivalExterior.update(t, dt);
    this.classicExterior.update(t, dt);
    this.outbreakRooms.update(t, dt);
    this.outbreakExterior.update(t, dt);
    this.traitorsRooms.update(t, dt);
    this.traitorsExterior.update(t, dt);
    if (this.ambience.root.visible) this.ambience.update(dt, t, { night: this.night, progress: this.progress, alarm: t < this.alarmUntil });
    this.soundscape.update({ ...this.listener(), phase: this.phase, night: this.phase === 'night', progress: this.progress });
    this.ship.exterior.update(t);
    this.updateBeams(dt);
    this.fx.update(dt, t);
    this.beacon.update(dt, t);
    this.dust.update(dt, t, this.camTarget, !['home', 'night'].includes(this.phase));
    this.updateShipEvent(dt, t);
    this.flyby?.update(this.serverNow(), t);
    this.hallucinations?.update(dt, t);
    // the big Observation Deck window (where clues appear) only needs repainting when it can be seen
    this.space.bigVisible = this.phase === 'home' || this.phase === 'night' || this.spectator || this.camTarget.z < -12;
    this.space.update(t);
    this.backdrop.update(t, dt, this.camera);
    this.doomFx.update(t, dt);
    this.post.setGrade(this.gradeFor());
    this.post.update(dt, t);
    this.post.render(this.scene, this.camera);
  }

  // Which colour grade the picture should drift towards (see postfx.js).
  gradeFor() {
    const p = this.phase;
    if (p === 'home') return 'home';
    if (p === 'lobby') return 'lobby';
    if (p === 'night') return 'night';
    if (p === 'ended') return 'ended';
    if (this.progress > 0.72) return 'doom'; // the disaster is nearly upon the ship
    if (p === 'dawn') return 'dawn';
    if (p === 'meeting') return 'meeting';
    if (p === 'nominations' || p === 'lastwords' || p === 'dusk') return 'tense';
    return 'day';
  }

  // Every 2 seconds, compare the frame rate with the target and nudge the resolution.
  adaptResolution(raw) {
    if (this.lowFx || document.hidden || raw > 0.5) return; // capped, hidden, or a hiccup (tab switch)
    const perf = this.perf;
    perf.frames += 1;
    perf.time += raw;
    if (perf.time < 2) return;
    const fps = perf.frames / perf.time;
    perf.frames = 0;
    perf.time = 0;
    let next = this.ratio;
    if (fps < 45 && this.ratio > this.minRatio) {
      next = Math.max(this.minRatio, this.ratio - 0.2);
      perf.calmWindows = 0;
    } else if (fps > 57) {
      // only climb back after a while, so the resolution doesn't bounce up and down
      perf.calmWindows += 1;
      if (perf.calmWindows >= 3 && this.ratio < this.maxRatio) {
        next = Math.min(this.maxRatio, this.ratio + 0.1);
        perf.calmWindows = 0;
      }
    } else {
      perf.calmWindows = 0;
    }
    if (Math.abs(next - this.ratio) > 0.01) {
      this.ratio = next;
      this.renderer.setPixelRatio(next);
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.post.setSize(window.innerWidth, window.innerHeight, next);
    }
  }

  updateLocal(dt) {
    const me = this.avatars.get(this.myId);
    let dx = 0;
    let dz = 0;
    if (this.canMove() || (this.spectator && this.phase !== 'night')) {
      const k = this.keys;
      if (k.has('w') || k.has('arrowup')) dz -= 1;
      if (k.has('s') || k.has('arrowdown')) dz += 1;
      if (k.has('a') || k.has('arrowleft')) dx -= 1;
      if (k.has('d') || k.has('arrowright')) dx += 1;
      dx += this.joy.x;
      dz += this.joy.z;
    }
    const len = Math.hypot(dx, dz);
    if (this.spectator) {
      if (len > 0.01) {
        this.spectatorPos ||= { x: 0, z: 0 };
        this.spectatorPos.x = Math.max(-55, Math.min(55, this.spectatorPos.x + (dx / len) * SPEED * 2.2 * dt));
        this.spectatorPos.z = Math.max(-40, Math.min(52, this.spectatorPos.z + (dz / len) * SPEED * 2.2 * dt));
      }
      return;
    }
    if (!me) return;
    const moving = len > 0.05;
    if (moving) {
      const sp = (SPEED * Math.min(1, len)) / len;
      const [nx, nz] = moveWithCollision(this.local.x, this.local.z, dx * sp * dt, dz * sp * dt);
      // sealed rooms: you can walk out, but not in
      const into = roomAt(nx, nz);
      if (into !== this.room && this.lockedOut(into)) this.bumpLockedDoor(into);
      else [this.local.x, this.local.z] = [nx, nz];
      const want = Math.atan2(dx, dz);
      let diff = want - this.local.r;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.local.r += diff * Math.min(1, dt * 12);
    }
    this.local.moving = moving;
    // bumping into the docking-bay duck (counted for an unlockable)
    const duck = this.fx.duck;
    if (moving && this.phase === 'lobby' && duck?.visible && Math.hypot(duck.position.x - this.local.x, duck.position.z - this.local.z) < 1.35) {
      const now = performance.now();
      if (now - (this.lastBump || 0) > 900) {
        this.lastBump = now;
        this.onDuckBump?.();
      }
    }
    me.root.position.set(this.local.x, 0, this.local.z);
    me.root.rotation.y = this.local.r;
    me.moving = moving;
    if (moving && me.stepped) {
      me.stepped = false;
      this.onStep?.();
    }

    this.room = roomAt(this.local.x, this.local.z);

    // nearby task console?
    let near = null;
    if (this.phase === 'roam') {
      for (const [taskId, pos] of Object.entries(TASK_STATIONS)) {
        if (Math.hypot(pos.x - this.local.x, pos.z - this.local.z) < 2 && !this.doneTasks.has(taskId)) near = taskId;
      }
    }
    if (near !== this.nearTask) {
      this.nearTask = near;
      this.onNearTask?.(near);
    }

    // send our position ~10 times a second while moving, once a second otherwise
    this.sendTimer += dt;
    this.heartbeat += dt;
    if (this.sendTimer > 0.1 && (this.canMove() || SEATED.includes(this.phase))) {
      this.sendTimer = 0;
      const payload = { x: this.local.x, z: this.local.z, r: this.local.r, m: moving ? 1 : 0, room: this.room };
      const key = `${payload.x.toFixed(2)},${payload.z.toFixed(2)},${payload.r.toFixed(2)},${payload.m}`;
      if (key !== this.lastSent || this.heartbeat > 1) {
        this.lastSent = key;
        this.heartbeat = 0;
        this.onSendPos?.(payload);
      }
    }
  }

  updateAvatars(dt, t) {
    const now = performance.now();
    const k = 1 - Math.exp(-dt * 12);
    for (const [id, a] of this.avatars) {
      if (id !== this.myId && a.target && !SEATED.includes(this.phase)) {
        const p = a.root.position;
        // where they probably are now: the last known spot, nudged along their velocity
        let gx = a.target.x;
        let gz = a.target.z;
        if (a.vel && a.target.m) {
          const ahead = Math.min(0.2, (now - a.movedAt) / 1000);
          const px = gx + a.vel.x * ahead;
          const pz = gz + a.vel.z * ahead;
          if (walkable(px, pz)) {
            gx = px;
            gz = pz;
          }
        }
        const dist = Math.hypot(gx - p.x, gz - p.z);
        if (dist > 12) p.set(gx, 0, gz); // teleported
        else {
          p.x += (gx - p.x) * k;
          p.z += (gz - p.z) * k;
        }
        let diff = a.target.r - a.root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        a.root.rotation.y += diff * k;
        a.moving = !!a.target.m || dist > 0.15;
      } else if (id !== this.myId) {
        a.moving = false;
      }
      // avatars far off-screen skip their animation work
      if (this.phase === 'roam' && id !== this.myId && !a.deathState && Math.abs(a.root.position.x - this.camTarget.x) + Math.abs(a.root.position.z - this.camTarget.z) > 45) continue;
      a.update(dt, t);
    }
  }

  updateCamera(dt) {
    // the title screen camera is far away, so push the fog back there
    const far = this.phase === 'home';
    this.scene.fog.near = far ? 150 : 40;
    this.scene.fog.far = far ? 500 : 120;
    const target = this._want;
    const offset = this._offset;
    const z = this.zoom;
    if (this.phase === 'home') {
      // title screen: a slow orbit high above the ship, the black hole glowing below
      this.homeD += (this.homeWant - this.homeD) * (1 - Math.exp(-dt * 0.9));
      const a = this.clock.elapsedTime * 0.04;
      const d = this.homeD;
      target.set(0, -20, 6);
      offset.set(Math.sin(a) * 70 * d, 85 * d, Math.cos(a) * 70 * d);
    } else if (this.phase === 'night') {
      target.set(0, 0, 4);
      offset.set(Math.sin(this.clock.elapsedTime * 0.05) * 30, 70, 55);
    } else if (SEATED.includes(this.phase) || (this.spectator && !this.spectatorPos)) {
      target.set(0, 0, -0.5);
      offset.set(0, 19 * z, 14.5 * z);
    } else if (this.spectator) {
      target.set(this.spectatorPos.x, 0, this.spectatorPos.z);
      offset.set(0, 26 * z, 19 * z);
    } else if (this.room === 'observation') {
      // tilt up to look out of the big window, and out into space while a clue drifts past
      const out = this.flyby?.live;
      target.set(this.local.x * (out ? 0.3 : 0.6), out ? 0.5 : 1.5, out ? -40 : Math.max(this.local.z - 5.5, -31));
      offset.set(0, (out ? 9 : 7.5) * z, (out ? 17 : 9.5) * z);
    } else {
      target.set(this.local.x, 0, this.local.z - 0.8);
      offset.set(0, 11.5 * z, 8.8 * z);
    }
    // the kill cam: close in on whoever is dying, slowly circling them
    const f = this.focus;
    const who = f && this.avatars.get(f.id);
    if (f) {
      f.t += dt;
      if (!who || f.t > f.dur) this.focus = null;
      else {
        this.sweep = null;
        const p = who.root.position;
        const a = 0.5 + f.t * 0.12;
        target.set(p.x, 0.9, p.z);
        offset.set(Math.sin(a) * 5.5, 4.2, Math.cos(a) * 5.5);
      }
    }
    // the opening camera move of a new part of the day
    if (this.sweep) {
      const s = this.sweep;
      s.t += dt;
      const e = Math.max(0, 1 - s.t / s.dur);
      const ease = e * e * (3 - 2 * e);
      offset.applyAxisAngle(UP, s.angle * ease);
      offset.y += s.lift * ease;
      if (s.t >= s.dur) this.sweep = null;
    }
    const k = 1 - Math.exp(-dt * 4);
    this.camTarget.lerp(target, k);
    this.camPos.lerp(offset.add(target), k);
    this.camera.position.copy(this.camPos);
    // the ship shudders when the black hole pulls it closer
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const a = this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
    }
    this.camera.lookAt(this.camTarget);
    this.shiftView(dt);
  }

  // The title screen: the menu is on the left (or along the bottom on a phone), so slide the whole picture over
  // to the empty side instead of having the ship hide behind the menu.
  shiftView(dt) {
    const home = this.phase === 'home' && this.titleMenu;
    const wide = innerWidth > 820;
    const k = 1 - Math.exp(-dt * 3);
    this.shiftX += ((home && wide ? 0.22 : 0) - this.shiftX) * k;
    this.shiftY += ((home && !wide ? 0.17 : 0) - this.shiftY) * k;
    if (Math.abs(this.shiftX) + Math.abs(this.shiftY) > 0.001) {
      const w = innerWidth;
      const h = innerHeight;
      this.camera.setViewOffset(w, h, -this.shiftX * w, this.shiftY * h, w, h);
    } else if (this.camera.view?.enabled) this.camera.clearViewOffset();
  }

  // the start screen: far out over the ship...
  titleShot() {
    this.homeD = this.homeWant = 2.7;
    this.titleMenu = false;
  }

  // ...and, on "Press any key", the dive in to the title view
  swoopIn() {
    this.homeWant = 1.12;
    this.titleMenu = true;
  }

  updateAmbience(dt, t) {
    // flickering lights; the closer the black hole, the worse it gets
    const instability = 0.04 + this.progress * 0.25 + (this.night ? 0.2 : 0);
    // the lighting mood: a phase tint, plus a red alert pulse when a meeting is called
    const mood = MOODS[this.phase];
    let amount = mood ? mood.amount : 0;
    this.moodColor.setHex(mood ? mood.color : 0xffffff);
    const alarm = t < this.alarmUntil;
    const disco = this.shipEventLive('disco');
    if (disco) {
      this.moodColor.setHSL((t * 0.6) % 1, 1, 0.55);
      amount = 0.85;
    } else if (alarm) {
      this.moodColor.setHex(0xff1020);
      amount = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 9));
    } else if (this.phase === 'nominations') {
      amount += 0.06 * Math.max(0, Math.sin(t * 7)); // a faint heartbeat
    }
    const tintK = Math.min(1, dt * 4);
    for (const light of this.ship.lights) {
      const base = light.userData.base ?? 40;
      const isFlicker = this.ship.flicker.includes(light);
      let target = base * (this.night ? 0.25 : this.blackout ? 0.04 : alarm ? 1.25 : 1);
      if ((isFlicker || Math.random() < instability * 0.05) && Math.random() < instability) target *= Math.random() * 0.5;
      if (light.userData.hauntUntil > t) target = base * (Math.random() < 0.45 ? 0.03 : 1.7); // a ghost is playing with the lights
      light.intensity += (target - light.intensity) * Math.min(1, dt * 15);
      this._tint.copy(light.userData.color).lerp(this.moodColor, amount);
      light.color.lerp(this._tint, alarm ? 1 : tintK);
    }
    this._tint.copy(this.hemiColor).lerp(this.moodColor, amount * 0.6);
    this.hemi.color.lerp(this._tint, alarm ? 1 : tintK);
    this.hemi.intensity = (this.night ? 0.35 : this.blackout ? 0.18 : 1.6 - this.progress * 0.5) * (this.lowFx ? 1.5 : 1);
    this.ship.holo.rotation.y = t * 0.6;
    this.ship.disk.rotation.z = t * 1.5;
    const core = this.ship.group.userData.reactorCore;
    if (core) core.material.emissiveIntensity = 1.4 + Math.sin(t * 3) * 0.6;
    const cat = this.ship.group.userData.cat;
    if (cat) cat.rotation.y = Math.sin(t * 0.4) * 0.8;
    for (const st of Object.values(this.ship.stations)) {
      st.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.05);
      st.icon.position.y = 1.7 + Math.sin(t * 2) * 0.08;
    }
  }

  // The script this ship is playing (the Cosmic Carnival gets a circus ring on the bridge).
  setScript(id) {
    this.carnival.setActive(id === 'carnival');
    this.classicRooms.setActive(!id || id === 'classic');
    this.classicExterior.setActive(!id || id === 'classic');
    if (this.space.script === (id || 'classic')) return;
    this.space.script = id || 'classic';
    this.backdrop.setScript(id);
    this.ship.setTheme(id);
    this.soundscape.setScript(id);
    this.doomFx.setScript(id);
    this.carnivalRooms.setActive(id === 'carnival');
    this.carnivalExterior.setActive(id === 'carnival');
    this.outbreakRooms.setActive(id === 'outbreak');
    this.outbreakExterior.setActive(id === 'outbreak');
    this.traitorsRooms.setActive(id === 'traitors');
    if (id === 'traitors') preloadCharacters(CITADEL_ROLES); // the end-game reveal's characters, fetched while the game is played
    this.traitorsExterior.setActive(id === 'traitors');
    this.ambience.root.visible = !['carnival', 'outbreak', 'traitors'].includes(id); // steam, sparks and robots belong to the space station
    this.space.last = -1; // repaint the windows now
  }

  // where the ears are: your spacesuit, the bridge table when seated, or the camera for spectators
  listener() {
    if (SEATED.includes(this.phase)) return { x: 0, z: 0 };
    if (this.spectator) return { x: this.camTarget.x, z: this.camTarget.z };
    return { x: this.local.x, z: this.local.z };
  }

  // Dawn: the disaster lurches closer. The ship shudders, and the thing outside flashes and sounds off.
  lurch() {
    this.rumble(1.8);
    this.doomFx.fire(1, false);
  }

  rumble(seconds = 1.6) {
    if (!this.noShake) this.shake = seconds;
  }

  // Settings: 'close' | 'normal' | 'far', and camera shake on/off.
  setCamera({ zoom, shake } = {}) {
    if (zoom) this.zoom = CAMERA_ZOOM[zoom] || 1;
    if (shake != null) this.noShake = !shake;
  }

  // ---------------------------------------------------------------------------
  // Teleporting and "who is where"
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // The Captain's ship events, and the last-words spotlight
  // ---------------------------------------------------------------------------

  setShipEvent(ev) {
    const key = ev ? `${ev.kind}:${ev.until}` : '';
    if (key === this.shipEventKey) return;
    this.shipEventKey = key;
    this.shipEvent = ev;
    if (ev?.kind === 'alarm') this.alarmUntil = this.clock.elapsedTime + Math.max(1, (ev.until - this.serverNow()) / 1000);
  }

  shipEventLive(kind) {
    return this.shipEvent?.kind === kind && this.serverNow() < this.shipEvent.until;
  }

  updateShipEvent(dt, t) {
    // zero gravity: everyone drifts up and bobs about
    const zerog = this.shipEventLive('zerog');
    let i = 0;
    for (const a of this.avatars.values()) {
      i += 1;
      if (zerog) {
        a.root.position.y = 0.9 + Math.sin(t * 1.3 + i) * 0.45;
        a.body.rotation.z = Math.sin(t * 0.7 + i) * 0.5;
        a.floating = true;
      } else if (a.floating) {
        a.root.position.y = 0;
        a.body.rotation.z = 0;
        a.floating = false;
      }
    }
    // confetti storm
    if (this.shipEventLive('confetti')) {
      this.confettiIn = (this.confettiIn ?? 0) - dt;
      if (this.confettiIn <= 0) {
        this.confettiIn = 0.25;
        const list = [...this.avatars.values()];
        const a = list[Math.floor(Math.random() * list.length)];
        if (a?.root.visible) a.burst(16, null, 3, 2.5);
      }
    }
    // the last-words spotlight follows its player
    if (this.spot) {
      const a = this.avatars.get(this.spot.userData.id);
      if (a) this.spot.position.set(a.root.position.x, 0, a.root.position.z);
      this.spot.children[0].material.opacity = 0.16 + Math.sin(t * 3) * 0.04;
    }
  }

  setSpotlight(id) {
    if ((this.spot?.userData.id || null) === (id || null)) return;
    if (this.spot) {
      this.scene.remove(this.spot);
      this.spot.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
      this.spot = null;
    }
    if (!id) return;
    const g = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.6, 9, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    cone.position.y = 4.5;
    g.add(cone);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.6, 28), new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.03;
    g.add(pool);
    g.userData.id = id;
    this.scene.add(g);
    this.spot = g;
  }

  // Ship systems that change the world: disguises, the blackout and sealed rooms.
  // { disguise: { id: asId }, blackout: bool, lockdowns: [{ room, allowed }] }
  setSystems({ disguise = {}, blackout = false, lockdowns = [] }) {
    const key = JSON.stringify([disguise, blackout, lockdowns]);
    if (key === this.systemsKey) return;
    this.systemsKey = key;
    this.disguise = disguise;
    this.blackout = blackout;
    this.lockdowns = lockdowns;
    if (this.lastState) this.syncPlayers(this.lastState);
    // a force field over each sealed room: red for a Security Chief's lockdown, amber for a private lock
    for (const m of this.lockMeshes || []) disposeTree(m);
    this.lockMeshes = lockdowns.map(({ room, private: priv }) => {
      const [x0, z0, x1, z1] = roomById(room).rect;
      const group = new THREE.Group();
      group.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      const field = new THREE.Mesh(
        new THREE.BoxGeometry(x1 - x0, 4.2, z1 - z0),
        new THREE.MeshBasicMaterial({ color: priv ? 0xffb547 : 0xff2a4a, transparent: true, opacity: priv ? 0.1 : 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      );
      field.position.y = 2.1;
      const label = makeTextSprite(priv ? '🔒 LOCKED' : '🔐 SEALED', { color: priv ? '#ffd27a' : '#ff8fa3', size: 44, scale: 0.016 });
      label.position.y = 3.4;
      group.add(field, label);
      this.scene.add(group);
      return group;
    });
  }

  // Is this room sealed against you?
  lockedOut(roomId) {
    return (this.lockdowns || []).some((l) => l.room === roomId && !l.allowed.includes(this.myId));
  }

  lockOf(roomId) {
    return (this.lockdowns || []).find((l) => l.room === roomId) || null;
  }

  // You walked into a sealed door: say so (once in a while, not every step).
  bumpLockedDoor(roomId) {
    const now = performance.now();
    if (now - (this.lastBlockedAt || 0) < 4000) return;
    this.lastBlockedAt = now;
    this.onBlocked?.(roomId, this.lockOf(roomId));
  }

  // A sealed room keeps sound in and out, except for the people it was sealed around.
  sealedBetween(idA, idB, all = this.whereabouts()) {
    const a = all[idA];
    const b = all[idB];
    if (!a || !b) return false;
    return (this.lockdowns || []).some((l) => {
      const aIn = a.room === l.room;
      const bIn = b.room === l.room;
      return aIn !== bIn && !l.allowed.includes(aIn ? idB : idA);
    });
  }

  // Beam yourself into a room. Returns a reason string if you can't right now.
  teleport(roomId, { force = false } = {}) {
    if (!this.canMove()) return 'You can only teleport while exploring the ship.';
    const room = roomById(roomId);
    if (!room) return 'Unknown room.';
    if (this.room === roomId) return null;
    if (this.lockedOut(roomId)) return this.lockOf(roomId)?.private ? `🔒 ${room.name} is locked: people in there are talking in private. Walk up to the door and knock (K).` : `🔐 ${room.name} is in lockdown. Try again in a minute.`;
    const now = performance.now() / 1000;
    if (now < this.teleportReadyAt && !force) return 'The teleporter is recharging…';
    this.teleportReadyAt = now + TELEPORT_COOLDOWN;
    const [x0, z0, x1, z1] = room.rect;
    // the bridge has the big table in the middle, so land at its south side
    const cx = roomId === 'bridge' ? SPAWN.x : (x0 + x1) / 2;
    const cz = roomId === 'bridge' ? SPAWN.z : (z0 + z1) / 2;
    let spot = { x: cx, z: cz };
    for (let i = 0; i < 20; i++) {
      const x = cx + (Math.random() - 0.5) * 5;
      const z = cz + (Math.random() - 0.5) * 3;
      if (walkable(x, z) && roomAt(x, z) === roomId) {
        spot = { x, z };
        break;
      }
    }
    this.addBeam(this.local.x, this.local.z);
    this.local.x = spot.x;
    this.local.z = spot.z;
    this.room = roomId;
    this.avatars.get(this.myId)?.root.position.set(spot.x, 0, spot.z);
    this.addBeam(spot.x, spot.z);
    this.lastSent = '';
    this.sendTimer = 1; // tell the server straight away
    return null;
  }

  addBeam(x, z) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x6cf0ff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 6, 20, 1, true), mat);
    mesh.position.set(x, 3, z);
    this.scene.add(mesh);
    this.beams.push({ mesh, life: 0.9 });
  }

  updateBeams(dt) {
    for (const b of this.beams) {
      b.life -= dt;
      b.mesh.material.opacity = Math.max(0, b.life) * 0.8;
      b.mesh.scale.set(1 + (0.9 - b.life) * 0.6, 1, 1 + (0.9 - b.life) * 0.6);
    }
    for (const b of this.beams.filter((x) => x.life <= 0)) {
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
    }
    this.beams = this.beams.filter((b) => b.life > 0);
  }

  // Where everyone is right now: id -> { room, x, z }
  whereabouts() {
    const out = {};
    for (const [id, a] of this.avatars) {
      const p = id === this.myId ? this.local : a.target || a.root.position;
      out[id] = { room: roomAt(p.x, p.z), x: p.x, z: p.z };
    }
    // to a hallucinating player, the imaginary crewmates are just as real
    if (this.phase === 'roam') {
      (this.hallucinations?.phantoms || []).forEach((ph, i) => {
        const p = ph.avatar.root.position;
        out[`~ph${i}`] = { room: roomAt(p.x, p.z), x: p.x, z: p.z, phantom: ph };
      });
    }
    return out;
  }

  // Display name for an id from whereabouts() (players or imaginary friends).
  phantomName(id) {
    return id.startsWith('~ph') ? this.hallucinations?.phantoms[Number(id.slice(3))]?.name : null;
  }

  // Who would hear you in proximity chat (same rules as the server).
  hearers() {
    const all = this.whereabouts();
    const mine = all[this.myId];
    if (!mine) return [];
    return Object.entries(all)
      .filter(([id, p]) => id !== this.myId && ((p.room === mine.room && p.room !== 'corridor') || Math.hypot(p.x - mine.x, p.z - mine.z) < NEAR_RADIUS) && !this.sealedBetween(this.myId, id, all))
      .map(([id]) => id);
  }

  // Positions of everyone (for proximity voice volume).
  positions() {
    const out = {};
    for (const [id, a] of this.avatars) out[id] = { x: a.root.position.x, z: a.root.position.z };
    return out;
  }
}

// Shared with the HUD: 0..1 closeness of the black hole.
export function blackHoleProgress(state) {
  if (!state || state.phase === 'lobby') return 0;
  if (state.phase === 'ended' && state.winner === 'infiltrators') return 1;
  const total = Math.max(3, state.playerCount);
  const dead = state.playerCount - state.aliveCount;
  const deathPart = dead / Math.max(1, total - 2);
  const nightPart = (state.night || 0) / Math.max(2, total - 1); // roughly how many nights a game lasts
  return Math.min(1, 0.04 + 0.6 * deathPart + 0.36 * nightPart);
}

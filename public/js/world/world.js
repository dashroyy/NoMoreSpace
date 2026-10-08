// The 3D world: scene, camera, players moving around the ship.
import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { buildShip } from './ship.js';
import { SpaceCanvases, buildBackdrop } from './sky.js';
import { moveWithCollision, roomAt, seatPosition, TASK_STATIONS, SPAWN, DRAWING_SLOTS } from './layout.js';

const SEATED = ['dawn', 'meeting', 'nominations', 'dusk'];
const SPEED = 5.5;

export class World {
  constructor(container, data, { onSendPos, onNearTask, onStep } = {}) {
    this.data = data;
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
    this.renderer.setPixelRatio(this.lowFx ? 0.6 : Math.min(window.devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020208);
    this.scene.fog = new THREE.Fog(0x05060f, 40, 120);
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1500);
    this.camera.position.set(0, 30, 30);
    this.camTarget = new THREE.Vector3();
    this.camPos = new THREE.Vector3(0, 30, 30);
    this.zoom = 1;

    this.hemi = new THREE.HemisphereLight(0x9aa8ff, 0x2a1830, 1.6);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0x404a70, 0.6);
    this.scene.add(this.ambient);
    const moon = new THREE.DirectionalLight(0xb8c4ff, 0.7);
    moon.position.set(-20, 40, 20);
    this.scene.add(moon);

    this.space = new SpaceCanvases();
    this.backdrop = buildBackdrop(this.scene);
    this.backdrop.group.traverse((o) => o.material && (o.material.fog = false));
    this.ship = buildShip(this.scene, this.space);
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
    this.myId = null;
    this.spectator = false;
    this.sendTimer = 0;
    this.lastSent = '';
    this.heartbeat = 0;
    this.nearTask = null;
    this.room = 'bridge';
    this.progress = 0;
    this.night = false;
    this.paused = false; // the reveal cinematic takes over rendering
    this.drawingCache = new Map(); // id -> texture
    this.drawingSlots = new Map(); // id -> slot index
    this.doneTasks = new Set();
    this.clock = new THREE.Clock();

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
  }

  // ---------------------------------------------------------------------------
  // Players
  // ---------------------------------------------------------------------------

  syncPlayers(state) {
    this.myId = state.you?.id;
    this.spectator = !!state.you?.isCaptain;
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
      if (JSON.stringify(a.look) !== JSON.stringify(p.cosmetics)) a.setLook(p.cosmetics);
      if (a.pet && !a.pet.parent) this.scene.add(a.pet);
      const labelColor = p.id === this.myId ? '#6cf0ff' : p.alive ? '#ffffff' : '#9aa0b8';
      if (a.name !== p.name || a.labelColor !== labelColor) {
        a.setName(p.name, labelColor);
        a.labelColor = labelColor;
      }
      if (!p.alive && !a.ghost && !a.deathState && !a.pendingDeath) a.setGhost(true);
      if (p.alive && a.ghost) a.setGhost(false);
      a.seat = p.seat;
    }
    for (const [id, a] of this.avatars) {
      if (!seen.has(id)) {
        a.dispose();
        this.avatars.delete(id);
      }
    }
    this.playerCount = state.players.length;
    if (this.seatCount !== this.playerCount) {
      this.ship.setSeats(this.playerCount);
      this.seatCount = this.playerCount;
    }
  }

  setPhase(phase, state) {
    const prev = this.phase;
    this.phase = phase;
    this.setNight(phase === 'night');
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
        a.extras.clear();
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
  applyPositions(packed) {
    if (SEATED.includes(this.phase) || this.phase === 'night') return;
    for (const [id, [x, z, r, m]] of Object.entries(packed)) {
      if (id === this.myId) continue;
      const a = this.avatars.get(id);
      if (a) a.target = { x, z, r, m };
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
      setTimeout(() => {
        a.die(anim || 'fainted', () => (a.pendingDeath = false));
      }, 1200);
    }
  }

  // ---------------------------------------------------------------------------
  // Black hole, clues, drawings
  // ---------------------------------------------------------------------------

  setProgressFromState(state) {
    const total = Math.max(3, state.playerCount);
    const dead = state.playerCount - state.aliveCount;
    const p = state.phase === 'lobby' ? 0 : Math.min(1, dead / Math.max(1, total - 2));
    this.progress = p;
    this.space.progress = p;
    this.backdrop.setProgress(p);
    this.ship.holo.scale.setScalar(1 + p * 0.8);
    for (const light of this.ship.lights) light.userData.base = 40 * (1 - p * 0.35);
  }

  setClue(clue, players, roles) {
    this.space.clue = clue;
    this.space.colorOf = (id) => {
      const p = players.find((x) => x.id === id);
      return p ? this.data.suits[p.cosmetics.suit] : '#ffffff';
    };
    this.space.iconOf = (roleId) => roles[roleId]?.icon || '★';
    this.space.last = -1;
  }

  setDoneTasks(list) {
    this.doneTasks = new Set(list);
    for (const [taskId, st] of Object.entries(this.ship.stations)) {
      const done = this.doneTasks.has(taskId);
      st.screenMat.emissiveIntensity = done ? 0.2 : 1.4;
      st.ring.visible = !done;
      st.icon.visible = !done;
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
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    if (this.paused) return;
    this.updateLocal(dt);
    this.updateAvatars(dt, t);
    this.updateCamera(dt);
    this.updateAmbience(dt, t);
    this.space.update(t);
    this.backdrop.update(t);
    this.renderer.render(this.scene, this.camera);
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
      [this.local.x, this.local.z] = moveWithCollision(this.local.x, this.local.z, dx * sp * dt, dz * sp * dt);
      const want = Math.atan2(dx, dz);
      let diff = want - this.local.r;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.local.r += diff * Math.min(1, dt * 12);
    }
    this.local.moving = moving;
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
    for (const [id, a] of this.avatars) {
      if (id !== this.myId && a.target && !SEATED.includes(this.phase)) {
        const p = a.root.position;
        const k = Math.min(1, dt * 10);
        const dist = Math.hypot(a.target.x - p.x, a.target.z - p.z);
        if (dist > 12) p.set(a.target.x, 0, a.target.z);
        else {
          p.x += (a.target.x - p.x) * k;
          p.z += (a.target.z - p.z) * k;
        }
        let diff = a.target.r - a.root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        a.root.rotation.y += diff * k;
        a.moving = !!a.target.m || dist > 0.15;
      } else if (id !== this.myId) {
        a.moving = false;
      }
      a.update(dt, t);
    }
  }

  updateCamera(dt) {
    // the title screen camera is far away, so push the fog back there
    const far = this.phase === 'home';
    this.scene.fog.near = far ? 150 : 40;
    this.scene.fog.far = far ? 500 : 120;
    let target;
    let offset;
    const z = this.zoom;
    if (this.phase === 'home') {
      // title screen: a slow orbit high above the ship, the black hole glowing below
      const a = this.clock.elapsedTime * 0.04;
      target = new THREE.Vector3(0, -20, 6);
      offset = new THREE.Vector3(Math.sin(a) * 70, 85, Math.cos(a) * 70);
    } else if (this.phase === 'night') {
      target = new THREE.Vector3(0, 0, 4);
      offset = new THREE.Vector3(Math.sin(this.clock.elapsedTime * 0.05) * 30, 70, 55);
    } else if (SEATED.includes(this.phase) || (this.spectator && !this.spectatorPos)) {
      target = new THREE.Vector3(0, 0, -0.5);
      offset = new THREE.Vector3(0, 19 * z, 14.5 * z);
    } else if (this.spectator) {
      target = new THREE.Vector3(this.spectatorPos.x, 0, this.spectatorPos.z);
      offset = new THREE.Vector3(0, 26 * z, 19 * z);
    } else {
      target = new THREE.Vector3(this.local.x, 0, this.local.z - 0.8);
      offset = new THREE.Vector3(0, 11.5 * z, 8.8 * z);
    }
    const k = 1 - Math.exp(-dt * 4);
    this.camTarget.lerp(target, k);
    this.camPos.lerp(target.clone().add(offset), k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
  }

  updateAmbience(dt, t) {
    // flickering lights; the closer the black hole, the worse it gets
    const instability = 0.04 + this.progress * 0.25 + (this.night ? 0.2 : 0);
    for (const light of this.ship.lights) {
      const base = light.userData.base ?? 40;
      const isFlicker = this.ship.flicker.includes(light);
      let target = base * (this.night ? 0.25 : 1);
      if ((isFlicker || Math.random() < instability * 0.05) && Math.random() < instability) target *= Math.random() * 0.5;
      light.intensity += (target - light.intensity) * Math.min(1, dt * 15);
    }
    this.hemi.intensity = (this.night ? 0.35 : 1.6 - this.progress * 0.5) * (this.lowFx ? 1.5 : 1);
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

  // Positions of everyone (for proximity voice volume).
  positions() {
    const out = {};
    for (const [id, a] of this.avatars) out[id] = { x: a.root.position.x, z: a.root.position.z };
    return out;
  }
}

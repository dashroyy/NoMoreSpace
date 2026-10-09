// The end-game cinematic: everyone's suit comes off to reveal their true
// character, then ARIA replays every night and day from the ship's black box.
import * as THREE from 'three';
import { $, el, clear } from '../util.js';
import { store, send, isController } from '../store.js';
import { sfx, setAmbient } from '../audio.js';
import { Avatar, makeTextSprite } from '../world/avatar.js';
import { buildRoleModel, animateRoleModel } from '../world/models.js';
import { paintBlackHole } from '../world/sky.js';

const TEAM_COLOR = { crew: 0x6cf0ff, infiltrators: 0xff3b5c };

export class Reveal {
  constructor(world) {
    this.world = world;
    this.running = false;
    $('reveal-skip').addEventListener('click', () => this.skip());
    $('reveal-speed').addEventListener('click', () => {
      this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1;
      $('reveal-speed').textContent = `⏩ ${this.speed}×`;
    });
  }

  start(state) {
    this.stop();
    this.state = state;
    this.speed = 1;
    $('reveal-speed').textContent = '⏩ 1×';
    this.running = true;
    this.world.paused = true;
    $('reveal').hidden = false;
    $('reveal-summary').hidden = true;
    $('reveal-bubble').hidden = true;
    this.buildScene();
    this.steps = this.buildTimeline();
    this.stepIndex = -1;
    this.stepTime = 0;
    this.clock = new THREE.Clock();
    this.time = 0;
    setAmbient('night');
    this.nextStep();
    const frame = () => {
      if (!this.running) return;
      requestAnimationFrame(frame);
      this.update(this.clock.getDelta());
    };
    requestAnimationFrame(frame);
  }

  stop() {
    this.running = false;
    this.world.paused = false;
    $('reveal').hidden = true;
    if (this.scene) this.scene.traverse((o) => o.geometry?.dispose?.());
    this.scene = null;
  }

  skip() {
    if (!this.steps) return;
    this.stepIndex = this.steps.length - 2;
    this.nextStep();
  }

  // ---------------------------------------------------------------------------
  // Scene
  // ---------------------------------------------------------------------------

  buildScene() {
    const s = this.state;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02020a);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camPos = new THREE.Vector3(0, 9, 18);
    this.camLook = new THREE.Vector3(0, 1, 0);
    this.camWantPos = this.camPos.clone();
    this.camWantLook = this.camLook.clone();

    scene.add(new THREE.HemisphereLight(0x9aa8ff, 0x200a20, 0.9));
    this.key = new THREE.SpotLight(0xffffff, 120, 60, 0.5, 0.5, 1.2);
    this.key.position.set(0, 16, 6);
    scene.add(this.key);
    scene.add(this.key.target);
    this.redLight = new THREE.PointLight(0xff2244, 0, 40);
    this.redLight.position.set(0, 6, -6);
    scene.add(this.redLight);

    // stage
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(12, 12.5, 0.4, 64), new THREE.MeshStandardMaterial({ color: 0x0c0f1e, metalness: 0.6, roughness: 0.4 }));
    stage.position.y = -0.2;
    scene.add(stage);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(12, 0.08, 8, 96), new THREE.MeshStandardMaterial({ color: 0x7f6bff, emissive: 0x7f6bff, emissiveIntensity: 2 }));
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);

    // stars
    const pts = new Float32Array(3000);
    for (let i = 0; i < 1000; i++) {
      const r = 90 + Math.random() * 60;
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      pts.set([Math.cos(a) * Math.cos(b) * r, Math.sin(b) * r * 0.6 + 10, Math.sin(a) * Math.cos(b) * r], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6 })));

    // the black hole looming behind the stage
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    this.holeCanvas = c;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.holeTex = tex;
    this.hole = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    this.hole.position.set(0, -2, -70);
    scene.add(this.hole);
    this.holeSize = 0.5;
    this.paintHole();

    // the cast, in seat order
    const players = s.players;
    const n = players.length;
    const R = Math.max(4.5, n * 0.62);
    this.R = R;
    this.cast = new Map();
    const setup = s.history.find((h) => h.k === 'setup') || { roles: {}, believed: {} };
    players.forEach((p, i) => {
      const a = Math.PI / 2 + (i / n) * Math.PI * 2;
      const pos = new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R * 0.75);
      const avatar = new Avatar({ look: p.cosmetics, name: p.name, suits: store.data.suits, visors: store.data.visors });
      avatar.root.position.copy(pos);
      avatar.root.lookAt(0, 0, 4);
      avatar.addedTo(scene);
      const finalRole = p.role;
      const startRole = setup.roles[p.id] || finalRole;
      const model = buildRoleModel(startRole, store.data.suits[p.cosmetics.suit]);
      model.position.copy(pos);
      model.rotation.copy(avatar.root.rotation);
      model.visible = false;
      scene.add(model);
      const team = store.data.types[store.data.roles[finalRole].type].team;
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.9, 32), new THREE.MeshBasicMaterial({ color: TEAM_COLOR[team], transparent: true, opacity: 0, side: THREE.DoubleSide }));
      halo.rotation.x = -Math.PI / 2;
      halo.position.copy(pos).setY(0.03);
      scene.add(halo);
      this.cast.set(p.id, { p, avatar, model, halo, pos, team, startRole, finalRole, believed: setup.believed?.[p.id], revealed: false, dead: false, flyT: null });
    });
    this.fx = [];
  }

  paintHole() {
    const g = this.holeCanvas.getContext('2d');
    g.clearRect(0, 0, 1024, 1024);
    paintBlackHole(g, 512, 512, 90 * this.holeSize + 40, this.time || 0);
    this.holeTex.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------
  // Timeline
  // ---------------------------------------------------------------------------

  buildTimeline() {
    const s = this.state;
    const R = store.data.roles;
    const name = (id) => this.cast.get(id)?.p.name || 'someone';
    const roleName = (id) => R[id]?.name || id;
    const steps = [];
    const say = (text, opts = {}) => steps.push({ dur: opts.dur || 3, caption: text, ...opts });

    steps.push({ dur: 3.2, chapter: 'THE TRUTH', caption: 'Every mask comes off. Here is what really happened aboard…', overview: true, enter: () => sfx('doom') });

    // Unmasking
    for (const [id, c] of this.cast) {
      const r = R[c.startRole];
      const drunkNote = c.startRole === 'drunk' && c.believed ? ` They thought they were the ${roleName(c.believed)}… but they were the Space Drunk the whole time! 🍾` : '';
      steps.push({
        dur: 1.6,
        focus: id,
        caption: `${c.p.name} was ${r.type === 'parasite' ? '' : 'the '}${r.name}! ${r.icon}${drunkNote}`,
        enter: () => this.unmask(id),
      });
    }

    // Night & day chapters
    for (const ch of s.history) {
      if (ch.k === 'night') {
        steps.push({ dur: 2.2, chapter: `NIGHT ${ch.n}`, caption: '', overview: true, enter: () => { sfx('night'); this.lighting('night'); } });
        for (const e of ch.events) {
          const step = this.nightEvent(e, name, roleName);
          if (step) steps.push(step);
        }
        if (ch.story) steps.push({ dur: 4.2, bubble: ch.story, caption: '', overview: true });
        for (const d of ch.deaths || []) steps.push({ dur: 2.4, focus: d.id, caption: `💀 ${name(d.id)} did not wake up.`, enter: () => this.kill(d.id, d.anim) });
      }
      if (ch.k === 'day') {
        const interesting = ch.events.filter((e) => ['nomination', 'execute', 'shot', 'sentinel', 'become-parasite', 'story', 'system'].includes(e.k) && !(e.k === 'nomination' && e.result === 'safe' && e.votes < 2));
        if (!interesting.length) continue;
        steps.push({ dur: 2, chapter: `DAY ${ch.n}`, caption: '', overview: true, enter: () => { sfx('dawn'); this.lighting('day'); } });
        for (const e of interesting) {
          const step = this.dayEvent(e, name, roleName);
          if (step) steps.push(step);
        }
      }
    }

    // Finale
    const crewWon = s.winner === 'crew';
    steps.push({
      dur: 6,
      chapter: crewWon ? 'THE CREW ESCAPES!' : 'NO MORE SPACE',
      chapterClass: crewWon ? 'win-crew' : 'win-evil',
      caption: s.winReason || '',
      overview: true,
      finale: true,
      enter: () => this.finale(crewWon),
    });
    steps.push({ dur: 9999, summary: true, overview: true, enter: () => this.showSummary() });
    return steps;
  }

  nightEvent(e, name, roleName) {
    const R = store.data.roles;
    const role = (id) => this.cast.get(id)?.startRole;
    switch (e.k) {
      case 'hallucinate':
        return { dur: 2.8, focus: e.a, beam: [e.a, e.t, 0xff8fd8], caption: `🤡 ${name(e.a)} the Holo-Jester made ${name(e.t)} see things that weren't there${e.works === false ? '… but the projector was glitched.' : '. (Definitely Real Dave says hi.)'}`, enter: () => sfx('pop') };
      case 'hack':
        return { dur: 2.6, focus: e.a, beam: [e.a, e.t, 0x39ff6b], caption: `💻 ${name(e.a)} the Hacker glitched ${name(e.t)}'s systems.`, enter: () => sfx('zap') };
      case 'protect': {
        const drunk = role(e.a) === 'drunk';
        return { dur: 2.6, focus: e.a, beam: [e.a, e.t, 0x7dffb0], caption: `💉 ${name(e.a)}${drunk ? ' (the Space Drunk, playing doctor)' : ' the Medic'} watched over ${name(e.t)}${e.works ? '.' : '… but the medicine was fake.'}`, enter: () => sfx('chime') };
      }
      case 'kill': {
        const text = {
          died: `🦑 The Parasite (${name(e.a)}) slithered out of the vents and took ${name(e.t)}.`,
          protected: `🦑 The Parasite (${name(e.a)}) lunged at ${name(e.t)}… but the Medic's shield held!`,
          marine: `🦑 The Parasite (${name(e.a)}) bit the Marine ${name(e.t)}. Far too crunchy.`,
          glitched: `🦑 The Parasite (${name(e.a)}) tried to hunt, but its systems were glitched!`,
          starpass: `🦑 The Parasite (${name(e.a)}) turned on ITSELF… and leapt into ${name(e.to)}!`,
          bounced: `🦑 The Parasite went for First Officer ${name(e.t)}, who dodged. ${name(e.victim)} died instead!`,
          'bounced-safe': `🦑 The Parasite went for First Officer ${name(e.t)}, who dodged it entirely!`,
        }[e.result];
        return { dur: 3, focus: e.a, beam: [e.a, e.result === 'starpass' ? e.to || e.a : e.t, 0xc77dff], caption: text, enter: () => sfx('death') };
      }
      case 'info': {
        const r = R[e.role];
        const who = this.cast.get(e.a);
        const drunk = who?.startRole === 'drunk';
        const verdict = e.truthful ? '✔ TRUE' : drunk ? '✘ FALSE (they were the Space Drunk)' : '✘ FALSE (glitched by the Hacker)';
        return { dur: 3, focus: e.a, caption: `${r.icon} ${name(e.a)} the ${r.name} learned: “${e.text}” — ${verdict}`, enter: () => sfx(e.truthful ? 'blip' : 'buzz') };
      }
      case 'blackbox':
        return { dur: 3, focus: e.a, beam: [e.a, e.t, 0xffb547], caption: `📼 ${name(e.a)}'s Black Box flickered: “${e.text}” ${e.truthful ? '✔' : '✘ (false)'}`, enter: () => sfx('blip') };
      case 'become-parasite':
        return { dur: 3, focus: e.a, caption: `🥚 ${name(e.a)} became the new Parasite!`, enter: () => this.transform(e.a) };
      case 'unglitch':
        return { dur: 2.4, focus: e.t, caption: `💻 With ${name(e.a)} the Hacker dead, ${name(e.t)}'s systems rebooted.`, enter: () => sfx('blip') };
      default:
        return null;
    }
  }

  dayEvent(e, name, roleName) {
    const R = store.data.roles;
    switch (e.k) {
      case 'nomination': {
        const result = { block: ' — heading for the airlock!', tie: ' — a tie!', safe: '' }[e.result];
        return { dur: 2.4, focus: e.t, beam: [e.a, e.t, 0xffb547], caption: `☝️ ${name(e.a)} nominated ${name(e.t)}: ${e.votes} vote${e.votes === 1 ? '' : 's'}${result}`, enter: () => sfx('gavel') };
      }
      case 'execute': {
        const c = this.cast.get(e.id);
        const r = R[c?.finalRole || c?.startRole];
        return { dur: 3.6, focus: e.id, caption: `🚪 ${name(e.id)} was airlocked. They were ${r ? `the ${r.name} ${r.icon}` : 'mysterious'}.${e.story ? ` ${e.story}` : ''}`, enter: () => { sfx('airlock'); this.kill(e.id, 'airlock'); } };
      }
      case 'shot': {
        // a Stowaway can register as the Parasite and get hit by mistake
        const hitWhat = this.cast.get(e.t)?.startRole === 'stowaway' ? 'and vaporised… the Stowaway, who looked just like the Parasite!' : 'and vaporised the Parasite!';
        return { dur: 3, focus: e.a, beam: [e.a, e.t, 0xff7a3a], caption: `🔫 ${name(e.a)} fired at ${name(e.t)}… ${e.hit ? hitWhat : 'nothing happened.'}`, enter: () => { sfx('shot'); if (e.hit) this.kill(e.t, 'shot'); } };
      }
      case 'sentinel':
        return { dur: 3, focus: e.a, beam: [e.t, e.a, 0xffe14f], caption: `⚡ ${name(e.a)} nominated the Sentinel ${name(e.t)} and got fried!`, enter: () => { sfx('zap'); this.kill(e.a, 'airlock'); } };
      case 'become-parasite':
        return { dur: 3, focus: e.a, caption: `🥚 With the Parasite dead, ${name(e.a)} the Incubator hatched a new one!`, enter: () => this.transform(e.a) };
      case 'story':
        return { dur: 3.6, bubble: e.text, caption: '', overview: true };
      case 'system': {
        // ⚡ ship systems, shown in the replay so everyone learns what really happened
        const ROOM = (id) => ({ bridge: 'the Bridge', observation: 'the Observation Deck', navigation: 'Navigation', comms: 'Comms', medbay: 'the Medbay', galley: 'the Galley', reactor: 'the Reactor', engine: 'the Engine Room', hydroponics: 'Hydroponics', airlock: 'the Airlock', quarters: 'Crew Quarters', cargo: 'the Cargo Bay' })[id] || 'a room';
        const dud = e.works === false ? ' …but it was a dud!' : '';
        const text = {
          intercept: `🎧 ${name(e.a)} secretly listened in on ${ROOM(e.room)}.${dud}`,
          accesslog: `🗂️ ${name(e.a)} read the door log of ${ROOM(e.room)}.${dud}`,
          lockdown: `🔐 ${name(e.a)} sealed ${ROOM(e.room)} for a private chat.${dud}`,
          sweep: `📶 ${name(e.a)} swept ${ROOM(e.room)} for evil.${dud}`,
          medscan: `🩺 ${name(e.a)} med-scanned ${name(e.t)}.${dud}`,
          spoof: `👾 ${name(e.a)} sent a fake message pretending to be ${name(e.t)}!`,
          disguise: `🎭 ${name(e.a)} disguised themself as ${name(e.t)}!`,
          blackout: `🌑 ${name(e.a)} cut the lights!`,
        }[e.sys];
        return text ? { dur: 2.6, focus: e.a, beam: e.t ? [e.a, e.t, 0xc77dff] : null, caption: text, enter: () => sfx('chime') } : null;
      }
      default:
        return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  unmask(id) {
    const c = this.cast.get(id);
    if (!c || c.revealed) return;
    c.revealed = true;
    sfx('reveal');
    c.avatar.burst(30, null, 3);
    c.avatar.body.visible = false;
    c.avatar.label.visible = false;
    c.model.visible = true;
    c.model.scale.setScalar(0.01);
    c.popT = 0;
    c.halo.material.opacity = 0.85;
    const r = store.data.roles[c.startRole];
    const label = makeTextSprite(`${r.icon} ${c.p.name}`, { color: c.team === 'crew' ? '#bff8ff' : '#ffb3c1', size: 30, scale: 0.012 });
    label.position.copy(c.pos).setY(2.9);
    this.scene.add(label);
    c.label = label;
  }

  transform(id) {
    const c = this.cast.get(id);
    if (!c) return;
    sfx('doom');
    c.model.removeFromParent();
    c.model = buildRoleModel('parasite', store.data.suits[c.p.cosmetics.suit]);
    c.model.position.copy(c.pos);
    c.model.rotation.copy(c.avatar.root.rotation);
    this.scene.add(c.model);
    c.popT = 0;
    c.model.scale.setScalar(0.01);
  }

  kill(id, anim) {
    const c = this.cast.get(id);
    if (!c || c.dead) return;
    c.dead = true;
    c.deathAnim = anim;
    c.deathT = 0;
    c.avatar.burst(20, anim === 'airlock' ? 0xffffff : 0xc77dff, 3);
  }

  beam(fromId, toId, color) {
    const a = this.cast.get(fromId)?.pos;
    const b = this.cast.get(toId)?.pos;
    if (!a || !b) return;
    const start = a.clone().setY(1.4);
    const end = b.clone().setY(1.2);
    const mid = start.clone().lerp(end, 0.5).setY(4 + start.distanceTo(end) * 0.25);
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.05, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshBasicMaterial({ color }));
    this.scene.add(tube, orb);
    this.fx.push({ tube, orb, curve, t: 0, dur: 1.2, color, toId });
  }

  lighting(mode) {
    this.lightMode = mode;
  }

  finale(crewWon) {
    this.finaleMode = crewWon ? 'crew' : 'evil';
    sfx(crewWon ? 'fanfare' : 'doom');
    setAmbient(crewWon ? 'victory' : 'doom');
    for (const c of this.cast.values()) if (!c.revealed) this.unmask(c.p.id);
    if (crewWon) for (const c of this.cast.values()) c.avatar.burst(25, null, 4, 2);
  }

  showSummary() {
    const s = this.state;
    const R = store.data.roles;
    const box = $('reveal-summary');
    box.hidden = false;
    $('reveal-caption').textContent = '';
    const crewWon = s.winner === 'crew';
    clear(box,
      el('h2', {}, crewWon ? '🛡️ The crew escapes the black hole!' : '🦑 The infiltrators win. No more space.'),
      el('p', { className: 'hint' }, s.winReason),
      el('div', { className: 'summary-grid' }, ...[...this.cast.values()].map((c) => {
        const r = R[c.finalRole];
        return el('div', { className: `summary-card ${c.team} ${c.p.alive ? '' : 'dead'}` },
          el('span', { className: 'ico' }, r.icon),
          el('b', {}, c.p.name),
          el('span', {}, r.name + (c.startRole !== c.finalRole ? ` (was ${R[c.startRole].name})` : '')),
          c.startRole === 'drunk' && c.believed ? el('span', { className: 'hint' }, `thought: ${R[c.believed].name}`) : null,
          el('span', { className: 'hint' }, c.p.alive ? 'Survived' : '👻 Died'),
        );
      })),
      awardsBox(s),
      this.unlocked?.length ? el('div', { className: 'unlocked' }, `🎁 New for your spacesuit: ${this.unlocked.join(', ')}!`) : null,
      el('div', { className: 'row' },
        el('button', { onclick: () => this.start(this.state) }, '🔁 Watch again'),
        isController() ? el('button', { className: 'primary', onclick: () => send('reset').catch(() => {}) }, '🚀 Back to the docking bay (new game)') : el('span', { className: 'hint' }, 'Waiting for the host/Captain to start a new game…'),
        el('button', { className: 'ghost', onclick: () => this.stop() }, 'Close'),
      ),
    );
  }

  nextStep() {
    this.stepIndex += 1;
    const step = this.steps[this.stepIndex];
    if (!step) return;
    this.stepTime = 0;
    const chapterBox = $('reveal-chapter');
    if (step.chapter) {
      chapterBox.textContent = step.chapter;
      chapterBox.className = `reveal-chapter ${step.chapterClass || ''}`;
    } else if (!step.bubble) {
      chapterBox.textContent = '';
    }
    $('reveal-caption').textContent = step.caption || '';
    const bubble = $('reveal-bubble');
    bubble.hidden = !step.bubble;
    if (step.bubble) bubble.textContent = step.bubble;
    if (step.focus) {
      const c = this.cast.get(step.focus);
      if (c) {
        // everyone faces the middle, so film them from the centre of the stage
        const inward = c.pos.clone().multiplyScalar(0.4);
        this.camWantPos = new THREE.Vector3(inward.x, 2.6, inward.z);
        this.camWantLook = c.pos.clone().setY(1.1);
        this.key.target.position.copy(c.pos);
      }
    } else if (step.overview) {
      this.camWantPos = new THREE.Vector3(0, 7 + this.R * 0.5, 9 + this.R * 1.25);
      this.camWantLook = new THREE.Vector3(0, 1, 0);
      this.key.target.position.set(0, 0, 0);
    }
    step.enter?.();
    if (step.beam) this.beam(...step.beam);
  }

  update(raw) {
    if (!this.scene) return;
    // the story keeps real time even on slow computers; animations use a capped step
    const dt = Math.min(0.05, raw);
    const sdt = Math.min(0.5, raw) * this.speed;
    this.time += sdt;
    const step = this.steps[this.stepIndex];
    if (step) {
      this.stepTime += sdt;
      if (this.stepTime >= step.dur) this.nextStep();
    }

    // camera
    const k = 1 - Math.exp(-dt * 2.5);
    this.camPos.lerp(this.camWantPos, k);
    this.camLook.lerp(this.camWantLook, k);
    if (this.finaleMode) {
      const a = this.time * 0.15;
      this.camPos.set(Math.sin(a) * (10 + this.R), 6 + this.R * 0.4, Math.cos(a) * (10 + this.R));
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    // lights & black hole
    const night = this.lightMode === 'night';
    this.key.intensity += ((night ? 60 : 140) - this.key.intensity) * k;
    if (this.finaleMode === 'evil') {
      this.holeSize = Math.min(4.5, this.holeSize + sdt * 0.5);
      this.redLight.intensity = 60 + Math.sin(this.time * 6) * 30;
    } else if (this.finaleMode === 'crew') {
      this.holeSize = Math.max(0.05, this.holeSize - sdt * 0.12);
    }
    if (Math.floor(this.time * 8) !== this.lastPaint) {
      this.lastPaint = Math.floor(this.time * 8);
      this.paintHole();
    }

    // cast
    for (const c of this.cast.values()) {
      c.avatar.update(dt, this.time);
      if (c.revealed) {
        if (c.popT != null) {
          c.popT += sdt;
          const p = Math.min(1, c.popT / 0.5);
          c.model.scale.setScalar(p < 1 ? 1.3 * Math.sin((p * Math.PI) / 2) : 1);
          if (p >= 1) c.popT = null;
        }
        animateRoleModel(c.model, this.time);
      }
      if (c.dead) {
        c.deathT += sdt;
        const p = Math.min(1, c.deathT / 1.6);
        const obj = c.revealed ? c.model : c.avatar.body;
        if (c.deathAnim === 'airlock') {
          obj.position.copy(c.pos).add(new THREE.Vector3(0, p * 2, -p * 6));
          obj.rotation.x = p * 6;
          if (p >= 1) c.deathAnim = 'ghost';
        } else {
          obj.position.y = -p * 0.3;
        }
        if (p >= 1 || c.deathAnim === 'ghost') {
          obj.position.copy(c.pos).setY(0.4 + Math.sin(this.time * 2) * 0.1);
          obj.rotation.x = 0;
          obj.traverse((o) => {
            if (o.material && !o.material.userData.ghosted) {
              o.material = o.material.clone();
              o.material.transparent = true;
              o.material.opacity = 0.35;
              o.material.userData.ghosted = true;
            }
          });
        }
      }
      if (this.finaleMode === 'crew' && c.team === 'crew' && c.revealed) c.model.position.y = Math.abs(Math.sin(this.time * 5 + c.pos.x)) * 0.8;
      if (this.finaleMode === 'evil' && c.finalRole === 'parasite' && c.revealed) c.model.scale.setScalar(Math.min(2.6, 1 + (this.stepTime || 0) * 0.3));
    }

    // beams
    for (const f of this.fx) {
      f.t += sdt;
      const p = Math.min(1, f.t / f.dur);
      f.orb.position.copy(f.curve.getPoint(p));
      f.tube.material.opacity = Math.max(0, 0.9 - Math.max(0, f.t - f.dur) * 0.6);
      if (p >= 1 && !f.hit) {
        f.hit = true;
        this.cast.get(f.toId)?.avatar.burst(16, f.color, 2.5);
        f.orb.visible = false;
      }
      if (f.t > f.dur + 1.6) {
        f.tube.removeFromParent();
        f.orb.removeFromParent();
        f.dead = true;
      }
    }
    this.fx = this.fx.filter((f) => !f.dead);

    this.world.renderer.render(this.scene, this.camera);
  }
}

// The silly end-of-game awards (worked out by the server from what happened).
function awardsBox(s) {
  const list = s.awards || [];
  if (!list.length) return null;
  const name = (id) => s.players.find((p) => p.id === id)?.name || '?';
  return el('div', { className: 'awards' },
    el('h3', {}, '🏅 Awards'),
    el('div', { className: 'award-grid' }, ...list.map((a) => el('div', { className: 'award' },
      el('span', { className: 'ico' }, a.icon),
      el('div', {}, el('b', {}, a.title), el('div', {}, name(a.id)), el('small', { className: 'hint' }, a.why)),
    ))),
  );
}

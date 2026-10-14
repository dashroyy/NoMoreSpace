// Ruler of the Galaxy: the arena. In the middle, the Galactic Core: a half-shattered Dyson sphere round a
// churning plasma star, with the Omni-Throne dock floating above it. For big games, the Binary Pulsar: two
// neutron stars spinning round each other with sweeping beams. Round the outside, the asteroid belt of the Outer
// Rim, where the contenders who are not in power wait their turn, over a holographic star chart.
import * as THREE from 'three';
import { loadModels, model } from '../../world/assets.js';
import { glowTexture } from './galaxy.js';

export const RIM_RADIUS = 13;
export const CORE_DOCK = new THREE.Vector3(0, 5.1, 0);
export const PULSAR_AT = new THREE.Vector3(8.6, 0.6, -6.2);
export const PULSAR_DOCK = new THREE.Vector3(8.6, 3.4, -6.2);

// where the i-th of n contenders waits on the Rim (the first one nearest the camera, the rest round the circle)
export function rimPosition(i, n) {
  const a = Math.PI / 2 + (i / n) * Math.PI * 2 + (n % 2 ? 0 : Math.PI / n);
  return new THREE.Vector3(Math.cos(a) * RIM_RADIUS, 0, Math.sin(a) * RIM_RADIUS);
}

const NOISE = `
  vec3 hash3(vec3 p){ p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6))); return -1.0 + 2.0*fract(sin(p)*43758.5453123); }
  float noise(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); vec3 u = f*f*(3.0-2.0*f);
    return mix(mix(mix(dot(hash3(i+vec3(0,0,0)),f-vec3(0,0,0)), dot(hash3(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),
                   mix(dot(hash3(i+vec3(0,1,0)),f-vec3(0,1,0)), dot(hash3(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
               mix(mix(dot(hash3(i+vec3(0,0,1)),f-vec3(0,0,1)), dot(hash3(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),
                   mix(dot(hash3(i+vec3(0,1,1)),f-vec3(0,1,1)), dot(hash3(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z); }
  float fbm(vec3 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }
`;

// a churning ball of plasma (the Core's star, the Star-Eater, the pulsars)
export function plasmaMaterial(hot = '#fff3c4', mid = '#ffb800', cool = '#ff2a6d', speed = 0.25) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHot: { value: new THREE.Color(hot) }, uMid: { value: new THREE.Color(mid) }, uCool: { value: new THREE.Color(cool) }, uSpeed: { value: speed }, uBoost: { value: 1 } },
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: `uniform float uTime; uniform vec3 uHot; uniform vec3 uMid; uniform vec3 uCool; uniform float uSpeed; uniform float uBoost; varying vec3 vP; varying vec3 vN; varying vec3 vV; ${NOISE}
      void main(){
        vec3 p = normalize(vP) * 2.2;
        float n = fbm(p + vec3(uTime*uSpeed, uTime*uSpeed*0.6, -uTime*uSpeed*0.8));
        float n2 = fbm(p*2.5 - vec3(uTime*uSpeed*1.3));
        float k = clamp(0.55 + n*0.9 + n2*0.35, 0.0, 1.0);
        vec3 col = mix(uCool, uMid, smoothstep(0.2, 0.6, k));
        col = mix(col, uHot, smoothstep(0.62, 0.95, k));
        float rim = pow(1.0 - max(dot(vN, vV), 0.0), 2.0);
        col += uMid * rim * 0.9;
        gl_FragColor = vec4(col * (1.25 + 0.4*uBoost), 1.0);
      }`,
  });
}

// the holographic star chart under everything
function chartTexture() {
  const s = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.translate(s / 2, s / 2);
  g.strokeStyle = 'rgba(0,240,255,0.55)';
  for (let r = 60; r < s / 2; r += 52) {
    g.lineWidth = r % 208 < 52 ? 2.2 : 1;
    g.globalAlpha = 0.25 + (r % 208 < 52 ? 0.35 : 0);
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.globalAlpha = 0.18;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * 60, Math.sin(a) * 60);
    g.lineTo(Math.cos(a) * (s / 2), Math.sin(a) * (s / 2));
    g.stroke();
  }
  // tick marks on the outer ring
  g.globalAlpha = 0.5;
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const r1 = s / 2 - 14;
    const r2 = s / 2 - (i % 5 ? 22 : 34);
    g.beginPath();
    g.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    g.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// a thin glowing band (rings round the Core, pedestals under the ships)
export function glowRing(radius, tube, color, opacity = 0.9) {
  return new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 96), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
}

export class Arena {
  constructor(stage) {
    this.stage = stage;
    const scene = stage.scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.mood = { flare: 0, nebula: 0, collapse: 0, summit: 0, wormhole: 0 };
    this.time = 0;

    // light: a warm star in the middle, a cool fill, a violet rim
    this.coreLight = new THREE.PointLight(0xffc56b, 900, 120, 1.7);
    this.coreLight.position.set(0, 1, 0);
    this.root.add(this.coreLight);
    this.root.add(new THREE.HemisphereLight(0x7fa8ff, 0x24103a, 0.55));
    const rim = new THREE.DirectionalLight(0x9f7bff, 1.4);
    rim.position.set(-20, 14, -18);
    this.root.add(rim);
    const key = new THREE.DirectionalLight(0xbfe9ff, 1.1);
    key.position.set(16, 22, 24);
    this.root.add(key);

    // the star chart
    this.chart = new THREE.Mesh(new THREE.CircleGeometry(24, 96), new THREE.MeshBasicMaterial({ map: chartTexture(), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.chart.rotation.x = -Math.PI / 2;
    this.chart.position.y = -1.6;
    this.root.add(this.chart);
    // the circle the Rim ships sit on
    this.rimRing = glowRing(RIM_RADIUS, 0.03, 0x00f0ff, 0.35);
    this.rimRing.rotation.x = Math.PI / 2;
    this.rimRing.position.y = -0.9;
    this.root.add(this.rimRing);

    this.buildCore();
    this.buildPulsar();
    this.buildBelt();
    stage.onFrame((dt, t) => this.update(dt, t));
  }

  // ---------------------------------------------------------------------------
  buildCore() {
    const core = new THREE.Group();
    this.core = core;
    this.root.add(core);
    // the star
    this.starMat = plasmaMaterial();
    this.star = new THREE.Mesh(new THREE.SphereGeometry(1.75, 64, 48), this.starMat);
    core.add(this.star);
    this.corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(256, 'rgba(255,236,190,1)', 'rgba(255,140,60,0.35)'), color: 0xffc070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.corona.scale.setScalar(11);
    core.add(this.corona);

    // the Dyson sphere: a lattice of struts, with some of its plating still in place and some drifting away
    const shell = new THREE.Group();
    this.shell = shell;
    core.add(shell);
    const ico = new THREE.IcosahedronGeometry(3.1, 1);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(ico), new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending }));
    shell.add(edges);
    const nonIndexed = ico.toNonIndexed();
    const pos = nonIndexed.attributes.position;
    const plate = new THREE.MeshStandardMaterial({ color: 0x1a2244, metalness: 0.85, roughness: 0.35, emissive: 0x0a1630, side: THREE.DoubleSide, flatShading: true });
    const seam = new THREE.MeshBasicMaterial({ color: 0xff2a6d, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending });
    this.fragments = [];
    for (let f = 0; f < pos.count / 3; f++) {
      const keep = (f * 7) % 10 < 5; // about half the plating survives
      const drift = (f * 13) % 17 === 0; // a few pieces float away
      if (!keep && !drift) continue;
      const a = new THREE.Vector3().fromBufferAttribute(pos, f * 3);
      const b = new THREE.Vector3().fromBufferAttribute(pos, f * 3 + 1);
      const c = new THREE.Vector3().fromBufferAttribute(pos, f * 3 + 2);
      const centre = a.clone().add(b).add(c).divideScalar(3);
      const shrink = (v) => v.clone().sub(centre).multiplyScalar(0.86).add(centre);
      const g = new THREE.BufferGeometry().setFromPoints([shrink(a), shrink(b), shrink(c)]);
      g.computeVertexNormals();
      const tri = new THREE.Mesh(g, plate);
      const s = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([shrink(a), shrink(b), shrink(c)]), seam);
      const piece = new THREE.Group();
      piece.add(tri, s);
      if (drift) {
        piece.userData.drift = centre.clone().normalize();
        piece.userData.phase = f;
        this.fragments.push(piece);
      }
      shell.add(piece);
    }
    // rings
    this.rings = [];
    const ringDefs = [
      [4.3, 0.045, 0x00f0ff, [Math.PI / 2, 0, 0.25], 0.22],
      [4.9, 0.03, 0xff2a6d, [Math.PI / 2.4, 0.5, 0], -0.15],
      [5.6, 0.025, 0xb537f2, [Math.PI / 1.8, -0.4, 0.3], 0.1],
    ];
    for (const [r, t, c, rot, spin] of ringDefs) {
      const ring = glowRing(r, t, c, 0.8);
      ring.rotation.set(...rot);
      ring.userData.spin = spin;
      core.add(ring);
      this.rings.push(ring);
      // little lights running round each ring
      for (let i = 0; i < 6; i++) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: c }));
        const a = (i / 6) * Math.PI * 2;
        dot.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
        ring.add(dot);
      }
    }

    // the Omni-Throne dock, floating above the sphere
    const dock = new THREE.Group();
    dock.position.copy(CORE_DOCK).setY(CORE_DOCK.y - 1.1);
    this.dock = dock;
    this.root.add(dock);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.5, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0x241a08, metalness: 0.9, roughness: 0.3, emissive: 0x3a2400, flatShading: true }));
    dock.add(pad);
    this.dockRing = glowRing(1.95, 0.06, 0xffb800, 0.95);
    this.dockRing.rotation.x = Math.PI / 2;
    this.dockRing.position.y = 0.12;
    dock.add(this.dockRing);
    // the Dominion broadcast: a column of light while someone holds the Core
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.6, 60, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb800, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.beam.position.y = 30;
    dock.add(this.beam);
    this.beamLevel = 0;
    this.beamGoal = 0;
  }

  buildPulsar() {
    const g = new THREE.Group();
    g.position.copy(PULSAR_AT);
    this.pulsar = g;
    this.root.add(g);
    this.pulsarStars = [];
    for (let i = 0; i < 2; i++) {
      const s = new THREE.Group();
      const mat = plasmaMaterial('#ffffff', '#9fe8ff', '#3a7dff', 0.6);
      s.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 24), mat));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x8fd8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.setScalar(3.4);
      s.add(glow);
      // the lighthouse beams
      for (const dir of [1, -1]) {
        const beam = new THREE.Mesh(new THREE.ConeGeometry(0.5, 14, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        beam.position.y = dir * 7;
        beam.rotation.x = dir > 0 ? Math.PI : 0;
        s.add(beam);
      }
      s.rotation.z = 0.5;
      s.userData.mat = mat;
      g.add(s);
      this.pulsarStars.push(s);
    }
    const pad = glowRing(1.4, 0.05, 0x9fe8ff, 0.9);
    pad.rotation.x = Math.PI / 2;
    pad.position.y = PULSAR_DOCK.y - PULSAR_AT.y - 1.0;
    g.add(pad);
    this.pulsarPad = pad;
    g.scale.setScalar(0.001);
    this.pulsarScale = 0;
    this.pulsarGoal = 0;
  }

  buildBelt() {
    this.belt = new THREE.Group();
    this.root.add(this.belt);
    // dust: a ring of faint points
    const pos = [];
    for (let i = 0; i < 2600; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 17 + Math.random() * 7;
      pos.push(Math.cos(a) * r, (Math.random() - 0.5) * 1.6, Math.sin(a) * r);
    }
    const dust = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)), new THREE.PointsMaterial({ color: 0x8fa6d6, size: 0.12, transparent: true, opacity: 0.6, depthWrite: false }));
    this.belt.add(dust);
    // rocks: the Kenney Space Kit models, scattered round the ring (rough placeholders until they load)
    const ids = ['rock_largeA', 'rock_largeB', 'meteor_detailed', 'meteor', 'rocks_smallA'];
    const place = (geoms) => {
      const per = this.stage.small ? 24 : 46;
      geoms.forEach(({ geometry, material }, k) => {
        const mesh = new THREE.InstancedMesh(geometry, material, per);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const e = new THREE.Euler();
        for (let i = 0; i < per; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = 17.5 + Math.random() * 6.5;
          e.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
          q.setFromEuler(e);
          const s = (0.35 + Math.random() * 1.1) * (k === 4 ? 1.4 : 1);
          m.compose(new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 2.2, Math.sin(a) * r), q, new THREE.Vector3(s, s, s));
          mesh.setMatrixAt(i, m);
        }
        this.belt.add(mesh);
      });
    };
    loadModels(ids.map((id) => `ruler/${id}`)).then(() => {
      const geoms = [];
      for (const id of ids) {
        const m = model(`ruler/${id}`);
        m?.traverse((o) => {
          if (o.isMesh && geoms.length < 8) geoms.push({ geometry: o.geometry, material: o.material });
        });
      }
      if (geoms.length) place(geoms);
      else place([{ geometry: new THREE.DodecahedronGeometry(0.6, 0), material: new THREE.MeshStandardMaterial({ color: 0x5b4a6b, roughness: 1, flatShading: true }) }]);
    });
  }

  // ---------------------------------------------------------------------------
  setPulsar(open) {
    this.pulsarGoal = open ? 1 : 0;
  }

  setCoreHeld(held) {
    this.beamGoal = held ? 1 : 0;
  }

  // a pulse of light when someone docks (or the Core is hit)
  pulse(power = 1) {
    this.pulseLevel = Math.max(this.pulseLevel || 0, power);
  }

  setMood(anomaly) {
    for (const k of Object.keys(this.mood)) this.mood[k] = 0;
    if (anomaly && anomaly in this.mood) this.mood[anomaly] = 1;
  }

  update(dt, t) {
    this.time = t;
    this.pulseLevel = Math.max(0, (this.pulseLevel || 0) - dt * 1.2);
    const flare = this.mood.flare;
    this.starMat.uniforms.uTime.value = t;
    this.starMat.uniforms.uBoost.value = 1 + flare * 1.5 + this.pulseLevel * 2;
    this.star.scale.setScalar(1 + Math.sin(t * 1.3) * 0.02 + flare * 0.18 + this.pulseLevel * 0.1);
    this.corona.scale.setScalar(11 + Math.sin(t * 0.8) * 0.6 + flare * 7 + this.pulseLevel * 4);
    this.coreLight.intensity = 900 + flare * 900 + this.pulseLevel * 900;
    this.shell.rotation.y += dt * 0.05;
    this.shell.rotation.x = Math.sin(t * 0.05) * 0.2;
    for (const f of this.fragments) {
      const k = Math.sin(t * 0.3 + f.userData.phase) * 0.5 + 0.5;
      f.position.copy(f.userData.drift).multiplyScalar(0.4 + k * 1.2);
      f.rotation.x = t * 0.1 + f.userData.phase;
    }
    for (const r of this.rings) r.rotation.z += dt * r.userData.spin * (1 + this.mood.wormhole * 6);
    this.dockRing.rotation.z += dt * 0.6;
    this.beamLevel += (this.beamGoal - this.beamLevel) * Math.min(1, dt * 2.5);
    this.beam.material.opacity = this.beamLevel * (0.16 + Math.sin(t * 3) * 0.04) + this.pulseLevel * 0.25;
    this.beam.scale.x = this.beam.scale.z = 0.6 + this.beamLevel * 0.4 + this.pulseLevel * 0.5;

    // the pulsar grows in (or collapses away)
    this.pulsarScale += (this.pulsarGoal - this.pulsarScale) * Math.min(1, dt * 1.8);
    this.pulsar.visible = this.pulsarScale > 0.01;
    this.pulsar.scale.setScalar(Math.max(0.001, this.pulsarScale));
    this.pulsarStars.forEach((s, i) => {
      const a = t * 1.6 + i * Math.PI;
      s.position.set(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9);
      s.rotation.y = t * 4 + i;
      s.userData.mat.uniforms.uTime.value = t;
    });
    this.pulsarPad.rotation.z -= dt * 0.8;

    this.belt.rotation.y += dt * (0.01 + this.mood.collapse * 0.05);
    this.chart.material.opacity = 0.55 + Math.sin(t * 0.6) * 0.06;
    this.chart.rotation.z += dt * 0.004;
  }
}

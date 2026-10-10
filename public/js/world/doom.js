// The disasters under the ship, as real 3D scenery that animates:
//   classic   🕳️ a black hole: a glowing, swirling accretion disk with an event horizon,
//             a bright photon ring, jets and a stream of matter spiralling in.
//   carnival  🤡 the Great Grin: a scary clown planet with a cracked white face, hollow
//             glowing eyes that follow the camera, and an endless fanged grin.
//   outbreak  🦠 the Bloom: a vast, scary gas cloud, layered and turning, with a glowing
//             heart, tendrils, drifting spores, lightning, and an eye looking out of it.
//
// Each piece is built about 1 unit across and scaled up as the ship nears its end. Only
// the one for the current script is shown. Everything is unlit (it glows), so the ship's
// lights do not change how it looks. Pieces animate in update(); flash() kicks them.
import * as THREE from 'three';
import { cloudCanvas, CLOUD_TINTS, CLOUD_DARK, eyeCanvas, glowCanvas, ringCanvas, grinFaceCanvas, grinGlowCanvases, planetCanvas, FACE, CAP_RADIUS } from './doom-art.js';

const tex = (canvas) => {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};
const rand = (a, b) => a + Math.random() * (b - a);

const additive = (map, color = 0xffffff, opacity = 1) => new THREE.SpriteMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const dotCanvas = glowCanvas('rgba(255,255,255,1)', 'rgba(255,255,255,0.35)', 64);

// ---------------------------------------------------------------------------
// 🕳️ The black hole
// ---------------------------------------------------------------------------
const DISK_VERT = `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const DISK_FRAG = `
precision highp float;
varying vec2 vP;
uniform float uTime;
uniform float uHeat;
uniform float uFlare;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}
// one layer of turbulent gas, sheared by the disk's differential rotation
float layer(float ang, float r, float spin) {
  float a2 = ang - spin;
  vec2 q = vec2(cos(a2), sin(a2)) * r;
  float n = fbm(q * 1.5 + 3.0);
  float streak = fbm(vec2(a2 * 2.0 + 1.7, r * 3.2));
  float hot = pow(streak, 2.0) * 2.2;
  // two bright spiral arms through the turbulence
  float arms = pow(0.5 + 0.5 * sin(2.0 * a2 - r * 2.6), 3.0);
  return clamp(0.1 + 1.3 * n * streak + hot * 0.4 + arms * 0.55, 0.0, 1.6);
}
void main() {
  float r = length(vP);
  float ang = atan(vP.y, vP.x);
  float rin = 1.45, rout = 4.7;
  float t = clamp((r - rin) / (rout - rin), 0.0, 1.0);
  // matter closer in orbits much faster. Two copies of the pattern take turns being sheared and
  // then reset, so the disk keeps swirling instead of winding up into tight rings.
  float s = uTime * (1.0 + uHeat * 0.7);
  float T = 26.0;
  float p0 = fract(s / T);
  float p1 = fract(s / T + 0.5);
  float w0 = 1.0 - abs(2.0 * p0 - 1.0);
  float w1 = 1.0 - abs(2.0 * p1 - 1.0);
  float k = T * 1.5 / pow(r, 1.5);
  float dens = w0 * layer(ang, r, p0 * k) + w1 * layer(ang, r, p1 * k);
  vec3 hot = vec3(1.0, 0.82, 0.55);
  vec3 orange = vec3(1.0, 0.45, 0.1);
  vec3 red = vec3(0.55, 0.05, 0.04);
  vec3 violet = vec3(0.2, 0.03, 0.3);
  vec3 col = mix(hot, orange, smoothstep(0.0, 0.2, t));
  col = mix(col, red, smoothstep(0.18, 0.55, t));
  col = mix(col, violet, smoothstep(0.5, 1.0, t));
  // the side of the disk moving towards us is brighter
  float doppler = 0.35 + 1.2 * max(0.0, cos(ang - 0.7));
  float inner = pow(1.0 - t, 2.0);
  float alpha = dens * (0.18 + inner * 1.5) * doppler;
  alpha *= smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.6, 1.0, t));
  alpha *= 0.7 + uHeat * 0.6 + uFlare * 1.2;
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}`;

class BlackHole3D {
  constructor({ lowFx }) {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.tilt = new THREE.Group();
    this.tilt.rotation.x = 0.22; // nearly face-on: the disk must stay below the ship however big it gets
    this.group.add(this.tilt);
    this.flare = 0;
    this.heat = 0;

    // the accretion disk
    this.diskMat = new THREE.ShaderMaterial({
      vertexShader: DISK_VERT, fragmentShader: DISK_FRAG, side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uHeat: { value: 0 }, uFlare: { value: 0 } },
    });
    const disk = new THREE.Mesh(new THREE.RingGeometry(1.45, 4.8, 180, 14), this.diskMat);
    disk.rotation.x = -Math.PI / 2;
    this.tilt.add(disk);

    // the event horizon: pure black, in front of the disk behind it and behind the disk in front
    this.tilt.add(new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false })));

    // matter falling in: a stream of sparks spiralling towards the horizon
    this.n = lowFx ? 220 : 480;
    this.pos = new Float32Array(this.n * 3);
    this.col = new Float32Array(this.n * 3);
    this.r = new Float32Array(this.n);
    this.a = new Float32Array(this.n);
    this.v = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) this.respawn(i, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.1, map: tex(dotCanvas), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.points.frustumCulled = false;
    this.tilt.add(this.points);

    // the photon ring, a glow and a wide dark halo, always facing the camera
    this.ring = new THREE.Sprite(additive(tex(ringCanvas(512)), 0xffffff, 1));
    this.ring.scale.setScalar(3.6);
    this.group.add(this.ring);
    this.glow = new THREE.Sprite(additive(tex(glowCanvas('rgba(255,150,70,0.8)', 'rgba(210,50,70,0.25)', 256)), 0xffffff, 0.85));
    this.glow.scale.setScalar(6);
    this.group.add(this.glow);
  }

  respawn(i, first = false) {
    this.r[i] = first ? rand(1.3, 6) : rand(4.5, 6.2);
    this.a[i] = rand(0, Math.PI * 2);
    this.v[i] = rand(0.7, 1.3);
  }

  setProgress(p) {
    this.heat = p;
    this.diskMat.uniforms.uHeat.value = p;
  }

  flash() {
    this.flare = 1; // the disk flares up (the ship has just been tugged closer)
  }

  update(t, dt, k) {
    this.diskMat.uniforms.uTime.value = t;
    this.flare = Math.max(0, this.flare - dt * 0.7);
    this.diskMat.uniforms.uFlare.value = this.flare;
    this.tilt.rotation.z = Math.sin(t * 0.07) * 0.12; // the axis precesses, slowly
    const pulse = 1 + Math.sin(t * 1.3) * 0.03 + this.flare * 0.15;
    this.ring.scale.setScalar(3.6 * pulse);
    this.ring.material.opacity = 0.85 + this.flare * 0.15;
    this.glow.material.opacity = 0.3 + this.heat * 0.3 + this.flare * 0.3;
    // infalling matter
    this.points.material.size = 0.09 * k;
    const speed = 0.6 + this.heat * 0.9;
    for (let i = 0; i < this.n; i++) {
      const r = this.r[i];
      this.a[i] += (1.6 / Math.pow(r, 1.5)) * dt * (1 + this.heat * 0.5);
      this.r[i] -= (0.18 + 0.9 / (r * r)) * dt * speed * this.v[i];
      if (this.r[i] < 1.12) this.respawn(i);
      const rr = this.r[i];
      const heatT = Math.min(1, Math.max(0, (rr - 1.1) / 3.5));
      this.pos[i * 3] = Math.cos(this.a[i]) * rr;
      this.pos[i * 3 + 1] = Math.sin(i * 12.9 + t * 0.4) * 0.04 * rr;
      this.pos[i * 3 + 2] = Math.sin(this.a[i]) * rr;
      this.col[i * 3] = 1;
      this.col[i * 3 + 1] = 0.35 + (1 - heatT) * 0.6;
      this.col[i * 3 + 2] = 0.1 + (1 - heatT) * 0.7;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// 🤡 The Great Grin
// ---------------------------------------------------------------------------
const PLANET_VERT = `
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
void main() {
  vUv = uv;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const PLANET_FRAG = `
precision highp float;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
uniform sampler2D uMap;
uniform float uRim;
void main() {
  vec3 n = normalize(vN);
  vec3 base = texture2D(uMap, vUv).rgb;
  float lit = clamp(dot(n, normalize(vec3(-0.35, 0.55, 0.75))), 0.0, 1.0);
  float rim = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 2.4);
  vec3 col = base * (0.2 + 0.95 * lit) + vec3(0.9, 0.08, 0.1) * rim * uRim;
  gl_FragColor = vec4(col, 1.0);
}`;

const CAP_R = CAP_RADIUS; // radius of the face on the planet (the planet's radius is 1)

class Grin3D {
  constructor({ lowFx }) {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.flare = 0;
    this.heat = 0;
    // the planet, turned so that the face on its front looks straight up
    this.body = new THREE.Group();
    this.body.rotation.x = 0;
    this.group.add(this.body);
    const planetTex = tex(planetCanvas(512));
    planetTex.wrapS = THREE.RepeatWrapping;
    this.planetMat = new THREE.ShaderMaterial({ vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG, uniforms: { uMap: { value: planetTex }, uRim: { value: 0.7 } } });
    this.body.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), this.planetMat));

    // the face: a cap on top of the planet, mapped straight down like a decal
    const capGeo = new THREE.SphereGeometry(1.006, 72, 24, 0, Math.PI * 2, 0, Math.asin(CAP_R / 1.006));
    const posA = capGeo.attributes.position;
    const uv = capGeo.attributes.uv;
    for (let i = 0; i < posA.count; i++) uv.setXY(i, 0.5 + posA.getX(i) / (2 * CAP_R), 0.5 - posA.getZ(i) / (2 * CAP_R));
    const mat = (map, blending, opacity = 1) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false, blending, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.face = new THREE.Mesh(capGeo, mat(tex(grinFaceCanvas(1024)), THREE.NormalBlending));
    const glowLayers = grinGlowCanvases(1024);
    this.maw = new THREE.Mesh(capGeo, mat(tex(glowLayers.maw), THREE.AdditiveBlending, 0.8));
    this.ember = new THREE.Mesh(capGeo, mat(tex(glowLayers.ember), THREE.AdditiveBlending, 0.8));
    this.body.add(this.face, this.maw, this.ember);

    // slit pupils in the glowing eyes: they follow the camera
    this.pupils = [-1, 1].map((s) => {
      const p = new THREE.Mesh(new THREE.CircleGeometry(1, 16), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      p.scale.set(0.014, 0.048, 1);
      p.rotation.x = -Math.PI / 2;
      this.body.add(p);
      p.userData.home = new THREE.Vector2(s * FACE.eye.x * 0.96 * CAP_R, FACE.eye.y * 0.96 * CAP_R); // x, z on the planet
      return p;
    });

    // a red haze round the planet, and a ring of broken debris
    this.halo = new THREE.Sprite(additive(tex(glowCanvas('rgba(255,50,40,0.55)', 'rgba(120,10,90,0.22)', 256)), 0xffffff, 0.9));
    this.halo.scale.setScalar(4.2);
    this.group.add(this.halo);
    this.ringTilt = new THREE.Group();
    this.ringTilt.rotation.set(0.5, 0, 0.25);
    this.group.add(this.ringTilt);
    this.rn = lowFx ? 120 : 280;
    this.rpos = new Float32Array(this.rn * 3);
    this.rcol = new Float32Array(this.rn * 3);
    this.rdata = [];
    for (let i = 0; i < this.rn; i++) {
      this.rdata.push({ r: rand(1.45, 2.4), a: rand(0, Math.PI * 2), s: rand(0.15, 0.35), y: rand(-0.05, 0.05) });
      const dark = rand(0.35, 0.9);
      this.rcol.set([dark, dark * 0.45, dark * 0.5], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.rpos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.rcol, 3));
    this.debris = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.04, map: tex(dotCanvas), vertexColors: true, transparent: true, depthWrite: false, fog: false }));
    this.debris.frustumCulled = false;
    this.ringTilt.add(this.debris);
    this.camDir = new THREE.Vector2();
  }

  setProgress(p) {
    this.heat = p;
    this.planetMat.uniforms.uRim.value = 0.6 + p * 0.8;
  }

  flash() {
    this.flare = 1; // the eyes flare and the head jerks: it laughs
  }

  update(t, dt, k, camera, origin) {
    this.flare = Math.max(0, this.flare - dt * 1.1);
    // breathing, and a slow, wrong head tilt; a laugh makes it jerk
    const breathe = 1 + Math.sin(t * 0.9) * 0.012 + this.flare * 0.02;
    this.body.scale.setScalar(breathe);
    this.body.rotation.y = Math.sin(t * 0.21) * 0.07 + Math.sin(t * 31) * 0.012 * this.flare;
    this.body.rotation.z = Math.sin(t * 0.17 + 1) * 0.03;
    // the mouth's fire flickers; the eyes, nose and cracks beat like a heart
    const beat = Math.pow(Math.max(0, Math.sin(t * 2.1)), 6) * 0.5 + Math.pow(Math.max(0, Math.sin(t * 2.1 - 0.5)), 6) * 0.3;
    this.maw.material.opacity = 0.55 + this.heat * 0.3 + 0.18 * Math.sin(t * 9) * Math.sin(t * 3.7) + this.flare * 0.4;
    this.ember.material.opacity = 0.5 + this.heat * 0.2 + beat * 0.6 + this.flare * 0.5;
    this.halo.material.opacity = 0.55 + this.heat * 0.35 + beat * 0.25 + this.flare * 0.3;
    this.halo.scale.setScalar(4.2 * (1 + beat * 0.03));
    // the pupils follow the camera
    if (camera) {
      this.camDir.set(camera.position.x - origin.x, camera.position.z - origin.z);
      const d = Math.min(1, this.camDir.length() / 150);
      this.camDir.normalize().multiplyScalar(0.03 * d + 0.004);
    }
    for (const p of this.pupils) {
      const h = p.userData.home;
      const x = h.x + this.camDir.x + Math.sin(t * 0.6) * 0.004;
      const z = h.y + this.camDir.y + Math.cos(t * 0.5) * 0.003;
      const y = Math.sqrt(Math.max(0, 1.01 * 1.01 - x * x - z * z)) + 0.002;
      p.position.set(x, y, z);
      p.scale.y = 0.048 * (1 - this.flare * 0.4);
    }
    // the debris ring turns
    this.debris.material.size = 0.035 * k;
    for (let i = 0; i < this.rn; i++) {
      const d = this.rdata[i];
      d.a += d.s * dt / d.r;
      this.rpos[i * 3] = Math.cos(d.a) * d.r;
      this.rpos[i * 3 + 1] = d.y;
      this.rpos[i * 3 + 2] = Math.sin(d.a) * d.r;
    }
    this.debris.geometry.attributes.position.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// 🦠 The Bloom
// ---------------------------------------------------------------------------
class Bloom3D {
  constructor({ lowFx }) {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.flashAmt = 0;
    this.heat = 0;
    // layers of turning gas, one above another so the cloud has depth when the camera moves
    this.layers = [];
    const count = lowFx ? 7 : 12;
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < count; i++) {
      const layer = new THREE.Group();
      layer.position.y = (i - count / 2) * 0.06;
      // most layers are heavy, murky gas that has body (and hides what is behind it); every third one glows
      const glows = i % 3 === 2;
      const tint = glows ? CLOUD_TINTS[(i / 3 | 0) % CLOUD_TINTS.length] : CLOUD_DARK[i % CLOUD_DARK.length];
      const mat = new THREE.MeshBasicMaterial({ map: tex(cloudCanvas(1 + (i % 4) * 5, tint, 256, glows ? 'veins' : 'smoke')), transparent: true, opacity: 0.55, blending: glows ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const plane = new THREE.Mesh(geo, mat);
      plane.rotation.x = -Math.PI / 2;
      const size = 7 - i * (3.4 / count) + (i % 3) * 0.4;
      plane.scale.setScalar(size);
      layer.add(plane);
      layer.rotation.y = i * 0.8;
      this.group.add(layer);
      this.layers.push({ layer, mat, speed: (i % 2 ? 1 : -1) * (0.03 + (i % 5) * 0.015), base: glows ? 0.7 : 0.8, size, plane, glows });
    }
    // the heart of the cloud, and an eye looking out of it
    this.core = new THREE.Sprite(additive(tex(glowCanvas('rgba(255,255,170,1)', 'rgba(150,255,70,0.4)', 256)), 0xffffff, 0.7));
    this.core.scale.setScalar(2.2);
    this.group.add(this.core);
    this.eye = new THREE.Sprite(additive(tex(eyeCanvas(256)), 0xffffff, 0));
    this.eye.scale.setScalar(1.7);
    this.eye.position.y = 0.2;
    this.group.add(this.eye);
    // wavy tendrils reaching out of it
    this.tendrils = [];
    const tcount = lowFx ? 8 : 14;
    for (let i = 0; i < tcount; i++) {
      const a = (i / tcount) * Math.PI * 2;
      const pts = [];
      for (let k = 0; k <= 10; k++) {
        const u = k / 10;
        const rr = 1.1 + u * (2.6 + (i % 3) * 0.6);
        const w = Math.sin(u * 5 + i) * 0.35 * u;
        pts.push(new THREE.Vector3(Math.cos(a) * rr - Math.sin(a) * w, Math.sin(u * 4 + i) * 0.06, Math.sin(a) * rr + Math.cos(a) * w));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.045, 5, false), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x9aff4a : 0x6bffd8, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      const tip = new THREE.Sprite(additive(tex(dotCanvas), 0xd9ff9a, 0.9));
      tip.scale.setScalar(0.22);
      tip.position.copy(curve.getPoint(1));
      const g = new THREE.Group();
      g.add(tube, tip);
      this.group.add(g);
      this.tendrils.push({ g, ph: i * 0.9, sp: 0.04 + (i % 4) * 0.02 });
    }
    // spores drifting outward
    this.sn = lowFx ? 120 : 280;
    this.spos = new Float32Array(this.sn * 3);
    this.scol = new Float32Array(this.sn * 3);
    this.sdata = [];
    for (let i = 0; i < this.sn; i++) {
      this.sdata.push({ a: rand(0, Math.PI * 2), r: rand(1, 5), v: rand(0.08, 0.3), y: rand(-0.25, 0.25), w: rand(0, 6) });
      const c = new THREE.Color([0x9bff4a, 0x6bffd8, 0xd18bff][i % 3]);
      this.scol.set([c.r, c.g, c.b], i * 3);
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(this.spos, 3));
    sgeo.setAttribute('color', new THREE.BufferAttribute(this.scol, 3));
    this.spores = new THREE.Points(sgeo, new THREE.PointsMaterial({ size: 0.07, map: tex(dotCanvas), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.spores.frustumCulled = false;
    this.group.add(this.spores);
    // lightning: bolts of little glowing bars from the core out into the cloud
    this.bolts = [];
    const boltMat = new THREE.MeshBasicMaterial({ color: 0xeaffd8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.boltMat = boltMat;
    const bar = new THREE.BoxGeometry(1, 0.025, 0.045);
    for (let b = 0; b < 3; b++) {
      const bolt = new THREE.Group();
      const segs = [];
      for (let i = 0; i < 12; i++) {
        const m = new THREE.Mesh(bar, boltMat);
        bolt.add(m);
        segs.push(m);
      }
      bolt.visible = false;
      this.group.add(bolt);
      this.bolts.push({ bolt, segs });
    }
    this.boltLife = 0;
    this.eyeOpen = 0;
    this.nextEye = 6;
  }

  setProgress(p) {
    this.heat = p;
  }

  // a flash of lightning: the whole cloud lights up from inside
  flash() {
    this.flashAmt = 1;
    this.boltLife = 0.28;
    for (const { bolt, segs } of this.bolts) {
      let a = rand(0, Math.PI * 2);
      let x = 0;
      let z = 0;
      const total = rand(2.4, 4.6);
      segs.forEach((m, i) => {
        a += rand(-0.55, 0.55);
        const len = total / segs.length;
        const nx = x + Math.cos(a) * len;
        const nz = z + Math.sin(a) * len;
        m.position.set((x + nx) / 2, rand(-0.03, 0.03), (z + nz) / 2);
        m.scale.x = len * 1.08;
        m.rotation.y = -Math.atan2(nz - z, nx - x);
        x = nx;
        z = nz;
        void i;
      });
      bolt.visible = true;
    }
  }

  update(t, dt, k) {
    this.flashAmt = Math.max(0, this.flashAmt - dt * 2.4);
    const beat = Math.pow(Math.max(0, Math.sin(t * 1.7)), 8) * 0.55 + Math.pow(Math.max(0, Math.sin(t * 1.7 - 0.6)), 8) * 0.3;
    const boost = 1 + this.heat * 0.5 + this.flashAmt * 1.6;
    for (const l of this.layers) {
      l.layer.rotation.y += l.speed * dt * (1 + this.heat);
      l.layer.rotation.x = Math.sin(t * 0.1 + l.size) * 0.04;
      l.mat.opacity = Math.min(1, l.base * (l.glows ? boost : 1 + this.flashAmt * 0.3) * (0.9 + beat * 0.25));
      l.plane.scale.setScalar(l.size * (1 + Math.sin(t * 0.4 + l.size * 2) * 0.03 + beat * 0.015));
    }
    this.core.scale.setScalar(2.2 * (1 + beat * 0.2 + this.flashAmt * 0.7));
    this.core.material.opacity = Math.min(1, 0.55 + beat * 0.3 + this.flashAmt * 0.4);
    // the eye opens every so often, looks around, and closes again
    this.nextEye -= dt;
    if (this.nextEye <= 0) {
      this.eyeOpen = 6;
      this.nextEye = rand(10, 24) - this.heat * 6;
    }
    this.eyeOpen = Math.max(0, this.eyeOpen - dt);
    const open = this.eyeOpen > 0 ? Math.min(1, this.eyeOpen, 6 - this.eyeOpen) : 0;
    this.eye.material.opacity = Math.min(1, open * (0.5 + this.heat * 0.5));
    this.eye.position.x = Math.sin(t * 0.7) * 0.15;
    this.eye.position.z = Math.cos(t * 0.5) * 0.1;
    for (const td of this.tendrils) {
      td.g.rotation.y = Math.sin(t * td.sp * 3 + td.ph) * 0.18;
      td.g.scale.setScalar(1 + Math.sin(t * 0.6 + td.ph) * 0.06);
    }
    this.spores.material.size = 0.06 * k;
    for (let i = 0; i < this.sn; i++) {
      const s = this.sdata[i];
      s.r += s.v * dt;
      if (s.r > 5.6) {
        s.r = rand(0.9, 1.6);
        s.a = rand(0, Math.PI * 2);
      }
      s.a += 0.03 * dt;
      this.spos[i * 3] = Math.cos(s.a) * s.r + Math.sin(t * 0.7 + s.w) * 0.12;
      this.spos[i * 3 + 1] = s.y + Math.sin(t * 0.5 + s.w) * 0.05;
      this.spos[i * 3 + 2] = Math.sin(s.a) * s.r + Math.cos(t * 0.6 + s.w) * 0.12;
    }
    this.spores.geometry.attributes.position.needsUpdate = true;
    // lightning flickers out
    if (this.boltLife > 0) {
      this.boltLife -= dt;
      this.boltMat.opacity = this.boltLife > 0 ? (Math.sin(this.boltLife * 90) > -0.3 ? 0.95 : 0.15) : 0;
      if (this.boltLife <= 0) for (const b of this.bolts) b.bolt.visible = false;
    }
  }
}

// ---------------------------------------------------------------------------
// The doom under the ship
// ---------------------------------------------------------------------------
export class Doom {
  constructor(scene, { lowFx = false } = {}) {
    this.group = new THREE.Group();
    this.group.position.set(10, -140, -60);
    scene.add(this.group);
    this.parts = {
      classic: new BlackHole3D({ lowFx }),
      carnival: new Grin3D({ lowFx }),
      outbreak: new Bloom3D({ lowFx }),
    };
    for (const part of Object.values(this.parts)) this.group.add(part.group);
    this.script = 'classic';
    this.progress = 0;
    this.k = 37;
    this.parts.classic.group.visible = true;
    this.world = new THREE.Vector3();
  }

  setScript(id) {
    this.script = this.parts[id] ? id : 'classic';
    for (const [key, part] of Object.entries(this.parts)) part.group.visible = key === this.script;
    this.setProgress(this.progress);
  }

  // how big it is: it grows as the ship nears its end. It sinks as it grows, so that
  // however big it gets, it stays below the ship.
  setProgress(p) {
    this.progress = p;
    const flat = this.script === 'outbreak'; // the Bloom is a flat cloud; the others are round
    this.k = flat ? 37 + p * 153 : 30 + p * 170;
    this.group.scale.setScalar(this.k);
    this.group.position.y = -105 - this.k * (flat ? 0.45 : 1.0);
    this.parts[this.script].setProgress(p);
  }

  // kick it: the black hole flares, the grin laughs, the Bloom throws lightning
  flash() {
    this.parts[this.script].flash();
  }

  update(t, dt, camera) {
    this.group.getWorldPosition(this.world);
    this.parts[this.script].update(t, dt, this.k, camera, this.world);
  }
}

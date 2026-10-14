// Ruler of the Galaxy: the universe around the arena. Sector Zero sits where two spiral galaxies collide: the
// Milky Way spreads out under the arena, Andromeda tilts across the sky, and there are nebulae, twinkling stars
// and a couple of planets drifting in the distance. Everything here is made of particles and shaders.
import * as THREE from 'three';

let seed = 7;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;

// a soft round dot, for points and glows
export function glowTexture(size = 128, inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,0.35)') {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.25, mid);
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// a wispy cloud for nebulae
function cloudTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 90; i++) {
    const x = size / 2 + gauss() * size * 0.22;
    const y = size / 2 + gauss() * size * 0.22;
    const r = 18 + rnd() * 60;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(255,255,255,${0.05 + rnd() * 0.08})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const POINT_VERT = `
  uniform float uSize;
  uniform float uTime;
  attribute float aScale;
  attribute vec3 aColor;
  attribute float aTwinkle;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.75 + 0.25 * sin(uTime * (0.6 + aTwinkle * 2.0) + aTwinkle * 40.0);
    gl_PointSize = min(uSize * aScale * tw * (300.0 / -mv.z), 7.0);
    vColor = aColor;
  }`;
const POINT_FRAG = `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a = pow(a, 1.8);
    gl_FragColor = vec4(vColor * a, a);
  }`;

function pointsMaterial(size) {
  return new THREE.ShaderMaterial({
    uniforms: { uSize: { value: size }, uTime: { value: 0 } },
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function pointCloud(positions, colors, scales, size) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('aScale', new THREE.Float32BufferAttribute(scales, 1));
  const tw = new Float32Array(scales.length);
  for (let i = 0; i < tw.length; i++) tw[i] = rnd();
  geo.setAttribute('aTwinkle', new THREE.BufferAttribute(tw, 1));
  const pts = new THREE.Points(geo, pointsMaterial(size));
  pts.frustumCulled = false;
  return pts;
}

// A spiral galaxy: arms of stars swirling out from a bright bulge.
function spiralGalaxy({ count, radius, arms, spin, inner, outer, thickness = 0.06 }) {
  const pos = [];
  const col = [];
  const scale = [];
  const ci = new THREE.Color(inner);
  const co = new THREE.Color(outer);
  const pink = new THREE.Color('#ff5fa8');
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const r = Math.pow(rnd(), 1.7) * radius;
    const arm = ((i % arms) / arms) * Math.PI * 2;
    const twist = (r / radius) * spin;
    const spread = Math.pow(rnd(), 2.6) * (0.25 + (r / radius) * 0.9) * radius * 0.28;
    const a = arm + twist + gauss() * 0.22;
    const x = Math.cos(a) * r + gauss() * spread;
    const z = Math.sin(a) * r + gauss() * spread;
    const y = gauss() * radius * thickness * (1 - r / radius * 0.7);
    pos.push(x, y, z);
    tmp.copy(ci).lerp(co, Math.min(1, r / (radius * 0.8)));
    if (rnd() < 0.08 && r > radius * 0.25) tmp.lerp(pink, 0.6); // star-forming regions
    tmp.multiplyScalar(0.28 + rnd() * 0.42);
    col.push(tmp.r, tmp.g, tmp.b);
    scale.push(r < radius * 0.12 ? 1.6 + rnd() * 1.8 : 0.4 + rnd() * 1.2);
  }
  const group = new THREE.Group();
  const pts = pointCloud(pos, col, scale, radius * 0.006);
  group.add(pts);
  // the bright bulge in the middle
  const bulge = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(256, 'rgba(255,240,215,1)', 'rgba(255,190,120,0.3)'), color: 0xffe2b8, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
  bulge.scale.setScalar(radius * 0.4);
  group.add(bulge);
  group.userData.points = pts;
  return group;
}

// A planet: a striped, lit sphere with a glowing atmosphere (and rings, if it has them)
function planet({ radius, colors, ring = false, light }) {
  const group = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  for (let y = 0; y < 256; y++) {
    const band = Math.sin(y * 0.09 + Math.sin(y * 0.031) * 3) * 0.5 + 0.5;
    const col = new THREE.Color(colors[0]).lerp(new THREE.Color(colors[1]), band).lerp(new THREE.Color(colors[2]), rnd() * 0.25);
    g.fillStyle = `#${col.getHexString()}`;
    g.fillRect(0, y, 512, 1);
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,255,255,${rnd() * 0.08})`;
    g.beginPath();
    g.ellipse(rnd() * 512, rnd() * 256, 20 + rnd() * 60, 3 + rnd() * 6, 0, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 }));
  group.add(body);
  // atmosphere: brighter at the rim
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.06, 48, 32),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(colors[3] || colors[1]) } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uColor; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), 3.0); gl_FragColor = vec4(uColor * f * 1.6, f); }',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    }),
  );
  group.add(atmo);
  if (ring) {
    const rc = document.createElement('canvas');
    rc.width = 256;
    rc.height = 4;
    const rg = rc.getContext('2d');
    for (let x = 0; x < 256; x++) {
      rg.fillStyle = `rgba(230,210,255,${(Math.sin(x * 0.4) * 0.5 + 0.5) * 0.5 * (x > 20 && x < 245 ? 1 : 0)})`;
      rg.fillRect(x, 0, 1, 4);
    }
    const rt = new THREE.CanvasTexture(rc);
    const geo = new THREE.RingGeometry(radius * 1.4, radius * 2.3, 96, 1);
    // map the strip of texture from the inside of the ring to the outside
    const p = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const d = Math.hypot(p.getX(i), p.getY(i));
      uv.setXY(i, (d - radius * 1.4) / (radius * 0.9), 0.5);
    }
    const ringMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: rt, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    ringMesh.rotation.x = Math.PI / 2.3;
    group.add(ringMesh);
  }
  void light;
  return group;
}

export class Universe {
  constructor(stage) {
    this.stage = stage;
    const scene = stage.scene;
    const small = stage.small;
    this.root = new THREE.Group();
    scene.add(this.root);

    // the sky: thousands of stars in every direction
    {
      const pos = [];
      const col = [];
      const scale = [];
      const tints = ['#ffffff', '#cfe3ff', '#fff1c9', '#ffd6e8', '#d6fff9'].map((h) => new THREE.Color(h));
      for (let i = 0; i < (small ? 3500 : 7000); i++) {
        const u = rnd() * 2 - 1;
        const a = rnd() * Math.PI * 2;
        const r = 900 + rnd() * 500;
        const s = Math.sqrt(1 - u * u);
        pos.push(Math.cos(a) * s * r, u * r, Math.sin(a) * s * r);
        const t = tints[Math.floor(rnd() * tints.length)];
        col.push(t.r, t.g, t.b);
        scale.push(rnd() < 0.04 ? 2.4 + rnd() * 2 : 0.6 + rnd() * 1.1);
      }
      this.sky = pointCloud(pos, col, scale, 7);
      this.root.add(this.sky);
    }

    // the Milky Way, spread out under the arena
    this.milkyway = spiralGalaxy({ count: small ? 14000 : 30000, radius: 340, arms: 4, spin: 5.2, inner: '#fff1d6', outer: '#5a7dff' });
    this.milkyway.position.set(0, -170, 0);
    this.milkyway.rotation.set(0.08, 0, 0.04);
    this.root.add(this.milkyway);

    // Andromeda, colliding with it, tilted across the sky
    this.andromeda = spiralGalaxy({ count: small ? 7000 : 15000, radius: 230, arms: 2, spin: 4.2, inner: '#ffe9f4', outer: '#b45cff', thickness: 0.05 });
    this.andromeda.position.set(-380, 140, -720);
    this.andromeda.rotation.set(1.15, 0.3, 0.55);
    this.root.add(this.andromeda);

    // nebulae: big soft clouds of colour
    const cloud = cloudTexture();
    const colours = ['#7b2cff', '#00c8ff', '#ff2a6d', '#3a1cff', '#00ffa3'];
    this.nebulae = new THREE.Group();
    for (let i = 0; i < 26; i++) {
      const m = new THREE.SpriteMaterial({ map: cloud, color: colours[i % colours.length], transparent: true, opacity: 0.16 + rnd() * 0.14, depthWrite: false, blending: THREE.AdditiveBlending });
      const s = new THREE.Sprite(m);
      const a = rnd() * Math.PI * 2;
      const r = 260 + rnd() * 380;
      s.position.set(Math.cos(a) * r, -60 + rnd() * 260, Math.sin(a) * r);
      s.scale.setScalar(160 + rnd() * 260);
      s.material.rotation = rnd() * Math.PI;
      this.nebulae.add(s);
    }
    this.root.add(this.nebulae);

    // planets, far out
    this.giant = planet({ radius: 26, colors: ['#3b2a7a', '#c77dff', '#2a1a55', '#b98cff'], ring: true });
    this.giant.position.set(230, 40, -260);
    this.giant.rotation.z = 0.3;
    this.root.add(this.giant);
    this.moon = planet({ radius: 9, colors: ['#0f4c5c', '#7fe7ff', '#d6fbff', '#7ff0ff'] });
    this.moon.position.set(-170, 26, -150);
    this.root.add(this.moon);

    this.mats = [this.sky.material, this.milkyway.userData.points.material, this.andromeda.userData.points.material];
    stage.onFrame((dt, t) => this.update(dt, t));
  }

  update(dt, t) {
    for (const m of this.mats) m.uniforms.uTime.value = t;
    this.milkyway.rotation.y += dt * 0.006;
    this.andromeda.rotation.y += dt * 0.009;
    this.giant.rotation.y += dt * 0.02;
    this.moon.rotation.y += dt * 0.05;
    this.nebulae.rotation.y += dt * 0.002;
  }
}

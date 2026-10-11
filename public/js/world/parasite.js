// 🦑 The Parasite, as it looks when it is finally unmasked: a great pulsing mass of veined flesh that
// has burst out of its host's spacesuit (the cracked helmet lies at its feet, in the player's colour).
// A ring of eight heavy tentacles holds it up; four thin whips lash overhead; a big yellow eye looks
// out over a vertical, tooth-lined maw, with a pack of smaller eyes that all follow you round the
// room. Everything breathes: the body swells and ripples, the jaws work, the tentacles ripple in
// waves and slime drips from its mouth.
//
// Built from code (shapes and canvas textures); animated by tick(t, camera), which the end-game reveal
// calls every frame through animateRoleModel.
import * as THREE from 'three';
import { fbm } from './doom-art.js';

const rand = (seed) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

// the skin: mottled purple flesh and, in its own texture, a web of glowing veins
let skin = null;
function skinTextures() {
  if (skin) return skin;
  const S = 256;
  const make = () => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    return c;
  };
  const color = make();
  const glow = make();
  const cg = color.getContext('2d');
  const img = cg.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = fbm(x / 34, y / 34, 7, 4);
      const m = fbm(x / 9, y / 9, 19, 3);
      const v = 0.45 + n * 0.8 + (m - 0.5) * 0.25;
      const i = (y * S + x) * 4;
      img.data[i] = 56 + v * 100;
      img.data[i + 1] = 14 + v * 28;
      img.data[i + 2] = 92 + v * 78;
      img.data[i + 3] = 255;
    }
  }
  cg.putImageData(img, 0, 0);
  const gg = glow.getContext('2d');
  gg.fillStyle = '#000';
  gg.fillRect(0, 0, S, S);
  const r = rand(5);
  // veins: random walks that fork, drawn on both textures (dark on the skin, bright in the glow map)
  const vein = (x, y, a, steps, width) => {
    gg.beginPath();
    cg.beginPath();
    gg.moveTo(x, y);
    cg.moveTo(x, y);
    for (let i = 0; i < steps; i++) {
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a) * 7;
      y += Math.sin(a) * 7;
      gg.lineTo(x, y);
      cg.lineTo(x, y);
      if (r() < 0.07 && width > 1) vein(x, y, a + (r() < 0.5 ? 0.8 : -0.8), Math.floor(steps * 0.5), width * 0.6);
    }
    gg.lineWidth = width * 2.4;
    gg.strokeStyle = 'rgba(255,40,140,0.35)';
    gg.stroke();
    gg.lineWidth = width;
    gg.strokeStyle = 'rgba(255,170,230,1)';
    gg.stroke();
    cg.lineWidth = width * 1.4;
    cg.strokeStyle = 'rgba(40,6,50,0.55)';
    cg.stroke();
  };
  for (let i = 0; i < 16; i++) vein(r() * S, r() * S, r() * 6.28, 22 + Math.floor(r() * 14), 3.2);
  const make2 = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  skin = { map: make2(color, true), glow: make2(glow, true) };
  return skin;
}

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,90,200,0.9)');
  grad.addColorStop(0.4, 'rgba(160,40,200,0.35)');
  grad.addColorStop(1, 'rgba(90,0,160,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

const FLESH = () => new THREE.MeshStandardMaterial({ map: skinTextures().map, emissiveMap: skinTextures().glow, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.38, metalness: 0.05 });

// an eye that looks outwards: a yellow ball, a green-gold iris, a slit pupil and an upper lid that blinks
function makeEye(radius, flesh) {
  const eye = new THREE.Group();
  eye.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), new THREE.MeshStandardMaterial({ color: 0xf2f0b8, emissive: 0x4a4210, emissiveIntensity: 0.5, roughness: 0.25 })));
  const iris = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.66, 20), new THREE.MeshStandardMaterial({ color: 0xa8e030, emissive: 0x6aa000, emissiveIntensity: 0.9, roughness: 0.3 }));
  iris.position.z = radius * 0.97;
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.5, 14), new THREE.MeshBasicMaterial({ color: 0x050008 }));
  pupil.scale.set(0.3, 1, 1);
  pupil.position.z = 0.002;
  iris.add(pupil);
  eye.add(iris);
  // the lid: a flesh-coloured cap that swings down over the eye
  const lidPivot = new THREE.Group();
  const lid = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.07, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), flesh);
  lid.rotation.x = Math.PI / 2; // the dome faces forward
  lidPivot.add(lid);
  eye.add(lidPivot);
  eye.userData = { iris, lidPivot, radius };
  return eye;
}

export function buildParasite(accent = 0xffffff) {
  const root = new THREE.Group();
  const flesh = FLESH();
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c0c44, emissive: 0x240838, emissiveIntensity: 0.5, roughness: 0.4 });
  const tentacle = new THREE.MeshStandardMaterial({ map: skinTextures().map, emissiveMap: skinTextures().glow, emissive: 0xffffff, emissiveIntensity: 0.35, color: 0x9a7ab4, roughness: 0.3, metalness: 0.08 });
  const slime = new THREE.MeshStandardMaterial({ color: 0xc8ff5a, emissive: 0x9ad020, emissiveIntensity: 1.2, transparent: true, opacity: 0.85, roughness: 0.15 });

  // ---------- the body: a swollen, breathing mass ----------
  const bodyGeo = new THREE.SphereGeometry(0.82, 44, 32);
  const base = bodyGeo.attributes.position.array.slice();
  const bodyMesh = new THREE.Mesh(bodyGeo, flesh);
  const body = new THREE.Group();
  body.position.y = 1.05;
  body.scale.set(1, 1.1, 1);
  body.add(bodyMesh);
  root.add(body);

  // dorsal spines
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i - 4) * 0.34;
    const spine = new THREE.Mesh(new THREE.ConeGeometry(0.07 + (i % 3) * 0.02, 0.34 + (i % 4) * 0.08, 6), dark);
    const dir = new THREE.Vector3(Math.sin(a) * 0.55, 0.55 + (i % 3) * 0.12, Math.cos(a) * 0.7).normalize();
    spine.position.copy(dir).multiplyScalar(0.84);
    spine.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    body.add(spine);
  }

  // ---------- the maw: a tall, toothy mouth on a short fleshy snout, low on the front ----------
  const MW = 0.27; // half width and half height of the mouth
  const MH = 0.36;
  const maw = new THREE.Group();
  maw.position.set(0, -0.34, 0.6);
  body.add(maw);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.18, 0.3, 28, 1, true), new THREE.MeshStandardMaterial({ map: skinTextures().map, emissiveMap: skinTextures().glow, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.4, side: THREE.DoubleSide }));
  tube.rotation.x = Math.PI / 2;
  tube.scale.set(MW, 1, MH);
  tube.position.z = 0.15;
  maw.add(tube);
  const cavity = new THREE.Mesh(new THREE.CircleGeometry(1, 26), new THREE.MeshBasicMaterial({ color: 0x1a0210 }));
  cavity.scale.set(MW * 1.1, MH * 1.1, 1);
  cavity.position.z = 0.06;
  maw.add(cavity);
  const throat = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff3a6a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  throat.scale.set(0.4, 0.62, 1);
  throat.position.z = 0.09;
  maw.add(throat);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(1, 0.2, 10, 30), flesh);
  lip.scale.set(MW, MH, 0.3);
  lip.position.z = 0.3;
  maw.add(lip);
  // two rows of teeth round the rim, all pointing in; the upper and lower halves move apart when it opens
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xf6f0d8, roughness: 0.3, emissive: 0x302810, emissiveIntensity: 0.4 });
  const upper = new THREE.Group();
  const lower = new THREE.Group();
  maw.add(upper, lower);
  for (let i = 0; i < 20; i++) {
    const phi = (i / 20) * Math.PI * 2 + 0.1;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.028 + (i % 2) * 0.01, 0.13 + (i % 3) * 0.04, 5), toothMat);
    tooth.position.set(Math.cos(phi) * MW * 0.92, Math.sin(phi) * MH * 0.92, 0.3);
    tooth.rotation.z = phi + Math.PI / 2; // the cone's tip points at the middle of the mouth
    (Math.sin(phi) > 0 ? upper : lower).add(tooth);
  }
  // a long tongue of a tentacle
  const tongue = [];
  let tongueParent = maw;
  for (let i = 0; i < 6; i++) {
    const joint = new THREE.Group();
    joint.position.set(0, i === 0 ? -0.1 : 0, i === 0 ? 0.12 : 0.17);
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.05 - i * 0.006, 0.055 - i * 0.006, 0.19, 7), new THREE.MeshStandardMaterial({ color: 0xd24a78, emissive: 0x6a1030, emissiveIntensity: 0.6, roughness: 0.3 }));
    seg.rotation.x = Math.PI / 2;
    seg.position.z = 0.085;
    joint.add(seg);
    tongueParent.add(joint);
    tongueParent = joint;
    tongue.push(joint);
  }

  // ---------- eyes: one big, a crowd of small ones ----------
  const eyes = [];
  const placeEye = (dir, radius) => {
    const d = new THREE.Vector3(...dir).normalize();
    const eye = makeEye(radius, flesh);
    eye.position.copy(d).multiplyScalar(0.8);
    eye.lookAt(d.clone().multiplyScalar(3));
    body.add(eye);
    eyes.push(eye);
    return eye;
  };
  placeEye([0, 0.55, 1], 0.3); // the big one
  [[-0.7, 0.55, 0.7, 0.14], [0.72, 0.5, 0.68, 0.15], [-1.0, 0.05, 0.35, 0.12], [1.0, 0.1, 0.3, 0.11], [-0.4, 1.0, 0.45, 0.11], [0.45, 1.0, 0.4, 0.1], [-0.62, -0.05, 0.9, 0.095], [0.62, 0, 0.88, 0.095]].forEach(([x, y, z, r]) => placeEye([x, y, z], r));

  // ---------- tentacles: eight heavy ones round the base, four thin whips overhead ----------
  const tentacles = [];
  const segGeo = Array.from({ length: 10 }, (_, i) => new THREE.CylinderGeometry(0.16 * (1 - (i + 1) / 11) + 0.02, 0.16 * (1 - i / 11) + 0.02, 0.34, 8));
  const whipGeo = Array.from({ length: 12 }, (_, i) => new THREE.CylinderGeometry(0.06 * (1 - (i + 1) / 13) + 0.008, 0.06 * (1 - i / 13) + 0.008, 0.3, 6));
  const tip = new THREE.MeshStandardMaterial({ color: 0xff7ad0, emissive: 0xff2a9a, emissiveIntensity: 1.6 });
  const chain = (parent, geos, lean, spread, phase, speed, curl) => {
    const joints = [];
    let p = parent;
    geos.forEach((geo, i) => {
      const joint = new THREE.Group();
      joint.position.y = i === 0 ? 0 : geos[i - 1].parameters.height;
      const seg = new THREE.Mesh(geo, tentacle);
      seg.position.y = geo.parameters.height / 2;
      joint.add(seg);
      p.add(joint);
      p = joint;
      joints.push(joint);
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(geos.at(-1).parameters.radiusBottom * 2.2, 8, 6), tip);
    bulb.position.y = geos.at(-1).parameters.height;
    p.add(bulb);
    return { joints, lean, spread, phase, speed, curl };
  };
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const arm = new THREE.Group();
    arm.position.set(Math.cos(a) * 0.55, 0.5, Math.sin(a) * 0.55);
    arm.rotation.y = Math.PI / 2 - a; // local +x now points outwards
    const tilt = new THREE.Group();
    tilt.rotation.z = -0.95;
    arm.add(tilt);
    root.add(arm);
    tentacles.push({ ...chain(tilt, segGeo, -0.95, 0.2, i * 0.8, 1.7, 0.14), tilt });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.7;
    const arm = new THREE.Group();
    arm.position.set(Math.cos(a) * 0.4, 1.7, Math.sin(a) * 0.4);
    arm.rotation.y = Math.PI / 2 - a;
    const tilt = new THREE.Group();
    tilt.rotation.z = -0.55;
    arm.add(tilt);
    root.add(arm);
    tentacles.push({ ...chain(tilt, whipGeo, -0.55, 0.3, i * 1.7, 2.6, 0.2), tilt });
  }

  // ---------- what is left of the host: a cracked helmet in the player's colour ----------
  const helmet = new THREE.Group();
  helmet.position.set(0.85, 0.2, 1.0);
  helmet.rotation.set(0.15, -0.6, 0.55);
  helmet.add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.64), new THREE.MeshStandardMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.38, roughness: 0.08, metalness: 0.3 })));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.045, 8, 24), new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.5, roughness: 0.4 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.12;
  helmet.add(ring);
  for (const [x, y, rz] of [[0.08, 0.16, 0.6], [-0.1, 0.1, -0.9], [0.0, 0.26, 0.1]]) {
    const crack = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.2, 0.012), new THREE.MeshBasicMaterial({ color: 0x0a1018 }));
    crack.position.set(x, y, 0.28);
    crack.rotation.z = rz;
    helmet.add(crack);
  }
  root.add(helmet);
  // a ring in the player's colour on the ground, so it is still clear who this was
  const mark = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.03, 6, 40), new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.5 }));
  mark.rotation.x = Math.PI / 2;
  mark.position.y = 0.04;
  root.add(mark);

  // ---------- glow, spores and slime ----------
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  aura.scale.setScalar(5);
  aura.position.y = 1.1;
  root.add(aura);
  const spores = new THREE.Group();
  spores.position.y = 1.1;
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.04 + (i % 3) * 0.015, 6, 5), new THREE.MeshBasicMaterial({ color: [0xff7ad0, 0xc8ff5a, 0xb48cff][i % 3] }));
    s.position.set(Math.cos(i * 0.9) * (1.5 + (i % 4) * 0.2), ((i * 37) % 10) / 10 - 0.2, Math.sin(i * 0.9) * (1.5 + (i % 4) * 0.2));
    spores.add(s);
  }
  root.add(spores);
  const drips = [0, 1, 2].map((i) => {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), slime);
    d.scale.set(0.8, 1.4, 0.8);
    root.add(d);
    return { d, ph: i / 3 };
  });

  root.scale.setScalar(1.2);
  const nextBlink = eyes.map((_, i) => 1.5 + i * 0.7);
  const blinkAt = eyes.map(() => -10);
  const anim = {
    parasite: true,
    // t: the reveal's clock; camera: where everyone is looking from (the eyes follow it)
    tick(t, camera) {
      // breathing, rippling body
      const pos = bodyGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        const y = base[i * 3 + 1];
        const z = base[i * 3 + 2];
        const k = 1 + 0.03 * Math.sin(t * 1.6 + y * 5 + x * 3) + 0.02 * Math.sin(t * 2.7 + z * 7 - y * 2) + 0.012 * Math.sin(t * 6 + x * 9 + z * 9);
        pos.setXYZ(i, x * k, y * k, z * k);
      }
      pos.needsUpdate = true;
      bodyGeo.computeVertexNormals();
      flesh.emissiveIntensity = 0.5 + 0.22 * Math.sin(t * 2.1) + 0.12 * Math.pow(Math.max(0, Math.sin(t * 1.3)), 6);
      aura.material.opacity = 0.45 + 0.15 * Math.sin(t * 2.1);
      // the jaws work, and every so often it opens wide
      const wide = Math.pow(Math.max(0, Math.sin(t * 0.7)), 4);
      const open = 0.1 + 0.1 * Math.sin(t * 3.1) + wide * 0.55;
      const grow = 1 + open * 0.75; // the whole mouth stretches, lips and all
      lip.scale.y = MH * grow;
      tube.scale.z = MH * grow;
      cavity.scale.y = MH * 1.1 * grow;
      upper.position.y = MH * 0.92 * (grow - 1);
      lower.position.y = -MH * 0.92 * (grow - 1);
      throat.material.opacity = 0.4 + wide * 0.5;
      tongue.forEach((j, i) => {
        j.rotation.x = Math.sin(t * 3 + i * 0.7) * 0.28 + 0.12;
        j.rotation.y = Math.sin(t * 2.2 + i * 0.5) * 0.3;
      });
      // tentacles ripple in waves
      for (const tc of tentacles) {
        tc.joints.forEach((j, i) => {
          j.rotation.z = -tc.curl + Math.sin(t * tc.speed + tc.phase + i * 0.55) * tc.spread * 0.55;
          j.rotation.x = Math.sin(t * tc.speed * 0.8 + tc.phase * 1.3 + i * 0.45) * tc.spread;
        });
        tc.tilt.rotation.z = tc.lean + Math.sin(t * tc.speed * 0.6 + tc.phase) * 0.08;
      }
      // the eyes follow the camera, and blink
      eyes.forEach((eye, i) => {
        const { iris, lidPivot, radius } = eye.userData;
        if (camera) {
          const local = eye.worldToLocal(camera.position.clone());
          const dir = local.normalize();
          iris.position.set(THREE.MathUtils.clamp(dir.x, -0.45, 0.45) * radius * 0.5, THREE.MathUtils.clamp(dir.y, -0.45, 0.45) * radius * 0.5, radius * 0.97);
        }
        if (t > nextBlink[i]) {
          blinkAt[i] = t;
          nextBlink[i] = t + 2 + ((i * 7 + Math.floor(t)) % 5);
        }
        const since = t - blinkAt[i];
        const shut = since >= 0 && since < 0.22 ? Math.sin((since / 0.22) * Math.PI) : 0;
        lidPivot.rotation.x = -1.5 * (1 - Math.max(shut, 0.12)); // mostly open: a slight scowl
      });
      // glowing spores drift round it; slime drips from the maw
      spores.rotation.y = t * 0.45;
      spores.position.y = 1.1 + Math.sin(t * 0.8) * 0.1;
      for (const { d, ph } of drips) {
        const u = (t * 0.5 + ph) % 1;
        d.position.set(0, 0.74 - u * 0.65, 1.12 + 0.1 * u);
        d.scale.set(0.8, 1.4 - u * 0.5, 0.8).multiplyScalar(1 - u * 0.4);
      }
    },
  };
  root.userData.anim = anim;
  return root;
}

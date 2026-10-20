// The newer Demons' secret models (see server/roles-demons.js), built from simple shapes like the Parasite,
// the Carrier and the Cuckoo. Each stands on a ring in the player's suit colour, and moves a little.
import * as THREE from 'three';
import { outlineEach } from './outline.js';

const m = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...extra });
const glow = (color, intensity = 1.5) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity });

function part(group, geometry, material, x = 0, y = 0, z = 0, rot = null, scale = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (rot) mesh.rotation.set(...rot);
  if (scale) mesh.scale.set(...scale);
  group.add(mesh);
  return mesh;
}

// the ring in the player's colour that every revealed character stands on
const ring = (g, accent, r = 0.78) => part(g, new THREE.TorusGeometry(r, 0.05, 6, 28), m(accent, { emissive: accent, emissiveIntensity: 0.5 }), 0, 0.06, 0, [Math.PI / 2, 0, 0]);

const BUILDERS = {
  // 🌀 a little black hole: a pitch-black ball inside a blazing, spinning disc, with wreckage spiralling in
  singularity(g, accent, anim) {
    const core = new THREE.Group();
    core.position.y = 1.25;
    g.add(core);
    part(core, new THREE.SphereGeometry(0.5, 28, 20), m(0x000000, { roughness: 1 }));
    part(core, new THREE.TorusGeometry(0.55, 0.035, 8, 40), glow(0xfff1c8, 3)); // the photon ring
    const disc = new THREE.Group();
    disc.rotation.set(1.25, 0, 0.25);
    core.add(disc);
    [[0.72, 0.09, 0xffd36b, 2.2], [0.9, 0.1, 0xff8a3a, 1.8], [1.1, 0.09, 0xff4a5a, 1.4], [1.28, 0.06, 0x9a3aff, 1.1]].forEach(([r, t, c, i]) => part(disc, new THREE.TorusGeometry(r, t, 6, 48), glow(c, i), 0, 0, 0, null, [1, 1, 0.25]));
    // bits of ship being pulled in
    const debris = [];
    for (let i = 0; i < 9; i++) {
      const bit = part(core, i % 3 ? new THREE.BoxGeometry(0.1, 0.06, 0.14) : new THREE.TetrahedronGeometry(0.09), m([0x9aa4b8, 0xd7263d, 0xe8e8ef][i % 3], { metalness: 0.6, roughness: 0.4 }));
      bit.userData.seed = i / 9;
      debris.push(bit);
    }
    // a little pedestal of warped deck plating
    part(g, new THREE.CylinderGeometry(0.42, 0.6, 0.18, 18), m(0x2a2f44, { metalness: 0.6, roughness: 0.4 }), 0, 0.1, 0);
    ring(g, accent);
    anim.tick = (t) => {
      disc.rotation.z = 0.25 + t * 1.4;
      core.position.y = 1.25 + Math.sin(t * 1.5) * 0.05;
      for (const bit of debris) {
        const k = (t * 0.18 + bit.userData.seed) % 1; // 0 = far out, 1 = swallowed
        const r = 1.6 * (1 - k) + 0.45;
        const a = bit.userData.seed * 12 + k * 9;
        bit.position.set(Math.cos(a) * r, Math.sin(a * 0.7) * 0.25 * (1 - k), Math.sin(a) * r * 0.45);
        bit.rotation.set(t * 3 + a, t * 2, 0);
        bit.scale.setScalar(Math.max(0.05, 1 - k * k));
      }
    };
  },

  // 🩸 a fat, glistening leech rearing up out of the floor, with a round mouth full of teeth
  leech(g, accent, anim) {
    const skin = m(0x5a0f1e, { roughness: 0.25, metalness: 0.15, emissive: 0x2a0008, emissiveIntensity: 0.4 });
    const belly = m(0x8a2a3a, { roughness: 0.3 });
    const segs = [];
    const N = 10;
    for (let i = 0; i < N; i++) {
      const s = new THREE.Group();
      g.add(s);
      const r = 0.36 - Math.abs(i - 3.5) * 0.028;
      part(s, new THREE.SphereGeometry(r, 16, 12), i % 2 ? skin : belly, 0, 0, 0, null, [1, 0.8, 1]);
      if (i % 2 === 0) part(s, new THREE.TorusGeometry(r * 0.95, 0.025, 6, 18), m(0x2a0008), 0, 0, 0, [Math.PI / 2, 0, 0]);
      segs.push(s);
    }
    // the head: a sucker mouth ringed with teeth, and three beady eyes
    const head = segs[N - 1];
    part(head, new THREE.TorusGeometry(0.2, 0.07, 10, 20), m(0xb83a52, { roughness: 0.3 }), 0, 0.12, 0.12, [-0.9, 0, 0]);
    part(head, new THREE.CircleGeometry(0.18, 18), m(0x120006), 0, 0.15, 0.16, [-0.9, 0, 0]);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const tooth = new THREE.Group();
      tooth.position.set(0, 0.13, 0.13);
      tooth.rotation.x = -0.9;
      part(tooth, new THREE.ConeGeometry(0.03, 0.1, 5), m(0xfff3e0), Math.cos(a) * 0.14, 0.02, Math.sin(a) * 0.14, [Math.PI / 2, 0, -a + Math.PI / 2]);
      head.add(tooth);
    }
    for (let i = 0; i < 3; i++) part(head, new THREE.SphereGeometry(0.04, 8, 6), glow(0xff2e4d, 2.5), (i - 1) * 0.11, 0.2, -0.12 + Math.abs(i - 1) * 0.04);
    // a little puddle where it came up through the deck
    part(g, new THREE.CylinderGeometry(0.75, 0.75, 0.02, 24), m(0x3a0010, { roughness: 0.1, metalness: 0.3 }), 0, 0.02, 0);
    ring(g, accent);
    anim.tick = (t) => {
      segs.forEach((s, i) => {
        const k = i / (N - 1);
        s.position.set(Math.sin(t * 1.6 + k * 3) * 0.18 * k, 0.25 + k * 1.75, Math.sin(k * 2.2) * 0.35 * k + Math.cos(t * 1.2 + k * 2) * 0.08 * k);
        s.scale.setScalar(1 + Math.sin(t * 4 - i) * 0.05);
      });
      head.rotation.x = 0.3 + Math.sin(t * 2) * 0.15;
    };
  },

  // 🔥 a carnival fire eater in a striped costume and a fez, breathing a gout of flame between two torches
  fireeater(g, accent, anim) {
    const skin = m(0xc98a5a);
    // legs, a striped body and arms
    for (const side of [-1, 1]) {
      part(g, new THREE.CylinderGeometry(0.11, 0.09, 0.75, 10), m(0x1a1a2a), side * 0.17, 0.42, 0);
      part(g, new THREE.BoxGeometry(0.2, 0.08, 0.32), m(0x111111), side * 0.17, 0.05, 0.06);
    }
    for (let i = 0; i < 6; i++) part(g, new THREE.CylinderGeometry(0.36 - i * 0.012, 0.37 - i * 0.012, 0.13, 18), m(i % 2 ? 0xffd23f : 0xd7263d), 0, 0.86 + i * 0.13, 0);
    part(g, new THREE.TorusGeometry(0.3, 0.06, 8, 18), m(0xffd23f, { metalness: 0.7, roughness: 0.3 }), 0, 1.65, 0, [Math.PI / 2, 0, 0]); // a gold collar
    const torches = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.42, 1.5, 0);
      arm.rotation.z = -side * 0.7; // raised up and out
      part(arm, new THREE.CylinderGeometry(0.07, 0.06, 0.55, 8), m(0xd7263d), 0, 0.27, 0);
      part(arm, new THREE.SphereGeometry(0.08, 8, 6), skin, 0, 0.58, 0);
      const torch = new THREE.Group();
      torch.position.set(0, 0.6, 0);
      torch.rotation.z = side * 0.7; // held upright
      part(torch, new THREE.CylinderGeometry(0.03, 0.025, 0.5, 6), m(0x6b4a2a), 0, 0.15, 0);
      const flame = part(torch, new THREE.ConeGeometry(0.1, 0.32, 8), glow(0xff8a1a, 2.4), 0, 0.52, 0);
      part(flame, new THREE.ConeGeometry(0.05, 0.18, 8), glow(0xfff1a0, 3), 0, -0.04, 0);
      torches.push(flame);
      arm.add(torch);
      g.add(arm);
    }
    // the head, a fez with a tassel, and a mouth wide open
    const head = new THREE.Group();
    head.position.y = 1.95;
    g.add(head);
    part(head, new THREE.SphereGeometry(0.3, 20, 16), skin);
    part(head, new THREE.CylinderGeometry(0.17, 0.21, 0.26, 16), m(0xb0102a), 0, 0.33, -0.02, [-0.15, 0, 0]);
    part(head, new THREE.CylinderGeometry(0.008, 0.008, 0.22, 4), m(0x111111), 0.12, 0.38, 0, [0, 0, -0.6]);
    part(head, new THREE.SphereGeometry(0.035, 6, 5), m(0x111111), 0.22, 0.29, 0);
    for (const side of [-1, 1]) {
      part(head, new THREE.SphereGeometry(0.06, 10, 8), m(0xffffff), side * 0.11, 0.07, 0.25);
      part(head, new THREE.SphereGeometry(0.03, 8, 6), m(0x111111), side * 0.11, 0.07, 0.31);
      part(head, new THREE.BoxGeometry(0.12, 0.025, 0.02), m(0x2a1a10), side * 0.11, 0.16, 0.27, [0, 0, side * -0.3]); // wicked eyebrows
    }
    part(head, new THREE.BoxGeometry(0.3, 0.025, 0.02), m(0x2a1a10), 0, -0.04, 0.28); // a moustache
    part(head, new THREE.SphereGeometry(0.09, 12, 10), m(0x2a0008), 0, -0.13, 0.25, null, [1.1, 0.9, 0.6]);
    // the plume of fire
    const plume = new THREE.Group();
    plume.position.set(0, -0.13, 0.3);
    plume.rotation.x = -0.75; // up into the air
    head.add(plume);
    const blobs = [];
    for (let i = 0; i < 9; i++) {
      const b = part(plume, new THREE.SphereGeometry(0.06 + i * 0.022, 10, 8), glow([0xfff1a0, 0xffd23f, 0xff8a1a, 0xff4a1a][Math.min(3, i >> 1)], 2.2 - i * 0.15), 0, i * 0.04, 0.12 + i * 0.16);
      blobs.push(b);
    }
    ring(g, accent);
    anim.noOutlineFor = [plume, ...torches];
    anim.tick = (t) => {
      blobs.forEach((b, i) => {
        const s = 1 + Math.sin(t * 14 + i * 1.7) * 0.18;
        b.scale.set(s, s, s);
        b.position.y = i * 0.04 + Math.sin(t * 9 + i) * 0.03;
        b.position.x = Math.sin(t * 7 + i * 0.8) * 0.03 * i;
      });
      plume.scale.setScalar(0.85 + Math.sin(t * 3) * 0.15);
      torches.forEach((f, i) => f.scale.set(1, 1 + Math.sin(t * 12 + i * 2) * 0.2, 1));
      head.rotation.x = -0.25 + Math.sin(t * 3) * 0.05; // head back, breathing fire upwards
    };
  },

  // 🎰 a living slot machine: a grin full of coins, eyes on stalks, a lever arm and three spinning reels
  jackpot(g, accent, anim) {
    const red = m(0xc4102a, { metalness: 0.3, roughness: 0.35 });
    const gold = m(0xffc233, { metalness: 0.85, roughness: 0.25 });
    const body = new THREE.Group();
    body.position.y = 0.4;
    g.add(body);
    part(body, new THREE.BoxGeometry(1.2, 1.3, 0.8), red, 0, 0.75, 0);
    part(body, new THREE.CylinderGeometry(0.4, 0.4, 1.2, 20, 1, false, 0, Math.PI), red, 0, 1.4, 0, [0, 0, Math.PI / 2], [1, 1, 1]); // a rounded top
    part(body, new THREE.BoxGeometry(1.26, 0.08, 0.86), gold, 0, 0.12, 0);
    part(body, new THREE.BoxGeometry(1.26, 0.08, 0.86), gold, 0, 1.4, 0);
    // three reels behind a window
    part(body, new THREE.BoxGeometry(1.0, 0.42, 0.04), m(0x1a0610), 0, 1.02, 0.39);
    const SYMBOLS = [0xd7263d, 0xffffff, 0xffc233, 0x7dff6b, 0xffffff, 0x6cf0ff];
    const reels = [];
    for (let r = 0; r < 3; r++) {
      const reel = new THREE.Group();
      reel.position.set((r - 1) * 0.31, 1.02, 0.18);
      part(reel, new THREE.CylinderGeometry(0.22, 0.22, 0.26, 18), m(0xfff7e0), 0, 0, 0, [0, 0, Math.PI / 2]);
      SYMBOLS.forEach((c, i) => {
        const a = (i / SYMBOLS.length) * Math.PI * 2;
        part(reel, new THREE.SphereGeometry(0.06, 8, 6), c === 0xffffff ? m(0xeeeeee) : glow(c, 1), 0, Math.sin(a) * 0.22, Math.cos(a) * 0.22, null, [1, 1, 0.4]);
      });
      body.add(reel);
      reels.push(reel);
    }
    // the grin: a coin slot full of teeth
    part(body, new THREE.BoxGeometry(0.8, 0.22, 0.04), m(0x14040a), 0, 0.5, 0.39);
    for (let i = 0; i < 7; i++) part(body, new THREE.ConeGeometry(0.05, 0.12, 4), m(0xfff3e0), (i - 3) * 0.11, 0.57, 0.41, [0, 0, Math.PI]);
    const coins = [];
    for (let i = 0; i < 4; i++) coins.push(part(body, new THREE.CylinderGeometry(0.08, 0.08, 0.02, 14), gold, -0.3 + i * 0.2, 0.42, 0.42, [Math.PI / 2, 0, 0]));
    // eyes on stalks, and a flashing light on top
    for (const side of [-1, 1]) {
      part(body, new THREE.CylinderGeometry(0.02, 0.03, 0.35, 6), gold, side * 0.3, 1.95, 0, [0, 0, side * -0.3]);
      part(body, new THREE.SphereGeometry(0.12, 12, 10), m(0xffffff), side * 0.36, 2.12, 0.02);
      part(body, new THREE.SphereGeometry(0.055, 8, 6), m(0x111111), side * 0.36, 2.12, 0.12);
    }
    const lamp = part(body, new THREE.SphereGeometry(0.14, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), glow(0xff2e4d, 2), 0, 1.8, 0);
    // the lever
    const lever = new THREE.Group();
    lever.position.set(0.66, 0.9, 0);
    part(lever, new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), gold, 0, 0.35, 0);
    part(lever, new THREE.SphereGeometry(0.1, 12, 10), m(0xd7263d, { roughness: 0.2 }), 0, 0.72, 0);
    body.add(lever);
    // stubby legs
    for (const side of [-1, 1]) part(g, new THREE.CylinderGeometry(0.1, 0.13, 0.4, 10), gold, side * 0.4, 0.2, 0);
    ring(g, accent, 0.85);
    anim.tick = (t) => {
      reels.forEach((reel, i) => (reel.rotation.x = t * (6 + i * 2.5)));
      lever.rotation.x = Math.max(0, Math.sin(t * 1.4)) * 1.1;
      lamp.material.emissiveIntensity = (t * 3) % 1 < 0.5 ? 2.6 : 0.4;
      lamp.material.color.setHex((t * 1.5) % 2 < 1 ? 0xff2e4d : 0xffd23f);
      lamp.material.emissive.copy(lamp.material.color);
      coins.forEach((c, i) => (c.position.y = 0.42 - ((t * 0.8 + i * 0.25) % 1) * 0.3));
      body.rotation.z = Math.sin(t * 2) * 0.04;
    };
  },

  // 🍄 a fuzzy mound of mould sprouting toadstools, the biggest one with a face, puffing spores
  mould(g, accent, anim) {
    part(g, new THREE.SphereGeometry(0.8, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2), m(0x5f7a4a, { roughness: 1 }), 0, 0.02, 0, null, [1, 0.45, 1]);
    for (let i = 0; i < 14; i++) {
      const a = i * 2.3;
      const r = 0.25 + (i % 4) * 0.13;
      part(g, new THREE.SphereGeometry(0.06 + (i % 3) * 0.025, 8, 6), m([0x9ab85a, 0x6a8a3a, 0xc8d890][i % 3], { roughness: 1 }), Math.cos(a) * r, 0.22 + (i % 2) * 0.05, Math.sin(a) * r);
    }
    const caps = [];
    const toadstool = (x, z, h, r, color, tilt = 0) => {
      const s = new THREE.Group();
      s.position.set(x, 0.2, z);
      s.rotation.z = tilt;
      part(s, new THREE.CylinderGeometry(r * 0.32, r * 0.42, h, 12), m(0xe8e0c8), 0, h / 2, 0);
      const cap = part(s, new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), m(color, { roughness: 0.5 }), 0, h, 0, null, [1, 0.75, 1]);
      part(s, new THREE.CircleGeometry(r * 0.98, 20), m(0xd8c8a8), 0, h + 0.005, 0, [Math.PI / 2, 0, 0]); // the gills
      for (let i = 0; i < 6; i++) {
        const a = i * 1.1;
        const k = 0.5 + (i % 2) * 0.3;
        part(cap, new THREE.SphereGeometry(r * 0.13, 8, 6), m(0xf4ffd8, { emissive: 0xd8ff80, emissiveIntensity: 0.4 }), Math.cos(a) * r * k, Math.sqrt(1 - k * k) * r * 0.98, Math.sin(a) * r * k, null, [1, 0.5, 1]);
      }
      g.add(s);
      caps.push(s);
      return s;
    };
    const big = toadstool(0, 0, 0.95, 0.62, 0x7a2a8a);
    toadstool(-0.5, 0.25, 0.45, 0.28, 0x9ac83a, 0.25);
    toadstool(0.55, 0.2, 0.55, 0.3, 0x5a1a6a, -0.3);
    toadstool(0.3, -0.45, 0.35, 0.22, 0x9ac83a, -0.15);
    toadstool(-0.35, -0.4, 0.3, 0.18, 0x7a2a8a, 0.2);
    // the face on the big stalk
    for (const side of [-1, 1]) part(big, new THREE.SphereGeometry(0.07, 10, 8), glow(0xd8ff3a, 2.4), side * 0.1, 0.62, 0.2);
    part(big, new THREE.TorusGeometry(0.1, 0.025, 6, 14, Math.PI), m(0x2a1a10), 0, 0.42, 0.22, [0, 0, Math.PI]);
    // drifting spores
    const spores = [];
    for (let i = 0; i < 16; i++) {
      const sp = part(g, new THREE.SphereGeometry(0.035, 6, 5), glow(i % 2 ? 0xd8ff3a : 0xc77dff, 2));
      sp.userData.seed = i / 16;
      spores.push(sp);
    }
    ring(g, accent, 0.9);
    anim.noOutlineFor = spores;
    anim.tick = (t) => {
      caps.forEach((c, i) => (c.scale.y = 1 + Math.sin(t * 2.5 + i) * 0.05));
      for (const sp of spores) {
        const k = (t * 0.25 + sp.userData.seed) % 1;
        const a = sp.userData.seed * 20 + t * 0.6;
        sp.position.set(Math.cos(a) * (0.3 + k * 0.7), 1.0 + k * 1.4, Math.sin(a) * (0.3 + k * 0.7));
        sp.scale.setScalar(1 - k * 0.7);
      }
    };
  },

  // 🧛 the Count: a caped vampire with a high red collar, glowing eyes and fangs, bat wings, and bats circling
  count(g, accent, anim) {
    const cloakOut = m(0x0e0a14, { roughness: 0.7 });
    const cloakIn = m(0x8a0a1e, { roughness: 0.5, side: THREE.BackSide });
    // the cloak: black outside, blood red inside
    part(g, new THREE.ConeGeometry(0.62, 1.7, 22, 1, true), cloakOut, 0, 0.9, 0);
    part(g, new THREE.ConeGeometry(0.6, 1.68, 22, 1, true), cloakIn, 0, 0.9, 0);
    part(g, new THREE.CylinderGeometry(0.22, 0.3, 0.6, 14), m(0x1a1a22), 0, 1.5, 0.05); // the waistcoat
    part(g, new THREE.BoxGeometry(0.12, 0.3, 0.02), m(0xf0f0f0), 0, 1.6, 0.27); // a white shirt front
    part(g, new THREE.OctahedronGeometry(0.06), glow(0xff2e4d, 1.6), 0, 1.72, 0.29); // a ruby brooch
    // the high collar
    for (const side of [-1, 1]) {
      part(g, new THREE.PlaneGeometry(0.42, 0.55), m(0x8a0a1e, { side: THREE.DoubleSide }), side * 0.22, 2.05, -0.08, [0.2, side * 0.6, side * -0.25]);
      part(g, new THREE.PlaneGeometry(0.44, 0.57), m(0x0e0a14, { side: THREE.DoubleSide }), side * 0.23, 2.05, -0.1, [0.2, side * 0.6, side * -0.25]);
    }
    // the head: pale, slick black hair with a widow's peak, red eyes, fangs
    const head = new THREE.Group();
    head.position.y = 2.1;
    g.add(head);
    part(head, new THREE.SphereGeometry(0.27, 20, 16), m(0xd8d8e8), 0, 0, 0, null, [0.9, 1.1, 0.95]);
    part(head, new THREE.SphereGeometry(0.285, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.1), m(0x0a0a10, { roughness: 0.25, metalness: 0.3 }), 0, 0.03, -0.02, [-0.25, 0, 0], [0.92, 1.12, 0.98]);
    part(head, new THREE.ConeGeometry(0.06, 0.14, 4), m(0x0a0a10), 0, 0.2, 0.22, [Math.PI + 0.4, Math.PI / 4, 0]); // the widow's peak
    for (const side of [-1, 1]) {
      part(head, new THREE.SphereGeometry(0.05, 10, 8), glow(0xff1a3a, 3), side * 0.1, 0.03, 0.22);
      part(head, new THREE.BoxGeometry(0.11, 0.02, 0.02), m(0x0a0a10), side * 0.1, 0.1, 0.23, [0, 0, side * -0.35]);
      part(head, new THREE.ConeGeometry(0.018, 0.07, 5), m(0xffffff), side * 0.045, -0.16, 0.22, [Math.PI, 0, 0]);
      part(head, new THREE.ConeGeometry(0.06, 0.18, 6), m(0xd8d8e8), side * 0.27, 0.06, -0.02, [0, 0, side * -1.2]); // pointed ears
    }
    part(head, new THREE.BoxGeometry(0.14, 0.015, 0.02), m(0x5a0010), 0, -0.13, 0.24);
    // bat wings on its back, and little bats circling
    const wings = [];
    for (const side of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(side * 0.2, 1.75, -0.25);
      const from = side > 0 ? -0.35 : Math.PI - 0.95;
      part(w, new THREE.CircleGeometry(0.7, 6, from, 1.3), m(0x3a0a24, { side: THREE.DoubleSide, roughness: 0.8 }), 0, 0, -0.01);
      // the bones run along the wing, out to its scalloped edge
      for (let k = 0; k <= 3; k++) {
        const a = from + (k / 3) * 1.3;
        part(w, new THREE.CylinderGeometry(0.018, 0.01, 0.7, 5), m(0x1a1020), Math.cos(a) * 0.35, Math.sin(a) * 0.35, 0, [0, 0, a - Math.PI / 2]);
      }
      g.add(w);
      wings.push(w);
    }
    const bats = new THREE.Group();
    bats.position.y = 2.1;
    for (let i = 0; i < 4; i++) {
      const bat = new THREE.Group();
      const a = (i / 4) * Math.PI * 2;
      bat.position.set(Math.cos(a) * 0.95, Math.sin(i * 2) * 0.25, Math.sin(a) * 0.95);
      bat.rotation.y = -a;
      part(bat, new THREE.SphereGeometry(0.05, 8, 6), m(0x14101a), 0, 0, 0);
      for (const s2 of [-1, 1]) part(bat, new THREE.ConeGeometry(0.07, 0.14, 3), m(0x14101a), 0, 0, s2 * 0.08, [s2 * Math.PI / 2, 0, 0], [1, 1, 0.3]);
      bats.add(bat);
    }
    g.add(bats);
    ring(g, accent);
    anim.flap = wings;
    anim.orbit = bats;
    anim.tick = (t) => {
      head.rotation.y = Math.sin(t * 0.8) * 0.35;
      bats.children.forEach((b, i) => (b.position.y = Math.sin(t * 4 + i * 2) * 0.2));
    };
  },

  // ☠️ a hooded poisoner holding up a bubbling green goblet, with vials on the belt
  poisoner(g, accent, anim) {
    const robe = m(0x2a1a3a, { roughness: 0.8 });
    part(g, new THREE.ConeGeometry(0.58, 1.65, 20), robe, 0, 0.84, 0);
    part(g, new THREE.TorusGeometry(0.33, 0.04, 6, 18), m(0x6b4a2a), 0, 1.12, 0, [Math.PI / 2 + 0.1, 0, 0]); // a rope belt
    for (let i = 0; i < 3; i++) {
      const v = new THREE.Group();
      const a = -0.9 + i * 0.55;
      v.position.set(Math.sin(a) * 0.36, 0.98, Math.cos(a) * 0.36);
      part(v, new THREE.CylinderGeometry(0.045, 0.045, 0.14, 8), glow([0x7dff3a, 0xc77dff, 0x3affd8][i], 1.4));
      part(v, new THREE.CylinderGeometry(0.02, 0.02, 0.05, 6), m(0x8a6234), 0, 0.09, 0);
      g.add(v);
    }
    // the hood: a dark hollow with two green eyes in it
    const hood = new THREE.Group();
    hood.position.y = 1.85;
    g.add(hood);
    part(hood, new THREE.SphereGeometry(0.34, 20, 16), robe, 0, 0, 0, null, [1, 1.1, 1]);
    part(hood, new THREE.ConeGeometry(0.2, 0.4, 12), robe, 0, 0.34, -0.12, [-0.6, 0, 0]);
    part(hood, new THREE.CircleGeometry(0.22, 18), m(0x020104, { roughness: 1 }), 0, -0.02, 0.3, null, [1, 1.2, 1]);
    for (const side of [-1, 1]) part(hood, new THREE.SphereGeometry(0.045, 8, 6), glow(0x7dff3a, 3), side * 0.08, 0.02, 0.31, null, [1.3, 0.7, 1]);
    // an arm holding the goblet up
    const arm = new THREE.Group();
    arm.position.set(0.32, 1.45, 0.1);
    arm.rotation.set(-0.6, 0, -0.5);
    part(arm, new THREE.CylinderGeometry(0.09, 0.12, 0.5, 10), robe, 0, 0.22, 0);
    part(arm, new THREE.SphereGeometry(0.07, 8, 6), m(0x9ab89a), 0, 0.5, 0);
    g.add(arm);
    const cup = new THREE.Group();
    cup.position.set(0.55, 1.95, 0.35);
    part(cup, new THREE.CylinderGeometry(0.02, 0.1, 0.06, 12), m(0xc9a24a, { metalness: 0.85, roughness: 0.25 }), 0, -0.2, 0);
    part(cup, new THREE.CylinderGeometry(0.025, 0.025, 0.18, 8), m(0xc9a24a, { metalness: 0.85, roughness: 0.25 }), 0, -0.1, 0);
    part(cup, new THREE.CylinderGeometry(0.15, 0.04, 0.2, 16, 1, true), m(0xc9a24a, { metalness: 0.85, roughness: 0.25, side: THREE.DoubleSide }), 0, 0.08, 0);
    part(cup, new THREE.CircleGeometry(0.135, 16), glow(0x7dff3a, 2), 0, 0.15, 0, [-Math.PI / 2, 0, 0]);
    g.add(cup);
    const bubbles = [];
    for (let i = 0; i < 7; i++) {
      const b = part(cup, new THREE.SphereGeometry(0.035, 8, 6), glow(0xb8ff7a, 2));
      b.userData.seed = i / 7;
      bubbles.push(b);
    }
    // a skull on the ground beside the hem
    const skull = new THREE.Group();
    skull.position.set(-0.55, 0.12, 0.45);
    part(skull, new THREE.SphereGeometry(0.12, 12, 10), m(0xf0ead8));
    part(skull, new THREE.BoxGeometry(0.12, 0.06, 0.1), m(0xf0ead8), 0, -0.08, 0.03);
    for (const side of [-1, 1]) part(skull, new THREE.SphereGeometry(0.03, 6, 5), m(0x111111), side * 0.045, 0, 0.1);
    g.add(skull);
    ring(g, accent);
    anim.noOutlineFor = bubbles;
    anim.tick = (t) => {
      for (const b of bubbles) {
        const k = (t * 0.6 + b.userData.seed) % 1;
        b.position.set(Math.sin(b.userData.seed * 30) * 0.07, 0.15 + k * 0.45, Math.cos(b.userData.seed * 30) * 0.07);
        b.scale.setScalar(1 - k * 0.8);
      }
      cup.position.y = 1.95 + Math.sin(t * 1.5) * 0.04;
      hood.rotation.y = Math.sin(t * 0.7) * 0.25;
    };
  },
};

// 🧟 the Husk: Patient Zero's old spacesuit (the players' own astronaut), still walking. Torn, patched, slumped,
// and glowing green through the cracked visor.
export function buildHusk(suited, accentHex, anim) {
  const av = suited('#7d8a6a', '#1a2a14');
  av.body.traverse((o) => o.material === av.glintMat && (o.visible = false));
  av.eyeMat?.color.set(0x7dff3a);
  av.eyeMat?.emissive.set(0x7dff3a);
  const extra = new THREE.Group();
  const accent = new THREE.Color(accentHex).getHex();
  // tears in the suit, patches, dangling hoses, and green light glowing through the cracked visor
  for (let i = 0; i < 6; i++) part(extra, new THREE.SphereGeometry(0.07 + (i % 3) * 0.02, 8, 6), m(0x1a2210), Math.sin(i * 2.1) * 0.3, 0.75 + (i % 3) * 0.22, 0.27 + Math.cos(i) * 0.03, null, [1, 0.6, 0.3]);
  for (let i = 0; i < 4; i++) part(extra, new THREE.SphereGeometry(0.035, 6, 5), glow(0x7dff3a, 1.8), Math.sin(i * 2.1 + 0.3) * 0.3, 0.75 + (i % 3) * 0.22, 0.3);
  part(extra, new THREE.BoxGeometry(0.16, 0.12, 0.02), m(0xc9a24a), -0.18, 1.05, 0.3, [0, 0, 0.3]); // a patch
  for (const side of [-1, 1]) part(extra, new THREE.TorusGeometry(0.16, 0.025, 6, 12, Math.PI * 1.2), m(0x3a3a2a), side * 0.25, 0.85, -0.25, [0, side * 0.6, 0]);
  for (let i = 0; i < 3; i++) part(extra, new THREE.BoxGeometry(0.03, 0.18, 0.01), glow(0xb8ff7a, 1.2), -0.05 + i * 0.06, 1.75, 0.42, [0, 0, 0.5 - i * 0.5]); // cracks in the visor
  part(extra, new THREE.TorusGeometry(0.33, 0.035, 6, 22), m(accent), 0, 1.1, 0, [Math.PI / 2, 0, 0]); // a collar in the player's colour
  outlineEach(extra, 0.014);
  av.body.add(extra);
  // it shambles: the whole suit leans and lurches
  const wrap = new THREE.Group();
  wrap.add(av.root);
  anim.suits = [av];
  anim.tick = (t) => {
    av.root.rotation.z = Math.sin(t * 1.3) * 0.12;
    av.root.rotation.x = 0.18 + Math.sin(t * 2.6) * 0.05;
  };
  return wrap;
}

export function buildDemon(roleId, accentHex, anim) {
  const g = new THREE.Group();
  BUILDERS[roleId](g, new THREE.Color(accentHex).getHex(), anim);
  // outline everything but the glowing bits that move about (fire, spores, bubbles)
  const skip = new Set(anim.noOutlineFor || []);
  delete anim.noOutlineFor;
  const keep = [];
  g.traverse((o) => skip.has(o) && keep.push([o, o.parent]));
  for (const [o] of keep) o.removeFromParent();
  outlineEach(g, 0.016);
  for (const [o, parent] of keep) parent.add(o);
  anim.noOutline = true;
  return g;
}

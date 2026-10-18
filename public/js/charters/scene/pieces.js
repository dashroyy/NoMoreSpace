// Star Charters: the playing pieces. Probes are little tin rockets in their captain's colour (cream nose, three fins,
// a porthole); the dreadnought is a big one with side boosters; a probe trawling the void lies on its side, like a
// farmer lying down in the field. Anomalies are glowing gems floating over the empty chart.
import * as THREE from 'three';
import { mats, emojiSprite, spotTexture } from './look.js';

const colourMats = new Map();
function paint(hex) {
  if (!colourMats.has(hex)) {
    const c = new THREE.Color(hex);
    colourMats.set(hex, {
      body: new THREE.MeshStandardMaterial({ color: c, roughness: 0.32, metalness: 0.15 }),
      fin: new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.72), roughness: 0.4, metalness: 0.1 }),
      glow: new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    });
  }
  return colourMats.get(hex);
}

let GEO = null;
function geos() {
  if (GEO) return GEO;
  const body = [
    [0, 0],
    [0.07, 0],
    [0.095, 0.06],
    [0.105, 0.17],
    [0.098, 0.27],
    [0.07, 0.36],
    [0.0, 0.36],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const nose = [
    [0.0, 0.34],
    [0.072, 0.35],
    [0.05, 0.43],
    [0.02, 0.48],
    [0, 0.5],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const fin = new THREE.Shape();
  fin.moveTo(0, 0);
  fin.lineTo(0.11, -0.03);
  fin.lineTo(0.12, 0.05);
  fin.lineTo(0, 0.17);
  fin.closePath();
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.022, bevelEnabled: false });
  finGeo.translate(0.07, 0.01, -0.011);
  GEO = {
    body: new THREE.LatheGeometry(body, 20),
    nose: new THREE.LatheGeometry(nose, 20),
    fin: finGeo,
    port: new THREE.TorusGeometry(0.04, 0.012, 8, 16),
    glass: new THREE.CircleGeometry(0.04, 16),
    flame: new THREE.ConeGeometry(0.06, 0.22, 12).rotateX(Math.PI).translate(0, -0.1, 0),
    booster: new THREE.CapsuleGeometry(0.04, 0.16, 4, 10),
    base: new THREE.CircleGeometry(0.2, 24).rotateX(-Math.PI / 2),
  };
  return GEO;
}

// a rocket: { body, flame } in a group standing on its own base point
export function makeRocket(hex, { dread = false } = {}) {
  const M = mats();
  const P = paint(hex);
  const G = geos();
  const root = new THREE.Group();
  const ship = new THREE.Group();
  root.add(ship);
  const body = new THREE.Mesh(G.body, P.body);
  const nose = new THREE.Mesh(G.nose, M.hull);
  const port = new THREE.Mesh(G.port, M.hull);
  port.position.set(0, 0.22, 0.1);
  const glass = new THREE.Mesh(G.glass, M.glass);
  glass.position.set(0, 0.22, 0.102);
  ship.add(body, nose, port, glass);
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(G.fin, P.fin);
    f.rotation.y = (i * Math.PI * 2) / 3 + Math.PI / 2;
    ship.add(f);
  }
  if (dread) {
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(G.booster, M.hull);
      b.position.set(0.14 * s, 0.13, 0);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), P.body);
      cap.position.set(0.14 * s, 0.25, 0);
      ship.add(b, cap);
    }
    ship.scale.setScalar(1.45);
  }
  ship.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  const flame = new THREE.Mesh(G.flame, M.reactor);
  flame.visible = false;
  ship.add(flame);
  // a soft colour glow on the ground under it, so it is easy to spot whose it is
  const halo = new THREE.Mesh(G.base, P.glow);
  halo.position.y = 0.01;
  halo.scale.setScalar(dread ? 1.4 : 1);
  root.add(halo);
  root.userData = { ship, flame, halo, dread };
  return root;
}

// lie a rocket down (it is trawling the void)
export function layDown(rocket, lying = true) {
  const s = rocket.userData.ship;
  s.rotation.set(0, 0, lying ? Math.PI / 2 : 0);
  s.position.set(lying ? 0.18 * (rocket.userData.dread ? 1.45 : 1) : 0, lying ? 0.1 * (rocket.userData.dread ? 1.45 : 1) : 0, 0);
}

// ---------------------------------------------------------------------------
// an anomaly: a spinning gem with its prize floating over it, and a dashed ring on the chart
// ---------------------------------------------------------------------------
const ANOMALY_COLOUR = { fuel: '#ff9a3c', cache: '#36d6e7', boost: '#e05cff' };
export function makeAnomaly(kind, icon) {
  const g = new THREE.Group();
  const c = new THREE.Color(ANOMALY_COLOUR[kind] || '#ffffff');
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.65, roughness: 0.15, metalness: 0.2, flatShading: true }));
  gem.position.y = 0.9;
  gem.castShadow = true;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthWrite: false }));
  ring.position.y = 0.02;
  // a soft shadow-like pool of colour on the chart under it
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.18, depthWrite: false }));
  pool.position.y = 0.015;
  const sign = emojiSprite(icon, 0.55);
  sign.position.y = 1.55;
  g.add(pool, ring, gem, sign);
  const phase = Math.random() * 6;
  g.userData.update = (dt, t) => {
    gem.rotation.y = t * 1.4 + phase;
    gem.position.y = 0.9 + Math.sin(t * 2 + phase) * 0.1;
    sign.position.y = 1.55 + Math.sin(t * 2 + phase) * 0.1;
    ring.scale.setScalar(1 + Math.sin(t * 3 + phase) * 0.05);
  };
  return g;
}

// a "you can put it here" square
export function makeSpot(size) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: spotTexture(), color: '#2a9d8f', transparent: true, opacity: 0.85, depthWrite: false }));
  m.position.y = 0.025;
  return m;
}

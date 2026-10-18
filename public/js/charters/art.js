// Star Charters: the tile pictures. Every kind of tile is photographed from straight above once, when the game
// loads, from the very same 3D tile that goes on the map, so the tile in your hand looks exactly like the one on the
// table. tileArt(id) gives a data URL for an <img> (turn it with CSS). Without WebGL there is a flat drawing.
import * as THREE from 'three';
import { makeTile } from './scene/tiles3d.js';
import { TILE } from './scene/look.js';
import { store, tileDef } from './net.js';

const cache = new Map();
let done = false;

export function initArt() {
  if (done || !store.data) return;
  done = true;
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(200, 200, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff6e6, 0xb8a98a, 1.4));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.1);
  sun.position.set(-4, 10, 3);
  scene.add(sun);
  const h = (TILE * 0.98) / 2;
  const cam = new THREE.OrthographicCamera(-h, h, h, -h, 0.1, 30);
  cam.position.set(0, 12, 0);
  cam.up.set(0, 0, -1);
  cam.lookAt(0, 0, 0);
  for (const t of store.data.tiles) {
    const tile = makeTile(t, { variant: 2, shadows: false });
    tile.userData.update(0, 1.3);
    scene.add(tile);
    renderer.render(scene, cam);
    cache.set(t.id, renderer.domElement.toDataURL('image/png'));
    scene.remove(tile);
  }
  renderer.dispose();
  renderer.forceContextLoss?.();
}

// a flat drawing, for a browser without WebGL: void, station, lanes
function sketch(id) {
  const def = tileDef(id);
  const c = document.createElement('canvas');
  c.width = c.height = 140;
  const g = c.getContext('2d');
  const s = 20;
  const colour = { '.': '#1c2547', S: '#f3ecd9', C: '#f08a3c', Q: '#22d3ee', L: '#ffc93c', O: '#b45cff', X: '#f3ecd9', A: '#2a9d8f', H: '#000000' };
  def?.shapes[0].rows.forEach((row, y) => [...row].forEach((ch, x) => {
    g.fillStyle = colour[ch] || '#1c2547';
    g.fillRect(x * s, y * s, s, s);
  }));
  return c.toDataURL();
}

export function tileArt(id) {
  if (!cache.has(id)) cache.set(id, sketch(id));
  return cache.get(id);
}

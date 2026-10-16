// Star Bonanza: the card pictures. Each star buddy is photographed once, when the game loads, from the very same
// 3D model that stands in the patches, so a card always looks like the star on the table. starArt(id) gives a data
// URL you can drop into an <img>. (Without WebGL there is a simple drawing instead.)
import * as THREE from 'three';
import { makeCritter } from './scene/critters.js';
import { addLights } from './scene/stage.js';
import { store, star } from './net.js';

const cache = new Map();
let photographed = false;

export function initArt() {
  if (photographed || !store.data) return;
  photographed = true;
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(256, 256, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  addLights(scene);
  // the same framing for everyone (hats and dumbbells included), turned a little for a three-quarter view
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0, 0.24, 5.4);
  cam.lookAt(0, 0.22, 0);
  for (const s of store.data.stars) {
    const c = makeCritter(s.id);
    c.rotation.y = -0.28;
    c.userData.update(0, 0);
    scene.add(c);
    renderer.render(scene, cam);
    cache.set(s.id, renderer.domElement.toDataURL('image/png'));
    scene.remove(c);
  }
  renderer.dispose();
  renderer.forceContextLoss?.();
}

// a plain drawing, for a browser without WebGL
function sketch(id) {
  const d = star(id);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 68);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 30 : 54;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = d?.color || '#ffd93d';
  g.strokeStyle = '#2d1b4e';
  g.lineWidth = 6;
  g.lineJoin = 'round';
  g.fill();
  g.stroke();
  g.fillStyle = '#2d1b4e';
  for (const x of [-11, 11]) {
    g.beginPath();
    g.arc(x, -4, 5, 0, Math.PI * 2);
    g.fill();
  }
  g.lineWidth = 4;
  g.beginPath();
  g.arc(0, 4, 9, 0.2, Math.PI - 0.2);
  g.stroke();
  return c.toDataURL();
}

export function starArt(id) {
  if (!cache.has(id)) cache.set(id, sketch(id));
  return cache.get(id);
}

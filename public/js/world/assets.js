// Real 3D models for the scenery. Everything else in the game is built from code, but
// some scripts dress their rooms with models from the KayKit packs (CC0, by Kay Lousberg,
// www.kaylousberg.com), packed into compact .glb files by tools/pack-models.mjs, and from Kenney's
// Space Station Kit and Space Kit (CC0, kenney.nl), copied in by tools/copy-models.mjs. All are
// served from /assets/models/<pack>/<name>.glb.
//
//   await loadModels(['dungeon/chair', 'dungeon/torch_mounted']);   // once, when the script starts
//   const chair = model('dungeon/chair');                          // a fresh copy, or null
//
// Models are optional: if one fails to load (offline, a typo), model() gives null and the
// room simply goes without it. Characters (skinned, animated) are copied with cloneSkinned(). The loader (GLTFLoader) is only downloaded when a script
// needs models, and every model of a pack shares one material, so a pile of them can be
// merged into a handful of draw calls.
import * as THREE from 'three';

const BASE = '/assets/models/';
const templates = new Map(); // 'pack/name' -> THREE.Group (or null if it could not be loaded)
const pending = new Map();
const clips = new Map(); // 'pack/name' -> the animation clips in that file
const packMaterials = new Map(); // 'pack' -> the one MeshStandardMaterial all of its models share
const SHARED = new Set(['dungeon', 'halloween', 'restaurant', 'furniture', 'spacebase', 'station']); // packs whose models all use one painted texture (characters each bring their own)
let loader = null;
let skeletonUtils = null;

function getLoader() {
  loader ??= import('/vendor/three-addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new GLTFLoader());
  return loader;
}

// every model in a KayKit pack uses the same painted texture: share one material between them
function unify(pack, scene) {
  if (!SHARED.has(pack)) return;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!mat?.map) return;
    if (!packMaterials.has(pack)) {
      mat.map.anisotropy = 4;
      mat.roughness = 0.85;
      mat.metalness = 0;
      // Kenney's station kit paints with a small palette of flat colours: keep them crisp instead of blending
      if (pack === 'station') {
        mat.map.magFilter = THREE.NearestFilter;
        mat.map.minFilter = THREE.NearestFilter;
        mat.map.generateMipmaps = false;
        mat.roughness = 0.6;
        mat.metalness = 0.15;
      }
      packMaterials.set(pack, mat);
    }
    o.material = packMaterials.get(pack);
  });
}

// Kenney's Space Kit models sit off to one side of their own origin (each is moved to a spot on a grid):
// put the middle of every model's footprint back on its origin, standing on y = 0
function recenter(scene) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  for (const child of scene.children) {
    child.position.x -= cx;
    child.position.z -= cz;
    child.position.y -= box.min.y;
  }
}

export function loadModel(id) {
  if (templates.has(id)) return Promise.resolve(templates.get(id));
  if (!pending.has(id)) {
    pending.set(id, getLoader()
      .then((l) => l.loadAsync(`${BASE}${id}.glb`))
      .then((gltf) => {
        if (id.startsWith('spacekit/')) recenter(gltf.scene);
        unify(id.split('/')[0], gltf.scene);
        templates.set(id, gltf.scene);
        clips.set(id, gltf.animations || []);
        return gltf.scene;
      })
      .catch((err) => {
        console.warn(`[assets] could not load ${id}:`, err?.message || err);
        templates.set(id, null);
        return null;
      }));
  }
  return pending.get(id);
}

export function loadModels(ids) {
  return Promise.all([...new Set(ids)].map(loadModel));
}

// a copy of a loaded model (geometry and material are shared, so copies are cheap), or null
export function model(id) {
  const t = templates.get(id);
  return t ? t.clone(true) : null;
}

// a copy of a skinned character (its own skeleton, so it can be animated on its own), or null
export async function cloneSkinned(id) {
  const t = await loadModel(id);
  if (!t) return null;
  skeletonUtils ??= await import('/vendor/three-addons/utils/SkeletonUtils.js');
  return skeletonUtils.clone(t);
}

// the animation clips in a loaded file (empty if it has none, or did not load)
export const clipsOf = (id) => clips.get(id) || [];

export const modelsReady = (ids) => ids.every((id) => templates.get(id));

// Cartoon outlines for the characters: a dark shell, a hair wider than the model, drawn behind it (so only the
// rim shows). Every character gets the same line, which is what makes a crowd of different models read as one cast.
//
// The shell is the model's own geometry pushed out along its (smoothed) normals, so there is nothing to compute per
// frame, it follows skinned animation for free, and it costs one extra draw call per mesh.
//
//   outlineGroup(group, 0.02, skip)   one shell around all of a group's (still) meshes, merged into a single mesh
//   outlineEach(root, 0.02)           a shell on every mesh under root (they keep moving with their own meshes)
//   outlineSkinned(character, 0.02)   a shell for every skinned mesh of an animated character
import * as THREE from 'three';

export const OUTLINE_COLOR = 0x090b18;
const material = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
material.userData.shared = true; // every shell uses this one: throwaway-model cleanup must not dispose it

// Pushes every vertex out along the average normal of the vertices that share its position, so the shell has no
// cracks along a box's or a cylinder's hard edges.
function inflate(geometry, thickness) {
  const g = geometry.clone();
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  if (!nor) return g;
  const sums = new Map();
  const key = (i) => `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const s = sums.get(k) || [0, 0, 0];
    s[0] += nor.getX(i);
    s[1] += nor.getY(i);
    s[2] += nor.getZ(i);
    sums.set(k, s);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const s = sums.get(key(i));
    const len = Math.hypot(s[0], s[1], s[2]) || 1;
    out[i * 3] = pos.getX(i) + (s[0] / len) * thickness;
    out[i * 3 + 1] = pos.getY(i) + (s[1] / len) * thickness;
    out[i * 3 + 2] = pos.getZ(i) + (s[2] / len) * thickness;
  }
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(name)) g.deleteAttribute(name);
  g.morphAttributes = {};
  g.computeBoundingSphere();
  return g;
}

const solid = (o) => o.isMesh && !o.userData.noOutline && !o.material?.transparent && o.geometry?.attributes?.position;

// One shell around all the still meshes under a group, merged into a single mesh in the group's own space.
// skip: objects (and so everything below them) that move on their own and must not be included
export function outlineGroup(group, thickness = 0.02, skip = null) {
  group.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const parts = [];
  const gather = (o) => {
    if (skip?.has(o) || o.userData.isOutline) return;
    if (solid(o) && !o.isSkinnedMesh) {
      const baked = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld));
      parts.push(inflate(baked, thickness));
      baked.dispose();
    }
    for (const c of o.children) gather(c);
  };
  gather(group);
  if (!parts.length) return null;
  let vertices = 0;
  let indices = 0;
  for (const g of parts) {
    vertices += g.attributes.position.count;
    indices += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vertices * 3);
  const idx = new Uint32Array(indices);
  let vo = 0;
  let io = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, vo * 3);
    if (g.index) for (let k = 0; k < g.index.count; k++) idx[io++] = g.index.array[k] + vo;
    else for (let k = 0; k < g.attributes.position.count; k++) idx[io++] = k + vo;
    vo += g.attributes.position.count;
    g.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setIndex(new THREE.BufferAttribute(idx, 1));
  geometry.computeBoundingSphere();
  const shell = new THREE.Mesh(geometry, material);
  shell.userData.isOutline = true;
  group.add(shell);
  return shell;
}

// A shell on every mesh under root, as a child of that mesh (so it moves and animates with it)
export function outlineEach(root, thickness = 0.02) {
  const sources = [];
  root.traverse((o) => solid(o) && !o.isSkinnedMesh && !o.userData.isOutline && sources.push(o));
  for (const o of sources) {
    // the shell lives in the mesh's own space, which may be scaled: keep the line the same width on every axis
    const scale = (o.scale.x + o.scale.y + o.scale.z) / 3 || 1;
    const shell = new THREE.Mesh(inflate(o.geometry, thickness / scale), material);
    shell.userData.isOutline = true;
    o.add(shell);
  }
}

// A shell for each skinned mesh of an animated character, sharing its skeleton (so it follows every pose)
export function outlineSkinned(root, thicknessWorld = 0.02) {
  root.updateMatrixWorld(true);
  const sources = [];
  root.traverse((o) => o.isSkinnedMesh && !o.userData.isOutline && sources.push(o));
  for (const o of sources) {
    const e = o.matrixWorld.elements;
    const worldScale = Math.hypot(e[0], e[1], e[2]) || 1;
    const shell = new THREE.SkinnedMesh(inflate(o.geometry, thicknessWorld / worldScale), material);
    shell.userData.isOutline = true;
    shell.frustumCulled = false;
    shell.bind(o.skeleton, o.bindMatrix);
    o.parent.add(shell);
    shell.position.copy(o.position);
    shell.quaternion.copy(o.quaternion);
    shell.scale.copy(o.scale);
  }
}

export function setOutlinesVisible(root, visible) {
  root.traverse((o) => o.userData.isOutline && (o.visible = visible));
}

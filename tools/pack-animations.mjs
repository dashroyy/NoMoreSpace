// Cuts a few animation clips out of a KayKit animation .glb, so the game only downloads
// what it plays (the whole "General" file is 800 KB; two idle loops are about 30 KB).
//
//   node tools/pack-animations.mjs <in.glb> <out.glb> <clip> [<clip> ...]
//
// The result keeps the skeleton's bone names (animations are matched to a character by
// bone name, so any KayKit character on the same rig can play them) and drops the meshes.
import fs from 'node:fs';

const [input, output, ...names] = process.argv.slice(2);
if (!input || !output || !names.length) {
  console.error('usage: node tools/pack-animations.mjs <in.glb> <out.glb> <clip> [<clip> ...]');
  process.exit(1);
}

const file = fs.readFileSync(input);
const jsonLength = file.readUInt32LE(12);
const gltf = JSON.parse(file.subarray(20, 20 + jsonLength).toString('utf8'));
const bin = file.subarray(20 + jsonLength + 8);

const clips = gltf.animations.filter((a) => names.includes(a.name));
if (clips.length !== names.length) {
  const have = gltf.animations.map((a) => a.name).join(', ');
  throw new Error(`not all clips found. wanted ${names.join(', ')}; the file has ${have}`);
}

// the accessors the kept clips use, renumbered from 0
const remap = new Map();
const accessors = [];
const bufferViews = [];
const chunks = [];
let offset = 0;
const use = (index) => {
  if (remap.has(index)) return remap.get(index);
  const accessor = { ...gltf.accessors[index] };
  const view = gltf.bufferViews[accessor.bufferView];
  const start = (view.byteOffset || 0);
  const data = bin.subarray(start, start + view.byteLength);
  const padded = Buffer.concat([data, Buffer.alloc((4 - (data.length % 4)) % 4)]);
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: view.byteLength });
  chunks.push(padded);
  offset += padded.length;
  accessor.bufferView = bufferViews.length - 1;
  accessor.byteOffset = accessor.byteOffset || 0;
  accessors.push(accessor);
  remap.set(index, accessors.length - 1);
  return accessors.length - 1;
};
const animations = clips.map((clip) => ({
  name: clip.name,
  channels: clip.channels,
  samplers: clip.samplers.map((s) => ({ ...s, input: use(s.input), output: use(s.output) })),
}));

const nodes = gltf.nodes.map(({ mesh, skin, ...rest }) => rest); // bones only
const out = {
  asset: gltf.asset,
  scene: gltf.scene,
  scenes: gltf.scenes,
  nodes,
  animations,
  accessors,
  bufferViews,
  buffers: [{ byteLength: offset }],
};
const body = Buffer.concat(chunks);
const jsonBuf = Buffer.from(JSON.stringify(out), 'utf8');
const json = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + body.length, 8);
const jsonHead = Buffer.alloc(8);
jsonHead.writeUInt32LE(json.length, 0);
jsonHead.writeUInt32LE(0x4e4f534a, 4);
const binHead = Buffer.alloc(8);
binHead.writeUInt32LE(body.length, 0);
binHead.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(output, Buffer.concat([header, jsonHead, json, binHead, body]));
console.log(`wrote ${output}: ${names.join(', ')} (${((12 + 16 + json.length + body.length) / 1024).toFixed(0)} KB)`);

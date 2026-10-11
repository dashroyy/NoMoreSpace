// Packs 3D models from a KayKit (CC0) pack into compact .glb files for the game.
//
//   node tools/pack-models.mjs <pack-gltf-dir> <texture-file> <out-dir> <model> [<model> ...]
//
// Each <model> is the file name without ".gltf". The .gltf's external .bin is embedded in
// the .glb, so the browser makes one request per model. The shared texture is copied next
// to them once, and the models point at it by name (so it is downloaded once and cached).
//
// Example:
//   node tools/pack-models.mjs "KayKit Dungeon Pack 1.1/Assets/gltf" \
//     "KayKit Dungeon Pack 1.1/Assets/textures/dungeon_texture.png" public/assets/models/dungeon \
//     torch_mounted bookcase_double chair
import fs from 'node:fs';
import path from 'node:path';

const [srcDir, texture, outDir, ...names] = process.argv.slice(2);
if (!srcDir || !texture || !outDir || !names.length) {
  console.error('usage: node tools/pack-models.mjs <pack-gltf-dir> <texture-file> <out-dir> <model> [<model> ...]');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(texture, path.join(outDir, path.basename(texture)));

const pad = (buf, byte) => (buf.length % 4 ? Buffer.concat([buf, Buffer.alloc(4 - (buf.length % 4), byte)]) : buf);

let total = 0;
for (const name of names) {
  const gltf = JSON.parse(fs.readFileSync(path.join(srcDir, `${name}.gltf`), 'utf8'));
  if (gltf.buffers.length !== 1) throw new Error(`${name}: expected one buffer`);
  const bin = pad(fs.readFileSync(path.join(srcDir, gltf.buffers[0].uri)), 0);
  gltf.buffers = [{ byteLength: bin.length }];
  for (const image of gltf.images || []) image.uri = path.basename(texture); // the same one for every model of the pack
  const json = pad(Buffer.from(JSON.stringify(gltf), 'utf8'), 0x20);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  const jsonHead = Buffer.alloc(8);
  jsonHead.writeUInt32LE(json.length, 0);
  jsonHead.writeUInt32LE(0x4e4f534a, 4); // "JSON"
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(bin.length, 0);
  binHead.writeUInt32LE(0x004e4942, 4); // "BIN\0"
  const out = Buffer.concat([header, jsonHead, json, binHead, bin]);
  fs.writeFileSync(path.join(outDir, `${name}.glb`), out);
  total += out.length;
}
console.log(`packed ${names.length} models, ${(total / 1024).toFixed(0)} KB, into ${outDir}`);

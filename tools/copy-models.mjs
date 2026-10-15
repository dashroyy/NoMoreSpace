// Copies models from a Kenney (CC0) pack into the game. Kenney's packs already ship as one .glb per model,
// so there is nothing to convert: this just picks the ones the game uses.
//
//   node tools/copy-models.mjs <glb-dir> <out-dir> [--textures=<dir>] <model> [<model> ...]
//
// Each <model> is the file name without ".glb". Some packs (the Space Station Kit) point their models at a
// shared "Textures/colormap.png"; give the folder that holds it with --textures and it is copied next to the
// models in the same relative place, so every model keeps finding it.
//
// Example:
//   node tools/copy-models.mjs "Space Station Kit/Models/GLB format" public/assets/models/station \
//     --textures="Space Station Kit/Models/GLB format/Textures" chair computer bed-single
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const textures = args.find((a) => a.startsWith('--textures='))?.slice('--textures='.length);
const [srcDir, outDir, ...names] = args.filter((a) => !a.startsWith('--textures='));
if (!srcDir || !outDir || !names.length) {
  console.error('usage: node tools/copy-models.mjs <glb-dir> <out-dir> [--textures=<dir>] <model> [<model> ...]');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
let total = 0;
for (const name of names) {
  const from = path.join(srcDir, `${name}.glb`);
  if (!fs.existsSync(from)) throw new Error(`${from} does not exist`);
  fs.copyFileSync(from, path.join(outDir, `${name}.glb`));
  total += fs.statSync(from).size;
}
if (textures) {
  const to = path.join(outDir, 'Textures');
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(textures)) fs.copyFileSync(path.join(textures, f), path.join(to, f));
}
console.log(`copied ${names.length} models, ${(total / 1024).toFixed(0)} KB, into ${outDir}`);

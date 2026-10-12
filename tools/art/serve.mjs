// A small local web server for the art tools (never part of the game). It serves the tool pages in this
// folder, the game's own files, the Three.js library and your downloaded asset packs, and lets a tool page
// save the images it makes into public/assets.
//
//   node tools/art/serve.mjs            then open http://localhost:3055/art/
//
// Set KENNEY_DIR / KAYKIT_DIR if your asset packs live somewhere else.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const KENNEY = process.env.KENNEY_DIR || 'C:/Users/ACali/Downloads/Game Assets/Kenny Game Assets';
const KAYKIT = process.env.KAYKIT_DIR || 'C:/Users/ACali/Downloads/Game Assets/The Complete KayKit Collection v7';
const PORT = Number(process.env.ART_PORT || 3055);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.bin': 'application/octet-stream' };

const MOUNTS = [
  // the game's own paths, so its modules (avatar.js, models.js, assets.js) run unchanged on a tool page
  ['/assets/', path.join(ROOT, 'public/assets')],
  ['/vendor/three-addons/', path.join(ROOT, 'node_modules/three/examples/jsm')],
  ['/vendor/three/', path.join(ROOT, 'node_modules/three/build')],
  ['/art/', HERE],
  ['/repo/', ROOT],
  ['/kenney/', KENNEY],
  ['/kaykit/', KAYKIT],
  ['/three/', path.join(ROOT, 'node_modules/three/build')],
  ['/jsm/', path.join(ROOT, 'node_modules/three/examples/jsm')],
];

function safe(base, rel) {
  const p = path.normalize(path.join(base, decodeURIComponent(rel)));
  return p.startsWith(path.normalize(base)) ? p : null;
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Cache-Control', 'no-store');
    // save an image: POST /save?to=public/assets/phase/art/cat.webp
    if (req.method === 'POST' && url.pathname === '/save') {
      const to = url.searchParams.get('to') || '';
      if (!/^public\/assets\/[\w\-./]+$/.test(to) || to.includes('..')) {
        res.writeHead(400).end('bad path');
        return;
      }
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const file = path.join(ROOT, to);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.concat(chunks));
        res.writeHead(200).end('saved');
      });
      return;
    }
    if (url.pathname === '/list') {
      // GET /list?dir=kenney/...  ->  file names (so a tool page can find the files in a pack)
      const dir = url.searchParams.get('dir') || '';
      for (const [prefix, base] of MOUNTS) {
        if (('/' + dir + '/').startsWith(prefix)) {
          const p = safe(base, dir.slice(prefix.length - 1));
          try {
            res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(fs.readdirSync(p)));
          } catch {
            res.writeHead(404).end('[]');
          }
          return;
        }
      }
      res.writeHead(404).end('[]');
      return;
    }
    for (const [prefix, base] of MOUNTS) {
      if (url.pathname.startsWith(prefix)) {
        const file = safe(base, url.pathname.slice(prefix.length));
        if (!file) break;
        fs.readFile(file, (err, data) => {
          if (err) return res.writeHead(404).end('not found');
          res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' }).end(data);
        });
        return;
      }
    }
    res.writeHead(404).end('not found');
  })
  .listen(PORT, () => console.log(`Art tools: http://localhost:${PORT}/art/`));

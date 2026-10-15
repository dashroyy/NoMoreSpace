// The Kenney models dressing the classic station (Space Station Kit and Space Kit, plus the rocks, turret and speeder it
// shares with Ruler of the Galaxy): everything the code asks for is in the assets folder, everything that is loaded is
// placed somewhere, and nothing in those folders goes unused.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MODELS = path.join(ROOT, 'public/assets/models');
const rooms = fs.readFileSync(path.join(ROOT, 'public/js/world/classic-rooms.js'), 'utf8');
const exterior = fs.readFileSync(path.join(ROOT, 'public/js/world/classic-exterior.js'), 'utf8');
const files = (pack) => fs.readdirSync(path.join(MODELS, pack)).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4));

// the models classic-rooms.js loads (K = station kit, X = space kit) and the ones it places
const loaded = { station: new Set(), spacekit: new Set() };
for (const m of rooms.matchAll(/\[([^\]]*)\]\.map\((K|X)\)/g)) {
  for (const n of m[1].matchAll(/'([\w-]+)'/g)) loaded[m[2] === 'K' ? 'station' : 'spacekit'].add(n[1]);
}
const placed = { station: new Set(), spacekit: new Set() };
for (const m of rooms.matchAll(/\b(K|X)\('([\w-]+)'\)/g)) placed[m[1] === 'K' ? 'station' : 'spacekit'].add(m[2]);

// the exterior names every model with its pack: 'ruler/rock_largeA'
const outside = { ruler: new Set(), spacekit: new Set() };
for (const m of exterior.matchAll(/'(ruler|spacekit)\/([\w-]+)'/g)) outside[m[1]].add(m[2]);

test('the station\'s rooms: everything loaded exists, everything placed is loaded, and every file in the folder is used', () => {
  for (const pack of ['station', 'spacekit']) {
    const onDisk = files(pack);
    for (const n of loaded[pack]) assert.ok(onDisk.includes(n) || outside[pack]?.has(n), `${pack}/${n}.glb is loaded but missing`);
    for (const n of placed[pack]) assert.ok(loaded[pack].has(n), `${pack}/${n} is placed in a room but never loaded: it would silently not appear`);
    for (const n of loaded[pack]) assert.ok(placed[pack].has(n), `${pack}/${n} is loaded but never placed`);
    // the exterior's own models count too
    const used = new Set([...loaded[pack], ...(outside[pack] || [])]);
    for (const n of onDisk) assert.ok(used.has(n), `${pack}/${n}.glb is never used`);
  }
  assert.ok(placed.station.size >= 10, 'the station kit really dresses the rooms');
});

test('the exterior: every model it names exists, and the shared ones are the ones Ruler of the Galaxy ships', () => {
  for (const pack of ['ruler', 'spacekit']) {
    const onDisk = files(pack);
    assert.ok(outside[pack].size > 0, `the exterior uses ${pack} models`);
    for (const n of outside[pack]) assert.ok(onDisk.includes(n), `${pack}/${n}.glb is missing`);
  }
  // loaded before it is placed
  const list = /const NAMES = \[([^\]]*)\]/.exec(exterior)[1];
  for (const m of exterior.matchAll(/fit\('([\w/]+)'/g)) assert.ok(list.includes(m[1]) || list.includes('...ROCKS'), `${m[1]} is placed but not in NAMES`);
});

test('the station kit\'s textures are alongside its models (every model points at Textures/colormap.png)', () => {
  const tex = path.join(MODELS, 'station/Textures/colormap.png');
  assert.ok(fs.existsSync(tex), 'station/Textures/colormap.png is missing');
  for (const n of files('station')) {
    const b = fs.readFileSync(path.join(MODELS, `station/${n}.glb`));
    const json = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString('utf8'));
    for (const img of json.images || []) assert.strictEqual(img.uri, 'Textures/colormap.png', `${n}.glb points at ${img.uri}`);
  }
});

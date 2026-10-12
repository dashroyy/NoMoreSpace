// The characters of the end-game reveal: every role needs a model, and every model a file.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const models = read('public/js/world/models.js');

// role -> [character file, height], as written in models.js
const kaykit = Object.fromEntries([...models.slice(models.indexOf('const KAYKIT'), models.indexOf('// what a character holds')).matchAll(/(\w+): \['(\w+)', ([\d.]+)\]/g)].map((m) => [m[1], [m[2], Number(m[3])]]));
// the roles that are built from shapes instead (see the switch in buildRoleModel)
const built = new Set([...models.slice(models.indexOf('export function buildRoleModel')).matchAll(/case '(\w+)'/g)].map((m) => m[1]));

const roleIds = () => {
  const { ROLES } = require('../server/roles');
  const { CARNIVAL_ROLES } = require('../server/roles-carnival');
  const { OUTBREAK_ROLES } = require('../server/roles-outbreak');
  const { TRAITORS_ROLES } = require('../server/roles-traitors');
  return [...new Set([...Object.keys(ROLES), ...Object.keys(CARNIVAL_ROLES), ...Object.keys(OUTBREAK_ROLES), ...Object.keys(TRAITORS_ROLES)])];
};

test('every role has a character model (and none falls back to the Parasite by mistake)', () => {
  const missing = roleIds().filter((id) => !kaykit[id] && !built.has(id));
  assert.deepStrictEqual(missing, []);
  assert.ok(Object.keys(kaykit).length >= 49, 'the KayKit table was read');
});

test('the Citadel preloads exactly its own characters', () => {
  const { TRAITORS_ROLES } = require('../server/roles-traitors');
  const listed = [...models.match(/CITADEL_ROLES = \[([^\]]*)\]/)[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
  assert.deepStrictEqual([...listed].sort(), Object.keys(TRAITORS_ROLES).sort());
  assert.match(read('public/js/world/world.js'), /preloadCharacters\(CITADEL_ROLES\)/);
});

test('every character file the roles use exists, and the rig has its idle animation', () => {
  const dir = path.join(ROOT, 'public/assets/models/characters');
  for (const [role, [file, height]] of Object.entries(kaykit)) {
    assert.ok(fs.existsSync(path.join(dir, `${file}.glb`)), `${role}: ${file}.glb is missing`);
    assert.ok(height > 1 && height < 3, `${role}: odd height ${height}`);
  }
  assert.ok(fs.existsSync(path.join(dir, 'anims.glb')));
});

test('no character file is left lying around unused', () => {
  const dir = path.join(ROOT, 'public/assets/models/characters');
  const used = new Set(Object.values(kaykit).map(([file]) => file));
  const elsewhere = ['public/js/world/classic-rooms.js', 'public/js/world/traitors-rooms.js', 'public/js/world/world.js'].filter((f) => fs.existsSync(path.join(ROOT, f))).map(read).join('\n');
  const orphans = fs.readdirSync(dir).filter((f) => f.endsWith('.glb') && f !== 'anims.glb').map((f) => f.slice(0, -4)).filter((f) => !used.has(f) && !elsewhere.includes(f));
  assert.deepStrictEqual(orphans, []);
});

test('the astronaut and the role models share one outline module', () => {
  const avatar = read('public/js/world/avatar.js');
  assert.match(avatar, /from '\.\/outline\.js'/);
  assert.match(models, /from '\.\/outline\.js'/);
  assert.ok(fs.existsSync(path.join(ROOT, 'public/js/world/outline.js')));
});

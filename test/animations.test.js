// Emotes, dances and character poses: every emote the server allows has an animation, a picker tile and a sound, and
// the animation files hold every clip the characters are asked to play. Run with: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const server = read('server/index.js');
const avatar = read('public/js/world/avatar.js');
const hud = read('public/js/ui/hud.js');
const main = read('public/js/main.js');
const models = read('public/js/world/models.js');

const listOf = (src, name) => {
  const m = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  assert.ok(m, `${name} is in the source`);
  return [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]);
};
const PLAYER_EMOTES = listOf(server, 'PLAYER_EMOTES');

test('the first nine emotes never move (they are the number keys), and the new dances are there', () => {
  assert.deepStrictEqual(PLAYER_EMOTES.slice(0, 9), ['wave', 'dance', 'scooby', 'scuba', 'jump', 'spin', 'shrug', 'point', 'cry']);
  for (const dance of ['floss', 'robot', 'disco', 'breakdance', 'twist', 'moonwalk']) assert.ok(PLAYER_EMOTES.includes(dance), dance);
  assert.strictEqual(new Set(PLAYER_EMOTES).size, PLAYER_EMOTES.length, 'no emote twice');
  assert.ok(PLAYER_EMOTES.length >= 24);
});

test('every emote has an animation, a picker tile and a sound', () => {
  const tiles = hud.slice(hud.indexOf('const EMOTE_TILES'), hud.indexOf('const EMOTE_GROUPS'));
  const sounds = main.slice(main.indexOf("socket.on('emote'"), main.indexOf("socket.on('bubble'"));
  const inGroups = hud.slice(hud.indexOf('const EMOTE_GROUPS'), hud.indexOf('function buildEmoteMenu'));
  for (const e of PLAYER_EMOTES) {
    assert.ok(avatar.includes(`case '${e}'`), `${e}: an animation in avatar.js`);
    assert.ok(new RegExp(`\\b${e}: \\[`).test(tiles), `${e}: a tile in the emote picker`);
    assert.ok(inGroups.includes(`'${e}'`), `${e}: listed in a picker group`);
    assert.ok(new RegExp(`\\b${e}: '`).test(sounds), `${e}: a sound`);
  }
});

test('the sounds the emotes ask for exist', () => {
  const audio = read('public/js/audio.js');
  const sounds = main.slice(main.indexOf("socket.on('emote'"), main.indexOf("socket.on('bubble'"));
  for (const [, name] of sounds.matchAll(/\w+: '(\w+)'/g)) assert.ok(new RegExp(`\\b${name}: \\(\\) =>`).test(audio), `sfx ${name}`);
});

test('every emote lasts as long as its animation needs, and dances are long enough to enjoy', () => {
  const secs = avatar.match(/const EMOTE_SECONDS = \{([\s\S]*?)\};/)[1];
  const dur = Object.fromEntries([...secs.matchAll(/(\w+): ([\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
  for (const dance of ['floss', 'robot', 'disco', 'breakdance', 'twist']) assert.ok(dur[dance] >= 4, `${dance} lasts ${dur[dance]}s`);
  for (const e of ['sleep', 'heart', 'flex', 'clap', 'cheer', 'bow', 'facepalm', 'salute', 'gasp']) assert.ok(dur[e] > 0, `${e} has a duration`);
});

test('the animation files hold every clip the characters are asked to play', () => {
  const clipsIn = (file) => {
    const b = fs.readFileSync(path.join(__dirname, '..', 'public/assets/models/characters', file));
    return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()).animations.map((a) => a.name);
  };
  const block = models.slice(models.indexOf('const POSE_CLIPS'), models.indexOf('const POSES_ONCE'));
  for (const [rig, file] of [['medium', 'anims.glb'], ['large', 'anims_large.glb']]) {
    const have = clipsIn(file);
    const part = block.slice(block.indexOf(`${rig}: {`), block.indexOf('}', block.indexOf(`${rig}: {`)));
    const wanted = [...part.matchAll(/(\w+): '(\w+)'/g)];
    assert.ok(wanted.length >= 6, `${rig} poses`);
    for (const [, pose, clip] of wanted) assert.ok(have.includes(clip), `${rig} ${pose}: ${clip} is in ${file} (${have.join(', ')})`);
  }
});

test('the reveal asks the characters for poses', () => {
  const reveal = read('public/js/ui/reveal.js');
  for (const pose of ['cheer', 'taunt', 'die', 'hit', 'wave', 'idle']) assert.ok(reveal.includes(`'${pose}'`) || models.includes(`${pose}:`), pose);
  assert.ok(reveal.includes('poseRole('));
});

test('every hat and pet the server offers has a model and a name in the picker', () => {
  const { HATS, PETS } = require('../server/cosmetics');
  const hatCode = avatar.slice(avatar.indexOf('function buildHat'), avatar.indexOf('function buildPet'));
  const petCode = avatar.slice(avatar.indexOf('function buildPet'), avatar.indexOf('// Merge a group'));
  const hatLabels = avatar.slice(avatar.indexOf('export const HAT_LABELS'), avatar.indexOf('export const PET_LABELS'));
  const petLabels = avatar.slice(avatar.indexOf('export const PET_LABELS'), avatar.indexOf('function buildHat'));
  for (const h of HATS.filter((x) => x !== 'none')) {
    assert.ok(hatCode.includes(`case '${h}'`), `hat ${h} has a model`);
    assert.ok(new RegExp(`\\b${h}: '`).test(hatLabels), `hat ${h} has a label`);
  }
  for (const p of PETS.filter((x) => x !== 'none')) {
    assert.ok(petCode.includes(`case '${p}'`), `pet ${p} has a model`);
    assert.ok(new RegExp(`\\b${p}: '`).test(petLabels), `pet ${p} has a label`);
  }
  for (const id of ['wizard', 'pirate', 'viking', 'discoball']) assert.ok(HATS.includes(id), id);
  for (const id of ['robot', 'ghost', 'starbuddy']) assert.ok(PETS.includes(id), id);
});

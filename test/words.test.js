// The game's funny lines (ARIA's stories, what the robots say at the table): every blank is one the code fills in,
// nothing is repeated, and every story reads cleanly in every script.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const story = require('../server/storyteller');

// bots.js does not export its pools: read the SAY table out of the source
const src = fs.readFileSync(path.join(__dirname, '../server/bots.js'), 'utf8');
const start = src.indexOf('const SAY = {');
const SAY = new Function(`${src.slice(start, src.indexOf('\n};', start) + 3)}; return SAY;`)();

const blanks = (line) => [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

test('what the robots say: every blank is one bots.js fills in for that kind of line, and nothing is said twice', () => {
  const allowed = { claim: ['role'], info: ['note'], suspect: ['name'], accuse: ['name'], defend: ['role'], chatter: ['name', 'role'], spoof: ['name'], lastWords: ['name'], dawn: [] };
  assert.deepStrictEqual(Object.keys(SAY).sort(), Object.keys(allowed).sort(), 'a new kind of line needs its blanks listed here');
  for (const [kind, lines] of Object.entries(SAY)) {
    assert.ok(lines.length >= 8, `${kind}: robots need a few lines to choose from (${lines.length})`);
    assert.strictEqual(new Set(lines).size, lines.length, `${kind}: a line is repeated`);
    for (const line of lines) {
      assert.strictEqual(line, line.trim(), `${kind}: stray spaces around "${line}"`);
      for (const b of blanks(line)) assert.ok(allowed[kind].includes(b), `${kind}: "${line}" uses {${b}}, which bots.js does not fill in there`);
    }
  }
  assert.ok(SAY.claim.every((l) => l.includes('{role}')), 'every claim names the role');
  assert.ok(SAY.info.every((l) => l.includes('{note}')), 'every piece of info carries the note');
});

test('ARIA\'s stories: every script gets clean, named stories for deaths, quiet nights, airlockings and returns', () => {
  const bad = (text) => /[{}]|undefined|null/.test(text);
  for (const script of ['classic', 'carnival', 'outbreak', 'traitors']) {
    for (let i = 0; i < 300; i++) {
      const death = story.dawnStory([{ name: 'Zorp' }], Math.random, script);
      assert.ok(death.includes('Zorp') && !bad(death), `${script}: "${death}"`);
      const withBio = story.dawnStory([{ name: 'Zorp', bio: 'afraid of hamsters' }], Math.random, script);
      assert.ok(withBio.includes('Zorp') && !bad(withBio), `${script}: "${withBio}"`);
      const quiet = story.dawnStory([], Math.random, script);
      assert.ok(quiet.length > 20 && !bad(quiet), `${script}: "${quiet}"`);
      const out = story.executionStory('Zorp', Math.random, i % 2 ? 'afraid of hamsters' : '', script);
      assert.ok(out.includes('Zorp') && !bad(out), `${script}: "${out}"`);
    }
  }
  for (let i = 0; i < 200; i++) {
    const back = story.reviveStory('Zorp');
    assert.ok(back.includes('Zorp') && !bad(back), back);
    const stunt = story.dawnStory([{ name: 'Zorp', cause: 'daredevil' }], Math.random, 'classic');
    assert.ok(stunt.includes('Zorp') && !bad(stunt), stunt);
  }
});

test('ARIA\'s lines are not repeated, the Daredevil ones all name the player, and ships have a good pile of names', () => {
  assert.strictEqual(new Set(story.DAREDEVIL_LINES).size, story.DAREDEVIL_LINES.length);
  assert.ok(story.DAREDEVIL_LINES.every((l) => l.includes('{name}')));
  const names = new Set();
  for (let i = 0; i < 3000; i++) names.add(story.shipName());
  assert.ok(names.size >= 25, `only ${names.size} ship names`);
  for (const n of names) assert.ok(n.length <= 28, `"${n}" is too long for the top bar`);
  // every story pool in storyteller.js is free of repeats
  const text = fs.readFileSync(path.join(__dirname, '../server/storyteller.js'), 'utf8');
  for (const m of text.matchAll(/^const ([A-Z_]+) = \[\n([\s\S]*?)\n\];/gm)) {
    const items = m[2].split('\n').map((l) => l.trim()).filter(Boolean);
    assert.strictEqual(new Set(items).size, items.length, `${m[1]} has a repeated line`);
  }
});

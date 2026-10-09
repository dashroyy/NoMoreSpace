// The ship's floor plan: can people actually walk around it? Run with: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// public/js/world/layout.js is a browser module (no imports), so load it by
// dropping its `export` keywords: that way the test uses the very same code.
const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'world', 'layout.js'), 'utf8').replace(/^export /gm, '');
const { ROOMS, CORRIDORS, TASK_STATIONS, SPAWN, moveWithCollision, roomAt, walkable } = new Function(
  `${source}\nreturn { ROOMS, CORRIDORS, TASK_STATIONS, SPAWN, moveWithCollision, roomAt, walkable };`,
)();

const SPEED = 5.5; // metres per second (world.js)

// Walk in a straight line the way the game does: small steps, sliding along walls.
function walk(x, z, dx, dz, seconds, fps = 60) {
  const len = Math.hypot(dx, dz);
  const seen = new Set();
  for (let i = 0; i < seconds * fps; i++) {
    [x, z] = moveWithCollision(x, z, (dx / len) * (SPEED / fps), (dz / len) * (SPEED / fps));
    seen.add(roomAt(x, z));
  }
  return { x, z, seen };
}

test('every gate can be walked through, in both directions', () => {
  for (const [x0, z0, x1, z1] of CORRIDORS) {
    const alongX = x1 - x0 > z1 - z0;
    const mid = alongX ? (z0 + z1) / 2 : (x0 + x1) / 2;
    const length = alongX ? x1 - x0 : z1 - z0;
    const seconds = (length + 4) / SPEED + 0.3;
    const lo = alongX ? [x0 - 2, mid] : [mid, z0 - 2];
    const hi = alongX ? [x1 + 2, mid] : [mid, z1 + 2];
    const forward = walk(lo[0], lo[1], alongX ? 1 : 0, alongX ? 0 : 1, seconds);
    const back = walk(hi[0], hi[1], alongX ? -1 : 0, alongX ? 0 : -1, seconds);
    const label = `corridor [${x0}, ${z0}, ${x1}, ${z1}]`;
    assert.ok(alongX ? forward.x >= hi[0] - 0.2 : forward.z >= hi[1] - 0.2, `${label}: blocked going forward at ${forward.x.toFixed(2)}, ${forward.z.toFixed(2)}`);
    assert.ok(alongX ? back.x <= lo[0] + 0.2 : back.z <= lo[1] + 0.2, `${label}: blocked going back at ${back.x.toFixed(2)}, ${back.z.toFixed(2)}`);
  }
});

test('walking out of the bridge by each gate reaches the next room', () => {
  const north = walk(0, -5, 0, -1, 4);
  const south = walk(0, 5, 0, 1, 4);
  const west = walk(-5, 0, -1, 0, 4);
  const east = walk(5, 0, 1, 0, 4);
  assert.ok(north.seen.has('observation'), 'north gate to the Observation Deck');
  assert.ok(south.seen.has('engine'), 'south gate to the Engine Room');
  assert.ok(west.seen.has('medbay'), 'west gate to the Medbay');
  assert.ok(east.seen.has('galley'), 'east gate to the Galley');
});

test('every room and every task console can be reached on foot from the spawn point', () => {
  // flood-fill the walkable floor on a 0.25 m grid
  const step = 0.25;
  const key = (x, z) => `${Math.round(x / step)},${Math.round(z / step)}`;
  const seen = new Set([key(SPAWN.x, SPAWN.z)]);
  const queue = [[SPAWN.x, SPAWN.z]];
  while (queue.length) {
    const [x, z] = queue.pop();
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const nx = x + dx;
      const nz = z + dz;
      const k = key(nx, nz);
      if (!seen.has(k) && walkable(nx, nz)) {
        seen.add(k);
        queue.push([nx, nz]);
      }
    }
  }
  for (const room of ROOMS) {
    const [x0, z0, x1, z1] = room.rect;
    assert.ok(seen.has(key((x0 + x1) / 2, (z0 + z1) / 2)) || seen.has(key((x0 + x1) / 2, (z0 + z1) / 2 + 3)), `${room.name} is cut off`);
  }
  for (const [task, pos] of Object.entries(TASK_STATIONS)) {
    // the console itself may stand on a wall's edge, so what matters is that you can get within reach (2 m) of it
    let near = false;
    for (let dx = -1.75; dx <= 1.75 && !near; dx += step) for (let dz = -1.75; dz <= 1.75 && !near; dz += step) if (Math.hypot(dx, dz) < 1.9 && seen.has(key(pos.x + dx, pos.z + dz))) near = true;
    assert.ok(near, `the ${task} console cannot be reached on foot`);
  }
});

test('each task console stands in its own room', () => {
  for (const room of ROOMS.filter((r) => r.task)) {
    const pos = TASK_STATIONS[room.task];
    assert.strictEqual(roomAt(pos.x, pos.z), room.id, `${room.task} should be in the ${room.name}`);
  }
});

test('the thrusters console is out in the open, not hidden behind an engine', () => {
  const pos = TASK_STATIONS.thrusters;
  // the engines sit at x = -5 and x = +5, 28 m south (ship.js, buildProps 'engine'): about 2 m across
  for (const ex of [-5, 5]) assert.ok(Math.hypot(pos.x - ex, pos.z - 28) > 3.5, `the console is hidden behind the engine at x=${ex}`);
  const room = ROOMS.find((r) => r.id === 'engine');
  const gateNorth = [0, room.rect[1]];
  assert.ok(Math.hypot(pos.x - gateNorth[0], pos.z - gateNorth[1]) < 11, 'easy to spot from the room entrance');
});

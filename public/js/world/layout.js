// The ship's floor plan. x = left/right, z = up/down on screen (north is -z).
// Rooms and corridors are rectangles: [x0, z0, x1, z1].

export const ROOMS = [
  { id: 'bridge', name: 'Bridge', rect: [-10, -10, 10, 10], floor: 0x2d3458, light: 0x7f6bff },
  { id: 'observation', name: 'Observation Deck', rect: [-10, -34, 10, -18], floor: 0x222d51, light: 0x6cc8ff, task: 'telescope' },
  { id: 'navigation', name: 'Navigation', rect: [-34, -30, -18, -18], floor: 0x263446, light: 0x58ffd0, task: 'course' },
  { id: 'comms', name: 'Comms', rect: [18, -30, 34, -18], floor: 0x2d2d4a, light: 0x4fa8ff, task: 'signal' },
  { id: 'medbay', name: 'Medbay', rect: [-34, -8, -18, 8], floor: 0x2d3f46, light: 0x7dffb0, task: 'samples' },
  { id: 'galley', name: 'Galley', rect: [18, -8, 34, 8], floor: 0x45342d, light: 0xffb36b, task: 'noodles' },
  { id: 'reactor', name: 'Reactor', rect: [-34, 18, -18, 30], floor: 0x3c263f, light: 0xff4f6e, task: 'core' },
  { id: 'engine', name: 'Engine Room', rect: [-10, 18, 10, 32], floor: 0x3c2d2d, light: 0xff7a3a, task: 'thrusters' },
  { id: 'hydroponics', name: 'Hydroponics', rect: [18, 18, 34, 30], floor: 0x283f2d, light: 0x9bff6b, task: 'plants' },
  { id: 'airlock', name: 'Airlock', rect: [-48, -5, -40, 5], floor: 0x3c3422, light: 0xff3030, task: 'vents' },
  { id: 'quarters', name: 'Crew Quarters', rect: [40, -6, 52, 6], floor: 0x342d4a, light: 0xd8a6ff, task: 'cat' },
  { id: 'cargo', name: 'Cargo Bay', rect: [-10, 38, 10, 48], floor: 0x34342a, light: 0xffe27a, task: 'hamsters' },
];

const H = 1.6; // half corridor width
export const CORRIDORS = [
  [-H, -18, H, -10],
  [-H, 10, H, 18],
  [-18, -H, -10, H],
  [10, -H, 18, H],
  [-27.6, -18, -24.4, -8],
  [-27.6, 8, -24.4, 18],
  [24.4, -18, 27.6, -8],
  [24.4, 8, 27.6, 18],
  [-40, -H, -34, H],
  [34, -H, 40, H],
  [-H, 32, H, 38],
  [-18, -25.6, -10, -22.4],
  [10, -25.6, 18, -22.4],
  [-18, 23.4, -10, 26.6],
  [10, 23.4, 18, 26.6],
];

export const PLAYER_RADIUS = 0.45;
const R = PLAYER_RADIUS;

// Rooms are station modules with their corners cut off at 45° (octagons),
// not plain boxes. This is how far each corner is cut back.
export function chamferOf([x0, z0, x1, z1]) {
  return Math.min(2.4, Math.min(x1 - x0, z1 - z0) * 0.2);
}

// The eight corners of a room's outline, clockwise from the north-west.
export function roomOutline(rect) {
  const [x0, z0, x1, z1] = rect;
  const c = chamferOf(rect);
  return [[x0 + c, z0], [x1 - c, z0], [x1, z0 + c], [x1, z1 - c], [x1 - c, z1], [x0 + c, z1], [x0, z1 - c], [x0, z0 + c]];
}

// The four cut-off corner walls: { a: [x, z], b: [x, z], south }
export function cornerWalls(rect) {
  const [x0, z0, x1, z1] = rect;
  const c = chamferOf(rect);
  return [
    { a: [x0, z0 + c], b: [x0 + c, z0], south: false },
    { a: [x1 - c, z0], b: [x1, z0 + c], south: false },
    { a: [x1, z1 - c], b: [x1 - c, z1], south: true },
    { a: [x0 + c, z1], b: [x0, z1 - c], south: true },
  ];
}

// Inside a room, at least `pad` away from its walls (including the cut corners).
function inRoom(rect, x, z, pad) {
  const [x0, z0, x1, z1] = rect;
  if (x < x0 + pad || x > x1 - pad || z < z0 + pad || z > z1 - pad) return false;
  const min = chamferOf(rect) + pad * Math.SQRT2;
  const dx0 = x - x0;
  const dx1 = x1 - x;
  const dz0 = z - z0;
  const dz1 = z1 - z;
  return dx0 + dz0 >= min && dx1 + dz0 >= min && dx0 + dz1 >= min && dx1 + dz1 >= min;
}

// Corridors only shrink across their width so they join up with the rooms at each end.
const CORRIDOR_WALKABLE = CORRIDORS.map(([x0, z0, x1, z1]) => (x1 - x0 < z1 - z0 ? [x0 + R, z0, x1 - R, z1] : [x0, z0 + R, x1, z1 - R]));

export function walkable(x, z) {
  return ROOMS.some((r) => inRoom(r.rect, x, z, R)) || CORRIDOR_WALKABLE.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
}

export function roomAt(x, z) {
  const room = ROOMS.find(({ rect: [x0, z0, x1, z1] }) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
  return room ? room.id : 'corridor';
}

export function roomById(id) {
  return ROOMS.find((r) => r.id === id);
}

// Move from (x, z) by (dx, dz), sliding along walls.
export function moveWithCollision(x, z, dx, dz) {
  if (walkable(x + dx, z + dz)) return [x + dx, z + dz];
  if (walkable(x + dx, z)) return [x + dx, z];
  if (walkable(x, z + dz)) return [x, z + dz];
  return [x, z];
}

// Seats around the bridge table (clockwise from the top).
export const TABLE_RADIUS = 3.2;
export const SEAT_RADIUS = 5.6;
export function seatPosition(seat, count) {
  const a = -Math.PI / 2 + (seat / Math.max(1, count)) * Math.PI * 2;
  return { x: Math.cos(a) * SEAT_RADIUS, z: Math.sin(a) * SEAT_RADIUS, facing: Math.atan2(-Math.cos(a), -Math.sin(a)) };
}

// Where each task console stands.
export const TASK_STATIONS = {
  telescope: { x: 6, z: -30 },
  course: { x: -26, z: -26 },
  signal: { x: 30, z: -26 },
  samples: { x: -30, z: 4 },
  noodles: { x: 30, z: 4 },
  core: { x: -26, z: 24 },
  thrusters: { x: 6, z: 28 },
  plants: { x: 28, z: 26 },
  vents: { x: -46, z: 0 },
  cat: { x: 48, z: 3 },
  hamsters: { x: 6, z: 45 },
};

// Spots where night drawings get pinned up (easels facing the camera).
export const DRAWING_SLOTS = [
  { x: 22, z: -5 }, { x: 26, z: -5 }, { x: 30, z: -5 },
  { x: -7, z: -7.5 }, { x: 7, z: -7.5 },
  { x: 44, z: -3.5 }, { x: 48, z: -3.5 },
  { x: -30, z: -5 }, { x: -22, z: -5 },
  { x: -6, z: 20.5 }, { x: 22, z: 20.5 }, { x: -30, z: 20.5 },
  { x: -6, z: -31.5 }, { x: 22, z: -27.5 }, { x: -6, z: 40.5 },
];

export const SPAWN = { x: 0, z: 7.5 };

const EPS = 0.01;

// Edges of a rectangle minus the parts where another rectangle joins it.
// chamfer: trim this much off both ends of every edge (for rooms with cut corners).
export function wallSegments(rect, others, chamfer = 0) {
  const [x0, z0, x1, z1] = rect;
  const edges = [
    { axis: 'x', fixed: z0, from: x0, to: x1, side: 'north' },
    { axis: 'x', fixed: z1, from: x0, to: x1, side: 'south' },
    { axis: 'z', fixed: x0, from: z0, to: z1, side: 'west' },
    { axis: 'z', fixed: x1, from: z0, to: z1, side: 'east' },
  ];
  const out = [];
  for (const e of edges) {
    const holes = [];
    for (const [bx0, bz0, bx1, bz1] of others) {
      if (e.axis === 'x' && bz0 <= e.fixed + EPS && bz1 >= e.fixed - EPS) {
        const a = Math.max(e.from, bx0);
        const b = Math.min(e.to, bx1);
        if (b - a > EPS) holes.push([a, b]);
      }
      if (e.axis === 'z' && bx0 <= e.fixed + EPS && bx1 >= e.fixed - EPS) {
        const a = Math.max(e.from, bz0);
        const b = Math.min(e.to, bz1);
        if (b - a > EPS) holes.push([a, b]);
      }
    }
    holes.sort((a, b) => a[0] - b[0]);
    const start = e.from + chamfer;
    const end = e.to - chamfer;
    let cursor = start;
    for (const [a, b] of holes) {
      const a2 = Math.min(Math.max(a, start), end);
      if (a2 - cursor > EPS) out.push({ ...e, from: cursor, to: a2 });
      cursor = Math.max(cursor, Math.min(b, end));
    }
    if (end - cursor > EPS) out.push({ ...e, from: cursor, to: end });
  }
  return out;
}


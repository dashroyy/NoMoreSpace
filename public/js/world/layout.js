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

// Shrunk rectangles you can stand in (corridors only shrink across their width
// so they join up with the rooms at each end).
const WALKABLE = [
  ...ROOMS.map(({ rect: [x0, z0, x1, z1] }) => [x0 + R, z0 + R, x1 - R, z1 - R]),
  ...CORRIDORS.map(([x0, z0, x1, z1]) => (x1 - x0 < z1 - z0 ? [x0 + R, z0, x1 - R, z1] : [x0, z0 + R, x1, z1 - R])),
];

export function walkable(x, z) {
  return WALKABLE.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
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

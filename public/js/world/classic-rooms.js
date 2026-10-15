// 🚀 The classic station's rooms, dressed with real models (CC0, see assets.js). KayKit's Restaurant,
// Furniture and Space Base Bits: a proper kitchen and dining tables in the Galley, a lounge in the Crew
// Quarters, stacks of cargo and a water tank in the Cargo Bay, and space farms in Hydroponics. Kenney's
// Space Station Kit and Space Kit: consoles on the Bridge, the Navigation and Comms rooms, seats and a
// rail at the Observation Deck's window, beds in the Medbay and the Quarters, generators in the Reactor
// and Engine Room. Only the space station (Black Hole Blues) gets them: the other scripts have rooms
// of their own.
//
// The models are fetched the first time the station is shown. Until then (or if they cannot be
// fetched) the plain boxes that used to stand in those rooms stay: ship.js keeps them in a
// "fallback" group per room, and this file hides the group once its models are in.
import * as THREE from 'three';
import { ROOMS } from './layout.js';
import { loadModels, model } from './assets.js';
import { mergeStatic } from './carnival-rooms.js';

const R = (n) => `restaurant/${n}`;
const F = (n) => `furniture/${n}`;
const S = (n) => `spacebase/${n}`;
const K = (n) => `station/${n}`; // Kenney's Space Station Kit (about half a metre per model: scaled up to suit the crew)
const X = (n) => `spacekit/${n}`; // Kenney's Space Kit

const MODEL_NAMES = [
  'kitchencounter_sink_backsplash', 'kitchencounter_straight_A_backsplash', 'kitchencounter_straight_A_decorated', 'stove_multi_decorated',
  'kitchentable_A_large_decorated_A', 'chair_A', 'crate_tomatoes', 'crate_lettuce',
].map(R).concat([
  'couch', 'armchair', 'table_low_decorated', 'lamp_standing', 'rug_rectangle_A', 'cactus_medium_A',
].map(F), [
  'space_farm_large_sprinkler', 'space_farm_small', 'cargo_A_stacked', 'cargo_B_stacked', 'cargo_B_packed', 'cargodepot_A', 'water_storage', 'eco_module', 'lander_A',
].map(S), [
  'computer-wide', 'computer-system', 'computer-screen', 'computer', 'display-wall-wide', 'balcony-rail-center', 'chair-cushion-headrest', 'chair-armrest-headrest', 'chair',
  'table-display', 'bed-single', 'container', 'container-tall', 'pipe-ring-colored',
].map(K), [
  'machine_generator', 'machine_generatorLarge', 'machine_barrelLarge', 'machine_wirelessCable',
].map(X));

export class ClassicRooms {
  constructor(ship) {
    this.ship = ship;
    this.group = new THREE.Group();
    this.group.visible = false;
    ship.add(this.group);
    this.dressed = false;
    this.ready = Promise.resolve(); // settles when the models are in (the start screen waits for it)
  }

  async dress() {
    this.dressed = true;
    await loadModels(MODEL_NAMES);
    const root = new THREE.Group();
    const placed = {};
    // a model at a spot in a room (x, z from the room's centre). s = scale, ry = turn (0 faces south, to the camera)
    const put = (roomId, name, x, z, { s = 1, ry = 0, y = 0 } = {}) => {
      const m = model(name);
      if (!m) return;
      const [x0, z0, x1, z1] = ROOMS.find((r) => r.id === roomId).rect;
      m.position.set((x0 + x1) / 2 + x, y, (z0 + z1) / 2 + z);
      m.rotation.y = ry;
      m.scale.setScalar(s);
      root.add(m);
      placed[roomId] = (placed[roomId] || 0) + 1;
    };

    // ---------- 🍲 Galley: a kitchen along the north wall, two dining tables with chairs ----------
    put('galley', R('kitchencounter_sink_backsplash'), -4.5, -6.55, { s: 0.9 });
    put('galley', R('kitchencounter_straight_A_backsplash'), -2.7, -6.55, { s: 0.9 });
    put('galley', R('stove_multi_decorated'), 2.7, -6.55, { s: 0.9 });
    put('galley', R('kitchencounter_straight_A_decorated'), 4.6, -6.55, { s: 0.9 });
    put('galley', R('crate_tomatoes'), 7.0, -4.3, { s: 0.45, ry: 0.3 });
    put('galley', R('crate_lettuce'), 7.0, -3.2, { s: 0.45, ry: -0.2 });
    for (const x of [-3.5, 1.0]) {
      put('galley', R('kitchentable_A_large_decorated_A'), x, 2.0, { s: 0.9 });
      for (const dx of [-0.8, 0.8]) {
        put('galley', R('chair_A'), x + dx, 0.55, { s: 0.85 });
        put('galley', R('chair_A'), x + dx, 3.45, { s: 0.85, ry: Math.PI });
      }
    }

    // ---------- 🛏️ Crew Quarters: a lounge by the north wall ----------
    put('quarters', F('rug_rectangle_A'), 0, -3.3, { s: 1.4, y: 0.012 });
    put('quarters', F('couch'), 0, -4.8, { s: 0.85 });
    put('quarters', F('table_low_decorated'), 0, -2.9, { s: 0.8 });
    put('quarters', F('armchair'), -4.0, -3.3, { s: 0.85, ry: 0.9 });
    put('quarters', F('armchair'), 4.0, -3.3, { s: 0.85, ry: -0.9 });
    put('quarters', F('lamp_standing'), -3.0, -5.1, { s: 0.7 });
    put('quarters', F('lamp_standing'), 3.0, -5.1, { s: 0.7 });
    put('quarters', F('cactus_medium_A'), 0.7, -2.9, { s: 0.5, y: 0.8 });

    // ---------- 📦 Cargo Bay: real cargo ----------
    [-7.2, -5.5, -3.8].forEach((x, i) => put('cargo', S('cargo_A_stacked'), x, -3.8, { s: 1.5, ry: i * 0.3 }));
    put('cargo', S('cargodepot_A'), 3.6, -3.6, { s: 1.3 });
    put('cargo', S('water_storage'), 5.9, -3.5, { s: 1.3 });
    put('cargo', S('eco_module'), 7.6, -3.3, { s: 1.15 });
    [[-6.5, 0.5], [-4.2, 1.7], [-1.6, 2.0]].forEach(([x, z], i) => put('cargo', S('cargo_B_stacked'), x, z, { s: 1.4, ry: i * 0.9 }));
    [[-7.6, 2.6], [-6.2, 3.1], [0.6, 0.6], [2.3, 1.9]].forEach(([x, z], i) => put('cargo', S('cargo_B_packed'), x, z, { s: 1.7, ry: i * 0.6 }));
    put('cargo', S('lander_A'), -1.0, -0.4, { s: 1.4, ry: 0.5 });

    // ---------- 🌱 Hydroponics: space farms ----------
    [-6.0, -3.0, 0.0, 3.0].forEach((x) => put('hydroponics', S('space_farm_large_sprinkler'), x, -4.0, { s: 1.4 }));
    put('hydroponics', S('space_farm_small'), 5.6, -4.0, { s: 1.2 });
    put('hydroponics', S('space_farm_small'), -6.6, 3.4, { s: 1.2 });

    // ---------- Kenney's station kit. The camera looks from the south, so tall things stand along the north wall
    // (and the east and west walls, turned to face in), the south half stays low, and every doorway is left clear ----------
    const WEST = Math.PI / 2; // faces east, for a west wall
    const EAST = -Math.PI / 2; // faces west, for an east wall
    const NORTH = Math.PI; // faces north (a seat looking at a console or a window)
    // 🧑‍✈️ Bridge: a row of consoles each side of the north gate, and screens on the side walls
    for (const x of [-6.8, -4.8, -2.8, 2.8, 4.8, 6.8]) put('bridge', K('computer-wide'), x, -9.2, { s: 2.4 });
    for (const z of [-3.2, 3.2]) {
      put('bridge', K('computer-system'), -9.1, z, { s: 2.4, ry: WEST });
      put('bridge', K('computer-system'), 9.1, z, { s: 2.4, ry: EAST });
    }
    // 🔭 Observation Deck: a rail along the great window, seats facing it and a hologram table
    for (const x of [-5.2, -2.6, 0, 2.6, 5.2]) put('observation', K('balcony-rail-center'), x, -7.0, { s: 2.6 });
    [-6, -3.6, -1.2, 1.2].forEach((x) => put('observation', K('chair-cushion-headrest'), x, 2.4, { s: 2.6, ry: NORTH }));
    put('observation', K('table-display'), 7, 1.8, { s: 2.6 });
    // 🧭 Navigation: consoles and chairs round the star map
    for (const x of [-5.0, -2.9, 2.9, 5.0]) put('navigation', K('computer-wide'), x, -5.2, { s: 2.4 });
    for (const x of [-2.9, 2.9]) put('navigation', K('chair-armrest-headrest'), x, -3.5, { s: 2.6, ry: NORTH });
    put('navigation', K('display-wall-wide'), -7.2, 0, { s: 2.6, ry: WEST });
    put('navigation', K('display-wall-wide'), 7.2, -4.2, { s: 2.6, ry: EAST });
    // 📡 Comms: racks of equipment along the north wall
    for (const x of [-5.0, -2.2, 0.6]) put('comms', K('computer-system'), x, -5.0, { s: 2.4 });
    put('comms', X('machine_wirelessCable'), 6.2, -4.8, { s: 2.4 });
    for (const x of [-5.0, -2.2]) put('comms', K('chair'), x, -3.2, { s: 2.6, ry: NORTH });
    put('comms', K('display-wall-wide'), -7.2, 3.8, { s: 2.6, ry: WEST });
    put('comms', K('display-wall-wide'), 7.2, -3.2, { s: 2.6, ry: EAST });
    // 🩺 Medbay: three real beds, a locker and screens
    [-5.5, -2.5, 0.5].forEach((x) => put('medbay', K('bed-single'), x, -3.9, { s: 2.6 }));
    put('medbay', K('container-tall'), 6.6, -4.6, { s: 2.2 });
    put('medbay', K('computer-system'), 7.1, 3.9, { s: 2.4, ry: EAST });
    put('medbay', K('computer-screen'), -7.1, 3.0, { s: 2.4, ry: WEST });
    // ☢️ Reactor: generators beside the core and pipes
    put('reactor', X('machine_generatorLarge'), -5.4, -3.9, { s: 2.4 });
    put('reactor', X('machine_generatorLarge'), 5.4, -3.9, { s: 2.4 });
    put('reactor', K('pipe-ring-colored'), -7.0, 1.0, { s: 2.6 });
    put('reactor', K('pipe-ring-colored'), 7.0, 1.0, { s: 2.6 });
    // 🛠️ Engine Room: a bank of generators along the north wall, with barrels
    for (const x of [-7.0, -4.6, 4.6, 7.0]) put('engine', X('machine_generator'), x, -5.6, { s: 2.4 });
    put('engine', X('machine_barrelLarge'), -8.4, -3.2, { s: 2.4 });
    put('engine', X('machine_barrelLarge'), 8.4, -3.2, { s: 2.4, ry: 1 });
    // 🚪 Airlock: lockers and a console by the inner door
    put('airlock', K('container'), -0.8, -4.1, { s: 2.2 });
    put('airlock', K('container'), 1.2, -4.1, { s: 2.2, ry: 0.2 });
    put('airlock', K('computer'), 2.7, -4.3, { s: 2.4 });
    // 🛏️ Crew Quarters: the three bunks (the sleep pods stay round them)
    [-4, -1.5, 1].forEach((x) => put('quarters', K('bed-single'), x, 3, { s: 2.6 }));

    this.group.add(mergeStatic(root));
    root.clear();
    // the plain stand-ins can go once the real thing is there
    for (const [id, count] of Object.entries(placed)) if (count && this.ship.userData.fallbacks?.[id]) this.ship.userData.fallbacks[id].visible = false;
  }

  setActive(on) {
    this.group.visible = on;
    if (on && !this.dressed) this.ready = this.dress();
  }
}

// 🚀 The classic station's rooms, dressed with real models (KayKit Restaurant, Furniture and
// Space Base Bits, CC0, see assets.js): a proper kitchen and dining tables in the Galley, a
// lounge in the Crew Quarters, stacks of cargo and a water tank in the Cargo Bay, and space farms
// in Hydroponics. Only the space station (Black Hole Blues) gets them: the other scripts have
// rooms of their own.
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

const MODEL_NAMES = [
  'kitchencounter_sink_backsplash', 'kitchencounter_straight_A_backsplash', 'kitchencounter_straight_A_decorated', 'stove_multi_decorated',
  'kitchentable_A_large_decorated_A', 'chair_A', 'crate_tomatoes', 'crate_lettuce',
].map(R).concat([
  'couch', 'armchair', 'table_low_decorated', 'lamp_standing', 'rug_rectangle_A', 'cactus_medium_A',
].map(F), [
  'space_farm_large_sprinkler', 'space_farm_small', 'cargo_A_stacked', 'cargo_B_stacked', 'cargo_B_packed', 'cargodepot_A', 'water_storage', 'eco_module', 'lander_A',
].map(S));

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

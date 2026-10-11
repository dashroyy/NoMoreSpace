// Phase to Space: answering the questions the game asks (and what you have selected right now).
import { problem } from '../util.js';
import { send } from './net.js';
import { sfx } from './sound.js';

// what the person is doing right now: a selected card, and the questions already answered
export const ui = { selected: null, answered: new Set() };

export function respond(rid, answer) {
  if (ui.answered.has(rid)) return Promise.resolve();
  ui.answered.add(rid);
  return send('respond', { rid, answer }).catch((e) => {
    ui.answered.delete(rid);
    problem(e.message);
    sfx('error');
  });
}

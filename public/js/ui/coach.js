// The first-game coach: a friendly bubble that points at the right button the
// first time each key moment comes up, then never shows that tip again.
// Only for newcomers (fewer than 2 finished games in this browser).
import { $, el, clear } from '../util.js';
import { store } from '../store.js';
import { progress } from '../progress.js';
import { sfx } from '../audio.js';
import { uiZoom } from './settings.js';

const KEY = 'nms-coach';

// In order of priority. when(state) says if the moment is now; at is the button to point at.
const TIPS = [
  { id: 'role', at: '#btn-role', when: (s) => ['dawn', 'roam'].includes(s.phase) && s.day === 1 && s.you?.alive, text: 'This is your role card. Press R any time to see your ability, tips and everything you have learned.' },
  { id: 'night', at: '#night-action', when: (s) => s.phase === 'night' && s.you?.prompt && !s.you.prompt.done, text: 'Your role wakes up tonight! Pick your target here before dawn, or ARIA picks at random.' },
  { id: 'rooms', at: '#btn-rooms', when: (s) => s.phase === 'roam' && s.you?.alive, text: 'Press M to teleport between rooms. Only people in the same room hear you, so meet up for private talks.' },
  { id: 'ready', at: '#btn-ready', when: (s) => s.phase === 'roam' && s.you?.alive && s.day >= 1, after: 'rooms', text: 'Done exploring? Press Ready. When everyone is ready, the ship moves on without waiting for the timer.' },
  { id: 'claim', at: '#btn-claim', when: (s) => s.phase === 'meeting' && s.you?.alive, text: 'Tell everyone which role you are (truthfully or not!) with Claim. It shows by your seat.' },
  { id: 'nominate', at: '#btn-nominate', when: (s) => s.phase === 'nominations' && !s.nomination && s.you?.alive, text: 'Think someone is the Parasite? Nominate them. Everyone then votes YES or NO.' },
  { id: 'vote', at: '#vote-panel', when: (s) => s.phase === 'nominations' && s.nomination && s.nomination.stage !== 'count' && (s.you?.alive || s.you?.ghostVote), text: 'Vote YES to airlock them, NO to spare them (or press Y / N). You can change your mind until the count.' },
  { id: 'react', at: '#reactions', when: (s) => ['lastwords', 'dawn'].includes(s.phase), text: 'React to the big moments! Your emoji float up from your seat for everyone to see.' },
  { id: 'ghost', at: '#btn-predict', when: (s) => s.you?.alive === false && !['lobby', 'ended'].includes(s.phase), text: 'You are a ghost, but not out of the game! Bet on the Parasite and, while the crew explores, haunt them.' },
];

let showing = null;

function seen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function markSeen(id) {
  const s = seen();
  s.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {}
}

export function resetCoach() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

function visible(node) {
  if (!node) return false;
  const r = node.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && !node.closest('[hidden]');
}

export function initCoach() {
  window.addEventListener('resize', place);
  setInterval(place, 500); // buttons move around as the HUD changes
}

export function renderCoach(state) {
  const box = $('coach');
  if (!state?.you || state.you.isCaptain || state.you.isSpectator || (progress().games >= 2 && !state.practice)) return hide();
  const done = seen();
  // keep the current tip while its moment lasts
  if (showing) {
    const tip = TIPS.find((t) => t.id === showing);
    if (tip.when(state) && visible(document.querySelector(tip.at))) return place();
    hide();
  }
  const next = TIPS.find((t) => !done.has(t.id) && (!t.after || done.has(t.after)) && t.when(state) && visible(document.querySelector(t.at)));
  if (!next) return;
  showing = next.id;
  clear(box,
    el('div', { className: 'coach-text' }, el('b', {}, '💡 Tip: '), next.text),
    el('button', { className: 'small primary', onclick: () => { markSeen(next.id); sfx('pop'); hide(); } }, 'Got it'),
  );
  box.hidden = false;
  place();
}

function hide() {
  showing = null;
  $('coach').hidden = true;
}

// Sit just above (or below) the button the tip is about.
function place() {
  const box = $('coach');
  if (!showing || box.hidden) return;
  const target = document.querySelector(TIPS.find((t) => t.id === showing).at);
  if (!visible(target)) return hide();
  const r = target.getBoundingClientRect();
  const z = uiZoom(); // the text-size setting zooms the coach too: work in screen pixels, then divide
  const w = box.offsetWidth * z;
  const h = box.offsetHeight * z;
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const above = r.top - h - 14 > 8;
  box.style.left = `${left / z}px`;
  box.style.top = `${(above ? r.top - h - 14 : r.bottom + 14) / z}px`;
  box.classList.toggle('below', !above);
  box.style.setProperty('--arrow', `${Math.max(16, Math.min(w - 16, r.left + r.width / 2 - left)) / z}px`);
}

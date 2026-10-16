// Star Bonanza: Settings. Volumes, graphics quality and camera shake, remembered in this browser and
// opened from the title screen, the lobby and the in-game menu.
import { el } from '../util.js';
import { setVolumes, sfx, unlock } from './sound.js';
import { openModal } from './codex.js';
import { btn } from './ui.js';

const KEY = 'sbz-settings';
const DEFAULTS = { master: 80, music: 50, effects: 80, muted: false, quality: 'high', shake: true };

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) return { ...DEFAULTS, ...saved };
    // the first version had two on/off switches
    const s = { ...DEFAULTS };
    if (localStorage.getItem('sbz-sound') === '0') s.muted = true;
    if (localStorage.getItem('sbz-music') === '0') s.music = 0;
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = load();
let world = null;

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {}
}

export function applySettings(w = world) {
  world = w;
  setVolumes(settings);
  if (world) {
    world.stage.setQuality(settings.quality);
    world.stage.shakeScale = settings.shake ? 1 : 0;
  }
}

export function setSetting(key, value) {
  settings[key] = value;
  save();
  applySettings();
  for (const fn of listeners) fn(settings);
}
const listeners = new Set();
export const onSettings = (fn) => listeners.add(fn);

export function toggleMute() {
  unlock();
  setSetting('muted', !settings.muted);
  return settings.muted;
}

// ---------------------------------------------------------------------------

function slider(key, label, glyph) {
  const out = el('output', { className: 'set-val' }, `${settings[key]}`);
  const input = el('input', {
    type: 'range',
    min: 0,
    max: 100,
    step: 5,
    value: settings[key],
    'aria-label': label,
    oninput: () => {
      unlock();
      out.textContent = input.value;
      input.style.setProperty('--v', `${input.value}%`);
      setSetting(key, Number(input.value));
    },
    onchange: () => sfx('select'),
  });
  input.style.setProperty('--v', `${settings[key]}%`);
  return el('label', { className: 'set-row' }, el('span', { className: 'set-glyph' }, glyph), el('span', { className: 'set-label' }, label), input, out);
}

function choice(key, label, glyph, options) {
  const row = el('div', { className: 'segmented', role: 'radiogroup', 'aria-label': label });
  const draw = () =>
    row.replaceChildren(
      ...options.map(([value, text]) =>
        el('button', { type: 'button', className: `seg ${settings[key] === value ? 'on' : ''}`, role: 'radio', 'aria-checked': String(settings[key] === value), onclick: () => (setSetting(key, value), draw()) }, text),
      ),
    );
  draw();
  return el('div', { className: 'set-row' }, el('span', { className: 'set-glyph' }, glyph), el('span', { className: 'set-label' }, label), row);
}

function onOff(key, label, glyph, hint) {
  const sw = el('button', {
    type: 'button',
    className: `switch ${settings[key] ? 'on' : ''}`,
    role: 'switch',
    'aria-checked': String(!!settings[key]),
    'aria-label': label,
    onclick: () => {
      setSetting(key, !settings[key]);
      sw.classList.toggle('on', !!settings[key]);
      sw.setAttribute('aria-checked', String(!!settings[key]));
    },
  });
  return el('div', { className: 'set-row' }, el('span', { className: 'set-glyph' }, glyph), el('span', { className: 'set-label' }, label, hint ? el('small', {}, hint) : null), sw);
}

export function openSettings() {
  const mute = onOff('muted', 'Mute everything', '🔇');
  openModal(
    el(
      'div',
      { className: 'settings' },
      el('h3', { className: 'set-head' }, 'Audio'),
      slider('master', 'Master volume', '🔊'),
      slider('music', 'Music', '🎵'),
      slider('effects', 'Sound effects', '💥'),
      mute,
      el('h3', { className: 'set-head' }, 'Display'),
      choice('quality', 'Graphics', '✨', [
        ['high', 'High'],
        ['balanced', 'Balanced'],
        ['low', 'Low'],
      ]),
      onOff('shake', 'Camera shake', '🎥', 'When a nursery is harvested'),
      el(
        'div',
        { className: 'set-foot' },
        btn('Reset to defaults', () => {
          Object.assign(settings, DEFAULTS);
          setSetting('master', DEFAULTS.master);
          openSettings();
        }, 'ghost'),
      ),
    ),
    { title: 'Settings' },
  );
}

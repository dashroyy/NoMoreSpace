// ⚙️ Settings: everything about how the game looks and sounds, in one place,
// remembered in this browser. (The quick icons in the top bar still work.)
import { $, el, toast } from '../util.js';
import { store } from '../store.js';
import { openModal } from './rolecard.js';
import { sfx, soundEnabled, setSound, musicEnabled, setMusic, setAmbient, unlockAudio, getVolume, setVolume } from '../audio.js';
import { captionsEnabled, setCaptions } from './captions.js';
import { getVoiceVolume, setVoiceVolume } from '../voice.js';
import { ttsMode, cycleTts, ttsSupported } from '../tts.js';
import { toggleVoice, voiceEnabled } from '../voice.js';
import { resetCoach } from './coach.js';

const SIZES = [['s', 'S', 0.9], ['m', 'M', 1], ['l', 'L', 1.15], ['xl', 'XL', 1.3]];

function get(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function set(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

// Text size scales every panel and button (not the 3D ship itself).
export function applyTextSize(id = get('nms-text', 'm')) {
  const size = SIZES.find(([s]) => s === id) || SIZES[1];
  document.documentElement.style.setProperty('--ui-zoom', String(size[2]));
}

export function uiZoom() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom')) || 1;
}

function applyCrt(on = get('nms-crt', 'on') === 'on') {
  document.body.classList.toggle('no-crt', !on);
}

export function initSettings({ moods }) {
  applyTextSize();
  applyCrt();
  for (const id of ['btn-settings', 'home-settings']) $(id)?.addEventListener('click', () => openSettings(moods));
}

// A labelled 0-100 slider that applies as you drag.
function slider(label, value, onChange) {
  return el('label', { className: 'set-slider' }, el('span', {}, label),
    el('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round(value * 100), oninput: (e) => onChange(Number(e.target.value) / 100), 'aria-label': `${label} volume` }));
}

// A row of choices; the current one is highlighted.
function choices(options, current, onPick) {
  return el('div', { className: 'set-choices' }, ...options.map(([id, label]) =>
    el('button', { className: `small ${id === current ? 'active' : ''}`, onclick: () => onPick(id) }, label)));
}

export function openSettings(moods) {
  const again = () => openSettings(moods);
  const row = (title, hint, control) => el('div', { className: 'set-row' }, el('div', {}, el('b', {}, title), hint ? el('div', { className: 'hint' }, hint) : null), control);
  const mood = () => (store.state ? moods[store.state.phase] || 'calm' : 'calm');
  const lowFx = get('nms-lowfx', '0') === '1';
  openModal(el('div', { className: 'settings' },
    el('h2', {}, '⚙️ Settings'),
    el('h3', {}, 'Sound'),
    row('🔊 Sound effects', null, choices([['on', 'On'], ['off', 'Off']], soundEnabled() ? 'on' : 'off', (v) => { unlockAudio(); setSound(v === 'on'); sfx('tap'); again(); })),
    row('🎵 Music', 'The generated soundtrack.', choices([['on', 'On'], ['off', 'Off']], musicEnabled() ? 'on' : 'off', (v) => { unlockAudio(); setMusic(v === 'on'); setAmbient(mood()); again(); })),
    ttsSupported() ? row('🗣️ Read aloud', 'Your browser reads the game out loud.', choices([['off', 'Off'], ['stories', 'Stories'], ['all', 'Stories + chat']], ttsMode(), (v) => { while (ttsMode() !== v) cycleTts(); again(); })) : null,
    row('🎚️ Volume', 'Music, sound effects and voice chat, separately.', el('div', { className: 'set-sliders' },
      slider('🎵', getVolume('music'), (v) => setVolume('music', v)),
      slider('🔊', getVolume('sfx'), (v) => { setVolume('sfx', v); sfx('tap'); }),
      slider('🎙️', getVoiceVolume(), (v) => setVoiceVolume(v)),
    )),
    row('💬 Sound captions', 'Shows important sounds as text (they show even when sound is off).', choices([['on', 'On'], ['off', 'Off']], captionsEnabled() ? 'on' : 'off', (v) => { setCaptions(v === 'on'); sfx('chime'); again(); })),
    row('🎙️ Voice chat', 'Talk to people near you on the ship.', choices([['on', 'On'], ['off', 'Off']], voiceEnabled() ? 'on' : 'off', async (v) => { if ((v === 'on') !== voiceEnabled()) { const on = await toggleVoice(); $('btn-mic')?.classList.toggle('on', on); } again(); })),
    el('h3', {}, 'Screen'),
    row('🔠 Text size', 'Makes every panel, button and message bigger.', choices(SIZES.map(([id, label]) => [id, label]), get('nms-text', 'm'), (v) => { set('nms-text', v); applyTextSize(v); again(); })),
    row('📺 Old-screen effect', 'Scanlines and flicker.', choices([['on', 'On'], ['off', 'Off']], get('nms-crt', 'on'), (v) => { set('nms-crt', v); applyCrt(v === 'on'); again(); })),
    row('🎥 Camera distance', 'Close is easier on small screens. The mouse wheel still zooms.', choices([['close', 'Close'], ['normal', 'Normal'], ['far', 'Far']], get('nms-zoom', 'normal'), (v) => { set('nms-zoom', v); window.__world?.setCamera({ zoom: v }); again(); })),
    row('📳 Camera shake', 'When the black hole tugs at the ship.', choices([['on', 'On'], ['off', 'Off']], get('nms-shake', 'on'), (v) => { set('nms-shake', v); window.__world?.setCamera({ shake: v === 'on' }); again(); })),
    row('✨ Graphics', 'Low is for slow computers and old phones.', choices([['0', 'High'], ['1', 'Low']], lowFx ? '1' : '0', (v) => {
      set('nms-lowfx', v);
      if ((v === '1') !== lowFx && confirm('Graphics change after a reload. Reload now? (You keep your seat.)')) location.reload();
      else again();
    })),
    el('h3', {}, 'Help'),
    row('💡 Tips for new players', 'Show the first-game tips again.', el('button', { className: 'small', onclick: () => { resetCoach(); toast('💡 Tips will show again.'); } }, 'Show tips again')),
    el('p', { className: 'hint' }, 'Keys: 1–9 for quick emotes, Q for the emote menu, Tab for the map, K to lock or knock on a door, R role card, M rooms, Enter chat.'),
  ));
}

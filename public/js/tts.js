// Text to speech: the browser reads the game aloud. ARIA (or the Captain)
// narrates the dawn and dusk stories in a low, slow voice; last words are
// read in the speaker's own voice; and, if you like, chat messages too.
// Each player gets their own pitch and speed so you can tell them apart.
// Uses the browser's built-in speech (no downloads, nothing leaves your device).

const KEY = 'nms-tts';
const MODES = ['off', 'stories', 'all']; // off · stories & last words · stories, last words & chat
let mode = 'off';
try {
  mode = MODES.includes(localStorage.getItem(KEY)) ? localStorage.getItem(KEY) : 'off';
} catch {}

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let voices = [];
function loadVoices() {
  voices = synth?.getVoices().filter((v) => /^en/i.test(v.lang)) || [];
}
if (synth) {
  loadVoices();
  synth.addEventListener?.('voiceschanged', loadVoices);
}

export function ttsSupported() {
  return !!synth;
}

export function ttsMode() {
  return mode;
}

export function cycleTts() {
  mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  try {
    localStorage.setItem(KEY, mode);
  } catch {}
  if (mode === 'off') synth?.cancel();
  return mode;
}

function hash(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) | 0;
  return Math.abs(h);
}

// Speech engines read emoji names out loud ("skull"), so leave them out.
function speakable(text) {
  return String(text || '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// kind: 'story' (narrator), 'lastwords' or 'chat'. who: the speaker's name (for their voice).
export function speak(text, { kind = 'story', who = 'ARIA' } = {}) {
  if (!synth || mode === 'off') return;
  if (kind === 'chat' && mode !== 'all') return;
  const words = speakable(text);
  if (!words) return;
  // a new story or last words interrupt; chat waits its turn (but never piles up)
  if (kind !== 'chat') synth.cancel();
  else if (synth.pending) return;
  const u = new SpeechSynthesisUtterance(kind === 'chat' ? `${speakable(who)}: ${words}` : words);
  const h = hash(who);
  if (kind === 'story') {
    u.pitch = 0.65; // ARIA: low and calm
    u.rate = 0.95;
  } else {
    u.pitch = 0.75 + (h % 60) / 100; // everyone sounds a little different
    u.rate = 0.95 + ((h >> 3) % 25) / 100;
  }
  if (voices.length) u.voice = voices[(kind === 'story' ? 0 : h) % voices.length];
  u.volume = kind === 'chat' ? 0.8 : 1;
  synth.speak(u);
}

export function stopSpeaking() {
  synth?.cancel();
}

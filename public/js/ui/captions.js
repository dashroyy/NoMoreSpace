// Sound captions: small on-screen notes for the important sounds, for players
// who are deaf, hard of hearing or playing muted. Switch them on in ⚙️ Settings.
// (They show even when the sound itself is off.)
import { $, el } from '../util.js';
import { onSfx } from '../audio.js';

const KEY = 'nms-captions';

// Only sounds that carry meaning get a caption (not every click and footstep).
const CAPTIONS = {
  airlock: '🚪 Airlock hisses open', death: '💀 Death sting', alarm: "🚨 Ship's bell: emergency meeting!", gavel: '🔨 Gavel bangs',
  shot: '🔫 Plasma shot', zap: '⚡ Electric zap', creak: '🛠️ The hull creaks', whisper: '👂 Whispers in the vents', cackle: '🎃 A pumpkin cackles',
  thud: '📦 Something crashes down', dawn: '🌅 Dawn chime', night: '🌙 Night falls', task: '✅ Task complete', warn: '⏳ Warning bell: 10 seconds',
  count: '⏱️ Tick', drumroll: '🥁 Drumroll', trombone: '🎺 Sad trombone', airhorn: '📯 Air horn', crickets: '🦗 Crickets', kazoo: '🎶 Kazoo',
  gasp: '😮 A gasp', knock: '🚪 Knock knock', doom: '🕳️ A deep rumble', fanfare: '🎺 Fanfare', groove: '🎵 Funky bassline', bubbles: '🫧 Bubbles', join: '🔔 Someone boarded',
  leave: '🔔 Someone left', claim: '📯 Someone claimed a role', dread: '😨 You have been nominated', ghost: '👻 A ghostly wail', ping: '🔔 You were mentioned',
  pause: '⏸️ Game paused', resume: '▶️ Game resumed', whoosh: '💨 Whoosh', blip: '📟 Blip',
};

let enabled = false;
try {
  enabled = localStorage.getItem(KEY) === 'on';
} catch {}

export function captionsEnabled() {
  return enabled;
}

export function setCaptions(on) {
  enabled = !!on;
  try {
    localStorage.setItem(KEY, enabled ? 'on' : 'off');
  } catch {}
  if (!enabled) $('captions')?.replaceChildren();
}

export function initCaptions() {
  onSfx((name) => {
    if (!enabled || !CAPTIONS[name]) return;
    show(CAPTIONS[name]);
  });
}

// Show a caption; the same sound twice in a row just counts up (×2, ×3…).
function show(text) {
  const box = $('captions');
  if (!box) return;
  const last = box.lastElementChild;
  if (last && last.dataset.text === text && Date.now() - Number(last.dataset.at) < 2000) {
    last.dataset.count = String(Number(last.dataset.count || 1) + 1);
    last.textContent = `${text} ×${last.dataset.count}`;
    last.dataset.at = String(Date.now());
    clearTimeout(last._t);
    last._t = setTimeout(() => last.remove(), 2800);
    return;
  }
  const c = el('div', { className: 'caption', dataset: { text, at: String(Date.now()) } }, text);
  box.append(c);
  while (box.children.length > 4) box.firstChild.remove();
  c._t = setTimeout(() => c.remove(), 2800);
}

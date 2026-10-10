// ✉️ The Recruiter's black envelope (Citadel of Traitors). A guest who is offered a place
// among the Traitors has one minute to accept or refuse. Nobody else sees this screen.
import { $, el, clear, problem, formatTime } from '../util.js';
import { store, send, serverNow } from '../store.js';
import { sfx } from '../audio.js';

let shown = false;

export function initOffer() {
  setInterval(update, 400);
}

function answer(accept) {
  send('offer', { accept }).then(() => sfx(accept ? 'doom' : 'chime')).catch((e) => problem(e.message));
}

function update() {
  const box = $('offer');
  const offer = store.state?.you?.offer;
  if (!box) return;
  if (!offer) {
    box.hidden = true;
    shown = false;
    return;
  }
  if (!shown) {
    shown = true;
    sfx('whisper');
    clear(box,
      el('div', { className: 'wish-card' },
        el('div', { className: 'wish-ico' }, '✉️'),
        el('h2', {}, 'A black envelope…'),
        el('p', {}, 'Somebody has slid an offer under your door: ', el('b', {}, 'join the Traitors.'), ' If you ', el('b', {}, 'accept'), ', you become a Traitor and learn who the others are. If you ', el('b', {}, 'refuse'), ', nothing happens... but the Traitors will remember.'),
        el('div', { className: 'wish-list' },
          el('button', { className: 'primary big', onclick: () => answer(true) }, '🐍 Accept: join the Traitors'),
          el('button', { className: 'big', onclick: () => answer(false) }, '✋ Refuse'),
        ),
        el('div', { className: 'hint', id: 'offer-timer' }),
      ),
    );
    box.hidden = false;
  }
  const left = offer.until ? Math.max(0, offer.until - serverNow()) : null;
  const t = $('offer-timer');
  if (t) t.textContent = left == null ? '' : `No answer in ${formatTime(left)} counts as a refusal.`;
}

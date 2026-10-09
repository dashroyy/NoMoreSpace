// 🐞 Report a bug (sends what went wrong, plus recent errors, to the server),
// and keeping phones connected: when the page wakes up after the screen was
// off, reconnect straight away and show a banner while we do.
import { $, el, problem, toast } from '../util.js';
import { store, send, socket } from '../store.js';
import { openModal, closeModal } from './rolecard.js';

const errors = [];
function remember(text) {
  errors.push(`${new Date().toISOString().slice(11, 19)} ${text}`);
  if (errors.length > 15) errors.shift();
}
window.addEventListener('error', (e) => remember(`${e.message} @ ${e.filename?.split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => remember(`promise: ${e.reason?.message || e.reason}`));

export function openBugReport() {
  const text = el('textarea', { rows: 5, maxLength: 2000, placeholder: 'What happened? What were you doing just before? (e.g. "I clicked Nominate and nothing happened")' });
  const status = el('div', { className: 'hint' }, errors.length ? `We'll also send ${errors.length} recent error message${errors.length === 1 ? '' : 's'} from your browser.` : '');
  openModal(el('div', { className: 'bug-report' },
    el('h2', {}, '🐞 Report a bug'),
    el('p', { className: 'hint' }, 'Thanks for helping! This goes straight to whoever runs this ship. No personal details are sent.'),
    text,
    status,
    el('div', { className: 'row' },
      el('button', {
        className: 'primary',
        onclick: () => {
          const s = store.state;
          const info = `${navigator.userAgent} · ${innerWidth}x${innerHeight}${s ? ` · phase ${s.phase}` : ''}`;
          send('bug-report', { text: text.value, errors, info })
            .then(() => {
              closeModal();
              toast('🐞 Thanks! Your report was sent.', 'info', 5000);
            })
            .catch((e) => problem(e.message));
        },
      }, 'Send report'),
      el('button', { className: 'ghost', onclick: closeModal }, 'Cancel'),
    ),
  ));
  setTimeout(() => text.focus(), 50);
}

export function initConnection() {
  const banner = $('reconnect-banner');
  let lostAt = 0;
  const update = () => {
    const inGame = !!store.state && !$('hud').hidden;
    banner.hidden = socket.connected || !inGame || Date.now() - lostAt < 1500;
  };
  socket.on('disconnect', () => {
    lostAt = Date.now();
    setTimeout(update, 1600);
  });
  socket.on('connect', update);
  // phones pause the page when the screen turns off: reconnect as soon as it is back
  const wake = () => {
    if (document.visibilityState === 'visible' && !socket.connected) socket.connect();
    update();
  };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('pageshow', wake);
  window.addEventListener('online', wake);
  setInterval(update, 2000);
}

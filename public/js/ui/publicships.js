// 🌐 Public ships: ships whose host opened them to everyone. Join one from the
// title screen when your own group is short of players (games already under
// way are joined as a spectator, who becomes crew at the next rematch).
import { $, el, problem } from '../util.js';
import { send } from '../store.js';
import { openModal } from './rolecard.js';
import { sfx } from '../audio.js';

const PHASES = { lobby: '🟢 In the docking bay', night: '🌙 Night', dawn: '☀️ Dawn', roam: '🔦 Exploring', meeting: '🚨 Meeting', nominations: '☝️ Voting', lastwords: '🎤 Last words', dusk: '🌇 Dusk', ended: '🏁 Finished' };

export function openPublicShips({ look } = {}) {
  const list = el('div', { className: 'ship-list' }, el('p', { className: 'hint' }, 'Looking for ships…'));
  const refresh = () => send('list-public').then(({ ships }) => {
    list.replaceChildren(...(ships.length ? ships.map((s) => row(s, look)) : [el('p', { className: 'hint' }, 'No public ships right now. Launch your own and tick "Open to the public" in the docking bay, or play 🎓 Practice with robots.')]));
  }).catch((e) => problem(e.message));
  openModal(el('div', { className: 'public-ships' },
    el('h2', {}, '🌐 Public ships'),
    el('p', { className: 'hint' }, 'Ships open to anyone. Games already running are joined as a spectator: you watch, and join the crew at the next rematch.'),
    list,
    el('button', { className: 'small', onclick: refresh }, '🔄 Refresh'),
  ));
  refresh();
}

function row(s, look) {
  const join = () => {
    const name = $('home-name').value.trim();
    if (!name) {
      problem('Type your name on the title screen first.');
      return;
    }
    send('join', { code: s.code, name, look: look?.() }).then(() => sfx('whoosh')).catch((e) => problem(e.message));
  };
  return el('div', { className: 'ship-row' },
    el('div', { className: 'ship-main' },
      el('b', {}, s.shipName), el('span', { className: 'code' }, s.code),
      el('div', { className: 'hint' },
        `${PHASES[s.phase] || s.phase} · 👥 ${s.people} ${s.people === 1 ? 'person' : 'people'}${s.robots ? ` · 🤖 ${s.robots}` : ''} · ${s.seats}/15 seats${s.watching ? ` · 👀 ${s.watching}` : ''}${s.round > 1 ? ` · round ${s.round}` : ''}${s.mode === 'captain' ? ' · 👨‍✈️ Captain' : ''}`),
    ),
    el('button', { className: s.phase === 'lobby' ? 'primary small' : 'small', onclick: join }, s.phase === 'lobby' ? 'Board' : 'Watch'),
  );
}

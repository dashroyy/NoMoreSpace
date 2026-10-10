// The role card (R): your ability, tips, everything you've learned, plus the
// full almanac of roles and a "how to play" guide.
import { $, el, clear } from '../util.js';
import { store, role, player, send, scriptRoleIds, scriptInfo, themeInfo } from '../store.js';
import { notebookTab } from './notebook.js';
import { logTab } from './social.js';
import { openBugReport } from './report.js';
import { renderRing } from './hud.js';

let current = 'role';

export function openModal(content) {
  clear($('modal-body'), content);
  $('modal').hidden = false;
}

export function closeModal() {
  $('modal').hidden = true;
  $('modal-body').replaceChildren();
  if (typeof closeModal.onClose === 'function') {
    const fn = closeModal.onClose;
    closeModal.onClose = null;
    fn();
  }
}

export function initModal() {
  $('modal-close').addEventListener('click', closeModal);
  $('modal').addEventListener('click', (e) => e.target.id === 'modal' && closeModal());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('modal').hidden) closeModal();
  });
}

export function openRoleCard(tab = 'role') {
  current = tab;
  render();
}

export function refreshRoleCard() {
  if ($('modal').hidden || !$('modal-body').querySelector('.rolecard')) return;
  // don't throw away what someone is typing or picking in the notebook
  if (document.activeElement?.closest?.('#modal-body') && document.activeElement.matches('input, select, textarea')) return;
  render();
}

function render() {
  const tabs = el('div', { className: 'tabs' },
    ...[['role', '📜 My role'], ['notebook', '🗒️ Notebook'], ['log', '📰 Day log'], ['almanac', '📖 All roles'], ['help', '❔ How to play']].map(([id, label]) =>
      el('button', { className: current === id ? 'active' : '', onclick: () => openRoleCard(id) }, label),
    ),
  );
  const onNotebookChange = () => {
    renderRing();
    if (current === 'notebook') render();
  };
  const body = { role: myRole, notebook: () => notebookTab(onNotebookChange), log: () => logTab(store.state || {}, render), almanac }[current]?.() || howToPlay();
  openModal(el('div', { className: 'rolecard' }, tabs, body));
}

// When a role's ability happens, in plain words.
export function wakeText(r) {
  const n = r.night;
  if (n?.onDeath) return '🌙 Wakes only if you die at night.';
  if (n?.first && n?.other) return n.choose ? '🌙 Wakes every night to choose.' : '🌙 Wakes every night to learn something.';
  if (n?.first) return '🌙 Wakes on the first night only.';
  if (n?.other) return n.choose ? '🌙 Wakes every night except the first, to choose.' : '🌙 Wakes every night except the first.';
  if (r.tags.includes('action')) return '☀️ Used during the day.';
  return '🛡️ Always on: you never need to wake up.';
}

// The role's ⚡ ship system: its once-per-game online ability.
function systemBox(r, you) {
  const sys = r.system;
  const status = !you.alive ? 'Offline: the dead cannot use ship systems.' : you.system?.used ? 'Used.' : `Ready. Press ${sys.icon} ${sys.name} in the action bar (or X) ${sys.phases.includes('meeting') ? 'during the day' : 'while exploring'}.`;
  return el('div', { className: 'sys-box' },
    el('b', {}, `⚡ Ship system: ${sys.icon} ${sys.name}`),
    el('div', {}, sys.text),
    el('small', {}, status),
  );
}

function typeBadge(r) {
  const t = store.data.types[r.type];
  return el('span', { className: 'badge', style: { color: t.color } }, t.name);
}

function myRole() {
  const you = store.state?.you;
  if (you?.isSpectator) {
    return el('div', {}, el('h2', {}, '👀 You are watching'), el('p', { className: 'hint' }, 'This game started before you arrived. Watch the crew, chat with the ghosts in the gallery, and you will join as a player at the next rematch. Meanwhile, the 📖 All roles tab explains everyone you might meet.'));
  }
  if (!you || you.isCaptain) {
    return el('div', {}, el('h2', {}, '👨‍✈️ You are the Captain'), el('p', { className: 'hint' }, 'You run the game like a Blood on the Clocktower Storyteller: use the Command Station to move between phases, check the Ship Manifest (grimoire), edit what players learn at night, tell the story of each death and puppet the crew.'));
  }
  if (!you.role) return el('p', { className: 'hint' }, 'Roles are dealt when the ship launches. Customise your suit while you wait!');
  const r = role(you.role);
  const team = store.data.types[r.type].team;
  const parts = [
    el('div', { className: `rolecard-hero ${team}` },
      el('div', { className: 'ico' }, r.icon),
      el('div', {},
        typeBadge(r),
        el('h2', {}, r.name),
        el('div', { className: 'hint' }, team === 'crew' ? `You are GOOD. Find and airlock ${themeInfo().demonName}.` : `You are EVIL. Keep ${themeInfo().demonName} alive until only 2 remain.`),
      ),
    ),
    el('div', { className: 'ability' }, r.ability),
    el('div', { className: 'wake' }, wakeText(r)),
    r.system ? systemBox(r, you) : null,
    el('p', { className: 'flavor' }, r.flavor),
    el('h3', {}, '💡 Tips'),
    el('ul', { className: 'tips' }, ...r.tips.map((t) => el('li', {}, t))),
  ];
  if (!you.alive) parts.splice(1, 0, el('p', { className: 'hint' }, '👻 You are dead: your ability no longer works, but you can still talk, and you have ' + (you.ghostVote ? 'ONE ghost vote left.' : 'used your ghost vote.')));
  if (you.evilTeam) {
    parts.push(el('h3', {}, '🦑 Your evil team'), el('div', { className: 'notes' }, ...you.evilTeam.map((m) => el('div', { className: 'note evil' }, `${m.name}${m.parasite ? ' — THE PARASITE' : ' — Saboteur'}`))));
  }
  if (you.bluffs?.length) {
    parts.push(el('h3', {}, '🎭 Safe bluffs (not aboard)'), el('div', { className: 'notes' }, ...you.bluffs.map((b) => el('div', { className: 'note evil' }, `${role(b).icon} ${role(b).name}: ${role(b).ability}`))));
  }
  if (you.manifest) {
    parts.push(el('h3', {}, '🎭 Ship Manifest (you see everything)'), el('div', { className: 'notes' }, ...you.manifest.map((m) =>
      el('div', { className: 'note' }, `${m.alive ? '' : '💀 '}${m.name}: ${role(m.role).icon} ${role(m.role).name}${m.role === 'drunk' ? ` (thinks they are ${role(m.believed).name})` : ''}${m.glitched ? ' · glitched' : ''}${m.hallucinating ? ' · hallucinating' : ''}${m.redHerring ? ' · ghost signal' : ''}`),
    )));
  }
  if (you.master) parts.push(el('p', { className: 'hint' }, `🤖 Your master today: ${player(you.master)?.name}. You may only vote when they vote.`));
  parts.push(el('h3', {}, '🗒️ What you have learned'));
  const notes = (you.notes || []).slice().reverse();
  parts.push(notes.length ? el('div', { className: 'notes' }, ...notes.map((n) => el('div', { className: `note ${n.kind === 'evil' ? 'evil' : ''}` }, el('small', {}, n.night ? `Night ${n.night}` : 'Start'), n.text))) : el('p', { className: 'hint' }, 'Nothing yet. Information arrives at night.'));
  return el('div', {}, ...parts);
}

function almanac() {
  const groups = ['crew', 'drifter', 'saboteur', 'parasite'];
  const n = store.state?.playerCount || 0;
  return el('div', {},
    el('p', { className: 'hint' }, `${scriptInfo().icon} ${scriptInfo().name}: every role that can be aboard. Greyed-out roles need more players. The Parasite's bluffs and the Space Drunk always pretend to be good roles from this list.`),
    ...groups.map((type) => {
      const t = store.data.types[type];
      const ids = scriptRoleIds(type);
      return el('div', {},
        el('h3', { style: { color: t.color, marginTop: '14px' } }, `${t.name}s — ${t.blurb}`),
        el('div', { className: 'almanac' }, ...ids.map((id) => {
          const r = store.data.roles[id];
          return el('div', { className: 'alm', style: { opacity: n && r.minPlayers > n ? 0.45 : 1 } },
            el('div', { className: 'ico' }, r.icon),
            el('div', {}, el('span', { className: 'min' }, `${r.minPlayers}+ players`), el('b', {}, r.name), el('small', {}, r.ability), el('small', { className: 'wake' }, wakeText(r)), r.system ? el('small', { className: 'sys-line' }, `⚡ ${r.system.icon} ${r.system.name}: ${r.system.text}`) : null),
          );
        })),
      );
    }),
  );
}

export function howToPlay() {
  const d = store.data.distribution;
  const n = store.state?.playerCount;
  return el('div', {},
    el('h2', {}, themeInfo().howTitle),
    el('p', {}, `${themeInfo().howIntro} Hidden among the crew is `, el('b', {}, themeInfo().demonName), ', helped by its ', el('b', {}, 'Saboteurs'), `. ${themeInfo().demonDoes} Every day the crew can vote to airlock one suspect.`),
    el('h3', {}, '🏆 How to win'),
    el('ul', { className: 'tips' },
      el('li', {}, el('b', {}, 'Crew (good): '), `airlock or shoot ${themeInfo().demonName}.`),
      el('li', {}, el('b', {}, 'Infiltrators (evil): '), `survive until only 2 players are alive. ${themeInfo().evilGoal}`),
    ),
    el('h3', {}, '🌙 Night'),
    el('p', {}, 'Everyone sleeps. Players with night abilities choose targets on their screen; everyone else (and they too) can paint a picture that appears on the ship\'s walls the next day. Info roles get secret messages at dawn.'),
    el('h3', {}, '☀️ Day'),
    el('ol', { className: 'tips' },
      el('li', {}, el('b', {}, 'Dawn: '), 'the Captain (or ARIA) tells the story of who died.'),
      el('li', {}, el('b', {}, 'Explore: '), 'walk the ship or press M (🚀 Rooms) to teleport into any room. Only people in the same room hear your chat, so meet someone in a room for a private talk. Do tasks and look out of the Observation Deck windows for clues.'),
      el('li', {}, el('b', {}, 'Emergency meeting: '), 'everyone returns to the bridge to share information.'),
      el('li', {}, el('b', {}, 'Claims & log: '), 'press 📣 Claim (C) to tell everyone your role (or a lie); it shows by your seat. The 📰 Day log (L) records every vote, death, clue and claim.'),
      el('li', {}, el('b', {}, 'Whispers: '), 'in the 🚀 Rooms menu, ask someone for a private chat: if they accept, you are both beamed into an empty room.'),
      el('li', {}, el('b', {}, 'Nominations: '), 'press ☝️ Nominate to put someone up for the airlock (each living player nominates once per day; each player can be nominated once). The nominator accuses, the nominee defends, and everyone votes ✋ YES or 🙅 NO at the same time (keys Y / N). You can change your vote until the count; not voting counts as NO. Then the clock hand sweeps round the table revealing every vote.'),
      el('li', {}, el('b', {}, 'Last words & dusk: '), 'the player with the most votes (at least half the living, no tie) gets a spotlight and 15 seconds of last words, then the airlock.'),
    ),
    el('h3', {}, '👻 Death'),
    el('p', {}, 'Dead players stay at the table as ghosts. They can talk but lose their ability, and get ONE ghost vote for the rest of the game, so spend it wisely.'),
    el('h3', {}, '🤥 Lies & glitches'),
    el('p', {}, 'Evil players lie about their roles. The Hacker can glitch a player, and the Space Drunk does not know they are drunk. Glitched or drunk players get FALSE information, so not every honest player is right!'),
    el('h3', {}, '🔭 Tasks & clues'),
    el('p', {}, 'Tasks in each room charge the Observation Array. When it is full, a small cryptic clue appears outside the Observation Deck window the next morning. Clues tend to help whichever team is losing.'),
    el('h3', {}, '👥 Roles per player count'),
    el('table', { className: 'dist-table' },
      el('tr', {}, el('th', {}, 'Players'), el('th', {}, 'Crew'), el('th', {}, 'Drifters'), el('th', {}, 'Saboteurs'), el('th', {}, 'Parasite')),
      ...Object.entries(d).map(([players, row]) => el('tr', { className: Number(players) === n ? 'current' : '' }, el('td', {}, players), ...row.map((v) => el('td', {}, v)))),
    ),
    el('p', { className: 'hint' }, '3–4 players is "Short Haul": a quick 10-minute game with no Saboteurs (in a 3-player game the Parasite waits until night 3). The full Blood on the Clocktower experience starts at 5, and is best with 7–15. With 7+ players the infiltrators know each other and the Parasite learns 3 safe bluffs.'),
    el('h3', {}, '⌨️ Controls'),
    el('p', {}, el('kbd', {}, 'WASD'), ' move · ', el('kbd', {}, 'E'), ' use task · ', el('kbd', {}, 'Q'), ' emote · ', el('kbd', {}, 'R'), ' role card · ', el('kbd', {}, 'Space'), ' raise hand · ', el('kbd', {}, 'Enter'), ' chat · mouse wheel zoom'),
    el('p', { className: 'hint' }, 'Slow computer? ', el('a', { href: '?lowfx=1', style: { color: 'var(--accent)' } }, 'Switch to low graphics'), ' (', el('a', { href: '?lowfx=0', style: { color: 'var(--accent)' } }, 'back to high'), '). Your seat is kept when the page reloads.'),
    el('p', {}, el('button', { className: 'small', onclick: () => openBugReport() }, '🐞 Report a bug')),
    store.state?.you?.isController && store.state.mode === 'autopilot' && store.state.phase !== 'lobby'
      ? el('div', {}, el('h3', {}, '👑 Host controls'), el('button', { className: 'danger', onclick: () => confirm('Reset the ship back to the lobby for everyone?') && send('reset').catch(() => {}) }, '♻️ Reset the ship'))
      : null,
  );
}

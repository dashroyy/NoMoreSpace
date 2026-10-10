// The Ship's Wiki: a picture-book guide to the game and every role, so new
// players can learn before (or between) games. Open it from the title
// screen, the lobby or the 📖 button in the top bar.
import { $, el, clear } from '../util.js';
import { store } from '../store.js';
import { openModal, closeModal, wakeText } from './rolecard.js';

const SVG = 'http://www.w3.org/2000/svg';
const PAGES = [
  ['basics', '🕳️', 'The basics'],
  ['day', '🔄', 'A day aboard'],
  ['voting', '☝️', 'Voting'],
  ['roles', '🎭', 'Roles'],
  ['crew', '👥', 'Who is aboard?'],
  ['lies', '🤥', 'Lies & glitches'],
  ['ghosts', '👻', 'Ghosts & fun'],
  ['controls', '⌨️', 'Controls'],
];

const PLURAL = { crew: 'Crew', drifter: 'Drifters', saboteur: 'Saboteurs', parasite: 'The Parasite' };

let page = 'basics';
let roleFilter = 'all';
let roleSearch = '';

// tiny SVG helper: svg('circle', { cx: 1 }, ...children)
function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children.flat()) if (c != null) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}

export function openWiki(start = page) {
  page = start;
  render();
  $('modal').classList.add('wide');
  closeModal.onClose = () => $('modal').classList.remove('wide');
}

function render() {
  const nav = el('nav', { className: 'wiki-nav' }, ...PAGES.map(([id, icon, label]) =>
    el('button', { className: page === id ? 'active' : '', onclick: () => { page = id; render(); $('modal-body').scrollTop = 0; } }, `${icon} ${label}`),
  ));
  const body = { basics, day, voting, roles, crew, lies, ghosts, controls }[page]();
  openModal(el('div', { className: 'wiki' }, el('h2', { className: 'wiki-title' }, "📖 The Ship's Wiki"), nav, el('div', { className: 'wiki-page' }, body)));
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function basics() {
  const T = store.data.types;
  const team = (types, cls, title, goal) => el('div', { className: `wiki-team ${cls}` },
    el('h3', {}, title),
    ...types.map((t) => el('div', { className: 'wiki-type' }, el('b', { style: { color: T[t].color } }, PLURAL[t]), el('span', {}, T[t].blurb))),
    el('div', { className: 'wiki-goal' }, goal),
  );
  return el('div', {},
    el('p', { className: 'wiki-lead' }, 'Your ship is falling into a black hole. Hidden among the crew is The Parasite, helped by its Saboteurs. Every night it kills. Every day the crew can vote to airlock one suspect.'),
    el('div', { className: 'wiki-teams' },
      team(['crew', 'drifter'], 'good', '😇 Good team', '🏆 Wins when the Parasite is dead.'),
      el('div', { className: 'wiki-vs' }, 'VS'),
      team(['saboteur', 'parasite'], 'evil', '😈 Evil team', '🏆 Wins when only 2 players are left alive.'),
    ),
    blackHoleMeter(),
    el('p', { className: 'hint' }, 'Nobody is told who anyone else is (except the evil team, in games of 7 or more). Everyone can lie. Your job is to work out who to trust.'),
  );
}

// "Each death pulls the ship closer": a meter from a full crew to 2 survivors.
function blackHoleMeter() {
  const steps = 7;
  const g = svg('svg', { viewBox: '0 0 560 120', class: 'wiki-svg', role: 'img', 'aria-label': 'Each death pulls the ship closer to the black hole. At 2 survivors, evil wins.' });
  g.append(svg('defs', {}, svg('radialGradient', { id: 'bh' }, svg('stop', { offset: '0.35', 'stop-color': '#000' }), svg('stop', { offset: '0.55', 'stop-color': '#ff8a3a' }), svg('stop', { offset: '1', 'stop-color': 'rgba(255,60,90,0)' }))));
  g.append(svg('circle', { cx: 500, cy: 60, r: 52, fill: 'url(#bh)' }));
  g.append(svg('line', { x1: 30, y1: 60, x2: 440, y2: 60, stroke: '#3a4670', 'stroke-width': 3, 'stroke-dasharray': '6 6' }));
  for (let i = 0; i < steps; i++) {
    const x = 40 + i * 62;
    const alive = steps - i + 1;
    g.append(svg('circle', { cx: x, cy: 60, r: 14, fill: i === steps - 1 ? '#ff3b5c' : '#6cf0ff', opacity: 1 - i * 0.08 }));
    g.append(svg('text', { x, y: 65, 'text-anchor': 'middle', 'font-size': 13, fill: '#04050c' }, alive));
  }
  g.append(svg('text', { x: 40, y: 104, 'font-size': 14, fill: '#9aa6d0' }, 'players alive →'));
  g.append(svg('text', { x: 412, y: 30, 'text-anchor': 'middle', 'font-size': 14, fill: '#ff9fb3' }, '2 left: evil wins'));
  return el('figure', { className: 'wiki-figure' }, g, el('figcaption', {}, 'Every death drags the ship closer to the black hole. If the crew can airlock the Parasite first, they escape.'));
}

function day() {
  const phases = [
    ['🌙', 'Night', 'Roles with night powers wake and choose. Everyone else paints. The Parasite kills (from night 2).'],
    ['☀️', 'Dawn', 'ARIA tells the story of who died. Secret info arrives for info roles.'],
    ['🔦', 'Explore', 'Walk the ship, whisper in rooms, do tasks, look for clues at the Observation Deck.'],
    ['🚨', 'Meeting', 'Everyone back to the bridge. Share (or invent) what you know. Claim a role.'],
    ['☝️', 'Nominations', 'Nominate a suspect. Everyone votes YES or NO.'],
    ['🎤', 'Last words', 'Whoever is heading for the airlock gets 15 seconds in the spotlight.'],
    ['🌇', 'Dusk', 'The airlock opens… then night falls again.'],
  ];
  // the cycle drawn as a ring
  const g = svg('svg', { viewBox: '0 0 360 360', class: 'wiki-svg wiki-cycle', role: 'img', 'aria-label': 'The day cycle: night, dawn, explore, meeting, nominations, last words, dusk, and back to night.' });
  g.append(svg('circle', { cx: 180, cy: 180, r: 120, fill: 'none', stroke: '#3a4670', 'stroke-width': 3, 'stroke-dasharray': '4 8' }));
  g.append(svg('text', { x: 180, y: 176, 'text-anchor': 'middle', 'font-size': 16, fill: '#ffb547' }, 'one day'));
  g.append(svg('text', { x: 180, y: 198, 'text-anchor': 'middle', 'font-size': 12, fill: '#9aa6d0' }, 'repeat until a team wins'));
  phases.forEach(([icon, name], i) => {
    const a = -Math.PI / 2 + (i / phases.length) * Math.PI * 2;
    const x = 180 + Math.cos(a) * 120;
    const y = 180 + Math.sin(a) * 120;
    g.append(svg('circle', { cx: x, cy: y, r: 30, fill: i === 0 ? '#1b1640' : '#0e1830', stroke: i === 0 ? '#b9a4ff' : '#6cf0ff', 'stroke-width': 2 }));
    g.append(svg('text', { x, y: y + 2, 'text-anchor': 'middle', 'font-size': 22 }, icon));
    g.append(svg('text', { x, y: y + 46, 'text-anchor': 'middle', 'font-size': 12, fill: '#dfe7ff' }, name));
  });
  return el('div', {},
    el('div', { className: 'wiki-split' },
      el('figure', { className: 'wiki-figure' }, g),
      el('ol', { className: 'wiki-steps' }, ...phases.map(([icon, name, text]) => el('li', {}, el('b', {}, `${icon} ${name}: `), text))),
    ),
    el('p', { className: 'hint' }, '⏭️ Done talking? Press Ready. When everyone is ready, the ship skips ahead without waiting for the timer.'),
  );
}

function voting() {
  // a little bridge table with a nominee, raised hands and the clock hand
  const n = 8;
  const g = svg('svg', { viewBox: '0 0 300 300', class: 'wiki-svg', role: 'img', 'aria-label': 'The vote clock: votes are revealed one seat at a time, clockwise from the nominee.' });
  g.append(svg('circle', { cx: 150, cy: 150, r: 62, fill: '#140c26', stroke: '#7f6bff', 'stroke-width': 2 }));
  const yes = [1, 2, 4, 6];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const x = 150 + Math.cos(a) * 112;
    const y = 150 + Math.sin(a) * 112;
    g.append(svg('circle', { cx: x, cy: y, r: 17, fill: i === 0 ? '#ff3b5c' : '#2a3458', stroke: i === 0 ? '#ffd0d8' : '#6cf0ff', 'stroke-width': 2 }));
    g.append(svg('text', { x, y: y + 6, 'text-anchor': 'middle', 'font-size': 16 }, i === 0 ? '😰' : yes.includes(i) ? '✋' : '·'));
  }
  const a = -Math.PI / 2 + (4.5 / n) * Math.PI * 2;
  g.append(svg('line', { x1: 150, y1: 150, x2: 150 + Math.cos(a) * 80, y2: 150 + Math.sin(a) * 80, stroke: '#ffb547', 'stroke-width': 4, 'stroke-linecap': 'round' }));
  g.append(svg('circle', { cx: 150, cy: 150, r: 6, fill: '#ffb547' }));
  g.append(svg('text', { x: 150, y: 290, 'text-anchor': 'middle', 'font-size': 13, fill: '#9aa6d0' }, 'the hand sweeps clockwise, revealing each vote'));
  return el('div', { className: 'wiki-split' },
    el('figure', { className: 'wiki-figure' }, g),
    el('div', {},
      el('ol', { className: 'wiki-steps' },
        el('li', {}, el('b', {}, 'Nominate: '), 'any living player may nominate once a day, and each player can only be nominated once.'),
        el('li', {}, el('b', {}, 'Accuse & defend: '), 'the nominator explains, then the nominee answers.'),
        el('li', {}, el('b', {}, 'Vote: '), 'everyone votes YES or NO in secret (keys Y / N), and can change their mind until the count.'),
        el('li', {}, el('b', {}, 'The count: '), 'the clock hand sweeps round the table, revealing each vote.'),
      ),
      el('div', { className: 'wiki-rule' }, '☠️ To be airlocked you need YES votes from at least half of the living players (rounded up), and more than anyone else today. A tie saves everyone.'),
      el('p', { className: 'hint' }, '👻 Dead players keep ONE ghost vote for the rest of the game. Spend it wisely.'),
    ),
  );
}

function roles() {
  const data = store.data;
  const types = ['crew', 'drifter', 'saboteur', 'parasite'];
  const filters = el('div', { className: 'wiki-filters' },
    ...[['all', 'All'], ...types.map((t) => [t, PLURAL[t]])].map(([id, label]) =>
      el('button', { className: `small ${roleFilter === id ? 'active' : ''}`, onclick: () => { roleFilter = id; render(); } }, label)),
    el('input', { className: 'wiki-search', placeholder: 'Search roles…', value: roleSearch, oninput: (e) => { roleSearch = e.target.value; refreshCards(); } }),
  );
  const grid = el('div', { className: 'wiki-roles', id: 'wiki-roles' });
  const refreshCards = () => {
    const q = roleSearch.trim().toLowerCase();
    const list = Object.entries(data.roles).filter(([, r]) => (roleFilter === 'all' || r.type === roleFilter) && (!q || `${r.name} ${r.ability} ${r.tb}`.toLowerCase().includes(q)));
    clear(grid, ...list.map(([id, r]) => roleCard(id, r)));
    if (!list.length) grid.append(el('p', { className: 'hint' }, 'No roles match.'));
  };
  refreshCards();
  return el('div', {}, el('p', { className: 'hint' }, 'Every role that can be aboard. Tap a card to see its strategy tips. Bigger crews unlock more roles.'), filters, grid);
}

function roleCard(id, r) {
  const t = store.data.types[r.type];
  const tips = el('ul', { className: 'tips', hidden: true }, ...r.tips.map((x) => el('li', {}, x)));
  const card = el('div', { className: `wiki-role ${t.team}` },
    el('div', { className: 'wiki-role-head' },
      el('span', { className: 'wiki-role-icon' }, r.icon),
      el('div', {},
        el('b', {}, r.name),
        el('div', { className: 'wiki-role-meta' }, el('span', { style: { color: t.color } }, t.name), ` · ${r.minPlayers}+ players · like BotC's ${r.tb}`),
      ),
    ),
    el('p', {}, r.ability),
    el('div', { className: 'wake' }, wakeText(r)),
    r.system ? el('div', { className: 'wiki-system' }, `⚡ ${r.system.icon} ${r.system.name}: ${r.system.text}`) : null,
    el('p', { className: 'flavor' }, r.flavor),
    tips,
  );
  card.style.setProperty('--tc', t.color);
  card.addEventListener('click', () => (tips.hidden = !tips.hidden));
  return card;
}

function crew() {
  const data = store.data;
  const n = store.state?.playerCount || 0;
  const colors = [data.types.crew.color, data.types.drifter.color, data.types.saboteur.color, data.types.parasite.color];
  const rows = Object.entries(data.distribution);
  const g = svg('svg', { viewBox: `0 0 560 ${rows.length * 26 + 40}`, class: 'wiki-svg', role: 'img', 'aria-label': 'How many of each team are aboard for each number of players.' });
  rows.forEach(([players, counts], i) => {
    const y = 10 + i * 26;
    const here = Number(players) === n;
    g.append(svg('text', { x: 30, y: y + 15, 'text-anchor': 'end', 'font-size': 13, fill: here ? '#ffb547' : '#9aa6d0' }, players));
    let x = 40;
    counts.forEach((c, k) => {
      for (let j = 0; j < c; j++) {
        g.append(svg('rect', { x, y, width: 30, height: 20, rx: 3, fill: colors[k], opacity: here ? 1 : 0.75 }));
        x += 33;
      }
    });
    if (here) g.append(svg('text', { x: x + 6, y: y + 15, 'font-size': 13, fill: '#ffb547' }, '← your ship'));
  });
  const legend = el('div', { className: 'wiki-legend' }, ...['crew', 'drifter', 'saboteur', 'parasite'].map((t, k) => el('span', {}, el('i', { style: { background: colors[k] } }), `${data.types[t].name}`)));
  return el('div', {},
    el('p', { className: 'hint' }, 'More players means more evil players, but also more days to find them. The rows are Blood on the Clocktower\'s own setup table (3 and 4 players is our quick "Short Haul" mode).'),
    legend,
    el('figure', { className: 'wiki-figure' }, g),
    el('ul', { className: 'tips' },
      el('li', {}, 'With 7 or more players the evil team knows each other, and the Parasite learns 3 good roles that are NOT in play: safe bluffs.'),
      el('li', {}, 'The 🧳 Smuggler swaps 2 Crew for 2 Drifters.'),
    ),
  );
}

function lies() {
  const row = (icon, title, text) => el('div', { className: 'wiki-lie' }, el('span', { className: 'wiki-role-icon' }, icon), el('div', {}, el('b', {}, title), el('p', {}, text)));
  return el('div', {},
    el('p', { className: 'wiki-lead' }, 'Honest players can still be wrong. Before you trust a piece of information, ask: could it be false?'),
    row('💻', 'Glitched by the Hacker', 'The Hacker picks a player each night. Their ability breaks for that night and the next day, and any info they get is FALSE. It stops if the Hacker dies.'),
    row('🍾', 'The Space Drunk', 'Thinks they are a Crew role, but they are not. Their "ability" does nothing and their info is fake. They never find out.'),
    row('📦', 'The Stowaway', 'A good player who might show up as evil (even as the Parasite) to other abilities.'),
    row('🎭', 'The Mimic', 'An evil player who might show up as good, and sees the whole Ship Manifest.'),
    row('🔭', 'The ghost signal', 'One good player always pings the Scanner as the Parasite.'),
    row('🤡', 'Hallucinations', 'The Holo-Jester makes one player see fake crewmates, fake whispers and a fake clue for a day.'),
    el('div', { className: 'wiki-rule' }, '🧠 Tip: compare notes. Info that several people confirm in different ways is much harder to fake. Use the 🗒️ Notebook (role card) to track claims.'),
  );
}

function ghosts() {
  const row = (icon, title, text) => el('div', { className: 'wiki-lie' }, el('span', { className: 'wiki-role-icon' }, icon), el('div', {}, el('b', {}, title), el('p', {}, text)));
  return el('div', {},
    el('p', { className: 'wiki-lead' }, 'Dying is not the end! Ghosts stay at the table, can talk, and have plenty to do.'),
    row('🔮', 'Bet on the Parasite', 'A secret bet, changeable once a day. The first ghost to call it right wins 👻 Psychic.'),
    row('🎃', 'Haunt the ship', 'Three harmless pranks a day while the crew explores: flicker the lights, drop a crate, make a pumpkin cackle.'),
    row('💬', 'Ghost channel', 'At night the dead (and spectators) gossip on their own channel.'),
    row('😱', 'Reactions', 'Emoji float up from your seat during the big moments.'),
    row('🔁', 'Rematch & season', 'After a game anyone can call a rematch. A scoreboard tracks the whole evening.'),
    row('📸', 'Share card', 'A picture of the result, with the funniest last words, for your group chat.'),
    row('👀', 'Late friends', 'Friends who arrive mid-game watch from the gallery and join at the next rematch.'),
  );
}

function controls() {
  const keys = [
    ['W A S D', 'move (or the joystick on phones)'], ['M', 'rooms: teleport'], ['K', 'lock the room you are in / knock on a locked door'], ['Tab', 'full station map'], ['E', 'use a task console'], ['R', 'role card & notebook'],
    ['C', 'claim a role'], ['X', 'your ship system'], ['Q', 'emotes (try the 🐶 Scooby and 🤿 Scuba dances!)'], ['Y / N', 'vote yes / no'],
    ['Enter', 'chat'], ['@name + Tab', 'mention a player'], ['Mouse wheel', 'zoom'],
  ];
  return el('div', {},
    el('div', { className: 'wiki-keys' }, ...keys.map(([k, what]) => el('div', { className: 'wiki-key' }, ...k.split(' / ').map((x, i) => [i ? ' / ' : '', el('kbd', {}, x)]).flat(), el('span', {}, what)))),
    el('h3', {}, '🔒 Private chats'),
    el('ul', { className: 'tips' },
      el('li', {}, 'Talking with someone in a room? Press ', el('kbd', {}, 'K'), ' (or the 🔒 button) to lock the door. Nobody else can walk in, and nobody outside can hear you. You need someone in the room with you.'),
      el('li', {}, 'A lock lasts up to 90 seconds. Anyone inside can unlock it (K again). It also opens by itself if people leave, and the bridge cannot be locked.'),
      el('li', {}, 'Locked out? Walk up to the door and press ', el('kbd', {}, 'K'), ' to knock. Whoever is inside gets a button to let you in.'),
      el('li', {}, 'A locked room glows amber and says 🔒 LOCKED. (A Comms Officer\'s intercept can still listen in on one.)'),
    ),
    el('h3', {}, 'Top bar'),
    el('ul', { className: 'tips' },
      el('li', {}, '🗣️ Read aloud: ARIA reads the stories (and, if you like, the chat) out loud.'),
      el('li', {}, '🎵 Music · 🔊 Sound · 🎙️ Voice chat · ⏸️ Pause (host of an Autopilot game)'),
      el('li', {}, 'Click anyone\'s seat on the bridge table to see their claim and turn their voice up or down.'),
    ),
  );
}

// Talking to each other, online:
//   💬 Whisper requests: ask someone for a private chat; if they accept, you
//      are both beamed into an empty room.
//   📣 Claims: tell the table which role you are (truthfully or not). Claims
//      show by each seat on the bridge table.
//   📜 Day log: everything the table has seen happen, searchable.
import { $, el, clear, problem, toast } from '../util.js';
import { store, send, socket, player, isCaptain, role } from '../store.js';
import { sfx } from '../audio.js';
import { ROOMS } from '../world/layout.js';
import { systemLine } from './chat.js';

let world = null;
let inviteTimer = null;

export function initSocial(w) {
  world = w;
  socket.on('whisper-invite', ({ from, name }) => showInvite(from, name));
  socket.on('whisper-reply', ({ name }) => toast(`💬 ${name} can't talk right now.`, 'info', 5000));
  socket.on('whisper-go', ({ room, name }) => {
    const why = world.teleport(room, { force: true });
    if (why) return problem(why);
    sfx('whoosh');
    const where = ROOMS.find((r) => r.id === room)?.name || 'a quiet room';
    systemLine(`💬 Beamed to ${where} for a private chat with ${name}.`);
    toast(`💬 Private chat with ${name} in ${where}`, 'info', 5000);
  });
  $('btn-claim').addEventListener('click', () => toggleClaim());
}

// ---------------------------------------------------------------------------
// Whisper requests
// ---------------------------------------------------------------------------

export function askToWhisper(id) {
  send('whisper-ask', { target: id })
    .then(() => {
      sfx('blip');
      toast(`💬 Asked ${player(id)?.name} for a private chat…`, 'info', 4000);
    })
    .catch((e) => problem(e.message));
}

function showInvite(from, name) {
  const card = $('whisper-card');
  sfx('chime');
  const answer = (yes) => {
    card.hidden = true;
    clearTimeout(inviteTimer);
    send('whisper-answer', { from, yes }).catch((e) => problem(e.message));
  };
  clear(card,
    el('div', {}, '💬 ', el('b', {}, name), ' wants a private chat.'),
    el('div', { className: 'row' },
      el('button', { className: 'primary small', onclick: () => answer(true) }, '✔ Beam us somewhere quiet'),
      el('button', { className: 'small ghost', onclick: () => answer(false) }, 'Not now'),
    ),
  );
  card.hidden = false;
  clearTimeout(inviteTimer);
  inviteTimer = setTimeout(() => (card.hidden = true), 25_000);
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export function canClaim(state = store.state) {
  return !!state && !isCaptain() && !!state.you?.id && !['lobby', 'ended'].includes(state.phase);
}

let pickedRole = null;
function toggleClaim(open = $('claim-menu').hidden) {
  $('claim-menu').hidden = !open || !canClaim();
  if (!$('claim-menu').hidden) {
    pickedRole = store.state.claims?.[store.state.you.id]?.role ?? null;
    draftText = null;
    renderClaimMenu();
  }
}

let draftText = null;
function renderClaimMenu() {
  const menu = $('claim-menu');
  const roles = store.data.roles;
  const mine = store.state.claims?.[store.state.you.id];
  const groups = ['crew', 'drifter', 'saboteur', 'parasite'];
  if (draftText == null) draftText = mine?.text || '';
  const text = el('input', { maxLength: 60, placeholder: 'Add a note (optional), e.g. "I learned Bea is the Medic"', value: draftText });
  text.addEventListener('input', () => (draftText = text.value));
  clear(menu,
    el('div', { className: 'rooms-head' }, el('b', {}, '📣 Claim a role'), el('button', { className: 'small ghost', onclick: () => toggleClaim(false) }, '✕')),
    el('div', { className: 'hint' }, 'Tell everyone which role you are. It shows by your seat and in the day log. You can lie!'),
    el('div', { className: 'claim-post' },
      text,
      el('button', { className: 'primary claim-send', onclick: () => postClaim(pickedRole, text.value) }, pickedRole ? `📣 Claim ${roles[pickedRole].name}` : '📣 Post note'),
      mine ? el('button', { className: 'ghost small', onclick: () => postClaim(null, '') }, 'Take back') : null,
    ),
    ...groups.map((type) => el('div', { className: 'pick-row' },
      ...Object.keys(roles).filter((id) => roles[id].type === type).map((id) =>
        el('button', { className: `small ${pickedRole === id ? 'on' : ''}`, title: roles[id].ability, onclick: () => { pickedRole = pickedRole === id ? null : id; renderClaimMenu(); } }, `${roles[id].icon} ${roles[id].name}`),
      ),
    )),
  );
}

function postClaim(roleId, text) {
  send('claim', { role: roleId, text })
    .then(() => {
      sfx('click');
      draftText = null;
      $('claim-menu').hidden = true;
      toast(roleId ? `📣 You now claim to be the ${store.data.roles[roleId].name}.` : '📣 Claim updated.', 'info', 3000);
    })
    .catch((e) => problem(e.message));
}

export function updateClaimButton(state) {
  $('btn-claim').hidden = !canClaim(state);
  if (!canClaim(state)) $('claim-menu').hidden = true;
}

// The little tag shown under a seat on the bridge table.
export function claimTag(state, id) {
  const c = state.claims?.[id];
  if (!c) return null;
  const r = c.role ? role(c.role) : null;
  return el('span', { className: 'claim-tag', title: `Claims: ${r ? r.name : '—'}${c.text ? ` · "${c.text}"` : ''}` }, r ? r.icon : '💬');
}

// ---------------------------------------------------------------------------
// Day log
// ---------------------------------------------------------------------------

let logSearch = '';

function describe(e) {
  const name = (id) => player(id)?.name || '?';
  switch (e.k) {
    case 'vote': {
      const res = { block: '☠️ on the block', tie: '⚖️ tie', safe: '🛟 safe' }[e.result];
      return `☝️ ${name(e.a)} nominated ${name(e.t)}: ${e.votes}/${e.threshold} votes, ${res}. YES: ${e.voters.length ? e.voters.map(name).join(', ') : 'nobody'}`;
    }
    case 'airlock': return `🚪 ${name(e.id)} was airlocked (${e.votes} votes).`;
    case 'sentinel': return `⚡ ${name(e.id)} nominated the Sentinel and was fried!`;
    case 'noexec': return '🌇 Nobody was airlocked.';
    case 'shot': return `🔫 ${name(e.a)} fired at ${name(e.t)}${e.hit ? ` and vaporised them!` : '… nothing happened.'}`;
    case 'dawn': return e.deaths.length ? `💀 At dawn: ${e.deaths.map(name).join(' and ')} did not wake up.` : '🌅 Everyone survived the night.';
    case 'clue': return `🔭 A clue drifted past the Observation Deck: "${e.caption}"`;
    case 'claim': return `📣 ${name(e.id)} claims to be the ${role(e.role)?.name || '?'} ${role(e.role)?.icon || ''}`;
    default: return null;
  }
}

export function logTab(state, rerender) {
  const q = logSearch.trim().toLowerCase();
  const entries = (state.dayLog || []).map((e) => ({ e, text: describe(e) })).filter((x) => x.text && (!q || x.text.toLowerCase().includes(q)));
  const input = el('input', { type: 'search', placeholder: 'Search the log (a name, "airlock", "claims"…)', value: logSearch });
  input.addEventListener('input', () => {
    logSearch = input.value;
    rerender();
    const again = document.querySelector('#modal-body input[type=search]');
    again?.focus();
    again?.setSelectionRange(again.value.length, again.value.length);
  });
  const byDay = new Map();
  for (const x of entries) {
    const key = x.e.k === 'dawn' ? x.e.day : x.e.day || 0;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(x.text);
  }
  return el('div', { className: 'daylog' },
    el('p', { className: 'hint' }, 'Everything the whole table has seen: nominations and who voted, deaths, clues and claims.'),
    input,
    entries.length
      ? el('div', {}, ...[...byDay.entries()].map(([day, lines]) => el('div', {},
        el('h3', {}, day ? `Day ${day}` : 'Start'),
        el('ul', { className: 'log-list' }, ...lines.map((t) => el('li', {}, t))),
      )))
      : el('p', { className: 'hint' }, q ? 'Nothing matches.' : 'Nothing has happened yet.'),
  );
}

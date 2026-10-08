// The docking bay: customise your suit, see who's aboard, and (host/Captain)
// choose the roles and launch.
import { $, el, clear, problem, toast } from '../util.js';
import { store, send, suitHex, isController, isCaptain } from '../store.js';
import { HAT_LABELS, PET_LABELS } from '../world/avatar.js';
import { sfx } from '../audio.js';

let rolePicks = null; // array of role ids when hand-picking

export function initLobby({ onLeave }) {
  $('lobby-copy').addEventListener('click', () => {
    const url = `${location.origin}/?join=${store.state.code}`;
    navigator.clipboard?.writeText(url).then(() => toast('Invite link copied!'), () => prompt('Copy this link:', url));
  });
  $('lobby-leave').addEventListener('click', onLeave);
}

function setLook(change) {
  const current = store.state.players.find((p) => p.id === store.me)?.cosmetics;
  if (!current) return;
  send('look', { look: { ...current, ...change } }).then(() => sfx('pop')).catch((e) => problem(e.message));
}

export function renderLobby(state) {
  $('lobby-code').textContent = state.code;
  const captain = isCaptain();
  $('lobby-wardrobe').hidden = captain;
  $('lobby-captain-note').hidden = !captain;
  const mine = state.players.find((p) => p.id === store.me)?.cosmetics;
  const data = store.data;

  if (mine) {
    const taken = new Set(state.players.filter((p) => p.id !== store.me).map((p) => p.cosmetics.suit));
    clear($('pick-suit'), ...Object.entries(data.suits).map(([id, hex]) =>
      el('button', { className: `swatch ${mine.suit === id ? 'selected' : ''} ${taken.has(id) ? 'taken' : ''}`, style: { background: hex }, title: id, disabled: taken.has(id), onclick: () => setLook({ suit: id }) }),
    ));
    clear($('pick-hat'), ...data.hats.map((h) => el('button', { className: `chip ${mine.hat === h ? 'selected' : ''}`, onclick: () => setLook({ hat: h }) }, HAT_LABELS[h] || h)));
    clear($('pick-visor'), ...Object.entries(data.visors).map(([id, hex]) => el('button', { className: `swatch ${mine.visor === id ? 'selected' : ''}`, style: { background: hex }, title: id, onclick: () => setLook({ visor: id }) })));
    clear($('pick-pet'), ...data.pets.map((p) => el('button', { className: `chip ${mine.pet === p ? 'selected' : ''}`, onclick: () => setLook({ pet: p }) }, PET_LABELS[p] || p)));
  }

  const n = state.players.length;
  const ctl = isController();
  $('lobby-count').textContent = `(${n}/${data.maxPlayers})`;
  clear($('lobby-players'), ...state.players.map((p, i) =>
    el('li', {},
      el('span', { className: 'seatno' }, i + 1),
      el('span', { className: 'dot', style: { background: suitHex(p) } }),
      el('span', { className: 'name' }, p.name, p.id === store.me ? ' (you)' : '', p.id === state.hostId ? ' 👑' : ''),
      ctl ? el('button', { className: 'ghost', title: 'Move up', onclick: () => send('seat', { id: p.id, dir: -1 }).catch((e) => problem(e.message)) }, '▲') : null,
      ctl ? el('button', { className: 'ghost', title: 'Move down', onclick: () => send('seat', { id: p.id, dir: 1 }).catch((e) => problem(e.message)) }, '▼') : null,
      ctl && p.id !== store.me ? el('button', { className: 'ghost', title: 'Remove', onclick: () => confirm(`Remove ${p.name}?`) && send('kick', { id: p.id }).catch((e) => problem(e.message)) }, '✕') : null,
    ),
  ));

  const setup = $('lobby-setup');
  const wait = $('lobby-wait');
  if (!ctl) {
    clear(setup);
    wait.textContent = state.mode === 'captain'
      ? `Captain ${state.captain?.name || ''} will launch the ship when everyone is ready.`
      : 'The host (👑) will launch the ship when everyone is ready.';
    return;
  }
  wait.textContent = state.mode === 'captain' ? 'You are the Captain: you will see everything and run the game.' : 'You are the host. ARIA (the autopilot) will run the game; you play too.';
  const enough = n >= data.minPlayers;
  const dist = data.distribution[n];
  const counts = dist ? `${dist[0]} Crew · ${dist[1]} Drifters · ${dist[2]} Saboteurs · 1 Parasite` : '';
  const pace = el('select', { onchange: (e) => send('pace', { pace: Number(e.target.value) }).catch((er) => problem(er.message)) },
    el('option', { value: 1.3, selected: state.pace === 1.3 }, '🐢 Relaxed (long chats)'),
    el('option', { value: 1, selected: state.pace === 1 }, '⏱️ Standard (~1h for 10)'),
    el('option', { value: 0.7, selected: state.pace === 0.7 }, '⚡ Quick'),
  );
  const picking = !!rolePicks;
  const roleToggle = el('label', { className: 'check' }, el('input', { type: 'checkbox', checked: picking, onchange: (e) => { rolePicks = e.target.checked ? [...(state.customRoles || [])] : null; if (!rolePicks) send('roles', { roles: null }).catch(() => {}); renderLobby(store.state); } }), 'Hand-pick the roles (otherwise ARIA deals a balanced random set)');
  clear(setup,
    el('h3', {}, '🚀 Launch settings'),
    el('label', {}, 'Pace', pace),
    el('div', { className: 'hint' }, enough ? `${n} players: ${counts}${n <= 4 ? ' (Short Haul: quick game)' : ''}` : `Need at least ${data.minPlayers} players to launch.`),
    roleToggle,
    picking ? rolePicker(state, n) : null,
    el('button', { className: 'secondary', onclick: () => send('shuffle-seats').catch((e) => problem(e.message)) }, '🔀 Shuffle seats'),
    el('button', {
      className: 'primary big', disabled: !enough,
      onclick: () => {
        const go = () => send('start').then(() => sfx('whoosh')).catch((e) => problem(e.message));
        if (rolePicks) send('roles', { roles: rolePicks }).then(go).catch((e) => problem(e.message));
        else go();
      },
    }, enough ? '🚀 Launch the ship' : `Waiting for crew (${n}/${data.minPlayers})`),
  );
}

function rolePicker(state, n) {
  const data = store.data;
  const dist = data.distribution[n];
  if (!dist) return el('p', { className: 'hint' }, 'Add more players first.');
  const withSmuggler = rolePicks.includes('smuggler');
  const want = { crew: dist[0] - (withSmuggler ? 2 : 0), drifter: dist[1] + (withSmuggler ? 2 : 0), saboteur: dist[2], parasite: 1 };
  const groups = ['parasite', 'saboteur', 'drifter', 'crew'];
  return el('div', {},
    el('div', { className: 'hint' }, groups.map((t) => `${data.types[t].name}: ${rolePicks.filter((r) => data.roles[r].type === t).length}/${want[t]}`).join(' · ')),
    el('div', { className: 'role-picker' }, ...groups.flatMap((type) =>
      Object.entries(data.roles).filter(([, r]) => r.type === type).map(([id, r]) => {
        const locked = r.minPlayers > n;
        return el('label', { className: locked ? 'locked' : '', title: r.ability },
          el('input', { type: 'checkbox', checked: rolePicks.includes(id), disabled: locked, onchange: (e) => { if (e.target.checked) rolePicks.push(id); else rolePicks = rolePicks.filter((x) => x !== id); renderLobby(store.state); } }),
          `${r.icon} ${r.name}`, el('span', { className: 'muted' }, ` · ${data.types[type].name}${locked ? ` (${r.minPlayers}+)` : ''}`),
        );
      }),
    )),
  );
}

export function resetLobbyPicks() {
  rolePicks = null;
}

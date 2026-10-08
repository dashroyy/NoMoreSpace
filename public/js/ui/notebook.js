// Your private notebook: what each player claims to be, whether you trust
// them, and a scribble. Blood on the Clocktower players keep the same notes
// on paper. It lives only in this browser, and your guesses show up as small
// badges on the bridge table.
import { el } from '../util.js';
import { store, role, suitHex } from '../store.js';

const PREFIX = 'nms-notebook:';
const TRUST = [['', '❔'], ['good', '😇'], ['evil', '😈']];

let cache = { key: null, notes: {} };

function storageKey() {
  const s = store.state;
  return s?.code && s.you?.id ? `${PREFIX}${s.code}:${s.you.id}` : null;
}

function load() {
  const key = storageKey();
  if (cache.key === key) return cache.notes;
  let notes = {};
  try {
    notes = JSON.parse(localStorage.getItem(key) || '{}') || {};
  } catch {}
  cache = { key, notes };
  return notes;
}

function save() {
  if (!cache.key) return;
  try {
    // only keep the current game's notebook
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX) && k !== cache.key) localStorage.removeItem(k);
    }
    localStorage.setItem(cache.key, JSON.stringify(cache.notes));
  } catch {}
}

export function noteFor(playerId) {
  return load()[playerId] || null;
}

// A tiny badge for the bridge table: the role you think they are, or your trust.
export function badgeFor(playerId) {
  const n = noteFor(playerId);
  if (!n) return null;
  const r = role(n.role);
  const trust = TRUST.find(([id]) => id === n.trust)?.[1];
  if (r) return { text: r.icon, trust: n.trust || '', title: `You noted: ${r.name}${n.trust ? ` (${n.trust})` : ''}${n.text ? ` · ${n.text}` : ''}` };
  if (n.trust) return { text: trust, trust: n.trust, title: `You noted: ${n.trust}${n.text ? ` · ${n.text}` : ''}` };
  return null;
}

export function clearNotebook() {
  load();
  cache.notes = {};
  save();
}

function update(playerId, patch, onChange) {
  const notes = load();
  const next = { ...(notes[playerId] || {}), ...patch };
  if (!next.role && !next.trust && !next.text) delete notes[playerId];
  else notes[playerId] = next;
  save();
  onChange?.();
}

function roleSelect(value, onPick) {
  const groups = ['crew', 'drifter', 'saboteur', 'parasite'].map((type) =>
    el('optgroup', { label: `${store.data.types[type].name}s` },
      ...Object.entries(store.data.roles)
        .filter(([, r]) => r.type === type)
        .map(([id, r]) => el('option', { value: id, selected: id === value }, `${r.icon} ${r.name}`)),
    ),
  );
  return el('select', { className: 'nb-role', onchange: (e) => onPick(e.target.value) }, el('option', { value: '' }, '— claims / role? —'), ...groups);
}

export function notebookTab(onChange) {
  const state = store.state;
  const you = state?.you;
  if (!you || you.isCaptain || state.phase === 'lobby') {
    return el('p', { className: 'hint' }, 'Your notebook opens once the ship launches. Use it to track who claims what.');
  }
  const rows = state.players.filter((p) => p.id !== you.id).map((p) => {
    const n = noteFor(p.id) || {};
    const trust = el('div', { className: 'nb-trust' }, ...TRUST.map(([id, icon]) =>
      el('button', {
        className: `small ${(n.trust || '') === id ? 'active' : ''}`,
        title: id ? `Mark as ${id}` : 'Unsure',
        onclick: () => {
          update(p.id, { trust: id }, onChange);
        },
      }, icon),
    ));
    return el('div', { className: `nb-row ${p.alive ? '' : 'dead'}` },
      el('div', { className: 'nb-name' }, el('span', { className: 'dot', style: { background: suitHex(p) } }), p.name, p.alive ? '' : ' 👻'),
      roleSelect(n.role, (value) => update(p.id, { role: value }, onChange)),
      trust,
      el('input', {
        className: 'nb-text', maxLength: 120, placeholder: 'Notes…', value: n.text || '',
        onchange: (e) => update(p.id, { text: e.target.value.trim() }, onChange),
      }),
    );
  });
  return el('div', { className: 'notebook' },
    el('p', { className: 'hint' }, 'Only you can see this. Note what people claim and who you trust; your guesses appear as badges on the bridge table.'),
    ...rows,
    el('button', { className: 'small ghost', onclick: () => confirm('Wipe your notebook for this game?') && (clearNotebook(), onChange?.()) }, '🧽 Wipe notebook'),
  );
}

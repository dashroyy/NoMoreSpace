// The Captain's Command Station: run the game like a Blood on the Clocktower
// Storyteller. Move between phases, read the Ship Manifest (grimoire), edit
// what players learn at night, tell the story of each death, puppet players.
import { $, el, clear, problem, toast, formatTime } from '../util.js';
import { store, send, role, player, serverNow, themeInfo } from '../store.js';
import { sfx } from '../audio.js';

let tab = 'control';
let lastPhase = null;
let dirty = false;
let puppetTarget = null;

const NEXT_LABEL = {
  night: (s) => (s.grimoire?.draftReady ? '🌅 Begin dawn (deliver the night)' : s.grimoire?.draft ? '⏳ Waiting for the Black Box…' : '🌙 Resolve the night now'),
  dawn: () => '☀️ Let everyone explore',
  roam: () => '🚨 Call the emergency meeting',
  meeting: () => '☝️ Open nominations',
  nominations: () => '🌇 Close nominations → dusk',
  lastwords: () => '🚪 Cut the last words short → airlock',
  dusk: (s) => (s.winner ? '🏁 Finish' : '🌙 Begin the night'),
};

const JOKES = [
  '📢 Attention crew: the coffee machine has become sentient. Please be polite to it.',
  '📢 Reminder: the airlock is NOT a bin. Looking at you.',
  '📢 Lost: one (1) emotional support hamster. Answers to "Kevin". May be in the vents. May be the Parasite.',
  '📢 The black hole has asked us to stop calling it "the void". It prefers "Gary".',
  '📢 Gravity will be briefly switched off for maintenance. Hold on to your snacks.',
  '📢 Whoever keeps humming in the reactor at 3am: we can all hear you.',
  '📢 Today\'s galley special: mystery noodles. The mystery is what\'s in them.',
];

export function initCommand() {
  $('command-collapse').addEventListener('click', () => $('command').classList.toggle('collapsed'));
  $('command-body').addEventListener('focusout', () => {
    if (dirty) setTimeout(() => {
      if (!$('command-body').contains(document.activeElement)) renderCommand(store.state, true);
    }, 50);
  });
}

function act(event, data = {}, msg) {
  return send(event, data).then(() => {
    if (msg) toast(msg);
    sfx('click');
  }).catch((e) => problem(e.message));
}

export function renderCommand(state, force = false) {
  const show = !!state?.you?.isCaptain && state.phase !== 'lobby';
  $('command').hidden = !show;
  if (!show) return;
  const body = $('command-body');
  if (!force && body.contains(document.activeElement) && ['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement.tagName)) {
    dirty = true;
    return;
  }
  dirty = false;
  // jump to the Night tab once when night falls (not on every redraw)
  if (state.phase !== lastPhase) {
    if (state.phase === 'night') tab = 'night';
    lastPhase = state.phase;
  }
  const tabs = [['control', '▶ Control'], ['manifest', '📒 Manifest'], ['night', '🌙 Night'], ['story', '☁️ Story'], ['clues', '🔭 Clues & art'], ['danger', '⚠️ Danger']];
  clear($('command-tabs'), ...tabs.map(([id, label]) => el('button', { className: tab === id ? 'active' : '', onclick: () => { tab = id; renderCommand(store.state, true); } }, label)));
  const view = { control, manifest, night, story, clues, danger }[tab](state);
  clear(body, view);
}

// ---------------------------------------------------------------------------

function control(s) {
  const g = s.grimoire;
  const parts = [];
  parts.push(el('section', {},
    el('h3', {}, `Phase: ${s.phase.toUpperCase()} ${s.phase === 'night' ? s.night : `· day ${s.day}`}`),
    el('div', { className: 'hint' }, s.paused ? '⏸ Paused' : s.phaseEndsAt ? `Timer: ${formatTime(s.phaseEndsAt - serverNow())}` : 'No timer'),
    s.phase !== 'ended' ? el('button', { className: 'primary big-next', disabled: s.phase === 'night' && g?.draft && !g.draftReady, onclick: () => act('advance') }, NEXT_LABEL[s.phase]?.(s) || 'Next ▶') : el('p', {}, '🏁 The game is over.'),
    s.nomination ? el('div', { className: 'hint' }, 'A vote is running. It finishes on its own (you can skip speeches with "Next speaker").') : null,
    s.nomination && s.nomination.stage !== 'vote' ? el('button', { onclick: () => act('done-speaking') }, '⏭ Next speaker / start the vote') : null,
    el('div', { className: 'grid-buttons' },
      el('button', { onclick: () => act('add-time', { seconds: 60 }) }, '+1 min'),
      el('button', { onclick: () => act('add-time', { seconds: 30 }) }, '+30 s'),
      el('button', { onclick: () => act('add-time', { seconds: -30 }) }, '−30 s'),
      el('button', { onclick: () => act('pause') }, s.paused ? '▶ Resume' : '⏸ Pause'),
    ),
    el('label', { className: 'check' }, el('input', { type: 'checkbox', checked: s.autoAdvance, onchange: (e) => act('auto', { on: e.target.checked }) }), 'Auto-advance when timers run out or everyone is ready (ARIA helps)'),
    ['roam', 'meeting', 'nominations'].includes(s.phase) && !s.nomination
      ? el('div', { className: 'hint' }, `⏭️ Ready to move on: ${s.ready.length}/${s.readyNeeded}${s.ready.length ? ` (${s.ready.map((id) => player(id)?.name).filter(Boolean).join(', ')})` : ''}`)
      : null,
  ));
  if (s.phase === 'night') parts.push(nightStatus(s));
  parts.push(el('section', {},
    el('h3', {}, '🎙️ Storyteller tips'),
    el('ul', { className: 'tips hint' },
      el('li', {}, 'Night: check the 🌙 tab. Glitched/drunk players get false info that ARIA already wrote. Tweak it to keep the game tense and fair.'),
      el('li', {}, 'Dawn: write a story for each death in ☁️ Story, then begin dawn. It appears in a cloud bubble for everyone.'),
      el('li', {}, 'Keep it balanced: if one team is running away with it, use clues (🔭) and the Stowaway/Mimic registration to help the other side.'),
    ),
  ));
  return el('div', {}, ...parts);
}

function nightStatus(s) {
  const g = s.grimoire;
  const name = (id) => player(id)?.name || '?';
  return el('section', {},
    el('h3', {}, '🌙 Who has chosen'),
    ...Object.entries(g.prompts).map(([id, pr]) => el('div', { className: 'hint' }, `${pr.chosen ? '✅' : '⏳'} ${name(id)} (${role(pr.role).name})${pr.chosen ? ` → ${pr.chosen.map(name).join(' & ')}` : ''}`)),
    Object.keys(g.prompts).length ? null : el('div', { className: 'hint' }, 'Nobody needs to choose tonight.'),
  );
}

function manifest(s) {
  const g = s.grimoire;
  if (!g) return el('p', {}, 'No game running.');
  const name = (id) => player(id)?.name || '?';
  return el('div', {},
    el('section', {},
      el('h3', {}, '📒 Ship Manifest'),
      ...g.players.map((p, seat) => {
        const r = role(p.role);
        const team = store.data.types[r.type].team;
        const flags = [
          !p.alive && el('span', { className: 'flag bad' }, '💀 dead'),
          !p.alive && p.ghostVote && el('span', { className: 'flag' }, '👻 vote'),
          p.glitched && el('span', { className: 'flag bad' }, '⚡ glitched'),
          p.hallucinating && el('span', { className: 'flag bad' }, '🤡 hallucinating'),
          p.redHerring && el('span', { className: 'flag' }, '📡 ghost signal'),
          p.used && el('span', { className: 'flag' }, 'ability used'),
          p.master && el('span', { className: 'flag' }, `master: ${name(p.master)}`),
        ];
        return el('div', { className: `grim-row ${p.alive ? '' : 'dead'}` },
          el('span', { className: 'muted' }, seat + 1),
          el('div', {},
            el('b', {}, p.name), ' ',
            el('span', { className: 'role', style: { color: team === 'crew' ? 'var(--good)' : 'var(--evil)' } }, `${r.icon} ${r.name}`),
            p.role === 'drunk' ? el('span', { className: 'muted' }, ` (thinks: ${role(p.believed).name})`) : null,
            el('div', { className: 'flags' }, ...flags),
            el('div', { className: 'hint' }, ...(g.notes[p.id] || []).slice(-2).map((n) => el('div', {}, `• ${n.text}`))),
          ),
          el('button', { className: 'small ghost', title: p.alive ? 'Kill (Captain intervention)' : 'Revive', onclick: () => confirm(`${p.alive ? 'Kill' : 'Revive'} ${p.name}?`) && act('toggle-dead', { id: p.id }) }, p.alive ? '☠' : '♻'),
        );
      }),
    ),
    el('section', {},
      el('h3', {}, '🎭 Parasite bluffs'),
      el('div', { className: 'hint' }, g.bluffs.map((b) => `${role(b).icon} ${role(b).name}`).join(' · ') || 'none'),
      s.playerCount < store.data.evilInfoMin ? el('div', { className: 'hint' }, `With fewer than ${store.data.evilInfoMin} players the Parasite is not told these, just like in Blood on the Clocktower.`) : null,
    ),
  );
}

function night(s) {
  const g = s.grimoire;
  if (s.phase !== 'night') return el('section', {}, el('p', { className: 'hint' }, 'This tab is for the night. Come back when the lights go out.'));
  const d = g.draft;
  const name = (id) => player(id)?.name || '?';
  if (!d) {
    return el('div', {}, nightStatus(s), el('section', {},
      el('p', { className: 'hint' }, 'When everyone has chosen, the night\'s results appear here for you to review.'),
      el('button', { className: 'primary', onclick: () => act('advance') }, '🌙 Resolve now (ARIA picks for anyone who hasn\'t chosen)'),
    ));
  }
  const deaths = new Set(d.deaths.map((x) => x.id));
  return el('div', {},
    el('section', {},
      el('h3', {}, '📜 What happened'),
      ...d.events.filter((e) => e.k !== 'info').map((e) => el('div', { className: 'hint' }, describeEvent(e, name))),
      d.starpass ? el('div', {}, `🦑 The Parasite jumps from ${name(d.starpass.from)} to ${name(d.starpass.to)}`) : null,
    ),
    el('section', {},
      el('h3', {}, '✉️ Messages players will receive'),
      el('div', { className: 'hint' }, 'Edit any message. Lines marked FALSE go to glitched or drunk players: make the lies believable!'),
      ...d.messages.map((m, i) => el('div', { className: 'draft-msg' },
        el('div', {}, el('b', {}, `${name(m.to)} — ${role(m.role).icon} ${role(m.role).name}`), m.truthful ? '' : el('span', { className: 'false' }, '  ⚠ FALSE (glitched/drunk)')),
        el('textarea', { value: m.text, onchange: (e) => act('draft-edit', { messageIndex: i, text: e.target.value }) }),
      )),
      d.messages.length ? null : el('div', { className: 'hint' }, 'No messages tonight.'),
    ),
    el('section', {},
      el('h3', {}, '💀 Deaths at dawn'),
      el('div', { className: 'hint' }, 'Click to add or remove a death (e.g. to save the First Officer).'),
      el('div', { className: 'grid-buttons' }, ...s.players.filter((p) => p.alive).map((p) =>
        el('button', { className: deaths.has(p.id) ? 'danger' : '', onclick: () => act('draft-edit', { toggleDeath: p.id }) }, `${deaths.has(p.id) ? '☠ ' : ''}${p.name}`),
      )),
      ...[...deaths].map((id) => el('label', {}, `Death animation for ${name(id)}`,
        el('select', { onchange: (e) => act('draft-edit', { anims: { [id]: e.target.value } }) },
          ...store.data.deathAnims.map((a) => el('option', { value: a, selected: d.anims[id] === a }, ANIM_LABELS[a] || a)),
        ),
      )),
    ),
    el('section', {},
      el('h3', {}, '☁️ Tonight\'s story'),
      el('div', { className: 'hint' }, 'Shown in a cloud bubble at dawn. Leave empty and ARIA writes one.'),
      el('textarea', { value: d.story || '', placeholder: 'Mist curled from the vents as Bob reached for the last biscuit…', onchange: (e) => act('draft-edit', { story: e.target.value }) }),
    ),
    el('button', { className: 'primary big-next', disabled: !g.draftReady, onclick: () => act('advance') }, g.draftReady ? '🌅 Begin dawn' : '⏳ Waiting for the Black Box to choose…'),
  );
}

const ANIM_LABELS = {
  airlock: '🚪 Airlocked', consumed: '🦑 Consumed by tentacles', spaghettified: '🍝 Spaghettified', abducted: '🛸 Abducted', melted: '🫠 Melted',
  confetti: '🎉 Exploded into confetti', frozen: '🧊 Frozen solid', duck: '🦆 Turned into a rubber duck', floataway: '🎈 Floated away', fainted: '😵 Fainted dramatically', shot: '🔫 Shot',
  balloon: '🎈 Inflated and popped', disco: '🪩 Danced to death', tiny: '🐜 Shrank to nothing', rocket: '🚀 Rocketed into space',
};

function describeEvent(e, name) {
  switch (e.k) {
    case 'hack': return `💻 Hacker glitched ${name(e.t)}`;
    case 'hallucinate': return `🤡 Holo-Jester pranks ${name(e.t)}${e.works ? ': they hallucinate tomorrow' : ' (no effect: glitched)'}`;
    case 'protect': return `💉 Medic shielded ${name(e.t)}${e.works ? '' : ' (no effect: glitched/drunk)'}`;
    case 'kill': return `🦑 Parasite attacked ${name(e.t)}: ${{ died: 'they die', protected: 'saved by the Medic', marine: 'the Marine shrugged it off', glitched: 'the Parasite was glitched', starpass: `jumped hosts${e.to ? ` to ${name(e.to)}` : ''}`, bounced: `the First Officer dodged, ${name(e.victim)} dies instead`, 'bounced-safe': 'the First Officer dodged' }[e.result] || e.result}`;
    case 'master': return `🤖 Service Droid serves ${name(e.t)}`;
    case 'blackbox': return `📼 Black Box: ${e.text}`;
    default: return e.k;
  }
}

function story(s) {
  const puppetList = s.players.map((p) => el('button', { className: puppetTarget === p.id ? 'primary' : '', onclick: () => { puppetTarget = p.id; renderCommand(store.state, true); } }, p.name));
  const labels = { wave: '👋 wave', dance: '💃 dance', jump: '🦘 jump', spin: '🌀 spin', shrug: '🤷 shrug', point: '👉 point', cry: '😭 cry', laugh: '🤣 laugh', faint: '😵 faint', shiver: '🥶 shiver', flail: '🙌 flail', grow: '🔼 grow', shrink: '🔽 shrink', chicken: '🐔 chicken', sneeze: '🤧 sneeze', moonwalk: '🕺 moonwalk', levitate: '🪄 levitate', confetti: '🎉 confetti', zap: '⚡ zap' };
  const sayBox = el('textarea', { placeholder: 'Tell the story… it appears in a cloud bubble for everyone.' });
  return el('div', {},
    el('section', {},
      el('h3', {}, '☁️ Speak to the ship'),
      sayBox,
      el('button', { className: 'primary', onclick: () => sayBox.value.trim() && act('say', { text: sayBox.value }, 'Story sent!').then(() => (sayBox.value = '')) }, 'Show cloud bubble'),
      el('div', { className: 'hint' }, 'Quick announcements:'),
      el('div', { className: 'grid-buttons' }, ...(themeInfo(s.script).jokes.length ? themeInfo(s.script).jokes : JOKES).map((j) => el('button', { title: j, onclick: () => act('say', { text: j }) }, j.slice(3, 32) + '…'))),
    ),
    el('section', {},
      el('h3', {}, '🎉 Ship events'),
      el('div', { className: 'hint' }, 'Shake things up for everyone. Purely for fun: no effect on the rules.'),
      el('div', { className: 'grid-buttons' },
        ...[['zerog', '🪐 Zero gravity (25s)'], ['disco', '🪩 Disco mode (25s)'], ['alarm', '🚨 Red alert'], ['confetti', '🎉 Confetti storm']].map(([kind, label]) =>
          el('button', { onclick: () => act('ship-event', { kind }) }, label)),
      ),
      el('div', { className: 'hint' }, 'Sound stingers (everyone hears them):'),
      el('div', { className: 'grid-buttons' },
        ...[['trombone', '🎺 Sad trombone'], ['drumroll', '🥁 Drumroll'], ['airhorn', '📯 Air horn'], ['crickets', '🦗 Crickets'], ['kazoo', '🎶 Kazoo'], ['gasp', '😱 Gasp']].map(([name, label]) =>
          el('button', { onclick: () => act('stinger', { name }) }, label)),
      ),
    ),
    el('section', {},
      el('h3', {}, '🎭 Puppet the crew'),
      el('div', { className: 'hint' }, 'Pick a player, then make them do something silly to match your story.'),
      el('div', { className: 'grid-buttons' }, ...puppetList),
      puppetTarget ? el('div', { className: 'grid-buttons' }, ...store.data.captainEmotes.map((e) => el('button', { onclick: () => act('puppet', { id: puppetTarget, emote: e }) }, labels[e] || e))) : null,
    ),
  );
}

function clues(s) {
  const g = s.grimoire;
  const kinds = [
    ['dead-constellation', '💀 Dead constellation (a good role NOT aboard)', 'crew'],
    ['comets', '☄️ Three comets: one is evil', 'crew'],
    ['probe', '🛰️ Probe: this player is not the Parasite', 'crew'],
    ['living-constellation', '✨ Living constellation (a good role aboard)', 'evil'],
    ['role-comets', '☄️ Comets: one of three has a role', 'evil'],
    ['drift-count', '💡 Debris lights: number of Drifters', 'evil'],
  ];
  return el('div', {},
    el('section', {},
      el('h3', {}, '🔭 Window clues'),
      el('div', { className: 'hint' }, `Observation Array: ${s.charge}/${s.chargeNeeded}. When full at dawn, a clue that helps the losing team drifts past outside the Observation Deck for 20 seconds at a random moment while everyone explores. Players who did a task that day get a 20-second warning.`),
      s.clue ? el('div', {}, `Today's clue: ${s.clue.kind} — “${s.clue.caption}”${s.clue.at ? (s.clue.live ? ' · drifting past now!' : ` · arrives ${new Date(s.clue.at).toLocaleTimeString()}`) : ' · arrives during exploring'}`) : el('div', { className: 'hint' }, 'No clue today.'),
      el('div', { className: 'hint' }, 'Show a clue right now:'),
      el('div', { className: 'grid-buttons' }, ...kinds.map(([k, label, team]) => el('button', { title: `Helps the ${team}`, onclick: () => act('clue', { kind: k }, 'A clue will drift past the Observation Deck in 20 seconds (or during the next exploring phase).') }, label))),
    ),
    el('section', {},
      el('h3', {}, '🎭 Registration'),
      el('div', { className: 'hint' }, 'How the Stowaway and Mimic show up to Scanners, Engineers, the Gunner, etc.'),
      el('label', {}, 'Stowaway registers as',
        el('select', { onchange: (e) => act('reg', { role: 'stowaway', policy: e.target.value }) },
          ...[['auto', 'ARIA decides (50/50)'], ['evil', 'Evil'], ['good', 'Good']].map(([v, l]) => el('option', { value: v, selected: g?.regPolicy.stowaway === v }, l)))),
      el('label', {}, 'Mimic registers as',
        el('select', { onchange: (e) => act('reg', { role: 'mimic', policy: e.target.value }) },
          ...[['auto', 'ARIA decides (50/50)'], ['good', 'Good'], ['evil', 'Evil']].map(([v, l]) => el('option', { value: v, selected: g?.regPolicy.mimic === v }, l)))),
    ),
    el('section', {},
      el('h3', {}, '🎨 Drawings on the walls'),
      ...(s.drawings.length ? s.drawings.map((d) => el('div', { className: 'row' }, el('span', {}, d.signedBy ? `by ${d.signedBy}` : 'anonymous'), el('button', { className: 'small ghost', onclick: () => act('remove-drawing', { id: d.id }, 'Drawing removed') }, 'Remove'))) : [el('div', { className: 'hint' }, 'No drawings yet.')]),
    ),
  );
}

function danger(s) {
  return el('div', {},
    el('section', {},
      el('h3', {}, '🤖 Hand over to ARIA'),
      el('div', { className: 'hint' }, 'The autopilot finishes the game for you, using the timers.'),
      el('button', { onclick: () => confirm('Hand the game to ARIA?') && act('autopilot', {}, 'ARIA has the helm.') }, 'Hand over'),
    ),
    el('section', {},
      el('h3', {}, '🏁 End the game now'),
      el('div', { className: 'grid-buttons' },
        el('button', { onclick: () => confirm('Declare victory for the CREW?') && act('end', { winner: 'crew' }) }, '🛡️ Crew wins'),
        el('button', { onclick: () => confirm('Declare victory for the INFILTRATORS?') && act('end', { winner: 'infiltrators' }) }, '🦑 Infiltrators win'),
      ),
    ),
    el('section', {},
      el('h3', {}, '♻️ Reset the ship'),
      el('div', { className: 'hint' }, 'Back to the docking bay. Everyone keeps their suits; roles are cleared.'),
      el('button', { className: 'danger', onclick: () => confirm('Reset everything back to the lobby?') && act('reset', {}, 'Ship reset.') }, 'Reset everything'),
    ),
  );
}

// Phase to Space: chat and quick reactions.
import { el } from '../util.js';
import { iconEl } from '../icons.js';
import { send, store } from './net.js';
import { sfx } from './sound.js';

// the quick reactions (the server only accepts these eight); each is shown as an icon
const REACTIONS = [['😂', 'laugh'], ['😱', 'scream'], ['👏', 'clap'], ['🔥', 'fire'], ['😈', 'devil'], ['🤔', 'think'], ['😭', 'cry'], ['🎉', 'popper']];

const mounts = [];

export function mountChat(container, { compact = false } = {}) {
  const log = el('div', { className: 'chat-log' });
  const input = el('input', { maxLength: 160, placeholder: 'Say something…', autocomplete: 'off' });
  const form = el('form', { className: 'chat-form', onsubmit: (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    send('chat', { text }).catch(() => {});
  } }, input);
  const emotes = el('div', { className: 'emotes' }, REACTIONS.map(([emoji, icon]) => el('button', { className: 'ghost emote', title: 'React', onclick: () => {
    send('emote', { emote: emoji }).catch(() => {});
    sfx('emote');
  } }, iconEl(icon))));
  container.classList.add('chat');
  container.replaceChildren(log, emotes, form);
  const mount = { log, compact, last: 0 };
  mounts.push(mount);
  if (store.state) renderChat(store.state);
}

export function renderChat(state) {
  for (const m of mounts) {
    if (!m.log.isConnected) continue;
    const lines = state.chat || [];
    const sig = lines.length ? lines[lines.length - 1].seq : 0;
    if (sig === m.last) continue;
    m.last = sig;
    const atBottom = m.log.scrollHeight - m.log.scrollTop - m.log.clientHeight < 40;
    m.log.replaceChildren(
      ...lines.map((c) => el('div', { className: `msg ${c.from === state.you.id ? 'mine' : ''}` }, el('span', { className: 'av' }, c.avatar), el('b', {}, c.name), ' ', el('span', {}, c.text))),
    );
    if (atBottom) m.log.scrollTop = m.log.scrollHeight;
  }
}

// Star Bonanza: chat, quick reactions, and the game log (the lobby and the game each have one).
import { el } from '../util.js';
import { send } from './net.js';

const EMOTES = ['😂', '😱', '👏', '🔥', '😈', '🤔', '😭', '🎉'];
const mounts = [];

export function mountChat(root) {
  const input = el('input', { placeholder: 'Say something…', maxLength: 200 });
  const form = el('form', { className: 'chat-form', onsubmit: (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    send('chat', { text }).catch(() => {});
    input.value = '';
  } }, input);
  const refs = {
    tabs: el('div', { className: 'chat-tabs' }),
    log: el('div', { className: 'chat-log' }),
    battle: el('div', { className: 'battle-log', hidden: true }),
    emotes: el('div', { className: 'emotes' }, ...EMOTES.map((e) => el('button', { className: 'emote', onclick: () => send('emote', { emote: e }).catch(() => {}) }, e))),
  };
  const tab = (name, label) =>
    el('button', { className: `tab ${name === 'chat' ? 'on' : ''}`, onclick: (e) => {
      for (const b of refs.tabs.children) b.classList.toggle('on', b === e.currentTarget);
      refs.log.hidden = name !== 'chat';
      refs.battle.hidden = name !== 'log';
    } }, label);
  refs.tabs.append(tab('chat', 'Chat'), tab('log', 'Game log'));
  root.replaceChildren(refs.tabs, refs.log, refs.battle, refs.emotes, form);
  mounts.push(refs);
}

export function renderChat(state) {
  for (const refs of mounts) {
    if (!refs.tabs.isConnected || refs.tabs.closest('[hidden]')) continue; // (on a screen that is not showing)
    const last = state.chat.length ? state.chat[state.chat.length - 1].at : 0;
    if (refs.log.dataset.last !== String(last)) {
      refs.log.dataset.last = String(last);
      refs.log.replaceChildren(...state.chat.map((m) => el('div', { className: 'msg' }, el('span', {}, m.avatar), el('b', {}, m.name), ` ${m.text}`)));
      refs.log.scrollTop = refs.log.scrollHeight;
    }
    const lines = state.log.filter((l) => l.k !== 'emote');
    const seq = lines.length ? lines[lines.length - 1].seq : 0;
    if (refs.battle.dataset.last !== String(seq)) {
      refs.battle.dataset.last = String(seq);
      refs.battle.replaceChildren(...lines.map((l) => el('div', { className: `line k-${l.k}` }, l.text)));
      refs.battle.scrollTop = refs.battle.scrollHeight;
    }
  }
}

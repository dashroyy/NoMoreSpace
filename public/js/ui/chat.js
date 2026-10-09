// Text chat. By day you only hear people in the same room or nearby
// (proximity chat). During meetings everyone hears everyone. At night only
// the infiltrators can talk, on their secret channel.
import { $, el, buzz } from '../util.js';
import { send, store, socket } from '../store.js';
import { sfx } from '../audio.js';
import { speak } from '../tts.js';

let tab = 'near';
const logs = { near: [], evil: [], ghost: [] };

export function initChat() {
  // "…" over your head while you type, and Tab to finish an @name
  const input0 = $('chat-input');
  let typingSent = 0;
  const typing = (on) => {
    const now = Date.now();
    if (on && now - typingSent < 2500) return;
    typingSent = on ? now : 0;
    socket.emit('typing', { on }, () => {});
  };
  input0.addEventListener('input', () => typing(!!input0.value.trim()));
  input0.addEventListener('blur', () => typingSent && typing(false));
  input0.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const m = input0.value.match(/@([^@\s]*)$/);
    if (!m) return;
    const hit = (store.state?.players || []).map((p) => p.name).find((n) => n.toLowerCase().startsWith(m[1].toLowerCase()));
    if (!hit) return;
    e.preventDefault();
    input0.value = `${input0.value.slice(0, input0.value.length - m[0].length)}@${hit} `;
  });
  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (typingSent) typing(false);
    const input = $('chat-input');
    const text = input.value.trim();
    if (!text) return;
    send('chat', { text, channel: tab === 'evil' ? 'evil' : 'near' })
      .then((r) => {
        if (r.channel === 'near' && r.heard === 0) systemLine('🔇 Nobody heard that. Press M (🚀 Rooms) to teleport to someone, then chat.');
      })
      .catch(() => {});
    input.value = '';
  });
  $('evil-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('evil-input');
    const text = input.value.trim();
    if (!text) return;
    send('chat', { text, channel: 'evil' }).catch(() => {});
    input.value = '';
  });
  $('ghost-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('ghost-input');
    const text = input.value.trim();
    if (!text) return;
    send('chat', { text, channel: 'ghost' }).catch(() => {});
    input.value = '';
  });
  for (const b of document.querySelectorAll('.chat-tabs .tab')) {
    b.addEventListener('click', () => setTab(b.dataset.tab));
  }
  $('chat-collapse').addEventListener('click', () => $('chat').classList.toggle('collapsed'));
  // Enter focuses chat, Escape leaves it
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.target.closest('input, textarea, select') && !$('hud').hidden) {
      $('chat').classList.remove('collapsed');
      $('chat-input').focus();
      e.preventDefault();
    }
    if (e.key === 'Escape' && e.target.id === 'chat-input') e.target.blur();
  });
}

function setTab(name) {
  tab = name;
  for (const b of document.querySelectorAll('.chat-tabs .tab')) b.classList.toggle('active', b.dataset.tab === name);
  render();
}

function line(m) {
  const cls = ['msg', m.ghost ? 'ghost' : '', m.from === store.state?.you?.id ? 'mine' : '', m.name?.startsWith('Captain ') ? 'captain' : '', m.channel === 'evil' ? 'evil' : '', m.channel === 'intercept' ? 'intercept' : '', m.lastWords ? 'lastwords' : '', m.system ? 'system' : ''].join(' ');
  const tag = { all: '📢', near: '👂', evil: '🦑', ghost: '👻', intercept: '' }[m.channel] || '';
  return el('div', { className: `${cls} ${mentionsMe(m) ? 'mention' : ''}` }, m.system ? null : el('span', { className: 'ch' }, tag), m.system ? null : el('b', {}, `${m.name}${m.ghost ? ' 👻' : ''}: `), ...withMentions(m.text));
}

// @Name in a message: highlighted, and a ping for the person named.
function mentionsMe(m) {
  const me = store.state?.you?.name;
  return !!me && !m.system && m.from !== store.state?.you?.id && String(m.text).toLowerCase().includes(`@${me.toLowerCase()}`);
}

function withMentions(text) {
  const names = (store.state?.players || []).map((p) => p.name).sort((a, b) => b.length - a.length);
  if (!names.length || !String(text).includes('@')) return [text];
  const esc = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`@(${esc.join('|')})`, 'gi');
  const out = [];
  let last = 0;
  for (const hit of String(text).matchAll(re)) {
    out.push(text.slice(last, hit.index), el('span', { className: 'at' }, hit[0]));
    last = hit.index + hit[0].length;
  }
  out.push(text.slice(last));
  return out;
}

function render() {
  const box = $('chat-log');
  const list = logs[tab === 'evil' ? 'evil' : 'near'];
  box.replaceChildren(...list.slice(-80).map(line));
  box.scrollTop = box.scrollHeight;
  const evil = $('evil-log');
  evil.replaceChildren(...logs.evil.slice(-80).map(line));
  evil.scrollTop = evil.scrollHeight;
  const ghost = $('ghost-log');
  ghost.replaceChildren(...logs.ghost.slice(-80).map(line));
  ghost.scrollTop = ghost.scrollHeight;
}

export function addChat(m) {
  if (m.channel === 'evil') logs.evil.push(m);
  else if (m.channel === 'ghost') logs.ghost.push(m);
  else logs.near.push(m);
  if (logs.near.length > 200) logs.near.shift();
  if (m.from !== store.state?.you?.id) {
    if (mentionsMe(m)) {
      sfx('ping');
      buzz(80);
    } else sfx('chat');
    if (!m.lastWords && m.channel !== 'intercept') speak(m.text, { kind: 'chat', who: m.name });
  }
  render();
}

export function systemLine(text) {
  logs.near.push({ system: true, text });
  render();
}

export function clearChat() {
  logs.near = [];
  logs.evil = [];
  logs.ghost = [];
  render();
}

// Show the evil tab only to infiltrators who know each other, and only at night.
export function updateChatVisibility(state) {
  const you = state.you;
  const evil = !!you?.evilTeam && state.evilChatOpen;
  const tabBtn = document.querySelector('.chat-tabs .tab.evil');
  tabBtn.hidden = !evil;
  if (!evil && tab === 'evil') setTab('near');
  const placeholder = {
    lobby: 'Chat with the crew…',
    night: 'Shh… everyone is asleep',
    roam: 'Only people in your room hear you…',
    meeting: 'Everyone on the bridge hears you…',
    nominations: 'Everyone on the bridge hears you…',
    dawn: 'Everyone on the bridge hears you…',
    dusk: 'Everyone on the bridge hears you…',
    lastwords: 'Everyone is listening…',
    ended: 'GG! Chat with everyone…',
  }[state.phase];
  $('chat-input').placeholder = you?.isCaptain ? 'Captain: speak to everyone…' : placeholder || 'Say something…';
  $('night-evil').hidden = !(evil && state.phase === 'night');
}

// Text chat. By day you only hear people in the same room or nearby
// (proximity chat). During meetings everyone hears everyone. At night only
// the infiltrators can talk, on their secret channel.
import { $, el } from '../util.js';
import { send, store } from '../store.js';
import { sfx } from '../audio.js';

let tab = 'near';
const logs = { near: [], evil: [] };

export function initChat() {
  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
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
  const cls = ['msg', m.ghost ? 'ghost' : '', m.from === store.state?.you?.id ? 'mine' : '', m.name?.startsWith('Captain ') ? 'captain' : '', m.channel === 'evil' ? 'evil' : '', m.system ? 'system' : ''].join(' ');
  const tag = { all: '📢', near: '👂', evil: '🦑' }[m.channel] || '';
  return el('div', { className: cls }, m.system ? null : el('span', { className: 'ch' }, tag), m.system ? null : el('b', {}, `${m.name}${m.ghost ? ' 👻' : ''}: `), m.text);
}

function render() {
  const box = $('chat-log');
  const list = logs[tab === 'evil' ? 'evil' : 'near'];
  box.replaceChildren(...list.slice(-80).map(line));
  box.scrollTop = box.scrollHeight;
  const evil = $('evil-log');
  evil.replaceChildren(...logs.evil.slice(-80).map(line));
  evil.scrollTop = evil.scrollHeight;
}

export function addChat(m) {
  if (m.channel === 'evil') logs.evil.push(m);
  else logs.near.push(m);
  if (logs.near.length > 200) logs.near.shift();
  if (m.from !== store.state?.you?.id) sfx('chat');
  render();
}

export function systemLine(text) {
  logs.near.push({ system: true, text });
  render();
}

export function clearChat() {
  logs.near = [];
  logs.evil = [];
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
    ended: 'GG! Chat with everyone…',
  }[state.phase];
  $('chat-input').placeholder = you?.isCaptain ? 'Captain: speak to everyone…' : placeholder || 'Say something…';
  $('night-evil').hidden = !(evil && state.phase === 'night');
}

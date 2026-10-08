// Small helpers shared by the UI modules.

export const $ = (id) => document.getElementById(id);

// el('button', { className: 'x', onclick }, 'text', childNode)
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node, ...children) {
  node.replaceChildren(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

export function formatTime(ms) {
  if (ms == null) return '--:--';
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function problem(message) {
  const box = $('problem');
  box.textContent = message;
  box.classList.add('show');
  clearTimeout(problem.timer);
  problem.timer = setTimeout(() => box.classList.remove('show'), 3500);
}

export function toast(text, kind = 'info', ms = 4500) {
  const box = $('toasts');
  if (!box) return;
  const t = el('div', { className: `toast ${kind}` }, text);
  box.append(t);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => t.remove(), ms);
}

export function hexToInt(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function isTouch() {
  return matchMedia('(pointer: coarse)').matches;
}

// Type text into an element letter by letter (for the spooky story bubble).
export function typeText(node, text, speed = 22) {
  clearInterval(node._typing);
  node.textContent = '';
  let i = 0;
  node._typing = setInterval(() => {
    i += 1;
    node.textContent = text.slice(0, i);
    if (i >= text.length) clearInterval(node._typing);
  }, speed);
}

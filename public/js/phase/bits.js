// Phase to Space: small pieces the screens share.

// The DOM turns a null child into the word "null". The screens build their lists with optional pieces (a badge that
// only some players have), so null and false are simply skipped here, for the whole page.
for (const name of ['replaceChildren', 'append', 'prepend']) {
  const original = Element.prototype[name];
  Element.prototype[name] = function (...nodes) {
    return original.apply(this, nodes.filter((n) => n != null && n !== false));
  };
}
import { el } from '../util.js';
import { iconEl } from '../icons.js';
import { store, classInfo } from './net.js';

// each discipline's picture (from the icon atlas)
export const CLASS_ICON = { marine: 'helmet', warden: 'shield', scout: 'telescope', smuggler: 'sunglasses', psion: 'crystal', broadcaster: 'dish' };

export const classIcon = (cls, o = {}) => iconEl(CLASS_ICON[cls] || 'star', { title: classInfo(cls)?.name, ...o });

// the six disciplines as little badges: lit when you have them, dim when you do not
export function classPips(have = [], { size = null } = {}) {
  const set = new Set(have);
  return el(
    'div',
    { className: 'pips', title: `${set.size} of 6 disciplines` },
    store.data.classIds.map((c) => el('span', { className: `pip cls-${c} ${set.has(c) ? 'on' : ''}`, title: classInfo(c).name }, classIcon(c, { size }))),
  );
}

// 3 glowing orbs for Energy
export function energyOrbs(now, max) {
  const wrap = el('span', { className: 'orbs', title: `${now} Energy left` });
  for (let i = 0; i < Math.max(max, now); i++) wrap.append(el('i', { className: `orb ${i < now ? 'full' : ''}` }));
  return wrap;
}

// a button with an icon in front
export function btn(label, { icon = null, onClick = null, className = '', title = '', disabled = false } = {}) {
  const b = el('button', { className, title, disabled }, icon ? iconEl(icon) : null, label ? el('span', {}, label) : null);
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

// player's name tag: avatar + name
export function nameTag(p) {
  return el('span', { className: 'ntag' }, el('span', { className: 'av' }, p.avatar), el('span', { className: 'nm' }, p.name));
}

// keep a list of keyed child nodes in sync: new ones are made, old ones leave, the rest stay (so animations and hover survive)
export function syncList(container, items, keyOf, make, sig = null) {
  const have = new Map();
  for (const child of [...container.children]) if (child.dataset.k != null && !child.classList.contains('leave')) have.set(child.dataset.k, child);
  let anchor = null;
  for (const item of items) {
    const k = String(keyOf(item));
    let node = have.get(k);
    const s = sig ? sig(item) : null;
    if (node && s != null && node.dataset.sig !== s) {
      // changed (gear equipped, shield...): replace in place, no entrance animation
      const fresh = make(item);
      fresh.dataset.k = k;
      fresh.dataset.sig = s;
      node.replaceWith(fresh);
      node = fresh;
    } else if (node) {
      have.delete(k);
    } else {
      node = make(item);
      node.dataset.k = k;
      if (s != null) node.dataset.sig = s;
      node.classList.add('enter');
      setTimeout(() => node.classList.remove('enter'), 700);
    }
    have.delete(k);
    const want = anchor ? anchor.nextSibling : container.firstChild;
    if (node !== want) container.insertBefore(node, want);
    anchor = node;
  }
  for (const node of have.values()) leave(node);
}

function leave(node) {
  node.classList.add('leave');
  setTimeout(() => node.remove(), 450);
}

export const seconds = (ms) => Math.max(0, Math.ceil(ms / 1000));

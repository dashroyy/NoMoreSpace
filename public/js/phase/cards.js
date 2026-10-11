// Phase to Space: drawing the cards.
import { el } from '../util.js';
import { iconEl } from '../icons.js';
import { store, def, classInfo } from './net.js';
import { classIcon } from './bits.js';

const KEYWORDS = /\b(DESTROY|DISCARD|DRAW|STEAL|SACRIFICE|SHIELD|SEARCH|LOOK|PULL|SWAP|ATTACK|CURSED|ONCE PER TURN|Signal Jam|Energy|Boost|Protocol)\b/g;

// card text with its verbs picked out
export function rich(text) {
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(KEYWORDS)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(el('b', { className: `kw kw-${m[0].toLowerCase().replace(/\s+/g, '-')}` }, m[0]));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export const KIND_LABEL = { crew: 'Crew', gear: 'Gear', protocol: 'Protocol', boost: 'Boost', challenge: 'Signal Jam', captain: 'Captain', beast: 'Void Beast' };

// what a Void Beast needs, as little chips
export function reqChips(d) {
  return d.reqs.map((r) =>
    r.cls
      ? el('span', { className: `chip cls-${r.cls}`, title: `A ${classInfo(r.cls).name} (your Captain counts)` }, classIcon(r.cls))
      : el('span', { className: 'chip any', title: `${r.any} Crew card${r.any > 1 ? 's' : ''} of any kind` }, iconEl('person'), el('b', {}, `×${r.any}`)),
  );
}

export function reqText(d) {
  return d.reqs.map((r) => (r.cls ? `a ${classInfo(r.cls).name}` : `${r.any} Crew card${r.any > 1 ? 's' : ''}`)).join(' + ');
}

// the picture on a card (a rendered portrait); if the file is missing the card's emoji stands in
function portrait(d) {
  const img = el('img', { className: 'portrait', src: `/assets/phase/art/${d.id}.webp`, alt: '', draggable: false, loading: 'lazy' });
  img.addEventListener('error', () => img.replaceWith(el('span', { className: 'portrait fallback' }, d.art || '?')), { once: true });
  return img;
}

// A card. size: xs | sm | md | lg | xl. opts: { uid, gear, shield, used, extra, back }
export function cardEl(id, { size = 'md', uid = null, gear = null, shield = false, used = false, extra = '', back = false } = {}) {
  if (back) {
    return el('div', { className: `card back sz-${size} ${extra}`, dataset: { back: '1' } }, el('div', { className: 'back-art' }, el('i', { className: 'back-ring' }), el('span', {}, 'PHASE')));
  }
  const d = def(id);
  if (!d) return el('div', { className: `card sz-${size}` }, id);
  const cls = d.cls ? `cls-${d.cls}` : '';
  const root = el('div', {
    className: `card k-${d.kind} ${cls} ${d.cursed ? 'cursed' : ''} sz-${size} ${used ? 'used' : ''} ${shield ? 'shielded' : ''} ${extra}`.replace(/\s+/g, ' ').trim(),
    dataset: { id, ...(uid ? { uid } : {}) },
  });
  const face = el('div', { className: 'face' });
  const ci = d.cls ? classInfo(d.cls) : null;

  switch (d.kind) {
    case 'crew':
      face.append(
        el('div', { className: 'top' }, el('span', { className: 'req', title: `Roll ${d.req} or more to use it` }, d.req, el('small', {}, '+')), el('span', { className: 'cls-ico', title: ci.name }, classIcon(d.cls))),
        el('div', { className: 'art' }, el('span', { className: 'dome' }, portrait(d))),
        el('div', { className: 'name' }, d.name),
        el('div', { className: 'sub' }, `${ci.name} · Crew`),
        el('div', { className: 'text' }, el('span', { className: 't' }, rich(d.text))),
      );
      break;
    case 'captain':
      face.append(
        el('div', { className: 'top' }, el('span', { className: 'crown' }, iconEl('crown')), el('span', { className: 'cls-ico', title: ci.name }, classIcon(d.cls))),
        el('div', { className: 'art' }, el('span', { className: 'dome gold' }, portrait(d))),
        el('div', { className: 'name' }, d.name),
        el('div', { className: 'sub' }, `${d.title} · ${ci.name}`),
        el('div', { className: 'text' }, el('span', { className: 't' }, rich(d.text))),
      );
      break;
    case 'gear':
      face.append(
        el('div', { className: 'top' }, el('span', { className: 'tag' }, d.cursed ? 'CURSED' : 'GEAR')),
        el('div', { className: 'art' }, el('span', { className: 'obj' }, portrait(d))),
        el('div', { className: 'name' }, d.name),
        el('div', { className: 'sub' }, d.cursed ? 'Cursed Gear: equip to a rival' : 'Equip to your Crew'),
        el('div', { className: 'text' }, el('span', { className: 't' }, rich(d.text))),
      );
      break;
    case 'protocol':
      face.append(
        el('div', { className: 'top' }, el('span', { className: 'tag' }, 'PROTOCOL')),
        el('div', { className: 'art' }, el('span', { className: 'obj' }, portrait(d))),
        el('div', { className: 'name' }, d.name),
        el('div', { className: 'sub' }, 'One-shot · 1 Energy'),
        el('div', { className: 'text' }, el('span', { className: 't' }, rich(d.text))),
      );
      break;
    case 'boost':
      face.append(
        el('div', { className: 'top' }, el('span', { className: 'tag' }, 'BOOST')),
        el('div', { className: 'art boost-art' }, el('span', { className: 'obj faint' }, portrait(d)), el('div', { className: 'boost-num' }, el('b', { className: 'up' }, `+${d.up}`), el('i', {}, 'or'), el('b', { className: 'down' }, String(d.down).replace('-', '−')))),
        el('div', { className: 'name' }, d.name),
        el('div', { className: 'sub' }, 'Free · any roll'),
        el('div', { className: 'text' }, el('span', { className: 't' }, 'Play on ANY roll the moment it lands. Pick one number.')),
      );
      break;
    case 'challenge':
      face.append(
        el('div', { className: 'top' }, el('span', { className: 'tag' }, 'REACTION')),
        el('div', { className: 'art' }, el('span', { className: 'obj' }, portrait(d))),
        el('div', { className: 'name' }, d.name),
        el('div', { className: 'sub' }, 'Free · when a card is played'),
        el('div', { className: 'text' }, el('span', { className: 't' }, rich(d.text))),
      );
      break;
    case 'beast':
      face.append(
        el('div', { className: 'top' }, el('span', { className: 'tag' }, 'VOID BEAST')),
        el('div', { className: 'art' }, el('span', { className: 'dome beast' }, portrait(d))),
        el('div', { className: 'name' }, d.name),
        el('div', { className: 'reqs' }, el('span', { className: 'need' }, 'NEEDS'), reqChips(d)),
        el('div', { className: 'odds' }, el('span', { className: 'slay', title: 'Roll this or more to slay it' }, iconEl('sword'), `${d.slay}+`), el('span', { className: 'fail', title: `Roll ${d.fail} or less and it fights back` }, iconEl('burst'), `≤${d.fail}`)),
        el('div', { className: 'text' }, el('span', { className: 't' }, d.text)),
      );
      break;
    default:
      break;
  }
  root.append(face);
  if (d.kind === 'crew') {
    if (gear) {
      const g = def(gear.id);
      root.append(el('div', { className: `gear-badge ${g.cursed ? 'cursed' : ''}`, title: `${g.name}: ${g.text}`, dataset: { id: gear.id } }, portrait(g)));
    }
    if (shield) root.append(el('div', { className: 'shield-badge', title: 'Shielded: cannot be destroyed or stolen' }, iconEl('shield')));
  }
  return root;
}

// ---------------------------------------------------------------------------
// A big preview when you point at (or press and hold) any card
// ---------------------------------------------------------------------------
let previewBox = null;
let holdTimer = null;

export function initPreview() {
  previewBox = el('div', { id: 'card-preview', className: 'card-preview', hidden: true });
  document.body.append(previewBox);
  const find = (target) => {
    const c = target.closest?.('.card[data-id]');
    if (!c || c.closest('#card-preview') || c.classList.contains('sz-xl')) return null;
    return c;
  };
  const show = (c) => {
    const id = c.dataset.id;
    const badge = c.querySelector(':scope > .gear-badge');
    previewBox.replaceChildren(cardEl(id, { size: 'xl' }));
    if (badge) {
      const g = def(badge.dataset.id);
      previewBox.append(el('div', { className: 'preview-gear' }, el('b', {}, g.name), ` ${g.text}`));
    }
    previewBox.hidden = false;
    const r = c.getBoundingClientRect();
    const w = previewBox.offsetWidth;
    const h = previewBox.offsetHeight;
    let x = r.right + 12;
    if (x + w > innerWidth - 8) x = r.left - w - 12;
    if (x < 8) x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const y = Math.max(8, Math.min(innerHeight - h - 8, r.top + r.height / 2 - h / 2));
    previewBox.style.left = `${x}px`;
    previewBox.style.top = `${y}px`;
  };
  const hide = () => {
    clearTimeout(holdTimer);
    previewBox.hidden = true;
  };
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const c = find(e.target);
    if (c) show(c);
  });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'touch') return;
    if (find(e.target)) hide();
  });
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return hide();
    const c = find(e.target);
    clearTimeout(holdTimer);
    if (c) holdTimer = setTimeout(() => show(c), 380);
    else hide();
  });
  document.addEventListener('pointerup', () => clearTimeout(holdTimer));
  document.addEventListener('scroll', hide, true);
}

export function hidePreview() {
  if (previewBox) previewBox.hidden = true;
}

export const allDefs = () => store.defs;

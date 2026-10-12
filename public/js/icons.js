// Custom icons instead of emoji, for every game on the arcade.
//
// All the pictures live in one sprite atlas (public/assets/icons/atlas.webp, made by tools/art from the
// Kenney and KayKit packs). The games' text and data still write emoji in places; this module quietly swaps
// each of them for its icon, in the page and in canvas text (name tags, signs, share cards):
//
//   import { initIcons, iconEl, drawTextWithIcons, stripEmoji } from './icons.js';
//   initIcons();                       // once per page: swaps what is there and watches for new text
//   iconEl('skull')                    // an icon element, for code that builds the page by hand
//
// An emoji with no icon is left alone (players can still type their own in chat).
//
// THE CUSTOM ICONS ARE SWITCHED OFF: the games show ordinary emoji. Everything here is still in place, so open any page
// with ?icons=on to see the icons (it is remembered in that browser) and ?icons=off to go back. With the icons off,
// initIcons() does nothing, canvas text is plain text, and iconEl() gives the icon's emoji.
import { ATLAS, EMOJI_ICON, ICON_EMOJI } from './icon-map.js';

const ATLAS_URL = '/assets/icons/atlas.webp';
const FLAG = 'arcade-icons';

function readFlag() {
  try {
    const asked = new URLSearchParams(location.search).get('icons');
    if (asked === 'on' || asked === 'off') localStorage.setItem(FLAG, asked);
    return localStorage.getItem(FLAG) === 'on';
  } catch {
    return false;
  }
}
const ENABLED = readFlag();
export const iconsEnabled = () => ENABLED;

// One emoji, with its optional skin tone / "emoji style" marker, and joined sequences (astronaut = person + rocket)
const UNIT = '\\p{Extended_Pictographic}(?:\\uFE0F|[\\u{1F3FB}-\\u{1F3FF}])?';
const SEQUENCE = `${UNIT}(?:\\u200D${UNIT})*`;
// the mapped emoji are stored without their invisible "emoji style" marker, so allow it back in after each character
// (the map is already sorted longest first, so a joined sequence wins over its parts)
const escapeRe = (ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const loose = Object.keys(EMOJI_ICON).map((k) => [...k].map((ch) => (ch === '\u200D' ? '\\u200D' : `${escapeRe(ch)}\\uFE0F?`)).join(''));
const MATCH = new RegExp(`${loose.join('|')}|${SEQUENCE}`, 'gu');
const norm = (e) => e.replace(/\uFE0F/g, '');

export function iconName(emoji) {
  return EMOJI_ICON[norm(emoji)] || null;
}

// An icon as an element. size: any CSS length (default: the size of the text around it)
export function iconEl(name, { size = null, title = null, className = '' } = {}) {
  const i = ATLAS.icons[name];
  const span = document.createElement('span');
  const label = title || name.replace(/([A-Z])/g, ' $1').toLowerCase();
  // icons switched off: the same thing as an emoji (an icon with no emoji of its own still draws)
  if (!ENABLED && ICON_EMOJI[name]) {
    span.className = `ico ico-emoji ${className}`.trim();
    span.textContent = ICON_EMOJI[name];
    if (size) span.style.setProperty('--is', size);
    span.setAttribute('role', 'img');
    span.setAttribute('aria-label', label);
    return span;
  }
  span.className = `ico ${className}`.trim();
  if (i == null) return span;
  span.style.setProperty('--ix', String(i % ATLAS.cols));
  span.style.setProperty('--iy', String(Math.floor(i / ATLAS.cols)));
  span.dataset.icon = name;
  if (size) span.style.setProperty('--is', size);
  span.setAttribute('role', 'img');
  span.setAttribute('aria-label', title || name.replace(/([A-Z])/g, ' $1').toLowerCase());
  return span;
}

// text -> a list of strings and icon elements
function convert(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(MATCH)) {
    const name = iconName(m[0]);
    if (!name) continue; // not one of ours: leave it as typed
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(iconEl(name));
    last = m.index + m[0].length;
  }
  if (!parts.length) return null;
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION', 'OPTGROUP', 'NOSCRIPT', 'TITLE', 'CANVAS']);
const ATTRS = ['title', 'placeholder', 'alt', 'aria-label'];

// the plain-text version, for places that cannot hold a picture (tooltips, the page title, alert boxes)
export function stripEmoji(text) {
  return String(text).replace(MATCH, (m) => (iconName(m) ? '' : m)).replace(/\s{2,}/g, ' ').trim();
}

function walk(root) {
  if (root.nodeType === Node.TEXT_NODE) return text(root);
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) {
    if (SKIP.has(root.tagName) || root.closest?.('.no-icons')) return;
    attrs(root);
  }
  const tree = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE ? (SKIP.has(n.tagName) || n.classList.contains('no-icons') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP) : NodeFilter.FILTER_ACCEPT),
  });
  const texts = [];
  for (let n = tree.nextNode(); n; n = tree.nextNode()) texts.push(n);
  for (const t of texts) text(t);
  if (root.querySelectorAll) for (const e of root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))) if (!SKIP.has(e.tagName)) attrs(e);
}

function text(node) {
  const value = node.nodeValue;
  if (!value || !/[^\x00-\u2000]/.test(value)) return; // fast path: plain text
  const parent = node.parentElement;
  if (!parent || SKIP.has(parent.tagName) || parent.closest('.no-icons')) return;
  const parts = convert(value);
  if (!parts) return;
  node.replaceWith(...parts.map((p) => (typeof p === 'string' ? document.createTextNode(p) : p)));
}

function attrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute?.(a);
    if (v && /[^\x00-\u2000]/.test(v)) {
      const s = stripEmoji(v);
      if (s !== v) el.setAttribute(a, s);
    }
  }
}

// <option> and <title> can only hold plain text
function plainOptions(root) {
  if (!root.querySelectorAll) return;
  for (const o of root.querySelectorAll('option, optgroup[label]')) {
    if (o.tagName === 'OPTGROUP') {
      const l = o.getAttribute('label');
      if (l && /[^\x00-\u2000]/.test(l)) o.setAttribute('label', stripEmoji(l));
    } else if (/[^\x00-\u2000]/.test(o.textContent)) o.textContent = stripEmoji(o.textContent);
  }
}

let started = false;
export function initIcons(root = document.body) {
  if (!ENABLED || started) return;
  started = true;
  const css = document.documentElement.style;
  css.setProperty('--icon-cols', String(ATLAS.cols));
  css.setProperty('--icon-rows', String(ATLAS.rows));
  plainOptions(root);
  walk(root);
  const pending = new Set();
  let queued = false;
  const flush = () => {
    queued = false;
    const nodes = [...pending];
    pending.clear();
    for (const n of nodes) if (n.isConnected) { plainOptions(n); walk(n); }
  };
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') for (const n of r.addedNodes) pending.add(n);
      else if (r.type === 'characterData') pending.add(r.target);
      else if (r.type === 'attributes') pending.add(r.target);
    }
    if (!queued) {
      queued = true;
      queueMicrotask(flush);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

// ---------------------------------------------------------------------------
// Canvas text (name tags, room signs, share cards): the same swap, drawn with the atlas image
// ---------------------------------------------------------------------------
let atlasImage = null;
let atlasLoading = null;
export function loadAtlas() {
  if (!ENABLED) return Promise.resolve(null); // icons off: nothing to download
  if (atlasImage) return Promise.resolve(atlasImage);
  atlasLoading ||= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve((atlasImage = img));
    img.onerror = () => resolve(null);
    img.src = ATLAS_URL;
  });
  return atlasLoading;
}
loadAtlas();

// Draws one icon (by name) into a canvas
export function drawIcon(ctx, name, x, y, size) {
  const i = ATLAS.icons[name];
  if (i == null || !atlasImage) return false;
  const s = ATLAS.size;
  ctx.drawImage(atlasImage, (i % ATLAS.cols) * s, Math.floor(i / ATLAS.cols) * s, s, s, x, y, size, size);
  return true;
}

// Splits text into runs of text and icons
function runs(text) {
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(MATCH)) {
    const name = iconName(m[0]);
    if (!name) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ icon: name });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

const fontPx = (ctx) => Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] || 16);

// How wide the text is with icons (each one as wide as the text is tall)
export function measureTextIcons(ctx, text) {
  if (!ENABLED) return ctx.measureText(text).width;
  const size = fontPx(ctx);
  let w = 0;
  for (const r of runs(text)) w += r.icon ? size * 1.1 : ctx.measureText(r.text).width;
  return w;
}

function drawRuns(ctx, text, x, y, mode) {
  const parts = ENABLED ? runs(text) : [];
  if (!parts.some((p) => p.icon)) {
    if (mode === 'stroke') ctx.strokeText(text, x, y);
    else ctx.fillText(text, x, y);
    return;
  }
  const size = fontPx(ctx);
  const total = measureTextIcons(ctx, text);
  const align = ctx.textAlign;
  let cx = align === 'center' ? x - total / 2 : align === 'right' || align === 'end' ? x - total : x;
  const base = ctx.textBaseline;
  const top = base === 'top' || base === 'hanging' ? y : base === 'middle' ? y - size * 0.5 : base === 'bottom' || base === 'ideographic' ? y - size : y - size * 0.82;
  ctx.textAlign = 'left';
  for (const r of parts) {
    if (r.icon) {
      if (mode === 'fill') drawIcon(ctx, r.icon, cx, top - size * 0.05, size * 1.05);
      cx += size * 1.1;
    } else {
      if (mode === 'stroke') ctx.strokeText(r.text, cx, y);
      else ctx.fillText(r.text, cx, y);
      cx += ctx.measureText(r.text).width;
    }
  }
  ctx.textAlign = align;
}

// ctx.fillText / ctx.strokeText that swap emoji for icons (the icons are drawn on the fill pass only)
export function fillTextIcons(ctx, text, x, y) {
  drawRuns(ctx, String(text), x, y, 'fill');
}
export function strokeTextIcons(ctx, text, x, y) {
  drawRuns(ctx, String(text), x, y, 'stroke');
}

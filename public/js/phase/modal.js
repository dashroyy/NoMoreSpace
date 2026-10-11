// Phase to Space: a simple modal window.
import { el } from '../util.js';
import { iconEl } from '../icons.js';
import { sfx } from './sound.js';

let current = null;

export function openModal(content, { title = null, wide = false, onClose = null, closable = true } = {}) {
  closeModal();
  const layer = document.getElementById('layer-modal');
  const close = () => closeModal();
  const box = el(
    'div',
    { className: `modal panel ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true' },
    title || closable ? el('div', { className: 'modal-head' }, title ? el('h2', {}, title) : el('span'), closable ? el('button', { className: 'small ghost', title: 'Close (Esc)', onclick: close }, iconEl('cross')) : null) : null,
    el('div', { className: 'modal-body' }, content),
  );
  layer.replaceChildren(box);
  layer.hidden = false;
  const onKey = (e) => e.key === 'Escape' && closable && close();
  const onBack = (e) => e.target === layer && closable && close();
  document.addEventListener('keydown', onKey);
  layer.addEventListener('pointerdown', onBack);
  current = { layer, onKey, onBack, onClose };
  sfx('click');
  return { close, box };
}

export function closeModal() {
  if (!current) return;
  const { layer, onKey, onBack, onClose } = current;
  current = null;
  document.removeEventListener('keydown', onKey);
  layer.removeEventListener('pointerdown', onBack);
  layer.hidden = true;
  layer.replaceChildren();
  onClose?.();
}

export const modalOpen = () => !!current;

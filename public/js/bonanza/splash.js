// Star Bonanza: the start screen. The logo and a loading bar while the galaxy and the stars load,
// a tip or two, then "Press any key" (which is also the click browsers need before they play sound). Seen once
// per visit: coming back from a game, or reloading, goes straight to the menu.
import { $ } from '../util.js';

const SEEN = 'sbz-started';
const TIPS = [
  'You must plant the first star in your hand, in the order you were dealt them. You may plant the next one too.',
  'Rare stars pay more per star: a Pulsar earns a lumen from just two.',
  'Trading is how you beat the luck of the deal. Offer the stars you cannot use.',
  'Every star you win in a trade has to be planted, so only take what fits.',
  'A nursery holds one kind of star. Planting a different kind means harvesting first.',
  'A single star is safe from harvest while another nursery has more.',
  'Harvest any time you like, even on someone else\'s turn.',
  'Spend three lumens to open a third nursery.',
  'Robots fill empty seats, so you can always play.',
];

const seenBefore = () => {
  try {
    return sessionStorage.getItem(SEEN) === '1';
  } catch {
    return false;
  }
};

// has this visit already pressed start? (then the title screen is skipped)
export const returning = seenBefore;

export function createSplash() {
  const box = $('splash');
  const fill = $('splash-fill');
  const status = $('splash-status');
  const press = $('splash-press');
  const tip = $('splash-tip');
  let done = false;
  let tipIndex = Math.floor(Math.random() * TIPS.length);
  const showTip = () => {
    tip.textContent = `Tip: ${TIPS[tipIndex++ % TIPS.length]}`;
    tip.classList.remove('in');
    void tip.offsetWidth;
    tip.classList.add('in');
  };
  showTip();
  const tipTimer = setInterval(showTip, 4500);

  const finish = () => {
    if (done) return;
    done = true;
    clearInterval(tipTimer);
    try {
      sessionStorage.setItem(SEEN, '1');
    } catch {}
    box.classList.add('out');
    setTimeout(() => box.remove(), 900);
  };

  return {
    // 0..1, and what is happening
    progress(p, text) {
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
      if (text) status.textContent = text;
    },
    // everything is in: wait for a key, a click or a tap (or skip that if this visit already pressed it)
    ready() {
      return new Promise((resolve) => {
        if (done) return resolve(false);
        box.classList.add('loaded');
        if (seenBefore()) {
          finish();
          return resolve(false);
        }
        status.textContent = '';
        press.hidden = false;
        press.textContent = matchMedia('(hover: none)').matches ? 'Tap to start' : 'Press any key';
        const go = (e) => {
          if (e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
          removeEventListener('keydown', go, true);
          box.removeEventListener('pointerdown', go);
          e.preventDefault();
          finish();
          resolve(true);
        };
        addEventListener('keydown', go, true);
        box.addEventListener('pointerdown', go);
        this.cancel = () => {
          removeEventListener('keydown', go, true);
          box.removeEventListener('pointerdown', go);
          finish();
          resolve(false);
        };
      });
    },
    // a game picked up where it left off (a saved seat): no start screen
    dismiss() {
      if (this.cancel) this.cancel();
      else finish();
    },
    get open() {
      return !done;
    },
  };
}

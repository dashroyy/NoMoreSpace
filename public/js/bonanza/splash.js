// Star Bonanza: the start screen. The bouncing logo and a loading bar while the farm and the stars load,
// a tip or two, then "Press any key" (which is also the click browsers need before they play sound). Seen once
// per visit: coming back from a game, or reloading, goes straight to the menu.
import { $ } from '../util.js';

const SEEN = 'sbz-started';
const TIPS = [
  'The first star in your hand MUST be planted. No sorting your hand, no matter how much you want to.',
  'Rare stars pay faster: two Pulsars already make a coin.',
  'Trading is how you beat bad luck. Offer the stars you cannot use!',
  'Whatever you win in a trade has to be planted straight away, so only take what fits.',
  'A patch grows one kind of star. A different kind means harvesting first.',
  'A patch with one lonely star cannot be harvested while another patch has more.',
  'Harvest whenever you like, even on somebody else’s turn.',
  'Three coins buys a third patch. More room for more buddies!',
  'Neutron Stars skip no leg day.',
  'Never wake a Red Dwarf before noon.',
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
        press.textContent = matchMedia('(hover: none)').matches ? 'Tap to play!' : 'Press any key!';
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

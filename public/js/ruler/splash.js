// Ruler of the Galaxy: the start screen. The logo and a loading bar while the galaxy and the contenders load,
// a tip or two, then "Press any key" (which is also the click browsers need before they play sound). Seen once
// per visit: coming back from a game, or reloading, goes straight to the menu.
import { $ } from '../util.js';

const SEEN = 'rotg-started';
const TIPS = [
  'Inside the Core you score every turn, but you cannot repair.',
  'Three Repairs in one roll evolve your contender.',
  'Hit while you hold the Core? Yield, and whoever hit you takes your seat.',
  'Dark Matter buys cards in the Xenotech Bazaar.',
  'Robots fill any empty seats, so you can always play.',
  'Keep the dice you like, and roll the rest up to twice more.',
  'Every third round a cosmic anomaly bends the rules.',
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

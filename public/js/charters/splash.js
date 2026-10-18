// Star Charters: the start screen. The spinning logo and a loading bar while the 3D map loads,
// a tip or two, then "Press any key" (which is also the click browsers need before they play sound). Seen once
// per visit: coming back from a game, or reloading, goes straight to the menu.
import { $ } from '../util.js';

const SEEN = 'sch-started';
const TIPS = [
  'Every edge has to match: lane to lane, station to station, void to void.',
  'Only one probe per feature. Want in? Build your own next to it and join them up later.',
  'The dreadnought counts as two probes. Perfect for taking over a big station.',
  'A sealed station pays 2 points a tile. Reactor cores add 2 more each.',
  'Wormholes come in twins. Once both are out, whatever runs into one is joined to the other.',
  'A tile next to a black hole can slingshot a probe onto any open feature round the hole.',
  'Land a tile on an anomaly to grab it: fuel, treasure or a whole extra turn.',
  'Probe stuck on a lane that will never finish? Burn a thruster fuel to call it home.',
  'A probe lying in the void stays there all game, and scores 3 for every finished station it touches.',
  'Point at anything on the map to see what it is worth.',
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

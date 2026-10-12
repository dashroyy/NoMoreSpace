// Phase to Space: the dice on the table. Every roll the server makes shows up here: two tumbling dice per
// side, the modifiers people pile on, the total, and whether it worked.
import { el } from '../util.js';
import { player } from './net.js';
import { sfx } from './sound.js';

// the angles that turn a given face towards you (see the .f1..f6 faces in phase.css)
const FACE = { 1: [0, 0], 6: [0, 180], 2: [0, -90], 5: [0, 90], 3: [-90, 0], 4: [90, 0] };
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };

function dieEl() {
  const cube = el('div', { className: 'cube' });
  for (let f = 1; f <= 6; f++) {
    const face = el('div', { className: `face-d f${f}` });
    for (const p of PIPS[f]) face.append(el('i', { style: { gridArea: `${Math.ceil(p / 3)} / ${((p - 1) % 3) + 1}` } }));
    cube.append(face);
  }
  return el('div', { className: 'die' }, el('div', { className: 'die-shadow' }), cube);
}

// make a die land on `value` after a good tumble
function tumble(die, value, delay = 0) {
  const cube = die.querySelector('.cube');
  const [ax, ay] = FACE[value];
  cube.style.transition = 'none';
  cube.style.transform = `rotateX(${Math.floor(Math.random() * 360)}deg) rotateY(${Math.floor(Math.random() * 360)}deg) rotateZ(${Math.floor(Math.random() * 360)}deg)`;
  die.classList.remove('landed');
  die.classList.add('tossing');
  void cube.offsetWidth;
  setTimeout(() => {
    cube.style.transition = 'transform 1.05s cubic-bezier(.15,.75,.25,1)';
    cube.style.transform = `rotateX(${ax + 360 * (2 + Math.floor(Math.random() * 2))}deg) rotateY(${ay + 360 * (2 + Math.floor(Math.random() * 2))}deg)`;
  }, 30 + delay);
  setTimeout(() => {
    die.classList.remove('tossing');
    die.classList.add('landed');
  }, 1100 + delay);
}

const fmt = (v) => (v > 0 ? `+${v}` : String(v).replace('-', '−'));

// The number line under the dice: 2 to 12, coloured by what each total means (green: it works; red: it fails, or the
// Void Beast fights back), with a marker per side that slides along as Boosts change the total.
const LO = 2;
const HI = 12;
function trackEl(roll) {
  const check = roll.need != null;
  const cells = [];
  for (let v = LO; v <= HI; v++) {
    let cls = '';
    if (check) cls = v >= roll.need ? 'win' : roll.fail != null ? (v <= roll.fail ? 'bite' : '') : 'fail';
    cells.push(el('span', { className: `cell ${cls}` }, String(v)));
  }
  const legend = check
    ? el('div', { className: 'legend' }, el('span', { className: 'l-bite' }, roll.fail != null ? `≤${roll.fail} it bites` : 'fails'), el('span', { className: 'l-win' }, `${roll.need}+ ${roll.fail != null ? 'slain' : 'works'}`))
    : null;
  const marks = roll.sides.map((s, i) => el('span', { className: `mark hidden ${i ? 'b' : ''}`, dataset: { pid: s.pid } }, '?'));
  return el('div', { className: 'roll-track' }, legend, cells, marks);
}

function moveMarks(track, roll) {
  if (!track) return;
  const marks = track.querySelectorAll('.mark');
  roll.sides.forEach((s, i) => {
    const m = marks[i];
    if (!m) return;
    const clamped = Math.max(LO, Math.min(HI, s.total));
    m.classList.remove('hidden');
    m.textContent = String(s.total);
    m.style.left = `${((clamped - LO + 0.5) / (HI - LO + 1)) * 100}%`;
  });
}

export class RollStage {
  constructor(root) {
    this.root = root;
    this.id = null;
    this.shown = 0; // how many modifiers we have already shown
    this.revealAt = 0;
    this.timer = null;
  }

  update(roll) {
    if (!roll) return this.hide();
    if (roll.id !== this.id) this.begin(roll);
    this.refresh(roll);
  }

  hide() {
    if (!this.id) return;
    this.id = null;
    clearTimeout(this.timer);
    this.root.classList.remove('show');
    setTimeout(() => {
      if (!this.id) this.root.replaceChildren();
    }, 350);
  }

  begin(roll) {
    this.id = roll.id;
    this.shown = new Map();
    this.revealAt = performance.now() + 1250;
    const sides = roll.sides.map((s) => {
      const p = player(s.pid);
      const dice = [dieEl(), dieEl()];
      return {
        pid: s.pid,
        dice,
        node: el(
          'div',
          { className: 'roll-side', dataset: { pid: s.pid } },
          el('div', { className: 'who' }, `${p?.avatar || '🧑‍🚀'} ${p?.name || '?'}`),
          el('div', { className: 'dice-row' }, dice),
          el('div', { className: 'mods' }),
          el('div', { className: 'total' }, '…'),
        ),
      };
    });
    this.sides = sides;
    const nodes = [];
    sides.forEach((s, i) => {
      if (i) nodes.push(el('div', { className: 'vs' }, 'VS'));
      nodes.push(s.node);
    });
    this.title = el('div', { className: 'roll-title' }, roll.title);
    this.foot = el('div', { className: 'roll-foot' });
    this.track = trackEl(roll);
    this.root.replaceChildren(el('div', { className: `roll-panel ${roll.kind}` }, this.title, el('div', { className: 'roll-sides' }, nodes), this.track, this.foot));
    requestAnimationFrame(() => this.root.classList.add('show'));
    sfx('dice');
    roll.sides.forEach((s, i) => s.dice.forEach((v, j) => tumble(sides[i].dice[j], v, j * 90 + i * 60)));
    this.revealed = false;
    this.verdictDone = false;
  }

  refresh(roll) {
    const wait = this.revealAt - performance.now();
    if (wait > 0) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.refresh(roll), wait + 20);
      return;
    }
    if (!this.revealed) {
      this.revealed = true;
      this.foot.replaceChildren(roll.need != null ? el('span', { className: 'need' }, `Need ${roll.need}+`) : null, el('span', { className: 'hint' }, roll.open ? '🎴 Boosts can be played now…' : ''));
    }
    roll.sides.forEach((s, i) => {
      const side = this.sides[i];
      if (!side) return;
      const mods = side.node.querySelector('.mods');
      // a new modifier pops in
      while (mods.children.length < s.mods.length) {
        const m = s.mods[mods.children.length];
        const chip = el('span', { className: `mod ${m.v > 0 ? 'pos' : 'neg'} ${m.auto ? 'auto' : 'played pop'}` }, `${fmt(m.v)} ${m.label}`);
        mods.append(chip);
        if (!m.auto) sfx(m.v > 0 ? 'boostUp' : 'boostDown');
      }
      const totalEl = side.node.querySelector('.total');
      const old = totalEl.textContent;
      totalEl.textContent = s.total;
      if (old !== String(s.total)) {
        totalEl.classList.remove('bump');
        void totalEl.offsetWidth;
        totalEl.classList.add('bump');
      }
    });
    moveMarks(this.track, roll);
    if (!roll.open && !this.verdictDone) {
      this.verdictDone = true;
      this.foot.replaceChildren(this.verdict(roll));
    }
  }

  verdict(roll) {
    if (roll.need != null) {
      const ok = roll.sides[0].total >= roll.need;
      sfx(ok ? 'success' : 'fail');
      this.root.firstChild?.classList.add(ok ? 'good' : 'bad');
      return el('span', { className: `verdict ${ok ? 'good' : 'bad'}` }, ok ? `✔ ${roll.sides[0].total} beats ${roll.need}!` : `✖ ${roll.sides[0].total} misses ${roll.need}`);
    }
    const [a, b] = roll.sides;
    const win = roll.tie === 'second' ? (b.total >= a.total ? b : a) : a.total === b.total ? null : a.total > b.total ? a : b;
    sfx(win ? 'success' : 'tick');
    for (const s of this.sides) s.node.classList.toggle('winner', win?.pid === s.pid);
    if (!win) return el('span', { className: 'verdict' }, 'A tie!');
    return el('span', { className: 'verdict good' }, `🏆 ${player(win.pid)?.name} wins ${roll.tie === 'second' ? '(ties go to the Jammer)' : ''}`);
  }
}

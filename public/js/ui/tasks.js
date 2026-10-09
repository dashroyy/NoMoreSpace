// Eleven little minigames, one per room. Finish one to charge the
// Observation Array (and give your hands something to do while you talk).
import { el, clear } from '../util.js';
import { sfx } from '../audio.js';
import { openModal, closeModal } from './rolecard.js';

export function openTask(taskId, name, onDone) {
  const area = el('div', { className: 'task-area' });
  const status = el('div', { className: 'hint' });
  openModal(el('div', {}, el('h2', {}, `🛠️ ${name}`), status, area));
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    sfx('task');
    clear(area, el('div', { className: 'task-done' }, '✅ Task complete!'), el('div', { className: 'hint' }, 'The Observation Array hums a little louder.'));
    onDone();
    setTimeout(() => {
      if (area.isConnected) closeModal();
    }, 1400);
  };
  const fail = (msg) => {
    sfx('buzz');
    status.textContent = msg;
  };
  const game = GAMES[taskId] || GAMES.vents;
  const cleanup = game(area, status, done, fail);
  closeModal.onClose = () => cleanup?.();
}

function canvasGame(area, w, h) {
  const c = el('canvas', { width: w, height: h });
  area.append(c);
  return [c, c.getContext('2d')];
}

function loop(fn) {
  let id;
  let last = performance.now();
  const step = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (fn(dt, now / 1000) !== false) id = requestAnimationFrame(step);
  };
  id = requestAnimationFrame(step);
  return () => cancelAnimationFrame(id);
}

const GAMES = {
  // Engine: stop the needle in the green zone 3 times. (Friendly: a wide zone,
  // a slow needle, and a miss only costs you one step, not all of them.)
  thrusters(area, status, done, fail) {
    const [c, g] = canvasGame(area, 420, 140);
    const HALF = 0.13; // the green zone is a quarter of the gauge wide
    let x = 0;
    let dir = 1;
    let hits = 0;
    let zone = 0.6;
    let flash = 0; // >0 flashes the gauge green, <0 red, fading to 0
    const btn = el('button', { className: 'primary big', onclick: press }, 'FIRE ⏎');
    area.append(btn);
    status.textContent = 'Press FIRE (or Enter / Space) when the needle is in the green zone. 3 times.';
    function press() {
      if (Math.abs(x - zone) < HALF) {
        hits++;
        flash = 1;
        sfx('blip');
        // the next zone is somewhere else, so it is never already under the needle
        do zone = 0.2 + Math.random() * 0.6;
        while (Math.abs(zone - x) < 0.25);
        if (hits >= 3) done();
        else status.textContent = hits === 2 ? 'One more!' : 'Nice! Two more.';
      } else {
        hits = Math.max(0, hits - 1);
        flash = -1;
        fail(hits ? 'Just missed! Wait for the green and try again.' : 'Missed! Wait for the green and try again.');
      }
    }
    const key = (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), press());
    window.addEventListener('keydown', key);
    const stop = loop((dt) => {
      x += dir * dt * (0.4 + hits * 0.08);
      if (x > 1 || x < 0) dir *= -1;
      x = Math.max(0, Math.min(1, x));
      flash -= Math.sign(flash) * dt * 2.5;
      if (Math.abs(flash) < 0.05) flash = 0;
      g.fillStyle = flash > 0 ? `rgb(8, ${16 + 50 * flash | 0}, 32)` : flash < 0 ? `rgb(${16 + 60 * -flash | 0}, 16, 32)` : '#081020';
      g.fillRect(0, 0, 420, 140);
      g.fillStyle = 'rgba(80,255,140,0.45)';
      g.fillRect(20 + (zone - HALF) * 380, 30, HALF * 2 * 380, 80);
      g.strokeStyle = '#6cf0ff';
      g.strokeRect(20, 30, 380, 80);
      g.fillStyle = Math.abs(x - zone) < HALF ? '#ffffff' : '#ff7a3a'; // the needle lights up when it is in the zone
      g.fillRect(20 + x * 380 - 3, 20, 6, 100);
      g.fillStyle = '#cfd6ff';
      g.font = '20px VT323, monospace';
      g.fillText(`Calibrated: ${hits}/3`, 20, 135);
    });
    return () => {
      stop();
      window.removeEventListener('keydown', key);
    };
  },

  // Reactor: repeat the colour sequence.
  core(area, status, done, fail) {
    const colors = ['#ff3b5c', '#ffd23f', '#6cf0ff', '#7dffa8'];
    const seq = Array.from({ length: 4 }, () => Math.floor(Math.random() * 4));
    let step = 0;
    let showing = true;
    const grid = el('div', { className: 'task-grid', style: { gridTemplateColumns: 'repeat(2, 90px)' } });
    const buttons = colors.map((col, i) => el('button', { className: 'task-btn', style: { background: col, opacity: 0.45 }, onclick: () => press(i) }, ''));
    grid.append(...buttons);
    area.append(grid);
    const flash = (i) => {
      buttons[i].style.opacity = 1;
      sfx('blip');
      setTimeout(() => (buttons[i].style.opacity = 0.45), 350);
    };
    const play = () => {
      showing = true;
      status.textContent = 'Watch the core pulse…';
      seq.forEach((v, k) => setTimeout(() => flash(v), 600 + k * 650));
      setTimeout(() => {
        showing = false;
        status.textContent = 'Now repeat the sequence!';
      }, 600 + seq.length * 650);
    };
    function press(i) {
      if (showing) return;
      flash(i);
      if (seq[step] === i) {
        step++;
        if (step === seq.length) done();
      } else {
        step = 0;
        fail('Core destabilising! Watch again.');
        setTimeout(play, 700);
      }
    }
    play();
  },

  // Medbay: match pairs of alien samples.
  samples(area, status, done) {
    const icons = ['🦠', '🧫', '🧬', '👁️'];
    const cards = [...icons, ...icons].sort(() => Math.random() - 0.5);
    const open = [];
    let matched = 0;
    status.textContent = 'Match the pairs of samples.';
    const grid = el('div', { className: 'task-grid', style: { gridTemplateColumns: 'repeat(4, 70px)' } });
    const btns = cards.map((icon, i) => el('button', { className: 'task-btn', onclick: () => flip(i) }, '❔'));
    grid.append(...btns);
    area.append(grid);
    function flip(i) {
      if (open.length === 2 || btns[i].dataset.done || open.includes(i)) return;
      btns[i].textContent = cards[i];
      open.push(i);
      sfx('click');
      if (open.length === 2) {
        const [a, b] = open;
        if (cards[a] === cards[b]) {
          btns[a].dataset.done = btns[b].dataset.done = '1';
          btns[a].classList.add('lit');
          btns[b].classList.add('lit');
          open.length = 0;
          matched++;
          sfx('blip');
          if (matched === icons.length) done();
        } else {
          setTimeout(() => {
            btns[a].textContent = btns[b].textContent = '❔';
            open.length = 0;
          }, 700);
        }
      }
    }
  },

  // Hydroponics: water the wilting plants.
  plants(area, status, done) {
    let watered = 0;
    status.textContent = 'Water the 6 wilting moon plants before the black hole dries them out.';
    const grid = el('div', { className: 'task-grid', style: { gridTemplateColumns: 'repeat(3, 80px)' } });
    const btns = Array.from({ length: 6 }, (_, i) => el('button', { className: 'task-btn', onclick: () => water(i) }, '🥀'));
    grid.append(...btns);
    area.append(grid);
    function water(i) {
      if (btns[i].dataset.ok) return;
      btns[i].dataset.ok = '1';
      btns[i].textContent = '🌸';
      sfx('pop');
      watered++;
      if (watered === 6) done();
    }
  },

  // Comms: tune the slider until the waves match.
  signal(area, status, done) {
    const [c, g] = canvasGame(area, 420, 160);
    const target = 0.2 + Math.random() * 0.6;
    const slider = el('input', { type: 'range', min: 0, max: 1, step: 0.001, value: Math.random() < 0.5 ? 0 : 1, style: { width: '400px', maxWidth: '100%' } });
    area.append(slider);
    let held = 0;
    status.textContent = 'Slide until the green wave matches the target, and hold it.';
    return loop((dt, t) => {
      const v = Number(slider.value);
      g.fillStyle = '#050a14';
      g.fillRect(0, 0, 420, 160);
      const wave = (freq, color, offset) => {
        g.strokeStyle = color;
        g.lineWidth = 3;
        g.beginPath();
        for (let x = 0; x <= 420; x += 4) {
          const y = 80 + Math.sin(x * (0.02 + freq * 0.06) + t * 3) * 45 + offset;
          x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.stroke();
      };
      wave(target, 'rgba(255,255,255,0.35)', 0);
      wave(v, '#7dffa8', 0);
      if (Math.abs(v - target) < 0.02) {
        held += dt;
        g.fillStyle = '#7dffa8';
        g.fillText('LOCKING…', 10, 20);
        if (held > 1.2) {
          done();
          return false;
        }
      } else held = 0;
    });
  },

  // Navigation: click the stars in order.
  course(area, status, done, fail) {
    const [c, g] = canvasGame(area, 420, 260);
    const stars = Array.from({ length: 6 }, () => ({ x: 30 + Math.random() * 360, y: 30 + Math.random() * 200 }));
    let next = 0;
    status.textContent = 'Plot the escape course: click the stars from 1 to 6.';
    const draw = () => {
      g.fillStyle = '#050816';
      g.fillRect(0, 0, 420, 260);
      g.strokeStyle = '#58ffd0';
      g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i < next; i++) (i === 0 ? g.moveTo : g.lineTo).call(g, stars[i].x, stars[i].y);
      g.stroke();
      stars.forEach((s, i) => {
        g.fillStyle = i < next ? '#58ffd0' : '#fff';
        g.beginPath();
        g.arc(s.x, s.y, 9, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#000';
        g.font = '15px VT323, monospace';
        g.textAlign = 'center';
        g.fillText(i + 1, s.x, s.y + 4);
      });
    };
    draw();
    c.addEventListener('pointerdown', (e) => {
      const r = c.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 420;
      const y = ((e.clientY - r.top) / r.height) * 260;
      const hit = stars.findIndex((s) => Math.hypot(s.x - x, s.y - y) < 16);
      if (hit === next) {
        next++;
        sfx('blip');
        draw();
        if (next === stars.length) done();
      } else if (hit >= 0) {
        next = 0;
        draw();
        fail('Wrong star! The course resets.');
      }
    });
  },

  // Galley: add the ingredients in recipe order.
  noodles(area, status, done, fail) {
    const all = ['🍜', '🥚', '🌶️', '🧄', '🍄', '🦐'];
    const recipe = [...all].sort(() => Math.random() - 0.5).slice(0, 4);
    let step = 0;
    const show = () => (status.textContent = `Recipe: ${recipe.map((r, i) => (i < step ? '✅' : r)).join('  →  ')}`);
    show();
    const grid = el('div', { className: 'task-grid', style: { gridTemplateColumns: 'repeat(3, 80px)' } });
    grid.append(...all.map((ing) => el('button', { className: 'task-btn', onclick: () => add(ing) }, ing)));
    area.append(grid);
    function add(ing) {
      if (ing === recipe[step]) {
        step++;
        sfx('pop');
        show();
        if (step === recipe.length) done();
      } else {
        step = 0;
        fail('Yuck! That\'s not next. Start the pot again.');
        setTimeout(show, 1200);
      }
    }
  },

  // Cargo: catch the hamsters as they pop out of crates.
  hamsters(area, status, done) {
    let caught = 0;
    status.textContent = 'Catch 6 escaped space hamsters!';
    const grid = el('div', { className: 'task-grid', style: { gridTemplateColumns: 'repeat(3, 80px)' } });
    const btns = Array.from({ length: 9 }, (_, i) => el('button', { className: 'task-btn', onclick: () => grab(i) }, '📦'));
    grid.append(...btns);
    area.append(grid);
    let active = -1;
    const timer = setInterval(() => {
      if (active >= 0) btns[active].textContent = '📦';
      active = Math.floor(Math.random() * 9);
      btns[active].textContent = '🐹';
    }, 800);
    function grab(i) {
      if (i !== active) return;
      btns[i].textContent = '✅';
      active = -1;
      caught++;
      sfx('pop');
      status.textContent = `Caught ${caught}/6`;
      if (caught >= 6) {
        clearInterval(timer);
        done();
      }
    }
    return () => clearInterval(timer);
  },

  // Observation: move the reticle onto the star.
  telescope(area, status, done) {
    const [c, g] = canvasGame(area, 360, 240);
    const target = { x: 40 + Math.random() * 280, y: 40 + Math.random() * 160 };
    const ret = { x: 180, y: 120 };
    let held = 0;
    status.textContent = 'Drag (or use the arrows) to centre the telescope on the blinking star, and hold.';
    const pad = el('div', { className: 'row' }, ...[['⬅️', -1, 0], ['⬆️', 0, -1], ['⬇️', 0, 1], ['➡️', 1, 0]].map(([l, dx, dy]) => el('button', { onclick: () => { ret.x += dx * 12; ret.y += dy * 12; } }, l)));
    area.append(pad);
    let dragging = false;
    c.addEventListener('pointerdown', () => (dragging = true));
    window.addEventListener('pointerup', () => (dragging = false));
    c.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const r = c.getBoundingClientRect();
      ret.x = ((e.clientX - r.left) / r.width) * 360;
      ret.y = ((e.clientY - r.top) / r.height) * 240;
    });
    return loop((dt, t) => {
      g.fillStyle = '#02030a';
      g.fillRect(0, 0, 360, 240);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillRect((i * 97) % 360, (i * 61) % 240, 1.5, 1.5);
      }
      g.fillStyle = Math.sin(t * 6) > 0 ? '#ffd27a' : '#806020';
      g.beginPath();
      g.arc(target.x, target.y, 5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#6cf0ff';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(ret.x, ret.y, 22, 0, Math.PI * 2);
      g.moveTo(ret.x - 30, ret.y);
      g.lineTo(ret.x + 30, ret.y);
      g.moveTo(ret.x, ret.y - 30);
      g.lineTo(ret.x, ret.y + 30);
      g.stroke();
      if (Math.hypot(ret.x - target.x, ret.y - target.y) < 10) {
        held += dt;
        if (held > 1) {
          done();
          return false;
        }
      } else held = 0;
    });
  },

  // Airlock: mash the purge button.
  vents(area, status, done) {
    let pressure = 0;
    status.textContent = 'Mash PURGE to blow the gunk out of the vents (before the pressure leaks away)!';
    const bar = el('div', { style: { width: '320px', height: '22px', borderRadius: '11px', background: '#111a2a', overflow: 'hidden', border: '1px solid #345' } });
    const fill = el('div', { style: { height: '100%', width: '0%', background: 'linear-gradient(90deg,#ffb547,#ff3b5c)' } });
    bar.append(fill);
    const btn = el('button', { className: 'danger big', onclick: () => { pressure += 0.08; sfx('click'); } }, '💨 PURGE');
    area.append(bar, btn);
    return loop((dt) => {
      pressure = Math.max(0, pressure - dt * 0.18);
      fill.style.width = `${Math.min(100, pressure * 100)}%`;
      if (pressure >= 1) {
        done();
        return false;
      }
    });
  },

  // Quarters: feed the ship cat.
  cat(area, status, done) {
    let fed = 0;
    status.textContent = 'The ship cat is HUNGRY. Throw it 5 space fish (it dodges sometimes).';
    const catBtn = el('button', { className: 'task-btn', style: { fontSize: '3rem', width: '120px', height: '120px', position: 'relative' }, onclick: feed }, '😾');
    area.append(catBtn);
    function feed() {
      if (Math.random() < 0.25) {
        catBtn.style.transform = `translateX(${(Math.random() - 0.5) * 120}px)`;
        sfx('buzz');
        status.textContent = 'The cat dodged! Rude.';
        return;
      }
      fed++;
      sfx('pop');
      catBtn.textContent = fed >= 5 ? '😻' : ['😾', '🙀', '😼', '😺', '😸'][fed];
      status.textContent = `🐟 ${fed}/5`;
      if (fed >= 5) done();
    }
  },
};

import { initIcons } from './icons.js';

initIcons();

// The game picker: a drifting starfield, live player counts, a way back into a game you were in,
// and "join with a code" that works out which game the code is for.

// ---------------------------------------------------------------------------
// Stars
// ---------------------------------------------------------------------------
const canvas = document.getElementById('stars');
const ctx = canvas.getContext('2d');
let W = 0;
let H = 0;
let stars = [];
let comets = [];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = canvas.width = Math.floor(innerWidth * dpr);
  H = canvas.height = Math.floor(innerHeight * dpr);
  const n = Math.floor((innerWidth * innerHeight) / 5200);
  stars = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, z: 0.2 + Math.random() * 0.8, t: Math.random() * 6.28, tint: Math.random() }));
}
resize();
addEventListener('resize', resize);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  ctx.clearRect(0, 0, W, H);
  for (const s of stars) {
    s.t += dt * (0.6 + s.z);
    s.y += dt * 6 * s.z * (H / 800);
    if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
    const a = 0.35 + 0.65 * Math.abs(Math.sin(s.t));
    ctx.globalAlpha = a * s.z;
    ctx.fillStyle = s.tint > 0.85 ? '#ffb3d1' : s.tint > 0.7 ? '#9fe8ff' : '#ffffff';
    const r = s.z * 1.7 * (W / 1400 + 0.6);
    ctx.fillRect(s.x, s.y, r, r);
  }
  // now and then a comet streaks by
  if (!reduce && Math.random() < dt * 0.25) comets.push({ x: Math.random() * W, y: -10, vx: (Math.random() - 0.3) * 260, vy: 380 + Math.random() * 240, life: 1 });
  comets = comets.filter((c) => c.life > 0);
  for (const c of comets) {
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.life -= dt * 0.55;
    const g = ctx.createLinearGradient(c.x, c.y, c.x - c.vx * 0.18, c.y - c.vy * 0.18);
    g.addColorStop(0, `rgba(180,240,255,${Math.max(0, c.life)})`);
    g.addColorStop(1, 'rgba(180,240,255,0)');
    ctx.globalAlpha = 1;
    ctx.strokeStyle = g;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x - c.vx * 0.18, c.y - c.vy * 0.18);
    ctx.stroke();
  }
  if (!reduce) requestAnimationFrame(frame);
}
if (reduce) frame(performance.now());
else requestAnimationFrame(frame);

// ---------------------------------------------------------------------------
// The slideshow: one game at a time, sliding on by itself every few seconds (it waits while you are pointing
// at it or have just used it). Swipe, drag, the arrow keys, the arrows and the dots move it; it goes round and
// round. Clicking the game on show plays it; clicking one beside it brings it in.
// ---------------------------------------------------------------------------
const track = document.getElementById('games');
const slides = [...track.querySelectorAll('a.game')];
const dotsBox = document.getElementById('dots');
const HOLD = 6500; // ms on each game
const SHOT_HOLD = 3200; // ms on each picture, when a game has more than one
const n = slides.length;
let current = 0;
let paused = false;
let idleUntil = 0;
let timer = null;
dotsBox.style.setProperty('--hold', `${HOLD}ms`);

const dots = slides.map((s, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('role', 'tab');
  b.setAttribute('aria-label', s.querySelector('h2')?.textContent || `Game ${i + 1}`);
  b.append(document.createElement('i'));
  b.addEventListener('click', () => (touched(), show(i)));
  dotsBox.append(b);
  return b;
});

// where slide k sits from the one on show (-2 .. 2: it goes round)
function offOf(k) {
  let off = k - current;
  if (off > n / 2) off -= n;
  if (off < -n / 2) off += n;
  return off;
}

function show(i) {
  current = ((i % n) + n) % n;
  slides.forEach((s, k) => {
    const off = offOf(k);
    s.style.setProperty('--off', off);
    s.classList.toggle('active', off === 0);
    s.classList.toggle('far', Math.abs(off) > 1);
    s.tabIndex = off === 0 ? 0 : -1;
    s.setAttribute('aria-hidden', String(off !== 0));
  });
  dots.forEach((d, k) => {
    d.classList.toggle('on', k === current);
    d.setAttribute('aria-selected', String(k === current));
  });
  // restart the fill on the active dot
  dotsBox.classList.remove('playing');
  void dotsBox.offsetWidth;
  if (!reduce && !paused) dotsBox.classList.add('playing');
  const accent = getComputedStyle(slides[current]).getPropertyValue('--accent').trim();
  document.body.style.setProperty('--accent-now', accent || '#6cf0ff');
  schedule();
}

function schedule() {
  clearTimeout(timer);
  if (reduce) return;
  timer = setTimeout(() => {
    if (paused || Date.now() < idleUntil) return schedule();
    show(current + 1);
  }, Math.max(HOLD, idleUntil - Date.now()));
}
// someone is using it: wait a while before sliding on again
function touched() {
  idleUntil = Date.now() + 12000;
  dotsBox.classList.remove('playing');
}

track.addEventListener('pointerenter', (e) => {
  if (e.pointerType !== 'mouse') return;
  paused = true;
  dotsBox.classList.remove('playing');
});
track.addEventListener('pointerleave', () => {
  paused = false;
  schedule();
});
document.querySelector('.nav.prev').addEventListener('click', () => (touched(), show(current - 1)));
document.querySelector('.nav.next').addEventListener('click', () => (touched(), show(current + 1)));
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  if (e.key === 'ArrowRight') show(current + 1);
  else if (e.key === 'ArrowLeft') show(current - 1);
  else return;
  touched();
  e.preventDefault();
});

// swipe (or drag with the mouse): the slides follow the finger, and let go past a little way to change
let drag = null;
let justDragged = false;
track.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  drag = { x: e.clientX, y: e.clientY, dx: 0, moved: false, id: e.pointerId };
});
addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  drag.dx = e.clientX - drag.x;
  if (!drag.moved && Math.abs(drag.dx) > 8 && Math.abs(drag.dx) > Math.abs(e.clientY - drag.y)) {
    drag.moved = true;
    track.classList.add('dragging');
    touched();
  }
  if (drag.moved) {
    const w = slides[current].offsetWidth + 40;
    slides.forEach((s, k) => s.style.setProperty('--off', offOf(k) + drag.dx / w));
  }
});
const endDrag = () => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (!d.moved) return;
  track.classList.remove('dragging');
  justDragged = true;
  setTimeout(() => (justDragged = false), 80);
  show(current + (d.dx < -50 ? 1 : d.dx > 50 ? -1 : 0));
};
addEventListener('pointerup', endDrag);
addEventListener('pointercancel', endDrag);
slides.forEach((s, i) => {
  s.addEventListener('click', (e) => {
    if (justDragged || !s.classList.contains('active')) {
      e.preventDefault();
      if (!justDragged) {
        touched();
        show(i);
      }
    }
  });
});

// a game with more than one picture flicks through them while it is on show
setInterval(() => {
  if (reduce) return;
  const imgs = [...slides[current].querySelectorAll('.shots img')];
  if (imgs.length < 2) return;
  const on = imgs.findIndex((im) => im.classList.contains('on'));
  imgs[on].classList.remove('on');
  imgs[(on + 1) % imgs.length].classList.add('on');
}, SHOT_HOLD);

show(0);

// ---------------------------------------------------------------------------
// Live counts
// ---------------------------------------------------------------------------
async function counts() {
  try {
    const stats = await fetch('/hub-stats', { cache: 'no-store' }).then((r) => r.json());
    // key: which count in the stats; one / many: what to call them
    const set = (game, n, key, one, many) => {
      const node = document.querySelector(`[data-live="${game}"]`);
      if (!node || !n) return;
      node.classList.toggle('on', n.people > 0);
      node.textContent = n.people > 0 ? `${n.people} playing now` : n[key] > 0 ? `${n[key]} ${n[key] === 1 ? one : many} open` : 'be the first aboard';
    };
    set('nms', stats.nms, 'ships', 'ship', 'ships');
    set('phase', stats.phase, 'tables', 'table', 'tables');
    set('ruler', stats.ruler, 'tables', 'galaxy', 'galaxies');
    set('bonanza', stats.bonanza, 'tables', 'table', 'tables');
    set('charters', stats.charters, 'tables', 'table', 'tables');
  } catch {}
}
counts();
setInterval(counts, 15000);

// ---------------------------------------------------------------------------
// Back into a game you left
// ---------------------------------------------------------------------------
async function resume() {
  const box = document.getElementById('resume');
  const seats = [
    { key: 'nms-seat', game: 'nms', href: (c) => `/nms`, label: () => `🚀 ↩ No More Space` },
    { key: 'pts-seat', game: 'phase', href: (c) => `/phase`, label: () => `🃏 ↩ Phase to Space` },
    { key: 'rotg-seat', game: 'ruler', href: (c) => `/ruler`, label: () => `🌌 ↩ Ruler of the Galaxy` },
    { key: 'sbz-seat', game: 'bonanza', href: (c) => `/bonanza`, label: () => `🌟 ↩ Star Bonanza` },
    { key: 'sch-seat', game: 'charters', href: (c) => `/charters`, label: () => `🧩 ↩ Star Charters` },
  ];
  for (const s of seats) {
    let seat = null;
    try {
      seat = JSON.parse(localStorage.getItem(s.key) || 'null');
    } catch {}
    if (!seat?.code) continue;
    try {
      const r = await fetch(`/api/code?code=${encodeURIComponent(seat.code)}`, { cache: 'no-store' }).then((x) => x.json());
      if (r.game !== s.game) continue;
    } catch {
      continue;
    }
    const a = document.createElement('a');
    a.href = s.href(seat.code);
    a.textContent = s.label(seat.code);
    box.append(a);
    box.hidden = false;
  }
}
resume();

// ---------------------------------------------------------------------------
// Join with a code
// ---------------------------------------------------------------------------
const input = document.getElementById('hub-code');
const msg = document.getElementById('hub-msg');
async function join() {
  const code = input.value.toUpperCase().trim();
  msg.className = 'msg';
  if (code.length !== 4) {
    msg.textContent = '4 letters';
    return;
  }
  msg.textContent = 'Looking…';
  try {
    const r = await fetch(`/api/code?code=${encodeURIComponent(code)}`, { cache: 'no-store' }).then((x) => x.json());
    if (!r.game) {
      msg.textContent = 'No game with that code';
      return;
    }
    msg.className = 'msg ok';
    const where = { phase: ['/phase', 'Phase to Space'], ruler: ['/ruler', 'Ruler of the Galaxy'], bonanza: ['/bonanza', 'Star Bonanza'], charters: ['/charters', 'Star Charters'], nms: ['/nms', 'No More Space'] }[r.game] || ['/nms', 'No More Space'];
    msg.textContent = `Boarding ${where[1]}…`;
    location.href = `${where[0]}?join=${code}`;
  } catch {
    msg.textContent = 'Offline? Try again';
  }
}
document.getElementById('join').addEventListener('submit', (e) => {
  e.preventDefault();
  join();
});
const params = new URLSearchParams(location.search);
if (params.get('code')) input.value = params.get('code').toUpperCase().slice(0, 4);

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
// The carousel: swipe, drag, arrow keys, arrows and dots. The slide in the middle is the live one; clicking a
// slide beside it brings it to the middle, clicking the live one goes to the game.
// ---------------------------------------------------------------------------
const track = document.getElementById('games');
const slides = [...track.querySelectorAll('a.game')];
const dotsBox = document.getElementById('dots');
const prev = document.querySelector('.nav.prev');
const next = document.querySelector('.nav.next');
const ACCENTS = { nms: '#ff7a3d', phase: '#ff6bd6', rotg: '#00f0ff', sbz: '#ffd36b', sch: '#f08a3c' };
let current = -1;
let target = 0; // where the last arrow or key press is heading (so quick presses add up)
let lastGo = 0;

const names = slides.map((s) => s.querySelector('h2')?.textContent || 'Game');
const dots = slides.map((s, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('role', 'tab');
  b.setAttribute('aria-label', names[i]);
  b.addEventListener('click', () => go(i));
  dotsBox.append(b);
  return b;
});

function go(i) {
  i = Math.max(0, Math.min(slides.length - 1, i));
  target = i;
  lastGo = Date.now();
  const s = slides[i];
  track.scrollTo({ left: s.offsetLeft - (track.clientWidth - s.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' });
}

function setCurrent(i) {
  if (i === current) return;
  current = i;
  slides.forEach((s, k) => {
    s.classList.toggle('active', k === i);
    s.setAttribute('aria-current', k === i ? 'true' : 'false');
    s.tabIndex = k === i ? 0 : -1;
  });
  dots.forEach((d, k) => {
    d.classList.toggle('on', k === i);
    d.setAttribute('aria-selected', String(k === i));
  });
  prev.disabled = i === 0;
  next.disabled = i === slides.length - 1;
  const key = [...slides[i].classList].find((c) => ACCENTS[c]);
  document.body.style.setProperty('--accent-now', ACCENTS[key] || '#6cf0ff');
}

function nearest() {
  const mid = track.scrollLeft + track.clientWidth / 2;
  let best = 0;
  let bestD = Infinity;
  slides.forEach((s, i) => {
    const d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - mid);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
track.addEventListener('scroll', () => {
  const n = nearest();
  setCurrent(n);
  if (Date.now() - lastGo > 1200) target = n; // (a swipe or drag: follow it)
}, { passive: true });
prev.addEventListener('click', () => go(target - 1));
next.addEventListener('click', () => go(target + 1));
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  if (e.key === 'ArrowRight') go(target + 1);
  else if (e.key === 'ArrowLeft') go(target - 1);
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(slides.length - 1);
  else return;
  e.preventDefault();
});
addEventListener('resize', () => go(target));

// a mouse drags the track like a finger would (touch already scrolls by itself)
let drag = null;
track.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return;
  drag = { x: e.clientX, left: track.scrollLeft, moved: false };
});
addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) > 6) {
    drag.moved = true;
    track.classList.add('dragging');
  }
  if (drag.moved) track.scrollLeft = drag.left - dx;
});
addEventListener('pointerup', () => {
  if (!drag) return;
  const moved = drag.moved;
  drag = null;
  track.classList.remove('dragging');
  if (moved) {
    justDragged = true;
    setTimeout(() => (justDragged = false), 60);
    go(nearest());
  }
});
let justDragged = false;
for (const [i, s] of slides.entries()) {
  s.addEventListener('click', (e) => {
    if (justDragged || i !== current) {
      e.preventDefault();
      if (!justDragged) go(i);
    }
  });
}
setCurrent(0);
track.scrollLeft = 0;

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
    { key: 'nms-seat', game: 'nms', href: (c) => `/nms`, label: (c) => `🚀 Back to your ship ${c} (No More Space)` },
    { key: 'pts-seat', game: 'phase', href: (c) => `/phase`, label: (c) => `🃏 Back to table ${c} (Phase to Space)` },
    { key: 'rotg-seat', game: 'ruler', href: (c) => `/ruler`, label: (c) => `🌌 Back to galaxy ${c} (Ruler of the Galaxy)` },
    { key: 'sbz-seat', game: 'bonanza', href: (c) => `/bonanza`, label: (c) => `🌟 Back to table ${c} (Star Bonanza)` },
    { key: 'sch-seat', game: 'charters', href: (c) => `/charters`, label: (c) => `🧩 Back to table ${c} (Star Charters)` },
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
    msg.textContent = 'Codes are 4 letters.';
    return;
  }
  msg.textContent = 'Looking…';
  try {
    const r = await fetch(`/api/code?code=${encodeURIComponent(code)}`, { cache: 'no-store' }).then((x) => x.json());
    if (!r.game) {
      msg.textContent = 'No game with that code right now. Check the letters?';
      return;
    }
    msg.className = 'msg ok';
    const where = { phase: ['/phase', 'Phase to Space'], ruler: ['/ruler', 'Ruler of the Galaxy'], bonanza: ['/bonanza', 'Star Bonanza'], charters: ['/charters', 'Star Charters'], nms: ['/nms', 'No More Space'] }[r.game] || ['/nms', 'No More Space'];
    msg.textContent = `Boarding ${where[1]}…`;
    location.href = `${where[0]}?join=${code}`;
  } catch {
    msg.textContent = 'Could not reach the server. Try again.';
  }
}
document.getElementById('hub-join').addEventListener('click', join);
input.addEventListener('keydown', (e) => e.key === 'Enter' && join());
const params = new URLSearchParams(location.search);
if (params.get('code')) input.value = params.get('code').toUpperCase().slice(0, 4);

// Star Bonanza: the pictures on the cards. Each kind of star is painted on a canvas (no image files to download),
// with its own character: a spotted red dwarf, a banded brown dwarf, a spiky blue giant, a pulsar throwing beams,
// a quasar firing jets. starArt(id) gives a data URL you can drop into an <img>.
import { star } from './net.js';

const cache = new Map();

function rng(seed) {
  let a = 0;
  for (const ch of seed) a = (a * 31 + ch.charCodeAt(0)) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function glow(g, x, y, r, color, a = 0.5) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, rgba(color, a));
  grad.addColorStop(0.35, rgba(color, a * 0.45));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

// a ball lit from the top left
function ball(g, x, y, r, hot, mid, cool) {
  const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.05, x, y, r);
  grad.addColorStop(0, hot);
  grad.addColorStop(0.55, mid);
  grad.addColorStop(1, cool);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

const clipBall = (g, x, y, r, fn) => {
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.clip();
  fn();
  g.restore();
};

// one drawing per kind of star: (context, size of the canvas, its definition, random)
const DRAW = {
  'red-dwarf'(g, S, d, r) {
    glow(g, S / 2, S / 2, S * 0.34, d.glow, 0.55);
    ball(g, S / 2, S / 2, S * 0.105, '#ffd9b0', d.color, '#a82010');
    clipBall(g, S / 2, S / 2, S * 0.105, () => {
      for (let i = 0; i < 4; i++) {
        g.fillStyle = 'rgba(70,10,0,0.55)';
        g.beginPath();
        g.ellipse(S / 2 + (r() - 0.5) * S * 0.14, S / 2 + (r() - 0.5) * S * 0.12, S * 0.017, S * 0.011, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    });
    g.strokeStyle = rgba(d.color, 0.8);
    g.lineWidth = 3;
    g.beginPath();
    g.arc(S / 2 + S * 0.09, S / 2 - S * 0.07, S * 0.06, 3.6, 5.6);
    g.stroke();
  },
  'brown-dwarf'(g, S, d, r) {
    glow(g, S / 2, S / 2, S * 0.3, '#a0409a', 0.28);
    ball(g, S / 2, S / 2, S * 0.125, '#d9a070', d.color, '#3b1d10');
    clipBall(g, S / 2, S / 2, S * 0.125, () => {
      const bands = ['#6b3b24', '#9a5a35', '#3e2217', '#b07040'];
      for (let i = -5; i < 6; i++) {
        g.fillStyle = rgba(bands[(i + 5) % 4].replace('#', '#'), 0.55);
        g.fillRect(S / 2 - S * 0.13, S / 2 + i * S * 0.022 + (r() - 0.5) * 3, S * 0.26, S * 0.014);
      }
    });
    g.strokeStyle = 'rgba(190,90,200,0.5)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(S / 2, S / 2, S * 0.13, 0, Math.PI * 2);
    g.stroke();
  },
  'orange-dwarf'(g, S, d, r) {
    glow(g, S / 2, S / 2, S * 0.38, d.glow, 0.5);
    ball(g, S / 2, S / 2, S * 0.14, '#fff0c8', d.color, '#c25a00');
    clipBall(g, S / 2, S / 2, S * 0.14, () => {
      for (let i = 0; i < 70; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(255,230,160,0.35)' : 'rgba(160,60,0,0.3)';
        g.beginPath();
        g.arc(S / 2 + (r() - 0.5) * S * 0.28, S / 2 + (r() - 0.5) * S * 0.28, S * (0.006 + r() * 0.01), 0, Math.PI * 2);
        g.fill();
      }
    });
  },
  'yellow-dwarf'(g, S, d, r) {
    glow(g, S / 2, S / 2, S * 0.46, d.glow, 0.6);
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2;
      g.strokeStyle = rgba('#ff9a1a', 0.75);
      g.lineWidth = 4;
      g.beginPath();
      g.arc(S / 2 + Math.cos(a) * S * 0.155, S / 2 + Math.sin(a) * S * 0.155, S * (0.04 + r() * 0.03), a + 2.4, a + 4.1);
      g.stroke();
    }
    ball(g, S / 2, S / 2, S * 0.16, '#ffffff', d.color, '#ffa000');
  },
  'white-dwarf'(g, S, d) {
    glow(g, S / 2, S / 2, S * 0.4, d.glow, 0.6);
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      g.beginPath();
      g.moveTo(S / 2 - dx * S * 0.36, S / 2 - dy * S * 0.36);
      g.lineTo(S / 2 + dy * 2.5, S / 2 + dx * 2.5);
      g.lineTo(S / 2 + dx * S * 0.36, S / 2 + dy * S * 0.36);
      g.lineTo(S / 2 - dy * 2.5, S / 2 - dx * 2.5);
      g.closePath();
      g.fill();
    }
    ball(g, S / 2, S / 2, S * 0.06, '#ffffff', '#eaf4ff', '#9fd0ff');
    g.strokeStyle = 'rgba(190,225,255,0.5)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(S / 2, S / 2, S * 0.12, 0, Math.PI * 2);
    g.stroke();
  },
  'blue-giant'(g, S, d, r) {
    glow(g, S / 2, S / 2, S * 0.55, d.glow, 0.7);
    g.strokeStyle = 'rgba(190,225,255,0.55)';
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + 0.1;
      const len = S * (0.26 + r() * 0.12);
      g.lineWidth = 1.2 + r() * 1.5;
      g.beginPath();
      g.moveTo(S / 2 + Math.cos(a) * S * 0.18, S / 2 + Math.sin(a) * S * 0.18);
      g.lineTo(S / 2 + Math.cos(a) * len, S / 2 + Math.sin(a) * len);
      g.stroke();
    }
    ball(g, S / 2, S / 2, S * 0.19, '#ffffff', '#8ec5ff', '#2a6cff');
  },
  'red-giant'(g, S, d, r) {
    glow(g, S / 2, S / 2, S * 0.5, d.glow, 0.55);
    ball(g, S / 2, S / 2, S * 0.25, '#ffb090', d.color, '#7a0a05');
    clipBall(g, S / 2, S / 2, S * 0.25, () => {
      for (let i = 0; i < 40; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(255,150,100,0.3)' : 'rgba(90,5,0,0.35)';
        g.beginPath();
        g.arc(S / 2 + (r() - 0.5) * S * 0.5, S / 2 + (r() - 0.5) * S * 0.5, S * (0.015 + r() * 0.04), 0, Math.PI * 2);
        g.fill();
      }
    });
    g.strokeStyle = 'rgba(255,90,70,0.3)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(S / 2, S / 2, S * 0.33, 0, Math.PI * 2);
    g.stroke();
  },
  'neutron-star'(g, S, d) {
    // two thin beams of light and a tight knot of magnetic field
    const beam = (dir) => {
      const grad = g.createLinearGradient(S / 2, S / 2, S / 2, S / 2 + dir * S * 0.5);
      grad.addColorStop(0, 'rgba(160,240,255,0.95)');
      grad.addColorStop(1, 'rgba(160,240,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(S / 2 - 4, S / 2);
      g.lineTo(S / 2 + 4, S / 2);
      g.lineTo(S / 2 + 1, S / 2 + dir * S * 0.5);
      g.lineTo(S / 2 - 1, S / 2 + dir * S * 0.5);
      g.closePath();
      g.fill();
    };
    glow(g, S / 2, S / 2, S * 0.3, d.glow, 0.6);
    beam(-1);
    beam(1);
    g.strokeStyle = 'rgba(120,220,255,0.55)';
    g.lineWidth = 2;
    for (const k of [0.1, 0.16, 0.22]) {
      g.beginPath();
      g.ellipse(S / 2 - S * k * 0.45, S / 2, S * k * 0.6, S * k * 1.3, 0, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.ellipse(S / 2 + S * k * 0.45, S / 2, S * k * 0.6, S * k * 1.3, 0, 0, Math.PI * 2);
      g.stroke();
    }
    ball(g, S / 2, S / 2, S * 0.045, '#ffffff', '#c8f6ff', '#3fd0ff');
  },
  pulsar(g, S, d) {
    glow(g, S / 2, S / 2, S * 0.35, d.glow, 0.55);
    // two wide beams sweeping out like a lighthouse
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(-0.5);
    for (const dir of [-1, 1]) {
      const grad = g.createLinearGradient(0, 0, dir * S * 0.55, 0);
      grad.addColorStop(0, 'rgba(230,190,255,0.95)');
      grad.addColorStop(1, 'rgba(180,100,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, -3);
      g.lineTo(dir * S * 0.55, -S * 0.09);
      g.lineTo(dir * S * 0.55, S * 0.09);
      g.lineTo(0, 3);
      g.closePath();
      g.fill();
    }
    g.restore();
    g.strokeStyle = 'rgba(210,160,255,0.55)';
    g.lineWidth = 2;
    for (const k of [0.1, 0.16]) {
      g.beginPath();
      g.ellipse(S / 2, S / 2, S * k, S * k * 0.4, -0.5, 0, Math.PI * 2);
      g.stroke();
    }
    ball(g, S / 2, S / 2, S * 0.05, '#ffffff', '#e4b8ff', '#9a3dff');
  },
  quasar(g, S, d, r) {
    // a blazing core, a tilted disc of gas and two long jets
    for (const dir of [-1, 1]) {
      const grad = g.createLinearGradient(S / 2, S / 2, S / 2, S / 2 + dir * S * 0.5);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.5, 'rgba(160,230,255,0.5)');
      grad.addColorStop(1, 'rgba(120,200,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(S / 2 - 9, S / 2);
      g.lineTo(S / 2 + 9, S / 2);
      g.lineTo(S / 2 + 3, S / 2 + dir * S * 0.5);
      g.lineTo(S / 2 - 3, S / 2 + dir * S * 0.5);
      g.closePath();
      g.fill();
    }
    glow(g, S / 2, S / 2, S * 0.4, d.glow, 0.6);
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(-0.35);
    for (const [rx, a] of [[0.34, 0.25], [0.28, 0.4], [0.22, 0.55], [0.16, 0.75]]) {
      g.strokeStyle = `rgba(190,235,255,${a})`;
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(0, 0, S * rx, S * rx * 0.22, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
    ball(g, S / 2, S / 2, S * 0.075, '#ffffff', '#ffffff', '#b8f0ff');
  },
  magnetar(g, S, d, r) {
    glow(g, S / 2, S / 2, S * 0.38, d.glow, 0.55);
    g.lineWidth = 3;
    for (const k of [1, 2, 3, 4]) {
      g.strokeStyle = rgba('#ff5fb0', 0.7 - k * 0.12);
      for (const side of [-1, 1]) {
        g.beginPath();
        g.ellipse(S / 2 + side * S * k * 0.05, S / 2, S * k * 0.045, S * (0.1 + k * 0.07), 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
    for (let i = 0; i < 16; i++) {
      g.fillStyle = 'rgba(255,200,230,0.8)';
      g.beginPath();
      g.arc(S / 2 + (r() - 0.5) * S * 0.5, S / 2 + (r() - 0.5) * S * 0.6, 1.5 + r() * 2, 0, Math.PI * 2);
      g.fill();
    }
    ball(g, S / 2, S / 2, S * 0.065, '#ffe0f0', '#ff5fb0', '#b00a62');
  },
};

export function starArt(id, size = 256) {
  const key = `${id}@${size}`;
  if (cache.has(key)) return cache.get(key);
  const d = star(id);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = rng(id);
  // deep space, with a few faint stars and a wash of the star's own colour
  const bg = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.75);
  bg.addColorStop(0, '#101a45');
  bg.addColorStop(1, '#03050f');
  g.fillStyle = bg;
  g.fillRect(0, 0, size, size);
  if (d) {
    glow(g, size * 0.2, size * 0.8, size * 0.5, d.glow, 0.1);
    glow(g, size * 0.85, size * 0.15, size * 0.4, '#6a5cff', 0.1);
  }
  for (let i = 0; i < 50; i++) {
    g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.5})`;
    g.fillRect(r() * size, r() * size, 1 + r() * 1.4, 1 + r() * 1.4);
  }
  if (d) (DRAW[id] || DRAW['yellow-dwarf'])(g, size, d, r);
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

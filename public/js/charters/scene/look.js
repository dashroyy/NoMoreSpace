// Star Charters: the look. A 1960s space-age toy set: painted tin and enamel (cream hulls, teal glass, tangerine
// trim), glowing gold warp lanes, chunky tiles of deep blue space laid out on a cream star chart. Soft studio light
// and real shadows, no outlines (Star Bonanza has those). Every material and painted texture lives here, made once.
import * as THREE from 'three';

export const TILE = 2; // a tile is 2 x 2 world units
export const CELL = TILE / 7;
export const TOP = 0.2; // the height of a tile's face
export const PAPER = 0xefe4c8;

export const COLOURS = {
  cream: '#f6efdc',
  hull: '#f3ecd9',
  teal: '#2a9d8f',
  glass: '#56d0c6',
  orange: '#f08a3c',
  gold: '#ffc93c',
  navy: '#1c2547',
  ink: '#1d2340',
  slab: '#e8d6ab',
  violet: '#b45cff',
  cyan: '#22d3ee',
};

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra });

let M = null;
// the shared materials (made on first use, once the renderer exists)
export function mats() {
  if (M) return M;
  M = {
    slab: std(COLOURS.slab, { roughness: 0.75 }),
    hull: std(COLOURS.hull, { roughness: 0.45 }),
    hullDark: std('#ddd2b6', { roughness: 0.5 }),
    teal: std(COLOURS.teal, { roughness: 0.4 }),
    glass: std(COLOURS.glass, { roughness: 0.12, metalness: 0.15, emissive: '#0f5650', emissiveIntensity: 0.6 }),
    orange: std(COLOURS.orange, { roughness: 0.35 }),
    window: std('#ffe08a', { emissive: '#ffbf3a', emissiveIntensity: 1.25, roughness: 0.6 }),
    red: std('#ff5050', { emissive: '#ff2020', emissiveIntensity: 1.4 }),
    white: std('#fbfaf4', { roughness: 0.35, side: THREE.DoubleSide }),
    rock: std('#8a7d6f', { roughness: 0.95, flatShading: true }),
    lane: std('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.35, map: chevrons(), emissiveMap: chevrons() }),
    laneGlow: new THREE.MeshBasicMaterial({ map: glowStrip(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: '#ffb32a', opacity: 0.85 }),
    hub: std(COLOURS.hull, { roughness: 0.4 }),
    hubLight: std('#ffe08a', { emissive: '#ffc93c', emissiveIntensity: 1.6 }),
    reactor: std('#ffb15a', { emissive: '#ff7a1a', emissiveIntensity: 2.2, roughness: 0.3 }),
    hole: new THREE.MeshBasicMaterial({ color: '#030308' }),
    photon: new THREE.MeshBasicMaterial({ color: '#ffe2b0' }),
    disk: new THREE.MeshBasicMaterial({ map: accretion(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    swirlViolet: new THREE.MeshBasicMaterial({ map: swirl('#e2b6ff', '#8c3cff'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    swirlCyan: new THREE.MeshBasicMaterial({ map: swirl('#c8fbff', '#0fb5d6'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    violet: std(COLOURS.violet, { emissive: '#7a22ff', emissiveIntensity: 0.9, roughness: 0.3 }),
    cyan: std(COLOURS.cyan, { emissive: '#0aa6c4', emissiveIntensity: 0.9, roughness: 0.3 }),
  };
  M.tops = [0, 1, 2, 3, 4, 5].map((i) => std('#ffffff', { map: spaceTexture(i), roughness: 0.85 }));
  M.holeTop = std('#ffffff', { map: spaceTexture(9, true), roughness: 0.85 });
  return M;
}

// a canvas, turned into a texture
function canvasTexture(size, draw, { srgb = true, repeat = false } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// a little random generator with a seed (so the same tile always gets the same stars)
export function seeded(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

// deep space for a tile's face: a blue gradient, a faint nebula, stars and a twinkle or two
function spaceTexture(seed, hole = false) {
  return canvasTexture(256, (g, n) => {
    const rnd = seeded(seed + 11);
    const grad = g.createLinearGradient(0, 0, n, n);
    grad.addColorStop(0, '#24305a');
    grad.addColorStop(1, '#141a36');
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
    const hues = ['rgba(64,200,190,', 'rgba(170,110,255,', 'rgba(255,140,120,', 'rgba(90,150,255,'];
    for (let i = 0; i < 2; i++) {
      const x = rnd() * n;
      const y = rnd() * n;
      const r = n * (0.25 + rnd() * 0.3);
      const h = hues[Math.floor(rnd() * hues.length)];
      const ng = g.createRadialGradient(x, y, 0, x, y, r);
      ng.addColorStop(0, `${h}0.22)`);
      ng.addColorStop(1, `${h}0)`);
      g.fillStyle = ng;
      g.fillRect(0, 0, n, n);
    }
    if (hole) {
      // everything swirls in towards the middle
      g.save();
      g.translate(n / 2, n / 2);
      for (let i = 0; i < 160; i++) {
        const a = rnd() * Math.PI * 2;
        const d = 20 + rnd() * n * 0.5;
        g.strokeStyle = `rgba(255,${150 + Math.floor(rnd() * 80)},120,${0.05 + rnd() * 0.12})`;
        g.lineWidth = 1 + rnd() * 2;
        g.beginPath();
        g.arc(0, 0, d, a, a + 0.6 + rnd() * 0.8);
        g.stroke();
      }
      const dark = g.createRadialGradient(0, 0, 0, 0, 0, n * 0.4);
      dark.addColorStop(0, 'rgba(0,0,0,0.85)');
      dark.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = dark;
      g.fillRect(-n, -n, n * 2, n * 2);
      g.restore();
    }
    for (let i = 0; i < 70; i++) {
      const x = rnd() * n;
      const y = rnd() * n;
      const r = rnd() < 0.85 ? 0.6 + rnd() * 0.8 : 1.4 + rnd();
      g.fillStyle = `rgba(255,${235 + Math.floor(rnd() * 20)},${200 + Math.floor(rnd() * 55)},${0.35 + rnd() * 0.6})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    // a four-pointed twinkle
    for (let i = 0; i < 2; i++) {
      const x = 20 + rnd() * (n - 40);
      const y = 20 + rnd() * (n - 40);
      const s = 5 + rnd() * 5;
      g.fillStyle = 'rgba(255,248,220,0.9)';
      g.beginPath();
      g.moveTo(x, y - s);
      g.quadraticCurveTo(x, y, x + s, y);
      g.quadraticCurveTo(x, y, x, y + s);
      g.quadraticCurveTo(x, y, x - s, y);
      g.quadraticCurveTo(x, y, x, y - s);
      g.fill();
    }
  });
}

// the warp lanes' moving stripes (the texture is slid along the lane every frame)
let CHEVRONS = null;
export function chevrons() {
  if (CHEVRONS) return CHEVRONS;
  CHEVRONS = canvasTexture(
    128,
    (g, n) => {
      g.fillStyle = '#ffd34d';
      g.fillRect(0, 0, n, n);
      g.fillStyle = '#ff9a1f';
      for (let k = 0; k < 2; k++) {
        const x0 = k * (n / 2);
        g.beginPath();
        g.moveTo(x0, 0);
        g.lineTo(x0 + n / 6, 0);
        g.lineTo(x0 + n / 3, n / 2);
        g.lineTo(x0 + n / 6, n);
        g.lineTo(x0, n);
        g.lineTo(x0 + n / 6, n / 2);
        g.closePath();
        g.fill();
      }
    },
    { repeat: true },
  );
  return CHEVRONS;
}

// soft light on the ground either side of a lane
function glowStrip() {
  return canvasTexture(
    64,
    (g, n) => {
      const grad = g.createLinearGradient(0, 0, 0, n);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, n, n);
    },
    { repeat: true },
  );
}

// a black hole's disc: hot near the middle, cooling outwards, in streaks
function accretion() {
  return canvasTexture(256, (g, n) => {
    const c = n / 2;
    const grad = g.createRadialGradient(c, c, n * 0.18, c, c, n / 2);
    grad.addColorStop(0, 'rgba(255,250,220,1)');
    grad.addColorStop(0.25, 'rgba(255,190,90,0.95)');
    grad.addColorStop(0.6, 'rgba(255,90,120,0.55)');
    grad.addColorStop(1, 'rgba(120,40,160,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
    g.globalCompositeOperation = 'destination-out';
    const rnd = seeded(5);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(0,0,0,${0.15 + rnd() * 0.35})`;
      g.lineWidth = 2 + rnd() * 5;
      const r = n * (0.2 + rnd() * 0.28);
      const a = rnd() * Math.PI * 2;
      g.beginPath();
      g.arc(c, c, r, a, a + 0.5 + rnd());
      g.stroke();
    }
  });
}

// a wormhole's swirl
function swirl(inner, outer) {
  return canvasTexture(256, (g, n) => {
    const c = n / 2;
    const grad = g.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.7, outer);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(c, c, c, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 6;
    for (let arm = 0; arm < 3; arm++) {
      g.beginPath();
      for (let i = 0; i < 60; i++) {
        const t = i / 59;
        const a = arm * ((Math.PI * 2) / 3) + t * 5;
        const r = t * c * 0.92;
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    }
  });
}

// a sprite with an emoji (or a word) on it
export function emojiSprite(text, size = 0.6) {
  const tex = canvasTexture(128, (g, n) => {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${Math.floor(n * 0.72)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.fillText(text, n / 2, n / 2 + n * 0.04);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.set(size, size, 1);
  return s;
}

// a rounded square outline, for the glowing "you can put it here" spots
let SPOT = null;
export function spotTexture() {
  if (SPOT) return SPOT;
  SPOT = canvasTexture(128, (g, n) => {
    const r = 18;
    const m = 8;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 7;
    g.setLineDash([16, 10]);
    g.beginPath();
    g.roundRect(m, m, n - m * 2, n - m * 2, r);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.roundRect(m, m, n - m * 2, n - m * 2, r);
    g.fill();
  });
  return SPOT;
}

// a soft round glow (sparks, flashes)
let GLOW = null;
export function glowTexture() {
  if (GLOW) return GLOW;
  GLOW = canvasTexture(64, (g, n) => {
    const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
  });
  return GLOW;
}

// the cream star chart the tiles are laid out on: a faint grid that lines up with the tiles, constellations, and
// the odd printed label, like an old navigator's map
export function chartTexture() {
  return canvasTexture(
    1024,
    (g, n) => {
      g.fillStyle = '#efe4c8';
      g.fillRect(0, 0, n, n);
      const rnd = seeded(77);
      // paper speckle
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = `rgba(120,90,40,${rnd() * 0.05})`;
        g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 2, 1 + rnd() * 2);
      }
      // the grid: one square per tile (the texture repeats every 4 tiles)
      const step = n / 4;
      g.strokeStyle = 'rgba(42,157,143,0.28)';
      g.lineWidth = 3;
      for (let i = 0; i <= 4; i++) {
        g.beginPath();
        g.moveTo(i * step, 0);
        g.lineTo(i * step, n);
        g.stroke();
        g.beginPath();
        g.moveTo(0, i * step);
        g.lineTo(n, i * step);
        g.stroke();
      }
      g.strokeStyle = 'rgba(42,157,143,0.12)';
      g.lineWidth = 1.5;
      for (let i = 0; i < 16; i++) {
        const p = (i + 0.5) * (step / 4);
        g.beginPath();
        g.moveTo(p, 0);
        g.lineTo(p, n);
        g.stroke();
        g.beginPath();
        g.moveTo(0, p);
        g.lineTo(n, p);
        g.stroke();
      }
      // grid crosses
      g.strokeStyle = 'rgba(29,35,64,0.35)';
      g.lineWidth = 3;
      for (let i = 0; i <= 4; i++)
        for (let j = 0; j <= 4; j++) {
          g.beginPath();
          g.moveTo(i * step - 10, j * step);
          g.lineTo(i * step + 10, j * step);
          g.moveTo(i * step, j * step - 10);
          g.lineTo(i * step, j * step + 10);
          g.stroke();
        }
      // constellations
      for (let c = 0; c < 7; c++) {
        let x = rnd() * n;
        let y = rnd() * n;
        g.strokeStyle = 'rgba(29,35,64,0.18)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, y);
        const pts = [[x, y]];
        for (let k = 0; k < 4 + Math.floor(rnd() * 3); k++) {
          x += (rnd() - 0.5) * 140;
          y += (rnd() - 0.5) * 140;
          g.lineTo(x, y);
          pts.push([x, y]);
        }
        g.stroke();
        g.fillStyle = 'rgba(29,35,64,0.4)';
        for (const [px, py] of pts) {
          g.beginPath();
          g.arc(px, py, 3 + rnd() * 3, 0, Math.PI * 2);
          g.fill();
        }
      }
      // little printed numbers
      g.fillStyle = 'rgba(29,35,64,0.25)';
      g.font = 'bold 20px monospace';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (rnd() < 0.35) g.fillText(`${String.fromCharCode(65 + i)}${j + 1}`, i * step + 10, j * step + 26);
    },
    { repeat: true },
  );
}

// Ruler of the Galaxy: the pictures for the six dice faces (and the Star), drawn the same way on the 3D dice
// (canvas) and in the page (SVG), so a "Laser" looks the same everywhere.
export const FACE_COLOR = { 1: '#ffb800', 2: '#ffb800', 3: '#ffb800', repair: '#00ff87', laser: '#ff2a6d', shard: '#c36bff', star: '#ffd36b', hull: '#00ff87' };
export const FACE_NAME = { 1: 'One', 2: 'Two', 3: 'Three', repair: 'Nanite Repair', laser: 'Laser Strike', shard: 'Dark Matter' };

// SVG paths on a 100x100 grid
const PATHS = {
  // a shield with a cross: repair
  repair: '<path d="M50 8 L84 20 V48 C84 70 68 84 50 92 C32 84 16 70 16 48 V20 Z" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/><path d="M50 32 V68 M32 50 H68" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>',
  // crosshairs: laser
  laser: '<circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" stroke-width="8"/><circle cx="50" cy="50" r="8" fill="currentColor"/><path d="M50 6 V28 M50 72 V94 M6 50 H28 M72 50 H94" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
  // a crystal: Dark Matter
  shard: '<path d="M50 6 L80 38 L50 94 L20 38 Z" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/><path d="M20 38 H80 M50 6 L38 38 L50 94 L62 38 Z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round" opacity="0.8"/>',
  star: '<path d="M50 6 L62 37 L95 38 L69 58 L79 91 L50 72 L21 91 L31 58 L5 38 L38 37 Z" fill="currentColor"/>',
  hull: '<path d="M50 8 L84 20 V48 C84 70 68 84 50 92 C32 84 16 70 16 48 V20 Z" fill="currentColor"/>',
};

// an inline SVG icon for a face (or 'star' / 'hull')
export function faceSvg(face, size = '1.2em') {
  const color = FACE_COLOR[face] || '#fff';
  const body = PATHS[face] || `<text x="50" y="74" text-anchor="middle" font-family="Orbitron, sans-serif" font-weight="900" font-size="70" fill="currentColor">${face}</text>`;
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" style="color:${color};vertical-align:-0.2em;filter:drop-shadow(0 0 4px ${color}88)" aria-hidden="true">${body}</svg>`;
}

// the same picture as an element
export function faceIcon(face, size) {
  const span = document.createElement('span');
  span.className = `face-ico f-${face}`;
  span.innerHTML = faceSvg(face, size);
  span.setAttribute('role', 'img');
  span.setAttribute('aria-label', FACE_NAME[face] || face);
  return span;
}

// draw a die face on a canvas (for the 3D dice): a dark tile, a neon border, the symbol glowing in the middle
export function drawFace(face, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const color = FACE_COLOR[face];
  const grd = g.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.7);
  grd.addColorStop(0, '#1b2346');
  grd.addColorStop(1, '#080b1a');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = color;
  g.globalAlpha = 0.55;
  g.lineWidth = size * 0.035;
  g.strokeRect(size * 0.07, size * 0.07, size * 0.86, size * 0.86);
  g.globalAlpha = 1;
  g.shadowColor = color;
  g.shadowBlur = size * 0.09;
  g.fillStyle = color;
  g.strokeStyle = color;
  if (face === '1' || face === '2' || face === '3') {
    g.font = `900 ${size * 0.62}px Orbitron, "Arial Black", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(face, size / 2, size * 0.54);
  } else {
    // draw the SVG path on the canvas, scaled to 60% of the face
    const k = (size * 0.6) / 100;
    g.translate(size * 0.2, size * 0.2);
    g.scale(k, k);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    if (face === 'repair') {
      g.lineWidth = 8;
      g.stroke(new Path2D('M50 8 L84 20 V48 C84 70 68 84 50 92 C32 84 16 70 16 48 V20 Z'));
      g.lineWidth = 11;
      g.stroke(new Path2D('M50 32 V68 M32 50 H68'));
    } else if (face === 'laser') {
      g.lineWidth = 8;
      g.beginPath();
      g.arc(50, 50, 30, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(50, 50, 9, 0, Math.PI * 2);
      g.fill();
      g.stroke(new Path2D('M50 4 V28 M50 72 V96 M4 50 H28 M72 50 H96'));
    } else if (face === 'shard') {
      g.lineWidth = 8;
      g.stroke(new Path2D('M50 6 L80 38 L50 94 L20 38 Z'));
      g.lineWidth = 5;
      g.globalAlpha = 0.85;
      g.stroke(new Path2D('M20 38 H80 M50 6 L38 38 L50 94 L62 38 Z'));
    }
  }
  return c;
}

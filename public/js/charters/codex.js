// Star Charters: How to play, in four picture steps, then every feature with a picture and what it scores, and the
// space twists (wormholes, black holes, anomalies, thruster fuel, the void).
import { store } from './net.js';
import { sfx } from './sound.js';
import { el, onEscape } from './ui.js';
import { tileArt } from './art.js';

const modalLayer = () => document.getElementById('layer-modal');
let popEscape = null;

export function openModal(body, { title = '', wide = false } = {}) {
  closeModal();
  sfx('open');
  const box = modalLayer();
  const close = () => closeModal();
  box.replaceChildren(el('div', { className: 'modal-wrap', onclick: (e) => e.target === e.currentTarget && close() }, el('div', { className: `modal panel ${wide ? 'wide' : ''}` }, el('div', { className: 'modal-head' }, el('h2', {}, title), el('button', { className: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕')), el('div', { className: 'modal-body' }, body))));
  box.hidden = false;
  popEscape = onEscape(() => (sfx('back'), closeModal()));
}

export function closeModal() {
  popEscape?.();
  popEscape = null;
  const box = modalLayer();
  box.hidden = true;
  box.replaceChildren();
}

const step = (n, emoji, title, text) => el('div', { className: 'howto-step', style: { '--i': n } }, el('div', { className: 'hs-num' }, `${n}`), el('div', { className: 'hs-ico' }, emoji), el('h3', {}, title), el('p', {}, text));
const feat = (tile, name, text, pts) => el('div', { className: 'feat' }, el('img', { src: tileArt(tile), alt: '' }), el('div', {}, el('b', {}, name), el('small', {}, text), pts ? el('span', { className: 'pts' }, pts) : null));

export function openRules() {
  const d = store.data;
  const strip = (ids) => el('div', { className: 'tile-strip' }, ...ids.map((id) => el('figure', {}, el('img', { src: tileArt(id), alt: '' }), el('figcaption', {}, d.byId[id]?.name || id))));
  openModal(
    el(
      'div',
      { className: 'rules' },
      el('p', { className: 'lead' }, 'You are a star charter, mapping the galaxy one sector at a time. Lay tiles to build ', el('b', {}, 'warp lanes'), ' and ', el('b', {}, 'space stations'), ', send ', el('b', {}, 'probes'), ' to claim them, and score when they are finished. When the last tile is laid, the most points wins!'),
      el(
        'div',
        { className: 'howto' },
        step(1, '🧩', 'Lay a tile', 'Put your tile next to the map. Every edge must match its neighbour: lane to lane, station to station.'),
        step(2, '🚀', 'Send a probe', 'You may put one probe on a piece of the tile you just laid, if nobody has claimed that feature yet.'),
        step(3, '⭐', 'Finish & score', 'A finished lane or station scores at once. Most probes on it wins the points, and the probes come home.'),
        step(4, '🏁', 'The end', 'When the tiles run out, unfinished features score a little, and the void pays for finished stations.'),
      ),
      el('h3', { className: 'rules-head' }, 'What scores what'),
      el(
        'div',
        { className: 'feat-table' },
        feat('lane', `${d.features.L.icon} Warp Lane`, 'Finished when both ends stop: at a hub, a station, an array, or a wormhole whose twin is out.', '1 per tile'),
        feat('corner-core', `${d.features.S.icon} Station`, 'Finished when its hull is sealed all the way round. Reactor cores (the glowing orbs) pay extra.', '2 per tile · +2 per core'),
        feat('array', `${d.features.A.icon} Deep Space Array`, 'Calibrates once all eight tiles round it are charted.', '9 when surrounded'),
        feat('hole', `${d.features.H.icon} Black Hole`, 'Scores like an array, and its gravity lets you slingshot probes (see below).', '9 when surrounded'),
        feat('cap', `${d.features.V.icon} Void`, 'A probe in the void lies down and stays there all game. At the end it scores for every finished station the void touches.', '3 per finished station'),
      ),
      el('p', { className: 'muted' }, 'Unfinished at the end: lanes still pay 1 a tile, stations 1 a tile (and 1 a core), arrays and black holes 1 plus 1 for each tile round them.'),
      el('h3', { className: 'rules-head' }, 'The space twists'),
      el('div', { className: 'rules-box' }, el('h3', {}, '🌀 Wormholes'), el('p', {}, 'Wormhole tiles come in twins: two lane gates and two station gates. Once both twins are on the map, whatever runs into one is joined to whatever runs into the other, however far apart. Join a rival’s station from across the galaxy, and the most probes takes it!'), strip(['gate', 'gate-station'])),
      el('div', { className: 'rules-box' }, el('h3', {}, '🕳️ Black hole slingshot'), el('p', {}, 'Lay a tile next to a black hole (or the black hole itself) and you may send your probe to any unclaimed lane, station or array on the tiles round the hole, not just the tile you laid.'), strip(['hole'])),
      el('div', { className: 'rules-box' }, el('h3', {}, '💎 Anomalies'), el('p', {}, `Glowing gems float a little way out from the map. Lay a tile on one to grab it: ${Object.values(d.anomalies).map((a) => `${a.icon} ${a.text.toLowerCase()}`).join(', ')}.`)),
      el('div', { className: 'rules-box' }, el('h3', {}, '⛽ Thruster fuel'), el('p', {}, `Everyone starts with ${d.startFuel}. Instead of sending a probe out, burn one to call one of yours home from anywhere (it scores nothing). Great for a probe stuck on a lane that will never finish.`)),
      el('div', { className: 'rules-box' }, el('h3', {}, '🛸 Your fleet'), el('p', {}, `${d.probes} probes and one dreadnought, which counts as two when working out who has the most on a feature. When the dreadnought scores, it comes home too.`)),
      el('p', { className: 'muted' }, 'Tip: point at anything on the map (or tap it on a phone) to see what it is worth and who is winning it.'),
    ),
    { title: '📖 How to play', wide: true },
  );
}

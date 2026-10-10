// The shareable result card: one image with the ship's name, who won, every
// role, the best award and the funniest last words, ready for the group chat.
import { el, problem, toast } from '../util.js';
import { store, themeInfo } from '../store.js';
import { openModal } from './rolecard.js';
import { sfx } from '../audio.js';

const W = 1080;
const H = 1350;
const TITLE = "Silkscreen, 'VT323', monospace";
const BODY = "VT323, ui-monospace, monospace";

function wrap(g, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const words = String(text).split(' ');
  let line = '';
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (g.measureText(test).width > maxWidth && line) {
      if (lines === maxLines - 1) {
        g.fillText(`${line}…`, x, y);
        return y + lineHeight;
      }
      g.fillText(line, x, y);
      y += lineHeight;
      lines += 1;
      line = words[i];
    } else line = test;
  }
  if (line) g.fillText(line, x, y);
  return y + lineHeight;
}

export function drawShareCard(state) {
  const data = store.data;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const crewWon = state.winner === 'crew';
  const accent = crewWon ? '#6cf0ff' : '#ff3b5c';

  // background: deep space with the black hole glowing at the bottom
  g.fillStyle = '#04050c';
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, H + 120, 40, W / 2, H + 120, 760);
  glow.addColorStop(0, crewWon ? 'rgba(80,200,255,0.5)' : 'rgba(255,90,40,0.55)');
  glow.addColorStop(0.5, crewWon ? 'rgba(40,60,160,0.25)' : 'rgba(160,20,70,0.3)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 140; i++) {
    g.fillStyle = `rgba(255,255,255,${0.2 + ((i * 37) % 60) / 100})`;
    g.fillRect((i * 389) % W, (i * 613) % H, 2, 2);
  }
  // scanlines, like the in-game CRT
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);

  g.textAlign = 'center';
  g.fillStyle = '#dff9ff';
  g.font = `56px ${TITLE}`;
  g.fillText(themeInfo(state.script).shareTitle, W / 2, 96);
  g.fillStyle = '#8a92b8';
  g.font = `40px ${BODY}`;
  g.fillText(`${state.shipName || 'The ship'} · ${state.code}${state.season?.games > 1 ? ` · round ${state.season.games}` : ''}`, W / 2, 148);

  g.fillStyle = accent;
  g.font = `64px ${TITLE}`;
  g.shadowColor = accent;
  g.shadowBlur = 30;
  g.fillText(crewWon ? themeInfo(state.script).shareCrew : themeInfo(state.script).shareEvil, W / 2, 250);
  g.shadowBlur = 0;
  g.fillStyle = '#c9d2f2';
  g.font = `38px ${BODY}`;
  wrap(g, state.winReason || '', W / 2, 305, W - 160, 40, 2);

  // every player and their true role
  const players = state.players;
  const cols = players.length > 8 ? 3 : 2;
  const cellW = (W - 120) / cols;
  const cellH = players.length > 12 ? 62 : 74;
  const top = 400;
  g.textAlign = 'left';
  players.forEach((p, i) => {
    const r = data.roles[p.role];
    const x = 60 + (i % cols) * cellW;
    const y = top + Math.floor(i / cols) * cellH;
    const evil = data.types[r?.type]?.team === 'infiltrators';
    g.fillStyle = evil ? 'rgba(255,59,92,0.12)' : 'rgba(108,240,255,0.08)';
    g.fillRect(x, y, cellW - 14, cellH - 10);
    g.fillStyle = data.suits[p.cosmetics?.suit] || '#888';
    g.beginPath();
    g.arc(x + 26, y + (cellH - 10) / 2, 14, 0, Math.PI * 2);
    g.fill();
    g.font = `34px ${BODY}`;
    g.fillStyle = p.alive ? '#ffffff' : '#8a92b8';
    g.fillText(`${r?.icon || '?'} ${p.name}${p.alive ? '' : ' 💀'}`, x + 50, y + 30);
    g.font = `26px ${BODY}`;
    g.fillStyle = evil ? '#ff9fb3' : '#9fe9ff';
    g.fillText(r?.name || '', x + 50, y + (cellH - 10) - 10);
  });
  let y = top + Math.ceil(players.length / cols) * cellH + 30;

  // the best award, plus a couple more
  const name = (id) => players.find((p) => p.id === id)?.name || '?';
  const awards = (state.awards || []).slice(0, 3);
  if (awards.length) {
    g.textAlign = 'center';
    g.fillStyle = '#ffd27a';
    g.font = `34px ${TITLE}`;
    g.fillText('AWARDS', W / 2, y);
    y += 50;
    g.font = `38px ${BODY}`;
    for (const a of awards) {
      g.fillStyle = '#ffe9b8';
      g.fillText(`${a.icon} ${a.title}: ${name(a.id)}`, W / 2, y);
      y += 46;
    }
    y += 10;
  }

  // the funniest last words
  const lw = state.bestLastWords;
  if (lw && y < H - 200) {
    g.textAlign = 'center';
    g.fillStyle = '#b9a4ff';
    g.font = `34px ${TITLE}`;
    g.fillText('FAMOUS LAST WORDS', W / 2, y);
    y += 54;
    g.fillStyle = '#ffffff';
    g.font = `44px ${BODY}`;
    y = wrap(g, `“${lw.text}”`, W / 2, y, W - 180, 46, 3);
    g.fillStyle = '#8a92b8';
    g.font = `34px ${BODY}`;
    g.fillText(`— ${name(lw.id)}${lw.laughs ? `  (🤣 ×${lw.laughs})` : ''}`, W / 2, y + 4);
  }

  // the evening's leaders, if there is room left
  const leaders = (state.season?.rows || []).slice(0, 3);
  if (leaders.length && y < H - 170) {
    y = Math.max(y + 20, H - 170 - leaders.length * 10);
    g.textAlign = 'center';
    g.fillStyle = '#ffd27a';
    g.font = `30px ${TITLE}`;
    g.fillText(`TONIGHT'S SEASON · ${state.season.games} GAME${state.season.games === 1 ? '' : 'S'}`, W / 2, y);
    g.font = `36px ${BODY}`;
    g.fillStyle = '#ffe9b8';
    g.fillText(leaders.map((r, i) => `${['🥇', '🥈', '🥉'][i]} ${r.name} ${r.points}`).join('    '), W / 2, y + 48);
  }

  g.textAlign = 'center';
  g.fillStyle = '#5c6488';
  g.font = `30px ${BODY}`;
  g.fillText(location.host || 'No More Space', W / 2, H - 40);
  return c;
}

// Show the card with Share / Save buttons.
export function openShareCard(state) {
  let canvas;
  try {
    canvas = drawShareCard(state);
  } catch (err) {
    console.error(err);
    problem('Could not draw the card.');
    return;
  }
  const fileName = `no-more-space-${(state.shipName || state.code).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
  const save = () => {
    const a = el('a', { href: canvas.toDataURL('image/png'), download: fileName });
    document.body.append(a);
    a.click();
    a.remove();
  };
  const share = () => canvas.toBlob(async (blob) => {
    const file = new File([blob], fileName, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'No More Space', text: `${state.shipName}: ${state.winner === 'crew' ? 'the crew escaped!' : 'no more space…'}` });
        return;
      }
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        sfx('chime');
        toast('📋 Card copied! Paste it into your group chat.');
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
    save();
  }, 'image/png');
  const img = el('img', { src: canvas.toDataURL('image/png'), alt: 'Your game result card', className: 'share-preview' });
  openModal(el('div', { className: 'share-card' },
    el('h2', {}, '📸 Share the result'),
    img,
    el('div', { className: 'row' },
      el('button', { className: 'primary', onclick: share }, navigator.canShare ? '📤 Share' : '📋 Copy image'),
      el('button', { onclick: save }, '💾 Save PNG'),
    ),
  ));
}

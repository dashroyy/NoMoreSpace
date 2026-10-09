// 👤 Your profile: your record across every game played in this browser, and
// how close you are to each unlockable. (No account: it lives in this browser.)
import { el } from '../util.js';
import { store } from '../store.js';
import { progress, UNLOCKS, isUnlocked } from '../progress.js';
import { openModal } from './rolecard.js';

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');

export function openProfile() {
  const p = progress();
  const roles = store.data.roles;
  const fav = Object.entries(p.roles).sort((a, b) => b[1] - a[1])[0];
  const awards = Object.entries(p.awards || {}).sort((a, b) => b[1] - a[1]);
  const stat = (big, label) => el('div', { className: 'pf-stat' }, el('b', {}, big), el('span', {}, label));
  openModal(el('div', { className: 'profile' },
    el('h2', {}, '👤 Your profile'),
    el('p', { className: 'hint' }, 'Your record from every game played in this browser.'),
    p.games
      ? el('div', { className: 'pf-grid' },
        stat(p.games, 'games played'),
        stat(p.wins, `wins (${pct(p.wins, p.games)})`),
        stat(`${p.crewWins}/${p.crewGames}`, '😇 wins with the crew'),
        stat(`${p.evilWins}/${p.evilGames}`, '😈 wins as evil'),
        stat(p.streak, `win streak (best ${p.bestStreak})`),
        stat(fav ? `${roles[fav[0]]?.icon || ''} ${fav[1]}×` : '–', fav ? `favourite role: ${roles[fav[0]]?.name}` : 'favourite role'),
        stat(p.guesses, '🔮 night guesses right'),
        stat(p.psychicBets, '👻 ghost bets right'),
        stat(p.kicks, '🦆 duck bumps'),
        stat(p.practice, '🎓 practice games'),
      )
      : el('p', {}, 'No games yet. Your stats will appear here after your first game. (Try 🎓 Practice with robots!)'),
    awards.length ? el('h3', {}, '🏅 Awards won') : null,
    awards.length ? el('div', { className: 'pf-awards' }, ...awards.map(([title, n]) => el('span', { className: 'chip' }, `${title} ×${n}`))) : null,
    el('h3', {}, '🎁 Unlockables'),
    el('div', { className: 'pf-unlocks' }, ...Object.entries(UNLOCKS).map(([id, u]) => {
      const open = isUnlocked(id, p);
      const [have, need] = u.count ? u.count(p) : [];
      return el('div', { className: `pf-unlock ${open ? 'open' : ''}` },
        el('b', {}, open ? '✅ ' : '🔒 ', u.label),
        el('span', { className: 'hint' }, open ? `Unlocked: pick it in the docking bay (${u.kind}).` : u.hint),
        !open && need ? el('div', { className: 'pf-bar' }, el('i', { style: { width: `${Math.min(100, (have / need) * 100)}%` } }), el('small', {}, `${have}/${need}`)) : null,
      );
    })),
  ));
}

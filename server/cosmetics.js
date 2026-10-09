// Spacesuit customisation options. Everyone looks the same shape until the end,
// so colours and silly hats are how you recognise each other.

const SUITS = {
  red: '#d7263d',
  blue: '#1f5fd1',
  green: '#1f8f4e',
  pink: '#ee6fb6',
  orange: '#f08a24',
  yellow: '#f5d327',
  black: '#3a3a44',
  white: '#e8ecf4',
  purple: '#7b3fe4',
  brown: '#7a4e2d',
  cyan: '#38d6e8',
  lime: '#7fe33b',
  maroon: '#6e1b2a',
  rose: '#f4b6c2',
  gray: '#8a93a6',
  teal: '#127a7a',
};

const HATS = ['none', 'party', 'antenna', 'crown', 'halo', 'tophat', 'catears', 'chef', 'flower', 'headphones', 'propeller', 'horns', 'bow', 'cone', 'beanie', 'cowboy', 'laurel', 'tentacles', 'jester', 'saucer', 'crystal'];
const VISORS = { gold: '#f2b84b', sky: '#7cc7ff', mirror: '#c9d3e6', mint: '#7af0c1', rose: '#ff8fb1', void: '#141420', psychic: '#b46bff' };
const PETS = ['none', 'cat', 'duck', 'drone', 'alien', 'hamster', 'jelly', 'whale', 'rubberduck'];
// Earned by playing (tracked in each player's browser): see public/js/progress.js
const UNLOCKABLE = { hats: ['laurel', 'tentacles', 'jester', 'saucer', 'crystal'], pets: ['whale', 'rubberduck'], visors: ['psychic'] };

function defaults(taken = []) {
  const suit = Object.keys(SUITS).find((s) => !taken.includes(s)) || 'white';
  return { suit, hat: 'none', visor: 'gold', pet: 'none' };
}

// Keep only valid options; fall back to the current value otherwise.
function clean(input = {}, current = defaults()) {
  return {
    suit: SUITS[input.suit] ? input.suit : current.suit,
    hat: HATS.includes(input.hat) ? input.hat : current.hat,
    visor: VISORS[input.visor] ? input.visor : current.visor,
    pet: PETS.includes(input.pet) ? input.pet : current.pet,
  };
}

module.exports = { SUITS, HATS, VISORS, PETS, UNLOCKABLE, defaults, clean };

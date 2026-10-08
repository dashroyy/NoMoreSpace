// Fun little jobs in each room. Doing them charges the Observation Array,
// which shows a cryptic clue in the windows the next morning.

const TASKS = {
  thrusters: { room: 'engine', name: 'Calibrate the Thrusters' },
  core: { room: 'reactor', name: 'Stabilise the Core' },
  samples: { room: 'medbay', name: 'Analyse Alien Samples' },
  plants: { room: 'hydroponics', name: 'Water the Moon Plants' },
  signal: { room: 'comms', name: 'Tune the Distress Signal' },
  course: { room: 'navigation', name: 'Plot an Escape Course' },
  noodles: { room: 'galley', name: 'Cook Space Noodles' },
  hamsters: { room: 'cargo', name: 'Catch the Escaped Hamsters' },
  telescope: { room: 'observation', name: 'Align the Telescope' },
  vents: { room: 'airlock', name: 'Purge the Vents' },
  cat: { room: 'quarters', name: 'Feed the Ship Cat' },
};

module.exports = { TASKS };

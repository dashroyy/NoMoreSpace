// The player's name, remembered in this browser. The title menu asks for it once; every way into a ship
// (launching, boarding, practice, a public ship) reads it from here.
const KEY = 'nms-name';

export function getCallsign() {
  try {
    return localStorage.getItem(KEY) || JSON.parse(localStorage.getItem('nms-seat') || 'null')?.name || '';
  } catch {
    return '';
  }
}

export function setCallsign(name) {
  try {
    localStorage.setItem(KEY, name);
  } catch {}
}

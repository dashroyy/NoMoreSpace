// Phase to Space: the tips switch (odds on the table and a glow on the suggested move). On unless you turn it off;
// remembered in this browser.
const KEY = 'pts-tips';

export function tipsOn() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setTips(on) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {}
}

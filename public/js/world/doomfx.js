// Effects for the disaster outside: the closer it gets, the more it shows in the ship.
//   * an underglow: a coloured light under the ship that throbs (the black hole's slow
//     orange throb, the Grin's red heartbeat, the Bloom's sick green flicker),
//   * a coloured vignette round the screen that gets stronger and pulses with it,
//   * and now and then an event: the black hole shudders and flares, the Grin LAUGHS, the
//     Bloom throws lightning. Events come more often as the end gets near. Each one flashes
//     the screen, kicks the scenery, shakes the camera a little and plays its sound.
// All of it is strongest in the middle of the game and absent in the lobby.
import * as THREE from 'three';

const THEMES = {
  classic: { color: 0xff7a2a, rgb: '255,110,40', every: [26, 10], flash: 0.1, shake: 1.1 },
  carnival: { color: 0xff2030, rgb: '255,30,50', every: [30, 12], flash: 0.2, shake: 0.5 },
  outbreak: { color: 0x7dff3a, rgb: '125,255,60', every: [14, 5], flash: 0.35, shake: 0 },
};
const PLAYING = ['roam', 'meeting', 'nominations', 'lastwords', 'dusk', 'dawn', 'night'];

export class DoomFx {
  constructor(world) {
    this.world = world;
    this.id = 'classic';
    this.theme = THEMES.classic;
    this.light = new THREE.PointLight(this.theme.color, 0, 260, 1);
    this.light.position.set(6, -22, 4);
    world.scene.add(this.light);
    this.glowEl = document.getElementById('doom-glow');
    this.flashEl = document.getElementById('doom-flash');
    this.flash = 0;
    this.flicker = 0;
    this.next = 14;
  }

  setScript(id) {
    this.id = THEMES[id] ? id : 'classic';
    this.theme = THEMES[this.id];
    this.light.color.setHex(this.theme.color);
    for (const el of [this.glowEl, this.flashEl]) el?.style.setProperty('--doom-rgb', this.theme.rgb);
  }

  // an event: the black hole shudders, the Grin laughs, the Bloom throws lightning
  fire(power = 1, shake = true) {
    const w = this.world;
    this.flash = power;
    this.flicker = this.id === 'outbreak' ? 0.3 : 0;
    w.backdrop.flash();
    w.soundscape.doomCue(this.id, power);
    if (shake && this.theme.shake) w.rumble(this.theme.shake * power);
  }

  update(t, dt) {
    const w = this.world;
    const playing = PLAYING.includes(w.phase);
    const p = playing ? w.progress : 0;
    // a throb that suits the thing outside
    let pulse;
    if (this.id === 'carnival') pulse = Math.pow(Math.max(0, Math.sin(t * 2.1)), 6) * 0.5 + Math.pow(Math.max(0, Math.sin(t * 2.1 - 0.5)), 6) * 0.3 + 0.35;
    else if (this.id === 'outbreak') pulse = 0.5 + 0.25 * Math.sin(t * 1.7) + (Math.random() < 0.06 + p * 0.1 ? Math.random() * 0.4 : 0);
    else pulse = 0.55 + 0.25 * Math.sin(t * 0.9) + 0.1 * Math.sin(t * 2.7);
    this.flash = Math.max(0, this.flash - dt * (this.id === 'outbreak' ? 2.8 : 1.4));
    const strobe = this.flicker > 0 && this.flash > 0.2 ? (Math.sin(t * 70) > -0.2 ? 1 : 0.2) : 1;
    this.flicker = Math.max(0, this.flicker - dt);
    // the glow under the ship lights the hull, the walls and the floor edges
    const target = playing ? (28 + 420 * p) * (0.55 + 0.45 * pulse) + this.flash * 520 * strobe : 0;
    this.light.intensity += (target - this.light.intensity) * Math.min(1, dt * 8);
    // the coloured vignette
    if (this.glowEl) this.glowEl.style.opacity = playing ? Math.min(0.9, 0.1 + 0.8 * p) * (0.65 + 0.35 * pulse) : 0;
    if (this.flashEl) this.flashEl.style.opacity = this.flash * this.theme.flash * strobe;
    // events, more often as the end gets near
    if (playing) {
      this.next -= dt;
      if (this.next <= 0) {
        this.fire(0.6 + 0.4 * p);
        const [far, near] = this.theme.every;
        this.next = (far + (near - far) * p) * (0.7 + Math.random() * 0.6);
      }
    }
  }
}

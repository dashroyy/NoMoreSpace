// The finishing pass that makes the ship look like a finished game rather than a raw 3D scene:
//
//   bloom        every light, screen, beam and glowing trim gets a soft halo
//   grading      each part of the day has its own colour: crisp and warm by day, cold and blue at night,
//                gold at dawn, red when the meeting alarm sounds or the disaster is close
//   lens         a whisper of film grain and a touch of colour fringing at the very edges of the screen
//
// "Low graphics" (Settings) skips all of it and draws straight to the screen, exactly as before.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// tint (multiplies the colour), saturation, contrast, lift (adds to the shadows), and how strong the bloom is
export const GRADES = {
  home: { tint: [1.0, 0.98, 1.06], sat: 1.15, contrast: 1.06, lift: [0.0, 0.0, 0.012], bloom: 0.6 },
  lobby: { tint: [1.02, 1.0, 1.02], sat: 1.12, contrast: 1.05, lift: [0.004, 0.0, 0.01], bloom: 0.45 },
  day: { tint: [1.04, 1.0, 0.97], sat: 1.14, contrast: 1.06, lift: [0.006, 0.003, 0.0], bloom: 0.4 },
  dawn: { tint: [1.12, 1.0, 0.86], sat: 1.12, contrast: 1.04, lift: [0.02, 0.01, 0.0], bloom: 0.5 },
  meeting: { tint: [1.08, 0.97, 0.97], sat: 1.12, contrast: 1.08, lift: [0.012, 0.0, 0.0], bloom: 0.42 },
  tense: { tint: [1.06, 0.96, 1.0], sat: 1.0, contrast: 1.12, lift: [0.01, 0.0, 0.008], bloom: 0.45 },
  night: { tint: [0.82, 0.9, 1.18], sat: 0.8, contrast: 1.1, lift: [0.0, 0.004, 0.02], bloom: 0.6 },
  doom: { tint: [1.16, 0.9, 0.86], sat: 1.05, contrast: 1.12, lift: [0.02, 0.0, 0.0], bloom: 0.55 },
  ended: { tint: [1.02, 1.0, 1.04], sat: 1.15, contrast: 1.06, lift: [0.0, 0.0, 0.01], bloom: 0.6 },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uLift: { value: new THREE.Vector3(0, 0, 0) },
    uSat: { value: 1 },
    uContrast: { value: 1 },
    uTime: { value: 0 },
    uGrain: { value: 0.035 },
    uFringe: { value: 0.0016 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uTint;
    uniform vec3 uLift;
    uniform float uSat;
    uniform float uContrast;
    uniform float uTime;
    uniform float uGrain;
    uniform float uFringe;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      // colour fringing, only towards the corners (a lens, not a glitch)
      vec2 d = vUv - 0.5;
      float edge = dot(d, d) * 4.0;
      vec2 off = d * uFringe * edge;
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, base.g, texture2D(tDiffuse, vUv - off).b);
      // grade (the picture is still in linear light here: the tone mapping comes after)
      c = c * uTint + uLift;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.18) * uContrast + 0.18;
      // a fine, moving film grain (stronger in the darks, where it reads as texture, not dirt)
      float g = hash(vUv * vec2(1931.0, 1777.0) + fract(uTime * 7.0)) - 0.5;
      c += g * uGrain * (1.0 - smoothstep(0.0, 0.6, l)) * 0.6;
      gl_FragColor = vec4(max(c, 0.0), base.a);
    }`,
};

export class PostFx {
  constructor(renderer, scene, camera, { lowFx = false } = {}) {
    this.renderer = renderer;
    this.enabled = !lowFx;
    this.want = GRADES.day;
    this.bloomWant = GRADES.day.bloom;
    if (!this.enabled) return;
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    // bloom: only what is really bright (lamps, screens, neon), not lit walls or suits (those stay under 1.1)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.4, 0.4, 1.1);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.setGrade('day', true);
  }

  // Ease towards a grade ('day', 'night', 'dawn', 'meeting', 'tense', 'doom', 'home', 'lobby', 'ended').
  setGrade(name, now = false) {
    const g = GRADES[name] || GRADES.day;
    this.want = g;
    if (now && this.grade) {
      const u = this.grade.uniforms;
      u.uTint.value.set(...g.tint);
      u.uLift.value.set(...g.lift);
      u.uSat.value = g.sat;
      u.uContrast.value = g.contrast;
      this.bloom.strength = g.bloom;
    }
  }

  update(dt, t) {
    if (!this.enabled) return;
    const u = this.grade.uniforms;
    const k = 1 - Math.exp(-dt * 1.6);
    const g = this.want;
    u.uTint.value.lerp(_v.set(...g.tint), k);
    u.uLift.value.lerp(_v.set(...g.lift), k);
    u.uSat.value += (g.sat - u.uSat.value) * k;
    u.uContrast.value += (g.contrast - u.uContrast.value) * k;
    this.bloom.strength += (g.bloom - this.bloom.strength) * k;
    u.uTime.value = t;
  }

  setSize(w, h, ratio) {
    if (!this.enabled) return;
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
  }

  render(scene, camera) {
    if (!this.enabled) {
      this.renderer.render(scene, camera);
      return;
    }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.composer.render();
  }
}

const _v = new THREE.Vector3();

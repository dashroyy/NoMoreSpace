// Ruler of the Galaxy: the 3D stage. One renderer, one scene and one camera behind every screen, with a bloom
// pass so anything emissive glows, a camera that drifts and can be flown to a point of interest, and HTML
// labels that follow 3D objects around.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Stage {
  constructor(host, labelHost) {
    this.host = host;
    this.labelHost = labelHost;
    this.small = matchMedia('(max-width: 760px)').matches || matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.small, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.small ? 1.5 : 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03040a);
    this.scene.fog = new THREE.FogExp2(0x05040f, 0.0016);
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 3000);

    // glow: bright and emissive things bleed light, like a real lens
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), this.small ? 0.6 : 0.75, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // the camera rig: it looks at `target` from a point on a sphere round it
    this.rig = { target: new THREE.Vector3(0, 1.2, 0), radius: 30, theta: 0, phi: 1.02 };
    this.tween = null;
    this.drift = 1; // idle sway, 0..1
    this.shakeAmp = 0;
    this.frameFns = new Set();
    this.labels = new Set();
    this.clock = new THREE.Clock();
    this.time = 0;
    this.paused = false;

    addEventListener('resize', () => this.resize());
    this.resize();
    const loop = () => {
      requestAnimationFrame(loop);
      if (document.hidden) return;
      const dt = Math.min(0.05, this.clock.getDelta());
      this.time += dt;
      this.update(dt);
    };
    requestAnimationFrame(loop);
  }

  resize() {
    const w = this.host.clientWidth || innerWidth;
    const h = this.host.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    // portrait screens need to stand further back to see the whole ring
    this.camera.fov = w / h < 0.8 ? 62 : 46;
    this.camera.updateProjectionMatrix();
  }

  onFrame(fn) {
    this.frameFns.add(fn);
    return () => this.frameFns.delete(fn);
  }

  // Fly the camera somewhere: { target: Vector3, radius, theta, phi, duration (s) }
  fly(to, duration = 1.6) {
    const from = { target: this.rig.target.clone(), radius: this.rig.radius, theta: this.rig.theta, phi: this.rig.phi };
    const goal = {
      target: to.target ? to.target.clone() : from.target.clone(),
      radius: to.radius ?? from.radius,
      theta: to.theta ?? from.theta,
      phi: to.phi ?? from.phi,
    };
    // turn the short way round
    while (goal.theta - from.theta > Math.PI) goal.theta -= Math.PI * 2;
    while (goal.theta - from.theta < -Math.PI) goal.theta += Math.PI * 2;
    this.tween = { from, goal, t: 0, duration: Math.max(0.01, duration) };
  }

  shake(power = 0.5) {
    this.shakeAmp = Math.min(1.5, this.shakeAmp + power);
  }

  // an HTML element that follows a 3D object (offset: world units above it)
  addLabel(object, element, offset = 2) {
    const label = { object, element, offset, visible: true };
    this.labelHost.append(element);
    this.labels.add(label);
    return {
      remove: () => {
        element.remove();
        this.labels.delete(label);
      },
      set visible(v) {
        label.visible = v;
      },
    };
  }

  update(dt) {
    // camera
    const r = this.rig;
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt / tw.duration;
      const k = ease(Math.min(1, tw.t));
      r.target.lerpVectors(tw.from.target, tw.goal.target, k);
      r.radius = tw.from.radius + (tw.goal.radius - tw.from.radius) * k;
      r.theta = tw.from.theta + (tw.goal.theta - tw.from.theta) * k;
      r.phi = tw.from.phi + (tw.goal.phi - tw.from.phi) * k;
      if (tw.t >= 1) this.tween = null;
    }
    const sway = this.drift * Math.sin(this.time * 0.07) * 0.16;
    const bob = this.drift * Math.sin(this.time * 0.11) * 0.03;
    const theta = r.theta + sway;
    const phi = Math.max(0.15, Math.min(1.5, r.phi + bob));
    const cam = this.camera;
    cam.position.set(r.target.x + r.radius * Math.sin(phi) * Math.sin(theta), r.target.y + r.radius * Math.cos(phi), r.target.z + r.radius * Math.sin(phi) * Math.cos(theta));
    if (this.shakeAmp > 0.001) {
      const s = this.shakeAmp * 0.35;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      this.shakeAmp *= Math.pow(0.02, dt);
    }
    cam.lookAt(r.target);

    for (const fn of this.frameFns) fn(dt, this.time);
    this.composer.render(dt);
    this.placeLabels();
  }

  placeLabels() {
    if (!this.labels.size) return;
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    const v = new THREE.Vector3();
    for (const l of this.labels) {
      if (!l.visible || !l.object.parent) {
        l.element.style.display = 'none';
        continue;
      }
      l.object.getWorldPosition(v);
      v.y += l.offset;
      v.project(this.camera);
      if (v.z > 1 || v.z < -1) {
        l.element.style.display = 'none';
        continue;
      }
      l.element.style.display = '';
      l.element.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
    }
  }

  // where a 3D point is on the screen (for HTML effects)
  toScreen(point) {
    const v = point.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height, behind: v.z > 1 };
  }
}

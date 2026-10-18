// Star Charters: the 3D stage. The renderer (soft studio light, real shadows), a camera that looks down at the chart
// table and that you drag about and zoom (mouse, wheel, one or two fingers), taps and hovers turned into points on
// the table, and HTML labels that follow 3D things around.
import * as THREE from 'three';
import { PAPER } from './look.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Stage {
  constructor(host, labelHost) {
    this.host = host;
    this.labelHost = labelHost;
    this.small = matchMedia('(max-width: 760px)').matches || matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PAPER);
    this.scene.fog = new THREE.Fog(PAPER, 60, 150);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);

    // light: a warm sun from the top left with soft shadows, a cool fill from the sky
    this.scene.add(new THREE.HemisphereLight(0xfff6e6, 0xb8a98a, 1.25));
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -16;
    sc.right = sc.top = 16;
    sc.near = 1;
    sc.far = 80;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    const rim = new THREE.DirectionalLight(0xbfe8ff, 0.55);
    rim.position.set(14, 10, -18);
    this.scene.add(rim);

    // the camera rig: it looks at `target` (a point on the table) from `dist` away, tipped `phi` from straight down
    this.rig = { target: new THREE.Vector3(0, 0, 0), dist: 22, phi: 0.68, theta: 0 };
    this.tween = null;
    this.shakeAmp = 0;
    this.shakeScale = 1;
    this.frameFns = new Set();
    this.labels = new Set();
    this.clock = new THREE.Clock();
    this.time = 0;
    this.quality = 'high';
    this.minDist = 7;
    this.maxDist = 64;
    this.userMoved = 0; // when the player last dragged or zoomed (so the camera does not fight them)
    this.input = { onTap: null, onHover: null, enabled: true };
    // a sideways nudge of the picture (fractions of the screen), so the map can sit beside a menu
    this.shift = { x: 0, y: 0, tx: 0, ty: 0 };

    addEventListener('resize', () => this.resize());
    this.setQuality('high');
    this.wireControls();
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
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 52 : 38;
    this.camera.updateProjectionMatrix();
  }

  setShift(x = 0, y = 0) {
    this.shift.tx = x;
    this.shift.ty = y;
  }

  onFrame(fn) {
    this.frameFns.add(fn);
    return () => this.frameFns.delete(fn);
  }

  // glide the camera: { target, dist, phi, theta }
  fly(to, duration = 1.2) {
    const from = { target: this.rig.target.clone(), dist: this.rig.dist, phi: this.rig.phi, theta: this.rig.theta };
    const goal = { target: to.target ? to.target.clone() : from.target.clone(), dist: to.dist ?? from.dist, phi: to.phi ?? from.phi, theta: to.theta ?? from.theta };
    this.tween = { from, goal, t: 0, duration: Math.max(0.01, duration) };
  }

  shake(power = 0.5) {
    this.shakeAmp = Math.min(1, this.shakeAmp + power * this.shakeScale);
  }

  setQuality(q) {
    this.quality = q;
    const cap = { high: this.small ? 1.75 : 2, balanced: 1.25, low: 1 }[q] || 1.5;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cap));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.resize();
  }

  // ---------------------------------------------------------------------------
  // dragging, zooming, tapping
  // ---------------------------------------------------------------------------
  // the point on the table (y = h) under a screen position
  pick(clientX, clientY, h = 0.2) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), hit) ? hit : null;
  }

  wireControls() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    const pointers = new Map();
    let drag = null;
    let pinch = null;
    const zoomBy = (k) => {
      this.rig.dist = Math.max(this.minDist, Math.min(this.maxDist, this.rig.dist * k));
      this.userMoved = this.time;
      this.tween = null;
    };
    el.addEventListener('pointerdown', (e) => {
      if (!this.input.enabled) return;
      el.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) drag = { x0: e.clientX, y0: e.clientY, last: this.pick(e.clientX, e.clientY, 0), moved: false, button: e.button };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mid: this.pick((a.x + b.x) / 2, (a.y + b.y) / 2, 0) };
        if (drag) drag.moved = true;
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.input.enabled) return;
      if (!pointers.has(e.pointerId)) {
        if (e.pointerType === 'mouse') this.input.onHover?.(this.pick(e.clientX, e.clientY), e);
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 10) zoomBy(pinch.d / d);
        pinch.d = d;
        const mid = this.pick((a.x + b.x) / 2, (a.y + b.y) / 2, 0);
        if (mid && pinch.mid) this.rig.target.add(pinch.mid.clone().sub(mid).setY(0));
        this.camera.updateMatrixWorld();
        pinch.mid = this.pick((a.x + b.x) / 2, (a.y + b.y) / 2, 0);
        return;
      }
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 7) drag.moved = true;
      if (drag.moved) {
        this.tween = null;
        this.userMoved = this.time;
        const now = this.pick(e.clientX, e.clientY, 0);
        if (now && drag.last) {
          this.rig.target.add(drag.last.clone().sub(now).setY(0));
          this.applyCamera();
          drag.last = this.pick(e.clientX, e.clientY, 0);
        }
      } else if (e.pointerType === 'mouse') this.input.onHover?.(this.pick(e.clientX, e.clientY), e);
    });
    const end = (e) => {
      const wasDrag = drag;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        drag = null;
        if (wasDrag && !wasDrag.moved && e.type === 'pointerup' && wasDrag.button === 0) {
          const hit = this.pick(e.clientX, e.clientY);
          if (hit) this.input.onTap?.(hit, e);
        }
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && !pointers.size && this.input.onHover?.(null, e));
    el.addEventListener(
      'wheel',
      (e) => {
        if (!this.input.enabled) return;
        e.preventDefault();
        zoomBy(Math.exp(Math.max(-60, Math.min(60, e.deltaY)) * 0.004));
      },
      { passive: false },
    );
    this.zoomBy = zoomBy;
  }

  pan(dx, dz) {
    this.tween = null;
    this.userMoved = this.time;
    this.rig.target.x += dx;
    this.rig.target.z += dz;
  }

  // ---------------------------------------------------------------------------
  applyCamera() {
    const r = this.rig;
    const cam = this.camera;
    cam.position.set(r.target.x + r.dist * Math.sin(r.phi) * Math.sin(r.theta), r.target.y + r.dist * Math.cos(r.phi), r.target.z + r.dist * Math.sin(r.phi) * Math.cos(r.theta));
    cam.lookAt(r.target);
    cam.updateMatrixWorld();
  }

  update(dt) {
    const r = this.rig;
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt / tw.duration;
      const k = ease(Math.min(1, tw.t));
      r.target.lerpVectors(tw.from.target, tw.goal.target, k);
      r.dist = tw.from.dist + (tw.goal.dist - tw.from.dist) * k;
      r.phi = tw.from.phi + (tw.goal.phi - tw.from.phi) * k;
      r.theta = tw.from.theta + (tw.goal.theta - tw.from.theta) * k;
      if (tw.t >= 1) this.tween = null;
    }
    const sh = this.shift;
    if (Math.abs(sh.tx - sh.x) > 0.0005 || Math.abs(sh.ty - sh.y) > 0.0005 || sh.dirty !== this.camera.aspect) {
      sh.x += (sh.tx - sh.x) * Math.min(1, dt * 4);
      sh.y += (sh.ty - sh.y) * Math.min(1, dt * 4);
      sh.dirty = this.camera.aspect;
      const w = this.renderer.domElement.width;
      const h = this.renderer.domElement.height;
      if (Math.abs(sh.x) < 0.001 && Math.abs(sh.y) < 0.001) this.camera.clearViewOffset();
      else this.camera.setViewOffset(w, h, -sh.x * w, -sh.y * h, w, h);
    }
    this.applyCamera();
    if (this.shakeAmp > 0.001) {
      const s = this.shakeAmp * 0.25;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.shakeAmp *= Math.pow(0.02, dt);
    }
    // the sun (and its shadows) follow what the camera is looking at
    this.sun.position.set(r.target.x - 9, 22, r.target.z + 7);
    this.sun.target.position.copy(r.target);
    const span = Math.max(12, r.dist * 0.75);
    const sc = this.sun.shadow.camera;
    if (Math.abs(sc.right - span) > 0.5) {
      sc.left = sc.bottom = -span;
      sc.right = sc.top = span;
      sc.updateProjectionMatrix();
    }
    for (const fn of this.frameFns) fn(dt, this.time);
    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
  }

  // an HTML element that follows a 3D point or object (offset: world units above it)
  addLabel(object, element, offset = 0.6) {
    const label = { object, element, offset, visible: true };
    this.labelHost.append(element);
    this.labels.add(label);
    return {
      element,
      remove: () => {
        element.remove();
        this.labels.delete(label);
      },
      set visible(v) {
        label.visible = v;
      },
    };
  }

  placeLabels() {
    if (!this.labels.size) return;
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    const v = new THREE.Vector3();
    for (const l of this.labels) {
      const o = l.object;
      if (!l.visible || (o.isObject3D && !o.parent)) {
        l.element.style.display = 'none';
        continue;
      }
      if (o.isObject3D) o.getWorldPosition(v);
      else v.copy(o);
      v.y += l.offset;
      v.project(this.camera);
      if (v.z > 1 || v.z < -1) {
        l.element.style.display = 'none';
        continue;
      }
      l.element.style.display = '';
      l.element.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
    }
  }

  // where a 3D point is on the screen (for HTML effects)
  toScreen(point) {
    const v = point.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height, behind: v.z > 1 };
  }
}

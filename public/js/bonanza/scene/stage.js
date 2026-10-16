// Star Bonanza: the 3D stage. A cel-shaded one: hard bands of light and shade (the shade is purple, never grey), a
// thin rim light, a hard little glint on shiny things and a thick ink outline that stays the same width on screen
// however big or far away something is. No glow, no soft shadows. A camera that bobs about like it is having fun,
// and HTML labels that follow 3D objects around. Everything 3D in the game hangs off this.
import * as THREE from 'three';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const INK = 0x2d1b4e;

// ---------------------------------------------------------------------------
// cel shading: three flat bands (deep purple shade, a middle tone, full colour), each a colour that multiplies the
// surface, so a yellow thing goes orange-brown in its shade and a green one goes teal, like a drawing
// ---------------------------------------------------------------------------
let GRADIENT = null;
export function toonGradient() {
  if (GRADIENT) return GRADIENT;
  const bands = [
    [118, 92, 196],
    [205, 188, 238],
    [255, 255, 255],
  ];
  const data = new Uint8Array(bands.flatMap(([r, g, b]) => [r, g, b, 255]));
  GRADIENT = new THREE.DataTexture(data, bands.length, 1, THREE.RGBAFormat);
  GRADIENT.minFilter = GRADIENT.magFilter = THREE.NearestFilter;
  GRADIENT.generateMipmaps = false;
  GRADIENT.needsUpdate = true;
  return GRADIENT;
}

// extra cel tricks, added to the standard toon shader: a thin bright edge on the lit side, and a hard white glint
const CEL_FRAGMENT = /* glsl */ `
  {
    vec3 celV = normalize( vViewPosition );
    float celEdge = 1.0 - clamp( dot( normal, celV ), 0.0, 1.0 );
    outgoingLight += vec3( step( 0.74, celEdge ) ) * 0.14;
    vec3 celH = normalize( normalize( vec3( -0.35, 0.8, 0.5 ) ) + celV );
    float celGlint = step( 0.972, dot( normal, celH ) );
    outgoingLight = mix( outgoingLight, vec3( 1.0 ), celGlint * 0.92 * celShine );
  }
`;

// turns a standard toon material into the game's cel material (shine: 0 for matte things, 1 for glossy ones)
export function celify(material, shine = 1) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.celShine = { value: shine };
    shader.fragmentShader = 'uniform float celShine;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', CEL_FRAGMENT + '\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => `cel${shine}`;
  return material;
}
export const toon = (color, extra = {}) => celify(new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra }), extra.shine ?? 1);

// the lighting every 3D thing in the game is drawn with (the card portraits use it too): a strong key light from the
// top left, so the bands fall on the same side everywhere, and a soft purple fill
export function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xf2eeff, 0x9a78d8, 1.3));
  const key = new THREE.DirectionalLight(0xfff1dc, 3.2);
  key.position.set(-7, 15, 9);
  scene.add(key);
}

// ---------------------------------------------------------------------------
// ink outlines: a copy of the shape pushed outwards on screen by a fixed number of pixels, drawn from the inside out,
// so only a rim shows. The copy needs smoothed normals (so a box's corners do not tear open).
// ---------------------------------------------------------------------------
const inkRes = { value: new THREE.Vector2(1280, 760) };
export const setInkResolution = (w, h) => inkRes.value.set(w, h);
const inkMats = new Map();
function inkMaterial(px) {
  if (!inkMats.has(px)) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uRes: inkRes, uWidth: { value: px }, uColor: { value: new THREE.Color(INK) } },
      vertexShader: /* glsl */ `
        attribute vec3 snormal;
        uniform vec2 uRes;
        uniform float uWidth;
        void main() {
          vec4 clip = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
          vec3 nv = normalize( normalMatrix * snormal );
          vec2 d = ( projectionMatrix * vec4( nv, 0.0 ) ).xy * uRes;
          d = d / max( length( d ), 1e-5 );
          clip.xy += d / uRes * uWidth * 2.0 * clip.w;
          gl_Position = clip;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        void main() { gl_FragColor = vec4( uColor, 1.0 ); }`,
      side: THREE.BackSide,
    });
    m.userData.shared = true;
    inkMats.set(px, m);
  }
  return inkMats.get(px);
}

// the average of the normals of all the vertices that share a spot (kept on the geometry, once)
export function smoothNormals(geometry) {
  if (geometry.attributes.snormal) return geometry;
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal || (geometry.computeVertexNormals(), geometry.attributes.normal);
  const sums = new Map();
  const key = (i) => `${Math.round(pos.getX(i) * 800)},${Math.round(pos.getY(i) * 800)},${Math.round(pos.getZ(i) * 800)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const s = sums.get(k) || [0, 0, 0];
    s[0] += nor.getX(i);
    s[1] += nor.getY(i);
    s[2] += nor.getZ(i);
    sums.set(k, s);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const s = sums.get(key(i));
    const len = Math.hypot(s[0], s[1], s[2]) || 1;
    out.set([s[0] / len, s[1] / len, s[2] / len], i * 3);
  }
  geometry.setAttribute('snormal', new THREE.BufferAttribute(out, 3));
  return geometry;
}

// puts an ink outline round a mesh (px = how many screen pixels thick); returns the mesh
export function ink(mesh, px = 3) {
  const shell = new THREE.Mesh(smoothNormals(mesh.geometry), inkMaterial(px));
  shell.userData.isInk = true;
  shell.raycast = () => {};
  mesh.add(shell);
  return mesh;
}
// the same, for a geometry on its own (when the shell has to live somewhere else)
export const inkShell = (geometry, px = 3) => {
  const shell = new THREE.Mesh(smoothNormals(geometry), inkMaterial(px));
  shell.userData.isInk = true;
  return shell;
};

export class Stage {
  constructor(host, labelHost) {
    this.host = host;
    this.labelHost = labelHost;
    this.small = matchMedia('(max-width: 760px)').matches || matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    host.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 2000);
    addLights(this.scene);

    // the camera rig: it looks at `target` from a point on a sphere round it
    this.rig = { target: new THREE.Vector3(0, 1, 0), radius: 36, theta: 0, phi: 0.95 };
    this.tween = null;
    this.drift = 1; // idle bobbing, 0..1
    this.shakeAmp = 0;
    this.shakeScale = 1; // 0 turns camera shake off (Settings)
    this.baseFov = 46;
    this.punchV = 0;
    this.spin = 0;
    this.frameFns = new Set();
    this.labels = new Set();
    this.clock = new THREE.Clock();
    this.time = 0;
    this.quality = 'high';

    addEventListener('resize', () => this.resize());
    this.setQuality('high');
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
    setInkResolution(w, h);
    this.camera.aspect = w / h;
    this.baseFov = w / h < 0.8 ? 60 : 46;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  onFrame(fn) {
    this.frameFns.add(fn);
    return () => this.frameFns.delete(fn);
  }

  // fly the camera somewhere: { target: Vector3, radius, theta, phi }
  fly(to, duration = 1.6, { exact = false } = {}) {
    const from = { target: this.rig.target.clone(), radius: this.rig.radius, theta: this.rig.theta, phi: this.rig.phi };
    const goal = { target: to.target ? to.target.clone() : from.target.clone(), radius: to.radius ?? from.radius, theta: to.theta ?? from.theta, phi: to.phi ?? from.phi };
    if (!exact) {
      while (goal.theta - from.theta > Math.PI) goal.theta -= Math.PI * 2;
      while (goal.theta - from.theta < -Math.PI) goal.theta += Math.PI * 2;
    }
    this.tween = { from, goal, t: 0, duration: Math.max(0.01, duration) };
  }

  // a quick zoom-in, for a big moment
  punch(power = 1) {
    this.punchV = Math.min(1.4, this.punchV + power);
  }

  shake(power = 0.5) {
    this.shakeAmp = Math.min(1.2, this.shakeAmp + power * this.shakeScale);
  }

  // graphics quality (Settings): high, balanced or low draw fewer pixels
  setQuality(q) {
    this.quality = q;
    const cap = { high: this.small ? 1.75 : 2, balanced: 1.25, low: 1 }[q] || 1.5;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cap));
    this.resize();
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
    } else if (this.spin) r.theta += this.spin * dt;
    const sway = this.drift * Math.sin(this.time * 0.13) * 0.07;
    const bob = this.drift * Math.sin(this.time * 0.21) * 0.025;
    const theta = r.theta + sway;
    const phi = Math.max(0.15, Math.min(1.5, r.phi + bob));
    const cam = this.camera;
    cam.position.set(r.target.x + r.radius * Math.sin(phi) * Math.sin(theta), r.target.y + r.radius * Math.cos(phi), r.target.z + r.radius * Math.sin(phi) * Math.cos(theta));
    if (this.shakeAmp > 0.001) {
      const s = this.shakeAmp * 0.3;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      this.shakeAmp *= Math.pow(0.02, dt);
    }
    cam.lookAt(r.target);
    if (this.punchV > 0.001) {
      this.punchV *= Math.pow(0.001, dt);
      cam.fov = this.baseFov - this.punchV * 4;
      cam.updateProjectionMatrix();
    } else if (cam.fov !== this.baseFov) {
      cam.fov = this.baseFov;
      this.punchV = 0;
      cam.updateProjectionMatrix();
    }
    for (const fn of this.frameFns) fn(dt, this.time);
    this.renderer.render(this.scene, cam);
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

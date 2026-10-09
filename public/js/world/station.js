// The outside of the station, so it reads as a real orbital station instead
// of rooms floating in space: solar-panel wings on long trusses, radiators,
// a comms mast, a docked shuttle, a big hub ring under the bridge and
// blinking navigation lights. Everything sits at or below deck level, so it
// never hides anyone walking around inside.
import * as THREE from 'three';

const m = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.6, ...extra });

function add(group, geometry, material, x, y, z, rot = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (rot) mesh.rotation.set(...rot);
  group.add(mesh);
  return mesh;
}

// Solar cells: deep blue squares with silver gridlines and a faint sheen.
function solarTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 128);
  grad.addColorStop(0, '#0d2a6e');
  grad.addColorStop(0.5, '#1b47a8');
  grad.addColorStop(1, '#0b1f55');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = 'rgba(200, 220, 255, 0.55)';
  g.lineWidth = 2;
  for (let x = 0; x <= 256; x += 32) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 128);
    g.stroke();
  }
  for (let y = 0; y <= 128; y += 32) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// A square lattice beam from a to b along x or z (like the ISS truss).
function truss(group, mat, ax, az, bx, bz, y, size = 1) {
  const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
  const len = alongX ? Math.abs(bx - ax) : Math.abs(bz - az);
  const cx = (ax + bx) / 2;
  const cz = (az + bz) / 2;
  const h = size / 2;
  for (const [dy, dw] of [[-h, -h], [-h, h], [h, -h], [h, h]]) {
    add(group, new THREE.BoxGeometry(alongX ? len : 0.12, 0.12, alongX ? 0.12 : len), mat, alongX ? cx : cx + dw, y + dy, alongX ? cz + dw : cz);
  }
  // cross braces every couple of metres
  for (let u = 0; u <= len; u += 2) {
    const px = alongX ? Math.min(ax, bx) + u : cx;
    const pz = alongX ? cz : Math.min(az, bz) + u;
    add(group, new THREE.BoxGeometry(alongX ? 0.08 : size * 1.35, 0.08, alongX ? size * 1.35 : 0.08), mat, px, y, pz, [alongX ? Math.PI / 4 : 0, 0, alongX ? 0 : Math.PI / 4]);
  }
}

export function buildExterior(ship) {
  const g = new THREE.Group();
  g.userData.exterior = true;
  ship.add(g);
  const steel = m(0x9aa3b8, { roughness: 0.35, metalness: 0.85 });
  const darkSteel = m(0x4a5370, { roughness: 0.5 });
  const white = m(0xdfe5ee, { roughness: 0.55, metalness: 0.3 });
  const gold = m(0xc9a24a, { roughness: 0.3, metalness: 0.9 }); // the gold foil you see on real satellites
  const solar = solarTexture();
  solar.repeat.set(4, 2);
  const whiteBoth = m(0xdfe5ee, { roughness: 0.55, metalness: 0.3, side: THREE.DoubleSide });
  const panelMat = new THREE.MeshStandardMaterial({ map: solar, color: 0xffffff, roughness: 0.25, metalness: 0.4, emissive: 0x0a1a44, emissiveIntensity: 0.6, side: THREE.DoubleSide });
  const Y = -0.9; // just under deck level

  // ---------- solar wings: west from the Airlock, east from Crew Quarters ----------
  const wing = (fromX, toX) => {
    const dir = Math.sign(toX - fromX);
    truss(g, steel, fromX, 0, toX, 0, Y, 1);
    // a rotary joint where the wing meets the station
    add(g, new THREE.CylinderGeometry(1.1, 1.1, 1.4, 20), gold, fromX + dir * 1.5, Y, 0, [0, 0, Math.PI / 2]);
    // two pairs of big blue panels, each pair either side of the truss
    for (const start of [6, 21]) {
      const x = fromX + dir * (start + 6.5);
      for (const side of [-1, 1]) {
        add(g, new THREE.BoxGeometry(13, 0.06, 9), panelMat, x, Y, side * 5.6, [side * 0.08, 0, 0]);
        // a mast holding the panel out from the truss
        add(g, new THREE.BoxGeometry(0.1, 0.1, 1.2), steel, x, Y, side * 0.9);
      }
    }
    return toX;
  };
  const westTip = wing(-48.5, -88);
  const eastTip = wing(52.5, 92);

  // ---------- radiators: white fins off the Cargo Bay, angled to the dark ----------
  truss(g, steel, 0, 48.6, 0, 66, Y, 0.8);
  for (const z of [54, 61]) {
    for (const side of [-1, 1]) add(g, new THREE.BoxGeometry(7, 0.08, 5), white, side * 4.4, Y - 0.2, z, [0, 0, side * 0.35]);
  }

  // ---------- comms mast and dish off the Observation Deck ----------
  truss(g, steel, 0, -34.6, 0, -47, Y, 0.6);
  add(g, new THREE.SphereGeometry(2.4, 24, 10, 0, Math.PI * 2, 0, Math.PI / 3.2), whiteBoth, 0, Y + 0.6, -48, [-1.1, 0, 0]);
  add(g, new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), steel, 0, Y + 1.4, -48.8, [0.5, 0, 0]);

  // ---------- a docked shuttle at the Reactor's west side ----------
  const shuttle = new THREE.Group();
  shuttle.position.set(-41, Y + 0.2, 24);
  shuttle.rotation.y = Math.PI / 2;
  add(shuttle, new THREE.CylinderGeometry(1.3, 1.3, 4.5, 18), white, 0, 0, 0, [Math.PI / 2, 0, 0]);
  add(shuttle, new THREE.ConeGeometry(1.3, 2.2, 18), white, 0, 0, -3.35, [-Math.PI / 2, 0, 0]);
  add(shuttle, new THREE.CylinderGeometry(0.7, 0.9, 1.2, 14), darkSteel, 0, 0, 2.8, [Math.PI / 2, 0, 0]); // docking collar
  for (const side of [-1, 1]) add(shuttle, new THREE.BoxGeometry(4.2, 0.05, 1.6), panelMat, side * 3.4, 0, 0.4);
  for (let i = 0; i < 3; i++) add(shuttle, new THREE.CircleGeometry(0.22, 12), m(0x9fe8ff, { emissive: 0x6cf0ff, emissiveIntensity: 1.5 }), 0.75 + i * -0.5, 0.7, -1.2, [-Math.PI / 2, 0, 0]);
  g.add(shuttle);

  // ---------- the hub: a big ring beneath the bridge, and a spine down to it ----------
  add(g, new THREE.TorusGeometry(15, 1.3, 14, 64), darkSteel, 0, -4.5, 0, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    add(g, new THREE.CylinderGeometry(0.35, 0.35, 15, 8), steel, Math.cos(a) * 7.5, -4.5, Math.sin(a) * 7.5, [0, -a, Math.PI / 2]);
  }
  add(g, new THREE.CylinderGeometry(2.4, 1.6, 4.5, 20), steel, 0, -3, 0);

  // ---------- navigation lights: red on the port wing, green on starboard, white strobes ----------
  const lights = [];
  const nav = (x, y, z, color, speed, offset) => {
    const mat = new THREE.MeshBasicMaterial({ color });
    const bulb = add(g, new THREE.SphereGeometry(0.35, 10, 8), mat, x, y, z);
    bulb.userData.dynamic = true;
    const halo = add(g, new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }), x, y, z);
    halo.userData.dynamic = true;
    lights.push({ bulb, halo, speed, offset });
  };
  nav(westTip, Y, 0, 0xff2030, 1.1, 0);
  nav(eastTip, Y, 0, 0x30ff60, 1.1, 0.5);
  nav(0, Y + 2.3, -48.8, 0xffffff, 0.8, 0.25);
  nav(0, Y, 66, 0xffffff, 0.8, 0.75);

  return {
    group: g,
    update(t) {
      for (const l of lights) {
        const on = ((t * l.speed + l.offset) % 1) < 0.18; // short blinks, like real aircraft and spacecraft
        l.halo.visible = on;
        l.bulb.scale.setScalar(on ? 1.3 : 0.8);
      }
    },
  };
}

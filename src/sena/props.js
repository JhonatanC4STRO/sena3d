import * as THREE from 'three';
import { frondTexture, bark, rng } from '../textures.js';
import * as ST from './textures.js';

const V3 = THREE.Vector3;
const shadowed = (o) => {
  o.traverse((m) => {
    if (m.isMesh) m.castShadow = m.receiveShadow = true;
  });
  return o;
};

const mats = {};
const M = (key, make) => (mats[key] ??= make());
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.5, metalness: o.m ?? 0, ...o.extra });

// ---------- vehículos ----------

export function car(color = 0xdddddd) {
  const g = new THREE.Group();
  const paint = std(color, { r: 0.25, m: 0.6, extra: { envMapIntensity: 1.2 } });
  const glass = M('carGlass', () => std(0x1c2228, { r: 0.08, m: 0.2, extra: { envMapIntensity: 1.5 } }));
  const tire = M('tire', () => std(0x151515, { r: 0.9 }));
  const rim = M('rim', () => std(0xb0b4b8, { r: 0.3, m: 0.9 }));
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.62, 1.78), paint);
  body.position.y = 0.62;
  const hood = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.12, 1.72), paint);
  hood.position.y = 0.97;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.52, 1.56), glass);
  cabin.position.set(-0.25, 1.28, 0);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 1.5), paint);
  roof.position.set(-0.3, 1.56, 0);
  g.add(body, hood, cabin, roof);
  for (const x of [-1.35, 1.3]) {
    for (const z of [-0.82, 0.82]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 18), tire);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.33, z);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.26, 12), rim);
      r.rotation.x = Math.PI / 2;
      r.position.copy(w.position);
      g.add(w, r);
    }
  }
  for (const z of [-0.6, 0.6]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.3), M('headlight', () => new THREE.MeshBasicMaterial({ color: 0xfff6dd })));
    l.position.set(2.06, 0.78, z);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.3), M('taillight', () => std(0xb3141b, { r: 0.4 })));
    t.position.set(-2.06, 0.82, z);
    g.add(l, t);
  }
  return shadowed(g);
}

export function van() {
  const g = new THREE.Group();
  const white = M('vanWhite', () => std(0xf2f2f2, { r: 0.35, m: 0.3 }));
  const green = M('vanGreen', () => std(0x39a900, { r: 0.4 }));
  const body = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.2, 2.1), white);
  body.position.y = 1.5;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(5.62, 0.35, 2.12), green);
  stripe.position.y = 1.2;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 1.9), M('carGlass', () => std(0x1c2228, { r: 0.08 })));
  glass.position.set(2.8, 2.0, 0);
  g.add(body, stripe, glass);
  for (const x of [-1.8, 1.8]) {
    for (const z of [-0.95, 0.95]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.28, 16), M('tire', () => std(0x151515, { r: 0.9 })));
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.4, z);
      g.add(w);
    }
  }
  return shadowed(g);
}

export function motorcycle(color = 0x111111) {
  const g = new THREE.Group();
  const tire = M('tire', () => std(0x151515, { r: 0.9 }));
  const paint = std(color, { r: 0.3, m: 0.5 });
  for (const x of [-0.7, 0.7]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 8, 18), tire);
    w.position.set(x, 0.32, 0);
    g.add(w);
  }
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.32), paint);
  tank.position.set(0.05, 0.75, 0);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.3), M('seat', () => std(0x0e0e0e, { r: 0.8 })));
  seat.position.set(-0.35, 0.9, 0);
  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8), M('chrome', () => std(0xb8bcc2, { r: 0.25, m: 0.9 })));
  fork.position.set(0.62, 0.65, 0);
  fork.rotation.z = 0.35;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 8), M('chrome', () => std(0xb8bcc2, { r: 0.25, m: 0.9 })));
  bar.rotation.x = Math.PI / 2;
  bar.position.set(0.5, 1.05, 0);
  g.add(tank, seat, fork, bar);
  g.rotation.x = 0.08; // apoyada en el gato lateral
  return shadowed(g);
}

// ---------- vegetación ----------

let _palm;
function palmMats() {
  if (_palm) return _palm;
  const fronds = frondTexture(16, 95);
  const barkTex = bark(8);
  barkTex.map.repeat.set(1 / 0.8, 1 / 1.6);
  barkTex.bump.repeat.set(1 / 0.8, 1 / 1.6);
  _palm = {
    frond: new THREE.MeshStandardMaterial({ map: fronds, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 }),
    depth: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: fronds, alphaTest: 0.45 }),
    bark: new THREE.MeshStandardMaterial({ map: barkTex.map, bumpMap: barkTex.bump, bumpScale: 3, roughness: 1 }),
  };
  return _palm;
}

// Palma de aceite / real: tronco curvo y corona de hojas
export function palm(h = 10, seed = 1) {
  const rand = rng(seed);
  const m = palmMats();
  const g = new THREE.Group();
  const lean = new V3((rand() - 0.5) * 1.5, 0, (rand() - 0.5) * 1.5);
  const pts = [0, 0.35, 0.7, 1].map((t) => new V3(lean.x * t * t, t * h, lean.z * t * t));
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.32, 8), m.bark);
  g.add(trunk);
  const fg = new THREE.PlaneGeometry(1.8, 5);
  fg.translate(0, 2.5, 0);
  const n = 14;
  for (let i = 0; i < n; i++) {
    const f = new THREE.Mesh(fg, m.frond);
    f.rotation.order = 'YXZ';
    f.rotation.y = (i / n) * Math.PI * 2 + rand() * 0.3;
    f.rotation.x = 0.7 + rand() * 0.8;
    f.position.copy(pts[3]);
    f.customDepthMaterial = m.depth;
    g.add(f);
  }
  return shadowed(g);
}

/**
 * Árboles de copa redonda (ceibas, árboles de la selva) instanciados: una sola llamada de
 * dibujo para todos los troncos y otra para todas las copas.
 * trees: [{ x, z, h, crown, wide }]
 */
export function treeField(trees, seed = 9) {
  const rand = rng(seed);
  const group = new THREE.Group();
  const blobs = [];
  const trunks = [];
  for (const t of trees) {
    const h = t.h;
    trunks.push({ x: t.x, z: t.z, h: h * 0.75, r: t.trunk ?? 0.35 + h * 0.02 });
    const crownY = h * 0.75;
    const n = t.wide ? 9 : 6;
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * t.crown * (t.wide ? 0.9 : 0.55);
      blobs.push({
        x: t.x + Math.cos(a) * d,
        y: crownY + (rand() - 0.3) * t.crown * (t.wide ? 0.25 : 0.6),
        z: t.z + Math.sin(a) * d,
        s: t.crown * (t.wide ? 0.45 : 0.6) * (0.7 + rand() * 0.5),
        flat: t.wide ? 0.55 : 0.85,
        hue: 0.22 + rand() * 0.08,
        light: 0.2 + rand() * 0.12,
      });
    }
  }
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 1, 1, 8), std(0x6b5a48, { r: 1 }), trunks.length);
  const blobMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), blobs.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  trunks.forEach((t, i) => {
    m4.compose(new V3(t.x, t.h / 2, t.z), q, new V3(t.r, t.h, t.r));
    trunkMesh.setMatrixAt(i, m4);
  });
  const color = new THREE.Color();
  blobs.forEach((b, i) => {
    q.setFromEuler(new THREE.Euler(rand(), rand(), rand()));
    m4.compose(new V3(b.x, b.y, b.z), q, new V3(b.s, b.s * b.flat, b.s));
    blobMesh.setMatrixAt(i, m4);
    blobMesh.setColorAt(i, color.setHSL(b.hue, 0.45, b.light));
  });
  for (const m of [trunkMesh, blobMesh]) {
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

// ---------- mobiliario urbano e interior ----------

export function lampPost(h = 7) {
  const g = new THREE.Group();
  const gray = M('pole', () => std(0x5d6166, { r: 0.4, m: 0.6 }));
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, h, 10), gray);
  pole.position.y = h / 2;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.06), gray);
  arm.position.set(0.5, h - 0.1, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.28), gray);
  head.position.set(1.0, h - 0.18, 0);
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.22), M('lampLens', () => new THREE.MeshBasicMaterial({ color: 0xfdf7e6 })));
  lens.rotation.x = Math.PI / 2;
  lens.position.set(1.0, h - 0.235, 0);
  g.add(pole, arm, head, lens);
  return shadowed(g);
}

// Banca metálica de 3 puestos (tándem), como las del lobby
export function tandemBench() {
  const g = new THREE.Group();
  const steel = M('chrome', () => std(0xb8bcc2, { r: 0.25, m: 0.9 }));
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.06), steel);
  beam.position.y = 0.38;
  g.add(beam);
  for (let i = 0; i < 3; i++) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.46), steel);
    seat.position.set(-0.58 + i * 0.58, 0.45, 0);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.03), steel);
    back.position.set(-0.58 + i * 0.58, 0.68, -0.24);
    back.rotation.x = -0.15;
    g.add(seat, back);
  }
  for (const x of [-0.75, 0.75]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.38, 0.5), steel);
    leg.position.set(x, 0.19, 0);
    g.add(leg);
  }
  return shadowed(g);
}

export function fireCabinet() {
  const g = new THREE.Group();
  const red = M('fireRed', () => std(0xb3141b, { r: 0.4 }));
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.2), red);
  box.position.y = 1.35;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.74), M('cabGlass', () => std(0xd8e4ea, { r: 0.05, m: 0.1, extra: { transparent: true, opacity: 0.35 } })));
  glass.position.set(0, 1.35, 0.101);
  const hose = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 20), M('hose', () => std(0xe8e0d0, { r: 0.7 })));
  hose.position.set(0, 1.35, 0.03);
  const ext = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.55, 14), red);
  ext.position.set(0.55, 0.3, 0.1);
  const extTop = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.12, 8), M('pole', () => std(0x5d6166, { r: 0.4, m: 0.6 })));
  extTop.position.set(0.55, 0.63, 0.1);
  g.add(box, glass, hose, ext, extTop);
  return shadowed(g);
}

export function vendingMachine() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.8), [
    std(0x0d4fa8),
    std(0x0d4fa8),
    std(0x0d4fa8),
    std(0x0d4fa8),
    new THREE.MeshStandardMaterial({ map: ST.vending(), emissive: 0xffffff, emissiveIntensity: 0.35, emissiveMap: ST.vending(), roughness: 0.3 }),
    std(0x0d4fa8),
  ]);
  body.position.y = 0.95;
  g.add(body);
  return shadowed(g);
}

export function guardDesk() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.6), M('deskTop', () => std(0x6b2f3a, { r: 0.5 })));
  top.position.y = 0.75;
  g.add(top);
  for (const x of [-0.55, 0.55]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.55), M('legDark', () => std(0x26262a, { r: 0.5, m: 0.4 })));
    leg.position.set(x, 0.375, 0);
    g.add(leg);
  }
  return shadowed(g);
}

export function trashBin(color = 0x2b2f36) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.75, 16), std(color, { r: 0.6 }));
  b.position.y = 0.375;
  g.add(b);
  return shadowed(g);
}

// Tope de parqueo amarillo y negro
let _stopGeo;
export function wheelStopGeometry() {
  _stopGeo ??= new THREE.BoxGeometry(0.5, 0.12, 0.18);
  return _stopGeo;
}

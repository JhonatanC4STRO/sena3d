import * as THREE from 'three';
import * as T from './textures.js';
import { planeGeo, boxGeo } from './room.js';

const V3 = THREE.Vector3;

// ---------- utilidades compartidas ----------

const cache = new Map();
const once = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
};

function retile(tex, tw, th) {
  const clone = (t) => {
    if (!t) return null;
    const c = t.clone();
    c.repeat.set(1 / tw, 1 / th);
    c.needsUpdate = true;
    return c;
  };
  return { map: clone(tex.map), bump: clone(tex.bump), emissive: clone(tex.emissive) };
}

function mat(tex, o = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: tex.map,
    bumpMap: tex.bump,
    bumpScale: o.bump ?? 2,
    roughness: o.rough ?? 0.9,
    metalness: o.metal ?? 0,
    color: o.color ?? 0xffffff,
    envMapIntensity: o.env ?? 0.25,
    side: o.side ?? THREE.FrontSide,
  });
  if (tex.emissive) {
    m.emissiveMap = tex.emissive;
    m.emissive = new THREE.Color(o.emissive ?? 0xffffff);
    m.emissiveIntensity = o.emissiveIntensity ?? 1;
  }
  return m;
}

const dotTex = () => once('dot', () => T.spriteTexture([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']], 64));
const glowTex = () => once('glow', () => T.spriteTexture([[0, 'rgba(255,220,160,0.9)'], [0.25, 'rgba(255,140,50,0.35)'], [1, 'rgba(255,100,20,0)']]));
const ironMat = () => once('iron', () => new THREE.MeshStandardMaterial({ color: 0x2a2420, metalness: 0.7, roughness: 0.5 }));

function neonMat(color, k = 3) {
  return once(`neon-${color}-${k}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false }));
}

function neon(group, a, b, color, r = 0.007) {
  const g = new THREE.CylinderGeometry(r, r, a.distanceTo(b), 6);
  const m = new THREE.Mesh(g, neonMat(color));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new V3(0, 1, 0), b.clone().sub(a).normalize());
  group.add(m);
  return m;
}

function hemi(group, sky, ground, intensity) {
  group.add(new THREE.HemisphereLight(sky, ground, intensity));
}

function pointLight(group, color, intensity, pos, shadow = false) {
  const l = new THREE.PointLight(color, intensity, 0, 2);
  l.position.copy(pos);
  if (shadow) {
    l.castShadow = true;
    l.shadow.mapSize.set(512, 512);
    l.shadow.bias = -0.003;
    l.shadow.normalBias = 0.02;
    l.shadow.camera.near = 0.03;
  }
  group.add(l);
  return l;
}

// Antorcha de pared con llama animada y luz parpadeante
function torch(group, anchor, { color = 0xffa050, intensity = 5, flameColor = 0xffffff, shadow = true }) {
  const side = Math.sign(anchor.x); // -1 pared izquierda, +1 derecha
  const inward = -side;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8), ironMat());
  arm.rotation.z = Math.PI / 2;
  arm.position.set(anchor.x + inward * 0.045, anchor.y, anchor.z);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.12, 0.07), ironMat());
  plate.position.set(anchor.x + inward * 0.008, anchor.y, anchor.z);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.022, 0.07, 12, 1, true), ironMat());
  cup.position.set(anchor.x + inward * 0.09, anchor.y + 0.03, anchor.z);
  cup.material.side = THREE.DoubleSide;
  group.add(arm, plate, cup);

  const flamePos = new V3(anchor.x + inward * 0.09, anchor.y + 0.12, anchor.z);
  const flame = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: once('flame', T.flameTexture), color: flameColor, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
  );
  flame.position.copy(flamePos);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
  glow.position.copy(flamePos);
  glow.scale.setScalar(0.55);
  group.add(flame, glow);

  const light = pointLight(group, color, intensity, flamePos.clone().add(new V3(inward * 0.06, 0, 0)), shadow);
  const seed = Math.random() * 100;
  return (t) => {
    const f = 1 + 0.12 * Math.sin(t * 11 + seed) + 0.08 * Math.sin(t * 23.7 + seed * 2) + 0.06 * (Math.random() - 0.5);
    light.intensity = intensity * f;
    flame.scale.set(0.085 * (0.95 + 0.1 * f), 0.19 * f, 1);
    glow.material.opacity = 0.45 * f;
  };
}

// Partículas flotantes (polvo, esporas, chispas)
function particles(group, room, { count = 220, color = 0xffe0b0, size = 0.012, rise = 0, opacity = 0.6, drift = 0.02 }) {
  const { hw, hh, D } = room.dims;
  const pos = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * hw * 0.95;
    pos[i * 3 + 1] = (Math.random() * 2 - 1) * hh;
    pos[i * 3 + 2] = -Math.random() * D * 0.95 - 0.02;
    seeds[i] = Math.random() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ size, map: dotTex(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  pts.frustumCulled = false;
  group.add(pts);
  return (t, dt) => {
    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      const k = i * 3;
      pos[k] += Math.sin(t * 0.4 + s) * drift * dt;
      pos[k + 2] += Math.cos(t * 0.3 + s * 1.7) * drift * dt;
      if (rise) {
        pos[k + 1] += rise * (0.5 + (s % 1)) * dt;
        if (pos[k + 1] > hh) {
          pos[k + 1] = -hh;
          pos[k] = (Math.random() * 2 - 1) * hw * 0.9;
        }
      } else {
        pos[k + 1] += Math.sin(t * 0.25 + s * 1.3) * drift * 0.6 * dt;
      }
    }
    geo.attributes.position.needsUpdate = true;
  };
}

// Superficie plana en el suelo (charca, lava)
function pool(group, room, material, rimMat) {
  const { x1, x2, z1, z2 } = room.anchors.pool;
  const y0 = room.dims.y0;
  const m = new THREE.Mesh(planeGeo(x2 - x1, z2 - z1), material);
  m.rotation.x = -Math.PI / 2;
  m.position.set((x1 + x2) / 2, y0 + 0.004, (z1 + z2) / 2);
  m.receiveShadow = true;
  group.add(m);
  if (rimMat) {
    const r = 0.05;
    const h = 0.06;
    const rim = (a, b, c, d) => {
      const b2 = new THREE.Mesh(boxGeo(b - a, h, d - c), rimMat);
      b2.position.set((a + b) / 2, y0 + h / 2, (c + d) / 2);
      b2.castShadow = b2.receiveShadow = true;
      group.add(b2);
    };
    rim(x1 - r, x2 + r, z1 - r, z1);
    rim(x1 - r, x2 + r, z2, z2 + r);
    rim(x1 - r, x1, z1, z2);
    rim(x2, x2 + r, z1, z2);
  }
  return { center: new V3((x1 + x2) / 2, y0, (z1 + z2) / 2), w: x2 - x1, d: z2 - z1 };
}

// ---------- vegetación ----------

function plant(group, pos, scale, frondMat, depthMat, n = 9) {
  const g = new THREE.Group();
  const h = 0.32 * scale;
  const geo = new THREE.PlaneGeometry(0.13 * scale, h);
  geo.translate(0, h / 2, 0);
  for (let i = 0; i < n; i++) {
    const f = new THREE.Mesh(geo, frondMat);
    f.rotation.order = 'YXZ';
    f.rotation.y = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    f.rotation.x = 0.35 + Math.random() * 0.7;
    f.castShadow = true;
    f.customDepthMaterial = depthMat;
    g.add(f);
  }
  g.position.copy(pos);
  group.add(g);
  return g;
}

function leafCloud(group, leafMat, count, placer) {
  const geo = new THREE.PlaneGeometry(0.06, 0.06);
  const inst = new THREE.InstancedMesh(geo, leafMat, count);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new V3();
  const s = new V3();
  for (let i = 0; i < count; i++) {
    placer(p, e);
    q.setFromEuler(e);
    s.setScalar(0.6 + Math.random() * 0.9);
    m4.compose(p, q, s);
    inst.setMatrixAt(i, m4);
  }
  inst.castShadow = true;
  group.add(inst);
  return inst;
}

function tube(group, points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, points.length * 8), radius, 6), material);
  m.castShadow = m.receiveShadow = true;
  group.add(m);
  return { mesh: m, curve };
}

// ---------- temas ----------

function egyptMaterials() {
  const frieze = T.egyptFrieze(4);
  return {
    wall: mat(T.sandstoneWall(1), { bump: 3 }),
    floor: mat(T.sandFloor(2), { bump: 2 }),
    ceil: mat(T.sandstoneSmooth(31, [34, 30, 50]), { bump: 2 }),
    stone: mat(T.sandstoneSmooth(3), { bump: 2 }),
    trim: mat(T.goldMetal(5), { metal: 0.85, rough: 0.32, bump: 0.6, env: 1.1 }),
    frieze: mat(frieze, { bump: 4 }),
    plaque: mat(retile(T.egyptFrieze(9), 0.55, 0.3), { bump: 4 }),
  };
}

function egyptExtras(room) {
  const group = new THREE.Group();
  const ups = [];
  hemi(group, 0xffe2b8, 0x5a4020, 0.7);
  pointLight(group, 0xffd7a0, 2.5, new V3(0, 0.55, -0.5));
  ups.push(torch(group, room.anchors.torchL, { color: 0xffa860, intensity: 5 }));
  ups.push(torch(group, room.anchors.torchR, { color: 0xffa860, intensity: 5 }));
  ups.push(particles(group, room, { color: 0xffd9a0, count: 260, opacity: 0.5 }));
  return { group, update: (t, dt) => ups.forEach((u) => u(t, dt)) };
}

function jungleMaterials() {
  return {
    wall: mat(T.mossyStone(6), { bump: 3 }),
    floor: mat(T.mossyStone(61, { rows: 3, cols: 3, base: [80, 8, 34], moss: 1.2, tile: 1.5 }), { bump: 3 }),
    ceil: mat(T.mossyStone(62, { base: [90, 6, 24] }), { bump: 2 }),
    stone: mat(T.mossyStone(63, { rows: 3, cols: 2, tile: 0.9 }), { bump: 3 }),
    trim: mat(T.mossyStone(64, { rows: 6, cols: 4, base: [70, 10, 48], tile: 0.6 }), { bump: 2 }),
    frieze: mat(T.mossyFrieze(7), { bump: 4 }),
    plaque: mat(retile(T.mossyFrieze(71), 0.6, 0.3), { bump: 4 }),
  };
}

function jungleExtras(room) {
  const group = new THREE.Group();
  const ups = [];
  const { hw, hh, D, y0 } = room.dims;
  const { X, Z } = room;

  hemi(group, 0xd8f0c0, 0x2a3a1a, 1.0);
  const sun = new THREE.DirectionalLight(0xfff0c8, 3.2);
  sun.position.set(-0.4, hh + 3, -D * 0.4);
  sun.target.position.set(0.2, y0, -D * 0.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -hw - 0.5, right: hw + 0.5, top: D, bottom: -D, near: 0.5, far: 10 });
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.02;
  group.add(sun, sun.target);

  // aberturas de luz en el techo y haces volumétricos
  const holeMat = neonMat('#fff6d8', 2.2);
  const shaftMat = new THREE.MeshBasicMaterial({
    map: once('shaft', T.shaftTexture),
    color: 0xfff0c0,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 5; i++) {
    const x = X(0.12 + i * 0.19 + (Math.random() - 0.5) * 0.05);
    const z = -D * (0.25 + Math.random() * 0.5);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.18), holeMat);
    hole.rotation.x = Math.PI / 2;
    hole.position.set(x, hh - 0.003, z);
    group.add(hole);
    for (const ry of [0, Math.PI / 2]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.3, hh * 2), shaftMat);
      s.position.set(x + 0.08, 0, z);
      s.rotation.set(0, ry, -0.08);
      group.add(s);
    }
  }

  // raíces sobre la pared del fondo y laterales
  const barkMat = mat(once('bark', () => T.bark(8)), { bump: 3, rough: 1 });
  for (let i = 0; i < 7; i++) {
    let x = X(0.06 + Math.random() * 0.88);
    let y = hh;
    const pts = [new V3(x, y + 0.05, -D + 0.03)];
    const n = 5 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      x += (Math.random() - 0.5) * 0.35;
      y -= 0.15 + Math.random() * 0.2;
      pts.push(new V3(x, y, -D + 0.03 + Math.random() * 0.03));
    }
    tube(group, pts, 0.014 + Math.random() * 0.025, barkMat);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      let z = -D + 0.1 + Math.random() * D * 0.5;
      let y = hh;
      const pts = [new V3(side * (hw - 0.025), y + 0.05, z)];
      for (let k = 0; k < 5; k++) {
        z += (Math.random() - 0.4) * 0.3;
        y -= 0.2 + Math.random() * 0.2;
        pts.push(new V3(side * (hw - 0.025 - Math.random() * 0.02), y, z));
      }
      tube(group, pts, 0.012 + Math.random() * 0.02, barkMat);
    }
  }

  // hiedra en las partes altas de las paredes y lianas colgantes
  const leafMat = new THREE.MeshStandardMaterial({ map: once('leaf', () => T.leafTexture(100)), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
  leafCloud(group, leafMat, 700, (p, e) => {
    const r = Math.random();
    const y = hh - Math.pow(Math.random(), 1.8) * hh * 1.3;
    if (r < 0.5) {
      p.set((Math.random() * 2 - 1) * hw, y, -D + 0.012);
      e.set(0, 0, Math.random() * Math.PI * 2);
    } else {
      const side = r < 0.75 ? -1 : 1;
      p.set(side * (hw - 0.012), y, -Math.random() * D);
      e.set(0, Math.PI / 2, Math.random() * Math.PI * 2);
    }
  });
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x3d4a22, roughness: 0.9 });
  const vines = [];
  for (let i = 0; i < 14; i++) {
    const v = new THREE.Group();
    const x = (Math.random() * 2 - 1) * hw * 0.92;
    const z = -D * (0.08 + Math.random() * 0.85);
    const len = 0.25 + Math.random() * 0.9;
    v.position.set(x, hh, z);
    const pts = [];
    for (let k = 0; k <= 5; k++) pts.push(new V3(Math.sin(k * 1.3 + i) * 0.03, -(k / 5) * len, Math.cos(k + i) * 0.02));
    const { curve } = tube(v, pts, 0.005, vineMat);
    leafCloud(v, leafMat, 22, (p, e) => {
      p.copy(curve.getPoint(Math.random()));
      e.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    });
    group.add(v);
    vines.push({ v, phase: Math.random() * 6 });
  }
  ups.push((t) => vines.forEach(({ v, phase }) => (v.rotation.z = Math.sin(t * 0.8 + phase) * 0.04)));

  // helechos
  const frondTex = once('frond', () => T.frondTexture(16));
  const frondMat = new THREE.MeshStandardMaterial({ map: frondTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
  const frondDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: frondTex, alphaTest: 0.45 });
  const spots = [
    [X(0.04), y0, Z(0.1), 1.4],
    [X(0.97), y0, Z(0.08), 1.5],
    [X(0.55), y0, Z(0.08), 0.9],
    [X(0.66), y0, Z(0.42), 1.0],
    [X(0.33), y0 + 0.28, Z(0.42), 0.9],
    [X(0.96), y0 + 0.64, Z(0.52), 1.0],
    [X(0.4), y0 + 0.3, -D + 0.12, 0.8],
    [X(0.24), y0 + 0.14, Z(0.24), 0.8],
  ];
  for (const [x, y, z, s] of spots) plant(group, new V3(x, y, z), s, frondMat, frondDepth);

  ups.push(particles(group, room, { color: 0xeaffd0, count: 220, opacity: 0.55, size: 0.01 }));
  return { group, update: (t, dt) => ups.forEach((u) => u(t, dt)) };
}

function cyberMaterials() {
  const trim = new THREE.MeshStandardMaterial({ color: 0x14081a, emissive: 0xff2bd6, emissiveIntensity: 1.4, roughness: 0.4, metalness: 0.3 });
  return {
    wall: mat(T.metalPanels(9), { bump: 1.5, rough: 0.55, metal: 0.5, env: 0.6, emissiveIntensity: 2 }),
    floor: mat(T.gridFloor(10), { bump: 1, rough: 0.22, metal: 0.6, env: 1.2, emissiveIntensity: 1.5 }),
    ceil: mat(T.metalPanels(91, { lights: false }), { bump: 1.5, rough: 0.6, metal: 0.5, env: 0.5 }),
    stone: mat(T.metalPanels(92, { base: [230, 15, 16], tile: 0.7 }), { bump: 1.5, rough: 0.45, metal: 0.55, env: 0.7, emissiveIntensity: 2 }),
    trim,
    frieze: mat(T.ledBand(11), { rough: 0.5, emissiveIntensity: 1.6 }),
    plaque: mat(retile(T.ledBand(12), 0.5, 0.25), { rough: 0.5, emissiveIntensity: 1.6 }),
  };
}

function cyberExtras(room, mats) {
  const group = new THREE.Group();
  const ups = [];
  const { hw, hh, D, y0 } = room.dims;
  const { X, Z } = room;
  hemi(group, 0x4060ff, 0x100020, 0.25);
  pointLight(group, 0x00e5ff, 4, new V3(X(0.15), y0 + 0.35, Z(0.5)), true);
  pointLight(group, 0xff2bd6, 4, new V3(X(0.85), y0 + 0.9, Z(0.65)));
  pointLight(group, 0x9a4dff, 2.5, new V3(room.anchors.decor.x, 0.1, -D + 0.35));

  const colors = ['#00e5ff', '#ff2bd6'];
  room.ledges.forEach((l, i) => {
    neon(group, new V3(l.x1 + 0.01, l.y + 0.004, l.z + 0.006), new V3(l.x2 - 0.01, l.y + 0.004, l.z + 0.006), colors[i % 2]);
  });
  for (const sx of [-1, 1]) {
    const c = sx < 0 ? colors[0] : colors[1];
    neon(group, new V3(sx * (hw - 0.01), y0, -D + 0.01), new V3(sx * (hw - 0.01), hh, -D + 0.01), c);
    neon(group, new V3(sx * (hw - 0.01), hh - 0.01, -D), new V3(sx * (hw - 0.01), hh - 0.01, -0.01), c);
    neon(group, new V3(sx * (hw - 0.01), y0 + 0.01, -D), new V3(sx * (hw - 0.01), y0 + 0.01, -0.01), c, 0.005);
  }
  // barras horizontales tipo "ojos" dentro de los triángulos
  const d = room.anchors.decor;
  for (const dx of [-0.17, 0.17]) neon(group, new V3(d.x + dx - 0.09, d.y + 0.22, d.z + 0.03), new V3(d.x + dx + 0.09, d.y + 0.22, d.z + 0.03), '#c060ff', 0.012);

  // cables colgando del techo
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.4, metalness: 0.5 });
  for (let i = 0; i < 7; i++) {
    const xa = (Math.random() * 2 - 1) * hw * 0.9;
    const xb = xa + (Math.random() - 0.5) * 1.2;
    const z = -D * (0.15 + Math.random() * 0.8);
    const sag = 0.15 + Math.random() * 0.4;
    tube(group, [new V3(xa, hh, z), new V3((xa + xb) / 2, hh - sag, z + 0.05), new V3(xb, hh, z + 0.1)], 0.008, cableMat);
  }

  const scroll = [mats.frieze.map, mats.frieze.emissiveMap];
  ups.push((t, dt) => scroll.forEach((tx) => (tx.offset.x += dt * 0.06)));
  ups.push((t) => (mats.trim.emissiveIntensity = 1.3 + 0.3 * Math.sin(t * 2.2)));
  ups.push(particles(group, room, { color: 0x80f0ff, count: 160, opacity: 0.4, size: 0.008 }));
  return { group, update: (t, dt) => ups.forEach((u) => u(t, dt)) };
}

function dungeonMaterials() {
  return {
    wall: mat(T.dungeonStone(12), { bump: 4 }),
    floor: mat(T.dungeonStone(121, { rows: 5, cols: 5, tile: 1.1, base: [28, 10, 26] }), { bump: 4 }),
    ceil: mat(T.dungeonStone(122, { base: [220, 6, 18] }), { bump: 3 }),
    stone: mat(T.dungeonStone(123, { tile: 0.9, base: [210, 8, 32] }), { bump: 4 }),
    trim: mat(T.goldMetal(124, [205, 8, 26]), { metal: 0.7, rough: 0.5, env: 0.6 }),
    frieze: mat(T.stoneFrieze(13), { bump: 4 }),
    plaque: mat(retile(T.stoneFrieze(131), 0.55, 0.3), { bump: 4 }),
  };
}

function crystals(group, pos, scale, material) {
  const geo = once('octa', () => new THREE.OctahedronGeometry(1, 0));
  const n = 4 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, material);
    const s = scale * (0.6 + Math.random() * 0.8);
    m.scale.set(0.028 * s, 0.11 * s, 0.028 * s);
    m.position.set(pos.x + (Math.random() - 0.5) * 0.1 * scale, pos.y + 0.05 * s, pos.z + (Math.random() - 0.5) * 0.08 * scale);
    m.rotation.set((Math.random() - 0.5) * 0.9, Math.random() * 3, (Math.random() - 0.5) * 0.9);
    group.add(m);
  }
}

function dungeonExtras(room, mats) {
  const group = new THREE.Group();
  const ups = [];
  const { D, y0 } = room.dims;
  const { X, Z } = room;
  hemi(group, 0x6080a0, 0x201810, 0.45);
  ups.push(torch(group, room.anchors.torchL, { color: 0xff8a3a, intensity: 4.5 }));
  ups.push(torch(group, room.anchors.torchR, { color: 0xff8a3a, intensity: 4.5 }));

  const ca = once('caustics', () => T.caustics(15));
  const water = new THREE.MeshStandardMaterial({ map: ca.map, emissiveMap: ca.emissive, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.08, metalness: 0.2, envMapIntensity: 1 });
  const p = pool(group, room, water, mats.stone);
  const poolLight = pointLight(group, 0x30e0ff, 2.5, p.center.clone().add(new V3(0, 0.25, 0)));
  ups.push((t) => {
    ca.emissive.offset.set(t * 0.02, t * 0.013);
    ca.map.offset.set(-t * 0.015, t * 0.01);
    poolLight.intensity = 2.5 + 0.3 * Math.sin(t * 1.7);
  });

  const crystalMat = new THREE.MeshStandardMaterial({ color: 0x60f0ff, emissive: 0x20d0ff, emissiveIntensity: 2.2, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 });
  const spots = [
    [p.center.x - p.w / 2 - 0.05, y0 + 0.14, p.center.z - p.d / 2 - 0.08, 1.2],
    [X(0.95), y0 + 0.64, Z(0.55), 1.3],
    [X(0.06), y0, Z(0.05), 1.0],
    [X(0.97), y0, Z(0.1), 1.1],
    [X(0.4), y0 + 0.3, -D + 0.15, 0.8],
    [X(0.3), y0 + 0.28, Z(0.45), 0.7],
  ];
  for (const [x, y, z, s] of spots) crystals(group, new V3(x, y, z), s, crystalMat);
  pointLight(group, 0x40e8ff, 1.2, new V3(X(0.95), y0 + 0.85, Z(0.55)));
  ups.push((t) => (crystalMat.emissiveIntensity = 2 + 0.5 * Math.sin(t * 1.3)));
  ups.push(particles(group, room, { color: 0x9fe8ff, count: 200, opacity: 0.45, size: 0.01 }));
  return { group, update: (t, dt) => ups.forEach((u) => u(t, dt)) };
}

function volcanoMaterials() {
  const floor = mat(T.lavaFloor(14), { bump: 3, emissive: 0xffffff, emissiveIntensity: 1.4 });
  return {
    wall: mat(T.dungeonStone(140, { base: [10, 38, 30], tile: 1.4, rows: 3, cols: 2 }), { bump: 4 }),
    floor,
    ceil: mat(T.dungeonStone(141, { base: [8, 30, 14] }), { bump: 3 }),
    stone: mat(T.sandstoneSmooth(142, [8, 38, 30]), { bump: 3 }),
    trim: mat(T.goldMetal(143, [260, 10, 10]), { metal: 0.4, rough: 0.25, env: 1 }),
    frieze: mat(T.stoneFrieze(144, [8, 35, 24]), { bump: 4 }),
    plaque: mat(retile(T.stoneFrieze(145, [8, 35, 24]), 0.55, 0.3), { bump: 4 }),
  };
}

function volcanoExtras(room, mats) {
  const group = new THREE.Group();
  const ups = [];
  hemi(group, 0xff9070, 0x200805, 0.45);
  ups.push(torch(group, room.anchors.torchL, { color: 0xff7030, intensity: 3.5 }));
  ups.push(torch(group, room.anchors.torchR, { color: 0xff7030, intensity: 3.5 }));

  const lt = once('lava', () => retile(T.lavaFloor(146), 0.7, 0.7));
  const lava = new THREE.MeshStandardMaterial({ map: lt.map, emissiveMap: lt.emissive, emissive: 0xffffff, emissiveIntensity: 3, roughness: 0.6 });
  const p = pool(group, room, lava, mats.stone);
  const glow = pointLight(group, 0xff5a1a, 5, p.center.clone().add(new V3(0, 0.2, 0)));
  ups.push((t) => {
    lt.emissive.offset.set(t * 0.01, t * 0.006);
    lt.map.offset.set(t * 0.01, t * 0.006);
    glow.intensity = 5 + 1.2 * Math.sin(t * 1.4) + 0.4 * Math.sin(t * 5.1);
    mats.floor.emissiveIntensity = 1.2 + 0.4 * Math.sin(t * 1.1);
  });
  ups.push(particles(group, room, { color: 0xff7a2a, count: 160, opacity: 0.9, size: 0.016, rise: 0.12, drift: 0.05 }));
  return { group, update: (t, dt) => ups.forEach((u) => u(t, dt)) };
}

export const THEMES = [
  { id: 'egipto', name: 'Tumba egipcia', materials: egyptMaterials, extras: egyptExtras, env: { exposure: 0.95, bloom: [0.35, 0.5, 0.85] } },
  { id: 'jungla', name: 'Templo en la jungla', materials: jungleMaterials, extras: jungleExtras, env: { exposure: 1.0, bloom: [0.45, 0.6, 0.8] } },
  { id: 'cyber', name: 'Neón cyberpunk', materials: cyberMaterials, extras: cyberExtras, env: { exposure: 1.0, bloom: [0.55, 0.4, 0.8] } },
  { id: 'mazmorra', name: 'Mazmorra de cristal', materials: dungeonMaterials, extras: dungeonExtras, env: { exposure: 1.1, bloom: [0.75, 0.5, 0.7] } },
  { id: 'volcan', name: 'Templo volcánico', materials: volcanoMaterials, extras: volcanoExtras, env: { exposure: 1.0, bloom: [0.8, 0.55, 0.7] } },
];

export function getMaterials(theme) {
  return once(`mats-${theme.id}`, theme.materials);
}

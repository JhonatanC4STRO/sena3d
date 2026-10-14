import * as THREE from 'three';
import * as T from '../textures.js';
import { boxGeo, planeGeo } from '../room.js';

// Unidades en metros. La entrada mira hacia +z; el santuario queda al fondo (z negativo).
export const FLOOR = 0.4; // altura de la plataforma del templo
const PLATFORM = { x1: -26, x2: 26, z1: -74, z2: 10 };

function mat(tex, o = {}) {
  return new THREE.MeshStandardMaterial({
    map: tex.map,
    bumpMap: tex.bump,
    bumpScale: o.bump ?? 2,
    roughness: o.rough ?? 0.92,
    metalness: o.metal ?? 0,
    color: o.color ?? 0xffffff,
    envMapIntensity: o.env ?? 0.45,
  });
}

function materials() {
  return {
    wall: mat(T.scaleTex(T.sandstoneWall(1), 4.5), { bump: 2.5 }),
    stone: mat(T.scaleTex(T.sandstoneSmooth(3), 2.5), { bump: 2 }),
    paving: mat(T.scaleTex(T.sandFloor(2), 3.5), { bump: 2 }),
    cornice: mat(T.scaleTex(T.egyptFrieze(4), 6, 1.1), { bump: 3 }),
    frieze: mat(T.scaleTex(T.egyptFrieze(9), 5, 0.9), { bump: 3 }),
    reliefL: mat(T.pylonRelief(20, 1), { bump: 3 }),
    reliefR: mat(T.pylonRelief(25, -1), { bump: 3 }),
    column: mat(T.columnTex(21), { bump: 2.5 }),
    stars: mat(T.scaleTex(T.starCeiling(22), 4), { bump: 1, rough: 0.8 }),
    obelisk: mat(T.obeliskTex(23), { bump: 3, rough: 0.6 }),
    sand: mat(T.scaleTex(T.sandGround(24), 6), { bump: 3, env: 0.35 }),
    statue: mat(T.scaleTex(T.sandstoneSmooth(31, [34, 38, 58]), 1.5), { bump: 1.5 }),
    gold: mat(T.scaleTex(T.goldMetal(5), 1), { metal: 0.9, rough: 0.3, env: 1.2 }),
    granite: mat(T.scaleTex(T.dungeonStone(12, { base: [220, 8, 22] }), 2), { bump: 2, rough: 0.5 }),
    red: new THREE.MeshStandardMaterial({ color: 0x9b2a1e, roughness: 0.8 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1a120a, roughness: 1 }),
    bark: mat(T.scaleTex(T.bark(8), 0.8, 1.6), { bump: 3, rough: 1 }),
  };
}

// ---------- geometrías especiales ----------

// Caja con las caras superiores estrechadas (muros en talud de los pilonos y obeliscos)
// uv01: caras que conservan UV 0..1 (orden px, nx, py, ny, pz, nz); el resto usa metros
function taperedBox(w, h, d, topW, topD, uv01 = []) {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    if (uv01.includes(f)) continue;
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]);
    }
  }
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) pos.setXYZ(i, pos.getX(i) * (topW / w), pos.getY(i), pos.getZ(i) * (topD / d));
  }
  g.computeVertexNormals();
  return g;
}

const ABACUS = 0.35;
const colTop = (c) => FLOOR + 0.96 * c.h + ABACUS; // altura donde apoya el arquitrabe

function columnGeo(r, h, open) {
  const P = (x, y) => new THREE.Vector2(x * r, y * h);
  const pts = [
    P(0, 0), P(1.3, 0), P(1.3, 0.035), P(0.95, 0.04), P(1.08, 0.1), P(1.0, 0.28), P(0.9, 0.7), P(0.88, 0.74),
    ...(open
      ? [P(1.0, 0.78), P(1.45, 0.86), P(1.75, 0.93), P(1.8, 0.96)]
      : [P(1.05, 0.79), P(1.18, 0.86), P(1.0, 0.93), P(0.85, 0.96)]),
    P(0.8, 0.96), P(0, 0.96),
  ];
  const g = new THREE.LatheGeometry(pts, 28);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setY(i, pos.getY(i) / h);
  return g;
}

// ---------- construcción ----------

export function buildTemple() {
  const group = new THREE.Group();
  const colliders = [];
  const updaters = [];
  const M = materials();
  const F = FLOOR;

  const addMesh = (geo, material, x, y, z, { cast = true } = {}) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // Caja por extremos. Se convierte en obstáculo si corta la altura de una persona.
  const box = (x1, x2, y1, y2, z1, z2, material, { collide = true, cast = true } = {}) => {
    const m = addMesh(boxGeo(x2 - x1, y2 - y1, z2 - z1), material, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, { cast });
    if (collide && y1 < F + 1.8 && y2 > F + 0.25) colliders.push({ x1, x2, z1, z2 });
    return m;
  };
  const circle = (x, z, r) => colliders.push({ x, z, r });

  // Muros con vanos (puertas) y cornisa con friso
  const cornice = (x1, x2, y, z1, z2) => box(x1 - 0.3, x2 + 0.3, y, y + 0.7, z1 - 0.3, z2 + 0.3, M.cornice, { collide: false });
  function wallX(x1, x2, z, t, h, material, doors = [], top = true) {
    let cur = x1;
    for (const d of [...doors].sort((a, b) => a.x - b.x)) {
      box(cur, d.x - d.w / 2, F, F + h, z - t / 2, z + t / 2, material);
      box(d.x - d.w / 2, d.x + d.w / 2, F + d.h, F + h, z - t / 2, z + t / 2, material, { collide: false });
      cur = d.x + d.w / 2;
    }
    box(cur, x2, F, F + h, z - t / 2, z + t / 2, material);
    if (top) cornice(x1, x2, F + h, z - t / 2, z + t / 2);
  }
  function wallZ(z1, z2, x, t, h, material, doors = [], top = true) {
    let cur = z1;
    for (const d of [...doors].sort((a, b) => a.z - b.z)) {
      box(x - t / 2, x + t / 2, F, F + h, cur, d.z - d.w / 2, material);
      box(x - t / 2, x + t / 2, F + d.h, F + h, d.z - d.w / 2, d.z + d.w / 2, material, { collide: false });
      cur = d.z + d.w / 2;
    }
    box(x - t / 2, x + t / 2, F, F + h, cur, z2, material);
    if (top) cornice(x - t / 2, x + t / 2, F + h, z1, z2);
  }

  // --- suelo del desierto con dunas lejanas ---
  const ground = new THREE.PlaneGeometry(1600, 1600, 160, 160);
  ground.rotateX(-Math.PI / 2);
  const gp = ground.attributes.position;
  const guv = ground.attributes.uv;
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i);
    const z = gp.getZ(i);
    const d = Math.hypot(x, z + 30);
    const k = THREE.MathUtils.smoothstep(d, 140, 320);
    const dune = (Math.sin(x * 0.018) * Math.cos(z * 0.013) + 0.6 * Math.sin((x + z) * 0.031) + 0.35 * Math.sin(x * 0.07 - z * 0.05)) * 9 + 8;
    gp.setY(i, k * dune);
    guv.setXY(i, x, z);
  }
  ground.computeVertexNormals();
  addMesh(ground, M.sand, 0, 0, 0, { cast: false });

  // --- plataforma y escalinata ---
  box(PLATFORM.x1, PLATFORM.x2, 0, F, PLATFORM.z1, PLATFORM.z2, M.paving, { collide: false });
  box(-6, 6, 0, F * 0.66, PLATFORM.z2, PLATFORM.z2 + 0.6, M.stone, { collide: false });
  box(-6, 6, 0, F * 0.33, PLATFORM.z2 + 0.6, PLATFORM.z2 + 1.2, M.stone, { collide: false });

  // --- pilonos ---
  const pylonH = 20;
  for (const [x1, x2, relief] of [[-20, -3.2, M.reliefL], [3.2, 20, M.reliefR]]) {
    const w = x2 - x1;
    const d = 6.5;
    const geo = taperedBox(w, pylonH, d, w - 2.6, d - 1.6, [4]);
    const mats = [M.wall, M.wall, M.stone, M.stone, relief, M.wall];
    addMesh(geo, mats, (x1 + x2) / 2, F + pylonH / 2, -3.25);
    colliders.push({ x1, x2, z1: -6.5, z2: 0 });
    box(x1 + 1.0, x2 - 1.0, F + pylonH, F + pylonH + 1.1, -5.7, -0.8, M.cornice, { collide: false });
  }
  // portada central entre los pilonos
  box(-3.2, -2.2, F, F + 13, -5.5, -1, M.wall);
  box(2.2, 3.2, F, F + 13, -5.5, -1, M.wall);
  box(-3.2, 3.2, F + 8.5, F + 13, -5.5, -1, M.frieze, { collide: false });
  cornice(-3.2, 3.2, F + 13, -5.5, -1);

  // --- colosos sentados y obeliscos ---
  for (const sx of [-1, 1]) colossus(sx * 6.8, 4.2);
  for (const sx of [-1, 1]) obelisk(sx * 11.5, 6.5);

  function colossus(x, z) {
    const g = new THREE.Group();
    const S = M.statue;
    const b = (x1, x2, y1, y2, z1, z2, material = S) => {
      const m = new THREE.Mesh(boxGeo(x2 - x1, y2 - y1, z2 - z1), material);
      m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    b(-1.6, 1.6, 0, 1.5, -2.3, 2.2, M.frieze); // pedestal
    const y = 1.5;
    b(-1.4, 1.4, y, y + 2.3, -2.1, 0.7); // asiento
    b(-1.4, 1.4, y, y + 4.3, -2.1, -1.3); // respaldo
    for (const s of [-1, 1]) {
      b(s * 0.15, s * 0.9, y, y + 2.3, 0.7, 1.5); // espinillas
      b(s * 0.1, s * 0.95, y, y + 0.3, 1.5, 2.0); // pies
      b(s * 0.12, s * 0.92, y + 2.3, y + 2.85, -1.2, 1.5); // muslos
      b(s * 0.3, s * 0.85, y + 2.85, y + 3.1, -0.6, 1.3); // antebrazos
      b(s * 0.85, s * 1.2, y + 3.0, y + 4.6, -1.0, -0.4); // brazos
    }
    const torso = new THREE.Mesh(taperedBox(1.4, 1.9, 0.95, 2.2, 0.95), S); // estrecho abajo, ancho arriba
    torso.position.set(0, y + 3.8, -0.75);
    torso.castShadow = true;
    g.add(torso);
    b(-0.28, 0.28, y + 4.7, y + 5.0, -0.95, -0.45); // cuello
    b(-0.42, 0.42, y + 5.0, y + 5.95, -1.1, -0.3); // cabeza
    b(-0.12, 0.12, y + 4.6, y + 5.05, -0.35, -0.2); // barba
    const nemes = new THREE.Mesh(taperedBox(1.5, 1.6, 1.0, 0.95, 0.9), S);
    nemes.position.set(0, y + 5.15, -0.95);
    nemes.castShadow = true;
    g.add(nemes);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.45, 1.1, 16), S);
    crown.position.set(0, y + 6.45, -0.75);
    crown.castShadow = true;
    g.add(crown);
    g.position.set(x, F, z);
    group.add(g);
    colliders.push({ x1: x - 1.6, x2: x + 1.6, z1: z - 2.3, z2: z + 2.2 });
  }

  function obelisk(x, z) {
    box(x - 1.6, x + 1.6, F, F + 1.2, z - 1.6, z + 1.6, M.stone);
    const h = 18;
    const geo = taperedBox(1.8, h, 1.8, 1.15, 1.15, [0, 1, 4, 5]);
    addMesh(geo, M.obelisk, x, F + 1.2 + h / 2, z);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.82, 1.4, 4), M.gold);
    tip.rotation.y = Math.PI / 4;
    tip.position.set(x, F + 1.2 + h + 0.7, z);
    tip.castShadow = true;
    group.add(tip);
  }

  // --- patio interior con pórticos laterales ---
  const courtH = 9;
  wallZ(-36, -6.5, -18, 1.5, courtH, M.wall);
  wallZ(-36, -6.5, 18, 1.5, courtH, M.wall);
  // ventanas con celosía roja en el exterior de los muros (como en la ilustración)
  for (const sx of [-1, 1]) {
    for (const wz of [-14, -27]) {
      const x = sx * 18.8;
      box(x - 0.08, x + 0.08, F + 3, F + 5.4, wz - 1.1, wz + 1.1, M.red, { collide: false });
      box(x - 0.1, x + 0.1, F + 3.2, F + 5.2, wz - 0.9, wz + 0.9, M.dark, { collide: false });
    }
  }

  const columnGroups = []; // { geo, material, list: [x, z] }
  const smallCol = { r: 0.7, h: 6.8, open: false, list: [] };
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 7; i++) smallCol.list.push([sx * 13.2, -9.6 - i * 3.6]);
    const top = colTop(smallCol);
    box(sx * 13.2 - 0.75, sx * 13.2 + 0.75, top, top + 0.6, -36, -7.6, M.frieze, { collide: false });
    const [ra, rb] = sx < 0 ? [-17.3, -12.4] : [12.4, 17.3];
    box(ra, rb, top + 0.6, top + 1.2, -36, -7.6, M.stone, { collide: false });
    // techo pintado del pórtico (cara inferior)
    const ceil = addMesh(planeGeo(rb - ra, 28.4), M.stars, (ra + rb) / 2, top + 0.59, -21.8, { cast: false });
    ceil.rotation.x = Math.PI / 2;
  }
  columnGroups.push(smallCol);

  // --- sala hipóstila (nave central alta + naves laterales) ---
  const zs = [-39.2, -42.6, -46, -49.4, -52.8];
  const nave = { r: 1.0, h: 11, open: true, list: [] };
  const aisle = { r: 0.75, h: 7.3, open: false, list: [] };
  for (const z of zs) {
    for (const sx of [-1, 1]) {
      nave.list.push([sx * 3.1, z]);
      for (const ax of [6.4, 10.2, 14]) aisle.list.push([sx * ax, z]);
    }
  }
  columnGroups.push(nave, aisle);

  const hallLow = 9.2;
  const hallHigh = 13.4;
  wallZ(-56, -36, -18, 1.5, hallLow, M.wall);
  wallZ(-56, -36, 18, 1.5, hallLow, M.wall);
  // fachada y muro trasero: parte baja de lado a lado + parte alta de la nave central
  wallX(-18.75, 18.75, -36.4, 1.5, hallLow, M.wall, [{ x: 0, w: 5, h: 8.2 }], false);
  box(-6.6, 6.6, F + hallLow, F + hallHigh, -37.15, -35.65, M.wall, { collide: false });
  cornice(-18.75, -6.6, F + hallLow, -37.15, -35.65);
  cornice(6.6, 18.75, F + hallLow, -37.15, -35.65);
  cornice(-6.6, 6.6, F + hallHigh, -37.15, -35.65);
  box(-2.5, 2.5, F + 8.2, F + 9.2, -35.6, -35.3, M.frieze, { collide: false });
  wallX(-18.75, 18.75, -55.6, 1.5, hallLow, M.wall, [{ x: 0, w: 3, h: 5 }], false);
  box(-6.6, 6.6, F + hallLow, F + hallHigh, -56.35, -54.85, M.wall, { collide: false });

  // arquitrabes sobre las filas de columnas
  const archT = (x, top, w) => box(x - w, x + w, top, top + 0.8, -55, -37, M.frieze, { collide: false });
  for (const sx of [-1, 1]) {
    archT(sx * 3.1, colTop(nave), 1.0);
    for (const ax of [6.4, 10.2, 14]) archT(sx * ax, colTop(aisle), 0.8);
  }
  // techos: naves laterales bajas, nave central alta y claristorio con celosías
  const aisleTop = colTop(aisle) + 0.8;
  const naveTop = colTop(nave) + 0.8;
  for (const sx of [-1, 1]) {
    const [a, b] = sx < 0 ? [-17.25, -6.0] : [6.0, 17.25];
    box(a, b, aisleTop, aisleTop + 0.8, -55, -37, M.stone, { collide: false });
    const c = addMesh(planeGeo(b - a, 18), M.stars, (a + b) / 2, aisleTop - 0.01, -46, { cast: false });
    c.rotation.x = Math.PI / 2;
    // celosía del claristorio: deja pasar haces de luz
    for (let z = -54.6; z < -37.2; z += 1.1) box(sx * 6.4 - 0.25, sx * 6.4 + 0.25, aisleTop + 0.8, naveTop, z, z + 0.45, M.stone, { collide: false });
  }
  box(-6.9, 6.9, naveTop, naveTop + 0.8, -55, -37, M.stone, { collide: false });
  const nc = addMesh(planeGeo(13.8, 18), M.stars, 0, naveTop - 0.01, -46, { cast: false });
  nc.rotation.x = Math.PI / 2;

  // --- cámara del dios (santuario) ---
  const sanctH = 8;
  wallZ(-68.5, -55.6, -18, 1.5, sanctH, M.wall);
  wallZ(-68.5, -55.6, 18, 1.5, sanctH, M.wall);
  wallX(-18.75, 18.75, -68, 1.5, sanctH, M.wall);
  box(-17.25, -6, F, F + sanctH, -67.25, -56.35, M.wall); // macizos laterales
  box(6, 17.25, F, F + sanctH, -67.25, -56.35, M.wall);
  box(-6, 6, F + sanctH - 0.8, F + sanctH, -67.25, -56.35, M.stone, { collide: false });
  const sc = addMesh(planeGeo(12, 10.9), M.stars, 0, F + sanctH - 0.81, -61.8, { cast: false });
  sc.rotation.x = Math.PI / 2;
  for (const sx of [-1, 1]) {
    const p = addMesh(planeGeo(10.9, 3.6), M.frieze, sx * 5.99, F + 3.6, -61.8, { cast: false });
    p.rotation.y = -sx * (Math.PI / 2);
  }
  // naos de granito con puertas doradas
  box(-1.7, 1.7, F, F + 0.6, -66.5, -63, M.granite);
  box(-1.3, 1.3, F + 0.6, F + 4.2, -66.2, -63.6, M.granite);
  box(-0.9, 0.9, F + 1.0, F + 3.6, -63.62, -63.5, M.gold, { collide: false });
  box(-1.5, 1.5, F + 4.2, F + 4.6, -66.4, -63.4, M.cornice, { collide: false });
  box(-0.8, 0.8, F, F + 1.0, -60.5, -59.5, M.granite); // mesa de ofrendas
  addMesh(new THREE.LatheGeometry([0, 0.25, 0.32, 0.3].map((r, i) => new THREE.Vector2(r, i * 0.12)), 16), M.gold, -0.4, F + 1.0, -60);
  addMesh(new THREE.LatheGeometry([0, 0.2, 0.22, 0.12, 0.16].map((r, i) => new THREE.Vector2(r, i * 0.12)), 16), M.gold, 0.4, F + 1.0, -60);

  // --- columnas instanciadas ---
  for (const c of columnGroups) {
    const inst = new THREE.InstancedMesh(columnGeo(c.r, c.h, c.open), M.column, c.list.length);
    const abacus = new THREE.InstancedMesh(boxGeo(c.r * 2.2, ABACUS, c.r * 2.2), M.stone, c.list.length);
    const m4 = new THREE.Matrix4();
    c.list.forEach(([x, z], i) => {
      inst.setMatrixAt(i, m4.makeTranslation(x, F, z));
      abacus.setMatrixAt(i, m4.makeTranslation(x, F + 0.96 * c.h + ABACUS / 2, z));
      circle(x, z, c.r * 1.2);
    });
    for (const m of [inst, abacus]) {
      m.castShadow = m.receiveShadow = true;
      group.add(m);
    }
  }

  // --- palmeras ---
  const frondTex = T.frondTexture(16, 95);
  const frondMat = new THREE.MeshStandardMaterial({ map: frondTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
  const frondDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: frondTex, alphaTest: 0.45 });
  const palms = [[-24, -10], [-27, -18], [24, -24], [28, -12], [-30, 12], [30, 16], [-40, -40], [42, -55], [-22, 26], [26, 30]];
  for (const [x, z] of palms) palm(x, z, 8 + Math.random() * 5);

  function palm(x, z, h) {
    const lean = new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2);
    const pts = [0, 0.35, 0.7, 1].map((t) => new THREE.Vector3(x + lean.x * t * t, t * h, z + lean.z * t * t));
    const curve = new THREE.CatmullRomCurve3(pts);
    const trunk = addMesh(new THREE.TubeGeometry(curve, 24, 0.28, 8), M.bark, 0, 0, 0);
    trunk.receiveShadow = true;
    const top = pts[3];
    const fg = new THREE.PlaneGeometry(1.6, 4.5);
    fg.translate(0, 2.25, 0);
    for (let i = 0; i < 11; i++) {
      const f = new THREE.Mesh(fg, frondMat);
      f.rotation.order = 'YXZ';
      f.rotation.y = (i / 11) * Math.PI * 2 + Math.random() * 0.3;
      f.rotation.x = 0.9 + Math.random() * 0.6;
      f.position.copy(top);
      f.castShadow = true;
      f.customDepthMaterial = frondDepth;
      group.add(f);
    }
    circle(x, z, 0.45);
  }

  // --- braseros con fuego (iluminan el interior) ---
  const flameTex = T.flameTexture();
  const glowTex = T.spriteTexture([[0, 'rgba(255,220,160,0.9)'], [0.25, 'rgba(255,140,50,0.35)'], [1, 'rgba(255,100,20,0)']]);
  const braziers = [[-4.5, -38.5], [4.5, -38.5], [-4.5, -53.5], [4.5, -53.5], [-3, -58], [3, -58], [-3.5, -12], [3.5, -12]];
  for (const [x, z] of braziers) brazier(x, z);

  function brazier(x, z) {
    addMesh(new THREE.CylinderGeometry(0.12, 0.2, 1.0, 10), M.gold, x, F + 0.5, z);
    addMesh(new THREE.CylinderGeometry(0.42, 0.18, 0.3, 16, 1, true), M.gold, x, F + 1.15, z);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    flame.position.set(x, F + 1.55, z);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
    glow.position.copy(flame.position);
    glow.scale.setScalar(2.4);
    const light = new THREE.PointLight(0xff9a45, 25, 18, 1.6);
    light.position.set(x, F + 1.9, z);
    group.add(flame, glow, light);
    circle(x, z, 0.45);
    const seed = Math.random() * 100;
    updaters.push((t) => {
      const f = 1 + 0.12 * Math.sin(t * 11 + seed) + 0.08 * Math.sin(t * 23.7 + seed * 2) + 0.06 * (Math.random() - 0.5);
      light.intensity = 25 * f;
      flame.scale.set(0.5 * (0.95 + 0.1 * f), 0.95 * f, 1);
      glow.material.opacity = 0.5 * f;
    });
  }

  // --- haces de luz del claristorio ---
  const shaftMat = new THREE.MeshBasicMaterial({
    map: T.shaftTexture(),
    color: 0xffe6b0,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const sx of [-1, 1]) {
    for (let z = -53.5; z < -38; z += 3.3) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 11), shaftMat);
      s.position.set(sx * 4.6, F + 5.4, z);
      s.rotation.set(0, Math.PI / 2, sx * 0.32);
      group.add(s);
    }
  }

  return { group, colliders, update: (t, dt) => updaters.forEach((u) => u(t, dt)) };
}

// Altura del suelo donde pisa el jugador
export function groundHeight(x, z) {
  return x > PLATFORM.x1 && x < PLATFORM.x2 && z > PLATFORM.z1 && z < PLATFORM.z2 ? FLOOR : 0;
}

// Zona actual (mismos nombres que la ilustración)
export function areaName(x, z) {
  if (Math.abs(x) > 18.5 || z > 0.5 || z < -68.5) return z > 0.5 && z < 12 && Math.abs(x) < 22 ? 'Entrada · Pilonos' : 'Desierto';
  if (z > -6.5) return 'Pilonos';
  if (z > -36) return 'Patio interior';
  if (z > -56) return 'Sala hipóstila';
  return 'Cámara del dios';
}

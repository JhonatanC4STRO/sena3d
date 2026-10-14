import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxGeo, planeGeo } from '../room.js';
import { rng } from '../textures.js';
import * as AT from '../aula/textures.js';
import * as ST from './textures.js';
import * as P from './props.js';

/*
 * Centro Tecnológico de la Amazonía (SENA, Caquetá), reconstruido a partir de fotos.
 * Unidades en metros. Eje x: a lo largo del bloque; +z: fachada de galerías (terreno);
 * -z: parqueadero. Planta baja en y = 0, pisos cada 3.6 m.
 *
 *   ala izquierda  x ∈ [-36, -4]     torre de escaleras x ∈ [-4, 4]     ala derecha x ∈ [4, 36]
 *   rampas x ∈ [36, 53]
 *   salones z ∈ [-7, 4] · galería z ∈ [4, 6.6] · alero trasero en planta baja z ∈ [-7, -4.5]
 */
const FH = 3.6;
const ROOF = 3 * FH;
const XW = 36; // fin de las alas
const TW = 4; // media anchura de la torre
const Z_ROOM = 4; // muro de salones hacia la galería
const Z_GAL = 6.6; // borde exterior de la galería
const Z_BACK = -7; // fachada trasera (pisos altos)
const Z_BACK0 = -4.5; // fachada trasera de planta baja (bajo el alero)
const Z_TBACK = -3.2; // fondo de la torre
const Z_TFRONT = 7.6; // frente de la torre
const BAYS = [-36, -28, -20, -12, 4, 12, 20, 28]; // inicio de cada salón (8 m)
const LOBBY = [-12, -4]; // planta baja: hall pasante
// escalera en U dentro de la torre
const ST_RUN = 3.1;
const ST_Z0 = 0.4; // arranque/llegada de los tramos
const ST_Z1 = ST_Z0 + ST_RUN; // 3.5
const STEPS = 11;
// rampas
const R_X0 = 36;
const R_XA = 39;
const R_XB = 51;
const R_X1 = 53;
const R_Z0 = 0.5;
const R_ZM = 3.5;

// Junta geometrías por material: toda la arquitectura queda en unas pocas mallas
class Batch {
  constructor() {
    this.lists = new Map();
  }
  push(mat, geo) {
    if (!this.lists.has(mat)) this.lists.set(mat, []);
    this.lists.get(mat).push(geo);
  }
  flush(group, { cast = true } = {}) {
    for (const [mat, geos] of this.lists) {
      const m = new THREE.Mesh(mergeGeometries(geos), mat);
      m.castShadow = cast;
      m.receiveShadow = true;
      group.add(m);
    }
    this.lists.clear();
  }
}

export function createSenaWorld({ scene, renderer }) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const surfaces = []; // superficies pisables por encima del terreno
  const interactions = [];
  const updaters = [];
  const rand = rng(2024);

  // ---------- materiales ----------
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, envMapIntensity: 0.6, ...o });
  const views = [306, 307, 308].map((s) => std({ map: ST.classroomView(s), roughness: 0.12, metalness: 0.1, envMapIntensity: 1 }));
  const M = {
    white: std({ map: AT.wallPaint(), roughness: 0.9 }),
    slab: std({ color: 0xf2f2f0, roughness: 0.85 }),
    gray: std({ color: 0xa7abb0, roughness: 0.6 }),
    green: std({ color: 0x8fbc5a, roughness: 0.7 }), // medido en la foto de la fachada
    terrazzo: std({ map: AT.terrazzo(), roughness: 0.35 }),
    tiles: std({ map: ST.grayTiles(), roughness: 0.6 }),
    steel: std({ color: 0xc8ccd0, metalness: 0.9, roughness: 0.25, envMapIntensity: 1 }),
    alu: std({ color: 0xf4f4f2, metalness: 0.3, roughness: 0.35 }),
    stairs: std({ color: 0x5c5f63, roughness: 0.55 }),
    doorWhite: std({ color: 0xeeeeec, roughness: 0.5 }),
    doorGreen: std({ color: 0x6fae3a, roughness: 0.55 }),
    louver: std({ map: ST.louverPanel(), roughness: 0.5 }),
    banner: std({ map: ST.banner(), roughness: 0.7 }),
    mural: std({ map: ST.mural(), roughness: 0.75 }),
    exit: new THREE.MeshBasicMaterial({ map: AT.exitSign() }),
    notice: std({ map: ST.noticeBoard(), roughness: 0.7 }),
    roof: std({ map: ST.corrugated('#6aa84f'), roughness: 0.5, metalness: 0.4 }),
    roofDark: std({ map: ST.corrugated('#2f3a40'), roughness: 0.5, metalness: 0.4 }),
    pavers: std({ map: ST.pavers(), roughness: 0.9 }),
    dirt: std({ map: ST.dirt(), roughness: 1 }),
    grass: std({ map: ST.grass(), roughness: 1, envMapIntensity: 0.3 }),
    concrete: std({ color: 0xb9b8b2, roughness: 0.9 }),
    yellow: std({ color: 0xf2c230, roughness: 0.6 }),
    black: std({ color: 0x1b1b1b, roughness: 0.6 }),
    condenser: std({ color: 0xf2f2f2, roughness: 0.4 }),
    fan: std({ color: 0x2a2c30, roughness: 0.6 }),
  };

  // ---------- utilidades ----------
  const B = new Batch();
  const box = (mat, xa, xb, y1, y2, z1, z2) => {
    const x1 = Math.min(xa, xb);
    const x2 = Math.max(xa, xb);
    const g = boxGeo(x2 - x1, y2 - y1, z2 - z1);
    g.translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    B.push(mat, g);
  };
  // plano con UV en metros (texturas repetibles) o 0..1 (unit: carteles, ventanas, logos)
  const plane = (mat, w, h, x, y, z, { ry = 0, rx = 0, unit = false } = {}) => {
    const g = unit ? new THREE.PlaneGeometry(w, h) : planeGeo(w, h);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    B.push(mat, g);
  };
  const floorPlane = (mat, x1, x2, z1, z2, y) => plane(mat, x2 - x1, z2 - z1, (x1 + x2) / 2, y, (z1 + z2) / 2, { rx: -Math.PI / 2 });
  const Y = new THREE.Vector3(0, 1, 0);
  const rod = (mat, a, b, r = 0.025) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const g = new THREE.CylinderGeometry(r, r, d.length(), 8);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, d.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    B.push(mat, g);
  };
  const column = (x, z, y0, y1, r = 0.25, mat = M.gray) => {
    const g = new THREE.CylinderGeometry(r, r, y1 - y0, 20);
    g.translate(x, (y0 + y1) / 2, z);
    B.push(mat, g);
  };
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  // baranda de acero: pasamanos + 2 tubos + parales, entre dos puntos a la altura del piso
  const railing = (a, b, step = 1.6) => {
    for (const hgt of [0.35, 0.65, 0.98]) rod(M.steel, v(a.x, a.y + hgt, a.z), v(b.x, b.y + hgt, b.z), hgt > 0.9 ? 0.03 : 0.018);
    const n = Math.max(1, Math.round(a.distanceTo(b) / step));
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      rod(M.steel, p, v(p.x, p.y + 0.98, p.z), 0.022);
    }
  };
  const addSurface = (x1, x2, z1, z2, h) => surfaces.push({ x1, x2, z1, z2, h: typeof h === 'number' ? () => h : h });
  const place = (obj, x, y, z, ry = 0) => {
    obj.position.set(x, y, z);
    obj.rotation.y = ry;
    group.add(obj);
    return obj;
  };

  // ---------- terreno ----------
  const ground = new THREE.PlaneGeometry(900, 900, 150, 150);
  ground.rotateX(-Math.PI / 2);
  const gp = ground.attributes.position;
  const guv = ground.attributes.uv;
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i);
    const z = gp.getZ(i);
    const d = Math.hypot(x - 5, z - 5);
    const k = THREE.MathUtils.smoothstep(d, 150, 330);
    const hill = (Math.sin(x * 0.012) * Math.cos(z * 0.01) + 0.6 * Math.sin((x - z) * 0.021) + 0.3 * Math.sin(x * 0.05 + z * 0.03)) * 14 + 16;
    gp.setY(i, k * hill);
    guv.setXY(i, x, z);
  }
  ground.computeVertexNormals();
  const groundMesh = new THREE.Mesh(ground, M.grass);
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  floorPlane(M.dirt, -75, 95, 8.6, 80, 0.012); // terreno frente al bloque
  floorPlane(M.pavers, -62, 75, -48, -7, 0.012); // parqueadero y vías
  floorPlane(M.concrete, -38, 55, 6.6, 8.6, 0.02); // andén frontal
  floorPlane(M.tiles, -XW, R_X1, Z_ROOM, Z_GAL, 0.03); // galería de planta baja
  floorPlane(M.tiles, -XW, XW, Z_BACK, Z_BACK0, 0.03); // paso cubierto trasero
  box(M.concrete, -38, 55, 0, 0.03, Z_GAL, Z_GAL + 0.15); // bordillo

  // ---------- bloque principal ----------
  const wings = [
    [-XW, -TW],
    [TW, XW],
  ];
  const isLobby = (bx, f) => f === 0 && bx === LOBBY[0];

  // losas de entrepiso y cubierta (los alas y el bloque de servicio detrás de la torre)
  for (let f = 1; f <= 3; f++) {
    const y = f * FH;
    for (const [x1, x2] of wings) {
      box(M.slab, x1, x2, y - 0.3, y, Z_BACK, Z_GAL);
      box(M.slab, x1, x2, y - 0.6, y, Z_GAL - 0.25, Z_GAL); // viga de borde (franja blanca)
      if (f < 3) {
        floorPlane(M.terrazzo, x1, x2, Z_ROOM, Z_GAL, y + 0.004);
        addSurface(x1, x2, Z_BACK, Z_GAL + 0.2, y);
      }
    }
    box(M.slab, -TW, TW, y - 0.3, y, Z_BACK, Z_TBACK);
  }
  floorPlane(M.terrazzo, LOBBY[0], LOBBY[1], Z_BACK0, Z_ROOM, 0.035); // piso del hall

  // fachada de salones hacia la galería: puerta + ventanal por salón y piso
  let doorCount = 0;
  for (const bx of BAYS) {
    for (let f = 0; f < 3; f++) {
      if (isLobby(bx, f)) continue;
      const y0 = f * FH;
      const y1 = (f + 1) * FH - 0.3;
      const wallMat = (BAYS.indexOf(bx) + f) % 3 === 0 ? M.green : M.white;
      const z1 = Z_ROOM - 0.1;
      const z2 = Z_ROOM + 0.1;
      // macizos
      box(wallMat, bx, bx + 0.8, y0, y1, z1, z2);
      box(wallMat, bx + 1.8, bx + 2.4, y0, y1, z1, z2);
      box(wallMat, bx + 7.2, bx + 8, y0, y1, z1, z2);
      box(wallMat, bx + 0.8, bx + 1.8, y0 + 2.2, y1, z1, z2); // dintel de puerta
      box(wallMat, bx + 2.4, bx + 7.2, y0, y0 + 1.0, z1, z2); // antepecho
      box(wallMat, bx + 2.4, bx + 7.2, y0 + 2.6, y1, z1, z2);
      // puerta
      const doorMat = doorCount++ % 2 ? M.doorGreen : M.doorWhite;
      box(doorMat, bx + 0.85, bx + 1.75, y0, y0 + 2.15, Z_ROOM - 0.04, Z_ROOM + 0.04);
      box(M.steel, bx + 1.6, bx + 1.66, y0 + 0.95, y0 + 1.15, Z_ROOM + 0.04, Z_ROOM + 0.09);
      box(M.green, bx + 1.85, bx + 2.3, y0 + 1.45, y0 + 1.65, Z_ROOM + 0.1, Z_ROOM + 0.12); // placa
      // ventanal con vista al interior del salón
      plane(views[(BAYS.indexOf(bx) + f) % 3], 4.8, 1.6, bx + 4.8, y0 + 1.8, Z_ROOM + 0.02, { unit: true });
      for (const x of [bx + 2.4, bx + 4.0, bx + 5.6, bx + 7.2]) box(M.alu, x - 0.03, x + 0.03, y0 + 1.0, y0 + 2.6, Z_ROOM + 0.02, Z_ROOM + 0.07);
      for (const y of [y0 + 1.0, y0 + 2.6]) box(M.alu, bx + 2.4, bx + 7.2, y - 0.03, y + 0.03, Z_ROOM + 0.02, Z_ROOM + 0.08);
      // fachada trasera: ventanas corridas
      const zb = f === 0 ? Z_BACK0 : Z_BACK;
      const sill = f === 0 ? 2.1 : 1.0;
      box(M.white, bx, bx + 8, y0, y0 + sill, zb - 0.1, zb + 0.1);
      box(M.white, bx, bx + 8, y0 + 2.9, y1, zb - 0.1, zb + 0.1);
      plane(views[(BAYS.indexOf(bx) + f + 1) % 3], 8, 2.9 - sill, bx + 4, y0 + (sill + 2.9) / 2, zb - 0.11, { unit: true, ry: Math.PI });
      for (let x = bx; x <= bx + 8; x += 1.6) box(M.alu, x - 0.03, x + 0.03, y0 + sill, y0 + 2.9, zb - 0.16, zb - 0.1);
    }
  }
  // franja trasera de la torre (bloque de servicios) y muros de cierre
  for (let f = 0; f < 3; f++) {
    const y0 = f * FH;
    const zb = f === 0 ? Z_BACK0 : Z_BACK;
    box(M.white, -TW, TW, y0, (f + 1) * FH - 0.3, zb - 0.1, zb + 0.1);
  }
  box(M.white, -TW, -TW + 0.2, 0, FH, Z_BACK0, Z_TBACK); // costado del hall
  // testeros (extremos de las alas)
  for (const [x, s] of [[-XW, 1], [XW, -1]]) {
    box(M.white, x - 0.1 * s, x + 0.1 * s, 0, FH, Z_BACK0, Z_ROOM);
    box(M.white, x - 0.1 * s, x + 0.1 * s, FH - 0.3, ROOF, Z_BACK, Z_ROOM);
    box(M.green, x - 0.13 * s, x - 0.11 * s, FH, ROOF - 0.3, -3, 2);
  }
  // muro interior del hall (lado de los salones)
  box(M.white, LOBBY[0] - 0.1, LOBBY[0] + 0.1, 0, FH - 0.3, Z_BACK0, Z_ROOM);

  // columnas grises de la galería y del alero trasero
  const colXs = [-36, -28, -20, -12, 12, 20, 28, 36];
  for (const x of colXs) {
    column(x, Z_GAL - 0.3, 0, ROOF + 0.2);
    colliders.push({ x, z: Z_GAL - 0.3, r: 0.25 });
  }
  for (let x = -32; x <= 32; x += 8) {
    column(x, Z_BACK + 0.3, 0, FH - 0.3);
    colliders.push({ x, z: Z_BACK + 0.3, r: 0.25 });
  }

  // barandas de las galerías altas
  for (let f = 1; f < 3; f++) {
    const y = f * FH;
    for (const [x1, x2] of [[-XW, -TW], [TW, R_XA]]) {
      box(M.slab, x1, x2, y, y + 0.12, Z_GAL - 0.2, Z_GAL - 0.05);
      railing(v(x1, y + 0.12, Z_GAL - 0.12), v(x2, y + 0.12, Z_GAL - 0.12));
    }
    railing(v(-XW + 0.05, y + 0.12, Z_ROOM + 0.1), v(-XW + 0.05, y + 0.12, Z_GAL - 0.12));
  }
  colliders.push(
    { x1: -XW, x2: -TW, z1: Z_GAL - 0.25, z2: Z_GAL + 0.2, y1: FH - 0.2, y2: 20 },
    { x1: TW, x2: R_XA, z1: Z_GAL - 0.25, z2: Z_GAL + 0.2, y1: FH - 0.2, y2: 20 },
    { x1: -XW - 0.3, x2: -XW + 0.1, z1: Z_ROOM, z2: Z_GAL, y1: FH - 0.2, y2: 20 },
  );

  // parapeto verde y cubierta con condensadoras
  for (const [x1, x2] of wings) {
    box(M.green, x1, x2, ROOF - 0.4, ROOF + 1.0, Z_GAL - 0.3, Z_GAL + 0.05);
    box(M.green, x1, x2, ROOF - 0.4, ROOF + 1.0, Z_BACK - 0.2, Z_BACK + 0.05);
    floorPlane(M.roof, x1, x2, Z_BACK, Z_GAL - 0.3, ROOF + 0.35);
    for (let x = x1 + 3; x < x2 - 2; x += 4.5) {
      box(M.condenser, x - 0.45, x + 0.45, ROOF + 0.35, ROOF + 1.05, -2.2, -1.85);
      plane(M.fan, 0.5, 0.5, x, ROOF + 0.7, -1.84, { unit: true });
    }
  }
  for (const x of [-XW, XW]) box(M.green, x - 0.15, x + 0.15, ROOF - 0.4, ROOF + 1.0, Z_BACK, Z_GAL);

  // muros de salones y fachadas como obstáculos
  colliders.push(
    { x1: -XW, x2: LOBBY[0], z1: Z_ROOM - 0.15, z2: Z_ROOM + 0.15 },
    { x1: LOBBY[0], x2: LOBBY[1], z1: Z_ROOM - 0.15, z2: Z_ROOM + 0.15, y1: FH - 0.4, y2: 20 },
    { x1: TW, x2: XW, z1: Z_ROOM - 0.15, z2: Z_ROOM + 0.15 },
    { x1: -XW, x2: LOBBY[0], z1: Z_BACK0 - 0.15, z2: Z_BACK0 + 0.15, y1: -1, y2: FH - 0.4 },
    { x1: LOBBY[1], x2: XW, z1: Z_BACK0 - 0.15, z2: Z_BACK0 + 0.15, y1: -1, y2: FH - 0.4 },
    { x1: LOBBY[0] - 0.15, x2: LOBBY[0] + 0.15, z1: Z_BACK0, z2: Z_ROOM, y1: -1, y2: FH - 0.4 },
    { x1: -TW, x2: -TW + 0.25, z1: Z_BACK0, z2: Z_TBACK },
    { x1: -XW - 0.2, x2: -XW + 0.1, z1: Z_BACK0, z2: Z_ROOM, y1: -1, y2: FH - 0.4 },
    { x1: XW - 0.1, x2: XW + 0.2, z1: Z_BACK0, z2: Z_ROOM, y1: -1, y2: FH - 0.4 },
    // pisos altos: el volumen de los salones no es accesible (la torre queda fuera)
    { x1: -XW - 0.2, x2: -TW, z1: Z_BACK - 0.15, z2: Z_ROOM, y1: FH - 0.4, y2: 20 },
    { x1: TW, x2: XW + 0.2, z1: Z_BACK - 0.15, z2: Z_ROOM, y1: FH - 0.4, y2: 20 },
  );

  // ---------- torre de escaleras (verde, con los paneles del logo) ----------
  const TH = ROOF + 2.6;
  const wt = 0.25;
  // muros interiores (blancos) con vanos hacia las galerías en cada piso
  for (const s of [-1, 1]) {
    const x1 = s < 0 ? -TW : TW - wt;
    const x2 = x1 + wt;
    box(M.white, x1, x2, 0, TH, Z_TBACK, Z_ROOM);
    box(M.white, x1, x2, 0, TH, Z_GAL, Z_TFRONT);
    for (let f = 0; f < 3; f++) box(M.white, x1, x2, f * FH + 2.7, (f + 1) * FH, Z_ROOM, Z_GAL);
    for (let f = 1; f < 3; f++) box(M.stairs, x1, x2, f * FH - 0.3, f * FH, Z_ROOM, Z_GAL); // umbral
    box(M.white, x1, x2, ROOF, TH, Z_ROOM, Z_GAL);
    colliders.push({ x1, x2, z1: Z_TBACK, z2: Z_ROOM }, { x1, x2, z1: Z_GAL, z2: Z_TFRONT });
    // piel verde exterior
    const xe = s * (TW + 0.01);
    plane(M.green, Z_TFRONT - Z_GAL, ROOF, xe, ROOF / 2, (Z_GAL + Z_TFRONT) / 2, { ry: s * (Math.PI / 2) });
    plane(M.green, Z_TFRONT - Z_TBACK, TH - ROOF, xe, (ROOF + TH) / 2, (Z_TBACK + Z_TFRONT) / 2, { ry: s * (Math.PI / 2) });
    for (let f = 0; f < 3; f++) plane(M.green, Z_GAL - Z_ROOM, 0.9, xe, f * FH + 3.15, (Z_ROOM + Z_GAL) / 2, { ry: s * (Math.PI / 2) });
  }
  box(M.white, -TW, TW, 0, TH, Z_TBACK, Z_TBACK + wt);
  plane(M.green, 2 * TW, TH - ROOF, 0, (ROOF + TH) / 2, Z_TBACK - 0.01, { ry: Math.PI });
  colliders.push({ x1: -TW, x2: TW, z1: Z_TBACK, z2: Z_TBACK + wt });
  // frente con acceso en planta baja
  const zf = Z_TFRONT - wt;
  box(M.white, -TW, -2, 0, TH, zf, Z_TFRONT);
  box(M.white, 2, TW, 0, TH, zf, Z_TFRONT);
  box(M.white, -2, 2, 3.0, TH, zf, Z_TFRONT);
  colliders.push(
    { x1: -TW, x2: -2, z1: zf, z2: Z_TFRONT },
    { x1: 2, x2: TW, z1: zf, z2: Z_TFRONT },
    { x1: -2, x2: 2, z1: zf, z2: Z_TFRONT, y1: FH - 0.4, y2: 20 },
  );
  const zfe = Z_TFRONT + 0.01;
  plane(M.green, TW - 2, TH, -3, TH / 2, zfe);
  plane(M.green, TW - 2, TH, 3, TH / 2, zfe);
  plane(M.green, 4, TH - 3, 0, (3 + TH) / 2, zfe);
  for (let f = 1; f < 3; f++) {
    plane(M.louver, 3.4, 3.0, 0, f * FH + 1.75, zfe + 0.01, { unit: true }); // panel exterior
    plane(M.louver, 3.4, 3.0, 0, f * FH + 1.75, zf - 0.01, { unit: true, ry: Math.PI }); // y por dentro
  }
  plane(M.banner, 1.3, 2.6, 3.05, 1.6, zfe + 0.02, { unit: true });
  box(M.green, -TW - 0.1, TW + 0.1, TH - 0.1, TH + 0.25, Z_TBACK - 0.1, Z_TFRONT + 0.1);
  box(M.slab, -2.1, 2.1, 2.9, 3.05, zf, Z_TFRONT + 0.6); // pequeño alero del acceso
  // ventana con lamas y logo en los descansos (vista desde la escalera)
  for (let f = 0; f < 2; f++) plane(M.louver, 3.2, 2.6, 0, f * FH + 1.8 + 1.6, Z_TBACK + wt + 0.01, { unit: true });
  // mural en planta baja junto a la escalera
  plane(M.mural, Z_TFRONT - 0.6 - ST_Z0, 3.2, -TW + wt + 0.01, 1.7, (ST_Z0 + Z_TFRONT - 0.6) / 2, { unit: true, ry: Math.PI / 2 });
  floorPlane(M.terrazzo, -TW + wt, TW - wt, ST_Z1, zf, 0.035);

  // tramos de escalera, descansos y rellanos
  const rise = FH / 2 / STEPS;
  const run = ST_RUN / STEPS;
  const xi = TW - wt; // cara interior
  for (let f = 0; f < 2; f++) {
    const y0 = f * FH;
    for (let k = 0; k < STEPS; k++) {
      const top = y0 + (k + 1) * rise;
      // tramo A (sube hacia el fondo, lado derecho)
      box(M.stairs, 0.12, xi, top - 0.35, top, ST_Z1 - (k + 1) * run, ST_Z1 - k * run);
      // tramo B (sube hacia el frente, lado izquierdo)
      const topB = y0 + FH / 2 + (k + 1) * rise;
      box(M.stairs, -xi, -0.12, topB - 0.35, topB, ST_Z0 + k * run, ST_Z0 + (k + 1) * run);
    }
    // descanso a media altura
    box(M.stairs, -xi, xi, y0 + FH / 2 - 0.25, y0 + FH / 2, Z_TBACK + wt, ST_Z0);
    addSurface(-xi, xi, Z_TBACK, ST_Z0, y0 + FH / 2);
    addSurface(0.12, xi, ST_Z0, ST_Z1, (x, z) => y0 + (FH / 2) * ((ST_Z1 - z) / ST_RUN));
    addSurface(-xi, -0.12, ST_Z0, ST_Z1, (x, z) => y0 + FH / 2 + (FH / 2) * ((z - ST_Z0) / ST_RUN));
    // pasamanos sobre el muro central
    for (const s of [-1, 1]) {
      const za = s > 0 ? ST_Z1 : ST_Z0;
      const zb = s > 0 ? ST_Z0 : ST_Z1;
      const ya = s > 0 ? y0 : y0 + FH / 2;
      rod(M.steel, v(s * 0.2, ya + 0.95, za), v(s * 0.2, ya + FH / 2 + 0.95, zb), 0.03);
    }
  }
  // rellanos de piso
  for (let f = 1; f < 3; f++) {
    box(M.stairs, -xi, xi, f * FH - 0.3, f * FH, ST_Z1, zf);
    floorPlane(M.terrazzo, -xi, xi, ST_Z1, zf, f * FH + 0.004);
    addSurface(-TW, TW, ST_Z1, Z_TFRONT, f * FH); // incluye el umbral de los vanos laterales
  }
  // muro central entre tramos
  box(M.white, -0.12, 0.12, 0, 2 * FH + 1.0, ST_Z0, ST_Z1);
  colliders.push({ x1: -0.12, x2: 0.12, z1: ST_Z0, z2: ST_Z1 });
  // baranda del último piso sobre el hueco del tramo A
  railing(v(0.12, 2 * FH, ST_Z1 - 0.05), v(xi, 2 * FH, ST_Z1 - 0.05), 0.8);
  colliders.push({ x1: 0.12, x2: xi, z1: ST_Z1 - 0.15, z2: ST_Z1 + 0.05, y1: 2 * FH - 0.2, y2: 20 });
  // bajo el tramo B en planta baja no hay altura libre
  colliders.push({ x1: -xi, x2: -0.12, z1: ST_Z0, z2: ST_Z1, y1: -1, y2: 1.0 });
  // la torre no pertenece a ninguna losa de las alas: superficie del rellano en planta baja = terreno

  // ---------- rampas (estructura abierta con techo verde) ----------
  const laneLen = R_XB - R_XA;
  const ang = Math.atan2(FH / 2, laneLen);
  const L = Math.hypot(laneLen, FH / 2);
  for (let f = 0; f < 2; f++) {
    const y0 = f * FH;
    // carril 1: sube hacia +x junto a la galería
    let g = new THREE.BoxGeometry(L, 0.22, Z_GAL - R_ZM - 0.1);
    g.rotateZ(ang);
    g.translate((R_XA + R_XB) / 2, y0 + FH / 4 - 0.11, (R_ZM + Z_GAL) / 2);
    B.push(M.concrete, g);
    // carril 2: regresa hacia -x y llega al piso siguiente
    g = new THREE.BoxGeometry(L, 0.22, R_ZM - R_Z0 - 0.1);
    g.rotateZ(-ang);
    g.translate((R_XA + R_XB) / 2, y0 + (3 * FH) / 4 - 0.11, (R_Z0 + R_ZM) / 2);
    B.push(M.concrete, g);
    addSurface(R_XA, R_XB, R_ZM, Z_GAL + 0.2, (x) => y0 + (FH / 2) * ((x - R_XA) / laneLen));
    addSurface(R_XA, R_XB, R_Z0, R_ZM, (x) => y0 + FH / 2 + (FH / 2) * ((R_XB - x) / laneLen));
    // descanso del extremo
    box(M.concrete, R_XB, R_X1, y0 + FH / 2 - 0.22, y0 + FH / 2, R_Z0, Z_GAL);
    addSurface(R_XB, R_X1, R_Z0, Z_GAL + 0.2, y0 + FH / 2);
    // barandas inclinadas
    railing(v(R_XA, y0, Z_GAL - 0.1), v(R_XB, y0 + FH / 2, Z_GAL - 0.1), 2);
    railing(v(R_XB, y0 + FH / 2, R_Z0 + 0.1), v(R_XA, y0 + FH, R_Z0 + 0.1), 2);
    railing(v(R_XA, y0 + 0.05, R_ZM), v(R_XB, y0 + FH / 2 + 0.05, R_ZM), 2);
    railing(v(R_XB, y0 + FH / 2, Z_GAL - 0.1), v(R_X1 - 0.1, y0 + FH / 2, Z_GAL - 0.1), 2);
    railing(v(R_X1 - 0.1, y0 + FH / 2, Z_GAL - 0.1), v(R_X1 - 0.1, y0 + FH / 2, R_Z0 + 0.1), 2);
    railing(v(R_X1 - 0.1, y0 + FH / 2, R_Z0 + 0.1), v(R_XB, y0 + FH / 2, R_Z0 + 0.1), 2);
  }
  // descansos junto al bloque (prolongan las galerías)
  for (let f = 1; f < 3; f++) {
    box(M.concrete, R_X0, R_XA, f * FH - 0.25, f * FH, R_Z0, Z_GAL);
    addSurface(R_X0, R_XA, R_Z0, Z_GAL + 0.2, f * FH);
    railing(v(R_X0 + 0.1, f * FH, R_Z0 + 0.1), v(R_XA, f * FH, R_Z0 + 0.1), 1.5);
  }
  floorPlane(M.tiles, R_X0, R_XA, R_Z0, Z_ROOM, 0.03);
  railing(v(R_XA, 2 * FH, R_ZM + 0.05), v(R_XA, 2 * FH, Z_GAL - 0.1), 1.5); // fin del último piso
  for (const x of [R_XA, 45, R_XB, R_X1 - 0.2]) {
    for (const z of [R_Z0 + 0.05, Z_GAL - 0.3]) {
      column(x, z, 0, ROOF + 0.8, 0.22);
      colliders.push({ x, z, r: 0.22 });
    }
  }
  box(M.green, R_X0, R_X1 + 0.3, ROOF + 0.5, ROOF + 1.3, R_Z0 - 0.3, R_Z0);
  box(M.green, R_X0, R_X1 + 0.3, ROOF + 0.5, ROOF + 1.3, Z_GAL, Z_GAL + 0.3);
  box(M.green, R_X1, R_X1 + 0.3, ROOF + 0.5, ROOF + 1.3, R_Z0, Z_GAL);
  plane(M.roof, R_X1 - R_X0, Z_GAL - R_Z0, (R_X0 + R_X1) / 2, ROOF + 0.9, (R_Z0 + Z_GAL) / 2, { rx: -Math.PI / 2 });
  colliders.push(
    { x1: R_XA, x2: R_X1 + 0.2, z1: Z_GAL - 0.15, z2: Z_GAL + 0.3 },
    { x1: R_X0, x2: R_X1 + 0.2, z1: R_Z0 - 0.3, z2: R_Z0 + 0.15 },
    { x1: R_XA, x2: R_XB, z1: R_ZM - 0.08, z2: R_ZM + 0.08 },
    { x1: R_X1 - 0.15, x2: R_X1 + 0.2, z1: R_Z0, z2: Z_GAL },
    { x1: R_XA, x2: R_X1, z1: R_Z0, z2: R_ZM, y1: -1, y2: 1.0 },
    { x1: R_XA - 0.1, x2: R_XA + 0.05, z1: R_ZM, z2: Z_GAL, y1: 2 * FH - 0.2, y2: 20 },
  );

  // ---------- hall de planta baja ----------
  place(P.guardDesk(), -9.5, 0, -1.5, Math.PI / 2);
  place(P.tandemBench(), -6.2, 0, 2.6, Math.PI);
  place(P.tandemBench(), -6.2, 0, -1.0, 0);
  place(P.vendingMachine(), -11.4, 0, -3.3, Math.PI / 2);
  place(P.fireCabinet(), -11.88, 0, 1.0, Math.PI / 2);
  place(P.trashBin(0x1d4f91), -11.6, 0, 3.4);
  plane(M.notice, 1.6, 1.2, -11.88, 1.6, -0.9, { unit: true, ry: Math.PI / 2 });
  plane(M.exit, 0.34, 0.17, -8, FH - 0.55, Z_ROOM - 0.02, { unit: true, ry: Math.PI });
  // gabinetes contra incendio y letreros en las galerías
  for (const [x, f] of [[-21, 0], [9, 0], [27, 0], [-29, 1], [17, 1], [-13, 2], [29, 2]]) {
    place(P.fireCabinet(), x, f * FH, Z_ROOM + 0.12, 0);
  }
  for (const [x, f] of [[-24, 1], [24, 1], [-24, 2], [24, 2], [24, 0]]) plane(M.exit, 0.34, 0.17, x, f * FH + 2.75, Z_ROOM + 0.11, { unit: true });
  for (const x of [-30, -16, 8, 22, 33]) place(P.trashBin(0x2b2f36), x, 0, Z_GAL - 0.7);

  // ---------- parqueadero trasero ----------
  const stallW = 2.6;
  const lines = [];
  for (let x = -34; x <= 34; x += stallW) lines.push(x);
  for (const x of lines) {
    box(M.yellow, x - 0.05, x + 0.05, 0.015, 0.025, -14, -9.2);
    box(M.yellow, x - 0.05, x + 0.05, 0.015, 0.025, -25.5, -20.5);
  }
  for (const x of lines.slice(0, -1)) {
    for (const zs of [-9.7, -25]) {
      box(M.yellow, x + 1.05, x + 1.3, 0, 0.12, zs - 0.09, zs + 0.09);
      box(M.black, x + 1.3, x + 1.55, 0, 0.12, zs - 0.09, zs + 0.09);
    }
  }
  // líneas de la vía
  for (let x = -55; x < 70; x += 4) box(M.yellow, x, x + 2, 0.015, 0.025, -17.1, -16.95);
  const carColors = [0xf2f2f2, 0x3b3f45, 0xb02a2a, 0xdedede, 0x2b2d31, 0x7d8187, 0xe8e8e8, 0x1d3a6b, 0x9a9da1];
  let ci = 0;
  for (const x of lines.slice(0, -1)) {
    if (rand() < 0.45) place(P.car(carColors[ci++ % carColors.length]), x + stallW / 2, 0, -11.6, Math.PI / 2 + (rand() - 0.5) * 0.05);
    if (rand() < 0.5) place(P.car(carColors[ci++ % carColors.length]), x + stallW / 2, 0, -23, -Math.PI / 2 + (rand() - 0.5) * 0.05);
  }
  for (const x of lines) colliders.push({ x1: x - 0.05, x2: x + 0.05, z1: -9.8, z2: -9.6, y1: -1, y2: 0.2 });

  // cubierta verde de sombra sobre la segunda fila (vista desde los pisos altos)
  {
    const x1 = 2;
    const x2 = 34;
    for (let x = x1; x <= x2; x += 6.4) {
      column(x, -20.3, 0, 3.4, 0.08, M.gray);
      colliders.push({ x, z: -20.3, r: 0.1 });
    }
    const g = planeGeo(x2 - x1 + 1, 6.4);
    g.rotateX(-Math.PI / 2 + 0.06);
    g.translate((x1 + x2) / 2, 3.5, -23);
    B.push(M.roof, g);
    const g2 = planeGeo(x2 - x1 + 1, 6.4);
    g2.rotateX(Math.PI / 2 - 0.06);
    g2.translate((x1 + x2) / 2, 3.49, -23);
    B.push(M.slab, g2);
    box(M.gray, x1, x2, 3.25, 3.4, -20.4, -20.2);
  }

  // edificio bajo con franja verde y su cubierta oscura para carros
  {
    const x1 = -48;
    const x2 = 6;
    const zf2 = -40;
    const zb = -52;
    box(M.white, x1, x2, 0, 3.6, zb, zf2);
    box(M.green, x1 - 0.2, x2 + 0.2, 3.4, 4.3, zb - 0.2, zf2 + 0.25);
    colliders.push({ x1, x2, z1: zb, z2: zf2 });
    for (let x = x1 + 2; x < x2 - 2; x += 3.5) {
      const door = (Math.round((x - x1) / 3.5) % 4) === 1;
      if (door) {
        plane(views[0], 1.6, 2.3, x, 1.15, zf2 + 0.01, { unit: true });
        box(M.alu, x - 0.85, x + 0.85, 2.3, 2.38, zf2, zf2 + 0.06);
      } else {
        plane(views[(Math.round(x) & 1) + 1], 2.4, 1.2, x, 1.9, zf2 + 0.01, { unit: true });
        box(M.alu, x - 1.25, x + 1.25, 1.27, 1.32, zf2, zf2 + 0.06);
      }
    }
    // cubierta de carros: estructura oscura en voladizo
    for (let x = x1 + 1; x <= x2; x += 6) {
      column(x, -34.4, 0, 3.0, 0.1, M.black);
      colliders.push({ x, z: -34.4, r: 0.12 });
    }
    const g = planeGeo(x2 - x1, 6.2);
    g.rotateX(-Math.PI / 2 - 0.08);
    g.translate((x1 + x2) / 2, 3.15, -37.1);
    B.push(M.roofDark, g);
    const g2 = planeGeo(x2 - x1, 6.2);
    g2.rotateX(Math.PI / 2 + 0.08);
    g2.translate((x1 + x2) / 2, 3.14, -37.1);
    B.push(M.black, g2);
    for (let x = x1 + 3; x < x2 - 2; x += 5.5) if (rand() < 0.7) place(P.car(carColors[ci++ % carColors.length]), x, 0, -37.2, -Math.PI / 2);
  }
  // motos frente al edificio bajo (como en las fotos)
  for (let i = 0; i < 16; i++) place(P.motorcycle([0x111111, 0x8a1c1c, 0x1d3a6b, 0x222222][i % 4]), 10 + i * 1.0, 0, -35.5 + (rand() - 0.5) * 0.3, Math.PI / 2 + (rand() - 0.5) * 0.3);
  place(P.van(), 30, 0, -36, 0.1);
  place(P.van(), 42, 0, -30, Math.PI / 2 + 0.2);
  // postes de luz
  for (let x = -40; x <= 50; x += 15) {
    place(P.lampPost(), x, 0, -8.3, Math.PI / 2);
    colliders.push({ x, z: -8.3, r: 0.15 });
  }
  for (let x = -30; x <= 60; x += 22) place(P.lampPost(6), x, 0, 9.2, Math.PI);

  // ---------- vegetación ----------
  const palms = [[-41, 9], [-44.5, 6.5], [-47, 11], [45, 11], [58, 8], [62, 14], [-58, -10], [-60, -2], [70, -12], [66, -4], [14, 22], [-20, 30]];
  palms.forEach(([x, z], i) => {
    place(P.palm(9 + (i % 4) * 2.2, i + 3), x, 0, z, rand() * 6);
    colliders.push({ x, z, r: 0.45 });
  });
  const trees = [
    { x: -62, z: -60, h: 26, crown: 14, wide: true },
    { x: 35, z: -66, h: 30, crown: 15, wide: true },
    { x: 78, z: -28, h: 24, crown: 12, wide: true },
    { x: -80, z: 18, h: 22, crown: 12, wide: true },
    { x: 20, z: 95, h: 20, crown: 11, wide: true },
  ];
  // borde de selva alrededor del campus
  for (let i = 0; i < 260; i++) {
    const a = rand() * Math.PI * 2;
    const r = 95 + rand() * 90;
    const x = Math.cos(a) * r + 5;
    const z = Math.sin(a) * r - 10;
    trees.push({ x, z, h: 12 + rand() * 16, crown: 5 + rand() * 6 });
  }
  for (let i = 0; i < 70; i++) trees.push({ x: -40 + rand() * 120, z: -62 - rand() * 30, h: 14 + rand() * 14, crown: 5 + rand() * 6 });
  group.add(P.treeField(trees));
  for (const t of trees) if (Math.hypot(t.x, t.z) < 90) colliders.push({ x: t.x, z: t.z, r: 0.6 + t.h * 0.03 });

  B.flush(group);

  // ---------- interacciones ----------
  interactions.push({
    x: 12 + 1.3,
    y: FH,
    z: Z_ROOM + 0.7,
    r: 1.4,
    label: 'Entrar al Aula de sistemas',
    action: () => (location.href = 'aula.html'),
  });
  interactions.push({
    x: 4 + 1.3,
    y: 0,
    z: Z_ROOM + 0.7,
    r: 1.4,
    label: 'Entrar a la sala Mirar3D (ventana 3D)',
    action: () => (location.href = 'index.html'),
  });
  // carteles sobre esas dos puertas
  for (const [x, y, label] of [[13.3, FH + 2.45, 'AULA DE SISTEMAS'], [5.3, 2.45, 'SALA MIRAR3D']]) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#39a900';
    ctx.fillRect(0, 0, 512, 96);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 46px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 256, 50);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), new THREE.MeshBasicMaterial({ map: t }));
    sign.position.set(x, y, Z_ROOM + 0.13);
    group.add(sign);
  }

  // ---------- cielo, sol y ambiente ----------
  // Cielo real (HDRI de Poly Haven, CC0). Mientras carga se usa el cielo procedural.
  const sunDir = new THREE.Vector3(-0.45, 0.72, 0.53).normalize();
  const sky = new Sky();
  sky.scale.setScalar(2500);
  sky.material.uniforms.turbidity.value = 9;
  sky.material.uniforms.rayleigh.value = 1.8;
  sky.material.uniforms.mieCoefficient.value = 0.006;
  sky.material.uniforms.mieDirectionalG.value = 0.8;
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  skyScene.add(sky.clone());
  scene.environment = pmrem.fromScene(skyScene, 0.02).texture;
  scene.fog = new THREE.Fog(0xd8e2e6, 180, 1100);

  const sun = new THREE.DirectionalLight(0xfff2de, 3.0);
  const placeSun = (dir) => {
    sun.target.position.set(5, 0, -10);
    sun.position.copy(sun.target.position).addScaledVector(dir, 150);
  };
  placeSun(sunDir);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 20, far: 320 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x8a9a70, 0.45);
  scene.add(sun, sun.target, hemi);

  new RGBELoader().setDataType(THREE.FloatType).load('assets/cielo-tropical-2k.hdr', (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.remove(sky);
    scene.background = hdr;
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    // luz rebotada por el terreno, el piso y las paredes claras (el HDRI solo aporta la del cielo)
    hemi.color.set(0xdfe8f2);
    hemi.groundColor.set(0xc9b28f);
    hemi.intensity = 1.3;
    // el sol de la escena se coloca donde está el punto más brillante de la foto
    const dir = brightestDirection(hdr);
    if (dir.y > 0.15) placeSun(dir);
    scene.fog.color.copy(horizonColor(hdr));
  });

  // ---------- consultas para el jugador ----------
  function groundHeight(x, z, y) {
    let best = 0;
    for (const s of surfaces) {
      if (x < s.x1 || x > s.x2 || z < s.z1 || z > s.z2) continue;
      const h = s.h(x, z);
      if (h <= y + 0.55 && h > best) best = h;
    }
    return best;
  }

  function areaName(x, z, y) {
    const piso = y > FH * 1.75 ? 3 : y > FH * 0.75 ? 2 : 1;
    if (x > -TW && x < TW && z > Z_TBACK && z < Z_TFRONT) return `Escaleras · piso ${piso}`;
    if (x > R_X0 && x < R_X1 + 0.5 && z > R_Z0 && z < Z_GAL + 0.3) return `Rampas · piso ${piso}`;
    if (x > LOBBY[0] && x < LOBBY[1] && z > Z_BACK && z < Z_ROOM && piso === 1) return 'Hall de entrada';
    if (x > -XW && x < XW && z > Z_ROOM - 0.5 && z < Z_GAL + 0.5) return `Galería · piso ${piso}`;
    if (z < Z_BACK0 && z > -50 && x > -62 && x < 75) return 'Parqueadero';
    if (z > Z_GAL + 1) return 'Terreno frente al bloque';
    return 'Centro Tecnológico de la Amazonía';
  }

  return {
    colliders,
    groundHeight,
    areaName,
    interactions,
    spawn: { x: 0, z: 42, yaw: 0 },
    exposure: 0.65,
    near: 0.08,
    far: 1500,
    ao: { radius: 3, distanceExponent: 1, thickness: 8, scale: 1.6, samples: 16, blend: 1 },
    update: (t, dt) => updaters.forEach((u) => u(t, dt)),
  };
}

// Dirección (en la escena) del píxel más brillante de un HDRI equirectangular: el sol
function brightestDirection(hdr) {
  const { data, width, height } = hdr.image;
  let best = 0;
  let bi = 0;
  for (let i = 0; i < width * height; i++) {
    const l = data[i * 4] * 0.2126 + data[i * 4 + 1] * 0.7152 + data[i * 4 + 2] * 0.0722;
    if (l > best) {
      best = l;
      bi = i;
    }
  }
  const u = ((bi % width) + 0.5) / width;
  const v = 1 - (Math.floor(bi / width) + 0.5) / height; // la fila 0 es la parte de arriba del cielo
  const lat = (v - 0.5) * Math.PI;
  const lon = (u - 0.5) * 2 * Math.PI;
  return new THREE.Vector3(Math.cos(lon) * Math.cos(lat), Math.sin(lat), Math.sin(lon) * Math.cos(lat)).normalize();
}

// Color medio del cielo cerca del horizonte, para que la neblina lejana combine con el HDRI
function horizonColor(hdr) {
  const { data, width, height } = hdr.image;
  const row = Math.floor(height * 0.47);
  const c = [0, 0, 0];
  for (let x = 0; x < width; x++) for (let k = 0; k < 3; k++) c[k] += data[(row * width + x) * 4 + k];
  const col = new THREE.Color(c[0] / width, c[1] / width, c[2] / width);
  const m = Math.max(col.r, col.g, col.b) || 1;
  return col.multiplyScalar(0.85 / m);
}

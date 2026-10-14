import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxGeo, planeGeo } from '../room.js';
import { rng } from '../textures.js';
import * as AT from './textures.js';

// Aula de cómputo reconstruida a partir de las fotos.
// Planta (m): x ∈ [-3.6, 3.6] (oeste → este), z ∈ [-12, 0] (ventanal norte → pared sur), altura 2.75.
const W = 3.6;
const L = 12;
const H = 2.75;
const T = 0.15; // grosor de muros
const DESK_Y = 0.74;

export function createAulaWorld({ scene, renderer }) {
  RectAreaLightUniformsLib.init();
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const rand = rng(7);

  // ---------- materiales ----------
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: AT.wallPaint(), roughness: 0.92, envMapIntensity: 0.6 }),
    floor: new THREE.MeshStandardMaterial({ map: AT.terrazzo(), roughness: 0.32, envMapIntensity: 0.7 }),
    // techo tensado brillante: base blanca (con algo de luz rebotada) y una capa de barniz que refleja la sala
    ceiling: new THREE.MeshPhysicalMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.42, roughness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.04, envMapIntensity: 0.3 }),
    wood: new THREE.MeshStandardMaterial({ map: AT.laminate(), roughness: 0.5, envMapIntensity: 0.5 }),
    whiteMetal: new THREE.MeshStandardMaterial({ color: 0xf1f1ef, roughness: 0.4, metalness: 0.2 }),
    frame: new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.35, metalness: 0.3 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xdfeef2, roughness: 0.05, transparent: true, opacity: 0.18, envMapIntensity: 1.5, depthWrite: false }),
    black: new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.55 }),
    blackGloss: new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.12, envMapIntensity: 1.2 }),
    plasticGray: new THREE.MeshStandardMaterial({ color: 0x3a3b3f, roughness: 0.5 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.25, metalness: 0.9 }),
    mesh: new THREE.MeshStandardMaterial({ map: AT.chairMesh(), roughness: 0.8 }),
    silver: new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.3, metalness: 0.7 }),
    acWhite: new THREE.MeshStandardMaterial({ color: 0xf6f6f4, roughness: 0.35 }),
    panel: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.58, 1.52) }),
    tower: [null, null, null, null, null, null],
    lockers: null,
    whiteboard: new THREE.MeshStandardMaterial({ map: AT.whiteboard(), roughness: 0.15, envMapIntensity: 0.8 }),
    exit: new THREE.MeshBasicMaterial({ map: AT.exitSign() }),
    outside: new THREE.MeshBasicMaterial({ map: AT.foliage() }),
    outside2: new THREE.MeshBasicMaterial({ map: AT.foliage(106) }),
  };
  const towerFront = new THREE.MeshStandardMaterial({ map: AT.towerFront(), roughness: 0.5 });
  M.tower = [M.black, M.black, M.black, M.black, towerFront, M.black];
  const lockerFront = new THREE.MeshStandardMaterial({ map: AT.lockerFront(), roughness: 0.45, metalness: 0.4 });
  const lockerSide = new THREE.MeshStandardMaterial({ color: 0xb8bcbf, roughness: 0.45, metalness: 0.4 });
  M.lockers = [lockerFront, lockerSide, lockerSide, lockerSide, lockerSide, lockerSide];
  const screens = [1, 2, 3, 4, 5, 6].map((s) => new THREE.MeshBasicMaterial({ map: AT.screenContent(200 + s), toneMapped: true }));

  // ---------- utilidades ----------
  const add = (geo, mat, x, y, z, { ry = 0, cast = true, receive = true, parent = group } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = cast;
    m.receiveShadow = receive;
    parent.add(m);
    return m;
  };
  const box = (x1, x2, y1, y2, z1, z2, mat, opts = {}) =>
    add(boxGeo(x2 - x1, y2 - y1, z2 - z1), mat, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, opts);

  // Muro con vanos. axis 'x': corre a lo largo de x en la coordenada fija c (z); 'z': a lo largo de z en c (x).
  function wall(axis, a1, a2, c, holes = []) {
    const seg = (b1, b2, y1, y2) => {
      if (b2 - b1 < 1e-3 || y2 - y1 < 1e-3) return;
      if (axis === 'x') box(b1, b2, y1, y2, c - T / 2, c + T / 2, M.wall, { cast: false });
      else box(c - T / 2, c + T / 2, y1, y2, b1, b2, M.wall, { cast: false });
    };
    let cur = a1;
    for (const h of [...holes].sort((p, q) => p.a1 - q.a1)) {
      seg(cur, h.a1, 0, H);
      seg(h.a1, h.a2, 0, h.y1);
      seg(h.a1, h.a2, h.y2, H);
      cur = h.a2;
    }
    seg(cur, a2, 0, H);
  }

  // Ventana de aluminio blanco con travesaños horizontales (rows) y montantes cada `pane` m
  function windowFrame(axis, a1, a2, c, y1, y2, rows = [], pane = 1.0) {
    const fw = 0.05;
    const bar = (b1, b2, z1, z2) => {
      if (axis === 'x') box(b1, b2, z1, z2, c - 0.04, c + 0.04, M.frame, { cast: false });
      else box(c - 0.04, c + 0.04, z1, z2, b1, b2, M.frame, { cast: false });
    };
    for (const y of [y1, y2, ...rows]) bar(a1, a2, y - fw / 2, y + fw / 2);
    const n = Math.max(1, Math.round((a2 - a1) / pane));
    for (let i = 0; i <= n; i++) {
      const a = a1 + ((a2 - a1) * i) / n;
      bar(a - fw / 2, a + fw / 2, y1, y2);
    }
    const g = new THREE.Mesh(new THREE.PlaneGeometry(a2 - a1, y2 - y1), M.glass);
    g.position.set(axis === 'x' ? (a1 + a2) / 2 : c, (y1 + y2) / 2, axis === 'x' ? c : (a1 + a2) / 2);
    if (axis === 'z') g.rotation.y = Math.PI / 2;
    g.renderOrder = 2;
    group.add(g);
  }

  // ---------- envolvente ----------
  // suelo y techo
  const floor = add(planeGeo(2 * W + 0.3, L + 1.3), M.floor, 0, 0, -L / 2 + 0.5, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  const ceiling = add(planeGeo(2 * W, L + 1.2), M.ceiling, 0, H, -L / 2 + 0.5, { cast: false });
  ceiling.rotation.x = Math.PI / 2;

  // pared norte: ventanal casi completo (con un tramo macizo al oeste)
  const nWin = { a1: -2.35, a2: W, y1: 0.85, y2: 2.6 };
  wall('x', -W - T, W + T, -L - T / 2, [nWin]);
  windowFrame('x', nWin.a1, nWin.a2, -L - T / 2, nWin.y1, nWin.y2, [1.15, 2.3], 0.92);

  // pared este: TV, pizarra y salida
  wall('z', -L - T, 0, W + T / 2);
  // pared oeste
  wall('z', -L - T, 0, -W - T / 2);

  // pared sur: puerta de vidrio (este), nicho elevado con los aires (centro) y ventana (oeste)
  const door = { a1: 2.3, a2: 3.3, y1: 0, y2: 2.55 };
  const niche = { a1: -1.1, a2: 1.9, y1: 0, y2: 2.45 };
  const sWin = { a1: -3.0, a2: -1.3, y1: 0.8, y2: 2.45 };
  wall('x', -W - T, W + T, T / 2, [door, niche, sWin]);
  windowFrame('x', sWin.a1, sWin.a2, T / 2, sWin.y1, sWin.y2, [], 0.85);
  windowFrame('x', door.a1, door.a2, T / 2, 2.1, door.y2, [], 1.0); // montante sobre la puerta
  // hoja de la puerta
  box(door.a1, door.a1 + 0.05, 0, 2.1, 0.04, 0.11, M.frame, { cast: false });
  box(door.a2 - 0.05, door.a2, 0, 2.1, 0.04, 0.11, M.frame, { cast: false });
  box(door.a1, door.a2, 0, 0.12, 0.04, 0.11, M.frame, { cast: false });
  box(door.a1 + 0.12, door.a1 + 0.15, 0.9, 1.15, 0.0, 0.04, M.chrome, { cast: false });
  const dg = add(new THREE.PlaneGeometry(door.a2 - door.a1 - 0.1, 2.0), M.glass, (door.a1 + door.a2) / 2, 1.1, 0.075, { cast: false });
  dg.renderOrder = 2;

  // nicho: fondo, laterales, techo bajo y tarima
  const nd = 1.0; // profundidad
  box(niche.a1, niche.a2, 0, H, nd + T / 2, nd + T * 1.5, M.wall, { cast: false });
  box(niche.a1 - T, niche.a1, 0, H, T / 2, nd + T, M.wall, { cast: false });
  box(niche.a2, niche.a2 + T, 0, H, T / 2, nd + T, M.wall, { cast: false });
  box(niche.a1, niche.a2, niche.y2, H, -0.05, T, M.wall, { cast: false }); // dintel
  const nCeil = add(planeGeo(niche.a2 - niche.a1, nd + 0.2), M.ceiling, (niche.a1 + niche.a2) / 2, H - 0.01, nd / 2, { cast: false });
  nCeil.rotation.x = Math.PI / 2;
  box(niche.a1, niche.a2, 0, 0.22, -0.02, nd + T / 2, M.floor, { cast: false }); // tarima
  box(niche.a1, niche.a2, 0.02, 0.2, -0.03, -0.02, M.whiteMetal, { cast: false }); // canto
  for (const x of [-0.35, 1.05]) acUnit(x, 2.2, nd + 0.04);
  // canaleta de los aires
  box(-0.05, 0.0, 0.3, 2.1, nd + 0.03, nd + 0.07, M.acWhite, { cast: false });
  box(-0.85, 1.55, 2.38, 2.42, nd + 0.03, nd + 0.07, M.acWhite, { cast: false });

  // exterior: vegetación detrás de las ventanas
  const outN = add(new THREE.PlaneGeometry(26, 11), M.outside, 0, 2.2, -L - 4, { cast: false, receive: false });
  outN.renderOrder = 0;
  const outS = add(new THREE.PlaneGeometry(10, 8), M.outside2, -2, 2, 4, { cast: false, receive: false, ry: Math.PI });
  outS.renderOrder = 0;
  // pasillo blanco tras la puerta
  box(1.9, 4.5, 0, H, 2.6, 2.8, M.wall, { cast: false });

  // zócalo
  for (const [x1, x2, z1, z2] of [[-W, W, -L, -L + 0.012], [-W, -W + 0.012, -L, 0], [W - 0.012, W, -L, 0]]) box(x1, x2, 0, 0.1, z1, z2, M.whiteMetal, { cast: false });

  // columna redonda
  add(new THREE.CylinderGeometry(0.22, 0.22, H, 32), M.wall, -1.85, H / 2, -6.6);
  colliders.push({ x: -1.85, z: -6.6, r: 0.22 });

  // ---------- techo: paneles LED, access point ----------
  const panels = [
    [-1.2, -2.6, 1.2, 0.6],
    [1.6, -3.3, 1.2, 0.6],
    [-1.4, -6.6, 1.2, 0.18],
    [1.2, -6.3, 1.2, 0.18],
    [-1.4, -9.6, 1.2, 0.18],
    [1.2, -9.4, 1.2, 0.18],
  ];
  for (const [x, z, w, d] of panels) {
    box(x - w / 2 - 0.02, x + w / 2 + 0.02, H - 0.03, H, z - d / 2 - 0.02, z + d / 2 + 0.02, M.whiteMetal, { cast: false });
    const p = add(new THREE.PlaneGeometry(w, d), M.panel, x, H - 0.031, z, { cast: false, receive: false });
    p.rotation.x = Math.PI / 2;
    const light = new THREE.RectAreaLight(0xfff6ea, 9, w, Math.max(d, 0.3));
    light.position.set(x, H - 0.035, z);
    light.lookAt(x, 0, z);
    group.add(light);
  }
  add(new THREE.CylinderGeometry(0.12, 0.13, 0.04, 24), M.acWhite, 0.4, H - 0.02, -8.0, { cast: false });
  add(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 24), M.acWhite, 1.6, H - 0.03, -10.5, { cast: false });

  // ---------- pared este: TV, pizarra, letreros ----------
  box(W - 0.06, W, 1.38, 2.1, -9.6, -8.35, M.blackGloss);
  box(W - 0.03, W, 1.0, 2.2, -6.35, -4.45, M.silver, { cast: false });
  add(new THREE.PlaneGeometry(1.86, 1.14), M.whiteboard, W - 0.035, 1.6, -5.4, { cast: false, ry: -Math.PI / 2 });
  box(W - 0.1, W, 1.0, 1.03, -6.3, -4.5, M.silver, { cast: false }); // bandeja
  add(new THREE.PlaneGeometry(0.34, 0.17), M.exit, W - 0.012, 1.95, -3.2, { cast: false, ry: -Math.PI / 2 });
  add(new THREE.PlaneGeometry(0.34, 0.17), M.exit, (door.a1 + door.a2) / 2, 2.65, -0.002, { cast: false, ry: Math.PI });
  // cable de la TV
  box(W - 0.02, W, 0.35, 1.38, -8.95, -8.93, M.black, { cast: false });

  // ---------- casilleros (pared oeste, junto a la ventana sur) ----------
  add(new THREE.BoxGeometry(0.45, 1.85, 1.3), M.lockers, -W + 0.225, 0.925, -0.95);
  colliders.push({ x1: -W, x2: -W + 0.45, z1: -1.6, z2: -0.3 });
  const mat = add(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 16), new THREE.MeshStandardMaterial({ color: 0xc46a8a, roughness: 0.7 }), -W + 0.25, 1.92, -0.95, { cast: true });
  mat.rotation.x = Math.PI / 2;

  // ---------- mobiliario ----------
  const chairGeo = buildChair();
  const monitorGeo = buildMonitor();

  function desk(x1, x2, z1, z2, legsAlong = 'z') {
    box(x1, x2, DESK_Y - 0.03, DESK_Y, z1, z2, M.wood);
    // patas: marcos blancos cada ~1.6 m
    const len = legsAlong === 'z' ? z2 - z1 : x2 - x1;
    const n = Math.max(1, Math.round(len / 1.6));
    for (let i = 0; i <= n; i++) {
      const a = (legsAlong === 'z' ? z1 : x1) + (len * i) / n;
      const a1 = Math.min(Math.max(a - 0.025, legsAlong === 'z' ? z1 : x1), (legsAlong === 'z' ? z2 : x2) - 0.05);
      if (legsAlong === 'z') {
        for (const x of [x1 + 0.04, x2 - 0.08]) box(x, x + 0.04, 0, DESK_Y - 0.03, a1, a1 + 0.05, M.whiteMetal);
        box(x1 + 0.04, x2 - 0.04, DESK_Y - 0.08, DESK_Y - 0.03, a1, a1 + 0.05, M.whiteMetal, { cast: false });
      } else {
        for (const z of [z1 + 0.04, z2 - 0.08]) box(a1, a1 + 0.05, 0, DESK_Y - 0.03, z, z + 0.04, M.whiteMetal);
      }
    }
  }

  function chair(x, z, facing, y = 0) {
    const g = new THREE.Group();
    for (const [geo, material] of chairGeo) {
      const m = new THREE.Mesh(geo, material);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    g.position.set(x, y, z);
    g.rotation.y = facing + (rand() - 0.5) * 0.5;
    group.add(g);
  }

  // facing: ángulo hacia el que mira la pantalla/persona (0 = +z)
  function monitor(x, z, facing, on = false) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(monitorGeo, M.black));
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.53, 0.3), on ? screens[Math.floor(rand() * screens.length)] : M.blackGloss);
    s.position.set(0, 0.36, 0.016);
    g.add(s);
    g.position.set(x, DESK_Y, z);
    g.rotation.y = facing;
    g.traverse((o) => (o.castShadow = true));
    group.add(g);
  }

  function laptop(x, z, facing, on = rand() < 0.6) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.018, 0.24), M.plasticGray);
    base.position.y = 0.009;
    const lid = new THREE.Group();
    lid.position.set(0, 0.018, -0.12);
    lid.rotation.x = -0.32;
    const lidBox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.23, 0.008), M.plasticGray);
    lidBox.position.y = 0.115;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.2), on ? screens[Math.floor(rand() * screens.length)] : M.blackGloss);
    scr.position.set(0, 0.118, 0.0045);
    lid.add(lidBox, scr);
    g.add(base, lid);
    g.position.set(x, DESK_Y, z);
    g.rotation.y = facing + (rand() - 0.5) * 0.3;
    g.traverse((o) => (o.castShadow = true));
    group.add(g);
  }

  function keyboard(x, z, facing) {
    const g = new THREE.Group();
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.02, 0.14), M.black);
    k.position.y = 0.01;
    const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), M.black);
    mouse.scale.set(1, 0.5, 1.6);
    mouse.position.set(0.32, 0.012, 0);
    g.add(k, mouse);
    g.position.set(x, DESK_Y, z);
    g.rotation.y = facing;
    group.add(g);
  }

  function tower(x, z, facing, y = DESK_Y) {
    add(new THREE.BoxGeometry(0.19, 0.43, 0.42), M.tower, x, y + 0.215, z, { ry: facing });
  }

  function allInOne(x, z, facing) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.02), M.silver);
    body.position.y = 0.36;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.33), M.blackGloss);
    scr.position.set(0, 0.39, 0.011);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.02), M.silver);
    stand.position.set(0, 0.1, -0.05);
    stand.rotation.x = 0.25;
    g.add(body, scr, stand);
    g.position.set(x, DESK_Y, z);
    g.rotation.y = facing;
    g.traverse((o) => (o.castShadow = true));
    group.add(g);
  }

  const E = Math.PI / 2; // mirar hacia +x (este)
  const Wd = -Math.PI / 2; // mirar hacia -x (oeste)

  // mesa doble central (personas a ambos lados)
  const cx1 = -0.6;
  const cx2 = 0.9;
  const cz1 = -10.6;
  const cz2 = -2.6;
  desk(cx1, cx2, cz1, cz2);
  colliders.push({ x1: cx1, x2: cx2, z1: cz1, z2: cz2 });
  for (let z = cz1 + 0.6; z < cz2 - 0.3; z += 1.2) {
    // lado oeste: miran al este
    if (rand() < 0.6) {
      monitor(0.05, z, Wd, rand() < 0.3);
      keyboard(-0.38, z, Wd);
    } else laptop(-0.3, z, Wd);
    // lado este: miran al oeste
    if (rand() < 0.7) {
      monitor(0.25, z + 0.1, E, rand() < 0.3);
      keyboard(0.6, z + 0.1, E);
    } else laptop(0.55, z, E);
    if (rand() < 0.55) tower(0.15, z + 0.55, rand() < 0.5 ? E : Wd);
    chair(-1.05, z + (rand() - 0.5) * 0.2, E);
    if (rand() < 0.8) chair(1.4, z + (rand() - 0.5) * 0.2, Wd);
  }
  allInOne(0.15, cz2 - 0.2, 0);

  // mesón corrido contra la pared oeste (miran a la pared)
  const wx1 = -W;
  const wx2 = -2.95;
  const wz1 = -11.5;
  const wz2 = -1.75;
  desk(wx1, wx2, wz1, wz2);
  colliders.push({ x1: wx1, x2: wx2, z1: wz1, z2: wz2 });
  for (let z = wz1 + 0.6; z < wz2 - 0.3; z += 1.15) {
    if (rand() < 0.55) {
      monitor(-3.42, z, E, rand() < 0.25);
      keyboard(-3.12, z, E);
    } else laptop(-3.2, z, E);
    if (rand() < 0.4) tower(-3.45, z + 0.5, E);
    chair(-2.5, z + (rand() - 0.5) * 0.2, Wd);
  }

  // mesón corto en la pared este, junto al ventanal
  desk(2.95, W, -11.6, -10.0);
  colliders.push({ x1: 2.95, x2: W, z1: -11.6, z2: -10.0 });
  laptop(3.2, -10.9, Wd);
  chair(2.5, -10.8, E);

  // sillas en la tarima del nicho
  chair(-0.25, 0.55, Math.PI, 0.22);
  chair(1.05, 0.55, Math.PI, 0.22);

  // ---------- luz natural y ambiente ----------
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.background = new THREE.Color(0xdfe9ec);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xe2ded6, 1.1); // luz rebotada en paredes y techo blancos
  const day = new THREE.DirectionalLight(0xfff4e4, 1.6);
  day.position.set(-3, 7, -20);
  day.target.position.set(0, 0, -6);
  day.castShadow = true;
  day.shadow.mapSize.set(2048, 2048);
  Object.assign(day.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 5, far: 40 });
  day.shadow.bias = -0.0005;
  day.shadow.normalBias = 0.02;
  group.add(hemi, day, day.target);

  // reflejos del techo brillante: captura la sala una vez en un cubemap
  const cubeRT = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(0.05, 50, cubeRT);
  cubeCam.position.set(0.2, 1.4, -6);
  ceiling.visible = nCeil.visible = false;
  cubeCam.update(renderer, scene);
  ceiling.visible = nCeil.visible = true;
  M.ceiling.envMap = cubeRT.texture;

  // aire acondicionado tipo split
  function acUnit(x, y, z) {
    box(x - 0.43, x + 0.43, y - 0.14, y + 0.14, z, z + 0.21, M.acWhite);
    box(x - 0.38, x + 0.38, y - 0.12, y - 0.1, z - 0.002, z, M.plasticGray, { cast: false });
    box(x + 0.25, x + 0.33, y + 0.06, y + 0.08, z - 0.002, z, M.plasticGray, { cast: false });
  }

  // colisiones: paredes y tarima del nicho (la puerta queda cerrada)
  colliders.push(
    { x1: -W - 2, x2: -W, z1: -L - 2, z2: 2 },
    { x1: W, x2: W + 2, z1: -L - 2, z2: 2 },
    { x1: -W - 2, x2: W + 2, z1: -L - 2, z2: -L },
    { x1: -W - 2, x2: W + 2, z1: 0, z2: 2 },
  );

  return {
    colliders,
    groundHeight: () => 0,
    areaName: (x, z) => (z < -10.3 ? 'Ventanal' : z > -1.8 ? 'Entrada' : x > 2.4 && z > -7 ? 'Pizarra' : 'Aula de sistemas'),
    spawn: { x: -1.5, z: -1.2, yaw: 0 },
    interactions: [{ x: 2.8, y: 0, z: -0.7, r: 1.3, label: 'Salir a la galería del SENA', action: () => (location.href = 'sena.html') }],
    exposure: 1.1,
    near: 0.05,
    far: 200,
    fov: 75,
  };
}

// Silla de oficina con respaldo de malla. Devuelve [geometría, material] fusionadas por material.
function buildChair() {
  const black = [];
  const chrome = [];
  const meshParts = [];
  const put = (list, geo, x, y, z, rx = 0, ry = 0) => {
    geo.rotateX(rx);
    geo.rotateY(ry);
    geo.translate(x, y, z);
    list.push(geo);
  };
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = new THREE.BoxGeometry(0.04, 0.03, 0.3);
    leg.translate(0, 0, 0.15);
    put(chrome, leg, 0, 0.07, 0, 0, a);
    const wheel = new THREE.SphereGeometry(0.028, 10, 8);
    put(black, wheel, Math.sin(a) * 0.29, 0.028, Math.cos(a) * 0.29);
  }
  put(chrome, new THREE.CylinderGeometry(0.022, 0.022, 0.34, 12), 0, 0.25, 0);
  put(black, new THREE.CylinderGeometry(0.04, 0.04, 0.08, 12), 0, 0.38, 0);
  const seat = new THREE.BoxGeometry(0.48, 0.07, 0.46);
  put(black, seat, 0, 0.47, 0.02);
  // respaldo: marco + malla, inclinado
  const back = new THREE.BoxGeometry(0.44, 0.46, 0.025);
  put(meshParts, back, 0, 0.8, -0.24, -0.12);
  const frameTop = new THREE.BoxGeometry(0.46, 0.03, 0.035);
  put(black, frameTop, 0, 1.03, -0.27, -0.12);
  for (const s of [-1, 1]) {
    put(black, new THREE.BoxGeometry(0.03, 0.48, 0.035), s * 0.23, 0.8, -0.24, -0.12);
    put(black, new THREE.BoxGeometry(0.03, 0.2, 0.03), s * 0.25, 0.6, -0.05);
    put(black, new THREE.BoxGeometry(0.06, 0.025, 0.26), s * 0.25, 0.71, 0.0);
  }
  put(black, new THREE.BoxGeometry(0.06, 0.2, 0.03), 0, 0.58, -0.22);
  const mats = chairMats();
  return [
    [mergeGeometries(black), mats.black],
    [mergeGeometries(chrome), mats.chrome],
    [mergeGeometries(meshParts), mats.mesh],
  ];
}

let _chairMats;
function chairMats() {
  _chairMats ??= {
    black: new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.6 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0x9fa4aa, roughness: 0.3, metalness: 0.85 }),
    mesh: new THREE.MeshStandardMaterial({ map: AT.chairMesh(), roughness: 0.85 }),
  };
  return _chairMats;
}

// Monitor de 24": pantalla + cuello + base (fusionados); mira hacia +z
function buildMonitor() {
  const parts = [];
  const bezel = new THREE.BoxGeometry(0.56, 0.34, 0.03);
  bezel.translate(0, 0.36, 0);
  const neck = new THREE.BoxGeometry(0.05, 0.22, 0.03);
  neck.translate(0, 0.12, -0.04);
  const foot = new THREE.BoxGeometry(0.22, 0.015, 0.16);
  foot.translate(0, 0.008, -0.03);
  parts.push(bezel, neck, foot);
  return mergeGeometries(parts);
}

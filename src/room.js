import * as THREE from 'three';
import { rng } from './textures.js';

// Geometrías con UV en unidades del mundo para que las texturas no se estiren
export function boxGeo(w, h, d, rand) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x -x +y -y +z -z
  const ou = rand ? rand() * 5 : 0;
  const ov = rand ? rand() * 5 : 0;
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] + ou, uv.getY(k) * dims[f][1] + ov);
    }
  }
  return g;
}

export function planeGeo(w, h) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w, uv.getY(k) * h);
  return g;
}

function triangleFrame(w, h, apexUp, inset = 0.07, depth = 0.05) {
  const s = apexUp ? 1 : -1;
  const outer = new THREE.Shape([
    new THREE.Vector2(-w / 2, -s * h),
    new THREE.Vector2(w / 2, -s * h),
    new THREE.Vector2(0, 0),
  ]);
  // triángulo interior reducido hacia el centroide
  const cy = (-s * h * 2) / 3;
  const k = 1 - (inset * 3) / h;
  const inner = [
    new THREE.Vector2((-w / 2) * k, cy + (-s * h - cy) * k),
    new THREE.Vector2((w / 2) * k, cy + (-s * h - cy) * k),
    new THREE.Vector2(0, cy + (0 - cy) * k),
  ];
  outer.holes.push(new THREE.Path(inner.slice().reverse()));
  const frame = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1 });
  const fill = new THREE.ShapeGeometry(new THREE.Shape(inner));
  return { frame, fill };
}

function vaseGeo(kind) {
  const profiles = {
    amphora: [[0, 0], [0.035, 0], [0.05, 0.03], [0.058, 0.08], [0.05, 0.14], [0.026, 0.18], [0.022, 0.22], [0.034, 0.235], [0, 0.235]],
    jar: [[0, 0], [0.04, 0], [0.05, 0.05], [0.05, 0.12], [0.035, 0.15], [0.038, 0.17], [0, 0.17]],
    bowl: [[0, 0], [0.03, 0], [0.06, 0.035], [0.07, 0.06], [0.064, 0.062], [0, 0.03]],
    tall: [[0, 0], [0.03, 0], [0.035, 0.06], [0.03, 0.2], [0.022, 0.26], [0.03, 0.28], [0, 0.28]],
  };
  const pts = profiles[kind].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 24);
}

/**
 * Construye el salón detrás de la pantalla.
 * La pantalla ocupa x ∈ [-hw, hw], y ∈ [-hh, hh] en z = 0; el salón va de z = 0 a z = -D.
 * Cada malla lleva userData.slot ('wall', 'floor', 'ceil', 'stone', 'trim', 'frieze', 'plaque')
 * para que cada tema le asigne su material.
 */
export function buildRoom(hw, hh, D) {
  const group = new THREE.Group();
  const parts = [];
  const ledges = []; // bordes frontales superiores de los bloques (para neones, plantas…)
  const tops = []; // superficies superiores
  const rand = rng(42);
  const W = hw * 2;
  const y0 = -hh;
  const X = (f) => -hw + f * W;
  const Z = (f) => -f * D; // fracción de profundidad (0 = pantalla, 1 = fondo)

  const add = (geo, slot, x, y, z, { cast = true, rot } = {}) => {
    const m = new THREE.Mesh(geo);
    m.position.set(x, y, z);
    if (rot) m.rotation.set(...rot);
    m.castShadow = cast;
    m.receiveShadow = true;
    m.userData.slot = slot;
    group.add(m);
    parts.push(m);
    return m;
  };

  const block = (x1, x2, ya, yb, z1, z2, slot = 'stone', record = true) => {
    const m = add(boxGeo(x2 - x1, yb - ya, z2 - z1, rand), slot, (x1 + x2) / 2, (ya + yb) / 2, (z1 + z2) / 2);
    if (record) {
      ledges.push({ x1, x2, y: yb, z: z2 });
      tops.push({ x1, x2, z1, z2, y: yb });
    }
    return m;
  };

  // --- carcasa ---
  const ext = 0.03; // se prolonga un poco hacia la pantalla para no dejar rendijas
  add(planeGeo(W, 2 * hh), 'wall', 0, 0, -D, { cast: false });
  add(planeGeo(D + ext, 2 * hh), 'wall', -hw, 0, -D / 2 + ext / 2, { cast: false, rot: [0, Math.PI / 2, 0] });
  add(planeGeo(D + ext, 2 * hh), 'wall', hw, 0, -D / 2 + ext / 2, { cast: false, rot: [0, -Math.PI / 2, 0] });
  add(planeGeo(W, D + ext), 'floor', 0, y0, -D / 2 + ext / 2, { cast: false, rot: [-Math.PI / 2, 0, 0] });
  add(planeGeo(W, D + ext), 'ceil', 0, hh, -D / 2 + ext / 2, { cast: false, rot: [Math.PI / 2, 0, 0] });

  // --- friso superior ---
  const fy = hh * 0.66;
  const fh = 0.22;
  add(planeGeo(W, fh), 'frieze', 0, fy, -D + 0.004, { cast: false });
  add(planeGeo(D, fh), 'frieze', -hw + 0.004, fy, -D / 2, { cast: false, rot: [0, Math.PI / 2, 0] });
  add(planeGeo(D, fh), 'frieze', hw - 0.004, fy, -D / 2, { cast: false, rot: [0, -Math.PI / 2, 0] });
  // molduras del friso
  for (const yy of [fy - fh / 2 - 0.015, fy + fh / 2 + 0.015]) {
    block(-hw, hw, yy - 0.015, yy + 0.015, -D, -D + 0.04, 'trim', false);
    block(-hw, -hw + 0.04, yy - 0.015, yy + 0.015, -D, 0, 'trim', false);
    block(hw - 0.04, hw, yy - 0.015, yy + 0.015, -D, 0, 'trim', false);
  }

  // --- plataforma izquierda escalonada + sarcófago ---
  const t1 = 0.14;
  const t2 = 0.28;
  block(X(0), X(0.47), y0, y0 + t1, -D, Z(0.2));
  block(X(0), X(0.43), y0 + t1, y0 + t2, -D, Z(0.36));
  const sx1 = X(0.03);
  const sx2 = X(0.21);
  const sz1 = -D + 0.06;
  const sz2 = Z(0.56);
  const sTop = y0 + t2 + 0.5;
  block(sx1, sx2, y0 + t2, sTop, sz1, sz2, 'stone', false);
  block(sx1 - 0.025, sx2 + 0.025, sTop, sTop + 0.06, sz1 - 0.02, sz2 + 0.025, 'trim', false);
  tops.push({ x1: sx1, x2: sx2, z1: sz1, z2: sz2, y: sTop + 0.06 });
  add(planeGeo(sx2 - sx1 - 0.08, 0.32), 'plaque', (sx1 + sx2) / 2, y0 + t2 + 0.25, sz2 + 0.003, { cast: false });
  add(planeGeo(sz2 - sz1 - 0.12, 0.32), 'plaque', sx2 + 0.003, y0 + t2 + 0.25, (sz1 + sz2) / 2, { cast: false, rot: [0, Math.PI / 2, 0] });

  // --- altar central del fondo + mueble frontal ---
  block(X(0.36), X(0.6), y0, y0 + 0.3, -D, -D + 0.45);
  const cx1 = X(0.47);
  const cx2 = X(0.62);
  const cz2 = Z(0.4);
  block(cx1, cx2, y0, y0 + 0.38, Z(0.62), cz2);
  block(cx1 - 0.02, cx2 + 0.02, y0 + 0.38, y0 + 0.41, Z(0.62) - 0.02, cz2 + 0.02, 'trim', false);
  add(planeGeo(cx2 - cx1 - 0.06, 0.26), 'plaque', (cx1 + cx2) / 2, y0 + 0.19, cz2 + 0.003, { cast: false });

  // --- escalera derecha ---
  const steps = 4;
  const sh = 0.16;
  for (let i = 0; i < steps; i++) block(X(0.66 + i * 0.085), X(1), y0 + i * sh, y0 + (i + 1) * sh, -D, Z(0.46));
  block(X(0.68), X(0.86), y0, y0 + 0.1, Z(0.3), Z(0.12));

  // --- decoración del fondo: dos triángulos en "reloj de arena" + repisas ---
  const xc = X(0.47);
  const yc = 0.02;
  const tw = 0.62;
  const th = 0.4;
  for (const up of [true, false]) {
    const { frame, fill } = triangleFrame(tw, th, up);
    add(frame, 'trim', xc, yc, -D + 0.005);
    add(fill, 'plaque', xc, yc, -D + 0.012, { cast: false });
  }
  const shelves = [];
  for (const side of [-1, 1]) {
    const sx = xc + side * (tw / 2 + 0.24);
    const syy = yc + 0.12;
    block(sx - 0.24, sx + 0.24, syy - 0.02, syy + 0.02, -D, -D + 0.17, 'trim', false);
    // ménsula triangular
    const br = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.12, 0), new THREE.Vector2(0, -0.12)]);
    const g = new THREE.ExtrudeGeometry(br, { depth: 0.03, bevelEnabled: false });
    g.rotateY(-Math.PI / 2);
    for (const bx of [-0.17, 0.17]) add(g, 'trim', sx + bx + 0.015, syy - 0.02, -D, { cast: false });
    shelves.push({ x: sx, y: syy + 0.02, z: -D + 0.09 });
  }

  // --- vasijas ---
  const vase = (kind, x, y, z, s = 1) => {
    const m = add(vaseGeo(kind), 'trim', x, y, z);
    m.scale.setScalar(s);
    return m;
  };
  vase('amphora', shelves[0].x - 0.12, shelves[0].y, shelves[0].z, 0.9);
  vase('jar', shelves[0].x + 0.06, shelves[0].y, shelves[0].z, 0.8);
  vase('bowl', shelves[1].x - 0.08, shelves[1].y, shelves[1].z, 0.9);
  vase('tall', shelves[1].x + 0.12, shelves[1].y, shelves[1].z, 0.7);
  vase('tall', X(0.26), y0 + t2, Z(0.62), 1.2);
  vase('tall', X(0.32), y0 + t2, Z(0.66), 1.0);
  vase('amphora', X(0.4), y0 + t2, -D + 0.25, 1.1);
  vase('jar', X(0.56), y0 + 0.41, Z(0.52), 0.7);
  vase('bowl', X(0.44), y0 + 0.3, -D + 0.2, 0.8);
  vase('jar', X(0.95), y0 + steps * sh, -D + 0.25, 0.9);

  return {
    group,
    parts,
    ledges,
    tops,
    dims: { hw, hh, D, W, y0 },
    X,
    Z,
    anchors: {
      torchL: new THREE.Vector3(-hw, 0.12, Z(0.48)),
      torchR: new THREE.Vector3(hw, 0.12, Z(0.48)),
      decor: new THREE.Vector3(xc, yc, -D),
      pool: { x1: X(0.12), x2: X(0.44), z1: Z(0.18), z2: Z(0.03) },
    },
  };
}

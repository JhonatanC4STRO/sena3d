import * as THREE from 'three';

// ---------- utilidades ----------

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
const gray = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Lienzo doble: color + relieve (bump), opcionalmente emisivo
function layers(w, h = w, { emissive = false } = {}) {
  const c = makeCanvas(w, h);
  const b = makeCanvas(w, h);
  const L = { w, h, c, b, cx: c.getContext('2d'), bx: b.getContext('2d') };
  if (emissive) {
    L.e = makeCanvas(w, h);
    L.ex = L.e.getContext('2d');
    L.ex.fillStyle = '#000';
    L.ex.fillRect(0, 0, w, h);
  }
  return L;
}

// Dibuja fn en (x,y) y en sus copias desplazadas para que la textura sea repetible
function wrap(L, x, y, r, fn) {
  for (const ox of [-L.w, 0, L.w]) {
    for (const oy of [-L.h, 0, L.h]) {
      const px = x + ox;
      const py = y + oy;
      if (px + r < 0 || px - r > L.w || py + r < 0 || py - r > L.h) continue;
      fn(px, py);
    }
  }
}

function blot(ctx, L, x, y, r, color) {
  wrap(L, x, y, r, (px, py) => {
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, color);
    g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = g;
    ctx.fillRect(px - r, py - r, r * 2, r * 2);
  });
}

function grain(ctx, w, h, amount, rand) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// Camino aleatorio (grieta) — mismos puntos para todos los lienzos
function crackPath(rand, x, y, len, step = 6, turn = 1.1) {
  const pts = [[x, y]];
  let ang = rand() * Math.PI * 2;
  for (let i = 0; i < len; i++) {
    ang += (rand() - 0.5) * turn;
    x += Math.cos(ang) * step;
    y += Math.sin(ang) * step;
    pts.push([x, y]);
  }
  return pts;
}

function strokePath(ctx, pts, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

function crack(L, rand, x, y, len, colorC, colorB, width = 1.5) {
  const pts = crackPath(rand, x, y, len);
  strokePath(L.cx, pts, colorC, width);
  strokePath(L.bx, pts, colorB, width);
}

// Bloques de piedra / losas. Devuelve la lista de rectángulos para decorar después.
function blocks(L, rand, { rows, cols, mortar = 4, base, vary = [4, 6, 8], mortarColor, stagger = 0.5, irregular = 0 }) {
  const { cx, bx, w, h } = L;
  cx.fillStyle = mortarColor;
  cx.fillRect(0, 0, w, h);
  bx.fillStyle = gray(40);
  bx.fillRect(0, 0, w, h);

  const rects = [];
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const nCols = typeof cols === 'function' ? cols(r) : cols;
    const cw = w / nCols;
    const off = (r % 2) * stagger * cw + (irregular ? rand() * cw * irregular : 0);
    // anchos irregulares que suman w
    const widths = [];
    let sum = 0;
    for (let c = 0; c < nCols; c++) {
      const ww = cw * (1 + (irregular ? (rand() - 0.5) * irregular : 0));
      widths.push(ww);
      sum += ww;
    }
    let x = off;
    for (let c = 0; c < nCols; c++) {
      const ww = (widths[c] * w) / sum;
      const rect = { x: x + mortar / 2, y: r * rh + mortar / 2, w: ww - mortar, h: rh - mortar };
      const col = hsl(
        base[0] + (rand() - 0.5) * vary[0],
        base[1] + (rand() - 0.5) * vary[1],
        base[2] + (rand() - 0.5) * vary[2],
      );
      const hv = 170 + rand() * 50;
      for (const ox of [-w, 0, w]) {
        cx.fillStyle = col;
        cx.fillRect(rect.x + ox, rect.y, rect.w, rect.h);
        // biselado: bordes algo más bajos en el relieve
        bx.fillStyle = gray(hv - 50);
        bx.fillRect(rect.x + ox, rect.y, rect.w, rect.h);
        bx.fillStyle = gray(hv);
        bx.fillRect(rect.x + ox + 3, rect.y + 3, rect.w - 6, rect.h - 6);
        // luz suave en el borde superior del bloque
        cx.fillStyle = 'rgba(255,255,255,0.05)';
        cx.fillRect(rect.x + ox, rect.y, rect.w, 3);
        cx.fillStyle = 'rgba(0,0,0,0.10)';
        cx.fillRect(rect.x + ox, rect.y + rect.h - 3, rect.w, 3);
      }
      rects.push(rect);
      x += ww;
    }
  }
  return rects;
}

function finish(L, tile, { colorSpace = true } = {}) {
  const tex = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.repeat.set(1 / tile[0], 1 / tile[1]);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return {
    map: tex(L.c, colorSpace),
    bump: tex(L.b, false),
    emissive: L.e ? tex(L.e, true) : null,
  };
}

// ---------- jeroglíficos ----------

function glyph(ctx, type, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(1.5, s * 0.11);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (type) {
    case 0: // ankh
      ctx.ellipse(0, -s * 0.25, s * 0.16, s * 0.2, 0, 0, Math.PI * 2);
      ctx.moveTo(0, -s * 0.05);
      ctx.lineTo(0, s * 0.45);
      ctx.moveTo(-s * 0.28, 0.02 * s);
      ctx.lineTo(s * 0.28, 0.02 * s);
      ctx.stroke();
      break;
    case 1: // ojo
      ctx.moveTo(-s * 0.4, 0);
      ctx.quadraticCurveTo(0, -s * 0.32, s * 0.4, 0);
      ctx.quadraticCurveTo(0, s * 0.25, -s * 0.4, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -s * 0.02, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 0.05, s * 0.12);
      ctx.lineTo(-s * 0.12, s * 0.42);
      ctx.stroke();
      break;
    case 2: // pájaro
      ctx.ellipse(0, s * 0.05, s * 0.28, s * 0.16, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s * 0.22, -s * 0.22, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * 0.3, -s * 0.22);
      ctx.lineTo(s * 0.45, -s * 0.18);
      ctx.moveTo(-s * 0.05, s * 0.2);
      ctx.lineTo(-s * 0.05, s * 0.45);
      ctx.moveTo(s * 0.08, s * 0.2);
      ctx.lineTo(s * 0.08, s * 0.45);
      ctx.moveTo(-s * 0.25, s * 0.1);
      ctx.lineTo(-s * 0.45, s * 0.25);
      ctx.stroke();
      break;
    case 3: // agua
      ctx.moveTo(-s * 0.45, 0);
      for (let i = 0; i < 6; i++) ctx.lineTo(-s * 0.45 + (i + 1) * s * 0.15, i % 2 ? 0 : -s * 0.12);
      ctx.stroke();
      break;
    case 4: // junco
      ctx.moveTo(0, s * 0.45);
      ctx.lineTo(0, -s * 0.3);
      ctx.quadraticCurveTo(s * 0.25, -s * 0.45, s * 0.12, -s * 0.05);
      ctx.stroke();
      break;
    case 5: // pan
      ctx.arc(0, s * 0.15, s * 0.3, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      break;
    case 6: // serpiente
      ctx.moveTo(-s * 0.4, s * 0.2);
      ctx.bezierCurveTo(-s * 0.2, -s * 0.2, 0, s * 0.4, s * 0.2, 0);
      ctx.lineTo(s * 0.2, -s * 0.35);
      ctx.stroke();
      break;
    case 7: // disco solar
      ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.07, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 8: // figura sentada
      ctx.arc(0, -s * 0.3, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.2);
      ctx.lineTo(-s * 0.05, s * 0.15);
      ctx.lineTo(s * 0.25, s * 0.15);
      ctx.lineTo(s * 0.25, s * 0.42);
      ctx.moveTo(0, -s * 0.1);
      ctx.lineTo(s * 0.22, -s * 0.05);
      ctx.stroke();
      break;
    default: // escarabajo
      ctx.ellipse(0, 0, s * 0.18, s * 0.26, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      for (const sx of [-1, 1]) {
        ctx.moveTo(sx * s * 0.18, -s * 0.1);
        ctx.lineTo(sx * s * 0.38, -s * 0.25);
        ctx.moveTo(sx * s * 0.18, s * 0.1);
        ctx.lineTo(sx * s * 0.38, s * 0.25);
      }
      ctx.stroke();
  }
  ctx.restore();
}

// Grabado en ambos lienzos: color más oscuro y relieve hundido
function carveGlyph(L, type, x, y, s, colorC) {
  L.cx.fillStyle = L.cx.strokeStyle = colorC;
  glyph(L.cx, type, x, y, s);
  L.bx.fillStyle = L.bx.strokeStyle = gray(70);
  glyph(L.bx, type, x, y, s);
}

// ---------- texturas por tema ----------

export function sandstoneWall(seed = 1) {
  const rand = rng(seed);
  const L = layers(512);
  const rects = blocks(L, rand, { rows: 4, cols: 2, mortar: 5, base: [36, 42, 62], vary: [5, 8, 6], mortarColor: hsl(34, 30, 48) });
  for (let i = 0; i < 70; i++) blot(L.cx, L, rand() * 512, rand() * 512, 20 + rand() * 60, hsl(30, 35, 45 + rand() * 25, 0.12));
  for (const r of rects) {
    if (rand() < 0.45) {
      const n = Math.floor(r.h / 34);
      const colX = r.x + r.w * (0.25 + rand() * 0.5);
      for (let k = 0; k < n; k++) carveGlyph(L, Math.floor(rand() * 10), colX, r.y + 20 + k * 34, 26, hsl(30, 40, 42, 0.8));
      L.cx.strokeStyle = hsl(30, 40, 45, 0.6);
      L.cx.lineWidth = 2;
      L.cx.strokeRect(colX - 20, r.y + 4, 40, r.h - 8);
    }
  }
  for (let i = 0; i < 8; i++) crack(L, rand, rand() * 512, rand() * 512, 8 + rand() * 12, 'rgba(70,45,20,0.35)', gray(60));
  grain(L.cx, 512, 512, 14, rand);
  grain(L.bx, 512, 512, 30, rand);
  return finish(L, [1.4, 1.4]);
}

export function sandFloor(seed = 2) {
  const rand = rng(seed);
  const L = layers(512);
  blocks(L, rand, { rows: 2, cols: 2, mortar: 6, base: [38, 45, 66], vary: [4, 8, 6], mortarColor: hsl(35, 35, 52) });
  for (let i = 0; i < 90; i++) blot(L.cx, L, rand() * 512, rand() * 512, 15 + rand() * 70, hsl(40, 50, 70 + rand() * 10, 0.18));
  grain(L.cx, 512, 512, 18, rand);
  grain(L.bx, 512, 512, 40, rand);
  return finish(L, [1.6, 1.6]);
}

export function sandstoneSmooth(seed = 3, base = [36, 40, 60]) {
  const rand = rng(seed);
  const L = layers(256);
  L.cx.fillStyle = hsl(...base);
  L.cx.fillRect(0, 0, 256, 256);
  L.bx.fillStyle = gray(180);
  L.bx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 12; i++) {
    const y = rand() * 256;
    L.cx.fillStyle = hsl(base[0], base[1], base[2] - 6 + rand() * 12, 0.25);
    L.cx.fillRect(0, y, 256, 2 + rand() * 6);
  }
  for (let i = 0; i < 40; i++) blot(L.cx, L, rand() * 256, rand() * 256, 10 + rand() * 40, hsl(base[0] - 5, base[1], base[2] - 15, 0.12));
  grain(L.cx, 256, 256, 16, rand);
  grain(L.bx, 256, 256, 50, rand);
  return finish(L, [0.8, 0.8]);
}

export function egyptFrieze(seed = 4) {
  const rand = rng(seed);
  const L = layers(1024, 256);
  L.cx.fillStyle = hsl(36, 40, 60);
  L.cx.fillRect(0, 0, 1024, 256);
  L.bx.fillStyle = gray(170);
  L.bx.fillRect(0, 0, 1024, 256);
  // bandas superiores e inferiores doradas
  for (const y of [0, 232]) {
    L.cx.fillStyle = hsl(42, 70, 52);
    L.cx.fillRect(0, y, 1024, 24);
    L.bx.fillStyle = gray(230);
    L.bx.fillRect(0, y, 1024, 24);
    for (let x = 0; x < 1024; x += 32) {
      L.cx.fillStyle = hsl(205, 45, 35);
      L.cx.fillRect(x + 6, y + 6, 20, 12);
    }
  }
  // secuencia de jeroglíficos con cartuchos
  let x = 30;
  while (x < 1000) {
    if (rand() < 0.15 && x < 880) {
      L.cx.strokeStyle = hsl(30, 40, 38);
      L.cx.lineWidth = 4;
      L.cx.beginPath();
      L.cx.roundRect(x - 10, 44, 110, 168, 40);
      L.cx.stroke();
      L.bx.strokeStyle = gray(80);
      L.bx.lineWidth = 4;
      L.bx.beginPath();
      L.bx.roundRect(x - 10, 44, 110, 168, 40);
      L.bx.stroke();
      for (let k = 0; k < 3; k++) carveGlyph(L, Math.floor(rand() * 10), x + 45, 80 + k * 48, 40, hsl(30, 45, 35));
      x += 130;
    } else {
      carveGlyph(L, Math.floor(rand() * 10), x + 20, 100, 70, hsl(30, 45, 35));
      carveGlyph(L, Math.floor(rand() * 10), x + 20, 170, 50, hsl(30, 45, 35));
      x += 62;
    }
  }
  grain(L.cx, 1024, 256, 14, rand);
  return finish(L, [1.2, 0.22]);
}

export function goldMetal(seed = 5, base = [42, 75, 50]) {
  const rand = rng(seed);
  const L = layers(256);
  L.cx.fillStyle = hsl(...base);
  L.cx.fillRect(0, 0, 256, 256);
  L.bx.fillStyle = gray(160);
  L.bx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) blot(L.cx, L, rand() * 256, rand() * 256, 8 + rand() * 30, hsl(base[0] - 8, base[1], base[2] - 18, 0.25));
  grain(L.cx, 256, 256, 12, rand);
  grain(L.bx, 256, 256, 20, rand);
  return finish(L, [0.5, 0.5]);
}

export function mossyStone(seed = 6, { rows = 5, cols = 3, base = [95, 10, 42], moss = 0.7, tile = 1.3 } = {}) {
  const rand = rng(seed);
  const L = layers(512);
  const rects = blocks(L, rand, { rows, cols, mortar: 6, base, vary: [16, 8, 12], mortarColor: hsl(90, 15, 18), irregular: 0.6 });
  for (const r of rects) {
    // musgo acumulado en la parte superior de los bloques
    const n = Math.floor(rand() * 6 * moss);
    for (let i = 0; i < n; i++) {
      const x = r.x + rand() * r.w;
      const y = r.y + rand() * r.h * 0.35;
      const rad = 8 + rand() * 26;
      blot(L.cx, L, x, y, rad, hsl(85 + rand() * 25, 45, 25 + rand() * 15, 0.7));
      blot(L.bx, L, x, y, rad, gray(230, 0.5));
    }
    if (rand() < 0.35) crack(L, rand, r.x + rand() * r.w, r.y + rand() * r.h, 6 + rand() * 8, 'rgba(15,20,10,0.6)', gray(40));
  }
  for (let i = 0; i < 40; i++) blot(L.cx, L, rand() * 512, rand() * 512, 20 + rand() * 60, hsl(80, 30, 15, 0.15));
  grain(L.cx, 512, 512, 22, rand);
  grain(L.bx, 512, 512, 40, rand);
  return finish(L, [tile, tile]);
}

export function mossyFrieze(seed = 7) {
  const rand = rng(seed);
  const L = layers(1024, 256);
  L.cx.fillStyle = hsl(90, 8, 38);
  L.cx.fillRect(0, 0, 1024, 256);
  L.bx.fillStyle = gray(170);
  L.bx.fillRect(0, 0, 1024, 256);
  // greca maya
  L.cx.strokeStyle = hsl(90, 10, 22);
  L.bx.strokeStyle = gray(60);
  for (const ctx of [L.cx, L.bx]) {
    ctx.lineWidth = 14;
    ctx.beginPath();
    for (let x = 0; x < 1024; x += 128) {
      ctx.moveTo(x, 200);
      ctx.lineTo(x, 60);
      ctx.lineTo(x + 96, 60);
      ctx.lineTo(x + 96, 160);
      ctx.lineTo(x + 40, 160);
      ctx.lineTo(x + 40, 110);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 60; i++) blot(L.cx, L, rand() * 1024, rand() * 256, 10 + rand() * 40, hsl(95, 45, 28, 0.6));
  grain(L.cx, 1024, 256, 22, rand);
  return finish(L, [1.2, 0.22]);
}

export function bark(seed = 8) {
  const rand = rng(seed);
  const L = layers(256);
  L.cx.fillStyle = hsl(30, 22, 30);
  L.cx.fillRect(0, 0, 256, 256);
  L.bx.fillStyle = gray(150);
  L.bx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 80; i++) {
    const x = rand() * 256;
    const wdt = 1 + rand() * 4;
    L.cx.fillStyle = hsl(28, 20, 15 + rand() * 25, 0.6);
    L.cx.fillRect(x, 0, wdt, 256);
    L.bx.fillStyle = gray(60 + rand() * 160);
    L.bx.fillRect(x, 0, wdt, 256);
  }
  for (let i = 0; i < 20; i++) blot(L.cx, L, rand() * 256, rand() * 256, 10 + rand() * 30, hsl(90, 40, 30, 0.4));
  return finish(L, [0.3, 0.6]);
}

export function metalPanels(seed = 9, { base = [220, 18, 13], tile = 1.0, lights = true } = {}) {
  const rand = rng(seed);
  const L = layers(512, 512, { emissive: true });
  const rects = blocks(L, rand, { rows: 4, cols: (r) => 1 + Math.floor(rand() * 3), mortar: 4, base, vary: [8, 6, 4], mortarColor: '#05070b', stagger: 0, irregular: 0.4 });
  for (const r of rects) {
    // remaches
    for (const [px, py] of [[r.x + 8, r.y + 8], [r.x + r.w - 8, r.y + 8], [r.x + 8, r.y + r.h - 8], [r.x + r.w - 8, r.y + r.h - 8]]) {
      L.cx.fillStyle = hsl(base[0], 10, 30);
      L.cx.beginPath();
      L.cx.arc(px, py, 2.5, 0, Math.PI * 2);
      L.cx.fill();
    }
    // rejillas de ventilación
    if (rand() < 0.3) {
      const vx = r.x + r.w * 0.2;
      const vw = r.w * 0.6;
      for (let k = 0; k < 6; k++) {
        L.cx.fillStyle = '#05070a';
        L.cx.fillRect(vx, r.y + r.h * 0.3 + k * 7, vw, 3);
        L.bx.fillStyle = gray(60);
        L.bx.fillRect(vx, r.y + r.h * 0.3 + k * 7, vw, 3);
      }
    }
    // pequeños leds
    if (lights && rand() < 0.4) {
      const lx = r.x + 14 + rand() * (r.w - 40);
      const ly = r.y + r.h - 18;
      const col = rand() < 0.5 ? '#00e5ff' : '#ff2bd6';
      for (let k = 0; k < 3; k++) {
        L.ex.fillStyle = rand() < 0.7 ? col : '#ffaa00';
        L.ex.fillRect(lx + k * 8, ly, 5, 3);
        L.cx.fillStyle = col;
        L.cx.fillRect(lx + k * 8, ly, 5, 3);
      }
    }
  }
  grain(L.cx, 512, 512, 8, rand);
  grain(L.bx, 512, 512, 14, rand);
  return finish(L, [tile, tile]);
}

export function gridFloor(seed = 10) {
  const rand = rng(seed);
  const L = layers(512, 512, { emissive: true });
  blocks(L, rand, { rows: 4, cols: 4, mortar: 6, base: [225, 20, 9], vary: [6, 6, 3], mortarColor: '#020305', stagger: 0 });
  L.ex.strokeStyle = 'rgba(0,229,255,0.35)';
  L.ex.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    L.ex.beginPath();
    L.ex.moveTo(i * 128, 0);
    L.ex.lineTo(i * 128, 512);
    L.ex.moveTo(0, i * 128);
    L.ex.lineTo(512, i * 128);
    L.ex.stroke();
  }
  grain(L.cx, 512, 512, 8, rand);
  return finish(L, [1.2, 1.2]);
}

const LED_GLYPHS = 'ミラ三Dネオン東京ア二メ未来サイバ光';
export function ledBand(seed = 11) {
  const rand = rng(seed);
  const L = layers(1024, 256, { emissive: true });
  L.cx.fillStyle = '#07080d';
  L.cx.fillRect(0, 0, 1024, 256);
  L.bx.fillStyle = gray(150);
  L.bx.fillRect(0, 0, 1024, 256);
  L.ex.font = 'bold 120px sans-serif';
  L.ex.textBaseline = 'middle';
  let x = 20;
  while (x < 980) {
    const ch = LED_GLYPHS[Math.floor(rand() * LED_GLYPHS.length)];
    L.ex.fillStyle = rand() < 0.6 ? '#00e5ff' : '#ff2bd6';
    L.ex.fillText(ch, x, 128);
    x += 120 + rand() * 20;
  }
  // rejilla de píxeles tipo pantalla LED
  L.ex.fillStyle = 'rgba(0,0,0,0.55)';
  for (let y = 0; y < 256; y += 6) L.ex.fillRect(0, y, 1024, 2);
  for (let xx = 0; xx < 1024; xx += 6) L.ex.fillRect(xx, 0, 2, 256);
  L.cx.drawImage(L.e, 0, 0);
  return finish(L, [1.2, 0.22]);
}

export function dungeonStone(seed = 12, { base = [215, 8, 30], tile = 1.3, rows = 4, cols = 3 } = {}) {
  const rand = rng(seed);
  const L = layers(512);
  const rects = blocks(L, rand, { rows, cols, mortar: 8, base, vary: [25, 10, 12], mortarColor: hsl(220, 10, 10), irregular: 0.5 });
  for (const r of rects) {
    // bloques redondeados: oscurecer esquinas
    const g = L.cx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) * 0.2, r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    L.cx.fillStyle = g;
    L.cx.fillRect(r.x, r.y, r.w, r.h);
    if (rand() < 0.4) blot(L.cx, L, r.x + rand() * r.w, r.y + r.h * 0.2, 10 + rand() * 20, hsl(110, 35, 25, 0.5));
    if (rand() < 0.3) crack(L, rand, r.x + rand() * r.w, r.y + rand() * r.h, 5 + rand() * 6, 'rgba(0,0,0,0.5)', gray(40));
  }
  grain(L.cx, 512, 512, 20, rand);
  grain(L.bx, 512, 512, 36, rand);
  return finish(L, [tile, tile]);
}

export function stoneFrieze(seed = 13, base = [215, 8, 28]) {
  const rand = rng(seed);
  const L = layers(1024, 256);
  L.cx.fillStyle = hsl(...base);
  L.cx.fillRect(0, 0, 1024, 256);
  L.bx.fillStyle = gray(170);
  L.bx.fillRect(0, 0, 1024, 256);
  for (let x = 0; x < 1024; x += 128) {
    for (const [ctx, col] of [[L.cx, hsl(base[0], base[1], base[2] - 12)], [L.bx, gray(70)]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(x + 64, 128, 50, 0, Math.PI * 2);
      ctx.moveTo(x + 64, 78);
      ctx.lineTo(x + 64, 178);
      ctx.moveTo(x + 14, 128);
      ctx.lineTo(x + 114, 128);
      ctx.stroke();
    }
  }
  grain(L.cx, 1024, 256, 20, rand);
  return finish(L, [1.2, 0.22]);
}

export function lavaFloor(seed = 14) {
  const rand = rng(seed);
  const L = layers(512, 512, { emissive: true });
  L.cx.fillStyle = hsl(10, 25, 12);
  L.cx.fillRect(0, 0, 512, 512);
  L.bx.fillStyle = gray(170);
  L.bx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 80; i++) blot(L.cx, L, rand() * 512, rand() * 512, 15 + rand() * 50, hsl(10, 20, 6 + rand() * 14, 0.5));
  // grietas incandescentes
  for (let i = 0; i < 26; i++) {
    const pts = crackPath(rand, rand() * 512, rand() * 512, 10 + rand() * 25, 7, 1.2);
    strokePath(L.ex, pts, 'rgba(255,90,10,0.9)', 5);
    strokePath(L.ex, pts, 'rgba(255,200,80,1)', 1.8);
    strokePath(L.cx, pts, 'rgba(255,90,20,0.8)', 3);
    strokePath(L.bx, pts, gray(30), 6);
  }
  grain(L.cx, 512, 512, 18, rand);
  return finish(L, [1.4, 1.4]);
}

export function caustics(seed = 15) {
  const rand = rng(seed);
  const L = layers(256, 256, { emissive: true });
  L.cx.fillStyle = '#0a3b4a';
  L.cx.fillRect(0, 0, 256, 256);
  L.ex.fillStyle = '#05303d';
  L.ex.fillRect(0, 0, 256, 256);
  L.bx.fillStyle = gray(128);
  L.bx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 10 + rand() * 25;
    wrap(L, x, y, r, (px, py) => {
      for (const ctx of [L.ex, L.cx]) {
        ctx.strokeStyle = `rgba(120,255,255,${0.25 + rand() * 0.35})`;
        ctx.lineWidth = 1.5 + rand() * 2;
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * (0.6 + rand() * 0.4), rand() * Math.PI, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }
  return finish(L, [0.6, 0.6]);
}

// ---------- sprites y recortes con transparencia ----------

export function spriteTexture(stops, size = 128) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function flameTexture() {
  const c = makeCanvas(128, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 190, 4, 64, 160, 110);
  g.addColorStop(0, 'rgba(255,255,230,1)');
  g.addColorStop(0.2, 'rgba(255,210,90,0.95)');
  g.addColorStop(0.5, 'rgba(255,110,20,0.6)');
  g.addColorStop(1, 'rgba(120,20,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(64, 10);
  ctx.bezierCurveTo(120, 120, 118, 250, 64, 250);
  ctx.bezierCurveTo(10, 250, 8, 120, 64, 10);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function shaftTexture() {
  const c = makeCanvas(64, 256);
  const ctx = c.getContext('2d');
  const gx = ctx.createLinearGradient(0, 0, 64, 0);
  gx.addColorStop(0, 'rgba(255,255,255,0)');
  gx.addColorStop(0.5, 'rgba(255,255,255,1)');
  gx.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gx;
  ctx.fillRect(0, 0, 64, 256);
  ctx.globalCompositeOperation = 'destination-in';
  const gy = ctx.createLinearGradient(0, 0, 0, 256);
  gy.addColorStop(0, 'rgba(0,0,0,1)');
  gy.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gy;
  ctx.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function frondTexture(seed = 16, hue = 105) {
  const rand = rng(seed);
  const c = makeCanvas(128, 256);
  const ctx = c.getContext('2d');
  ctx.strokeStyle = hsl(hue - 20, 40, 22);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(64, 256);
  ctx.quadraticCurveTo(60, 120, 70, 6);
  ctx.stroke();
  for (let i = 0; i < 22; i++) {
    const t = i / 22;
    const y = 250 - t * 240;
    const x = 64 + t * 6;
    const len = 52 * Math.sin(Math.PI * (0.15 + t * 0.85)) + 6;
    for (const s of [-1, 1]) {
      ctx.fillStyle = hsl(hue + (rand() - 0.5) * 20, 45 + rand() * 15, 22 + rand() * 14);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(s * (1.1 - t * 0.4));
      ctx.beginPath();
      ctx.ellipse(0, -len / 2, 5 + 3 * (1 - t), len / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function leafTexture(hue = 100) {
  const c = makeCanvas(64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = hsl(hue, 50, 30);
  ctx.beginPath();
  ctx.moveTo(32, 2);
  ctx.quadraticCurveTo(62, 30, 32, 62);
  ctx.quadraticCurveTo(2, 30, 32, 2);
  ctx.fill();
  ctx.strokeStyle = hsl(hue, 40, 45);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(32, 6);
  ctx.lineTo(32, 60);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- texturas del templo (escala arquitectónica) ----------

// Cambia el tamaño de mosaico (en metros) de un juego de texturas
export function scaleTex(tex, tw, th = tw) {
  for (const t of [tex.map, tex.bump, tex.emissive]) if (t) t.repeat.set(1 / tw, 1 / th);
  return tex;
}

function carveStroke(L, draw, colorC = 'rgba(95,60,28,0.75)', w = 7) {
  for (const [ctx, col] of [[L.cx, colorC], [L.bx, gray(60)]]) {
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = col;
    ctx.lineWidth = w;
    ctx.lineCap = ctx.lineJoin = 'round';
    draw(ctx);
    ctx.restore();
  }
}

// Faraón golpeando a sus enemigos: escena clásica de los pilonos
function pharaoh(ctx, x, y, s, flip = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * flip, s);
  ctx.beginPath();
  ctx.arc(0, -300, 34, 0, Math.PI * 2); // cabeza
  ctx.moveTo(-22, -325);
  ctx.bezierCurveTo(-40, -380, -10, -450, 0, -460); // corona blanca
  ctx.bezierCurveTo(20, -440, 40, -380, 24, -325);
  ctx.moveTo(-75, -255);
  ctx.lineTo(75, -255); // hombros
  ctx.lineTo(38, -115);
  ctx.lineTo(-38, -115);
  ctx.closePath();
  ctx.moveTo(-38, -115);
  ctx.lineTo(-70, 0);
  ctx.lineTo(70, 0);
  ctx.lineTo(38, -115); // faldellín
  ctx.moveTo(-25, 0);
  ctx.lineTo(-80, 250);
  ctx.lineTo(-120, 255); // pierna trasera
  ctx.moveTo(25, 0);
  ctx.lineTo(95, 250);
  ctx.lineTo(140, 255); // pierna delantera
  ctx.moveTo(60, -250);
  ctx.lineTo(100, -340);
  ctx.lineTo(55, -420); // brazo alzado
  ctx.moveTo(55, -420);
  ctx.lineTo(-30, -470); // maza
  ctx.moveTo(-60, -250);
  ctx.lineTo(-160, -170); // brazo que sujeta a los enemigos
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-38, -476, 18, 0, Math.PI * 2);
  ctx.fill();
  // enemigos arrodillados
  for (let i = 0; i < 3; i++) {
    const ex = -200 - i * 45;
    const ey = -60 + i * 20;
    ctx.beginPath();
    ctx.arc(ex, ey - 90, 20, 0, Math.PI * 2);
    ctx.moveTo(ex, ey - 70);
    ctx.lineTo(ex + 10, ey + 20);
    ctx.lineTo(ex + 60, ey + 30);
    ctx.lineTo(ex + 60, ey + 90);
    ctx.moveTo(ex + 5, ey - 50);
    ctx.lineTo(ex + 50, ey - 100);
    ctx.stroke();
  }
  ctx.restore();
}

export function pylonRelief(seed = 20, flip = 1) {
  const rand = rng(seed);
  const L = layers(1024);
  blocks(L, rand, { rows: 14, cols: 7, mortar: 3, base: [36, 42, 62], vary: [4, 6, 5], mortarColor: hsl(34, 30, 50) });
  for (let i = 0; i < 80; i++) blot(L.cx, L, rand() * 1024, rand() * 1024, 30 + rand() * 90, hsl(30, 35, 45 + rand() * 20, 0.1));
  // ranuras de los mástiles y ventanucos
  for (const x of [flip > 0 ? 170 : 780, flip > 0 ? 260 : 690]) {
    L.cx.fillStyle = 'rgba(60,38,18,0.75)';
    L.cx.fillRect(x, 120, 46, 860);
    L.bx.fillStyle = gray(20);
    L.bx.fillRect(x, 120, 46, 860);
  }
  for (let i = 0; i < 4; i++) {
    L.cx.fillStyle = 'rgba(35,22,10,0.9)';
    L.cx.fillRect(140 + i * 210, 40, 40, 30);
  }
  carveStroke(L, (ctx) => pharaoh(ctx, flip > 0 ? 640 : 380, 640, 0.95, flip));
  // columnas de jeroglíficos
  for (const gx of flip > 0 ? [420, 900] : [120, 600]) {
    for (let k = 0; k < 12; k++) carveGlyph(L, Math.floor(rand() * 10), gx, 180 + k * 62, 46, 'rgba(95,60,28,0.75)');
  }
  grain(L.cx, 1024, 1024, 12, rand);
  grain(L.bx, 1024, 1024, 24, rand);
  return finish(L, [1, 1]);
}

// Columna papiriforme: textura vertical (v = altura relativa)
export function columnTex(seed = 21) {
  const rand = rng(seed);
  const L = layers(512, 1024);
  L.cx.fillStyle = hsl(36, 40, 62);
  L.cx.fillRect(0, 0, 512, 1024);
  L.bx.fillStyle = gray(170);
  L.bx.fillRect(0, 0, 512, 1024);
  // tambores de piedra
  for (let y = 40; y < 1024; y += 70) {
    L.cx.fillStyle = 'rgba(110,80,45,0.35)';
    L.cx.fillRect(0, y, 512, 2);
    L.bx.fillStyle = gray(80);
    L.bx.fillRect(0, y, 512, 3);
  }
  // nervios verticales del haz de papiros
  for (let x = 0; x < 512; x += 64) {
    L.bx.fillStyle = gray(110);
    L.bx.fillRect(x, 0, 6, 1024);
    L.cx.fillStyle = 'rgba(120,85,45,0.25)';
    L.cx.fillRect(x, 0, 4, 1024);
  }
  // bandas pintadas bajo el capitel (arriba de la textura = arriba de la columna)
  const bands = ['#2f5d8a', '#c9a24a', '#9b3b2a', '#c9a24a', '#2f5d8a'];
  bands.forEach((c, i) => {
    L.cx.fillStyle = c;
    L.cx.fillRect(0, 150 + i * 16, 512, 12);
  });
  // cartuchos con jeroglíficos en el fuste
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 3; k++) carveGlyph(L, Math.floor(rand() * 10), 64 + r * 128, 330 + k * 70, 50, 'rgba(70,45,20,0.75)');
  }
  for (let i = 0; i < 50; i++) blot(L.cx, L, rand() * 512, rand() * 1024, 20 + rand() * 60, hsl(30, 35, 45, 0.12));
  grain(L.cx, 512, 1024, 12, rand);
  return finish(L, [1, 1]);
}

export function starCeiling(seed = 22) {
  const rand = rng(seed);
  const L = layers(512);
  L.cx.fillStyle = '#16294f';
  L.cx.fillRect(0, 0, 512, 512);
  L.bx.fillStyle = gray(150);
  L.bx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 40; i++) blot(L.cx, L, rand() * 512, rand() * 512, 30 + rand() * 60, 'rgba(10,20,40,0.3)');
  L.cx.fillStyle = '#e8c35a';
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const x = gx * 128 + 64 + (gy % 2) * 32;
      const y = gy * 128 + 64;
      L.cx.save();
      L.cx.translate(x, y);
      L.cx.beginPath();
      for (let k = 0; k < 10; k++) {
        const r = k % 2 ? 7 : 20;
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
        L.cx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      L.cx.fill();
      L.cx.restore();
    }
  }
  grain(L.cx, 512, 512, 10, rand);
  return finish(L, [4, 4]);
}

export function obeliskTex(seed = 23) {
  const rand = rng(seed);
  const L = layers(256, 1024);
  L.cx.fillStyle = hsl(18, 22, 48);
  L.cx.fillRect(0, 0, 256, 1024);
  L.bx.fillStyle = gray(170);
  L.bx.fillRect(0, 0, 256, 1024);
  for (let i = 0; i < 60; i++) blot(L.cx, L, rand() * 256, rand() * 1024, 10 + rand() * 30, hsl(10, 20, 30 + rand() * 20, 0.2));
  for (let k = 0; k < 15; k++) carveGlyph(L, Math.floor(rand() * 10), 128, 50 + k * 64, 50, 'rgba(50,30,20,0.8)');
  grain(L.cx, 256, 1024, 14, rand);
  return finish(L, [1, 1]);
}

export function sandGround(seed = 24) {
  const rand = rng(seed);
  const L = layers(512);
  L.cx.fillStyle = hsl(38, 45, 66);
  L.cx.fillRect(0, 0, 512, 512);
  L.bx.fillStyle = gray(128);
  L.bx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 120; i++) blot(L.cx, L, rand() * 512, rand() * 512, 20 + rand() * 80, hsl(35 + rand() * 8, 45, 55 + rand() * 18, 0.25));
  // ondulaciones del viento
  for (let y = 0; y < 512; y += 9) {
    const yy = y + Math.sin(y * 0.1) * 3;
    L.bx.fillStyle = gray(100 + rand() * 60, 0.5);
    L.bx.fillRect(0, yy, 512, 3);
  }
  grain(L.cx, 512, 512, 16, rand);
  grain(L.bx, 512, 512, 30, rand);
  return finish(L, [6, 6]);
}

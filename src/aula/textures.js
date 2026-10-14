import * as THREE from 'three';
import { rng } from '../textures.js';

// Lienzo → textura. size: metros que cubre una repetición (para UV en metros).
function tex(w, h, draw, { size = [1, 1], srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / size[0], 1 / size[1]);
  t.anisotropy = 8;
  return t;
}

function noise(ctx, w, h, amount, rand) {
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// Piso de granito pulido (terrazo) en baldosas de 40 cm
export function terrazzo() {
  const rand = rng(101);
  return tex(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#e6e3dc';
      ctx.fillRect(0, 0, w, h);
      const cols = ['#8e8a84', '#5b5853', '#c4b49c', '#a9a49b', '#f4f2ee', '#7a6f62'];
      for (let i = 0; i < 9000; i++) {
        ctx.fillStyle = cols[Math.floor(rand() * cols.length)];
        const s = 0.6 + rand() * 2.4;
        ctx.beginPath();
        ctx.ellipse(rand() * w, rand() * h, s, s * (0.5 + rand() * 0.5), rand() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 25; i++) {
        const x = rand() * w;
        const y = rand() * h;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 30 + rand() * 60);
        g.addColorStop(0, 'rgba(120,110,95,0.10)');
        g.addColorStop(1, 'rgba(120,110,95,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.strokeStyle = 'rgba(140,135,128,0.45)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 128, 0);
        ctx.lineTo(i * 128, h);
        ctx.moveTo(0, i * 128);
        ctx.lineTo(w, i * 128);
        ctx.stroke();
      }
      noise(ctx, w, h, 8, rand);
    },
    { size: [1.6, 1.6] },
  );
}

export function wallPaint() {
  const rand = rng(102);
  return tex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f2f2ef';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 5, rand);
  }, { size: [2, 2] });
}

export function laminate() {
  const rand = rng(103);
  return tex(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#c98a52';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = `rgba(${120 + rand() * 60},${70 + rand() * 30},${30 + rand() * 20},0.18)`;
      ctx.fillRect(0, rand() * h, w, 0.5 + rand() * 2);
    }
    noise(ctx, w, h, 8, rand);
  }, { size: [1.6, 0.4] });
}

export function chairMesh() {
  return tex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#141416';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2c2c30';
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 4) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, h);
      ctx.moveTo(0, i);
      ctx.lineTo(w, i);
      ctx.stroke();
    }
  }, { size: [0.08, 0.08] });
}

// Frente de casilleros metálicos: 3 columnas × 4 puertas
export function lockerFront() {
  return tex(384, 640, (ctx, w, h) => {
    ctx.fillStyle = '#b8bcbf';
    ctx.fillRect(0, 0, w, h);
    const cw = w / 3;
    const rh = h / 4;
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 4; r++) {
        const x = c * cw;
        const y = r * rh;
        ctx.fillStyle = '#c4c8cb';
        ctx.fillRect(x + 5, y + 5, cw - 10, rh - 10);
        ctx.strokeStyle = '#8d9194';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 5, y + 5, cw - 10, rh - 10);
        ctx.fillStyle = '#7f8386';
        for (let k = 0; k < 4; k++) ctx.fillRect(x + cw * 0.25, y + 20 + k * 9, cw * 0.5, 3);
        ctx.fillStyle = '#55595c';
        ctx.fillRect(x + cw - 28, y + rh * 0.55, 10, 22);
      }
    }
  }, { size: [1, 1] });
}

// Pizarra con anotaciones a mano (garabatos, no texto real)
export function whiteboard() {
  const rand = rng(104);
  return tex(1024, 640, (ctx, w, h) => {
    ctx.fillStyle = '#f7f7f4';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      const g = ctx.createRadialGradient(rand() * w, rand() * h, 0, rand() * w, rand() * h, 200);
      g.addColorStop(0, 'rgba(150,160,175,0.08)');
      g.addColorStop(1, 'rgba(150,160,175,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    const scribble = (x, y, len, color, size = 14) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      let px = x;
      ctx.moveTo(px, y);
      while (px < x + len) {
        const step = 4 + rand() * 6;
        ctx.lineTo(px + step / 2, y - rand() * size);
        ctx.lineTo(px + step, y + rand() * 3);
        px += step;
        if (rand() < 0.12) {
          px += 8;
          ctx.moveTo(px, y);
        }
      }
      ctx.stroke();
    };
    // dos columnas de listas, como en la foto
    for (const [cx, color] of [[40, '#2a3c8f'], [430, '#2a3c8f']]) {
      for (let block = 0; block < 4; block++) {
        const by = 50 + block * 145;
        scribble(cx, by, 70, '#222', 12);
        for (let k = 0; k < 4; k++) {
          ctx.fillStyle = color;
          ctx.fillRect(cx + 20, by + 22 + k * 27, 6, 2);
          scribble(cx + 34, by + 30 + k * 27, 90 + rand() * 80, k % 3 === 2 ? '#b0302a' : color, 10);
        }
      }
    }
    ctx.fillStyle = '#c94a2a';
    ctx.fillRect(w - 40, 14, 22, 12);
  });
}

export function screenContent(seed) {
  const rand = rng(seed);
  return tex(256, 160, (ctx, w, h) => {
    ctx.fillStyle = rand() < 0.5 ? '#1e1f29' : '#f3f4f6';
    const dark = ctx.fillStyle === '#1e1f29';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = dark ? '#2a2c3a' : '#dfe3ea';
    ctx.fillRect(0, 0, w, 12);
    const cols = dark ? ['#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#c0caf5'] : ['#3b5bdb', '#495057', '#868e96', '#2b8a3e'];
    for (let y = 20; y < h - 6; y += 8) {
      let x = 8 + Math.floor(rand() * 4) * 10;
      while (x < w - 20 && rand() < 0.85) {
        const len = 8 + rand() * 40;
        ctx.fillStyle = cols[Math.floor(rand() * cols.length)];
        ctx.fillRect(x, y, len, 3);
        x += len + 5;
      }
    }
  });
}

export function towerFront() {
  return tex(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#16171a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#25272b';
    for (let y = 30; y < h - 20; y += 6) for (let x = 20; x < w - 20; x += 6) ctx.fillRect(x, y, 3, 3);
    ctx.fillStyle = '#9aa0a6';
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.5, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3d4044';
    ctx.fillRect(18, 10, 40, 8);
  });
}

export function exitSign() {
  return tex(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    // figura corriendo hacia una puerta
    ctx.fillRect(14, 16, 44, 70);
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(20, 22, 32, 64);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(46, 34, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(42, 44);
    ctx.lineTo(36, 62);
    ctx.lineTo(46, 78);
    ctx.moveTo(36, 62);
    ctx.lineTo(26, 74);
    ctx.moveTo(30, 50);
    ctx.lineTo(48, 52);
    ctx.stroke();
    // flecha
    ctx.beginPath();
    ctx.moveTo(90, 50);
    ctx.lineTo(190, 50);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(240, 50);
    ctx.lineTo(196, 22);
    ctx.lineTo(196, 78);
    ctx.fill();
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SALIDA / EXIT', w / 2, 114);
  });
}

// Vegetación vista a través de las ventanas
export function foliage(seed = 105) {
  const rand = rng(seed);
  return tex(1024, 512, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#e9f1f4');
    sky.addColorStop(1, '#d6e4dc');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = '#5b4a36';
      const x = rand() * w;
      ctx.fillRect(x, h * 0.35 + rand() * 80, 6 + rand() * 10, h);
    }
    for (let i = 0; i < 1400; i++) {
      const x = rand() * w;
      const y = h * (0.05 + rand() * 0.95);
      const r = 6 + rand() * 30;
      const l = 22 + rand() * 38;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `hsla(${85 + rand() * 40},${40 + rand() * 25}%,${l}%,0.9)`);
      g.addColorStop(1, `hsla(${95 + rand() * 30},40%,${l}%,0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // huecos de cielo entre las copas
    for (let i = 0; i < 40; i++) {
      const x = rand() * w;
      const y = rand() * h * 0.5;
      const r = 8 + rand() * 25;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(240,246,248,0.8)');
      g.addColorStop(1, 'rgba(240,246,248,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}

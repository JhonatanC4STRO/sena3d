import * as THREE from 'three';
import { rng } from '../textures.js';

// Lienzo → textura. size: metros que cubre una repetición (las geometrías usan UV en metros).
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

// Logo oficial del SENA (assets/sena-logo.svg, Wikimedia Commons, CC BY 4.0, crédito sena.edu.co).
// Se carga una vez por color; el SVG original es verde #39A900.
const logoCache = new Map();
export function loadSenaLogo(color = '#39A900') {
  if (!logoCache.has(color)) {
    logoCache.set(
      color,
      fetch('assets/sena-logo.svg')
        .then((r) => r.text())
        .then((svg) => {
          const recolored = svg
            .replaceAll('#39A900', color)
            .replace('<svg width="64" height="62"', '<svg width="640" height="620" viewBox="0 0 64 62"');
          const img = new Image();
          img.src = URL.createObjectURL(new Blob([recolored], { type: 'image/svg+xml' }));
          return img.decode().then(() => img);
        }),
    );
  }
  return logoCache.get(color);
}

// Dibuja el logo centrado en (cx, cy) con ancho w cuando esté cargado y refresca la textura
function drawOfficialLogo(texture, ctx, color, cx, cy, w) {
  loadSenaLogo(color)
    .then((img) => {
      const h = (w * img.height) / img.width;
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
      texture.needsUpdate = true;
    })
    .catch((err) => console.warn('No se pudo cargar el logo del SENA', err));
}

// Textura a partir de una foto del lugar. El espejado al repetir oculta las costuras.
const loader = new THREE.TextureLoader();
export function photoTexture(path, size = [1, 1], { mirror = true } = {}) {
  const t = loader.load(path);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = mirror ? THREE.MirroredRepeatWrapping : THREE.ClampToEdgeWrapping;
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

function blotches(ctx, w, h, n, color, rmin, rmax, rand) {
  for (let i = 0; i < n; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = rmin + rand() * (rmax - rmin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

// Adoquín en espina de pez: foto real del parqueadero (enderezada), ~1.8 m por repetición
export function pavers() {
  return photoTexture('assets/textures/adoquin.jpg', [1.8, 1.8]);
}

// Tableta gris de las galerías de planta baja: foto real (u = a lo largo de la galería)
export function grayTiles() {
  return photoTexture('assets/textures/galeria-baldosa.jpg', [3.0, 1.2]);
}

// Terreno de tierra y arena frente al edificio, con parches de pasto
export function dirt() {
  const rand = rng(303);
  return tex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#b39c7e';
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 120, 'rgba(140,118,90,0.4)', 10, 60, rand);
    blotches(ctx, w, h, 60, 'rgba(225,215,198,0.35)', 10, 50, rand);
    blotches(ctx, w, h, 25, 'rgba(120,140,70,0.35)', 8, 40, rand);
    for (let i = 0; i < 1500; i++) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(90,80,65,0.5)' : 'rgba(240,235,225,0.5)';
      ctx.fillRect(rand() * w, rand() * h, 1.5, 1.5);
    }
    noise(ctx, w, h, 14, rand);
  }, { size: [8, 8] });
}

export function grass() {
  const rand = rng(304);
  return tex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5f8a3a';
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 60, 'rgba(80,120,40,0.5)', 8, 40, rand);
    blotches(ctx, w, h, 40, 'rgba(130,150,70,0.4)', 8, 30, rand);
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = `rgba(${40 + rand() * 60},${90 + rand() * 70},${30 + rand() * 30},0.7)`;
      ctx.fillRect(rand() * w, rand() * h, 1, 2 + rand() * 3);
    }
  }, { size: [4, 4] });
}

// Lámina ondulada verde de las cubiertas
export function corrugated(color = '#6aa84f') {
  return tex(256, 64, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 32, 0);
    g.addColorStop(0, color);
    g.addColorStop(0.5, '#ffffff');
    g.addColorStop(0.55, color);
    g.addColorStop(1, '#2f5a23');
    ctx.fillStyle = g;
    for (let x = 0; x < w; x += 32) {
      ctx.save();
      ctx.translate(x, 0);
      ctx.fillRect(0, 0, 32, h);
      ctx.restore();
    }
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
  }, { size: [1.6, 1.6] });
}


// Panel de lamas blancas con el cuadro azul y el logo oficial en blanco (fachada de la torre)
export function louverPanel() {
  let t;
  t = tex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#d9dcdc';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 22) {
      const g = ctx.createLinearGradient(0, y, 0, y + 22);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.7, '#e3e6e6');
      g.addColorStop(1, '#8f9596');
      ctx.fillStyle = g;
      ctx.fillRect(0, y, w, 20);
    }
    ctx.fillStyle = '#9aa0a1';
    for (const x of [0, w / 3, (2 * w) / 3, w - 6]) ctx.fillRect(x, 0, 6, h);
    const q = w * 0.46;
    ctx.fillStyle = '#1e3553';
    ctx.fillRect((w - q) / 2, (h - q) / 2, q, q);
    ctx.strokeStyle = '#b8c0c8';
    ctx.lineWidth = 6;
    ctx.strokeRect((w - q) / 2, (h - q) / 2, q, q);
    queueMicrotask(() => drawOfficialLogo(t, ctx, '#FFFFFF', w / 2, h / 2, q * 0.72));
  });
  return t;
}

// Pendón vertical de la entrada, con el logo oficial en verde
export function banner() {
  let t;
  t = tex(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    const stripes = ['#f39200', '#5b9bd5', '#39a900', '#1e3553'];
    stripes.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(0, 30 + i * 16);
      ctx.lineTo(w, 10 + i * 16);
      ctx.lineTo(w, 22 + i * 16);
      ctx.lineTo(0, 42 + i * 16);
      ctx.fill();
    });
    ctx.fillStyle = '#1e3553';
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px Arial, sans-serif';
    ['CENTRO', 'TECNOLÓGICO', 'DE LA', 'AMAZONÍA'].forEach((line, i) => ctx.fillText(line, w / 2, 280 + i * 32));
    ctx.font = '18px Arial, sans-serif';
    ctx.fillText('Regional Caquetá', w / 2, 420);
    ctx.fillStyle = '#39a900';
    ctx.fillRect(30, 440, w - 60, 4);
    queueMicrotask(() => drawOfficialLogo(t, ctx, '#39A900', w / 2, 170, 130));
  });
  return t;
}

// Mural de la escalera: foto real de la pared (enderezada). Obra de @RochiRosas Design.
export function mural() {
  return photoTexture('assets/textures/mural.jpg', [1, 1], { mirror: false });
}

// Lo que se ve dentro de un salón a través de la ventana
export function classroomView(seed = 306) {
  const rand = rng(seed);
  return tex(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e9ecee';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f7f8f8';
    ctx.fillRect(0, 0, w, h * 0.22);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(40 + i * 120, 18, 70, 10);
    }
    // pizarra o TV al fondo
    ctx.fillStyle = rand() < 0.5 ? '#2a2c30' : '#f4f4f2';
    ctx.fillRect(w * 0.35, h * 0.3, w * 0.3, h * 0.25);
    ctx.fillStyle = '#d5d2cc';
    ctx.fillRect(0, h * 0.72, w, h * 0.28);
    // filas de mesas con monitores y sillas
    for (let row = 0; row < 3; row++) {
      const y = h * (0.55 + row * 0.12);
      const sc = 0.7 + row * 0.2;
      ctx.fillStyle = '#c98a52';
      ctx.fillRect(20, y, w - 40, 6 * sc);
      for (let x = 30; x < w - 40; x += 46 * sc) {
        if (rand() < 0.75) {
          ctx.fillStyle = '#16171a';
          ctx.fillRect(x, y - 22 * sc, 28 * sc, 18 * sc);
        }
        ctx.fillStyle = '#202124';
        ctx.fillRect(x + 4, y + 8 * sc, 18 * sc, 22 * sc);
      }
    }
    // reflejo del cielo en el vidrio
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, 'rgba(200,220,235,0.45)');
    g.addColorStop(0.5, 'rgba(200,220,235,0.05)');
    g.addColorStop(1, 'rgba(200,220,235,0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

// Máquina dispensadora (frente iluminado)
export function vending() {
  const rand = rng(307);
  return tex(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#0d4fa8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#cfe8ff';
    ctx.fillRect(8, 10, w * 0.68, h * 0.78);
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        ctx.fillStyle = ['#e53935', '#fdd835', '#43a047', '#fb8c00', '#8e24aa'][Math.floor(rand() * 5)];
        ctx.fillRect(12 + c * 15, 16 + r * 27, 11, 18);
      }
    }
    ctx.fillStyle = '#111';
    ctx.fillRect(w * 0.8, 40, 14, 40);
  });
}

// Cartelera / tablero de anuncios
export function noticeBoard() {
  const rand = rng(308);
  return tex(256, 192, (ctx, w, h) => {
    ctx.fillStyle = '#1f4e5f';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = ['#ffffff', '#fff3b0', '#d9f2ff'][i % 3];
      ctx.fillRect(10 + (i % 3) * 82 + rand() * 6, 10 + Math.floor(i / 3) * 60 + rand() * 6, 64, 48);
    }
  });
}

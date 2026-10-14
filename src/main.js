import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildRoom } from './room.js';
import { THEMES, getMaterials } from './themes.js';
import { setOffAxisProjection } from './projection.js';
import { HeadTracker, faceToEye } from './tracker.js';

const HH = 1; // media altura de la pantalla en unidades de escena
const ROOM_DEPTH = 2.6;
const $ = (id) => document.getElementById(id);

// ---------- render ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera();
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- estado ----------
let hw = 1;
let room = null;
let extras = null;
let themeIndex = Number(localStorageGet('mirar3d-theme') ?? 0) % THEMES.length;
const settings = { gain: 1.5, screenHeightCm: 20, offset: { x: 0, y: 0 }, baseY: 1 };
const eye = new THREE.Vector3(0, 0.2, 5);
const target = eye.clone();
const pointer = { x: 0, y: 0, lastMove: -1e9 };
let mode = 'mouse'; // 'mouse' | 'camera'
const tracker = new HeadTracker($('video'), $('cam-overlay'));

function localStorageGet(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function localStorageSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento */
  }
}

function disposeTree(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose();
  });
}

function rebuild() {
  const w = Math.max(window.innerWidth, 1);
  const h = Math.max(window.innerHeight, 1);
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  hw = (HH * w) / h;
  if (room) {
    scene.remove(room.group);
    disposeTree(room.group);
  }
  room = buildRoom(hw, HH, ROOM_DEPTH);
  scene.add(room.group);
  applyTheme(themeIndex);
}

function applyTheme(i) {
  themeIndex = i;
  const theme = THEMES[i];
  const mats = getMaterials(theme);
  for (const m of room.parts) m.material = mats[m.userData.slot];
  if (extras) {
    scene.remove(extras.group);
    disposeTree(extras.group);
  }
  extras = theme.extras(room, mats);
  scene.add(extras.group);
  renderer.toneMappingExposure = theme.env.exposure;
  [bloom.strength, bloom.radius, bloom.threshold] = theme.env.bloom;
  document.querySelectorAll('#themes button').forEach((b, k) => b.classList.toggle('active', k === i));
  localStorageSet('mirar3d-theme', String(i));
}

let switching = false;
function switchTheme(i) {
  i = (i + THEMES.length) % THEMES.length;
  if (switching || i === themeIndex) return;
  switching = true;
  $('fade').classList.add('on');
  setTimeout(() => {
    applyTheme(i);
    requestAnimationFrame(() => {
      $('fade').classList.remove('on');
      switching = false;
    });
  }, 260);
}

// ---------- seguimiento ----------
function setStatus(text) {
  $('cam-status').textContent = text;
}

async function startCamera() {
  $('cam').classList.remove('hidden');
  try {
    await tracker.start(setStatus);
    mode = 'camera';
    $('btn-toggle-cam').textContent = 'Usar ratón';
    return true;
  } catch (err) {
    console.error(err);
    tracker.stop();
    $('cam').classList.add('hidden');
    mode = 'mouse';
    $('btn-toggle-cam').textContent = 'Usar cámara';
    throw err;
  }
}

function useMouse() {
  tracker.stop();
  mode = 'mouse';
  $('cam').classList.add('hidden');
  $('btn-toggle-cam').textContent = 'Usar cámara';
}

function calibrate() {
  if (mode !== 'camera' || !tracker.face) return;
  // la posición actual de la cabeza pasa a ser "mirar de frente al centro"
  const raw = faceToEye(tracker.face, { ...settings, gain: 1, offset: { x: 0, y: 0 }, baseY: 0 }, new THREE.Vector3());
  settings.offset.x = -raw.x;
  settings.offset.y = -raw.y;
  settings.baseY = 0.15;
}

// ---------- bucle ----------
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const now = performance.now();

  let face = null;
  if (mode === 'camera' && tracker.running) {
    face = tracker.update(now);
    setStatus(face ? 'Rastreando ✓' : 'Buscando cara…');
  }

  if (face) {
    faceToEye(face, settings, target);
  } else if (mode === 'mouse' && now - pointer.lastMove < 5000) {
    const g = settings.gain / 1.5;
    target.set(pointer.x * hw * 1.1 * g, pointer.y * HH * 0.9 * g + 0.15, 4.5);
  } else {
    // vaivén suave cuando no hay entrada: deja ver el efecto 3D
    target.set(Math.sin(t * 0.35) * hw * 0.8, Math.sin(t * 0.23) * 0.5 + 0.2, 4.6 + Math.sin(t * 0.17) * 0.6);
  }

  eye.lerp(target, 1 - Math.exp(-dt * (face ? 14 : 5)));
  setOffAxisProjection(camera, eye, hw, HH, 0.05, 60);
  extras?.update(t, dt);
  composer.render();
  requestAnimationFrame(frame);
}

// ---------- interfaz ----------
THEMES.forEach((th, i) => {
  const b = document.createElement('button');
  b.textContent = `${i + 1}. ${th.name}`;
  b.onclick = () => switchTheme(i);
  $('themes').appendChild(b);
});

let hudTimer = 0;
let hudLocked = false;
function pokeHud() {
  if (hudLocked || !$('intro').classList.contains('hidden')) return;
  $('hud').classList.remove('hidden');
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => $('hud').classList.add('hidden'), 3000);
}

window.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
  pointer.lastMove = performance.now();
  pokeHud();
});

$('btn-cam').onclick = async () => {
  $('intro-error').textContent = '';
  $('btn-cam').disabled = true;
  try {
    await startCamera();
    $('intro').classList.add('hidden');
    pokeHud();
  } catch (err) {
    $('intro-error').textContent =
      err?.name === 'NotAllowedError' ? 'Permiso de cámara denegado. Puedes usar el ratón.' : 'No se pudo iniciar la cámara. Puedes usar el ratón.';
  } finally {
    $('btn-cam').disabled = false;
  }
};
$('btn-mouse').onclick = () => {
  useMouse();
  $('intro').classList.add('hidden');
  pokeHud();
};
$('btn-center').onclick = calibrate;
$('btn-toggle-cam').onclick = () => {
  if (mode === 'camera') useMouse();
  else startCamera().catch(() => setStatus('Sin cámara'));
};
$('btn-full').onclick = toggleFullscreen;
$('gain').oninput = (e) => (settings.gain = Number(e.target.value));

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const n = Number(e.key);
  if (n >= 1 && n <= THEMES.length) switchTheme(n - 1);
  else if (e.key === 'ArrowRight') switchTheme(themeIndex + 1);
  else if (e.key === 'ArrowLeft') switchTheme(themeIndex - 1);
  else if (e.key === 'c' || e.key === 'C') calibrate();
  else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  else if (e.key === 'h' || e.key === 'H') {
    hudLocked = !hudLocked;
    $('hud').classList.toggle('hidden', hudLocked);
    $('cam').style.visibility = hudLocked ? 'hidden' : '';
  }
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(rebuild, 120);
});

// Pre-genera las texturas del resto de temas para que el cambio sea instantáneo
function prewarm(k = 0) {
  if (k >= THEMES.length) return;
  setTimeout(() => {
    getMaterials(THEMES[k]);
    prewarm(k + 1);
  }, 150);
}

rebuild();
frame();
prewarm();

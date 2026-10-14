import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { Player } from '../temple/player.js';
import { HeadTracker } from '../tracker.js';

const $ = (id) => document.getElementById(id);

/**
 * Aplicación de recorrido en primera persona: render, WASD, ratón, vista con la cabeza e interfaz.
 * createWorld({ scene, renderer, camera }) debe devolver:
 *   { colliders, groundHeight(x, z, y), areaName(x, z, y), spawn: { x, z, yaw }, update(t, dt, area),
 *     interactions?: [{ x, y, z, r, label, action() }], exposure?, near?, far?, fov?,
 *     ao?: { radius, distanceExponent, thickness, scale, samples, blend } }  (sombras de contacto GTAO)
 */
export function startWalkApp(createWorld) {
  const renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25)); // más píxeles = más lag en pantallas HD
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 3000);
  const world = createWorld({ scene, renderer, camera });
  renderer.toneMappingExposure = world.exposure ?? 1;
  camera.near = world.near ?? camera.near;
  camera.far = world.far ?? camera.far;
  camera.fov = world.fov ?? camera.fov;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (world.ao) {
    // oclusión ambiental: oscurece rincones, uniones y contactos con el suelo
    const { blend = 1, ...aoParams } = world.ao;
    const ao = new GTAOPass(scene, camera, 256, 256, {}, aoParams);
    ao.blendIntensity = blend;
    composer.addPass(ao);
  }
  composer.addPass(new OutputPass());

  const player = new Player(camera, world.colliders, world.groundHeight);
  if (world.spawn) {
    player.pos.set(world.spawn.x, world.groundHeight(world.spawn.x, world.spawn.z, 0), world.spawn.z);
    player.bodyYaw = world.spawn.yaw ?? 0;
  }
  if (new URLSearchParams(location.search).has('debug')) window.debug = { scene, camera, player, renderer, world, composer };

  function resize() {
    const w = Math.max(window.innerWidth, 1);
    const h = Math.max(window.innerHeight, 1);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- entrada ----------
  const keys = new Set();
  const started = () => $('intro').classList.contains('hidden');
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    keys.add(e.code);
    if (e.code === 'KeyC') recenter();
    else if (e.code === 'Enter' && nearby && started()) nearby.action();
    else if (e.code === 'KeyV') toggleHead();
    else if (e.code === 'KeyF') toggleFullscreen();
    else if (e.code === 'KeyH') {
      hudLocked = !hudLocked;
      $('hud').classList.toggle('hidden', hudLocked);
    }
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  function readInput() {
    const k = (c) => (keys.has(c) ? 1 : 0);
    return {
      forward: k('KeyW') - k('KeyS'),
      strafe: k('KeyD') - k('KeyA'),
      turn: k('ArrowLeft') + k('KeyQ') - k('ArrowRight') - k('KeyE'),
      tilt: k('ArrowUp') - k('ArrowDown'),
      run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    };
  }

  // ratón: clic en la escena para capturarlo
  $('scene').addEventListener('click', () => {
    if (started() && document.pointerLockElement !== $('scene')) $('scene').requestPointerLock?.();
  });
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === $('scene')) {
      player.bodyYaw -= e.movementX * 0.0022;
      player.basePitch = THREE.MathUtils.clamp(player.basePitch - e.movementY * 0.0022, -1.4, 1.4);
    } else {
      pokeHud();
    }
  });

  // ---------- cámara / cabeza ----------
  const tracker = new HeadTracker($('video'), $('cam-overlay'));
  let camOn = false;

  async function startCamera() {
    $('cam').classList.remove('hidden');
    $('headpad').classList.remove('hidden');
    try {
      await tracker.start((s) => ($('cam-status').textContent = s));
      camOn = true;
      player.cal = null; // recalibra con las próximas muestras
      player.calSamples = [];
      $('btn-toggle-cam').textContent = 'Sin cámara';
    } catch (err) {
      stopCamera();
      throw err;
    }
  }

  function stopCamera() {
    tracker.stop();
    camOn = false;
    $('cam').classList.add('hidden');
    $('headpad').classList.add('hidden');
    $('btn-toggle-cam').textContent = 'Cámara';
  }

  function recenter() {
    if (tracker.face) player.calibrate(tracker.face);
    else player.basePitch = 0.05;
  }

  function toggleHead() {
    player.headEnabled = !player.headEnabled;
    $('btn-head').textContent = player.headEnabled ? 'Cabeza: sí' : 'Cabeza: pausa';
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }

  $('btn-cam').onclick = async () => {
    $('intro-error').textContent = '';
    $('btn-cam').disabled = true;
    try {
      await startCamera();
      $('intro').classList.add('hidden');
      pokeHud();
    } catch (err) {
      console.error(err);
      $('intro-error').textContent =
        err?.name === 'NotAllowedError' ? 'Permiso de cámara denegado. Puedes usar teclado y ratón.' : 'No se pudo iniciar la cámara. Puedes usar teclado y ratón.';
    } finally {
      $('btn-cam').disabled = false;
    }
  };
  $('btn-mouse').onclick = () => {
    $('intro').classList.add('hidden');
    pokeHud();
  };
  $('btn-center').onclick = recenter;
  $('btn-head').onclick = toggleHead;
  $('btn-full').onclick = toggleFullscreen;
  $('btn-toggle-cam').onclick = () => (camOn ? stopCamera() : startCamera().catch(() => ($('cam-status').textContent = 'Sin cámara')));
  $('sens').oninput = (e) => (player.sensitivity = Number(e.target.value));

  let hudTimer = 0;
  let hudLocked = false;
  function pokeHud() {
    if (hudLocked || !started()) return;
    $('hud').classList.remove('hidden');
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => $('hud').classList.add('hidden'), 3500);
  }

  // indicador de la cabeza
  const pad = $('headpad');
  const padDot = pad.querySelector('.dot');
  function drawHeadPad() {
    const ringR = pad.clientWidth * 0.28;
    const sx = THREE.MathUtils.clamp(-player.head.yaw / 0.24, -1.7, 1.7) * ringR;
    const sy = THREE.MathUtils.clamp(-player.head.pitch / 0.24, -1.7, 1.7) * ringR;
    padDot.style.transform = `translate(${sx}px, ${sy}px)`;
    pad.classList.toggle('turning', Math.abs(player.head.yaw) > 0.24);
  }

  // ---------- interacciones (puertas que llevan a otra escena, etc.) ----------
  let nearby = null;
  const prompt = $('prompt');
  if (prompt) prompt.onclick = () => nearby?.action();
  function updateInteractions() {
    if (!prompt) return;
    let best = null;
    let bestD = Infinity;
    for (const it of world.interactions ?? []) {
      if (Math.abs(player.pos.y - (it.y ?? 0)) > 1.4) continue;
      const d = Math.hypot(player.pos.x - it.x, player.pos.z - it.z);
      if (d < (it.r ?? 1.5) && d < bestD) {
        best = it;
        bestD = d;
      }
    }
    if (best !== nearby) {
      nearby = best;
      prompt.textContent = best ? `Enter · ${best.label}` : '';
      prompt.classList.toggle('show', !!best);
    }
  }

  // ---------- bucle ----------
  const clock = new THREE.Clock();
  let lastArea = '';
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    let face = null;
    if (camOn) {
      face = tracker.update(performance.now());
      $('cam-status').textContent = !face ? 'Buscando cara…' : player.cal ? 'Rastreando ✓' : 'Calibrando…';
    }
    player.updateHead(face, dt);
    player.update(dt, started() ? readInput() : { forward: 0, strafe: 0 });
    if (camOn) drawHeadPad();

    const area = world.areaName(player.pos.x, player.pos.z, player.pos.y);
    if (area !== lastArea) {
      lastArea = area;
      $('area').textContent = area;
    }
    updateInteractions();

    world.update?.(t, dt, area);
    composer.render();
    requestAnimationFrame(frame);
  }
  frame();
}

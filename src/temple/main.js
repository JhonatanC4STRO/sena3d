import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { buildTemple, groundHeight, areaName } from './build.js';
import { startWalkApp } from '../walk/app.js';

startWalkApp(({ scene, renderer }) => {
  // cielo y sol
  const sunDir = new THREE.Vector3(0.55, 0.62, 0.56).normalize();
  const sky = new Sky();
  sky.scale.setScalar(2000); // cabe entero dentro del plano lejano de la cámara
  sky.material.uniforms.turbidity.value = 6;
  sky.material.uniforms.rayleigh.value = 1.6;
  sky.material.uniforms.mieCoefficient.value = 0.004;
  sky.material.uniforms.mieDirectionalG.value = 0.8;
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  scene.add(sky);

  // iluminación ambiental a partir del propio cielo
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  skyScene.add(sky.clone());
  scene.environment = pmrem.fromScene(skyScene, 0.02).texture;
  scene.fog = new THREE.Fog(0xe6d6b8, 220, 1400);

  const sun = new THREE.DirectionalLight(0xfff0d8, 3.4);
  const sunTarget = new THREE.Object3D();
  sunTarget.position.set(0, 0, -30);
  sun.target = sunTarget;
  sun.position.copy(sunTarget.position).addScaledVector(sunDir, 160);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 20, far: 340 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  const hemi = new THREE.HemisphereLight(0xbcd6ff, 0xc9a26a, 0.35);
  scene.add(sun, sunTarget, hemi);

  const temple = buildTemple();
  scene.add(temple.group);

  // Bajo techo la luz ambiental del cielo se atenúa: la sala y el santuario quedan en penumbra
  const envMats = new Map();
  temple.group.traverse((o) => {
    for (const m of [o.material].flat()) if (m?.isMeshStandardMaterial) envMats.set(m, m.envMapIntensity);
  });
  let indoor = 0;

  return {
    colliders: temple.colliders,
    groundHeight,
    areaName,
    spawn: { x: 0, z: 34, yaw: 0 },
    exposure: 0.75,
    update(t, dt, area) {
      const target = area === 'Sala hipóstila' || area === 'Cámara del dios' ? 1 : 0;
      indoor += (target - indoor) * (1 - Math.exp(-dt * 1.5));
      const k = 1 - 0.75 * indoor;
      for (const [m, base] of envMats) m.envMapIntensity = base * k;
      hemi.intensity = 0.35 * k;
      temple.update(t, dt);
    },
  };
});

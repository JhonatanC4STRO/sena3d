// Proyección "off-axis" (Kooima): la pantalla es un rectángulo fijo en z = 0
// de tamaño (2·hw × 2·hh) y el ojo puede estar en cualquier punto delante de ella.
// El frustum se deforma para que la pantalla actúe como una ventana real.
export function setOffAxisProjection(camera, eye, hw, hh, near = 0.05, far = 100) {
  const d = Math.max(eye.z, near * 2); // distancia del ojo al plano de la pantalla

  camera.position.set(eye.x, eye.y, d);
  camera.quaternion.identity(); // la cámara siempre mira perpendicular a la pantalla
  camera.updateMatrixWorld(true);

  const k = near / d;
  const left = (-hw - eye.x) * k;
  const right = (hw - eye.x) * k;
  const bottom = (-hh - eye.y) * k;
  const top = (hh - eye.y) * k;

  camera.near = near;
  camera.far = far;
  camera.projectionMatrix.makePerspective(left, right, top, bottom, near, far);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

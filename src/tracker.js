const MP_VERSION = '0.10.14';
const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Supuestos físicos para convertir la cara detectada en una posición 3D
const IPD_CM = 6.3; // distancia entre pupilas media
const WEBCAM_HFOV = (60 * Math.PI) / 180; // campo de visión horizontal típico de una webcam

export class HeadTracker {
  constructor(video, overlay) {
    this.video = video;
    this.overlay = overlay;
    this.ctx = overlay.getContext('2d');
    this.landmarker = null;
    this.stream = null;
    this.lastVideoTime = -1;
    this.face = null; // { cx, cy, ipd, aspect } en coordenadas normalizadas de la imagen
    this.lastSeen = 0;
  }

  get running() {
    return !!this.landmarker && !!this.stream;
  }

  async start(onStatus = () => {}) {
    onStatus('Pidiendo cámara…');
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    if (!this.landmarker) {
      onStatus('Cargando detector…');
      const { FaceLandmarker, FilesetResolver } = await import(MP_URL);
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const make = (delegate) =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numFaces: 1,
        });
      try {
        this.landmarker = await make('GPU');
      } catch {
        this.landmarker = await make('CPU');
      }
    }
    onStatus('Buscando cara…');
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.face = null;
    this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  // Llamar una vez por frame. Devuelve la cara más reciente (o null si se perdió).
  update(now) {
    if (!this.running || this.video.readyState < 2) return this.face;
    if (this.video.currentTime === this.lastVideoTime) return this.face;
    this.lastVideoTime = this.video.currentTime;

    const res = this.landmarker.detectForVideo(this.video, now);
    const lm = res.faceLandmarks?.[0];
    if (!lm) {
      if (now - this.lastSeen > 400) this.face = null;
      this.drawOverlay(null);
      return this.face;
    }

    // Centros de iris (468 / 473); si no existen, comisuras de los ojos
    const L = lm[468] ?? lm[33];
    const R = lm[473] ?? lm[263];
    const vw = this.video.videoWidth || 640;
    const vh = this.video.videoHeight || 480;
    const ipd = Math.hypot((L.x - R.x) * vw, (L.y - R.y) * vh) / vw;

    this.face = { cx: (L.x + R.x) / 2, cy: (L.y + R.y) / 2, ipd, aspect: vh / vw, ...headPose(lm, vw, vh) };
    this.lastSeen = now;
    this.drawOverlay(this.face, L, R);
    return this.face;
  }

  drawOverlay(face, L, R) {
    const { ctx, overlay } = this;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (!face) return;
    ctx.fillStyle = '#7dff9a';
    for (const p of [L, R]) {
      ctx.beginPath();
      ctx.arc(p.x * overlay.width, p.y * overlay.height, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Convierte la cara detectada en la posición del ojo, en unidades de la escena.
// La pantalla mide 2 unidades de alto; screenHeightCm define la escala real.
// Se asume la webcam centrada en el borde superior de la pantalla.
// Orientación de la cabeza a partir de la punta de la nariz respecto a la línea de los ojos.
// yaw > 0: la persona gira hacia SU izquierda. pitch crece al bajar la cabeza.
// Valores relativos (≈ seno del ángulo × profundidad de la nariz); se calibran con una pose neutra.
function headPose(lm, vw, vh) {
  let A = lm[33];
  let B = lm[263];
  if (A.x > B.x) [A, B] = [B, A]; // A = comisura que aparece a la izquierda de la imagen
  const N = lm[1];
  const ex = (B.x - A.x) * vw;
  const ey = (B.y - A.y) * vh;
  const ed = Math.hypot(ex, ey) || 1;
  const ux = ex / ed;
  const uy = ey / ed;
  const nx = (N.x - (A.x + B.x) / 2) * vw;
  const ny = (N.y - (A.y + B.y) / 2) * vh;
  return {
    yaw: (nx * ux + ny * uy) / ed,
    pitch: (-nx * uy + ny * ux) / ed,
  };
}

// baseY = altura de la webcam respecto al centro de la pantalla (1 = borde superior).
export function faceToEye(face, { screenHeightCm = 20, gain = 1.5, offset = { x: 0, y: 0 }, baseY = 1 }, out) {
  const f = 0.5 / Math.tan(WEBCAM_HFOV / 2); // focal en "anchos de imagen"
  const zCm = (IPD_CM * f) / face.ipd;
  const xCm = ((0.5 - face.cx) / f) * zCm;
  const yCm = (((0.5 - face.cy) * face.aspect) / f) * zCm;

  const u = 2 / screenHeightCm; // unidades de escena por cm
  out.x = (xCm * u + offset.x) * gain;
  out.y = (yCm * u + offset.y) * gain + baseY;
  out.z = Math.min(Math.max(zCm * u, 1.5), 14);
  return out;
}

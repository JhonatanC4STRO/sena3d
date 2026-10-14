import * as THREE from 'three';

const EYE = 1.65; // altura de los ojos (m)
const RADIUS = 0.35;
const WALK = 3.2;
const RUN = 7;
const BOUNDS = 160;

const HEAD_K = 1.8; // valor relativo de la nariz → radianes aproximados
const DEAD = 0.04; // zona muerta (rad) para que la vista no tiemble
const TURN_START = 0.24; // a partir de ~14° de giro la vista sigue rotando
const TURN_SPEED = 3.2;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const dead = (v, d) => (Math.abs(v) < d ? 0 : v - Math.sign(v) * d);

export class Player {
  constructor(camera, colliders, groundHeight) {
    this.camera = camera;
    this.colliders = colliders;
    this.groundHeight = groundHeight;
    this.pos = new THREE.Vector3(0, 0, 34);
    this.vel = new THREE.Vector3();
    this.eyeY = EYE;
    this.bodyYaw = 0; // giro acumulado (ratón, flechas, giro continuo de cabeza)
    this.basePitch = 0.08;
    this.head = { yaw: 0, pitch: 0 }; // giro de cabeza suavizado (rad)
    this.headLook = { yaw: 0, pitch: 0 };
    this.cal = null; // pose neutra de la cabeza
    this.calSamples = [];
    this.sensitivity = 2;
    this.headEnabled = true;
    this.bob = 0;
  }

  calibrate(face) {
    this.cal = { yaw: face.yaw, pitch: face.pitch };
    this.head.yaw = this.head.pitch = 0;
  }

  // Cabeza → mirada. Giro pequeño: mira hacia ese lado. Giro grande: además rota sin parar.
  updateHead(face, dt) {
    if (!face || !this.headEnabled) {
      const k = 1 - Math.exp(-dt * 4);
      this.head.yaw += (0 - this.head.yaw) * k;
      this.head.pitch += (0 - this.head.pitch) * k;
    } else {
      // calibración automática con las primeras muestras
      if (!this.cal) {
        this.calSamples.push(face);
        if (this.calSamples.length >= 20) {
          const n = this.calSamples.length;
          this.cal = {
            yaw: this.calSamples.reduce((s, f) => s + f.yaw, 0) / n,
            pitch: this.calSamples.reduce((s, f) => s + f.pitch, 0) / n,
          };
        }
        return;
      }
      const ty = (face.yaw - this.cal.yaw) * HEAD_K;
      const tp = (this.cal.pitch - face.pitch) * HEAD_K;
      const k = 1 - Math.exp(-dt * 12);
      this.head.yaw += (ty - this.head.yaw) * k;
      this.head.pitch += (tp - this.head.pitch) * k;
    }
    const hy = dead(this.head.yaw, DEAD);
    const hp = dead(this.head.pitch, DEAD);
    this.headLook.yaw = clamp(hy * this.sensitivity, -1.1, 1.1);
    this.headLook.pitch = clamp(hp * this.sensitivity, -1.2, 1.2);
    if (Math.abs(this.head.yaw) > TURN_START) {
      this.bodyYaw += Math.sign(this.head.yaw) * (Math.abs(this.head.yaw) - TURN_START) * TURN_SPEED * this.sensitivity * 0.5 * dt;
    }
  }

  get yaw() {
    return this.bodyYaw + this.headLook.yaw;
  }

  get pitch() {
    return clamp(this.basePitch + this.headLook.pitch, -1.45, 1.45);
  }

  update(dt, input) {
    // giro con teclado
    this.bodyYaw += (input.turn || 0) * 1.9 * dt;
    this.basePitch = clamp(this.basePitch + (input.tilt || 0) * 1.2 * dt, -1.4, 1.4);

    // movimiento relativo a donde miras
    const yaw = this.yaw;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const wish = new THREE.Vector3().addScaledVector(fwd, input.forward).addScaledVector(right, input.strafe);
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(input.run ? RUN : WALK);
    this.vel.lerp(wish, 1 - Math.exp(-dt * 10));
    this.pos.addScaledVector(this.vel, dt);

    // colisiones (dos pasadas para esquinas)
    for (let pass = 0; pass < 2; pass++) for (const c of this.colliders) this.push(c);
    const d = Math.hypot(this.pos.x, this.pos.z);
    if (d > BOUNDS) {
      this.pos.x *= BOUNDS / d;
      this.pos.z *= BOUNDS / d;
    }

    // altura del suelo con transición suave (escalones). Se pasa la altura actual
    // para que los mundos con varios pisos elijan la superficie correcta.
    const ground = this.groundHeight(this.pos.x, this.pos.z, this.pos.y);
    this.pos.y += (ground - this.pos.y) * (1 - Math.exp(-dt * 12));

    // balanceo al caminar
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.bob += speed * dt * 2.2;
    const bobY = Math.sin(this.bob * 2) * 0.035 * Math.min(speed / WALK, 1.5);

    const cam = this.camera;
    cam.position.set(this.pos.x, this.pos.y + EYE + bobY, this.pos.z);
    cam.rotation.set(this.pitch, yaw, 0, 'YXZ');
  }

  push(c) {
    const p = this.pos;
    // obstáculos con rango vertical (y1, y2): solo afectan si cruzan el cuerpo del jugador
    if (c.y1 !== undefined && (p.y + 1.7 < c.y1 || p.y + 0.3 > c.y2)) return;
    if (c.r !== undefined) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const min = c.r + RADIUS;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-9) {
        const dd = Math.sqrt(d2);
        p.x += (dx / dd) * (min - dd);
        p.z += (dz / dd) * (min - dd);
      }
      return;
    }
    const cx = clamp(p.x, c.x1, c.x2);
    const cz = clamp(p.z, c.z1, c.z2);
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= RADIUS * RADIUS) return;
    if (d2 > 1e-9) {
      const dd = Math.sqrt(d2);
      p.x += (dx / dd) * (RADIUS - dd);
      p.z += (dz / dd) * (RADIUS - dd);
    } else {
      // dentro de la caja: salir por el lado más cercano
      const opts = [
        [c.x1 - RADIUS - p.x, 0],
        [c.x2 + RADIUS - p.x, 0],
        [0, c.z1 - RADIUS - p.z],
        [0, c.z2 + RADIUS - p.z],
      ].sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
      p.x += opts[0][0];
      p.z += opts[0][1];
    }
  }
}

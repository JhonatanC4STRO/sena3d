# Mirar3D

Convierte la pantalla en una ventana a un salón 3D. La webcam sigue tu cabeza y la escena se
renderiza con proyección *off-axis*: al moverte ves el cuarto desde otro ángulo, como si estuviera
detrás del cristal.

## Ejecutar

Necesita un servidor local (la cámara no funciona abriendo el archivo directamente):

```bash
python -m http.server 5288
```

Abre http://localhost:5288 y pulsa **Activar cámara** (o **Usar ratón** si no tienes webcam).

## Controles

| Tecla | Acción |
| --- | --- |
| 1–5 / ← → | Cambiar de tema |
| C | Centrar: tu posición actual pasa a ser "de frente" |
| F | Pantalla completa |
| H | Ocultar la interfaz |

El deslizador **Intensidad** exagera o suaviza el movimiento.

## Templo egipcio (templo.html)

Recorrido a pie por un templo basado en la planta clásica: pilonos con relieves, colosos y
obeliscos, patio interior con pórticos, sala hipóstila (nave central alta con claristorio y techo
de estrellas) y la cámara del dios con el naos.

| Control | Acción |
| --- | --- |
| WASD | Andar (Shift: correr) |
| Girar la cabeza | Mirar a los lados; si giras más de ~14° la vista sigue rotando |
| Subir / bajar la cabeza | Mirar arriba / abajo |
| Clic + ratón | Mirar con el ratón |
| ← → / Q E, ↑ ↓ | Girar y mirar arriba/abajo con teclado |
| C | Recalibrar la posición neutra de la cabeza |
| V | Pausar la vista con la cabeza |

El indicador redondo de abajo a la derecha muestra hacia dónde apunta tu cabeza: dentro del aro
solo miras; fuera del aro (punto naranja) la vista gira de forma continua.

## Aula de sistemas (aula.html)

Reconstrucción de un aula de cómputo a partir de 4 fotos: ventanal al norte, nicho con aires
acondicionados, puerta de vidrio, casilleros, mesón contra la pared, mesa doble central con
equipos, columna, TV y pizarra. Mismos controles que el templo.

## SENA · Centro Tecnológico de la Amazonía (sena.html)

Bloque principal reconstruido a partir de fotos: alas de 3 pisos con galerías, torre verde de
escaleras con los paneles del logo, rampas, hall de entrada, parqueadero trasero con el edificio
bajo y las cubiertas, terreno frontal, palmas y selva. Se puede subir por la escalera y por las
rampas a los 3 pisos. Interacciones con **Enter**:

- Puerta "Aula de sistemas" (piso 2, ala derecha) → abre `aula.html` (y desde allí se vuelve).
- Puerta "Sala Mirar3D" (piso 1, ala derecha) → abre la ventana 3D (`index.html`).

Medidas aproximadas (no hay planos públicos): salones de 8 m, pisos cada 3,6 m, bloque de ~72 m.

## Estructura

- `src/projection.js`: proyección off-axis (la pantalla como ventana).
- `src/tracker.js`: detección de cara con MediaPipe y conversión a posición 3D del ojo.
- `src/room.js`: geometría del salón (plataformas, sarcófago, escaleras, repisas, vasijas).
- `src/textures.js`: texturas procedurales generadas con canvas.
- `src/themes.js`: los 5 temas (materiales, luces, antorchas, vegetación, neones, partículas).
- `src/main.js`: render, bloom, bucle e interfaz.
- `src/temple/build.js`: modelo del templo y colisiones.
- `src/temple/player.js`: movimiento, colisiones y vista con la cabeza.
- `src/temple/main.js`: cielo, sol y sombras del templo.
- `src/walk/app.js`: recorrido en primera persona compartido (render, controles, cabeza, interfaz).
- `src/aula/world.js` y `src/aula/textures.js`: modelo y texturas del aula.
- `src/sena/world.js`, `src/sena/props.js`, `src/sena/textures.js`: campus del SENA (edificio, pisos caminables, vehículos, vegetación).

Para añadir un tema nuevo, agrega una entrada a `THEMES` en `src/themes.js` con sus materiales
(por slot: `wall`, `floor`, `ceil`, `stone`, `trim`, `frieze`, `plaque`) y sus extras.

## Créditos de recursos

- **Logo del SENA:** `assets/sena-logo.svg`, "Logosimbolo SENA 2022", [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Logosimbolo_SENA_2022.svg), licencia CC BY 4.0, fuente sena.edu.co.
- **Cielo HDRI:** `assets/cielo-tropical-2k.hdr`, "Kloofendal 48d Partly Cloudy (Pure Sky)" de [Poly Haven](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky), licencia CC0.
- **Texturas fotográficas** (`assets/textures/`): enderezadas a partir de fotos tomadas en el Centro Tecnológico de la Amazonía. El mural de la escalera es obra de @RochiRosas Design.

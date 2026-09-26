# ThermalApp

Análisis de vuelo a partir del archivo IGC, con las notas del equipo dentro.

## Cómo se usa

Abre y ya estás mirando un task. Arriba se cambia de task; abajo, de piloto.

Son **7 tasks de una competición real** (Valadares, Brasil, abril 2026), los
mismos para todo el mundo, siempre. De cada uno hay **seis pilotos**: el de Pam y
los cinco que más volaron ese día. Compararte con los que ganan es lo que se hace
después de volar.

## Qué saca de cada vuelo

- **El mapa** con el track coloreado: naranja subiendo, azul planeando.
- **Las térmicas**, con el círculo del tamaño de la vuelta.
- **El viento calculado**, a partir de las vueltas.
- **Altitud, vario y velocidad** en gráficos, con los demás pilotos detrás.
- **Tabla comparativa** de los seis pilotos del task.

## Las observaciones

Cada task tiene sus **observaciones**, y son de la escuadra: hace falta **la
contraseña del equipo** para verlas. Sin ella se ve un recuadro cerrado — no se
enseña ni un trozo.

El canal **no tiene nombre**: se llama por el hash de la contraseña. Dos personas
con la misma contraseña caen en el mismo canal solas, sin registrarse. Y quien no
la sepa **no puede ni encontrar el canal**.

Cada mensaje se cifra con **AES-GCM** antes de salir del dispositivo, y la hora
también. Lo único que llega al servidor son dos campos sin sentido.

## El viento: cómo se saca

Cuando giras en una térmica, tu velocidad de suelo es la suma de dos cosas:

    velocidad = giro + viento

El giro da una vuelta completa, así que si se suman los vectores durante **una
vuelta entera**, el giro se cancela y lo que queda es el viento.

## Los tests

```
node pruebas/test.mjs          # 41 comprobaciones del análisis
node pruebas/test-secreto.mjs  # 29 del mensaje escondido en un IGC
node pruebas/test-canal.mjs    # 28 del canal, contra el servidor de verdad
python3 chequea_app.py         # referencias rotas
```

Los IGC de prueba del análisis se generan con un viento **conocido**, y el test
comprueba que el detector lo acierte.

## Archivos

| | |
|---|---|
| `igc.js` | el parser del archivo IGC |
| `vuelo.js` | las cuentas: velocidad, vario, térmicas, viento |
| `mapa.js` | el mapa y el track |
| `grafico.js` | los gráficos, en SVG a mano |
| `canal.js` | el canal cifrado de las observaciones |
| `secreto.js` | esconder un mensaje dentro de un IGC |
| `tasks.js` | los tasks fijos |
| `tasks/` | los IGC de la competición |
| `pruebas/` | los tests y el generador de IGC de prueba |

## Nada sale de tu teléfono

Los archivos se leen en el navegador. Lo único que viaja son las observaciones, y
van cifradas.

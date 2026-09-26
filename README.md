# Análisis de vuelo

Sube uno o varios archivos IGC y saca el análisis de cada vuelo: dónde estaba el
aire bueno, cuánto planeaste, cuánto viento había y cómo te fue comparado con los
demás.

## Lo que hace

- **El track en el mapa**, coloreado: naranja subiendo, azul planeando.
- **Las térmicas** con el círculo del tamaño de la vuelta que diste.
- **El viento calculado**, a partir de las vueltas.
- **Altitud, vario y velocidad** en gráficos, con los demás pilotos detrás en gris.
- **Tabla comparativa** entre todos los vuelos que subas.
- **Comparación de altitud** desde el despegue de cada uno.

## El viento: cómo se saca

Cuando giras en una térmica, tu velocidad de suelo es la suma de dos cosas:

    velocidad = giro + viento

El giro da una vuelta completa, así que si se suman los vectores durante **una
vuelta entera**, el giro se cancela —lo que gira hacia el norte lo deshace hacia
el sur— y lo que queda es el viento.

No es una estimación a ojo: es la única respuesta que cuadra con el giro.

## Los tests

```
node pruebas/test.mjs
```

41 comprobaciones. Las que importan: los IGC de prueba se generan con un viento
**conocido**, y el test comprueba que el detector lo acierte. Si le pido viento
del norte a 20 km/h y dice "del norte a 20", funciona.

## Archivos

| | |
|---|---|
| `igc.js` | el parser del archivo IGC |
| `vuelo.js` | las cuentas: velocidad, vario, térmicas, viento |
| `mapa.js` | el mapa y el track |
| `grafico.js` | los gráficos, en SVG a mano |
| `pruebas/` | el generador de IGC de prueba y los tests |

## Nada sale de tu teléfono

Los archivos se leen en el navegador. No hay servidor, no se sube nada.

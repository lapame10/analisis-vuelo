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

---

# Mensajes escondidos

Un archivo de vuelo que **además** lleva un mensaje dentro. Solo lo lee quien
tenga la contraseña.

## Por qué un IGC es un buen escondite

Todo el mundo comparte IGCs — *«pásame tu track de ayer»* es lo más normal entre
pilotos. Nadie sospecha de un archivo de vuelo.

Y el formato trae sitios que ningún programa mira. Los **registros `C`**
(comentarios) son legales en el estándar, cada fabricante escribe ahí lo que
quiere, y **ningún programa de análisis los lee**.

## Cómo va cifrado

**AES-GCM** con la clave derivada de la contraseña con **PBKDF2 a 200.000
vueltas** — el mismo cifrado que usa un banco. Todo con la Web Crypto del
navegador: sin librerías, sin servidor.

Dentro del archivo no se ve **ni que hay un mensaje**. Un archivito con
contraseña que no es, no da nada.

## El disfraz

Los trozos van en **hexadecimal**, no en base64 (que canta muchísimo: mayúsculas,
minúsculas y símbolos). Y con el formato que usan de verdad los varios:

```
Cvario,1,3,2a3005130df71656c707e3507c91ebf06aa981bb52cb868787b976c04513
Cvario,2,3,3a0136568e556301b63964925487f40636925be846e2adfa07a4b46517de
Cvario,3,3,ea42166af4cb
```

Para quien abra el archivo, son tres comentarios del aparato.

## El track NO se toca

**Comprobado en los tests:** después de esconder el mensaje, el archivo tiene los
mismos 1.687 puntos, la misma distancia, el mismo viento y las mismas térmicas.
El análisis sale idéntico. Solo se han añadido líneas.

## Los tests

```
node pruebas/test-secreto.mjs
```

29 comprobaciones. Incluyen que la contraseña equivocada **no** saque el mensaje,
que un archivo sin mensaje lo diga claro, que un trozo cortado se detecte, y que
acentos, japonés y emoji sobrevivan.

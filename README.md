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

---

# Los cinco pilotos y la puerta escondida

De cada task hay **cinco pilotos**: `julien garcia`, `baptiste`, `honorin`,
`andy` y `marcela`. Los vuelos son reales (de Valadares); lo que cambia es el
nombre que se enseña.

Y el nombre que trae el IGC **no manda**: manda el del índice. Si no, el nombre
de verdad saldría igual.

## Las observaciones están escondidas

**No se ven al abrir la app.** Hay que hacer **tres toques seguidos en el título
"ThermalApp"** para que aparezca el panel.

Si alguien coge el teléfono y abre la app, ve un análisis de vuelo y nada más:
no hay ni un recuadro cerrado que llame la atención ni invite a probar
contraseñas. **La puerta no está a la vista.**

Los toques tienen que ser seguidos: con más de 2 segundos entre uno y otro, la
cuenta vuelve a cero. Y otros tres toques vuelven a esconderlo.

## Y solo dos teléfonos

Además de la contraseña, solo **los dos primeros teléfonos que se registren**
pueden abrir las observaciones. El tercero no.

Cada teléfono se inventa un número la primera vez y se lo queda. El servidor
guarda los dos primeros. **La decisión la toma el servidor, no la app** — si la
tomara la app, bastaría con abrir las herramientas del navegador para saltárselo.

⚠️ **Sin conexión NO se deja entrar**, a propósito. Si se dejara, cualquiera
podría ver las observaciones poniendo el teléfono en modo avión.

## Y qué protege de verdad

Esto de los dos teléfonos protege **del que coge el teléfono**. No protege de
alguien que consiga escribir en la base de datos, que está abierta.

**Lo que protege el mensaje es la contraseña:** va cifrado con AES, y sin ella no
se lee aunque alguien llegue al canal.

## La etiqueta

`Etiqueta` añade un mensaje al vuelo que estás mirando y lo descarga. **No hay
que subir nada** — el vuelo ya está ahí. El archivo que sale se abre como
cualquier IGC: mismos puntos, misma distancia, mismo viento. Solo lleva unas
líneas más.

---

# La bitácora

El cuaderno de vuelo. Cuatro preguntas, siempre las mismas:

```
Cómo me sentí · Qué aprendí · Qué hice bien · Qué hice mal
```

## Funciona SIN internet

Y esa es la parte que decide si vale o no: **se escribe al aterrizar, en un
despegue, y ahí no hay señal.** Todo va al almacén del propio teléfono. Ni
escribir, ni leer, ni ver los patrones necesita conexión.

No manda nada a ningún sitio. Cero llamadas al servidor.

## Los patrones

Doce vuelos anotados no valen por separado: valen juntos. Al final sale lo que
repites sin darte cuenta:

> *En 9 de 12 vuelos escribiste **"salí tarde"** en qué hice mal.*

Eso no lo ves en un vuelo suelto. Y es lo único que te hace mejor.

Para contar las palabras hay que quitar los acentos (si no, "termica" y "térmica"
serían dos palabras distintas). Pero se guarda la forma original y se enseña esa
— leer "senti" en pantalla parece roto.

## Guardar copia

Un botón exporta todo a un archivo. Sin eso, lo escrito vive en un teléfono y se
pierde el día que se borre. Y se puede volver a cargar: no borra, junta.

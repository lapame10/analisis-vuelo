/* ============================================================
   Los tests del mensaje escondido
   ============================================================
   Lo que hay que comprobar, y por que cada cosa:

     - que el mensaje se esconda y se saque con la clave correcta
     - que con la clave equivocada NO se saque (y que lo diga)
     - que un archivo sin mensaje lo diga, en vez de fallar raro
     - y LO MAS IMPORTANTE: que despues de esconder el mensaje, el archivo siga
       siendo un IGC que se puede analizar. Si el track se rompe, el disfraz no
       sirve de nada.
*/
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { parseIGC } from '../igc.js';
import { analiza } from '../vuelo.js';

/* en Node, el cifrado del navegador se llama asi */
if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.TextEncoder) globalThis.TextEncoder = (await import('node:util')).TextEncoder;

const { esconde, lee, llevaAlgo } = await import('../secreto.js');

let pasan = 0, total = 0;
const fallos = [];
function prueba(nombre, cond, detalle = '') {
  total++;
  if (cond) { pasan++; console.log('  ✓ %s', nombre); }
  else { fallos.push(nombre + ' -> ' + detalle); console.log('  ✗ %s  %s', nombre, detalle); }
}

const dir = new URL('.', import.meta.url).pathname;
const original = readFileSync(dir + 'prueba-norte.igc', 'utf8');

console.log('\n  ============ EL ANALISIS ANTES ============\n');
const antes = analiza(original, parseIGC);
prueba('el IGC original se analiza', antes.ok, antes.motivo || '');
const puntosAntes = antes.puntos.length;
const distAntes = antes.resumen.recorrido;
const vientoAntes = antes.viento ? Math.round(antes.viento.vel) : null;
console.log('   %d puntos · %s · viento %s km/h',
  puntosAntes, (distAntes / 1000).toFixed(1) + ' km', vientoAntes);

console.log('\n  ============ ESCONDER ============\n');

const MENSAJE = 'Nos vemos el sábado en el despegue. Lleva el radio. 🪂';
const CLAVE = 'valle-de-bravo-2026';

const r = await esconde(original, MENSAJE, CLAVE);
prueba('se esconde el mensaje', r.ok, r.motivo || '');
console.log('   %d trozos · %d bytes cifrados', r.trozos, r.bytes);

prueba('el archivo crece (se han añadido lineas)',
  r.texto.length > original.length, r.texto.length + ' vs ' + original.length);
prueba('el archivo tiene la marca', llevaAlgo(r.texto));
prueba('un archivo normal NO tiene la marca', !llevaAlgo(original));

/* ---- que los comentarios parezcan comentarios ---- */
const lineasC = r.texto.split('\n').filter(l => l.startsWith('C'));
const todasPlausibles = lineasC.every(l => /^Cvario,\d+,\d+,[0-9a-f]+$/.test(l));
prueba('los comentarios tienen pinta de comentario de vario', todasPlausibles,
  lineasC[0] ? lineasC[0].slice(0, 50) : '');
/* OJO: la linea SIEMPRE empieza por la C del formato del IGC. Hay que mirar
   solo lo que va DESPUES del prefijo, o el test se queja de su propio formato. */
const soloDatos = lineasC.map(l => l.replace(/^Cvario,\d+,\d+,/, '')).join('');
prueba('los datos no llevan mayusculas (parecen numeros de vario, no base64)',
  !/[A-Z]/.test(soloDatos), 'mayusculas: ' + (soloDatos.match(/[A-Z]/g) || []).slice(0,5).join(''));

console.log('\n  ============ LO IMPORTANTE: EL TRACK SIGUE BIEN ============\n');
const despues = analiza(r.texto, parseIGC);
prueba('el archivo con mensaje SIGUE siendo un IGC válido', despues.ok, despues.motivo || '');
prueba('tiene los mismos puntos', despues.puntos.length === puntosAntes,
  despues.puntos.length + ' vs ' + puntosAntes);
prueba('la distancia es la misma',
  Math.abs(despues.resumen.recorrido - distAntes) < 1,
  despues.resumen.recorrido.toFixed(0) + ' vs ' + distAntes.toFixed(0));
prueba('el viento sale igual',
  Math.abs(despues.viento.vel - antes.viento.vel) < 0.01,
  despues.viento.vel.toFixed(2) + ' vs ' + antes.viento.vel.toFixed(2));
prueba('el nombre del piloto sigue', despues.nombre === antes.nombre, despues.nombre);
prueba('la fecha sigue', despues.meta.fecha === antes.meta.fecha, despues.meta.fecha);

/* y que el analisis entero de lo mismo */
const t = (a, b, n) => prueba(n, Math.abs(a - b) < 0.001, a + ' vs ' + b);
t(despues.resumen.altMax, antes.resumen.altMax, 'la altitud maxima es igual');
t(despues.resumen.segundos, antes.resumen.segundos, 'la duracion es igual');
t(despues.resumen.nTermicas, antes.resumen.nTermicas, 'las termicas son las mismas');

console.log('\n  ============ LEER ============\n');

const l1 = await lee(r.texto, CLAVE);
prueba('con la clave correcta se lee', l1.ok, l1.motivo || '');
prueba('el mensaje es EXACTAMENTE el que se escribio', l1.mensaje === MENSAJE,
  JSON.stringify(l1.mensaje));

const l2 = await lee(r.texto, 'clave-equivocada');
prueba('con la clave equivocada NO se lee', l2.ok === false);
prueba('y dice que la contrasena no es', l2.motivo === 'La contraseña no es esa.', l2.motivo);

const l3 = await lee(original, CLAVE);
prueba('un archivo sin mensaje lo dice claro', l3.ok === false && /no lleva ningún mensaje/.test(l3.motivo),
  l3.motivo);

console.log('\n  ============ LO QUE NO DEBE PASAR ============\n');

/* el mismo mensaje dos veces -> distinto resultado (por la sal) */
const r2 = await esconde(original, MENSAJE, CLAVE);
const c1 = r.texto.split('\n').filter(l => l.startsWith('Cvario')).join('');
const c2 = r2.texto.split('\n').filter(l => l.startsWith('Cvario')).join('');
prueba('el mismo mensaje da archivos distintos (sal aleatoria)', c1 !== c2);
prueba('y los dos se leen igual',
  (await lee(r2.texto, CLAVE)).mensaje === MENSAJE);

/* mensajes largos */
const LARGO = 'A'.repeat(1200);
const r3 = await esconde(original, LARGO, CLAVE);
prueba('un mensaje largo tambien cabe', r3.ok);
prueba('y se lee entero', (await lee(r3.texto, CLAVE)).mensaje === LARGO,
  (await lee(r3.texto, CLAVE)).mensaje.length + ' de 1200');

/* un trozo cortado -> se dice */
const cortado = r.texto.split('\n').filter(l => !/^Cvario,3,/.test(l)).join('\n');
const l4 = await lee(cortado, CLAVE);
prueba('si falta un trozo, lo dice', l4.ok === false && /partido/.test(l4.motivo), l4.motivo);

/* acentos y emoji */
const CON_ACENTOS = 'Ñandú, pingüino, 日本語, 🪂🔥 y "comillas"';
const r4 = await esconde(original, CON_ACENTOS, CLAVE);
prueba('acentos, japones y emoji sobreviven',
  (await lee(r4.texto, CLAVE)).mensaje === CON_ACENTOS);

/* sin clave */
prueba('sin contrasena no se puede esconder', (await esconde(original, MENSAJE, '')).ok === false);
prueba('sin contrasena no se puede leer', (await lee(r.texto, '')).ok === false);

console.log('\n  ====================================================');
console.log('  %s', fallos.length ? '✗ ' + fallos.length + ' FALLOS' : '✓ todo bien');
console.log('  %d de %d', pasan, total);
if (fallos.length) { console.log(''); fallos.forEach(f => console.log('   - ' + f)); }
console.log('');
process.exit(fallos.length ? 1 : 0);

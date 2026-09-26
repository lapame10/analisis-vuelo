/* ============================================================
   Los tests del analisis
   ============================================================
   Se corren con:  node pruebas/test.mjs

   Lo importante: los IGCs de prueba se generan con un viento CONOCIDO. Si el
   detector dice el viento que se le metio, funciona. No es "parece que va
   bien": es un numero que tiene que cuadrar.
*/
import { readFileSync } from 'node:fs';
import { parseIGC } from '../igc.js';
import { analiza, completa, segmentos, vientoDeTermicas, agrupaTermicas, fmt } from '../vuelo.js';

let pasan = 0, total = 0;
const fallos = [];

function prueba(nombre, condicion, detalle = '') {
  total++;
  if (condicion) { pasan++; console.log('  ✓ %s', nombre); }
  else { fallos.push(nombre + (detalle ? ' -> ' + detalle : '')); console.log('  ✗ %s  %s', nombre, detalle); }
}

const casos = [
  { f: 'prueba-norte.igc',   dir: 0,   vel: 20 },
  { f: 'prueba-sureste.igc', dir: 135, vel: 15 },
  { f: 'prueba-oeste.igc',   dir: 270, vel: 25 },
];

const dir = new URL('.', import.meta.url).pathname;

console.log('\n  ================ EL VIENTO ================');
console.log('  (es lo que mas facil es calcular mal)\n');

for (const c of casos) {
  const texto = readFileSync(dir + c.f, 'utf8');
  const r = analiza(texto, parseIGC);

  if (!r.ok) { prueba(c.f + ' se lee', false, r.motivo); continue; }
  prueba(c.f + ' se lee', true);

  const v = r.viento;
  if (!v) { prueba(c.f + ': hay viento', false, 'no se detecto ninguno'); continue; }

  /* la direccion: el error tiene que ser pequeño, contando que 0 y 360 son el
     mismo sitio */
  let dif = Math.abs(v.dir - c.dir);
  if (dif > 180) dif = 360 - dif;

  prueba(c.f + ': la direccion del viento',
    dif <= 25, 'puso ' + c.dir + '°, salio ' + Math.round(v.dir) + '° (' + Math.round(dif) + '° de error)');

  prueba(c.f + ': la velocidad del viento',
    Math.abs(v.vel - c.vel) <= c.vel * 0.35,
    'puse ' + c.vel + ' km/h, salio ' + v.vel.toFixed(1) + ' km/h');

  prueba(c.f + ': tiene suficientes medidas',
    v.cuantas >= 2, v.cuantas + ' vueltas medidas');
}

console.log('\n  ================ EL VUELO ================\n');

const texto = readFileSync(dir + 'prueba-norte.igc', 'utf8');
const r = analiza(texto, parseIGC);
const res = r.resumen;

prueba('el parser da puntos', r.puntos.length > 500, r.puntos.length + ' puntos');
prueba('la fecha sale de la cabecera', /^\d{4}-\d{2}-\d{2}$/.test(r.meta.fecha || ''), r.meta.fecha);
prueba('el piloto sale de la cabecera', !!r.nombre, r.nombre);

prueba('el resumen tiene duracion', res && res.segundos > 600, res ? fmt.hms(res.segundos) : 'sin resumen');
prueba('la duracion es razonable (menos de 6 h)', res && res.segundos < 6 * 3600, res ? fmt.hms(res.segundos) : '');
prueba('hay altitudes', res && res.altMax != null && res.altMin != null,
  res ? fmt.m(res.altMin) + ' a ' + fmt.m(res.altMax) : '');
prueba('la altitud maxima es mayor que la minima', res && res.altMax > res.altMin);
prueba('hay distancia recorrida', res && res.recorrido > 5000, res ? fmt.km(res.recorrido / 1000) : '');
prueba('recorrido > recto (porque dio vueltas)', res && res.recorrido > res.recto);
prueba('hay velocidad media', res && res.hsMedia > 5 && res.hsMedia < 80, res ? fmt.kmh(res.hsMedia) : '');
prueba('la velocidad maxima es mayor que la media', res && res.hsMax >= res.hsMedia);

prueba('se detectan termicas', res && res.nTermicas >= 3, res ? res.nTermicas + ' termicas' : '');
prueba('hay tramos', r.tramos.length > 5, r.tramos.length + ' tramos');
prueba('hay subidas y planeos',
  r.tramos.some(t => t.tipo === 'subida') && r.tramos.some(t => t.tipo === 'planeo'));

const subidas = r.tramos.filter(t => t.tipo === 'subida');
const planeos = r.tramos.filter(t => t.tipo === 'planeo');
prueba('las subidas suben (vario medio positivo)',
  subidas.every(t => t.vs == null || t.vs > -0.2),
  subidas.map(t => t.vs && t.vs.toFixed(2)).join(' '));
prueba('los planeos bajan (vario medio negativo)',
  planeos.every(t => t.vs == null || t.vs < 0.2),
  planeos.map(t => t.vs && t.vs.toFixed(2)).slice(0, 6).join(' '));
prueba('los planeos tienen relacion de planeo',
  planeos.some(t => t.gr != null && t.gr > 2), '');
prueba('el mejor planeo es creible (entre 3 y 20)',
  res.mejorPlaneo == null || (res.mejorPlaneo.gr > 3 && res.mejorPlaneo.gr < 20),
  res.mejorPlaneo ? res.mejorPlaneo.gr.toFixed(1) : 'sin planeo');
prueba('la mejor subida es creible (entre 0.3 y 8 m/s)',
  res.mejorSubida == null || (res.mejorSubida.vs > 0.3 && res.mejorSubida.vs < 8),
  res.mejorSubida ? res.mejorSubida.vs.toFixed(2) : 'sin subida');
prueba('la eficiencia esta entre 0 y 1',
  res.eficiencia == null || (res.eficiencia >= 0 && res.eficiencia <= 1),
  res.eficiencia != null ? fmt.pct(res.eficiencia) : '');
prueba('hay termicas de verdad (con giro)',
  r.termicas.some(t => t.esTermica), r.termicas.length + ' agrupadas');

const t0 = r.termicas.filter(t => t.esTermica);
prueba('las termicas suben', t0.every(t => t.vs == null || t.vs > 0),
  t0.map(t => t.vs && t.vs.toFixed(2)).join(' '));
prueba('las termicas dan vueltas', t0.every(t => t.vueltas >= 0.7),
  t0.map(t => t.vueltas.toFixed(1)).join(' '));

console.log('\n  ================ LO QUE NO DEBE MENTIR ================\n');

prueba('un archivo vacio se rechaza', analiza('', parseIGC).ok === false);
prueba('basura se rechaza', analiza('hola que tal', parseIGC).ok === false);
prueba('un IGC sin puntos B se rechaza', analiza('HFDTE010124\nHFFTYFRTYPE:x\n', parseIGC).ok === false);
prueba('un IGC rechazado NO trae puntos', analiza('basura', parseIGC).puntos === undefined);
prueba('un IGC rechazado dice por que', !!analiza('', parseIGC).motivo);

/* y lo mas importante de todo: que no se invente un vuelo */
const raro = analiza('B0000000000000N00000000WA0000000000', parseIGC);
prueba('un punto solo no da resumen falso', raro.ok === false || raro.resumen == null,
  raro.ok ? 'devolvio resumen' : 'rechazado');

console.log('\n  ====================================================');
console.log('  %s', fallos.length ? '✗ ' + fallos.length + ' FALLOS' : '✓ todo bien');
console.log('  %d de %d', pasan, total);
if (fallos.length) { console.log('\n  fallos:'); fallos.forEach(f => console.log('   - ' + f)); }
console.log('');
process.exit(fallos.length ? 1 : 0);

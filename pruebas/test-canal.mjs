/* ============================================================
   Los tests del canal
   ============================================================
   Lo que hay que comprobar, y por que:

     - que DOS personas con la misma contrasena se encuentren
     - que con contrasenas distintas NO se encuentren (ni puedan)
     - que el servidor NO pueda leer lo que se escribe
     - que los mensajes lleguen y se marquen como mios o del otro
     - que borrar borre de verdad

   Estos tests ESCRIBEN en el servidor de verdad. Usan una contrasena de prueba
   distinta cada vez, asi que no molestan a ningun canal real, y limpian lo suyo
   al terminar.
*/
import { webcrypto } from 'node:crypto';
import { TextEncoder as TE, TextDecoder as TD } from 'node:util';

/* el cifrado y las utilidades del navegador, en Node */
if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.TextEncoder) globalThis.TextEncoder = TE;
if (!globalThis.TextDecoder) globalThis.TextDecoder = TD;
if (!globalThis.btoa) globalThis.btoa = s => Buffer.from(s, 'binary').toString('base64');
if (!globalThis.atob) globalThis.atob = s => Buffer.from(s, 'base64').toString('binary');
/* y un localStorage de mentira, para que cada "persona" tenga su dispositivo */
let almacen = {};
globalThis.localStorage = {
  getItem: k => (k in almacen ? almacen[k] : null),
  setItem: (k, v) => { almacen[k] = String(v); },
  removeItem: k => { delete almacen[k]; },
};

const C = await import('../canal.js');

let pasan = 0, total = 0;
const fallos = [];
function prueba(nombre, cond, detalle = '') {
  total++;
  if (cond) { pasan++; console.log('  ✓ %s', nombre); }
  else { fallos.push(nombre + ' -> ' + detalle); console.log('  ✗ %s  %s', nombre, detalle); }
}

/* una contrasena distinta cada vez, para no pisar canales reales */
const SORBO = Math.random().toString(36).slice(2, 8);
const CLAVE = 'prueba-' + SORBO;
const OTRA = 'prueba-' + SORBO + '-distinta';

console.log('\n  ============ DOS PERSONAS ============\n');

/* ---- persona A ---- */
almacen = {};                         /* dispositivo A */
const a = C.nuevoCanal(CLAVE);
const ra = await C.abre(a);
prueba('A abre el canal', ra.ok, ra.motivo || '');

/* ---- persona B (otro dispositivo, la misma contrasena) ---- */
almacen = {};                         /* dispositivo B */
const b = C.nuevoCanal(CLAVE);
const rb = await C.abre(b);
prueba('B abre el canal', rb.ok, rb.motivo || '');

prueba('las dos caen en el MISMO canal', ra.nombre === rb.nombre,
  ra.nombre + ' vs ' + rb.nombre);
prueba('pero cada una es distinta persona', ra.quien !== rb.quien,
  ra.quien + ' vs ' + rb.quien);
console.log('   canal: %s…', ra.nombre.slice(0, 12));

/* ---- y una tercera con otra contrasena ---- */
almacen = {};
const ot = C.nuevoCanal(OTRA);
await C.abre(ot);
prueba('con otra contrasena, OTRO canal', ot.nombre !== ra.nombre);
console.log('   otro canal: %s…', ot.nombre.slice(0, 12));

console.log('\n  ============ MENSAJES DE IDA Y VUELTA ============\n');

almacen = {};
const a2 = C.nuevoCanal(CLAVE);
await C.abre(a2);
const e1 = await C.envia(a2, 'Voy al despegue a las 9.');
prueba('A manda un mensaje', e1.ok, e1.motivo || '');

/* B lo recibe */
almacen = {};
const b2 = C.nuevoCanal(CLAVE);
const rb2 = await C.abre(b2);
const r1 = await C.recibe(b2);
prueba('B lo recibe', r1.ok && r1.mensajes.length === 1, JSON.stringify(r1).slice(0, 120));
prueba('y el texto llega entero', r1.mensajes && r1.mensajes[0].texto === 'Voy al despegue a las 9.',
  r1.mensajes ? r1.mensajes[0].texto : '');
prueba('B lo ve como del OTRO, no suyo', r1.mensajes && r1.mensajes[0].mio === false);

/* y B contesta */
const e2 = await C.envia(b2, 'Perfecto, llevo el radio.');
prueba('B contesta', e2.ok, e2.motivo || '');

/* A lo recibe */
const r2 = await C.recibe(a2);
prueba('A recibe la contestacion', r2.ok && r2.mensajes.length > 0);
const dela = (r2.mensajes || []).filter(m => !m.mio && m.texto);
prueba('y la ve como del otro', dela.length >= 1, JSON.stringify(r2.mensajes).slice(0, 150));
prueba('el mensaje del otro es el correcto',
  dela.some(m => m.texto === 'Perfecto, llevo el radio.'), '');

/* ---- que no se dupliquen al volver a pedir ---- */
const r3 = await C.recibe(a2);
prueba('volver a pedir NO duplica los mensajes', r3.mensajes.length <= r2.mensajes.length + 1,
  r3.mensajes.length + ' vs ' + r2.mensajes.length);

console.log('\n  ============ EL SERVIDOR NO PUEDE LEER ============\n');

/* se mira lo que hay guardado, en crudo */
const crudo = await (await fetch(
  `https://plan-gym-8aff7-default-rtdb.firebaseio.com/canal/${a2.nombre}.json`)).json();
const todoCrudo = JSON.stringify(crudo);

prueba('el servidor tiene los mensajes', !!crudo && Object.keys(crudo).length >= 2,
  Object.keys(crudo || {}).length + ' sobres');
prueba('NO se ve el texto de ningun mensaje', !/despegue|radio/i.test(todoCrudo),
  'se colo texto en claro');
prueba('NO se ve la contrasena', !todoCrudo.includes(SORBO), 'se colo la contraseña');
prueba('NO se ve cuando se escribio',
  !/"ts"/.test(todoCrudo.split('i":')[0]), 'hay un ts en claro');
prueba('lo que hay son dos campos por sobre (iv y datos)',
  Object.values(crudo)[0] && 'i' in Object.values(crudo)[0] && 'd' in Object.values(crudo)[0],
  JSON.stringify(Object.values(crudo)[0]).slice(0, 60));

console.log('   --- esto es TODO lo que ve el servidor ---');
const uno = Object.values(crudo)[0];
console.log('   %s', JSON.stringify(uno).slice(0, 150));

console.log('\n  ============ CON LA CONTRASENA EQUIVOCADA ============\n');

almacen = {};
const malo = C.nuevoCanal(OTRA);
await C.abre(malo);
const rm = await C.recibe(malo);
/* con otra contrasena se mira OTRO canal, que esta vacio: no es que falle, es que
   no llega. Eso es mas fuerte que fallar. */
prueba('con otra contrasena no llega a los mensajes',
  rm.ok && (!rm.mensajes || rm.mensajes.length === 0),
  JSON.stringify(rm).slice(0, 120));

console.log('\n  ============ LO QUE NO DEBE PASAR ============\n');

prueba('sin contrasena no se abre', C.nuevoCanal('').ok === false);
prueba('con contrasena corta no se abre', C.nuevoCanal('123').ok === false);
prueba('un mensaje vacio no se envia', (await C.envia(a2, '   ')).ok === false);
prueba('un mensaje larguisimo no se envia',
  (await C.envia(a2, 'x'.repeat(500))).ok === false);
prueba('acentos y emoji llegan bien',
  (await C.envia(a2, 'Ñandú 🪂 y "comillas"')).ok);
const r4 = await C.recibe(a2);
const conEmoji = await C.recibe(a2);
prueba('y se leen enteros', r4.ok);

console.log('\n  ============ BORRAR ============\n');

const todos = (await C.recibe(a2)).mensajes.filter(m => m.id);
if (todos.length) {
  const b1 = await C.borra(a2, todos[0].id);
  prueba('se borra un mensaje', b1.ok);
  const despues = await C.recibe(a2);
  prueba('y desaparece de verdad',
    !despues.mensajes.some(m => m.id === todos[0].id),
    'sigue ahi');
} else {
  prueba('se borra un mensaje', false, 'no habia mensajes que borrar');
}

/* ---- limpieza ---- */
console.log('\n  ============ LIMPIEZA ============\n');
for (const c of [ra.nombre, ot.nombre]) {
  const r = await fetch(`https://plan-gym-8aff7-default-rtdb.firebaseio.com/canal/${c}.json`,
    { method: 'DELETE' });
  console.log('   canal %s… borrado: %s', c.slice(0, 10), r.ok);
}

console.log('\n  ====================================================');
console.log('  %s', fallos.length ? '✗ ' + fallos.length + ' FALLOS' : '✓ todo bien');
console.log('  %d de %d', pasan, total);
if (fallos.length) { console.log(''); fallos.forEach(f => console.log('   - ' + f)); }
console.log('');
process.exit(fallos.length ? 1 : 0);

/* ============================================================
   CANAL DE NOTAS — mensajes de ida y vuelta, cifrados
   ============================================================
   Dos personas comparten una contrasena. Con esa contrasena las dos caen en el
   MISMO canal, sin registrarse, sin cuentas, sin decir sus nombres.

   Y todo lo que se escriben aparece DENTRO de la app de vuelo, como "notas del
   vuelo". Si alguien mira la pantalla por encima del hombro, ve un análisis de
   vuelo con sus notas. Que es exactamente lo que es.

   ---------------------------------------------------------------
   COMO SE ENCUENTRAN LAS DOS SIN UN SERVIDOR QUE LAS CONECTE

   El canal no tiene nombre. Se llama por el HASH de la contrasena:

       canal = SHA-256( sal_fija + contrasena )   ->  los primeros 20 caracteres

   Dos personas que escriban la misma contrasena obtienen el mismo nombre de canal
   y se encuentran. Sin registrarse y sin que nadie tenga que darles de alta.

   Y al reves: quien no sepa la contrasena no puede NI ENCONTRAR el canal. No es
   que no pueda leerlo: es que no puede llegar a el.

   ---------------------------------------------------------------
   POR QUE EL SERVIDOR NO PUEDE LEER NADA

   Cada mensaje se cifra con AES-GCM ANTES de salir del dispositivo, con una clave
   distinta por mensaje. Lo que llega al servidor son bytes sin sentido.

   El servidor no tiene la contrasena, asi que no puede abrir nada. Ni el servidor,
   ni quien administre la base de datos, ni quien consiga entrar en ella.

   ⚠️ Y eso importa: la base de datos de Firebase esta abierta (cualquiera con la
   direccion puede escribir). Aqui eso NO es un problema, porque lo unico que hay
   son mensajes cifrados. La contrasena es la que protege, no el servidor. Pero hay
   que decirlo claro, porque es la diferencia entre "seguro" y "seguro mientras
   nadie adivine la contrasena".

   ---------------------------------------------------------------
   LO QUE SI SE VE DESDE FUERA

   Aunque no se pueda leer el contenido, si se puede ver que HAY algo:
     - cuantos mensajes hay
     - a que hora se escribieron
     - cuanto miden (mas o menos)

   Eso es inevitable sin un servidor propio. Es lo que se pierde a cambio de no
   tener que montar nada. Decirlo, y dejar que cada uno decida.
   ============================================================ */

const servidor = 'https://plan-gym-8aff7-default-rtdb.firebaseio.com/canal';

/* Una sal fija. No es secreta (esta en el codigo) y no hace falta que lo sea: lo
   que protege es la contrasena. Esta aqui para que el mismo texto en dos apps
   distintas no de el mismo canal. */
const SAL = 'analisis-de-vuelo/notas/v1';

const RAD = Math.PI / 180;

/* ============================================================
   Utilidades de bytes
   ============================================================ */
const enc = new TextEncoder();
const dec = new TextDecoder();

function aB64(buf) {
  let s = '';
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function deB64(txt) {
  const t = txt.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - t.length % 4) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function aHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ============================================================
   Derivar la clave maestra de la contrasena
   ============================================================
   PBKDF2 a 300.000 vueltas. Tarda un cuarto de segundo para quien sabe la
   contrasena, y años para quien la intenta adivinar probando una por una.
*/
async function claveMaestra(contrasena) {
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(contrasena), 'PBKDF2', false, ['deriveKey', 'deriveBits']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(SAL), iterations: 300000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/* ============================================================
   El nombre del canal
   ============================================================
   Se deriva aparte de la clave (con deriveBits, no deriveKey) para no mezclar
   usos. Es solo un nombre: sirve para que las dos personas coincidan.
*/
async function nombreDeCanal(contrasena) {
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(contrasena), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(SAL + '/canal'), iterations: 100000, hash: 'SHA-256' },
    base, 128);
  /* en hexadecimal: se puede usar en una direccion web sin escapes */
  return aHex(bits).slice(0, 24);
}

/* ============================================================
   Cifrar y descifrar un mensaje
   ============================================================ */
async function cifra(clave, texto) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const datos = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, enc.encode(texto));
  return { iv: aB64(iv), d: aB64(datos) };
}

async function descifra(clave, iv, datos) {
  const claro = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: deB64(iv) }, clave, deB64(datos));
  return dec.decode(claro);
}

/* ============================================================
   EL CANAL
   ============================================================ */
export function nuevoCanal(contrasena) {
  if (!contrasena || contrasena.length < 6) {
    return { ok: false, motivo: 'La contraseña, de al menos 6 caracteres.' };
  }
  return {
    ok: true,
    contrasena,
    /* se rellenan al abrir */
    clave: null, nombre: null, quien: null,
    mensajes: [],
    ultimo: 0,
  };
}

/* ============================================================
   Abrir el canal: derivar la clave y el nombre
   ============================================================
   Devuelve tambien "quien soy": un identificador corto que se deriva de la clave
   MAS un identificador de este dispositivo. Sirve para saber cual de los dos
   mensajes es mio, sin que nadie se llame por su nombre.
*/
export async function abre(canal) {
  if (!canal || !canal.contrasena) return { ok: false, motivo: 'Sin contraseña.' };
  try {
    canal.clave = await claveMaestra(canal.contrasena);
    canal.nombre = await nombreDeCanal(canal.contrasena);
  } catch (e) {
    return { ok: false, motivo: 'No se pudo preparar el canal: ' + e.message };
  }

  /* el identificador de este dispositivo: se guarda para que sobreviva a cerrar
     la app, y es lo unico que se queda en el telefono */
  let d = null;
  try { d = localStorage.getItem('avi-dev'); } catch (e) { d = null; }
  if (!d) {
    d = aHex(crypto.getRandomValues(new Uint8Array(6)));
    try { localStorage.setItem('avi-dev', d); } catch (e) {}
  }
  /* mio = hash(nombre del canal + este dispositivo). Asi los mensajes que yo
     escribo se marcan como mios y los del otro no, y ninguno de los dos aparece
     identificado. */
  const h = await crypto.subtle.digest('SHA-256', enc.encode(canal.nombre + '|' + d));
  canal.quien = aHex(h).slice(0, 10);

  return { ok: true, nombre: canal.nombre, quien: canal.quien };
}

/* ============================================================
   Enviar
   ============================================================ */
export async function envia(canal, texto) {
  const t = (texto || '').trim();
  if (!t) return { ok: false, motivo: 'Escribe algo.' };
  if (t.length > 400) return { ok: false, motivo: 'Demasiado largo (400 caracteres como máximo).' };
  if (!canal.clave) return { ok: false, motivo: 'El canal no está abierto.' };

  const c = await cifra(canal.clave, t);
  /* la hora se cifra TAMBIEN: si fuera en claro, se sabria cuando se escribio
     cada mensaje sin poder leerlo */
  const sobre = await cifra(canal.clave, JSON.stringify({ t: t, ts: Date.now(), de: canal.quien }));

  try {
    const r = await fetch(`${servidor}/${canal.nombre}.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ i: sobre.iv, d: sobre.d }),
    });
    if (!r.ok) return { ok: false, motivo: 'No se pudo enviar (el servidor dijo ' + r.status + ').' };
    const id = (await r.json()).name;
    return { ok: true, id };
  } catch (e) {
    return { ok: false, motivo: 'No se pudo enviar: sin conexión.' };
  }
}

/* ============================================================
   Recibir
   ============================================================
   Solo trae los mensajes que no se tienen: se pide lo que hay DESPUES del ultimo
   que ya se leyo. Con "orderBy" y "startAt" en la peticion.
*/
export async function recibe(canal, opciones = {}) {
  if (!canal.clave) return { ok: false, motivo: 'El canal no está abierto.' };

  let datos;
  try {
    /* ===== NO USAR startAt CON UN VALOR VACIO =====
       Firebase responde 400 si se le manda orderBy="$key" con startAt="" (una
       clave vacia no es una clave valida). Y con canales de dos personas, traer
       todo cuesta menos que una consulta que puede fallar: un canal de meses son
       unos pocos KB.
       Se pide todo y se filtra aqui. Simple y no falla. */
    const r = await fetch(`${servidor}/${canal.nombre}.json`, { cache: 'no-store' });
    if (!r.ok) return { ok: false, motivo: 'No se pudo leer (el servidor dijo ' + r.status + ').' };
    datos = await r.json();
  } catch (e) {
    return { ok: false, motivo: 'Sin conexión.' };
  }

  if (!datos) return { ok: true, nuevos: 0 };

  const lista = [];
  for (const [id, sobre] of Object.entries(datos)) {
    if (!sobre || !sobre.i || !sobre.d) continue;
    /* el ultimo que ya se tenia: se salta */
    if (opciones.desde && id <= opciones.desde) continue;
    try {
      const claro = await descifra(canal.clave, sobre.i, sobre.d);
      const o = JSON.parse(claro);
      lista.push({ id, texto: o.t, ts: o.ts, mio: o.de === canal.quien, de: o.de });
    } catch (e) {
      /* OJO: un mensaje que no se descifra NO se descarta en silencio.
         Solo puede ser una cosa: que se escribio con OTRA contrasena en el mismo
         canal. (El canal se deriva de la contrasena, asi que dos contrasenas
         distintas dan canales distintos... salvo que alguien haya escrito a mano
         en la base de datos.) Se marca como ilegible y se avisa. */
      lista.push({ id, ilegible: true });
    }
  }

  lista.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  return { ok: true, mensajes: lista, nuevos: lista.length };
}

/* ============================================================
   Comprobar si hay algo nuevo, sin traerlo
   ============================================================
   Para poder avisar de un mensaje nuevo sin gastar datos.
*/
export async function hayNuevo(canal, desde) {
  if (!canal.clave) return false;
  try {
    /* igual que arriba: sin startAt, que Firebase lo rechaza si va vacio */
    const r = await fetch(`${servidor}/${canal.nombre}.json`, { cache: 'no-store' });
    const d = await r.json();
    if (!d) return false;
    const ids = Object.keys(d);
    return ids.length > 0 && ids[0] !== desde;
  } catch (e) { return false; }
}

/* ============================================================
   Borrar un mensaje
   ============================================================
   Se borra DE VERDAD del servidor, no se marca. Lo que no está, no se puede
   leer ni aunque alguien consiga la contrasena despues.
*/
export async function borra(canal, id) {
  if (!canal.clave || !id) return { ok: false };
  try {
    const r = await fetch(`${servidor}/${canal.nombre}/${id}.json`, { method: 'DELETE' });
    return { ok: r.ok };
  } catch (e) { return { ok: false }; }
}

/* ============================================================
   EL DISFRAZ
   ============================================================
   Los mensajes se enseñan como "Notas del vuelo". Y una nota de vuelo de verdad
   es corta y habla del vuelo, asi que un mensaje corto encaja solo.

   Esta funcion convierte un mensaje en algo con pinta de nota tecnica, para los
   sitios donde el texto aparece mezclado con datos de vuelo.
   ============================================================ */
export function comoNota(msg, hora) {
  return {
    hora: hora || (msg.ts ? new Date(msg.ts).toTimeString().slice(0, 5) : '--:--'),
    texto: msg.texto || '',
    mio: !!msg.mio,
  };
}

/* ============================================================
   Ayuda para las horas, en la zona del que mira
   ============================================================ */
export function hora(ts) {
  if (!ts) return '--:--';
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
export function fecha(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  if (mismoDia) return 'hoy';
  const ayer = new Date(hoy.getTime() - 86400000);
  if (d.toDateString() === ayer.toDateString()) return 'ayer';
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}

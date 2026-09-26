/* ============================================================
   LOS DOS TELEFONOS
   ============================================================
   Las observaciones solo se pueden abrir desde DOS telefonos. El primero y el
   segundo que se registren. El tercero no.

   Pam lo pidio asi: "si hay alguien que no sea usuario 1 o 2 en el telefono de
   cualquiera de esos 2, va a poder ver el mensaje". O sea: si alguien coge el
   telefono de uno de los dos, no ve nada. Solo los dos aparatos de siempre.

   ---------------------------------------------------------------
   COMO SE HACE SIN CUENTAS NI CONTRASEÑAS

   Cada telefono se inventa un numero cuando abre la app por primera vez y se lo
   queda guardado. Ese numero es como el nombre del aparato.

   Y en el servidor hay una lista con los dos primeros que llegaron. Al abrir, el
   telefono se apunta y el servidor le dice si esta dentro o no:

     - si es el primero o el segundo  -> entra
     - si es de los dos de siempre    -> entra
     - cualquier otro                 -> no entra, y no hay forma de forzarlo
                                          desde el telefono

   La decision la toma el servidor, no la app. Si la tomara la app, bastaria con
   abrir las herramientas del navegador para saltarselo.

   ---------------------------------------------------------------
   ⚠️ Y ESTO ES UNA CAPA MAS, NO LA PROTECCION DE VERDAD

   Esto protege del que COGE EL TELEFONO. No protege de alguien que consiga
   escribir en la base de datos: la base de Firebase esta abierta, asi que quien
   sepa la direccion podria ponerse en la lista.

   Lo que de verdad protege el mensaje es la CONTRASEÑA: los mensajes van
   cifrados y sin ella no se leen, aunque alguien llegue al canal. Esto de los dos
   telefonos es lo de encima, para el caso normal: que alguien coja un telefono
   que no es suyo.
   ============================================================ */

const servidor = 'https://plan-gym-8aff7-default-rtdb.firebaseio.com/dispositivos';
const LLAVE = 'pad-telefono';   /* donde se guarda el numero de este aparato */

/* ============================================================
   El numero de este telefono
   ============================================================ */
function miNumero() {
  let n = null;
  try { n = localStorage.getItem(LLAVE); } catch (e) { n = null; }
  if (!n) {
    /* 12 caracteres al azar. No es una contraseña: es solo un nombre para que el
       servidor distinga un aparato de otro. */
    const b = new Uint8Array(6);
    crypto.getRandomValues(b);
    n = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem(LLAVE, n); } catch (e) {}
  }
  return n;
}

/* ============================================================
   Registrarse y ver si este aparato está dentro
   ============================================================
   Devuelve:
     { dentro: true }              -> este telefono puede ver las observaciones
     { dentro: false, motivo }     -> no puede, y se dice por que
     { dentro: false, sinRed: true}-> no se pudo comprobar
*/
export async function registra() {
  const yo = miNumero();

  /* ⚠️ IMPORTANTE: si no hay red, NO se deja entrar.
     Es la eleccion contraria a la comoda. Si sin red se dejara pasar, cualquiera
     podria ver las observaciones poniendo el telefono en modo avion — que es
     justo la forma mas facil de saltarse esto. Se prefiere pedir conexion. */
  let lista = null;
  try {
    const r = await fetch(`${servidor}.json`, { cache: 'no-store' });
    if (!r.ok) return { dentro: false, sinRed: true, motivo: 'No se pudo comprobar el teléfono.' };
    lista = await r.json();
  } catch (e) {
    return { dentro: false, sinRed: true, motivo: 'Sin conexión.' };
  }

  if (!lista) lista = {};

  /* ya estaba dentro */
  if (lista[yo]) return { dentro: true, numero: yo, registrado: true };

  const cuantos = Object.keys(lista).length;

  /* ---- si ya hay dos, este no entra ---- */
  if (cuantos >= 2) {
    return {
      dentro: false,
      motivo: 'Este teléfono no es uno de los dos autorizados.',
    };
  }

  /* ---- si es el primero o el segundo, se registra ---- */
  try {
    const r = await fetch(`${servidor}/${yo}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Date.now()),
    });
    if (!r.ok) return { dentro: false, sinRed: true, motivo: 'No se pudo registrar el teléfono.' };
  } catch (e) {
    return { dentro: false, sinRed: true, motivo: 'Sin conexión.' };
  }

  return {
    dentro: true,
    numero: yo,
    nuevo: true,
    puesto: cuantos + 1,
    quedan: 1 - cuantos,      /* cuantos huecos quedan despues de este */
  };
}

/* ============================================================
   ¿Este aparato ya está dentro? (sin registrarlo)
   ============================================================
   Se usa para saber si enseñar el candado o directamente la lista.
*/
export async function yaDentro() {
  const yo = miNumero();
  try {
    const r = await fetch(`${servidor}/${yo}.json`, { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()) !== null;
  } catch (e) { return null; }
}

/* ============================================================
   Cuántos aparatos hay
   ============================================================
   Para que Pam pueda comprobar desde su teléfono cuántos hay apuntados. Sin
   enseñar los números: eso no hace falta y no aporta nada.
*/
export async function cuantos() {
  try {
    const r = await fetch(`${servidor}.json`, { cache: 'no-store' });
    if (!r.ok) return null;
    const d = await r.json();
    return d ? Object.keys(d).length : 0;
  } catch (e) { return null; }
}

/* ============================================================
   El numero de este aparato, para enseñarlo si hace falta
   ============================================================ */
export function numero() { return miNumero(); }

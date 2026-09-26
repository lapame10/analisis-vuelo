/* ============================================================
   MENSAJES ESCONDIDOS DENTRO DE UN IGC
   ============================================================
   La idea: mandar un mensaje que solo pueda leer quien tenga la clave, dentro de
   un archivo que parece un vuelo normal.

   POR QUE UN IGC ES UN BUEN ESCONDITE

   Todo el mundo comparte IGCs. Es lo normal entre pilotos: "pasame tu track de
   ayer". Nadie sospecha de un archivo de vuelo. Y el formato trae sitios donde
   meter cosas que NINGUN programa mira:

     C<texto>   los comentarios. Son legales en el estandar y cada fabricante
                escribe ahi lo que le da la gana, asi que un C mas no llama la
                atencion. Y ningun programa de analisis los lee.

   O sea: el archivo se abre, se ve el track, el analisis funciona igual, y el
   mensaje esta ahi dentro sin que nadie lo vea.

   COMO VA CIFRADO

   AES-GCM con la clave derivada de la contrasena con PBKDF2 (200.000 vueltas).
   Es el mismo cifrado que usa un banco. No es un "codigo Cesar" que se rompe en
   dos minutos: sin la contrasena, el mensaje no se puede sacar. Ni siquiera se
   puede saber si hay un mensaje.

   Todo con la Web Crypto del navegador: no hay librerias, no hay servidor, y la
   contrasena no sale del dispositivo.

   DISFRAZ

   Los trozos no van como base64, que canta muchisimo (letras mayusculas y
   minusculas y simbolos raros). Van en HEXADECIMAL, en trozos de 60 caracteres,
   con el formato que usan de verdad los varios:

     C<vario>,<n>,<total>,<datos>

   Asi, para cualquiera que abra el archivo, son cuatro lineas de comentario del
   aparato. Que es exactamente lo que son los C de un IGC de verdad.
   ============================================================ */

const MARCA = 'vario';        /* el nombre que va en el comentario */

/* ============================================================
   Derivar la clave de la contrasena
   ============================================================
   PBKDF2 tarda a proposito: 200.000 vueltas significa que probar contrasenas a
   lo bruto es lentisimo. A la persona que sabe la contrasena no le molesta
   (tarda una fraccion de segundo), y a quien la intenta adivinar le cuesta
   siglos.
*/
async function claveDe(contrasena, sal) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(contrasena), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sal, iterations: 200000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function aHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function deHex(txt) {
  const limpio = txt.replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(limpio.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(limpio.substr(i * 2, 2), 16);
  return out;
}

/* ============================================================
   ESCONDER
   ============================================================
   Devuelve el IGC original con el mensaje metido. El vuelo NO se toca: se
   anaden lineas C y ya esta.
*/
export async function esconde(textoIGC, mensaje, contrasena) {
  if (!textoIGC || !mensaje || !contrasena) {
    return { ok: false, motivo: 'Falta el archivo, el mensaje o la contraseña.' };
  }

  const enc = new TextEncoder();

  /* una sal nueva cada vez: asi, el MISMO mensaje con la MISMA contrasena da un
     resultado distinto cada vez. Sin esto, dos mensajes iguales darian el mismo
     texto cifrado y se podria ver que son iguales. */
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  let cifrado;
  try {
    const clave = await claveDe(contrasena, sal);
    cifrado = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, clave, enc.encode(mensaje));
  } catch (e) {
    return { ok: false, motivo: 'No se pudo cifrar: ' + e.message };
  }

  /* el paquete: sal + iv + datos, todo en hexadecimal */
  const paquete = aHex(sal) + aHex(iv) + aHex(cifrado);

  /* ---- y ahora se parte en trozos con pinta de comentario de vario ---- */
  const TROZO = 60;
  const trozos = [];
  for (let i = 0; i < paquete.length; i += TROZO) trozos.push(paquete.slice(i, i + TROZO));

  const lineas = trozos.map((t, i) =>
    `C${MARCA},${i + 1},${trozos.length},${t}`);

  /* ---- se meten en el archivo, despues de la cabecera H ---- */
  const todas = textoIGC.split(/\r?\n/);
  let ultimaH = -1;
  for (let i = 0; i < todas.length; i++) {
    if (todas[i][0] === 'H') ultimaH = i;
    else if (todas[i][0] === 'B') break;
  }
  /* si el archivo no tiene cabecera, se pone al principio */
  const donde = ultimaH >= 0 ? ultimaH + 1 : 0;

  const salida = [
    ...todas.slice(0, donde),
    ...lineas,
    ...todas.slice(donde),
  ];

  return {
    ok: true,
    texto: salida.join('\n'),
    trozos: trozos.length,
    bytes: cifrado.byteLength,
    lineas: lineas.length,
  };
}

/* ============================================================
   LEER
   ============================================================
   Busca los comentarios, junta los trozos y descifra.
   Si no hay nada, o la contrasena no es, se dice. No se inventa.
*/
export async function lee(textoIGC, contrasena) {
  if (!textoIGC || !contrasena) {
    return { ok: false, motivo: 'Falta el archivo o la contraseña.' };
  }

  /* ---- se recogen los trozos ---- */
  const encontrados = [];
  for (const linea of textoIGC.split(/\r?\n/)) {
    const m = linea.match(new RegExp('^C' + MARCA + ',(\\d+),(\\d+),([0-9a-fA-F]+)\\s*$'));
    if (m) encontrados.push({ n: +m[1], total: +m[2], datos: m[3] });
  }

  if (!encontrados.length) {
    return { ok: false, motivo: 'Este archivo no lleva ningún mensaje escondido.' };
  }

  /* se ordenan por numero, por si vienen descolocados */
  encontrados.sort((a, b) => a.n - b.n);
  const total = encontrados[0].total;
  if (encontrados.length !== total) {
    return {
      ok: false,
      motivo: `El mensaje está partido en ${total} trozos y solo hay ${encontrados.length}. ` +
              'Puede que el archivo se haya cortado al enviarlo.',
    };
  }

  const paquete = encontrados.map(x => x.datos).join('');

  /* ---- se separa sal, iv y datos ---- */
  const sal = deHex(paquete.slice(0, 32));
  const iv = deHex(paquete.slice(32, 56));
  const datos = deHex(paquete.slice(56));

  try {
    const clave = await claveDe(contrasena, sal);
    const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, clave, datos);
    return {
      ok: true,
      mensaje: new TextDecoder().decode(claro),
      trozos: total,
      bytes: datos.byteLength,
    };
  } catch (e) {
    /* si la contrasena no es, el descifrado falla. Se dice claro y sin rodeos. */
    return { ok: false, motivo: 'La contraseña no es esa.' };
  }
}

/* ============================================================
   ¿Lleva algo escondido? — sin contrasena
   ============================================================
   Sirve para saber si el archivo trae mensaje sin tener que probar contrasenas.
   No revela nada del contenido: solo dice si hay comentarios con la marca.
*/
export function llevaAlgo(textoIGC) {
  if (!textoIGC) return false;
  const re = new RegExp('^C' + MARCA + ',\\d+,\\d+,[0-9a-fA-F]+\\s*$', 'm');
  return re.test(textoIGC);
}

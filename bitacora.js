/* ============================================================
   LA BITÁCORA
   ============================================================
   El cuaderno de vuelo. Lo que Pam pidio:

     "una app para escribir como me senti, que aprendi, que hice bien, que hice
      mal... tal vez subir mi track y poner en algun punto como aqui me senti
      asi"

   Y anadio la condicion que lo cambia todo:

     "cuando tenga internet tambien, porque si no como subo las cosas"

   O sea: tiene que funcionar SIN CONEXION. Y tiene razon — se escribe al
   aterrizar, en un despegue, y ahi casi nunca hay senal.

   ============================================================
   TODO SE GUARDA EN EL TELEFONO
   ============================================================
   Nada de esto necesita internet. Ni escribir, ni leer, ni las marcas. Todo va a
   localStorage, que es el almacen del propio navegador.

   Y cuando hay conexion, si hay contrasena de equipo, se sube. Pero eso es un
   EXTRA, no un requisito: la app funciona igual con el telefono en modo avion.
   Esa es la diferencia entre una app que sirve y una que da rabia.

   ============================================================
   LAS MARCAS VAN SOBRE EL GRAFICO, NO SOBRE EL MAPA
   ============================================================
   Y esto es una decision, no una limitacion.

   El mapa necesita internet (las teselas vienen de fuera). El grafico del vuelo
   es SVG dibujado aqui, y funciona sin conexion.

   Pero ademas: para "aqui me senti asi", importa mas el MOMENTO que el lugar.
   "A los 47 minutos, cuando llevaba 20 sin subir" dice mucho mas que unas
   coordenadas. Y en el grafico se ve la altitud, si subias o bajabas, y donde
   estaba la termica — o sea, TODO el contexto de ese momento, de un golpe.

   El lugar sigue guardado (el punto del track), por si algun dia se quiere ver
   en el mapa. Pero lo que se mira es el momento.
   ============================================================ */

const LLAVE = 'thermalapp-bitacora-v1';

/* ============================================================
   LAS PREGUNTAS
   ============================================================
   Fijas. Siempre las mismas cuatro, en el mismo orden.
   Eso no es rigidez: es lo que permite ver patrones despues. Si cada dia
   escribieras en sitios distintos, a los tres meses no podrias comparar nada.
   ============================================================ */
export const PREGUNTAS = [
  { id: 'sentir',   n: 'Cómo me sentí',   d: 'Sin filtrar. Si te dio miedo, lo dices.', pista: 'Insegura, cómoda, con prisa, perdida…' },
  { id: 'aprender', n: 'Qué aprendí',     d: 'Aunque sea pequeño.', pista: 'Que este valle cierra a las 4…' },
  { id: 'bien',     n: 'Qué hice bien',   d: 'Esto cuesta más escribirlo que lo malo. Hazlo igual.', pista: 'Aguanté la térmica hasta el final…' },
  { id: 'mal',      n: 'Qué hice mal',    d: 'Sin castigarte. Es un dato, no un juicio.', pista: 'Salí tarde del tercer giro…' },
];

/* ============================================================
   Leer y guardar
   ============================================================
   Se lee entero y se escribe entero. Con decenas de vuelos son unos pocos KB:
   no merece la pena complicarlo.
   ============================================================ */
export function leeTodo() {
  try {
    const t = localStorage.getItem(LLAVE);
    if (!t) return [];
    const d = JSON.parse(t);
    return Array.isArray(d) ? d : [];
  } catch (e) {
    return [];
  }
}

function guarda(lista) {
  try {
    localStorage.setItem(LLAVE, JSON.stringify(lista));
    return { ok: true };
  } catch (e) {
    /* el almacen lleno es el unico fallo real que puede pasar aqui */
    return { ok: false, motivo: 'No se pudo guardar en el teléfono. Puede que esté lleno.' };
  }
}

/* ============================================================
   Una entrada nueva
   ============================================================ */
export function nueva(parcial = {}) {
  return {
    id: 'e' + Date.now() + Math.floor(Math.random() * 1000),
    fecha: parcial.fecha || hoy(),
    sitio: parcial.sitio || '',
    evento: parcial.evento || '',      /* "PWC Baixo Guandu · Manga 3" */
    hora: parcial.hora || horaAhora(),
    respuestas: parcial.respuestas || {},   /* { sentir: '…', aprender: '…', … } */
    condiciones: parcial.condiciones || { viento: '', dir: '', nubes: '', nota: '' },
    marcas: parcial.marcas || [],      /* [{ t: segundos, tipo, texto }] */
    vuelo: parcial.vuelo || null,      /* { archivo, km, duracion, puntos: … } */
    subida: false,                     /* si ya se subio al equipo */
    creada: Date.now(),
  };
}

/* ============================================================
   Añadir, editar, borrar
   ============================================================ */
export function guardaEntrada(entrada) {
  const lista = leeTodo();
  const i = lista.findIndex(x => x.id === entrada.id);
  if (i >= 0) lista[i] = entrada;
  else lista.unshift(entrada);
  const r = guarda(lista);
  return r.ok ? { ok: true, entrada } : r;
}

export function borraEntrada(id) {
  const lista = leeTodo().filter(x => x.id !== id);
  return guarda(lista);
}

export function una(id) {
  return leeTodo().find(x => x.id === id) || null;
}

/* ============================================================
   Las marcas
   ============================================================
   Cada marca es un momento del vuelo:
     t      el segundo desde el despegue
     tipo   que clase de marca es
     texto  lo que escribiste
   ============================================================ */
export const TIPOS_MARCA = [
  { id: 'bien',   n: 'Aquí lo hice bien',  ic: '✓',  color: '#2f7a4d' },
  { id: 'mal',    n: 'Aquí me equivoqué',  ic: '✗',  color: '#b3453a' },
  { id: 'miedo',  n: 'Aquí me dio miedo',  ic: '!',  color: '#a8742c' },
  { id: 'termica',n: 'Esta fue la buena',  ic: '↑',  color: '#ff8a3d' },
  { id: 'duda',   n: 'Aquí dudé',         ic: '?',  color: '#4d7fd1' },
  { id: 'nota',   n: 'Solo una nota',     ic: '·',  color: '#6b7280' },
];

export function tipoDe(id) {
  return TIPOS_MARCA.find(x => x.id === id) || TIPOS_MARCA[5];
}

export function ponMarca(entrada, marca) {
  const m = {
    id: 'm' + Date.now() + Math.floor(Math.random() * 100),
    t: Math.round(marca.t),
    tipo: marca.tipo || 'nota',
    texto: marca.texto || '',
  };
  entrada.marcas = (entrada.marcas || []).concat([m]);
  entrada.marcas.sort((a, b) => a.t - b.t);
  return m;
}

export function quitaMarca(entrada, id) {
  entrada.marcas = (entrada.marcas || []).filter(m => m.id !== id);
}

/* ============================================================
   De un vuelo, sacar el indice del punto mas cercano a un momento
   ============================================================
   Para saber que pasaba en el vuelo en el segundo en que pusiste la marca:
   altitud, si subias o bajabas, etc.
*/
export function puntoEn(vuelo, segundos) {
  if (!vuelo || !vuelo.puntos || !vuelo.puntos.length) return null;
  const t0 = vuelo.puntos[0].t;
  const objetivo = t0 + segundos;
  let mejor = vuelo.puntos[0];
  let dist = Math.abs(mejor.t - objetivo);
  for (const p of vuelo.puntos) {
    const d = Math.abs(p.t - objetivo);
    if (d < dist) { dist = d; mejor = p; }
  }
  return mejor;
}

/* ============================================================
   Cuanto llevas
   ============================================================ */
export function resumen(lista) {
  const l = lista || leeTodo();
  const conVuelo = l.filter(x => x.vuelo);
  const marcas = l.reduce((a, x) => a + (x.marcas ? x.marcas.length : 0), 0);
  return {
    entradas: l.length,
    conVuelo: conVuelo.length,
    marcas,
    km: conVuelo.reduce((a, x) => a + ((x.vuelo && x.vuelo.km) || 0), 0),
    horas: conVuelo.reduce((a, x) => a + ((x.vuelo && x.vuelo.horas) || 0), 0),
    escritas: l.filter(x => Object.values(x.respuestas || {}).some(v => v && v.trim())).length,
  };
}

/* ============================================================
   Los PATRONES
   ============================================================
   Esto es lo que hace que valga la pena anotar todos los dias.

   Doce vuelos anotados no valen por separado: valen juntos. Aqui se buscan las
   palabras que mas se repiten en cada pregunta, para que salga solo lo que
   repites sin darte cuenta.

   "En 9 de 12 vuelos escribiste 'tarde' en que hice mal."

   Eso no lo ves en un vuelo suelto. Y es lo unico que te hace mejor.
   ============================================================ */
const VACIAS = new Set(['de','la','el','en','y','a','que','los','las','un','una','con','por','para','no','se','me','mi','mas','pero','al','del','es','fue','lo','le','si','ya','muy','todo','toda','sin','sobre','cuando','como','porque','esta','este','esto','hay','era','fui','mas','the','and','of','to','in','it','was','i','a']);

export function palabras(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')     /* sin acentos */
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !VACIAS.has(w));
}

/* ============================================================
   Para contar hay que quitar los acentos (si no, "termica" y "térmica" serian
   dos palabras distintas). Pero para ENSEÑARLO hay que devolver la forma
   original: leer "senti" y "termica" en pantalla queda mal y da sensacion de
   estar roto.

   Asi que se guarda, por cada palabra normalizada, la forma original que mas
   veces aparecio. Y se enseña esa.
   ============================================================ */
export function palabrasConOriginal(texto) {
  const salida = new Map();     /* normalizada -> { original, veces } */
  const bruto = (texto || '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (const w of bruto) {
    const norm = w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (norm.length <= 3 || VACIAS.has(norm)) continue;
    if (!/^[a-z0-9]+$/.test(norm)) continue;
    const a = salida.get(norm);
    if (a) a.veces++;
    else salida.set(norm, { original: w, veces: 1 });
  }
  return salida;
}

export function patrones(lista) {
  const l = lista || leeTodo();
  const salida = {};

  for (const p of PREGUNTAS) {
    const cuenta = {};      /* normalizada -> en cuantos VUELOS aparece */
    const forma = {};       /* normalizada -> la forma original mas vista */
    let cuantas = 0;
    for (const e of l) {
      const t = (e.respuestas || {})[p.id];
      if (!t || !t.trim()) continue;
      cuantas++;
      const enEste = palabrasConOriginal(t);
      for (const [norm, d] of enEste) {
        cuenta[norm] = (cuenta[norm] || 0) + 1;
        /* se guarda la forma que aparezca con mas frecuencia */
        if (!forma[norm] || d.veces > forma[norm].veces) forma[norm] = d;
      }
    }
    salida[p.id] = {
      n: p.n,
      cuantas,
      total: l.length,
      top: Object.entries(cuenta)
        .filter(([, c]) => c >= 2)                 /* una vez es casualidad */
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([w, c]) => ({ palabra: (forma[w] && forma[w].original) || w, veces: c })),
    };
  }

  /* y donde pones las marcas: si casi todas son "mal", eso tambien es un dato */
  const tipos = {};
  for (const e of l) for (const m of (e.marcas || [])) tipos[m.tipo] = (tipos[m.tipo] || 0) + 1;
  salida.marcas = Object.entries(tipos).sort((a, b) => b[1] - a[1])
    .map(([t, c]) => ({ tipo: t, n: tipoDe(t).n, veces: c, color: tipoDe(t).color }));

  return salida;
}

/* ============================================================
   Exportar e importar
   ============================================================
   Sin esto, todo lo escrito vive en un telefono y se pierde el dia que se borre
   o se cambie. Un archivo de texto que se puede guardar donde sea.
   ============================================================ */
export function exporta() {
  return JSON.stringify({ app: 'thermalapp-bitacora', v: 1, entradas: leeTodo() }, null, 2);
}

export function importa(texto, opciones = {}) {
  let d;
  try { d = JSON.parse(texto); } catch (e) { return { ok: false, motivo: 'Ese archivo no es una bitácora.' }; }
  const ent = d && Array.isArray(d.entradas) ? d.entradas : (Array.isArray(d) ? d : null);
  if (!ent) return { ok: false, motivo: 'Ese archivo no es una bitácora.' };

  const lista = leeTodo();
  const porId = {};
  for (const e of lista) porId[e.id] = e;
  let nuevas = 0;
  for (const e of ent) {
    if (!e || !e.id) continue;
    if (!porId[e.id]) { porId[e.id] = e; nuevas++; }
  }
  const todo = Object.values(porId).sort((a, b) => (b.creada || 0) - (a.creada || 0));
  const r = guarda(todo);
  return r.ok ? { ok: true, nuevas, total: todo.length } : r;
}

/* ============================================================
   Utilidades de fecha
   ============================================================ */
export function hoy() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function horaAhora() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

export function fechaLarga(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(a, m - 1, d);
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  return dias[f.getDay()] + ' ' + d + ' de ' + meses[m - 1];
}

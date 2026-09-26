/* ============================================================
   LOS TASKS
   ============================================================
   La app no arranca en una pantalla de carga: arranca DIRECTAMENTE en el analisis
   de un vuelo de competicion. Abres y ya estas mirando un task, como cualquier
   piloto que repasa su vuelo del dia anterior.

   Los vuelos son FIJOS: los mismos archivos para todo el mundo, siempre. Eso
   importa mas de lo que parece:

     - Si cada uno subiera SU vuelo, seria rarisimo que dos personas estuvieran
       mirando el mismo, y eso llama la atencion.
     - Con los mismos vuelos, dos personas que abran la app ven LO MISMO. No hay
       nada que preguntarse.

   Son 7 tasks de una competicion real (Valadares, Brasil, abril 2026), y de cada
   uno hay seis pilotos: el de Pam y los cinco que mas volaron ese dia. Compararte
   con los que ganan es exactamente lo que se hace despues de volar.

   Y las "observaciones" de cada task son donde van los mensajes. Un piloto que
   repasa su vuelo y apunta observaciones es lo que se espera que haga. El disfraz
   no es que la app lo esconda: es que ES la app.

   ---------------------------------------------------------------
   SI UN ARCHIVO FALTA

   Se dice cual y se sigue con los demas. No se inventa un vuelo: un task sin
   datos es un task sin datos.
   ============================================================ */

const INDICE = 'tasks/indice.json';

let cache = null;

/* ============================================================
   Leer el indice y los vuelos
   ============================================================
   El indice trae la lista de tasks, sus fechas y sus vuelos. Los IGC se leen
   aparte, uno a uno, para que un archivo que falle no tumbe los demas.
*/
/* ============================================================
   LEER EL INDICE, SIN LOS VUELOS
   ============================================================
   El indice es pequeño (unos KB) y trae la lista de tasks con sus vuelos. Los
   IGC se leen APARTE, y solo del task que se esta mirando.

   Eso importa: los 7 tasks son 8 MB. Cargarlos todos al abrir hacia que la app
   tardara mas de veinte segundos en estar lista, y una app que se queda cargando
   llama la atencion. Cargando solo el task visible son unos 1,2 MB: aparece en
   un par de segundos, y los demas se traen cuando se cambia de task.
*/
export async function leeIndice() {
  if (cache) return cache;

  let indice = null;
  try {
    const r = await fetch(INDICE, { cache: 'force-cache' });
    if (r.ok) indice = await r.json();
  } catch (e) { indice = null; }

  if (!indice) {
    cache = [{
      n: 0, nombre: 'Sin datos', ok: false,
      motivo: 'No se encontró la lista de tasks (' + INDICE + ').',
      vuelos: [], leido: false,
    }];
    return cache;
  }

  const claves = Object.keys(indice).sort((a, b) => (indice[a].n || 0) - (indice[b].n || 0));
  cache = claves.map(k => {
    const t = indice[k];
    return {
      n: t.n,
      nombre: 'Task ' + t.n,
      sitio: t.sitio || '',
      fecha: t.fecha || '',
      ok: false,
      leido: false,          /* los vuelos todavia no se han traido */
      motivo: null,
      vuelos: [],
      fallos: [],
      lista: t.vuelos || [], /* la lista, sin leer los archivos */
    };
  });
  return cache;
}

/* ============================================================
   Leer los vuelos de UN task
   ============================================================
   Se llama al abrir un task y la primera vez tarda lo que tarde la red. Las
   siguientes veces ya esta en memoria.
*/
export async function leeTask(t, parseIGC, analiza) {
  if (!t) return t;
  if (t.leido) return t;

  for (const v of (t.lista || [])) {
    try {
      const r = await fetch(v.archivo, { cache: 'force-cache' });
      if (!r.ok) { t.fallos.push(v.archivo + ' (' + r.status + ')'); continue; }
      const texto = await r.text();
      const a = analiza(texto, parseIGC);
      if (!a.ok) { t.fallos.push(v.archivo + ': ' + a.motivo); continue; }

      t.vuelos.push({
        ...a,
        nombre: a.nombre || v.piloto || v.archivo,
        esPam: !!v.esPam,
        archivo: v.archivo,
      });
    } catch (e) {
      t.fallos.push(v.archivo + ': ' + e.message);
    }
  }

  t.ok = t.vuelos.length > 0;
  t.leido = true;
  /* el que se mira por defecto: el de Pam, que es lo natural */
  t.cual = Math.max(0, t.vuelos.findIndex(x => x.esPam));
  if (t.ok) {
    const km = t.vuelos.reduce((m, x) => Math.max(m, x.resumen ? x.resumen.recorrido : 0), 0);
    t.km = +(km / 1000).toFixed(1);
  }
  return t;
}

/* ============================================================
   El titulo de cada task
   ============================================================ */
export function tituloDe(t) {
  if (!t) return '';
  const partes = [t.nombre];
  if (t.km) partes.push(t.km.toLocaleString('es-MX', { maximumFractionDigits: 0 }) + ' km');
  return partes.join(' · ');
}

export function subtituloDe(t) {
  if (!t) return 'Análisis de vuelo';
  const partes = [];
  if (t.sitio) partes.push(t.sitio);
  if (t.fecha) partes.push(t.fecha);
  if (t.vuelos && t.vuelos.length) partes.push(t.vuelos.length + ' pilotos');
  return partes.join(' · ') || 'Análisis de vuelo';
}

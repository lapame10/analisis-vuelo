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
export async function cargaTasks(parseIGC, analiza) {
  if (cache) return cache;

  let indice = null;
  try {
    const r = await fetch(INDICE, { cache: 'force-cache' });
    if (r.ok) indice = await r.json();
  } catch (e) { indice = null; }

  if (!indice) {
    /* sin indice no hay nada que enseñar, y se dice claro */
    return [{
      n: 0, nombre: 'Sin datos', ok: false,
      motivo: 'No se encontró la lista de tasks (' + INDICE + ').',
      vuelos: [],
    }];
  }

  const tasks = [];

  /* se ordenan por numero */
  const claves = Object.keys(indice).sort((a, b) => (indice[a].n || 0) - (indice[b].n || 0));

  for (const k of claves) {
    const t = indice[k];
    const ficha = {
      n: t.n,
      nombre: 'Task ' + t.n,
      sitio: t.sitio || '',
      fecha: t.fecha || '',
      ok: false,
      motivo: null,
      vuelos: [],       /* los que se pudieron leer */
      fallos: [],
    };

    for (const v of (t.vuelos || [])) {
      try {
        const r = await fetch(v.archivo, { cache: 'force-cache' });
        if (!r.ok) { ficha.fallos.push(v.archivo + ' (' + r.status + ')'); continue; }
        const texto = await r.text();
        const a = analiza(texto, parseIGC);
        if (!a.ok) { ficha.fallos.push(v.archivo + ': ' + a.motivo); continue; }

        ficha.vuelos.push({
          ...a,
          /* el nombre sale del indice, que es el del archivo original; y si el
             archivo trae uno mejor, se usa ese */
          nombre: a.nombre || v.piloto || v.archivo,
          esPam: !!v.esPam,
          archivo: v.archivo,
        });
      } catch (e) {
        ficha.fallos.push(v.archivo + ': ' + e.message);
      }
    }

    ficha.ok = ficha.vuelos.length > 0;
    /* el que se mira por defecto: el de Pam, que es lo natural */
    ficha.cual = Math.max(0, ficha.vuelos.findIndex(x => x.esPam));
    if (ficha.ok) {
      const km = ficha.vuelos.reduce((m, x) => Math.max(m, x.resumen ? x.resumen.recorrido : 0), 0);
      ficha.km = +(km / 1000).toFixed(1);
    }
    tasks.push(ficha);
  }

  cache = tasks;
  return tasks;
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

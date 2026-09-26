/* ============================================================
   SkyReport — lectura de archivos IGC
   ============================================================

   EL ERROR QUE HABÍA AQUÍ (y que este archivo corrige)
   ---------------------------------------------------
   El parser anterior hacía esto:

       const lat = +linea.slice(7, 15) / 100000;

   Y eso está MAL. El IGC no guarda un número decimal dividido
   entre 100.000: guarda GRADOS Y MINUTOS en texto.

       latitud   DDMMmmmN      (2 de grados + 2 de minutos + 3 de milésimas)
       longitud  DDDMMmmmE     (3 de grados + 2 de minutos + 3 de milésimas)

   La conversión correcta es:

       grados + (minutos + milésimas/1000) / 60

   El resultado de dividir entre 100000 da un número que PARECE
   una coordenada pero está mal, y peor: cae siempre en el mismo
   sitio, así que no salta a la vista. Esto ya no pasa.

   Las tres funciones están separadas y se pueden probar sueltas:
     parseIGCCoordinate()  una coordenada
     parseIGCBRecord()     una línea B
     parseIGC()            el archivo entero
   ============================================================ */

/* ============================================================
   1. UNA COORDENADA
   ============================================================
   Recibe el texto tal cual viene en el IGC, SIN la letra del
   hemisferio, y la letra aparte.

     parseIGCCoordinate('1921050', 'N')  →   19.350833...
     parseIGCCoordinate('1921050', 'S')  →  -19.350833...
     parseIGCCoordinate('10007360', 'W') → -100.122666...

   Devuelve null si el texto no encaja. Nunca inventa un número. */
export function parseIGCCoordinate(txt, hemisferio) {
  if (typeof txt !== 'string') return null;
  const t = txt.trim();
  if (!/^\d{6,8}$/.test(t)) return null;

  /* 6 dígitos = grados(2) + minutos(2) + milésimas(2)  → latitud corta
     7 dígitos = grados(2) + minutos(2) + milésimas(3)  → latitud
     8 dígitos = grados(3) + minutos(2) + milésimas(3)  → longitud */
  const dg = t.length - 5;                      /* dígitos de grados */
  if (dg < 2 || dg > 3) return null;

  const grados = parseInt(t.slice(0, dg), 10);
  const minutos = parseInt(t.slice(dg, dg + 2), 10);
  const milesimas = parseInt(t.slice(dg + 2) || '0', 10);
  if (!isFinite(grados) || !isFinite(minutos) || !isFinite(milesimas)) return null;
  if (minutos >= 60) return null;               /* un minuto nunca llega a 60 */

  let dec = grados + (minutos + milesimas / Math.pow(10, t.length - dg - 2)) / 60;

  /* el hemisferio manda el signo */
  const h = (hemisferio || '').toUpperCase();
  if (h === 'S' || h === 'W') dec = -dec;

  return dec;
}

/* ============================================================
   2. UNA LÍNEA B (el registro de un punto)
   ============================================================
   Formato, contando desde el principio de la línea:

     B  HHMMSS  DDMMmmmN  DDDMMmmmE  A  PPPPP  GGGGG  ...
     0  1..6    7..14     15..23     24 25..29 30..34

   OJO con las dos altitudes: NO son lo mismo y no se pueden
   mezclar.
     · altitud de presión (barométrica): lo que lee el altímetro
       del ala. Es la que se usa para hablar de altura de vuelo.
     • altitud GPS: la del satélite. Suele ir unos metros por
       encima o por debajo.

   Devuelve null si la línea está mal: el que llama decide qué
   hacer, no se rellena con ceros. */
export function parseIGCBRecord(linea) {
  if (typeof linea !== 'string') return null;
  const l = linea.trim();
  if (l.length < 35 || l[0] !== 'B') return null;

  const hora = l.slice(1, 7);
  if (!/^\d{6}$/.test(hora)) return null;
  const hh = parseInt(hora.slice(0, 2), 10);
  const mm = parseInt(hora.slice(2, 4), 10);
  const ss = parseInt(hora.slice(4, 6), 10);
  if (hh > 23 || mm > 59 || ss > 60) return null;

  const laTxt = l.slice(7, 14);
  const laHem = l.slice(14, 15);
  const loTxt = l.slice(15, 23);
  const loHem = l.slice(23, 24);
  if (!/[NS]/.test(laHem) || !/[EW]/.test(loHem)) return null;

  const lat = parseIGCCoordinate(laTxt, laHem);
  const lon = parseIGCCoordinate(loTxt, loHem);
  if (lat == null || lon == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const validez = l.slice(24, 25);              /* A = válido, V = inválido */

  const pTxt = l.slice(25, 30);
  const gTxt = l.slice(30, 35);
  const altPresion = /^\d{5}$/.test(pTxt) ? parseInt(pTxt, 10) : null;
  const altGPS = /^\d{5}$/.test(gTxt) ? parseInt(gTxt, 10) : null;

  return {
    hora, hh, mm, ss,
    segundosDelDia: hh * 3600 + mm * 60 + ss,
    lat, lon,
    valido: validez !== 'V',
    altPresion,        /* barométrica: puede ser null */
    altGPS,            /* GPS: puede ser null */
  };
}

/* ============================================================
   3. EL ARCHIVO COMPLETO
   ============================================================
   Devuelve SIEMPRE un objeto con la misma forma:

     { ok: true,  puntos: [...], meta: {...} }
     { ok: false, motivo: 'texto para el usuario' }

   NUNCA devuelve un track de mentira. Si el archivo no se
   entiende, se dice y ya está: el que llama ofrece volver a
   intentarlo o seguir sin IGC. Un track de demostración solo se
   usa cuando la app está en modo demo, y entonces se dice. */
export function parseIGC(texto) {
  if (typeof texto !== 'string' || !texto.length) {
    return { ok: false, motivo: 'The file is empty.' };
  }

  const lineas = texto.split(/\r?\n/);
  const puntos = [];
  let cabecera = {};
  let invalidos = 0;

  for (const cruda of lineas) {
    const l = cruda.trim();
    if (!l) continue;

    /* la H es la cabecera: aquí vienen la fecha y el piloto */
    if (l[0] === 'H') {
      if (l.startsWith('HFDTE') || l.startsWith('HODTE')) {
        const m = l.match(/(\d{2})(\d{2})(\d{2})/);
        if (m) {
          let aa = parseInt(m[3], 10);
          aa += aa < 70 ? 2000 : 1900;            /* el IGC usa 2 dígitos */
          cabecera.fecha = `${aa}-${m[2]}-${m[1]}`;
        }
      }
      /* ===== LAS CABECERAS LLEVAN EL NOMBRE DEL CAMPO DELANTE =====
         El formato es:  HFPLT + <campo>:<valor>
         Y el campo puede ser PILOTINCHARGE, PILOT, o lo que se le ocurra al
         fabricante. Con slice(5) a secas quedaba pegado el nombre del campo:

             HFPLTPILOTINCHARGE:VIENTO-N  ->  'PILOTINCHARGE:VIENTO-N'   MAL
                                          ->  'VIENTO-N'               bien

         Se corta por los dos puntos y se coge lo de la derecha. Si no hubiera
         dos puntos, se coge todo lo que va despues de la etiqueta. */
      const valorDe = (linea, etiqueta) => {
        let v = linea.slice(etiqueta.length).trim();
        const i = v.indexOf(':');
        if (i >= 0) v = v.slice(i + 1).trim();
        return v || null;
      };
      if (l.startsWith('HFPLT')) cabecera.piloto = valorDe(l, 'HFPLT');
      if (l.startsWith('HFGTY')) cabecera.ala = valorDe(l, 'HFGTY');
      continue;
    }

    if (l[0] !== 'B') continue;

    const p = parseIGCBRecord(l);
    if (p) puntos.push(p);
    else invalidos++;
  }

  if (!puntos.length) {
    return {
      ok: false,
      motivo: invalidos
        ? `None of the ${invalidos} position records could be read.`
        : 'No position records (B) found in this file.',
    };
  }

  /* ---------- cruce de medianoche ----------
     Un vuelo puede empezar a las 23:40 UTC y terminar a las 00:20.
     Si se resta tal cual, los tiempos salen NEGATIVOS y la Black Box
     se descuadra entera. Cuando la hora da un salto hacia atrás, se
     suma un día a todo lo que viene después. */
  let vueltas = 0;
  for (let i = 1; i < puntos.length; i++) {
    if (puntos[i].segundosDelDia < puntos[i - 1].segundosDelDia - 3600) {
      vueltas++;                       /* más de una hora atrás = día nuevo */
    }
    puntos[i].diaExtra = vueltas;
    puntos[i].t = puntos[i].segundosDelDia + vueltas * 86400;
  }
  puntos[0].diaExtra = 0;
  puntos[0].t = puntos[0].segundosDelDia;

  /* ---------- velocidades y rumbos ----------
     Se calculan a partir de los puntos consecutivos. Si un tramo
     no tiene sentido (tiempo cero), se deja en null en vez de
     inventar un número. */
  for (let i = 0; i < puntos.length; i++) {
    if (i === 0) { puntos[i].hs = null; puntos[i].vs = null; puntos[i].heading = null; continue; }
    const a = puntos[i - 1], b = puntos[i];
    const dt = b.t - a.t;
    if (dt <= 0) { b.hs = null; b.vs = null; b.heading = null; continue; }

    const mPorGradoLat = 110540;
    const mPorGradoLon = 111320 * Math.cos(b.lat * Math.PI / 180);
    const dy = (b.lat - a.lat) * mPorGradoLat;
    const dx = (b.lon - a.lon) * mPorGradoLon;
    const dist = Math.sqrt(dx * dx + dy * dy);

    b.hs = (dist / dt) * 3.6;                                   /* km/h sobre el suelo */
    b.heading = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;

    /* el ascenso se saca de la barométrica si existe; si no, del GPS */
    const altA = a.altPresion != null ? a.altPresion : a.altGPS;
    const altB = b.altPresion != null ? b.altPresion : b.altGPS;
    b.vs = (altA != null && altB != null) ? (altB - altA) / dt : null;
  }

  /* ---------- resumen ---------- */
  const conAlt = puntos.filter(p => p.altPresion != null || p.altGPS != null);
  const meta = {
    fecha: cabecera.fecha || null,
    piloto: cabecera.piloto || null,
    ala: cabecera.ala || null,
    puntos: puntos.length,
    invalidos,
    desde: puntos[0].hora,
    hasta: puntos[puntos.length - 1].hora,
    duracionS: puntos[puntos.length - 1].t - puntos[0].t,
    altMax: conAlt.length ? Math.max(...conAlt.map(p => p.altPresion != null ? p.altPresion : p.altGPS)) : null,
    altMin: conAlt.length ? Math.min(...conAlt.map(p => p.altPresion != null ? p.altPresion : p.altGPS)) : null,
    tieneBarometrica: puntos.some(p => p.altPresion != null),
    tieneGPS: puntos.some(p => p.altGPS != null),
  };

  return { ok: true, puntos, meta };
}

/* ============================================================
   4. POSIBLES ANOMALÍAS
   ============================================================
   OJO CON EL LENGUAJE. Esto son OBSERVACIONES, no diagnósticos.

     Bien:  "Rapid heading change detected around 14:37:22 UTC."
     Mal:   "The pilot lost control."

   SkyReport no sabe por qué pasó nada. Solo dice que un número
   se movió mucho. Y OJO: esto NO elige el momento del evento —
   solo propone sitios donde MIRAR. El momento lo confirma la
   persona, porque un incidente puede ser un cravat o un roce
   con otro ala y no parecerse en nada a una caída fuerte. */
export function posiblesAnomalias(puntos) {
  const out = [];
  if (!puntos || puntos.length < 4) return out;

  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1], b = puntos[i];

    /* caída fuerte: más de 5 m/s cuando venía subiendo o nivelado */
    if (b.vs != null && a.vs != null && b.vs <= -5 && a.vs > -2.5) {
      out.push({
        t: puntos[i].t, hora: puntos[i].hora, lat: b.lat, lon: b.lon,
        tipo: 'sink',
        txt: `Rapid descent detected around ${horaBonita(b.hora)} UTC (${b.vs.toFixed(1)} m/s).`,
      });
    }

    /* giro brusco */
    if (b.heading != null && a.heading != null) {
      const dh = Math.abs(((b.heading - a.heading + 540) % 360) - 180);
      if (dh > 60) {
        out.push({
          t: puntos[i].t, hora: puntos[i].hora, lat: b.lat, lon: b.lon,
          tipo: 'heading',
          txt: `Rapid heading change detected around ${horaBonita(b.hora)} UTC (${Math.round(dh)}°).`,
        });
      }
    }

    /* cambio grande de velocidad sobre el suelo */
    if (b.hs != null && a.hs != null && Math.abs(b.hs - a.hs) > 25) {
      out.push({
        t: puntos[i].t, hora: puntos[i].hora, lat: b.lat, lon: b.lon,
        tipo: 'speed',
        txt: `Unusual speed variation around ${horaBonita(b.hora)} UTC ` +
             `(${a.hs.toFixed(0)} → ${b.hs.toFixed(0)} km/h).`,
      });
    }
  }

  /* un hueco largo entre dos puntos: el track se interrumpe */
  for (let i = 1; i < puntos.length; i++) {
    const salto = puntos[i].t - puntos[i - 1].t;
    if (salto > 120) {
      out.push({
        t: puntos[i].t, hora: puntos[i].hora, lat: puntos[i].lat, lon: puntos[i].lon,
        tipo: 'gap',
        txt: `Track interruption around ${horaBonita(puntos[i].hora)} UTC ` +
             `(no data for ${Math.round(salto / 60)} minutes).`,
      });
    }
  }

  /* quito repetidos del mismo tipo que están muy juntos */
  const limpio = [];
  out.forEach(a => {
    const cerca = limpio.find(b => b.tipo === a.tipo && Math.abs(b.t - a.t) < 30);
    if (!cerca) limpio.push(a);
  });
  return limpio.sort((a, b) => a.t - b.t);
}

export function horaBonita(hhmmss) {
  if (!hhmmss || hhmmss.length < 6) return '--:--:--';
  return `${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}:${hhmmss.slice(4, 6)}`;
}

/* ============================================================
   5. LA VENTANA DE LA BLACK BOX
   ============================================================
   Con el momento confirmado por la persona, saca los puntos
   alrededor: T-120, T-60, T-30, EVENT, T+30, T+60.

   Si un valor no existe, se devuelve null y la interfaz enseña
   N/A. NUNCA se rellena con un número inventado. */
export function ventanaEvento(puntos, tEvento) {
  const marcas = [-120, -60, -30, 0, 30, 60];
  return marcas.map(off => {
    const objetivo = tEvento + off;
    let mejor = null, mejorD = Infinity;
    for (const p of puntos) {
      const d = Math.abs(p.t - objetivo);
      if (d < mejorD) { mejorD = d; mejor = p; }
    }
    if (!mejor) return { off, t: objetivo, punto: null };
    /* si el punto más cercano está a más de un minuto, no vale:
       es mejor decir N/A que enseñar algo de otro momento */
    if (mejorD > 60) return { off, t: objetivo, punto: null };
    return { off, t: mejor.t, punto: mejor };
  });
}

/* ============================================================
   6. TESTS
   ============================================================
   Se pueden lanzar desde la consola del navegador:
       const m = await import('./srs/igc.js'); m.autotest();
   Y también valen tal cual para Node. */
export function autotest() {
  const r = [];
  const t = (nombre, cond, detalle = '') => r.push({ nombre, ok: !!cond, detalle });

  /* --- coordenadas --- */
  t('latitud norte', casi(parseIGCCoordinate('1921050', 'N'), 19.3508333, 1e-5),
    String(parseIGCCoordinate('1921050', 'N')));
  t('latitud sur (negativa)', casi(parseIGCCoordinate('1921050', 'S'), -19.3508333, 1e-5));
  t('longitud este', casi(parseIGCCoordinate('10007360', 'E'), 100.1226666, 1e-5),
    String(parseIGCCoordinate('10007360', 'E')));
  t('longitud oeste (negativa)', casi(parseIGCCoordinate('10007360', 'W'), -100.1226666, 1e-5));
  t('minutos >= 60 se rechaza', parseIGCCoordinate('1960000', 'N') === null);
  t('texto vacío se rechaza', parseIGCCoordinate('', 'N') === null);
  t('basura se rechaza', parseIGCCoordinate('abcdefg', 'N') === null);

  /* --- línea B --- */
  const bOk = 'B1412481921050N10007360WA0123401300';
  const p = parseIGCBRecord(bOk);
  t('línea B válida', p && casi(p.lat, 19.3508333, 1e-5) && casi(p.lon, -100.1226666, 1e-5),
    p ? `${p.lat}, ${p.lon}` : 'null');
  t('hora UTC de la línea B', p && p.hora === '141248', p && p.hora);
  t('altitud de presión', p && p.altPresion === 1234, p && String(p.altPresion));
  t('altitud GPS separada', p && p.altGPS === 1300, p && String(p.altGPS));
  t('altitudes NO mezcladas', p && p.altPresion !== p.altGPS);
  t('línea B corta se rechaza', parseIGCBRecord('B1412') === null);
  t('línea B inválida se rechaza', parseIGCBRecord('B14XX481921050N10007360WA0123401300') === null);
  t('latitud fuera de rango se rechaza',
    parseIGCBRecord('B1412489921050N10007360WA0123401300') === null);

  /* --- archivo entero --- */
  const archivito = [
    'AXXXABC SKYREPORT TEST',
    'HFDTE010124',
    'HFPLT:Test Pilot',
    bOk,
    'B1412531921060N10007370WA0123601310',
    'B1412581921070N10007380WA0123801320',
    'B1413031921080N10007390WA0124001330',
  ].join('\n');
  const f = parseIGC(archivito);
  t('archivo válido', f.ok === true, f.ok ? `${f.puntos.length} puntos` : f.motivo);
  t('fecha de la cabecera', f.ok && f.meta.fecha === '2024-01-01', f.ok && f.meta.fecha);
  t('cuenta los puntos', f.ok && f.puntos.length === 4, f.ok && String(f.puntos.length));
  t('calcula velocidad', f.ok && f.puntos[1].hs != null && f.puntos[1].hs >= 0);
  t('calcula rumbo', f.ok && f.puntos[1].heading != null);

  /* --- sin B-records --- */
  const vacio = parseIGC('AXXX\nHFDTE010124\n');
  t('archivo sin B-records falla', vacio.ok === false, vacio.motivo);
  t('y NO devuelve un track de mentira', vacio.puntos === undefined);

  /* --- B-records ilegibles --- */
  const roto = parseIGC('HFDTE010124\nBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n');
  t('B-records ilegibles fallan', roto.ok === false, roto.motivo);
  t('texto vacío falla', parseIGC('').ok === false);

  /* --- cruce de medianoche --- */
  const noche = [
    'HFDTE010124',
    'B2358001921050N10007360WA0123401300',
    'B2358501921060N10007370WA0123501310',
    'B0000101921070N10007380WA0123601320',
    'B0001001921080N10007390WA0123701330',
  ].join('\n');
  const n = parseIGC(noche);
  t('vuelo de medianoche se lee', n.ok === true, n.ok ? 'ok' : n.motivo);
  if (n.ok) {
    let negativo = false;
    for (let i = 1; i < n.puntos.length; i++) {
      if (n.puntos[i].t < n.puntos[i - 1].t) negativo = true;
    }
    t('ningún tiempo negativo al cruzar medianoche', !negativo,
      n.puntos.map(p => p.t).join(', '));
    t('el vuelo avanza (no retrocede)', n.puntos[n.puntos.length - 1].t > n.puntos[0].t);
    t('la duración es razonable', n.meta.duracionS > 0 && n.meta.duracionS < 3600,
      String(n.meta.duracionS) + ' s');
  }

  /* --- ventana del evento --- */
  const v = ventanaEvento(f.ok ? f.puntos : [], f.ok ? f.puntos[1].t : 0);
  t('la ventana tiene 6 marcas', v.length === 6);
  t('la marca del evento está en el medio', v[3].off === 0);

  const pasan = r.filter(x => x.ok).length;
  return { pasan, total: r.length, fallos: r.filter(x => !x.ok), detalle: r };
}

function casi(a, b, tol) {
  return typeof a === 'number' && Math.abs(a - b) <= tol;
}

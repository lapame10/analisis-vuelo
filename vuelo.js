/* ============================================================
   LAS CUENTAS DEL VUELO
   ============================================================
   Esto es lo que convierte una lista de puntos en un análisis.

   Un IGC solo trae latitud, longitud, hora y dos altitudes. Todo lo demas
   —velocidad, rumbo, cuando subias, cuando planeabas, cuanto viento hacia—
   hay que sacarlo de ahi. Aqui es donde se hace.

   Las tres cosas que de verdad importan, y que es facil hacer mal:

     1. LA VELOCIDAD Y EL RUMBO NO VIENEN EN EL ARCHIVO.
        Se calculan entre puntos consecutivos. Y la longitud NO son metros
        constantes: cerca de los polos un grado de longitud vale mucho menos que
        en el ecuador. Sin multiplicar por cos(latitud), en un sitio de montana a
        45 grados la distancia sale un 30% mal. Y como el error es siempre en la
        misma direccion, el track parece correcto.

     2. EL VIENTO SE PUEDE SACAR DE LAS TERMICAS.
        Cuando un piloto gira en una termica, su velocidad de suelo es la suma de
        dos cosas: el giro (que da la vuelta completa y se cancela) y el viento
        (que empuja siempre igual). Asi que si se suman los vectores de velocidad
        de UNA VUELTA COMPLETA, el giro desaparece y queda el viento.
        No es una estimacion a ojo: es la unica respuesta que cuadra con el giro.

     3. UNA SUBIDA NO ES UNA TERMICA.
        Subir en ladera tambien sube, y no es una termica. Una termica se
        reconoce porque ADEMAS das vueltas: el rumbo acumulado pasa de 360
        grados. Sin ese segundo criterio, cada ladera cuenta como termica.
   ============================================================ */

/* ---------- numeros que se usan en varios sitios ---------- */
export const RADIO_TIERRA = 6371000;                 /* metros */
const RAD = Math.PI / 180;

/* ============================================================
   Distancia entre dos puntos, en metros
   ============================================================
   Haversine. No es la formula mas precisa del mundo para distancias muy cortas,
   pero a la escala de un vuelo (metros a kilometros) da un error de centimetros,
   y es lo bastante simple para leerla y entenderla.
*/
export function distancia(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const la1 = a.lat * RAD, la2 = b.lat * RAD;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA * Math.asin(Math.min(1, Math.sqrt(x)));
}

/* ============================================================
   Rumbo de a hacia b, en grados desde el norte (0-360)
   ============================================================
   OJO con el orden de los argumentos de atan2: es (dx, dy), NO (dy, dx).
   Con el orden cambiado el rumbo sale girado 90 grados y el track parece que
   vuela de lado. Es un error que no da ningun aviso.
*/
export function rumbo(a, b) {
  const la1 = a.lat * RAD, la2 = b.lat * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const dx = Math.sin(dLon) * Math.cos(la2);
  const dy = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (Math.atan2(dx, dy) / RAD + 360) % 360;
}

/* ============================================================
   Lo que le falta a cada punto
   ============================================================
   Rellena, en orden y sin pisar lo que ya venia del archivo:
     altReal  la barometrica, y si no esta la GPS   (para hablar de altura)
     vs       el vario, en m/s  (positivo = subiendo)
     hs       velocidad de suelo, en km/h
     rumbo    grados desde el norte
     dist     metros desde el punto anterior
     acum     metros recorridos hasta aqui

   Las altitudes NO se mezclan: altPresion y altGPS siguen cada una por su lado,
   y altReal es solo "la que hay", marcando cual es para no confundirlas.
*/
export function completa(puntos, opciones = {}) {
  if (!puntos || puntos.length < 2) return puntos || [];

  for (let i = 0; i < puntos.length; i++) {
    const p = puntos[i];
    /* la barometrica manda, porque es la que lee el altimetro del ala */
    if (p.altPresion != null) { p.altReal = p.altPresion; p.altDe = 'presion'; }
    else if (p.altGPS != null) { p.altReal = p.altGPS; p.altDe = 'gps'; }
    else { p.altReal = null; p.altDe = null; }
    p.dist = 0; p.acum = i ? puntos[i - 1].acum : 0;
    p.vs = null; p.hs = null; p.rumbo = null;
  }

  const soporte = opciones.vsSegundos || 8;   /* la ventana del vario */

  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1], b = puntos[i];
    const dt = b.t - a.t;
    /* dt <= 0 significa dos puntos con la misma hora, o desordenados. No se
       divide por cero: se deja en blanco y se sigue. */
    if (dt <= 0) continue;

    const d = distancia(a, b);
    b.dist = d;

    /* la longitud de un grado no es la misma en todo el mundo */
    const mPorGradoLon = 111320 * Math.cos(b.lat * RAD) || 1;
    const dx = (b.lon - a.lon) * mPorGradoLon;
    const dy = (b.lat - a.lat) * 111320;
    const dPlano = Math.hypot(dx, dy);

    b.hs = (dPlano / dt) * 3.6;                 /* m/s -> km/h */
    b.rumbo = rumbo(a, b);
  }

  /* ---------- la distancia acumulada ---------- */
  for (let i = 1; i < puntos.length; i++) {
    puntos[i].acum = puntos[i - 1].acum + puntos[i].dist;
  }

  /* ---------- el vario ----------
     El vario instantaneo entre dos puntos de un IGC es MALISIMO: los puntos
     vienen cada 1-10 segundos y el ruido de la altitud es de metros. Restar dos
     puntos seguidos da un numero que salta entre +8 y -8 sin sentido.
     Por eso se calcula sobre una ventana de varios segundos hacia atras, que es
     lo que hace cualquier vario de verdad. */
  for (let i = 1; i < puntos.length; i++) {
    let j = i;
    while (j > 0 && puntos[i].t - puntos[j].t < soporte) j--;
    const a = puntos[j], b = puntos[i];
    if (a === b || a.altReal == null || b.altReal == null) continue;
    const dt = b.t - a.t;
    if (dt > 0) b.vs = (b.altReal - a.altReal) / dt;
  }

  /* los primeros puntos no tienen ventana hacia atras: se les da la del principio */
  for (let i = 1; i < puntos.length; i++) {
    if (puntos[i].vs == null) puntos[i].vs = puntos[i - 1].vs;
  }

  return puntos;
}

/* ============================================================
   LOS SEGMENTOS: subidas y planeos
   ============================================================
   Se parte el vuelo en tramos. El criterio es el vario suavizado, con histeresis
   —o sea, con dos umbrales distintos:
     para ENTRAR en subida hay que subir mas de +0.5 m/s
     para SALIR hay que bajar de +0.1 m/s
   Con un solo umbral, un vario que oscila alrededor de cero parte el vuelo en
   cien trozos de dos segundos. La histeresis hace que cada tramo sea un tramo.
*/
export function segmentos(puntos, opciones = {}) {
  /* Los umbrales, simetricos. Un parapente planea a -0,5 o -1,5 m/s segun el
     ala y la velocidad: SIEMPRE esta bajando entre termicas. Si el umbral de
     bajada se pone en -1,5, un planeo tranquilo no cuenta como planeo y el
     vuelo entero sale como un solo tramo de subida. Pam lo vio asi en el primer
     test. */
  const entra = opciones.entra != null ? opciones.entra : 0.5;
  const sale  = opciones.sale  != null ? opciones.sale  : 0.15;
  const minimo = opciones.minimoSegundos || 20;   /* un tramo mas corto no cuenta */

  const tramos = [];
  let actual = null;

  for (let i = 1; i < puntos.length; i++) {
    const p = puntos[i];
    if (p.vs == null) continue;
    /* el vario ya viene suavizado; se usa tal cual */
    /* Histeresis: para ENTRAR hay que pasar un umbral, y para SALIR basta con
       volver a la zona neutra. Y los dos lados son simetricos: si subir es
       +0,5, bajar es -0,5. */
    const enSubida = actual && actual.tipo === 'subida';
    const enPlaneo = actual && actual.tipo === 'planeo';
    const subiendo = enSubida ? p.vs > sale : p.vs > entra;
    const bajando  = enPlaneo ? p.vs < -sale : p.vs < -entra;

    let tipo = null;
    if (subiendo) tipo = 'subida';
    else if (bajando) tipo = 'planeo';
    else tipo = actual ? actual.tipo : 'planeo';

    if (!actual || actual.tipo !== tipo) {
      if (actual) { actual.hasta = i - 1; tramos.push(actual); }
      actual = { tipo, desde: i, hasta: i };
    }
  }
  if (actual) { actual.hasta = puntos.length - 1; tramos.push(actual); }

  /* ---------- y ahora se le pone numero a cada tramo ---------- */
  const salida = [];
  for (const tr of tramos) {
    const a = puntos[tr.desde], b = puntos[tr.hasta];
    const seg = b.t - a.t;
    if (seg < minimo) continue;

    const gan = (b.altReal != null && a.altReal != null) ? b.altReal - a.altReal : null;
    const recorrido = b.acum - a.acum;
    /* distancia en linea recta entre el principio y el final del tramo */
    const recto = distancia(a, b);
    let vueltas = 0;   /* cuanto giro en total, sumando el valor absoluto */

    for (let i = tr.desde + 1; i <= tr.hasta; i++) {
      const p1 = puntos[i - 1], p2 = puntos[i];
      if (p1.rumbo == null || p2.rumbo == null) continue;
      let d = p2.rumbo - p1.rumbo;
      /* se normaliza a -180..180 para que un salto de 359 a 1 cuente como 2 grados
         y no como 358 */
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      vueltas += Math.abs(d);
    }

    const mediaVs = (gan != null && seg) ? gan / seg : null;
    const mediaHs = seg ? (recorrido / seg) * 3.6 : null;

    /* ===== LA RELACION DE PLANEO, CON TOPE =====
       La relacion de planeo es cuantos metros avanza por cada metro que baja.
       Sale de dividir, asi que cuando la caida es pequeña el numero se dispara:
       un parapente NUNCA planea 200 a 1. Eso no es un planeo, es una meseta —
       un tramo donde el aire estaba tranquilo y el ala apenas perdio altura.

       Con el tope, esos tramos se descartan en vez de dar un dato absurdo. Un
       200:1 en pantalla hace que no te creas NINGUN otro numero de la app, y con
       razon. Se prefiere no enseñarlo.

       Y se exige una caida minima Y un recorrido minimo, para que el cociente
       tenga sentido. */
    let gr = null;
    if (gan != null && gan < -20 && recto > 300) {
      const g = Math.abs(recto / gan);
      gr = g <= 15 ? g : null;      /* mas de 15:1 no es un planeo de parapente */
    }

    salida.push({
      tipo: tr.tipo,
      desde: tr.desde, hasta: tr.hasta,
      t0: a.t, t1: b.t, segundos: seg,
      alt0: a.altReal, alt1: b.altReal,
      ganancia: gan,
      recorrido, recto,
      vs: mediaVs,
      hs: mediaHs,
      gr,
      grados: vueltas,
      /* una termica es una subida Y con giro. Sin el giro, es una ladera. */
      termica: tr.tipo === 'subida' && vueltas >= 270,
      lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2,
    });
  }

  return salida;
}

/* ============================================================
   EL VIENTO, sacado de las vueltas
   ============================================================
   Esta es la parte bonita. Cuando alguien gira en una termica, su velocidad de
   suelo es:

       velocidad = giro + viento

   El giro da una vuelta completa, asi que si se suma durante UNA VUELTA ENTERA,
   se cancela: lo que gira hacia el norte lo deshace hacia el sur. Lo que queda
   es el viento.

   Se hace por vueltas completas y no por la termica entera porque asi el giro
   se cancela de verdad. En una termica de 8 vueltas, si sumas todo, tambien se
   cancela; pero si la termica tiene 7 vueltas y media, la media vuelta que sobra
   contamina el resultado.

   Y se exige un minimo de vueltas: con media vuelta no hay nada que cancelar.
*/
export function vientoDeTermicas(puntos, tramos, opciones = {}) {
  /* Dos vueltas es lo minimo razonable: una para que el giro se cancele, y otra
     porque las vueltas casi nunca cierran perfectas y la ultima se descarta. Con
     el minimo en 3, las termicas cortas (las mas comunes) no daban nada. */
  const minVueltas = opciones.minVueltas || 2;
  const medidas = [];

  for (const tr of tramos) {
    if (!tr.termica || tr.grados < 360 * minVueltas) continue;

    /* se parte el tramo en vueltas: cada vez que el rumbo da una vuelta entera,
       se cierra un trozo */
    let acumulado = 0;
    let inicioVuelta = tr.desde;
    const vueltas = [];

    for (let i = tr.desde + 1; i <= tr.hasta; i++) {
      const p1 = puntos[i - 1], p2 = puntos[i];
      if (p1.rumbo == null || p2.rumbo == null) continue;
      let d = p2.rumbo - p1.rumbo;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      acumulado += Math.abs(d);
      if (acumulado >= 360) {
        vueltas.push({ desde: inicioVuelta, hasta: i });
        acumulado = 0;
        inicioVuelta = i;
      }
    }

    /* y de cada vuelta se saca un viento */
    for (const v of vueltas) {
      let sx = 0, sy = 0, n = 0;
      for (let i = v.desde + 1; i <= v.hasta; i++) {
        const p = puntos[i], a = puntos[i - 1];
        if (p.hs == null || p.rumbo == null) continue;
        const dt = p.t - a.t;
        if (dt <= 0 || dt > 30) continue;       /* un hueco grande no vale */
        /* el desplazamiento de ese tramo, en metros, descompuesto en norte y este */
        const m = p.dist;
        const ang = p.rumbo * RAD;
        sy += m * Math.cos(ang);
        sx += m * Math.sin(ang);
        n += dt;
      }
      if (!n || n < 30) continue;
      /* el vector medio = el viento (el giro se ha cancelado) */
      const vx = sx / n, vy = sy / n;
      const vel = Math.hypot(vx, vy) * 3.6;     /* m/s -> km/h */
      /* tambien de donde SOPLA, no hacia donde empuja */
      const dir = ((Math.atan2(vx, vy) / RAD + 360) % 360 + 180) % 360;
      /* si sale mas de 60 km/h no es viento: es que la vuelta no cerro bien */
      if (vel > 60) continue;
      medidas.push({ vel, dir, t: puntos[v.desde].t, lat: puntos[v.desde].lat, lon: puntos[v.desde].lon });
    }
  }

  if (!medidas.length) return null;

  /* se combinan todas las medidas, ponderando por velocidad, para sacar un viento
     medio del vuelo. Ponderar por velocidad evita que una vuelta mal cerrada con
     viento cero tire la media hacia abajo. */
  let sx = 0, sy = 0;
  for (const m of medidas) {
    const a = m.dir * RAD;
    sx += Math.sin(a) * m.vel;
    sy += Math.cos(a) * m.vel;
  }
  const vel = Math.hypot(sx, sy) / medidas.length;
  /* OJO: aqui NO hay que sumar 180 otra vez.
     Las medidas de arriba ya vienen puestas "de donde sopla", asi que al
     combinarlas el resultado tambien lo esta. Sumando el 180 por segunda vez
     salia el viento justo al reves: los tres casos de prueba daban 177, 324 y
     89 grados donde habia 0, 135 y 270. */
  const dir = (Math.atan2(sx, sy) / RAD + 360) % 360;

  /* ===== UN VIENTO DE 1 km/h NO ES VIENTO =====
     Cuando el detector saca un viento casi cero, lo mas probable no es que no
     hubiera viento: es que las vueltas no cerraron bien y el giro no se cancelo
     del todo. Se devuelve igual (el dato esta ahi) pero marcado, para que la
     interfaz pueda decir "sin viento claro" en vez de enseñar "1 km/h", que
     parece un dato y no lo es. */
  const pocoFiable = vel < 4;

  return {
    vel,                      /* km/h */
    dir,                      /* grados DESDE donde sopla */
    medidas,
    cuantas: medidas.length,
    pocoFiable,
    /* cuanto bailan las medidas entre si: si es mucho, el viento no era constante */
    dispersion: (() => {
      if (medidas.length < 2) return 0;
      let s = 0;
      for (const m of medidas) s += Math.hypot(m.vel - vel, 0);
      return s / medidas.length;
    })(),
  };
}

/* ============================================================
   LAS TERMICAS, agrupadas
   ============================================================
   Dos subidas seguidas en el mismo sitio son la misma termica. Se agrupan por
   cercania: si el centro esta a menos de 1500 m y son de puntos distintos del
   vuelo, es la misma columna.
*/
export function agrupaTermicas(tramos, metros = 1500) {
  const subidas = tramos.filter(t => t.tipo === 'subida');
  const grupos = [];

  for (const s of subidas) {
    let metida = false;
    for (const g of grupos) {
      const d = distancia({ lat: g.lat, lon: g.lon }, { lat: s.lat, lon: s.lon });
      if (d < metros) {
        g.tramos.push(s);
        /* el centro del grupo se recalcula como media, ponderando por lo que subio */
        const peso = g.tramos.reduce((a, x) => a + Math.abs(x.ganancia || 0), 0) || 1;
        g.lat = g.tramos.reduce((a, x) => a + x.lat * Math.abs(x.ganancia || 0), 0) / peso;
        g.lon = g.tramos.reduce((a, x) => a + x.lon * Math.abs(x.ganancia || 0), 0) / peso;
        metida = true;
        break;
      }
    }
    if (!metida) {
      grupos.push({ lat: s.lat, lon: s.lon, tramos: [s] });
    }
  }

  /* y se resume cada grupo */
  return grupos.map((g, i) => {
    const seg = g.tramos.reduce((a, x) => a + x.segundos, 0);
    const gan = g.tramos.reduce((a, x) => a + (x.ganancia || 0), 0);
    const grados = g.tramos.reduce((a, x) => a + x.grados, 0);
    return {
      n: i + 1,
      lat: g.lat, lon: g.lon,
      segundos: seg,
      ganancia: gan,
      vs: seg ? gan / seg : null,
      vueltas: grados / 360,
      esTermica: grados >= 270,
      tramos: g.tramos,
    };
  }).sort((a, b) => a.t0 || 0 - (b.t0 || 0));
}

/* ============================================================
   EL RESUMEN DEL VUELO
   ============================================================
   Los numeros que van en el panel grande. Cada uno tiene que poder defenderse:
   si no hay datos para calcularlo, es null y la interfaz pone una raya. Nunca
   un cero que parezca un dato.
*/
export function resumen(puntos, tramos, viento) {
  if (!puntos || puntos.length < 2) return null;

  const a = puntos[0], b = puntos[puntos.length - 1];
  const t = b.t - a.t;
  if (t <= 0) return null;

  /* ---- altitud ---- */
  const alts = puntos.map(p => p.altReal).filter(x => x != null);
  const altMin = alts.length ? Math.min(...alts) : null;
  const altMax = alts.length ? Math.max(...alts) : null;
  const despegue = a.altReal;
  const aterrizaje = b.altReal;

  /* ---- velocidades ---- */
  const hss = puntos.map(p => p.hs).filter(x => x != null && x < 120);
  const hsMedia = hss.length ? hss.reduce((x, y) => x + y, 0) / hss.length : null;
  /* la velocidad de la media movil: es la que se mira en competicion */
  const hsMax = hss.length ? Math.max(...hss) : null;
  const hsMin = hss.length ? Math.min(...hss) : null;

  /* ---- distancia ---- */
  const recorrido = b.acum;                       /* todo lo que volo, contando vueltas */
  const recto = distancia(a, b);                  /* de despegue a aterrizaje en linea recta */

  /* ---- altura ganada y perdida ---- */
  let ganado = 0, perdido = 0;
  for (const tr of tramos) {
    if (tr.ganancia == null) continue;
    if (tr.ganancia > 0) ganado += tr.ganancia;
    else perdido += -tr.ganancia;
  }

  /* ---- tiempo subiendo y planeando ---- */
  let tSubida = 0, tPlaneo = 0;
  for (const tr of tramos) {
    if (tr.tipo === 'subida') tSubida += tr.segundos;
    else tPlaneo += tr.segundos;
  }

  /* ---- la mejor subida y el mejor planeo ---- */
  const subidas = tramos.filter(x => x.tipo === 'subida' && x.segundos >= 30 && x.vs != null);
  /* para el "mejor planeo" se piden ademas 60 segundos: un planeo de verdad dura
     minutos, no medio. Con 30 s entran los tramos de transicion y salen numeros
     que no representan como planea el ala. */
  const planeos = tramos.filter(x => x.tipo === 'planeo' && x.segundos >= 60 && x.gr != null);

  const mejorSubida = subidas.length
    ? subidas.reduce((m, x) => (x.vs > m.vs ? x : m), subidas[0]) : null;
  const mejorPlaneo = planeos.length
    ? planeos.reduce((m, x) => (x.gr > m.gr ? x : m), planeos[0]) : null;

  /* ---- eficiencia: que parte del tiempo subiste ---- */
  const eficiencia = (tSubida + tPlaneo) ? tSubida / (tSubida + tPlaneo) : null;

  /* ---- el vario medio del vuelo entero ----
     Esto es basicamente: cuanto gane o perdi, dividido por lo que duro. */
  const vsMedio = (despegue != null && aterrizaje != null) ? (aterrizaje - despegue) / t : null;

  return {
    t0: a.t, t1: b.t, segundos: t,
    horaInicio: a.hora, horaFin: b.hora,
    altMin, altMax, despegue, aterrizaje,
    gananciaNeta: (despegue != null && aterrizaje != null) ? aterrizaje - despegue : null,
    ganado, perdido,
    hsMedia, hsMax, hsMin,
    recorrido, recto,
    tSubida, tPlaneo, eficiencia,
    mejorSubida, mejorPlaneo,
    vsMedio,
    viento,
    nTermicas: tramos.filter(x => x.termica).length,
    /* el planeo medio sin contar las termicas */
    grMedio: (() => {
      const largos = planeos.filter(x => x.recto > 300);
      if (!largos.length) return null;
      const g = largos.reduce((a, x) => a + x.gr * x.recto, 0) / largos.reduce((a, x) => a + x.recto, 0);
      return g;
    })(),
  };
}

/* ============================================================
   El vuelo entero, de una sola llamada
   ============================================================ */
export function analiza(textoIGC, parseIGC) {
  const leido = parseIGC(textoIGC);
  if (!leido.ok) return leido;                     /* se devuelve tal cual, con su motivo */

  completa(leido.puntos);
  const tramos = segmentos(leido.puntos);
  const viento = vientoDeTermicas(leido.puntos, tramos);
  const termicas = agrupaTermicas(tramos);
  const res = resumen(leido.puntos, tramos, viento);

  return {
    ok: true,
    puntos: leido.puntos,
    meta: leido.meta,
    tramos, termicas, viento, resumen: res,
    nombre: (leido.meta && leido.meta.piloto) || '',
  };
}

/* ============================================================
   Los formatos, en un solo sitio
   ============================================================ */
export const fmt = {
  hms(seg) {
    if (seg == null || !isFinite(seg)) return '—';
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = Math.round(seg % 60);
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
             : `${m}:${String(s).padStart(2, '0')}`;
  },
  m(v, dec = 0) {
    if (v == null || !isFinite(v)) return '—';
    return v.toLocaleString('es-MX', { maximumFractionDigits: dec }) + ' m';
  },
  km(v, dec = 1) {
    if (v == null || !isFinite(v)) return '—';
    return v.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' km';
  },
  kmh(v, dec = 0) {
    if (v == null || !isFinite(v)) return '—';
    return v.toLocaleString('es-MX', { maximumFractionDigits: dec }) + ' km/h';
  },
  ms(v, dec = 1) {
    if (v == null || !isFinite(v)) return '—';
    const s = v >= 0 ? '+' : '';
    return s + v.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' m/s';
  },
  gr(v) {
    if (v == null || !isFinite(v)) return '—';
    return v.toFixed(1);
  },
  grados(d) {
    if (d == null || !isFinite(d)) return '—';
    const r = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
    return r[Math.round(((d % 360) + 360) % 360 / 22.5) % 16];
  },
  pct(v) {
    if (v == null || !isFinite(v)) return '—';
    return Math.round(v * 100) + '%';
  },
};

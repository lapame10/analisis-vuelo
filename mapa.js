/* ============================================================
   EL MAPA
   ============================================================
   Leaflet con teselas sin clave (OpenTopoMap). Nada de Google ni CARTO: piden
   clave y un dia dejan de funcionar sin avisar.

   El track se pinta coloreado por lo que estas haciendo:
     naranja  subiendo
     azul     planeando
     gris     en llano o sin datos
   Asi, de un vistazo, se ve donde estaba la termica y donde el planeo.

   ============================================================
   POR QUE EL COLOR VA POR TRAMOS Y NO POR PUNTO
   ============================================================
   La primera version coloreaba punto a punto, mirando el vario de cada uno. Y
   funcionaba... pero el vario cambia de signo constantemente —cada vez que el
   ala pasa de subir a bajar y vuelve— asi que un vuelo de 5.600 puntos generaba
   486 trozos de color distintos.

   Y como el mapa pinta TODOS los vuelos (el que miras en color y los otros
   cinco en gris detras), eran 2.916 polilineas. El navegador se atragantaba y el
   mapa tardaba una eternidad. Pam lo vio: "no se ejecuta tan bien".

   El arreglo: el color se decide por TRAMOS, que ya estan calculados para el
   analisis (subidas y planeos, 90 por vuelo en vez de 486 colores). Y de cada
   tramo se cogen algunos puntos, no todos, porque para dibujar una linea de 8
   kilometros no hacen falta 400 puntos: con 40 se ve igual.

   Resultado: unas 90 polilineas del vuelo que miras, y una sola por cada vuelo de
   fondo. Treinta veces menos objetos.
   ============================================================ */

const COLOR = {
  sube: '#ff8a3d',
  plan: '#4d7fd1',
  neutro: '#8d8d8d',
  fondo: '#b9b4a8',
};

let mapa = null;
let capas = {};

/* ============================================================
   Se crea el mapa una vez
   ============================================================ */
export function arrancaMapa(cont) {
  /* ===== SI LEAFLET NO ESTA, SE SIGUE SIN MAPA =====
     Antes, si Leaflet no habia cargado, esto lanzaba "L is not defined" y se
     llevaba por delante TODO el arranque: la app quedaba en blanco. Un mapa que
     no carga es una molestia; una app que no abre es otra cosa.
     Ahora se comprueba y se devuelve null. El que llama decide que hacer. */
  if (typeof L === 'undefined') return null;

  mapa = L.map(cont, {
    zoomControl: true,
    attributionControl: true,
    preferCanvas: true,        /* con muchos puntos, canvas es mucho mas rapido */
  }).setView([-18.9, -41.5], 11);   /* Valadares, Brasil */

  /* ===== SIN {s} =====
     Con {s} Leaflet añade un subdominio (a., b., c.) y algunos servidores de
     teselas no los atienden. Sin {s} va directo y funciona. */
  L.tileLayer('https://tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: 'Mapas: © OpenTopoMap · Datos: © OpenStreetMap',
  }).addTo(mapa);

  /* ⚠️ NO PONER AQUI UN invalidateSize CON setTimeout.
     Lo puse, y era peor el remedio: el encuadre del vuelo ocurre despues (hay
     que descargar y analizar los IGC primero) y el invalidateSize llegaba MAS
     TARDE, con el mapa ya encuadrado, y lo devolvia al mundo entero. El mapa se
     quedaba con las teselas del planeta.
     El invalidateSize lo hace encuadra(), solo si hace falta y en el momento
     justo. Aqui no va. */

  capas = {
    fondo: L.layerGroup().addTo(mapa),
    tracks: L.layerGroup().addTo(mapa),
    termicas: L.layerGroup().addTo(mapa),
  };

  return mapa;
}

export function hayMapa() { return !!mapa; }

/* ============================================================
   Adelgazar: de una lista larga de puntos, coger unos pocos
   ============================================================
   Para dibujar una linea no hacen falta todos los puntos. Con uno de cada N se
   ve igual, y la linea pesa N veces menos.

   El primero y el ultimo SIEMPRE van: son el despegue y el aterrizaje.
*/
function adelgaza(pts, cada) {
  if (pts.length <= 3 || cada <= 1) return pts;
  const out = [pts[0]];
  for (let i = cada; i < pts.length - 1; i += cada) out.push(pts[i]);
  out.push(pts[pts.length - 1]);
  return out;
}

/* ============================================================
   Pinta un vuelo
   ============================================================
   vuelo:    el que se mira
   enColor:  true = coloreado por tramos; false = una linea gris (los de fondo)
*/
export function pintaVuelo(vuelo, opciones = {}) {
  if (!mapa || !vuelo || !vuelo.puntos) return;
  const enColor = opciones.enColor !== false;
  const grupo = enColor ? 'tracks' : 'fondo';
  const puntos = vuelo.puntos;
  /* los de fondo se adelgazan mas: solo tienen que dar contexto */
  const cada = enColor ? Math.max(1, Math.floor(puntos.length / 900)) : Math.max(1, Math.floor(puntos.length / 350));

  const lineas = [];

  if (!enColor) {
    /* ---- vuelo de fondo: una sola linea gris ---- */
    const pts = adelgaza(puntos.map(p => [p.lat, p.lon]), cada);
    if (pts.length > 1) {
      lineas.push(L.polyline(pts, {
        color: COLOR.fondo, weight: 1.6, opacity: 0.55, lineJoin: 'round',
      }).addTo(capas[grupo]));
    }
    return { lineas };
  }

  /* ---- el que se mira: coloreado por TRAMOS ----
     Se recorren los tramos (subidas y planeos) que ya estan calculados, y cada
     uno se pinta entero de su color. Asi son ~90 lineas y no 486. */
  const tramos = (vuelo.tramos && vuelo.tramos.length) ? vuelo.tramos : null;

  if (tramos) {
    for (const tr of tramos) {
      const color = tr.tipo === 'subida' ? COLOR.sube : COLOR.plan;
      const trozo = puntos.slice(tr.desde, tr.hasta + 1);
      if (trozo.length < 2) continue;
      const pts = adelgaza(trozo.map(p => [p.lat, p.lon]), Math.max(1, Math.floor(trozo.length / 60)));
      lineas.push(L.polyline(pts, {
        color, weight: 3.5, opacity: 0.92, lineJoin: 'round',
      }).addTo(capas[grupo]));
    }
  } else {
    /* sin tramos (un vuelo muy corto o raro): una linea sola */
    const pts = adelgaza(puntos.map(p => [p.lat, p.lon]), cada);
    lineas.push(L.polyline(pts, {
      color: COLOR.sube, weight: 3.5, opacity: 0.9,
    }).addTo(capas[grupo]));
  }

  /* ---- el despegue y el aterrizaje ---- */
  const a = puntos[0], b = puntos[puntos.length - 1];
  const marcas = [
    L.circleMarker([a.lat, a.lon], {
      radius: 6, color: '#fff', weight: 2.5, fillColor: '#2f7a4d', fillOpacity: 1,
    }).bindTooltip('Despegue · ' + horaDe(a)).addTo(capas[grupo]),
    L.circleMarker([b.lat, b.lon], {
      radius: 6, color: '#fff', weight: 2.5, fillColor: '#b3453a', fillOpacity: 1,
    }).bindTooltip('Aterrizaje · ' + horaDe(b)).addTo(capas[grupo]),
  ];

  return { lineas, marcas };
}

function horaDe(p) {
  if (!p || !p.hora) return '';
  return p.hora.slice(0, 2) + ':' + p.hora.slice(2, 4);
}

/* ============================================================
   Las termicas
   ============================================================
   Un circulo con el radio de la vuelta que diste: si diste 3 vueltas y el
   recorrido fue de 900 m, cada vuelta son 300 m de circunferencia, y el radio
   sale de ahi.
*/
export function pintaTermicas(vuelo) {
  if (!mapa || !vuelo || !vuelo.termicas) return;
  capas.termicas.clearLayers();

  for (const t of vuelo.termicas) {
    if (!t.esTermica) continue;
    const circ = t.vueltas > 0.5 ? (t.tramos.reduce((a, x) => a + x.recorrido, 0) / t.vueltas) : 250;
    const radio = Math.max(30, Math.min(400, circ / (2 * Math.PI)));

    L.circle([t.lat, t.lon], {
      radius: radio,
      color: t.vs > 1.5 ? '#2f7a4d' : '#a8742c',
      weight: 1.8, opacity: 0.85,
      fillColor: t.vs > 1.5 ? '#2f7a4d' : '#a8742c',
      fillOpacity: 0.12,
    }).bindTooltip(
      'Térmica ' + t.n + ' · ' + (t.vs != null ? '+' + t.vs.toFixed(1) + ' m/s' : '—') +
      ' · +' + Math.round(t.ganancia || 0) + ' m · ' + t.vueltas.toFixed(1) + ' vueltas',
      { sticky: true }
    ).addTo(capas.termicas);
  }
}

/* ============================================================
   Encaja el mapa a lo que hay
   ============================================================ */
export function encuadra(vuelos) {
  if (!mapa) return;
  const pts = [];
  for (const v of vuelos) {
    if (!v || !v.puntos) continue;
    for (let i = 0; i < v.puntos.length; i += Math.max(1, Math.floor(v.puntos.length / 150))) {
      const p = v.puntos[i];
      pts.push([p.lat, p.lon]);
    }
  }
  if (!pts.length) return;

  /* ===== PRIMERO SE COMPRUEBA EL TAMAÑO =====
     Si el contenedor mide cero, fitBounds calcula un encuadre absurdo (o ninguno)
     y el mapa se queda en el mundo entero. Cuando pasa eso, se reintenta en el
     siguiente ciclo en vez de dar por hecho que salio bien. */
  const hacerlo = () => {
    const c = mapa.getContainer();
    if (!c || c.clientWidth < 40 || c.clientHeight < 40) return false;
    mapa.fitBounds(L.latLngBounds(pts).pad(0.1), { animate: false });
    return true;
  };

  if (!hacerlo()) {
    mapa.invalidateSize();
    setTimeout(() => { mapa.invalidateSize(); hacerlo(); }, 200);
  }
}

export function limpia(grupo) {
  if (!mapa) return;
  if (grupo) capas[grupo].clearLayers();
  else Object.values(capas).forEach(c => c.clearLayers());
}

export function capa(nombre) { return capas[nombre]; }

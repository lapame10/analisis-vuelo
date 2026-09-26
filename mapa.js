/* ============================================================
   EL MAPA
   ============================================================
   Leaflet con teselas sin clave (OpenTopoMap). Nada de Google ni CARTO: piden
   clave y un dia dejan de funcionar sin avisar.

   El track se pinta coloreado por lo que estas haciendo:
     naranja  subiendo   (el vario positivo)
     azul     planeando  (bajando)
     gris     sin datos
   Y mas grueso o mas fino segun la velocidad de suelo. Asi, de un vistazo, se ve
   donde estaba la termica y donde el planeo.

   Las termicas van con un circulo del tamaño de la vuelta que diste. Eso es lo
   que hace que el mapa se lea: no hace falta mirar numeros para saber donde
   estaba el aire bueno.
   ============================================================ */

const COLOR = {
  sube: '#ff8a3d',      /* subiendo */
  plan: '#4d7fd1',      /* planeando */
  neutro: '#8d8d8d',    /* sin datos o en llano */
  activo: '#ffd166',
};

let mapa = null;
let capas = {};
let alPulsar = null;

/* ============================================================
   Se crea el mapa una vez
   ============================================================ */
export function arrancaMapa(cont, opciones = {}) {
  alPulsar = opciones.alPulsar || null;

  mapa = L.map(cont, {
    zoomControl: true,
    attributionControl: true,
    preferCanvas: true,        /* con miles de puntos, canvas es mucho mas rapido */
  }).setView([19.35, -100.12], 11);

  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: 'Mapas: © OpenTopoMap · Datos: © OpenStreetMap',
  }).addTo(mapa);

  capas = {
    tracks: L.layerGroup().addTo(mapa),
    termicas: L.layerGroup().addTo(mapa),
    globo: L.layerGroup().addTo(mapa),
  };

  return mapa;
}

export function hayMapa() { return !!mapa; }

/* ============================================================
   El color de cada tramo del track
   ============================================================ */
function colorDe(p, antes) {
  if (p.vs == null) return COLOR.neutro;
  if (p.vs > 0.3) return COLOR.sube;
  if (p.vs < -0.3) return COLOR.plan;
  return COLOR.neutro;
}

/* ============================================================
   Pinta un vuelo
   ============================================================
   Se dibuja por trozos y no punto a punto: 1700 puntos sueltos son 1700 objetos
   en el mapa, y con cuatro pilotos se arrastra. Agrupando por color, pasan a ser
   unas decenas de lineas.
*/
export function pintaVuelo(vuelo, opciones = {}) {
  if (!mapa || !vuelo || !vuelo.puntos) return;
  const grupo = opciones.grupo || 'tracks';

  const puntos = vuelo.puntos;
  const trozos = [];
  let actual = null;

  for (let i = 1; i < puntos.length; i++) {
    const p = puntos[i];
    const c = colorDe(p);
    if (!actual || actual.color !== c) {
      if (actual) trozos.push(actual);
      actual = { color: c, pts: [[puntos[i - 1].lat, puntos[i - 1].lon]] };
    }
    actual.pts.push([p.lat, p.lon]);
  }
  if (actual) trozos.push(actual);

  const resalte = opciones.resalte;   /* el vuelo seleccionado va mas grueso */
  const lineas = [];
  for (const t of trozos) {
    if (t.pts.length < 2) continue;
    lineas.push(L.polyline(t.pts, {
      color: t.color,
      weight: resalte ? 4 : 2.5,
      opacity: resalte ? 0.95 : 0.65,
      lineJoin: 'round',
    }));
  }
  lineas.forEach(l => l.addTo(capas[grupo]));

  /* ---------- el despegue y el aterrizaje ---------- */
  const a = puntos[0], b = puntos[puntos.length - 1];
  const marcas = [];
  marcas.push(L.circleMarker([a.lat, a.lon], {
    radius: 6, color: '#fff', weight: 2.5, fillColor: '#2f7a4d', fillOpacity: 1,
  }).bindTooltip('Despegue · ' + a.hora.slice(0, 2) + ':' + a.hora.slice(2, 4)));
  marcas.push(L.circleMarker([b.lat, b.lon], {
    radius: 6, color: '#fff', weight: 2.5, fillColor: '#b3453a', fillOpacity: 1,
  }).bindTooltip('Aterrizaje · ' + b.hora.slice(0, 2) + ':' + b.hora.slice(2, 4)));
  marcas.forEach(m => m.addTo(capas[grupo]));

  return { lineas, marcas, trozos };
}

/* ============================================================
   Las termicas
   ============================================================
   Un circulo con el radio de la vuelta. Se saca del recorrido del tramo partido
   por las vueltas: si diste 3 vueltas y el recorrido fue de 900 m, cada vuelta
   son 300 m de circunferencia, y el radio sale de ahi.
*/
export function pintaTermicas(vuelo, opciones = {}) {
  if (!mapa || !vuelo || !vuelo.termicas) return;
  const quitar = opciones.quitar !== false;
  if (quitar) capas.termicas.clearLayers();

  for (const t of vuelo.termicas) {
    if (!t.esTermica) continue;
    /* el radio, a partir del recorrido de las vueltas */
    const circ = t.vueltas > 0.5 ? (t.tramos.reduce((a, x) => a + x.recorrido, 0) / t.vueltas) : 250;
    const radio = Math.max(30, Math.min(400, circ / (2 * Math.PI)));

    const c = L.circle([t.lat, t.lon], {
      radius: radio,
      color: t.vs > 1.5 ? '#2f7a4d' : '#a8742c',
      weight: 1.8, opacity: 0.85,
      fillColor: t.vs > 1.5 ? '#2f7a4d' : '#a8742c',
      fillOpacity: 0.12,
    });
    c.bindTooltip(
      'Térmica ' + t.n + ' · ' + (t.vs != null ? '+' + t.vs.toFixed(1) + ' m/s' : '—') +
      ' · +' + Math.round(t.ganancia || 0) + ' m · ' + t.vueltas.toFixed(1) + ' vueltas',
      { sticky: true }
    );
    c.addTo(capas.termicas);
  }
}

/* ============================================================
   Encaja el mapa a los vuelos que hay
   ============================================================ */
export function encuadra(vuelos) {
  if (!mapa) return;
  const pts = [];
  for (const v of vuelos) {
    if (!v || !v.puntos) continue;
    /* no hace falta meter los 1700 puntos para calcular el encuadre */
    for (let i = 0; i < v.puntos.length; i += Math.max(1, Math.floor(v.puntos.length / 200))) {
      const p = v.puntos[i];
      pts.push([p.lat, p.lon]);
    }
  }
  if (!pts.length) return;
  mapa.fitBounds(L.latLngBounds(pts).pad(0.12));
}

export function limpia(grupo) {
  if (!mapa) return;
  if (grupo) capas[grupo].clearLayers();
  else Object.values(capas).forEach(c => c.clearLayers());
}

export function capa(nombre) { return capas[nombre]; }

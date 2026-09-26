/* ============================================================
   LOS GRAFICOS
   ============================================================
   SVG dibujado a mano, sin librerias. Un grafico de estos son cuatro lineas y
   unos ejes; meter 200 KB de libreria para eso no tiene sentido, y dibujandolo
   se controla exactamente que se ve.

   Tres graficos, y cada uno contesta una pregunta distinta:

     ALTITUD   cuanto subi y cuanto perdi          (el perfil del vuelo)
     VARIO     como estaba el aire en cada momento (donde estaba el ascenso)
     VELOCIDAD que tan rapido iba                  (y si el viento me ayudaba)

   Y en los tres, los otros pilotos van detras en gris muy suave. Eso es lo que
   convierte el grafico en una comparacion sin necesidad de una tabla.
   ============================================================ */

const ALTO = 120;
const PAD = { arr: 8, abajo: 18, izq: 44, der: 8 };

/* ============================================================
   Un grafico de lineas
   ============================================================
   series: [{ nombre, color, puntos: [{t, v}], ancho, fondo }]
*/
function grafico(cont, series, opciones = {}) {
  const ancho = opciones.ancho || 600;
  const alto = opciones.alto || ALTO;
  const pad = opciones.pad || PAD;
  const formato = opciones.formato || (v => String(Math.round(v)));

  cont.innerHTML = '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
  svg.setAttribute('class', 'graf');
  svg.style.width = '100%';
  svg.style.height = 'auto';
  svg.style.display = 'block';
  cont.appendChild(svg);

  /* ---- los limites ---- */
  let t0 = Infinity, t1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const s of series) {
    for (const p of s.puntos) {
      if (p.t < t0) t0 = p.t;
      if (p.t > t1) t1 = p.t;
      if (p.v < v0) v0 = p.v;
      if (p.v > v1) v1 = p.v;
    }
  }
  if (!isFinite(t0) || !isFinite(v0)) {
    cont.innerHTML = '<div class="vacio">Sin datos para graficar.</div>';
    return null;
  }
  if (t1 === t0) t1 = t0 + 1;
  /* los graficos de vario y velocidad tienen que estar centrados en cero, o una
     subida de +2 parece enorme al lado de una de -6 */
  if (opciones.centrado) {
    const m = Math.max(Math.abs(v0), Math.abs(v1), 0.5);
    v0 = -m; v1 = m;
  }
  if (v1 === v0) { v1 = v0 + 1; }
  /* un poco de aire arriba y abajo */
  const margen = (v1 - v0) * 0.08;
  v0 -= margen; v1 += margen;

  const x = t => pad.izq + (t - t0) / (t1 - t0) * (ancho - pad.izq - pad.der);
  const y = v => alto - pad.abajo - (v - v0) / (v1 - v0) * (alto - pad.abajo - pad.arr);

  let h = '';

  /* ---- la banda de fondo: verde arriba, rojo abajo ---- */
  const cero = y(0);
  if (cero > pad.arr && cero < alto - pad.abajo) {
    h += `<line x1="${pad.izq}" y1="${cero}" x2="${ancho - pad.der}" y2="${cero}"
            stroke="#c9c4ba" stroke-width="1" stroke-dasharray="3 3"/>`;
  }

  /* ---- la rejilla, con tres rayas y su valor ---- */
  for (let i = 0; i <= 3; i++) {
    const v = v0 + (v1 - v0) * (i / 3);
    const yy = y(v);
    h += `<line x1="${pad.izq}" y1="${yy}" x2="${ancho - pad.der}" y2="${yy}"
            stroke="#eceae4" stroke-width="1"/>`;
    h += `<text x="${pad.izq - 5}" y="${yy + 3}" text-anchor="end"
            font-size="9" fill="#8a857a">${formato(v)}</text>`;
  }

  /* ---- las series ---- */
  for (const s of series) {
    if (!s.puntos.length) continue;

    /* el relleno, solo si se pide (queda bien en la altitud) */
    if (s.fondo) {
      let d = `M ${x(s.puntos[0].t)} ${y(v0)}`;
      for (const p of s.puntos) d += ` L ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`;
      d += ` L ${x(s.puntos[s.puntos.length - 1].t)} ${y(v0)} Z`;
      h += `<path d="${d}" fill="${s.color}" opacity="0.13"/>`;
    }

    let d = '';
    let ultimoT = null;
    for (const p of s.puntos) {
      /* si hay un hueco de mas de 2 minutos, se corta la linea: unir a traves de
         un hueco es inventarse los datos del medio */
      if (ultimoT != null && p.t - ultimoT > 120) d += ` M ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`;
      else d += (d ? ' L ' : 'M ') + x(p.t).toFixed(1) + ' ' + y(p.v).toFixed(1);
      ultimoT = p.t;
    }
    h += `<path d="${d}" fill="none" stroke="${s.color}"
            stroke-width="${s.ancho || 1.6}" stroke-linejoin="round"
            opacity="${s.opacidad != null ? s.opacidad : 1}"/>`;
  }

  /* ---- las horas, abajo ---- */
  for (let i = 0; i <= 4; i++) {
    const t = t0 + (t1 - t0) * (i / 4);
    h += `<text x="${x(t)}" y="${alto - 5}" text-anchor="middle"
            font-size="9" fill="#8a857a">${horaDe(t)}</text>`;
  }

  /* ---- y el cursor, que se puede mover ---- */
  h += `<g class="cursor" style="display:none">
          <line y1="${pad.arr}" y2="${alto - pad.abajo}" stroke="#1e2430" stroke-width="1.5"/>
        </g>`;
  h += `<rect class="zona" x="${pad.izq}" y="${pad.arr}"
          width="${ancho - pad.izq - pad.der}" height="${alto - pad.arr - pad.abajo}"
          fill="transparent" style="cursor:crosshair"/>`;

  svg.innerHTML = h;

  /* ---- el movimiento del cursor ---- */
  const linea = svg.querySelector('.cursor line');
  const grupo = svg.querySelector('.cursor');
  const zona = svg.querySelector('.zona');

  function mueve(ev) {
    const caja = svg.getBoundingClientRect();
    const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - caja.left;
    const rel = (px / caja.width) * ancho;
    const t = t0 + (rel - pad.izq) / (ancho - pad.izq - pad.der) * (t1 - t0);
    const tc = Math.max(t0, Math.min(t1, t));
    grupo.style.display = '';
    linea.setAttribute('x1', x(tc));
    linea.setAttribute('x2', x(tc));
    if (opciones.alMover) opciones.alMover(tc);
  }

  zona.addEventListener('mousemove', mueve);
  zona.addEventListener('touchmove', e => { e.preventDefault(); mueve(e); }, { passive: false });
  svg.addEventListener('mouseleave', () => {
    grupo.style.display = 'none';
    if (opciones.alSalir) opciones.alSalir();
  });

  return { t0, t1, v0, v1, x, y, svg };
}

function horaDe(t) {
  const h = Math.floor(t / 3600) % 24;
  const m = Math.floor((t % 3600) / 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/* ============================================================
   Los tres graficos de un vuelo
   ============================================================
   otros: los demas vuelos, para pintarlos detras en gris
*/
export function graficaVuelo(contenedores, vuelo, otros = [], opciones = {}) {
  if (!vuelo || !vuelo.puntos) return;

  const seg = p => p.t;
  /* muestreo: un grafico de 600 puntos de ancho no necesita 1700 */
  const salto = Math.max(1, Math.floor(vuelo.puntos.length / 700));
  const toma = (f) => {
    const out = [];
    for (let i = 0; i < vuelo.puntos.length; i += salto) {
      const p = vuelo.puntos[i];
      const v = f(p);
      if (v != null) out.push({ t: p.t, v });
    }
    return out;
  };

  const seriesGris = (f) => otros.map((o, i) => {
    const s = Math.max(1, Math.floor(o.puntos.length / 200));
    const pts = [];
    for (let j = 0; j < o.puntos.length; j += s) {
      const v = f(o.puntos[j]);
      if (v != null) pts.push({ t: o.puntos[j].t, v });
    }
    return { nombre: o.nombre, color: '#b9b4a8', puntos: pts, ancho: 1, opacidad: 0.75 };
  });

  /* ---------- 1) ALTITUD ---------- */
  if (contenedores.alt) {
    grafico(contenedores.alt, [
      ...seriesGris(p => p.altReal),
      { nombre: 'altitud', color: '#2e4a6f', puntos: toma(p => p.altReal), ancho: 1.8, fondo: true },
    ], { formato: v => Math.round(v) + '', alMover: opciones.alMover });
  }

  /* ---------- 2) VARIO ----------
     Centrado en cero y con los colores al reves que el resto: aqui lo bueno es
     subir, asi que va en naranja. */
  if (contenedores.vario) {
    grafico(contenedores.vario, [
      ...seriesGris(p => p.vs),
      { nombre: 'vario', color: '#ff8a3d', puntos: toma(p => p.vs), ancho: 1.5 },
    ], { formato: v => v.toFixed(1), centrado: true, alto: 90, alMover: opciones.alMover });
  }

  /* ---------- 3) VELOCIDAD ---------- */
  if (contenedores.vel) {
    grafico(contenedores.vel, [
      ...seriesGris(p => (p.hs != null && p.hs < 120) ? p.hs : null),
      { nombre: 'velocidad', color: '#4d7fd1', puntos: toma(p => (p.hs != null && p.hs < 120) ? p.hs : null), ancho: 1.6, fondo: true },
    ], { formato: v => Math.round(v) + '', alto: 90, alMover: opciones.alMover });
  }

  /* ---------- 4) la barra de actividad ----------
     Una franja fina, de un pixel por punto, naranja donde subia y azul donde
     planeaba. Es lo que hace que se identifiquen las termicas de un golpe. */
  if (contenedores.banda) {
    const ancho = 600, alto = 16;
    const el = contenedores.banda;
    el.innerHTML = '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
    svg.style.width = '100%'; svg.style.height = '14px'; svg.style.display = 'block';
    const t0 = vuelo.puntos[0].t, t1 = vuelo.puntos[vuelo.puntos.length - 1].t;
    let h = '';
    for (const p of vuelo.puntos) {
      const x = (p.t - t0) / (t1 - t0) * ancho;
      const w = Math.max(1, ancho / vuelo.puntos.length);
      const c = p.vs == null ? '#d8d4cc' : (p.vs > 0.3 ? '#ff8a3d' : (p.vs < -0.3 ? '#4d7fd1' : '#d8d4cc'));
      h += `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${alto}" fill="${c}"/>`;
    }
    svg.innerHTML = h;
    el.appendChild(svg);
  }
}

/* ============================================================
   La comparacion entre pilotos
   ============================================================
   No se comparan tiempos absolutos (cada uno despega a su hora), sino el tiempo
   DESDE EL DESPEGUE de cada uno. Asi dos vuelos del mismo dia se pueden poner
   uno al lado del otro aunque uno saliera dos horas antes.
*/
export function graficaComparacion(cont, vuelos, opciones = {}) {
  const series = vuelos.filter(v => v && v.puntos).map((v, i) => {
    const t0 = v.puntos[0].t;
    const s = Math.max(1, Math.floor(v.puntos.length / 400));
    const pts = [];
    for (let j = 0; j < v.puntos.length; j += s) {
      const p = v.puntos[j];
      /* el eje X es "segundos desde que despegó" */
      if (p.altReal != null) pts.push({ t: p.t - t0, v: p.altReal });
    }
    return {
      nombre: v.nombre || ('Piloto ' + (i + 1)),
      color: opciones.colores ? opciones.colores[i % opciones.colores.length] : '#2e4a6f',
      puntos: pts,
      ancho: 1.7,
      fondo: i === 0,
    };
  });
  return grafico(cont, series, { alto: 150, formato: v => Math.round(v) + '' });
}

export { grafico, horaDe };

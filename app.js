
import { parseIGC } from './igc.js';
import { analiza, fmt, distancia } from './vuelo.js';
import * as Mapa from './mapa.js';
import * as Graf from './grafico.js';
import { esconde, lee, llevaAlgo } from './secreto.js';
import * as Canal from './canal.js';
import { leeIndice, leeTask, tituloDe, subtituloDe } from './tasks.js';
import * as Tel from './dispositivo.js';
import * as Bit from './bitacora-ui.js';

/* ============================================================
   El estado
   ============================================================ */
const COLORES = ['#2e4a6f', '#ff8a3d', '#2f7a4d', '#a8742c', '#7a4d9e', '#b3453a', '#4d7fd1'];
let TASKS = [];       /* los tasks fijos, leidos de tasks/ */
let taskActual = 0;   /* cual se está mirando */
let pilotoActual = 0; /* y dentro del task, que piloto */
let vuelos = [];      /* el vuelo del task actual, en la forma que espera el resto */
let cual = 0;
let listo = false;    /* el mapa ya está montado */

/* ============================================================
   Un aviso, sin gritar
   ============================================================ */
let tAviso = null;
function aviso(txt, ms = 3600) {
  const a = document.getElementById('aviso');
  a.textContent = txt;
  a.classList.add('on');
  clearTimeout(tAviso);
  tAviso = setTimeout(() => {
    a.classList.remove('on');
    setTimeout(() => { a.textContent = ''; }, 250);
  }, ms);
}

/* ============================================================
   EL ARRANQUE
   ============================================================
   La app abre DIRECTAMENTE en el analisis del primer task. No hay pantalla de
   carga: se entra y ya estas mirando un vuelo de competicion, como cualquier
   piloto que repasa su tarea.

   Los vuelos son fijos (carpeta tasks/) y los mismos para todo el mundo.
   ============================================================ */
async function arranca() {
  /* el mapa se monta antes de nada: Leaflet no funciona si el contenedor está
     oculto (mide cero) */
  /* el mapa, si se puede. Si Leaflet no cargó, se sigue sin él: los numeros, los
     graficos y las observaciones funcionan igual. */
  if (!listo) {
    const m = Mapa.arrancaMapa('mapa');
    listo = true;
    if (!m) {
      const cont = document.getElementById('mapa');
      if (cont) cont.innerHTML = '<div class="vacio" style="padding:40px 16px">' +
        'El mapa no se pudo cargar.<br><span class="mini">El resto del análisis funciona igual.</span></div>';
    }
  }

  document.getElementById('pSecreto').classList.remove('on');
  document.getElementById('pAnalisis').classList.add('on');
  document.getElementById('bMensaje').style.display = '';
  document.getElementById('bBitacora').style.display = '';

  enganchaLosToques();
  TASKS = await leeIndice();
  pintaSelector();

  /* los vuelos del primer task se traen ahora: es lo unico que se descarga al
     abrir. Los demas, cuando se cambie de task. */
  await leeTask(TASKS[0], parseIGC, analiza);
  pintaSelector();

  const primero = TASKS.findIndex(t => t.leido && t.ok);
  if (primero < 0) {
    /* no se pudo leer ninguno: se dice, y no se inventa nada */
    document.getElementById('subtitulo').textContent = 'No se pudieron leer los tasks';
    const motivos = TASKS.filter(t => t.motivo).map(t => t.motivo);
    document.getElementById('obs').innerHTML =
      '<p class="mini">' + escapa(motivos[0] || 'Sin datos.') + '</p>';
    return;
  }
  await abreTask(primero);
}

/* ---------- el selector de tasks, en la cabecera ---------- */
function pintaSelector() {
  const c = document.getElementById('tasks');
  c.innerHTML = TASKS.map((t, i) => {
    const et = t.ok ? tituloDe(t) : (t.nombre + ' · —');
    return `<button data-i="${i}" class="${i === taskActual ? 'on' : ''}" ${t.ok ? '' : 'disabled'}>${escapa(et)}</button>`;
  }).join('');
  c.querySelectorAll('button').forEach(b => {
    b.onclick = () => { if (!b.disabled) abreTask(+b.dataset.i); };
  });
}

/* ---------- abrir un task ----------
   Cada task tiene sus PROPIAS observaciones. Al cambiar de task se cierra el
   canal y se vuelve a abrir con el cuarto del task nuevo: la misma contraseña
   de equipo, pero otra conversacion. */
async function abreTask(i, piloto) {
  const t = TASKS[i];
  if (!t) return;

  /* el primero solo se trae una vez */
  if (!t.leido) {
    const sub = document.getElementById('subtitulo');
    if (sub) sub.textContent = 'Cargando ' + t.nombre + '…';
    await leeTask(t, parseIGC, analiza);
    pintaSelector();
  }
  if (!t.ok) return;

  taskActual = i;
  pilotoActual = piloto == null ? (t.cual || 0) : piloto;

  /* el vuelo que se mira, y los demas detras en gris para comparar */
  vuelos = t.vuelos;
  cual = pilotoActual;

  /* el canal, al cuarto de este task */
  if (equipo) {
    const n = Canal.nuevoCanal(equipo, (t.n || i + 1));
    if (n.ok) { const r = await Canal.abre(n); canal = r.ok ? n : null; }
  }

  document.getElementById('subtitulo').textContent = subtituloDe(t);

  pintaSelector();
  pintaPilotos();
  pinta();
  pintaObservaciones();
  if (canal && canal.clave) { await trae(); pintaObservaciones(); latido(); }
  window.scrollTo(0, 0);
}

/* ---------- y el selector de pilotos del task ----------
   Los seis pilotos del dia, con su distancia. Se puede cambiar y ver el suyo:
   que es exactamente lo que se hace despues de volar. */
function pintaPilotos() {
  const c = document.getElementById('pilotos');
  if (!c) return;
  const t = TASKS[taskActual];
  if (!t || !t.ok) { c.innerHTML = ''; return; }

  c.innerHTML = t.vuelos.map((v, i) => {
    const km = v.resumen ? (v.resumen.recorrido / 1000).toFixed(0) : '?';
    const nom = (v.nombre || '').split(/\s+/).slice(0, 2).join(' ') || ('Piloto ' + (i + 1));
    return `<button data-i="${i}" class="${i === pilotoActual ? 'on' : ''}${v.esPam ? ' pam' : ''}">
      ${escapa(nom)}<span class="km">${km} km</span></button>`;
  }).join('');
  c.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      pilotoActual = +b.dataset.i;
      cual = pilotoActual;
      pintaPilotos();
      pinta();
    };
  });
}

function pinta() {
  const v = vuelos[cual];
  if (!v) return;

  document.getElementById('subtitulo').textContent =
    vuelos.length === 1 ? v.nombre : (vuelos.length + ' vuelos · viendo ' + v.nombre);

  pintaMets(v);
  pintaTabla();
  pintaTermicas(v);
  pintaGraficos(v);

  /* ===== EL MAPA, EN DOS PASADAS =====
     Primero los otros cinco en gris (una sola linea cada uno), y despues el que
     se mira, coloreado por tramos. Antes se pintaba todo coloreado punto a punto
     y salian 2.916 polilineas: el navegador se atragantaba. */
  Mapa.limpia();
  vuelos.forEach((o, i) => {
    if (i !== cual) Mapa.pintaVuelo(o, { enColor: false });
  });
  Mapa.pintaVuelo(v, { enColor: true });
  Mapa.pintaTermicas(v);
  Mapa.encuadra([v]);
}

/* ============================================================
   Los números grandes
   ============================================================ */
function pintaMets(v) {
  const r = v.resumen;
  document.getElementById('quienEs').textContent = v.nombre;

  if (!r) {
    document.getElementById('mets').innerHTML =
      '<div><div class="et">Sin datos</div><div class="va">—</div></div>';
    return;
  }

  const ms = (val, dec = 0) => val == null ? '—' : Math.round(val).toLocaleString('es-MX');
  const celda = (et, va, clase = '') =>
    `<div><div class="et">${et}</div><div class="va ${clase}">${va}</div></div>`;

  let h = '';
  h += celda('Distancia', ms(r.recorrido / 1000) + ' <span style="font-size:12px">km</span>');
  h += celda('Tiempo', fmt.hms(r.segundos));
  h += celda('Alt. máxima', ms(r.altMax) + ' <span style="font-size:12px">m</span>');
  h += celda('+Altura ganada', ms(r.ganado) + ' <span style="font-size:12px">m</span>', 'sube');
  h += celda('Vario medio vuelo', r.vsMedio == null ? '—' : fmt.ms(r.vsMedio), r.vsMedio > 0 ? 'sube' : 'baja');
  h += celda('Mejor subida', r.mejorSubida ? fmt.ms(r.mejorSubida.vs) : '—', 'sube');
  h += celda('Mejor planeo', r.mejorPlaneo ? fmt.gr(r.mejorPlaneo.gr) + ' : 1' : '—');
  h += celda('Planeo medio', r.grMedio ? fmt.gr(r.grMedio) + ' : 1' : '—');
  h += celda('Vel. media', fmt.kmh(r.hsMedia));
  h += celda('% subiendo', fmt.pct(r.eficiencia));
  h += celda('Térmicas', r.nTermicas);
  h += celda('Viento', v.viento
    ? (v.viento.pocoFiable
        ? '<span style="font-size:13px">sin viento claro</span>'
        : Math.round(v.viento.vel) + ' <span style="font-size:12px">km/h ' + fmt.grados(v.viento.dir) + '</span>')
    : '—');

  document.getElementById('mets').innerHTML = h;

  document.getElementById('altEscala').textContent =
    r.altMin != null ? fmt.m(r.altMin) + ' a ' + fmt.m(r.altMax) : '';
}

/* ============================================================
   La tabla de los vuelos
   ============================================================ */
function pintaTabla() {
  const tb = document.getElementById('tabla');

  /* para comparar de verdad se ordena por distancia recorrida, que es lo que
     mide quien voló más lejos */
  const orden = vuelos.map((v, i) => ({ v, i }))
    .sort((a, b) => ((b.v.resumen && b.v.resumen.recorrido) || 0) - ((a.v.resumen && a.v.resumen.recorrido) || 0));

  tb.innerHTML = orden.map(({ v, i }) => {
    const r = v.resumen || {};
    const cel = (x, dec = 0) => x == null ? '—' : Number(x).toLocaleString('es-MX', { maximumFractionDigits: dec });
    return `<tr class="clic ${i === cual ? 'sel' : ''}" data-i="${i}">
      <td><span class="chip" style="background:${v.color}"></span>${escapa(v.nombre)}</td>
      <td>${r.recorrido ? cel(r.recorrido / 1000, 1) + ' km' : '—'}</td>
      <td>${r.segundos ? fmt.hms(r.segundos) : '—'}</td>
      <td class="pos">${r.ganado ? '+' + cel(r.ganado) + ' m' : '—'}</td>
      <td>${r.mejorSubida ? fmt.ms(r.mejorSubida.vs) : '—'}</td>
      <td>${r.grMedio ? fmt.gr(r.grMedio) + ' : 1' : '—'}</td>
      <td>${v.viento ? (v.viento.pocoFiable ? '—' : Math.round(v.viento.vel) + ' km/h ' + fmt.grados(v.viento.dir)) : '—'}</td>
    </tr>`;
  }).join('');

  tb.querySelectorAll('tr').forEach(tr => {
    tr.onclick = () => { cual = +tr.dataset.i; pilotoActual = cual; pintaPilotos(); pinta(); };
  });
}

/* ============================================================
   Las térmicas
   ============================================================ */
function pintaTermicas(v) {
  const cont = document.getElementById('termicas');
  const t = (v.termicas || []).filter(x => x.esTermica);
  document.getElementById('nTerm').textContent = t.length
    ? t.length + ' encontradas' : 'ninguna';

  if (!t.length) {
    cont.innerHTML = '<p class="mini">No se encontraron vueltas suficientes. ' +
      'Puede ser un vuelo de ladera o de planeo largo, sin térmicas.</p>';
    return;
  }

  /* la mejor térmica, para marcarla */
  const mejor = t.reduce((m, x) => ((x.vs || 0) > (m.vs || 0) ? x : m), t[0]);

  cont.innerHTML = t.map(x => {
    const esMejor = x === mejor;
    const hora = v.puntos[x.tramos[0].desde] ? horaDe(v.puntos[x.tramos[0].desde].t) : '';
    return `<div class="term">
      <div class="n" ${esMejor ? 'style="background:#e8f3ec;color:#2f7a4d"' : ''}>${x.n}</div>
      <div class="q">
        <b>${hora}</b> · ${fmt.hms(x.segundos)} · ${x.vueltas.toFixed(1)} vueltas
      </div>
      <div class="qq" style="text-align:right">
        <span class="${x.vs > 0 ? 'pos' : ''}">${x.vs == null ? '—' : fmt.ms(x.vs)}</span><br>
        <span class="mini">+${Math.round(x.ganancia || 0)} m</span>
      </div>
    </div>`;
  }).join('') + (mejor.vs ? `<p class="mini mt">La mejor fue la ${mejor.n}, con ${fmt.ms(mejor.vs)} y +${Math.round(mejor.ganancia)} m.</p>` : '');
}

/* ============================================================
   Los gráficos
   ============================================================ */
function pintaGraficos(v) {
  const otros = vuelos.filter((_, i) => i !== cual);

  Graf.graficaVuelo({
    alt: document.getElementById('gAlt'),
    vario: document.getElementById('gVario'),
    vel: document.getElementById('gVel'),
    banda: document.getElementById('gBanda'),
  }, v, otros, {
    alMover: (t) => muestraLectura(v, t),
  });

  Graf.graficaComparacion(document.getElementById('gComp'), vuelos,
    { colores: vuelos.map(x => x.color) });

  document.getElementById('lectura').innerHTML = 'Mueve el dedo por los gráficos para ver el momento.';
}

/* ---------- lo que dice el cursor al pasar ---------- */
function muestraLectura(v, t) {
  /* el punto más cercano a ese instante */
  const p = v.puntos;
  let lo = 0, hi = p.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (p[m].t < t) lo = m; else hi = m;
  }
  const q = Math.abs(p[lo].t - t) < Math.abs(p[hi].t - t) ? p[lo] : p[hi];

  const partes = ['<b>' + horaDe(q.t) + '</b>'];
  if (q.altReal != null) partes.push(Math.round(q.altReal) + ' m');
  if (q.vs != null) partes.push(fmt.ms(q.vs));
  if (q.hs != null && q.hs < 120) partes.push(fmt.kmh(q.hs));
  if (q.rumbo != null) partes.push(fmt.grados(q.rumbo));
  document.getElementById('lectura').innerHTML = partes.join(' · ');
}

function horaDe(t) {
  const h = Math.floor(t / 3600) % 24, m = Math.floor((t % 3600) / 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function escapa(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ============================================================
   EL MENSAJE ESCONDIDO
   ============================================================
   Dos cosas: esconder un mensaje en un vuelo, y leer uno que te llego.

   El mensaje va cifrado con AES y metido en los comentarios del IGC, que es
   donde los varios escriben sus cosas y ningun programa mira. El vuelo queda
   intacto: se abre igual y el analisis sale igual.
   ============================================================ */

/* ---------- ir y volver de la pantalla ---------- */
/* el boton "Mensaje" de dentro sigue existiendo para esconder un mensaje en un
   IGC, pero el nombre visible ahora es otro: es una herramienta de la app. */
/* ============================================================
   LA BITÁCORA
   ============================================================
   Una pantalla mas, que se monta sola. Todo lo que hace vive en bitacora.js y
   bitacora-ui.js, y ninguno de los dos necesita internet.
   ============================================================ */
document.getElementById('bBitacora').onclick = () => {
  document.querySelectorAll('.pant').forEach(x => x.classList.remove('on'));
  document.getElementById('pBitacora').classList.add('on');
  Bit.monta('bitCuerpo', {
    alVolver: () => {
      document.getElementById('pBitacora').classList.remove('on');
      document.getElementById('pAnalisis').classList.add('on');
      window.scrollTo(0, 0);
    },
  });
  window.scrollTo(0, 0);
};

document.getElementById('bMensaje').onclick = () => {
  document.querySelectorAll('.pant').forEach(x => x.classList.remove('on'));
  document.getElementById('pSecreto').classList.add('on');

  /* ===== SOBRE QUE VUELO VA LA ETIQUETA =====
     Antes esto era un desplegable con todos los vuelos cargados a mano. Ya no:
     los vuelos son fijos y la etiqueta va sobre EL QUE ESTAS MIRANDO. Que es lo
     que tiene sentido — etiquetas el vuelo que acabas de analizar. */
  const v = vuelos[cual];
  const e = document.getElementById('etqVuelo');
  if (e) {
    e.textContent = v
      ? (v.nombre || 'vuelo') + (v.resumen ? ' · ' + (v.resumen.recorrido / 1000).toFixed(1) + ' km' : '')
      : '—';
  }
  /* se limpia lo de la vez anterior, para no dejar un mensaje viejo a la vista */
  const t = document.getElementById('msgTexto');
  const c = document.getElementById('msgClave');
  const r = document.getElementById('msgRes');
  if (t) t.value = '';
  if (c) c.value = '';
  if (r) r.innerHTML = '';
  const n = document.getElementById('msgNombre');
  if (n) n.textContent = '';
  const r2 = document.getElementById('msgRes2');
  if (r2) r2.innerHTML = '';
  archivoParaLeer = null;

  window.scrollTo(0, 0);
};

document.getElementById('msgVolver').onclick = () => {
  document.getElementById('pSecreto').classList.remove('on');
  document.getElementById(pAnalisis.classList.contains('on') ? 'pAnalisis' : 'pCarga');
  document.getElementById('pAnalisis').classList.add('on');
  window.scrollTo(0, 0);
};

/* ---------- ESCRIBIR ---------- */
document.getElementById('msgHacer').onclick = async () => {
  const texto = document.getElementById('msgTexto').value;
  const clave = document.getElementById('msgClave').value;
  const res = document.getElementById('msgRes');

  /* ===== EL VUELO ES EL QUE ESTAS MIRANDO =====
     Ya no hay que elegir archivo ni vuelo: se etiqueta el vuelo del task que
     tienes abierto. */
  const v = vuelos[cual];
  if (!v || !v.texto) {
    res.innerHTML = '<div class="no">No hay ningún vuelo abierto. Elige un task primero.</div>';
    return;
  }
  if (!texto.trim()) { res.innerHTML = '<div class="no">Escribe la etiqueta.</div>'; return; }
  if (clave.length < 6) {
    res.innerHTML = '<div class="no">La contraseña, de al menos 6 caracteres. ' +
      'Es lo único que protege la etiqueta: cuanto más larga, mejor.</div>';
    return;
  }

  res.innerHTML = '<div class="mini">Etiquetando…</div>';

  const r = await esconde(v.texto, texto, clave);
  if (!r.ok) { res.innerHTML = '<div class="no">' + escapa(r.motivo) + '</div>'; return; }

  /* el nombre del archivo: el del piloto, para que parezca lo que es */
  const quien = (v.nombre || 'vuelo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const nombre = quien + '.igc';

  const blob = new Blob([r.texto], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);

  res.innerHTML = `<div class="ok"><b>Listo.</b> Se ha descargado <b>${escapa(nombre)}</b>.<br>
    Lleva la etiqueta en ${r.trozos} comentario(s). Ábrelo en el análisis y verás el mismo vuelo,
    con los mismos datos: la etiqueta no toca ni un punto del track.<br><br>
    Mándalo como mandarías cualquier vuelo. Quien no tenga la contraseña verá un archivo de vuelo.</div>`;
};

/* ---------- LEER ---------- */
let archivoParaLeer = null;
document.getElementById('msgElegir').onclick = () => document.getElementById('msgArchivo').click();
document.getElementById('msgArchivo').onchange = async () => {
  const f = document.getElementById('msgArchivo').files[0];
  if (!f) return;
  archivoParaLeer = f;
  document.getElementById('msgNombre').textContent = f.name;
  document.getElementById('msgArchivo').value = '';
  /* si lleva algo, se dice sin pedir contrasena: asi se sabe que llegó bien */
  const t = await f.text();
  const res = document.getElementById('msgRes2');
  if (llevaAlgo(t)) res.innerHTML = '<div class="mini">Este archivo lleva un mensaje. Pon la contraseña.</div>';
  else res.innerHTML = '<div class="mini">Este archivo no parece llevar ningún mensaje.</div>';
};

document.getElementById('msgLeer').onclick = async () => {
  const res = document.getElementById('msgRes2');
  const clave = document.getElementById('msgClaveLee').value;
  if (!archivoParaLeer) { res.innerHTML = '<div class="no">Elige el archivo.</div>'; return; }
  if (!clave) { res.innerHTML = '<div class="no">Pon la contraseña.</div>'; return; }

  res.innerHTML = '<div class="mini">Descifrando…</div>';
  const t = await archivoParaLeer.text();
  const r = await lee(t, clave);

  if (!r.ok) { res.innerHTML = '<div class="no">' + escapa(r.motivo) + '</div>'; return; }
  res.innerHTML = '<div class="ok"><b>Mensaje:</b></div>' +
    '<div class="claro">' + escapa(r.mensaje) + '</div>' +
    '<div class="mini mt">' + r.trozos + ' trozo(s) · ' + r.bytes + ' bytes cifrados</div>';
};

/* ============================================================
   LAS NOTAS DEL VUELO (el canal)
   ============================================================
   Dos personas con la misma contrasena de equipo comparten notas. Los mensajes
   van CIFRADOS: lo que llega al servidor son bytes sin sentido.

   Y todo se ensena como "notas de vuelo" dentro del analisis, con su hora, como
   las que se apuntan despues de volar. Nada en la pantalla dice "mensaje".
   ============================================================ */

let canal = null;
let tLatido = null;
let equipo = null;    /* la contrasena de equipo, en memoria mientras la app vive */

/* ============================================================
   LO QUE ESTA ESCONDIDO
   ============================================================
   El panel de observaciones NO se ve al abrir. Hay que hacer TRES toques en el
   titulo "ThermalApp" para que aparezca.

   Por que: Pam lo pidio asi. Si alguien coge el telefono y abre la app, ve un
   analisis de vuelo y nada mas: no hay ni un recuadro cerrado que llame la
   atencion ni invite a probar contraseñas. La puerta no esta a la vista.

   Y ademas de los tres toques hacen falta las dos cosas:
     - la contrasena del equipo (que cifra los mensajes)
     - que este telefono sea uno de los DOS autorizados (ver dispositivo.js)

   Los toques tienen que ser seguidos: si pasan mas de 2 segundos entre uno y
   otro, la cuenta vuelve a cero. Asi no se abre solo por tocar el titulo por
   casualidad.
   ============================================================ */
let escondido = true;      /* las observaciones estan ocultas */
let toques = 0;
let ultimoToque = 0;

/* ---------- las observaciones del task que se está mirando ----------
   Con la contrasena: se ven y se escribe.
   Sin ella: un recuadro cerrado que dice que hay observaciones y que hace falta
   la contrasena del equipo. Nada más: no se enseña ni un trozo. */
function pintaObservaciones() {
  const c = document.getElementById('obs');
  const card = document.getElementById('cardObs');
  if (!c || !card) return;

  /* ===== SIN LOS TRES TOQUES, NO HAY NADA =====
     Ni panel, ni recuadro cerrado, ni candado. La tarjeta entera desaparece. Si
     alguien abre la app, ve un analisis de vuelo y nada mas: no hay donde
     pinchar, ni una pista de que ahi haya algo. */
  if (escondido) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';

  /* ---- ya salio: se ve el panel ---- */
  if (!canal || !canal.clave) {
    c.innerHTML = `
      <div class="cerrado">
        <div class="candado">🔒</div>
        <p><b>Observaciones privadas</b></p>
        <p class="mini">Este task tiene las observaciones de la escuadra.</p>
        <input type="password" id="obsIn" placeholder="Contraseña del equipo"
          style="width:100%;max-width:280px;font:inherit;font-size:14px;padding:10px 11px;
          border:1px solid var(--line);border-radius:10px;background:#fff;text-align:center">
        <div class="mt2"><button class="btn" id="obsAbrir">Desbloquear</button></div>
        <div id="obsAviso"></div>
      </div>`;
    const guardada = (() => { try { return equipo || localStorage.getItem('pad-equipo'); } catch (e) { return equipo; } })();
    if (guardada) document.getElementById('obsIn').value = guardada;
    document.getElementById('obsAbrir').onclick = abreConContrasena;
    const inp = document.getElementById('obsIn');
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') abreConContrasena(); });
    return;
  }

  /* ---- abierto: la lista y el escribir ---- */
  const conTexto = canal.mensajes.filter(m => !m.ilegible);
  let html = '';
  if (!conTexto.length) {
    html = '<p class="mini">Todavía no hay observaciones en este task. Escribe la primera.</p>';
  } else {
    html = conTexto.map(m => `<div class="nota ${m.mio ? 'mia' : 'suya'}">
      <div class="h">${Canal.hora(m.ts)}</div>
      <div class="x">${escapa(m.texto)}</div>
    </div>`).join('');
  }
  c.innerHTML = html + `
    <div class="escribir">
      <textarea id="cTexto" placeholder="Añadir una observación…" rows="1"></textarea>
      <button class="btn" id="cEnviar">Añadir</button>
    </div>
    <div id="cEstado"></div>
    <div class="row mt">
      <button class="btn gh" id="cCerrar">Volver al análisis</button>
    </div>`;

  const malos = canal.mensajes.filter(m => m.ilegible).length;
  document.getElementById('cEstado').innerHTML =
    `<span class="punto si"></span>${conTexto.length} observación${conTexto.length === 1 ? '' : 'es'}` +
    (malos ? ` · <span style="color:var(--mal)">${malos} que no se pudo abrir</span>` : '');

  document.getElementById('cEnviar').onclick = async () => {
    const ta = document.getElementById('cTexto');
    if (!ta.value.trim()) return;
    const r = await Canal.envia(canal, ta.value);
    if (!r.ok) { aviso(r.motivo, 4200); return; }
    ta.value = '';
    await trae();
    pintaObservaciones();
  };
  document.getElementById('cTexto').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('cEnviar').click(); }
  });
  /* "Volver al analisis" vuelve a ESCONDER: no deja el panel a la vista para el
     que mire despues. */
  document.getElementById('cCerrar').onclick = () => {
    escondido = true;
    toques = 0;
    clearInterval(tLatido);
    pintaObservaciones();
  };
}

/* ============================================================
   Abrir con la contraseña
   ============================================================
   Aqui van las dos comprobaciones, y en este orden:

     1. el telefono: si no es uno de los dos autorizados, se acaba aqui
     2. la contraseña: cifra los mensajes, y sin ella no se lee nada

   El orden importa: asi el que coge un telefono que no es suyo no llega ni a
   intentar adivinar la contraseña.
   ============================================================ */
async function abreConContrasena() {
  const v = document.getElementById('obsIn') ? document.getElementById('obsIn').value : '';
  const av = document.getElementById('obsAviso');
  const di = (t, clase) => { if (av) av.innerHTML = '<div class="' + clase + '" style="margin-top:10px">' + t + '</div>'; };

  if (!v || v.length < 6) { di('La contraseña, de al menos 6 caracteres.', 'no'); return; }

  /* ---- 1) el telefono ---- */
  di('<span class="mini">Comprobando el teléfono…</span>', 'mini');
  const tel = await Tel.registra();
  if (!tel.dentro) {
    di('<b>Este teléfono no puede abrir las observaciones.</b><br>' +
       '<span class="mini">' + escapa(tel.motivo || '') + '</span>' +
       (tel.sinRed ? '<br><span class="mini">Prueba con conexión.</span>' : '') , 'no');
    return;
  }

  /* ---- 2) la contrasena ---- */
  const n = Canal.nuevoCanal(v, taskActual + 1);
  if (!n.ok) { di(escapa(n.motivo), 'no'); return; }

  di('<span class="mini">Abriendo…</span>', 'mini');
  const r = await Canal.abre(n);
  if (!r.ok) { di(escapa(r.motivo), 'no'); return; }

  equipo = v;
  try { localStorage.setItem('pad-equipo', v); } catch (e) {}
  canal = n;
  await trae();
  pintaObservaciones();
  latido();
}

/* ============================================================
   Los tres toques
   ============================================================
   En el titulo "ThermalApp". Seguidos: con mas de 2 segundos entre uno y otro,
   la cuenta vuelve a cero.
   ============================================================ */
function enganchaLosToques() {
  const h = document.querySelector('header h1');
  if (!h) return;
  h.addEventListener('click', () => {
    const ahora = Date.now();
    toques = (ahora - ultimoToque > 2000) ? 1 : toques + 1;
    ultimoToque = ahora;
    if (toques >= 3) {
      toques = 0;
      if (escondido) {
        escondido = false;
        /* si ya habia contrasena guardada, se abre sola; si no, se pide */
        if (equipo) abreConContrasena();
        else pintaObservaciones();
        setTimeout(() => {
          const t = document.getElementById('cardObs');
          if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 120);
      } else {
        escondido = true;
        clearInterval(tLatido);
        pintaObservaciones();
      }
    }
  });
  /* que se pueda hacer con el teclado tambien, por accesibilidad */
  h.style.cursor = 'default';
  h.setAttribute('title', '');
}


function latido() {
  clearInterval(tLatido);
  /* cada 12 segundos se mira si hay algo nuevo. Sin gastar: si no hay, no se
     trae nada. */
  tLatido = setInterval(async () => {
    if (!canal || !canal.clave) return;
    const ultimo = canal.mensajes.length ? canal.mensajes[canal.mensajes.length - 1].id : null;
    const hay = await Canal.hayNuevo(canal, ultimo);
    if (hay) { await trae(); pintaObservaciones(); }
  }, 12000);
}

async function trae() {
  const r = await Canal.recibe(canal);
  if (!r.ok) return { ok: false, motivo: r.motivo };
  /* se juntan con los que ya hay, sin repetir */
  const porId = {};
  for (const m of canal.mensajes) porId[m.id] = m;
  for (const m of (r.mensajes || [])) porId[m.id] = m;
  canal.mensajes = Object.values(porId).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  return { ok: true, nuevos: r.nuevos };
}


/* ===== ESTOS ENGANCHES SE FUERON CON LA PANTALLA DE NOTAS =====
   Ahora los botones de escribir y enviar los crea pintaObservaciones() cada vez
   que pinta, y ahi mismo se les pone el onclick. Ponerlos aqui, sobre elementos
   que ya no existen en el HTML, rompia el modulo entero al cargar: la app se
   quedaba en blanco sin ningun mensaje de error. */

/* ---------- los botones ---------- */


/* el boton viejo de notas ya no existe: las observaciones estan dentro del
   analisis, en su propio panel. */

/* ============================================================
   Ya no hay que subir archivos
   ============================================================
   Antes se podian subir IGC a mano. Ahora los vuelos son FIJOS: los mismos para
   todo el mundo, que es justo lo que hace creible que dos personas esten mirando
   el mismo. Asi que no hay pantalla de carga ni botones de subir: se entra y ya
   estas viendo un task.

   Se deja solo el boton de "Etiqueta", que es para esconder un mensaje en un
   archivo y mandarlo aparte.
   ============================================================ */


/* ============================================================
   Y ARRANCA
   ============================================================
   Directo al analisis del primer task. Si hay una contrasena de equipo guardada,
   se abre tambien el canal de ese task, sin pedirla.

   ⚠️ ESTO SE PERDIO UNA VEZ, y merece la pena contar como paso: al quitar el
   bloque viejo de "subir archivos" con un corte de texto, se fue por delante
   tambien esta llamada. La app quedaba en blanco, sin errores visibles, y costo
   un rato darse cuenta de que lo que faltaba no era codigo roto sino una llamada
   que ya no estaba. Por eso ahora va con try/catch: si algo falla al abrir, se
   ve en pantalla en vez de quedarse en blanco.
   ============================================================ */
(async () => {
  try {
    try { equipo = localStorage.getItem('pad-equipo'); } catch (e) { equipo = null; }
    if (equipo) {
      const n = Canal.nuevoCanal(equipo, 1);
      if (n.ok) { const r = await Canal.abre(n); canal = r.ok ? n : null; }
    }
    await arranca();
  } catch (e) {
    const c = document.getElementById('obs');
    if (c) c.innerHTML = '<div class="no"><b>No se pudo abrir.</b><br>' +
      escapa(e && e.message ? e.message : String(e)) +
      (e && e.stack ? '<br><br><span class="mini">' +
        escapa(e.stack.split('\n').slice(0, 4).join('\n')) + '</span>' : '') +
      '</div>';
    console.error('Arranque:', e);
    const s = document.getElementById('subtitulo');
    if (s) s.textContent = 'Error al abrir';
  }
})();

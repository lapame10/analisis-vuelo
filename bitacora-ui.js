/* ============================================================
   LA PANTALLA DE LA BITÁCORA
   ============================================================
   Tres vistas en una:

     1. LA LISTA   — los vuelos que llevas anotados
     2. LA FICHA   — las cuatro preguntas de un vuelo
     3. LA LECTURA — los patrones: lo que repites sin darte cuenta

   Sin internet en ninguna de las tres.
   ============================================================ */

import * as B from './bitacora.js';

let vista = null;         /* 'lista' | 'ficha' | 'lectura' */
let editando = null;      /* la entrada que se está escribiendo */
let alVolver = null;      /* a dónde volver al salir */

/* ============================================================
   Montar la pantalla
   ============================================================ */
export function monta(contenedor, opciones = {}) {
  vista = 'lista';
  alVolver = opciones.alVolver || null;
  const c = document.getElementById(contenedor);
  if (!c) return;
  pintaLista(c);
}

/* ============================================================
   1. LA LISTA
   ============================================================ */
function pintaLista(c) {
  const lista = B.leeTodo();
  const r = B.resumen(lista);

  let html = `
    <div class="bit-cab">
      <div>
        <div class="mini">${r.entradas} vuelo${r.entradas === 1 ? '' : 's'} anotado${r.entradas === 1 ? '' : 's'}</div>
        ${r.entradas ? `<div class="mini" style="opacity:.7">${r.marcas} marcas · ${Math.round(r.km)} km · ${r.horas.toFixed(1)} h</div>` : ''}
      </div>
      <button class="btn" id="bitNueva">Anotar un vuelo</button>
    </div>`;

  if (!lista.length) {
    html += `<div class="card" style="text-align:center;padding:34px 18px">
      <div style="font-size:34px;opacity:.35;margin-bottom:8px">✎</div>
      <p style="margin:0 0 6px"><b>Todavía no hay nada escrito.</b></p>
      <p class="mini" style="margin:0">Apunta el vuelo al aterrizar, aunque sea una línea por pregunta.
      Vale más lo que escribas cansada en el despegue que lo que no escribas.</p>
    </div>`;
  } else {
    html += lista.map(e => {
      const cuantas = Object.values(e.respuestas || {}).filter(v => v && v.trim()).length;
      const marcas = (e.marcas || []).length;
      const vista = e.vuelo ? `${e.vuelo.km ? Math.round(e.vuelo.km) + ' km · ' : ''}${e.vuelo.horas ? e.vuelo.horas.toFixed(1) + ' h' : ''}` : '';
      return `<div class="bit-item" data-id="${e.id}">
        <div class="bit-fecha">${B.fechaLarga(e.fecha)}</div>
        <div class="bit-tit">${escapa(e.evento || e.sitio || 'Vuelo')}</div>
        <div class="bit-meta">
          ${vista ? '<span>' + escapa(vista) + '</span>' : ''}
          <span>${cuantas}/4 respuestas</span>
          ${marcas ? `<span>${marcas} marca${marcas === 1 ? '' : 's'}</span>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  html += `
    <div class="row mt2">
      ${lista.length ? '<button class="btn sec" id="bitLeer">Ver lo que repito</button>' : ''}
      <button class="btn gh" id="bitExporta">Guardar copia</button>
      <button class="btn gh" id="bitImporta">Cargar copia</button>
      <input type="file" id="bitArchivo" accept=".json,.txt" hidden>
      <button class="btn gh" id="bitVolver">Volver al análisis</button>
    </div>
    <div id="bitMsg"></div>`;

  c.innerHTML = html;

  engancha(c, 'bitNueva', () => pintaFicha(c, B.nueva()));
  engancha(c, 'bitLeer', () => pintaLectura(c));
  engancha(c, 'bitVolver', () => { if (alVolver) alVolver(); });
  engancha(c, 'bitExporta', () => exporta(c));
  engancha(c, 'bitImporta', () => document.getElementById('bitArchivo').click());
  engancha(c, 'bitArchivo', null, (e) => importa(c, e));

  c.querySelectorAll('.bit-item').forEach(x => {
    x.onclick = () => {
      const e = B.una(x.dataset.id);
      if (e) pintaFicha(c, e);
    };
  });
}

/* ============================================================
   2. LA FICHA — las cuatro preguntas
   ============================================================ */
function pintaFicha(c, e) {
  editando = e;

  c.innerHTML = `
    <div class="bit-cab">
      <div class="mini">${B.fechaLarga(e.fecha)}${e.hora ? ' · ' + e.hora : ''}</div>
      <button class="btn gh" id="bitAtras">Atrás</button>
    </div>

    <div class="card">
      <div class="row" style="gap:8px">
        <input id="bitEvento" placeholder="Qué era — PWC Baixo Guandu · Manga 3" value="${escapa(e.evento || '')}"
          style="flex:1;font:inherit;font-size:14px;padding:10px 11px;border:1px solid var(--line);border-radius:10px;background:#fbfaf8">
        <input id="bitSitio" placeholder="Sitio" value="${escapa(e.sitio || '')}"
          style="width:130px;font:inherit;font-size:14px;padding:10px 11px;border:1px solid var(--line);border-radius:10px;background:#fbfaf8">
      </div>
      <div class="row mt" style="gap:8px">
        <input id="bitFecha" type="date" value="${e.fecha}"
          style="font:inherit;font-size:14px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:#fbfaf8">
        <input id="bitHora" type="time" value="${e.hora}"
          style="font:inherit;font-size:14px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:#fbfaf8">
      </div>
    </div>

    ${B.PREGUNTAS.map(p => `
      <div class="card">
        <h3 style="margin:0 0 2px">${p.n}</h3>
        <p class="mini" style="margin:0 0 8px">${p.d}</p>
        <textarea id="bit-${p.id}" rows="3" placeholder="${p.pista}"
          style="width:100%;font:inherit;font-size:14.5px;line-height:1.5;padding:11px;
          border:1px solid var(--line);border-radius:10px;background:#fbfaf8;resize:vertical">${escapa((e.respuestas || {})[p.id] || '')}</textarea>
      </div>`).join('')}

    <div class="card">
      <h3 style="margin:0 0 2px">Las condiciones</h3>
      <p class="mini" style="margin:0 0 8px">Muchas veces el "me sentí mal" era un día raro, y no tú.</p>
      <div class="row" style="gap:8px">
        <input id="bitViento" placeholder="Viento km/h" value="${escapa((e.condiciones || {}).viento || '')}"
          style="width:110px;font:inherit;font-size:14px;padding:10px 11px;border:1px solid var(--line);border-radius:10px;background:#fbfaf8">
        <input id="bitDir" placeholder="Dirección" value="${escapa((e.condiciones || {}).dir || '')}"
          style="width:100px;font:inherit;font-size:14px;padding:10px 11px;border:1px solid var(--line);border-radius:10px;background:#fbfaf8">
        <input id="bitNubes" placeholder="Nubes / cielo" value="${escapa((e.condiciones || {}).nubes || '')}"
          style="flex:1;font:inherit;font-size:14px;padding:10px 11px;border:1px solid var(--line);border-radius:10px;background:#fbfaf8">
      </div>
    </div>

    <div class="row mt2">
      <button class="btn" id="bitGuardar">Guardar</button>
      <button class="btn gh" id="bitBorrar">Borrar</button>
    </div>
    <div id="bitMsg"></div>`;

  engancha(c, 'bitAtras', () => pintaLista(c));
  engancha(c, 'bitGuardar', () => guardaFicha(c));
  engancha(c, 'bitBorrar', () => {
    if (!confirm('¿Borrar este vuelo de la bitácora? No se puede deshacer.')) return;
    B.borraEntrada(editando.id);
    pintaLista(c);
  });
}

function guardaFicha(c) {
  const e = editando;
  e.evento = val('bitEvento');
  e.sitio = val('bitSitio');
  e.fecha = val('bitFecha') || B.hoy();
  e.hora = val('bitHora') || B.horaAhora();
  e.respuestas = {};
  for (const p of B.PREGUNTAS) e.respuestas[p.id] = val('bit-' + p.id);
  e.condiciones = { viento: val('bitViento'), dir: val('bitDir'), nubes: val('bitNubes'), nota: '' };

  const r = B.guardaEntrada(e);
  if (!r.ok) { msg(c, r.motivo, 'no'); return; }
  msg(c, 'Guardado.', 'ok');
  setTimeout(() => pintaLista(c), 500);
}

/* ============================================================
   3. LA LECTURA — los patrones
   ============================================================ */
function pintaLectura(c) {
  const lista = B.leeTodo();
  const p = B.patrones(lista);

  let html = `<div class="bit-cab">
    <div class="mini">Lo que repites sin darte cuenta</div>
    <button class="btn gh" id="bitAtras">Atrás</button>
  </div>`;

  for (const preg of B.PREGUNTAS) {
    const d = p[preg.id];
    html += `<div class="card">
      <h3 style="margin:0 0 2px">${d.n}</h3>
      <div class="mini" style="margin-bottom:8px">Lo escribiste en ${d.cuantas} de ${d.total} vuelos</div>`;
    if (!d.top.length) {
      html += '<p class="mini" style="margin:0">Todavía no se repite nada. Hacen falta unos cuantos vuelos.</p>';
    } else {
      html += d.top.map(x => `
        <div class="bit-pal">
          <div class="bit-pal-n">${escapa(x.palabra)}</div>
          <div class="bit-pal-b"><i style="width:${Math.round(x.veces / d.cuantas * 100)}%"></i></div>
          <div class="bit-pal-v">${x.veces}</div>
        </div>`).join('');
    }
    html += '</div>';
  }

  if (p.marcas.length) {
    html += `<div class="card">
      <h3 style="margin:0 0 8px">Dónde pones las marcas</h3>
      ${p.marcas.map(m => `<div class="bit-pal">
        <div class="bit-pal-n" style="color:${m.color}">${escapa(m.n)}</div>
        <div class="bit-pal-b"><i style="width:${Math.round(m.veces / p.marcas[0].veces * 100)}%;background:${m.color}"></i></div>
        <div class="bit-pal-v">${m.veces}</div>
      </div>`).join('')}
    </div>`;
  }

  c.innerHTML = html;
  engancha(c, 'bitAtras', () => pintaLista(c));
}

/* ============================================================
   Exportar / importar
   ============================================================ */
function exporta(c) {
  const texto = B.exporta();
  const nombre = 'bitacora-' + B.hoy() + '.json';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  msg(c, 'Copia guardada: <b>' + escapa(nombre) + '</b>. Guárdala donde no se pierda.', 'ok');
}

async function importa(c, ev) {
  const f = ev.target.files && ev.target.files[0];
  if (!f) return;
  const t = await f.text();
  const r = B.importa(t);
  if (!r.ok) { msg(c, escapa(r.motivo), 'no'); return; }
  msg(c, r.nuevas ? `Se han añadido <b>${r.nuevas}</b> vuelos. Hay ${r.total} en total.` : 'No había nada nuevo.', 'ok');
  ev.target.value = '';
  setTimeout(() => pintaLista(c), 900);
}

/* ============================================================
   Utilidades
   ============================================================ */
function engancha(c, id, fn, otro) {
  const el = c.querySelector('#' + id);
  if (!el) return;
  if (otro) el.addEventListener('change', otro);
  else if (fn) el.onclick = fn;
}

function val(id) {
  const e = document.getElementById(id);
  return e ? e.value.trim() : '';
}

function msg(c, texto, clase) {
  const m = c.querySelector('#bitMsg');
  if (m) m.innerHTML = '<div class="' + (clase || 'mini') + '" style="margin-top:10px">' + texto + '</div>';
}

function escapa(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

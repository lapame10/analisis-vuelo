/* ============================================================
   Generador de IGCs de prueba
   ============================================================
   Esto NO es parte de la app: es para poder probarla. La app solo lee archivos
   de verdad, y si no entiende uno lo dice. Pero para saber si las cuentas estan
   bien necesito archivos cuyo resultado YO CONOZCA de antemano.

   Lo mas importante: se genera un vuelo con un VIENTO CONOCIDO, y luego se
   comprueba si el algoritmo lo detecta. Si le pedimos viento del noreste a 18
   km/h y el detector dice "del noreste a 18", entonces funciona.

   El vuelo tiene la forma de un vuelo de cross real:
     - despegue, y una subida inicial en ladera
     - varias termicas, cada una con sus vueltas (el viento las desplaza)
     - entre termica y termica, un planeo en linea recta
     - y aterrizaje

   Y las termicas giran de verdad: el rumbo da vueltas completas, que es lo que
   el detector necesita para sacar el viento.
*/
import { writeFileSync } from 'node:fs';

const RAD = Math.PI / 180;

/* ---------- azar con semilla, para que los tests salgan siempre igual ---------- */
let semilla = 12345;
function rnd() {
  semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
  return semilla / 0x7fffffff;
}
function conRuido(v, cuanto) { return v + (rnd() - 0.5) * 2 * cuanto; }

/* ---------- metros a grados, con la latitud en cuenta ---------- */
function aGrados(latBase, dx, dy) {
  return {
    lat: latBase + dy / 111320,
    lon: (x) => x,   /* se calcula aparte, necesita la latitud */
  };
}

/* ============================================================
   Genera un vuelo
   ============================================================
   vientoDir  grados DESDE donde sopla (270 = del oeste)
   vientoVel  km/h
*/
function generaVuelo(opciones = {}) {
  const lat0 = opciones.lat0 != null ? opciones.lat0 : 19.3508;    /* Valle de Bravo */
  const lon0 = opciones.lon0 != null ? opciones.lon0 : -100.1226;
  const alt0 = opciones.alt0 != null ? opciones.alt0 : 2100;
  const vientoDir = opciones.vientoDir != null ? opciones.vientoDir : 315;  /* del noroeste */
  const vientoVel = opciones.vientoVel != null ? opciones.vientoVel : 18;   /* km/h */
  const piloto = opciones.piloto || 'PRUEBA';
  const nTermicas = opciones.nTermicas || 4;
  const ritmo = opciones.ritmo || 1;      /* cuanto se parece al "de referencia" */

  /* el viento, como vector hacia donde EMPUJA */
  /* si sopla DEL 315 (noroeste), empuja HACIA el sureste (135) */
  const hacia = (vientoDir + 180) % 360;
  const vx = Math.sin(hacia * RAD) * vientoVel / 3.6;   /* m/s hacia el este */
  const vy = Math.cos(hacia * RAD) * vientoVel / 3.6;   /* m/s hacia el norte */

  const puntos = [];
  let t = 10 * 3600 + 30 * 60;      /* 10:30 UTC */
  let lat = lat0, lon = lon0, alt = alt0;
  let mPorGradoLon = 111320 * Math.cos(lat * RAD);

  function mete(x, y, a, dt, valido = 'A') {
    lat += y / 111320;
    lon += x / (111320 * Math.cos(lat * RAD));
    alt += a;
    t += dt;
    const hh = String(Math.floor(t / 3600) % 24).padStart(2, '0');
    const mm = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    const ss = String(Math.floor(t % 60)).padStart(2, '0');

    const laG = Math.abs(lat), loG = Math.abs(lon);
    const laD = Math.floor(laG);
    const laM = (laG - laD) * 60;
    const loD = Math.floor(loG);
    const loM = (loG - loD) * 60;

    const laTxt = String(laD).padStart(2, '0') +
      String(Math.floor(laM)).padStart(2, '0') +
      String(Math.round((laM - Math.floor(laM)) * 1000)).padStart(3, '0');
    const loTxt = String(loD).padStart(3, '0') +
      String(Math.floor(loM)).padStart(2, '0') +
      String(Math.round((loM - Math.floor(loM)) * 1000)).padStart(3, '0');

    const altP = Math.round(alt);
    const altG = Math.round(alt + (rnd() - 0.5) * 6);   /* el GPS baila un poco */

    puntos.push({
      linea: `B${hh}${mm}${ss}${laTxt}${lat >= 0 ? 'N' : 'S'}${loTxt}${lon >= 0 ? 'E' : 'W'}${valido}` +
             `${String(Math.max(0, altP)).padStart(5, '0')}${String(Math.max(0, altG)).padStart(5, '0')}`,
      t, lat, lon, alt,
    });
  }

  /* ---------- 1) la subida en ladera del principio ---------- */
  for (let i = 0; i < 40; i++) {
    const ang = 20 + i * 0.6;
    mete(conRuido(3 * Math.sin(ang * RAD) + vx, 0.4) * 3,
         conRuido(3 * Math.cos(ang * RAD) + vy, 0.4) * 3,
         conRuido(1.2 * ritmo, 0.25), 4);
  }

  /* ---------- 2) las termicas y los planeos ---------- */
  let rumboBase = 135;   /* hacia el sureste, con el viento del noroeste */

  for (let k = 0; k < nTermicas; k++) {
    /* --- el planeo hacia la siguiente termica --- */
    const segPlaneo = 240 + Math.floor(rnd() * 120);
    const gr = (7.5 + rnd() * 2) * (k === nTermicas - 1 ? 0.8 : 1);
    for (let i = 0; i < segPlaneo; i++) {
      const v = (14 + rnd() * 4) * ritmo;
      const sink = -v / gr / 3.6 * 4;
      /* volando recto: su velocidad de suelo es la del aire MAS el viento */
      const dx = Math.sin(rumboBase * RAD) * v / 3.6 + vx;
      const dy = Math.cos(rumboBase * RAD) * v / 3.6 + vy;
      mete(conRuido(dx, 0.3) * 4, conRuido(dy, 0.3) * 4, conRuido(sink, 0.15), 4);
    }

    /* --- la termica: vueltas completas --- */
    const nVueltas = 3 + Math.floor(rnd() * 3);
    const radioBase = 45 + rnd() * 25;
    const subida = (1.4 + rnd() * 1.2) * ritmo;
    for (let v = 0; v < nVueltas; v++) {
      for (let i = 0; i < 24; i++) {           /* 24 puntos por vuelta */
        const ang = (i / 24) * 360;
        const radio = radioBase + (rnd() - 0.5) * 6;
        /* girando: la posicion avanza por el circulo Y deriva con el viento */
        /* LA VELOCIDAD DE GIRO VA EN M/S.
           Estaba puesta como 11/3.6, que son 11 km/h = 3 m/s. Con un viento de 20
           km/h, el viento era MAS FUERTE que el giro y la trayectoria dejaba de
           ser un circulo: era una deriva. En el analisis eso se veia como que el
           rumbo de suelo no daba la vuelta, y el detector de viento no tenia de
           donde sacarlo. Un parapente en termica gira a 10-12 m/s. */
        const giro = 11;                       /* 11 m/s = 40 km/h en el circulo */
        const dx = -Math.sin((ang + 90) * RAD) * giro + vx;
        const dy = -Math.cos((ang + 90) * RAD) * giro + vy;
        /* El tercer argumento es CUANTO CAMBIA la altitud en este paso (4 s).
           Para un vario de 'subida' m/s, en 4 segundos son subida*4 metros.
           Antes estaba dividido entre 24 (los puntos por vuelta) y salia una
           subida de 0,06 m/s en vez de 1,4: el generador estaba mal, no el
           analisis. */
        mete(dx * 4, dy * 4, conRuido(subida * 4, 0.2), 4);
      }
    }

    /* --- y cambia de rumbo para ir a la siguiente --- */
    rumboBase = (rumboBase + 55 + rnd() * 40) % 360;
  }

  /* ---------- 3) el planeo final y el aterrizaje ---------- */
  for (let i = 0; i < 150; i++) {
    const v = 13 * ritmo;
    const dx = Math.sin(rumboBase * RAD) * v / 3.6 + vx;
    const dy = Math.cos(rumboBase * RAD) * v / 3.6 + vy;
    mete(dx * 4, dy * 4, conRuido(-1.1, 0.15), 4);
  }
  /* el aterrizaje: se frena y se baja */
  for (let i = 0; i < 12; i++) mete(3, 0, -3.5, 2);

  /* ---------- el archivo ---------- */
  const d = new Date(Date.UTC(2026, 8, 20));
  const fecha = String(d.getUTCDate()).padStart(2, '0') +
                String(d.getUTCMonth() + 1).padStart(2, '0') +
                String(d.getUTCFullYear()).slice(2);

  const cabecera = [
    'AXXXABC FLIGHT RECORDER TEST',
    `HFDTE${fecha}`,
    `HFPLTPILOTINCHARGE:${piloto}`,
    'HFGTYGLIDERTYPE:Test Wing',
    'HFFTYFRTYPE:Test Vario',
    'HOFTYFRTYPE:none',
    'HODTM100GPSDATUM:WGS-1984',
  ];

  return {
    texto: cabecera.join('\n') + '\n' + puntos.map(p => p.linea).join('\n') + '\n',
    puntos, vientoDir, vientoVel, piloto,
  };
}

/* ---------- se generan tres, con vientos distintos y conocidos ---------- */
const casos = [
  { archivo: 'prueba-norte.igc', vientoDir: 0,   vientoVel: 20, piloto: 'VIENTO-N' },
  { archivo: 'prueba-sureste.igc', vientoDir: 135, vientoVel: 15, piloto: 'VIENTO-SE' },
  { archivo: 'prueba-oeste.igc', vientoDir: 270, vientoVel: 25, piloto: 'VIENTO-O' },
];

const dir = '/Users/lapame10/.hermes/workspace/analisis-vuelo/pruebas/';
import { mkdirSync } from 'node:fs';
mkdirSync(dir, { recursive: true });

for (const c of casos) {
  const v = generaVuelo({ vientoDir: c.vientoDir, vientoVel: c.vientoVel, piloto: c.piloto });
  writeFileSync(dir + c.archivo, v.texto);
  console.log('  %s  (%d puntos, viento real: del %d a %d km/h)',
    c.archivo, v.puntos.length, c.vientoDir, c.vientoVel);
}

/* y se exporta para poder reusarlo */
export { generaVuelo };

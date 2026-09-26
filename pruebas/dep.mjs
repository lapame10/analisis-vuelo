import { readFileSync } from 'node:fs';
import { parseIGC } from '../igc.js';
import { completa, segmentos, vientoDeTermicas } from '../vuelo.js';

const t = readFileSync('./pruebas/prueba-norte.igc', 'utf8');
const r = parseIGC(t);
completa(r.puntos);
const tramos = segmentos(r.puntos);

console.log('  tramos:', tramos.length);
const sub = tramos.filter(x => x.tipo === 'subida');
console.log('  subidas:', sub.length);
sub.slice(0, 8).forEach((s, i) => {
  console.log('   %d) %ds  ganancia %.0fm  vs %.2f  GRADOS %.0f  termica:%s',
    i+1, s.segundos, s.ganancia || 0, s.vs || 0, s.grados, s.termica);
});

// y el rumbo de suelo en una termica, a ver si da la vuelta
const term = sub.find(s => s.termica) || sub[0];
if (term) {
  console.log('\n  la primera termica: puntos %d a %d', term.desde, term.hasta);
  let acum = 0, n = 0;
  for (let i = term.desde + 1; i <= term.hasta; i++) {
    const p1 = r.puntos[i-1], p2 = r.puntos[i];
    if (p1.rumbo == null || p2.rumbo == null) continue;
    let d = p2.rumbo - p1.rumbo;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    acum += Math.abs(d); n++;
    if (n <= 10) console.log('    punto %d: rumbo %.0f -> %.0f  (d=%.1f)  hs=%.1f  acum=%.0f',
      i, p1.rumbo, p2.rumbo, d, p2.hs || 0, acum);
  }
  console.log('  puntos: %d   giro total: %.0f grados   vueltas: %.2f', n, acum, acum/360);
}

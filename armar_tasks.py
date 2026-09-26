#!/usr/bin/env python3
"""Mete los tasks de Valadares en la app.

QUE SE METE Y POR QUE

De cada task se cogen SEIS vuelos:

  - el de Pam (246), SIEMPRE. Es su app: lo natural es que abra y vea su propio
    vuelo de ese dia, comparado con los que ganaron.
  - y los cinco que mas volaron ese dia, para tener con quien compararse.

NO se meten los ~88 pilotos de cada task. Son 340 MB y la app tardaria minutos en
abrir en el movil. Una app de analisis que se queda cargando 30 segundos llama la
atencion, y eso rompe justo lo que se quiere conseguir.

Y ADEMAS SE ADELGAZAN LOS ARCHIVOS

Los IGC vienen con un punto por segundo: 17.000 a 25.000 puntos por vuelo, 600 KB
cada uno. Para el analisis eso es el triple de lo que hace falta — el track, las
termicas y el viento salen igual con un punto cada 4 segundos.

Se coge 1 de cada 4. Un vuelo de 600 KB pasa a 150 KB, y el analisis es el mismo.
"""
import os, re, shutil, json, sys

ORIGEN = '/tmp/tasks_reales'
DESTINO = '/Users/lapame10/.hermes/workspace/analisis-vuelo/tasks'

# el numero de dorsal de Pam
PAM = '246'
CUANTOS = 6
CADA = 4          # 1 de cada 4 puntos


def lee_igc(ruta):
    """Devuelve (cabecera, puntos) de un IGC."""
    cab, pts = [], []
    with open(ruta, encoding='utf-8', errors='ignore') as f:
        for l in f:
            l = l.rstrip('\r\n')
            if not l:
                continue
            if l[0] == 'B':
                pts.append(l)
            elif l[0] in 'AHCIJKL':
                cab.append(l)
    return cab, pts


def adelgaza(puntos, cada):
    """Se queda con 1 de cada 'cada' puntos, y siempre con el primero y el ultimo.

    El primero y el ultimo NO se pueden perder: son el despegue y el aterrizaje, y
    sin ellos la duracion del vuelo y la distancia cambian.
    """
    if len(puntos) <= 3 or cada <= 1:
        return puntos
    out = [puntos[0]]
    for i in range(cada, len(puntos) - 1, cada):
        out.append(puntos[i])
    if out[-1] != puntos[-1]:
        out.append(puntos[-1])
    return out


def main():
    if not os.path.isdir(ORIGEN):
        print('  ✗ no existe', ORIGEN); return 1

    os.makedirs(DESTINO, exist_ok=True)

    # los tasks, por su numero
    tareas = []
    for d in sorted(os.listdir(ORIGEN)):
        sub = os.path.join(ORIGEN, d)
        if not os.path.isdir(sub):
            continue
        # la carpeta de dentro: "N valadares"
        dentro = [x for x in os.listdir(sub)
                  if os.path.isdir(os.path.join(sub, x)) and x != '__MACOSX']
        if not dentro:
            continue
        nom = dentro[0]
        m = re.match(r'(\d+)', nom)
        if not m:
            continue
        tareas.append((int(m.group(1)), os.path.join(sub, nom)))

    tareas.sort()
    print('  tasks encontrados:', [t[0] for t in tareas])
    print()

    manifiesto = {}

    for numero, carpeta in tareas:
        vuelos = []
        for f in sorted(os.listdir(carpeta)):
            if not f.lower().endswith('.igc') or f.startswith('._'):
                continue
            ruta = os.path.join(carpeta, f)
            try:
                cab, pts = lee_igc(ruta)
            except Exception:
                continue
            if len(pts) < 100:
                continue
            piloto = ''
            fecha = ''
            for l in cab:
                if l.startswith('HFPLT'):
                    piloto = l.split(':', 1)[-1].strip()
                if l.startswith(('HFDTE', 'HODTE')):
                    mm = re.search(r'(\d{2})(\d{2})(\d{2})', l)
                    if mm:
                        aa = int(mm.group(3)); aa += 2000 if aa < 70 else 1900
                        fecha = f'{aa}-{mm.group(2)}-{mm.group(1)}'
            vuelos.append({
                'archivo': f, 'piloto': piloto, 'fecha': fecha,
                'n': len(pts), 'cab': cab, 'pts': pts,
            })

        if not vuelos:
            print('  ✗ task %d: no se leyo ningun vuelo' % numero); continue

        # el de Pam, y los que mas volaron
        pam = [v for v in vuelos if v['archivo'] == PAM + '.igc']
        otros = sorted([v for v in vuelos if v['archivo'] != PAM + '.igc'],
                       key=lambda v: -v['n'])

        elegidos = []
        if pam:
            elegidos.append(pam[0])
        for v in otros:
            if len(elegidos) >= CUANTOS:
                break
            elegidos.append(v)

        # y se escriben adelgazados
        dest = os.path.join(DESTINO, 'task%d' % numero)
        os.makedirs(dest, exist_ok=True)
        total_kb = 0
        lista = []
        for v in elegidos:
            pts = adelgaza(v['pts'], CADA)
            texto = '\n'.join(v['cab'] + pts) + '\n'
            nombre = 'p%s.igc' % re.sub(r'\D', '', v['archivo']) or 'v.igc'
            if v['archivo'] == PAM + '.igc':
                nombre = 'pam.igc'
            with open(os.path.join(dest, nombre), 'w', encoding='utf-8') as f:
                f.write(texto)
            kb = len(texto.encode()) / 1024
            total_kb += kb
            lista.append({
                'archivo': 'tasks/task%d/%s' % (numero, nombre),
                'piloto': v['piloto'] or ('Dorsal ' + v['archivo'].replace('.igc', '')),
                'esPam': v['archivo'] == PAM + '.igc',
                'puntos': len(pts),
                'kb': round(kb),
            })

        manifiesto['task%d' % numero] = {
            'n': numero,
            'fecha': elegidos[0]['fecha'],
            'sitio': 'Valadares',
            'vuelos': lista,
        }

        print('  task %d  (%s)  %d vuelos  %.0f KB' % (
            numero, elegidos[0]['fecha'], len(lista), total_kb))
        for v in lista:
            print('      %-6s %-32s %6d pts  %4d KB%s' % (
                v['archivo'].split('/')[-1], v['piloto'][:32], v['puntos'], v['kb'],
                '   ← PAM' if v['esPam'] else ''))

    with open(os.path.join(DESTINO, 'indice.json'), 'w', encoding='utf-8') as f:
        json.dump(manifiesto, f, indent=2, ensure_ascii=False)

    tot = sum(v['kb'] for t in manifiesto.values() for v in t['vuelos'])
    print()
    print('  TOTAL: %d KB (%.1f MB) en %d tasks, %d vuelos' % (
        tot, tot / 1024, len(manifiesto),
        sum(len(t['vuelos']) for t in manifiesto.values())))
    return 0


if __name__ == '__main__':
    sys.exit(main())

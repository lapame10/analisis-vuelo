#!/usr/bin/env python3
"""Cambia los pilotos de los tasks por los nombres que pidio Pam.

QUE HACE

De cada task se queda con CINCO vuelos (Pam ya no sale) y les pone los nombres
que ella quiere:

    julien garcia, baptiste, honorin, andy, marcela

Los vuelos siguen siendo los reales de Valadares: lo que cambia es el nombre que
se enseña. Asi las metricas, el mapa y las termicas son de un vuelo de verdad,
pero la app no lleva el nombre de nadie del que no quiera.

Cual se asigna a cual

Se reparten por distancia, de mas a menos, quitando el de Pam. Asi los cinco
nombres tienen siempre un vuelo distinto y el orden es coherente en los 7 tasks:
el mismo nombre tiende a quedar arriba o abajo, en vez de bailar.
"""
import json, os, shutil, sys

BASE = '/Users/lapame10/.hermes/workspace/analisis-vuelo'
TASKS = os.path.join(BASE, 'tasks')

# los nombres, en el orden en que Pam los dijo
NOMBRES = ['julien garcia', 'baptiste', 'honorin', 'andy', 'marcela']


def main():
    indice_path = os.path.join(TASKS, 'indice.json')
    indice = json.load(open(indice_path, encoding='utf-8'))

    for clave in sorted(indice, key=lambda k: indice[k]['n']):
        t = indice[clave]
        vuelos = t['vuelos']

        # se quitan los de Pam y se ordenan por distancia (los km que trae el indice)
        otros = [v for v in vuelos if not v.get('esPam')]
        # el indice no trae km por vuelo; se ordenan por el tamaño del archivo como
        # aproximacion, que funciona porque mas vuelo = mas puntos = mas bytes
        for v in otros:
            ruta = os.path.join(BASE, v['archivo'])
            v['_kb'] = os.path.getsize(ruta) if os.path.exists(ruta) else 0
        otros.sort(key=lambda v: -v['_kb'])

        nuevos = []
        for i, v in enumerate(otros[:len(NOMBRES)]):
            v = dict(v)
            v.pop('_kb', None)
            v['piloto'] = NOMBRES[i]
            v['esPam'] = False
            nuevos.append(v)

        t['vuelos'] = nuevos
        print('  %s (%s): %d vuelos' % (clave, t.get('fecha', '?'), len(nuevos)))
        for v in nuevos:
            print('      %-16s %s' % (v['piloto'], os.path.basename(v['archivo'])))

    # el de Pam ya no se usa: se borra del repo
    for clave in indice:
        d = os.path.join(TASKS, clave)
        pam = os.path.join(d, 'pam.igc')
        if os.path.exists(pam):
            os.remove(pam)
            print('  borrado %s/pam.igc' % clave)

    json.dump(indice, open(indice_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)

    total = sum(len(t['vuelos']) for t in indice.values())
    print()
    print('  TOTAL: %d tasks, %d vuelos' % (len(indice), total))
    print('  nombres: %s' % ', '.join(NOMBRES))
    return 0


if __name__ == '__main__':
    sys.exit(main())

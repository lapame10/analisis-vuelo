#!/usr/bin/env python3
"""Comprueba que la app no tenga referencias rotas.

POR QUE EXISTE ESTE ARCHIVO

Al reorganizar la app (quitar la pantalla de carga, mover las notas a las
Observaciones del task) se borro el HTML de unas pantallas, pero se quedaron los
enganches del JavaScript que apuntaban a esos elementos.

Y eso rompe la app ENTERA, no solo esa parte: el script es un modulo, y un
TypeError al cargarlo hace que no se ejecute NADA. La pantalla queda en blanco,
sin ningun error visible — el navegador decia "exception" y nada mas, cinco
veces, sin un solo mensaje.

Se perdieron un buen rato ahi. Este comprobador caza eso antes de publicar.

QUE MIRA

  1. los getElementById('x') cuyo id NO existe en el index.html ni se crea en
     algun innerHTML del propio codigo
  2. las funciones que se llaman y no estan declaradas ni importadas
  3. que los imports entre modulos resuelvan

Se corre con:  python3 chequea_app.py
"""
import re, os, sys, glob

BASE = os.path.dirname(os.path.abspath(__file__))


def lee(p):
    try:
        return open(os.path.join(BASE, p), encoding='utf-8').read()
    except FileNotFoundError:
        return ''


app = lee('app.js')
html = lee('index.html')
todos = app + html

problemas = []

# ---------- 1) los ids ----------
ids_html = set(re.findall(r'id="([^"]+)"', html))
ids_dinamicos = set(re.findall(r'id="([^"]+)"', app))          # los que se crean en innerHTML
ids_validos = ids_html | ids_dinamicos

for m in re.finditer(r"getElementById\('([^']+)'\)", todos):
    if m.group(1) not in ids_validos:
        linea = todos[:m.start()].count('\n') + 1
        problemas.append('getElementById: no existe el id "%s" (linea %d)' % (m.group(1), linea))

# ---------- 2) funciones llamadas que no existen ----------
# lo que exporta cada modulo
exporta = {}
for f in glob.glob(os.path.join(BASE, '*.js')):
    src = open(f, encoding='utf-8').read()
    n = set(re.findall(r'export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)', src))
    for b in re.findall(r'export\s*\{([^}]*)\}', src):
        for x in b.split(','):
            x = x.strip()
            if x:
                n.add(x.split(' as ')[-1].strip())
    exporta[os.path.basename(f)] = n

# lo que declara app.js
decl = set(re.findall(r'(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)', app))
# lo que importa
imp = set()
for m in re.finditer(r"import\s+\*\s+as\s+(\w+)", app):
    imp.add(m.group(1))
for m in re.finditer(r"import\s*\{([^}]*)\}", app):
    for x in m.group(1).split(','):
        if x.strip():
            imp.add(x.strip().split(' as ')[-1].strip())

nativos = {
    'window', 'document', 'console', 'fetch', 'localStorage', 'sessionStorage',
    'setTimeout', 'setInterval', 'clearInterval', 'clearTimeout', 'Promise',
    'Object', 'Array', 'String', 'Number', 'Boolean', 'Math', 'JSON', 'Date',
    'Set', 'Map', 'WeakMap', 'Uint8Array', 'ArrayBuffer', 'URL', 'Blob', 'File',
    'FileReader', 'DataTransfer', 'Event', 'CustomEvent', 'crypto', 'TextEncoder',
    'TextDecoder', 'btoa', 'atob', 'L', 'isFinite', 'isNaN', 'parseInt', 'parseFloat',
    'Infinity', 'NaN', 'undefined', 'Element', 'NodeFilter', 'requestAnimationFrame',
    'cancelAnimationFrame', 'alert', 'confirm', 'prompt', 'navigator', 'location',
    'history', 'performance', 'getComputedStyle', 'encodeURIComponent',
    'decodeURIComponent', 'Error', 'TypeError', 'RegExp', 'Symbol', 'Proxy', 'Reflect',
    'structuredClone', 'queueMicrotask', 'addEventListener', 'removeEventListener',
    'dispatchEvent', 'XMLHttpRequest', 'FormData', 'Headers', 'Request', 'Response',
    'Intl', 'BigInt', 'globalThis',
}

# ===== SOLO LAS LLAMADAS SUELTAS, NO LOS METODOS =====
# Hay que distinguir  foo()  de  algo.foo(). Lo segundo es un metodo y no tiene
# por que estar declarado en este archivo (puede ser de una libreria, de un
# objeto propio, o de un modulo importado). Mirando solo lo que NO lleva punto
# delante, la lista de sospechosos baja de 29 a los que de verdad importan.
# y hay que quitar antes los COMENTARIOS y los textos de los string, o el
# comprobador se queja de lo que se lee en un comentario (pasaba con "gris()",
# "trozo()"...) o del var() del CSS.
def sin_comentarios(t):
    t = re.sub(r'/\*.*?\*/', ' ', t, flags=re.S)      # /* ... */
    t = re.sub(r'(?m)^\s*//.*$', ' ', t)              # // al principio de linea
    t = re.sub(r'//.*?$', ' ', t, flags=re.M)          # // al final
    t = re.sub(r'`(?:[^`\\]|\\.)*`', '` `', t, flags=re.S)   # plantillas
    return t

app_limpio = sin_comentarios(app)
propias = set()
for m in re.finditer(r'(?<![.\w$])([a-zA-Z_$][\w$]{2,})\s*\(', app_limpio):
    propias.add(m.group(1))
for n in sorted(propias):
    if n in decl or n in imp or n in nativos:
        continue
    # descartar palabras clave y metodos de libreria habituales
    if n in ('if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function',
             'await', 'async', 'of', 'in', 'do', 'else', 'new', 'delete', 'void',
             'get', 'set', 'getElementById', 'querySelector', 'querySelectorAll',
             'createElement', 'createElementNS', 'appendChild', 'addEventListener',
             'removeEventListener', 'setAttribute', 'getAttribute', 'classList',
             'forEach', 'map', 'filter', 'find', 'findIndex', 'reduce', 'sort',
             'join', 'split', 'slice', 'splice', 'push', 'pop', 'shift', 'unshift',
             'includes', 'indexOf', 'replace', 'replaceAll', 'trim', 'toFixed',
             'toString', 'toLocaleString', 'padStart', 'padEnd', 'startsWith',
             'endsWith', 'substring', 'substr', 'charAt', 'toUpperCase', 'toLowerCase',
             'match', 'matchAll', 'test', 'exec', 'then', 'catch', 'finally',
             'getItem', 'setItem', 'removeItem', 'text', 'json', 'arrayBuffer',
             'fetch', 'open', 'send', 'add', 'remove', 'clear', 'has', 'get', 'set',
             'values', 'keys', 'entries', 'round', 'floor', 'ceil', 'abs', 'min',
             'max', 'hypot', 'sin', 'cos', 'atan2', 'sqrt', 'pow', 'random',
             'padStart', 'toTimeString', 'toDateString', 'getTime', 'getHours',
             'getMinutes', 'getMonth', 'getDate', 'getFullYear', 'toISOString',
             # 'trozo' sale de un comentario que acaba en */ y el quitador de
             # comentarios no lo pilla. Es un falso positivo.
             'trozo'):
        continue
    problemas.append('funcion llamada y no declarada: %s()' % n)

# ---------- 3) los imports entre modulos ----------
for m in re.finditer(r"import\s*(?:\*\s*as\s*(\w+)|\{([^}]*)\})\s*from\s*'\./(\w+)\.js'", app):
    alias, nombres, orig = m.groups()
    o = orig + '.js'
    if o not in exporta:
        problemas.append('import: no existe el modulo %s' % o)
        continue
    if nombres:
        for nm in [x.strip().split(' as ')[-1].strip() for x in nombres.split(',') if x.strip()]:
            if nm not in exporta[o]:
                problemas.append('import: %s no exporta %s' % (o, nm))

# ---------- resultado ----------
print()
if problemas:
    print('  ✗ %d problemas:' % len(problemas))
    for p in problemas:
        print('   - %s' % p)
    print()
    sys.exit(1)
else:
    print('  ✓ sin referencias rotas')
    print()
    sys.exit(0)

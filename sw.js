/* ============================================================
   EL SERVICE WORKER
   ============================================================
   Existe por un problema muy concreto y muy molesto: Pam cambiaba algo, se
   publicaba, y al abrir la app en el iPhone seguia viendo la version de antes.

   No era que no se hubiera publicado. Era GitHub Pages, que sirve los archivos
   con "guardalos 10 minutos" (max-age=600). Y peor: si la app esta puesta en la
   pantalla de inicio, esa entrada NO lleva ningun ?v=, asi que el navegador no
   tiene forma de saber que hay algo nuevo. Se queda con lo viejo hasta que a el
   le apetezca.

   ---------------------------------------------------------------
   QUE HACE

   "RED PRIMERO": cada vez que pide un archivo, va a buscarlo a la red. Si
   responde, se usa lo nuevo Y se guarda una copia. Si no hay red, se usa la
   copia guardada.

   Asi, con conexion, lo que se ve es SIEMPRE lo ultimo publicado. Sin conexion,
   la app sigue abriendo — que en un despegue sin cobertura importa.

   ---------------------------------------------------------------
   LO QUE NO SE GUARDA NUNCA

   Las teselas del mapa SI se guardan (son cientos y repetirlas cada vez es
   lento). Todo lo demas de la app, no: red primero.

   Y las observaciones y las etiquetas no pasan por aqui (van cifradas y por su
   propio camino), asi que esto no las toca.
   ============================================================ */

const CACHE = 'thermalapp-v1';

/* las teselas del mapa: esas si se guardan, que son muchas */
const TESELAS = /^https:\/\/[abc]?\.?tile\.opentopomap\.org\//;

self.addEventListener('install', (e) => {
  /* se activa ya, sin esperar a que se cierren las pestañas viejas */
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    /* se borran las cachés de versiones anteriores */
    const nombres = await caches.keys();
    await Promise.all(nombres.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  /* solo lo nuestro y las teselas */
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin && !TESELAS.test(e.request.url)) return;

  /* ---- las teselas: de la caché primero, que cambian poco ---- */
  if (TESELAS.test(e.request.url)) {
    e.respondWith((async () => {
      const g = await caches.match(e.request);
      if (g) return g;
      try {
        const r = await fetch(e.request);
        if (r && r.ok) {
          const c = await caches.open(CACHE);
          c.put(e.request, r.clone());
        }
        return r;
      } catch (err) {
        return new Response('', { status: 404 });
      }
    })());
    return;
  }

  /* ---- todo lo demas: RED PRIMERO ----
     Esto es lo que arregla el problema de la version vieja. */
  e.respondWith((async () => {
    try {
      const r = await fetch(e.request, { cache: 'no-store' });
      if (r && r.ok) {
        const c = await caches.open(CACHE);
        c.put(e.request, r.clone());
      }
      return r;
    } catch (err) {
      /* sin red: se tira de la copia, si la hay */
      const g = await caches.match(e.request);
      if (g) return g;
      /* y si no, al menos se devuelve algo que no rompa */
      if (e.request.mode === 'navigate') {
        const idx = await caches.match('./index.html');
        if (idx) return idx;
      }
      return new Response('', { status: 504 });
    }
  })());
});

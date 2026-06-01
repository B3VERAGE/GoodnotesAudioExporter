// Nome della cache locale
const CACHE_NAME = 'goodnotes-audio-exporter-v1';

// File da memorizzare in cache all'installazione per abilitare l'offline permanente
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './index.css',
    './app.js',
    './manifest.json',
    './jszip.min.js'
];

// Evento di installazione: carica in cache tutti gli asset necessari
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caricamento risorse in cache...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Evento di attivazione: pulisce le vecchie cache
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Rimozione vecchia cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Evento di fetch: intercetta le chiamate e serve le risorse locali dalla cache (Cache-First)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse; // Ritorna risorsa da cache
                }
                
                // Se non presente in cache, prova a recuperarla online
                return fetch(event.request)
                    .then((networkResponse) => {
                        // Salva la nuova risorsa nella cache se valida
                        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // Fallback silenzioso in caso di totale disconnessione
                        return null;
                    });
            })
    );
});

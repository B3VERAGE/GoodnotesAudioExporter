// ================================================================================
// Goodnotes 6 Audio Exporter & Renamer - Service Worker (v13)
// Strategia PWA: Offline-First, Stale-While-Revalidate per App Shell & Assets
// Network-First per API con Graceful Degradation
// ================================================================================

const CACHE_NAME = 'goodnotes-audio-pwa-v13';

// File da memorizzare in cache all'installazione per abilitare l'offline permanente
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './index.css',
    './app.js',
    './cloud_sync.js',
    './worker.js',
    './db.js',
    './manifest.json',
    './jszip.min.js',
    './icon-192.png',
    './icon-192-maskable.png',
    './icon-512.png',
    './icon-512-maskable.png',
    './apple-touch-icon.png',
    './icon.png'
];

// Evento di installazione: scarica in cache tutti gli asset essenziali
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker v7] Pre-caching asset essenziali per disponibilità offline...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => {
                console.log('[Service Worker v7] Tutti gli asset sono stati memorizzati in cache.');
                return self.skipWaiting();
            })
            .catch((err) => {
                console.error('[Service Worker v7] Errore durante il pre-caching:', err);
            })
    );
});

// Evento di attivazione: pulisce le vecchie versioni della cache e reclamo client
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cache) => {
                        if (cache !== CACHE_NAME) {
                            console.log('[Service Worker v7] Rimozione vecchia cache obsoleta:', cache);
                            return caches.delete(cache);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[Service Worker v7] Reclamo immediato dei client attivi.');
                return self.clients.claim();
            })
    );
});

// Evento di fetch: strategie di risposta differenziate
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Ignora schemi non HTTP/HTTPS (es. chrome-extension, data, blob)
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // 1. RICHIESTE API (/api/) -> Strategia Network-First con Fallback Graceful
    if (url.pathname.includes('/api/')) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200 && request.method === 'GET') {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                    }
                    return networkResponse;
                })
                .catch(async () => {
                    console.warn(`[Service Worker v7] Rete offline per API: ${url.pathname}. Tentativo da cache...`);
                    const cachedResponse = await caches.match(request);
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return new Response(
                        JSON.stringify({
                            error: 'Connessione server assente. L\'applicazione è attualmente in modalità offline.',
                            offline: true,
                            timestamp: Date.now()
                        }),
                        {
                            status: 503,
                            statusText: 'Service Unavailable (Offline)',
                            headers: { 'Content-Type': 'application/json; charset=utf-8' }
                        }
                    );
                })
        );
        return;
    }

    // 2. APP SHELL & RISORSE STATICHE -> Stale-While-Revalidate
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                // Background revalidation
                const fetchPromise = fetch(request)
                    .then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
                            const responseClone = networkResponse.clone();
                            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                        }
                        return networkResponse;
                    })
                    .catch(() => null);

                // Se presente in cache, restituisci immediatamente
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Se non presente in cache, attendi la risposta di rete
                return fetchPromise.then((networkResponse) => {
                    if (networkResponse) {
                        return networkResponse;
                    }

                    // Fallback SPA per navigazione quando offline
                    if (request.mode === 'navigate') {
                        return caches.match('./index.html').then((indexFallback) => {
                            return indexFallback || caches.match('./');
                        });
                    }

                    return new Response('Risorsa non disponibile offline.', {
                        status: 503,
                        statusText: 'Offline Resource Unavailable',
                        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                    });
                });
            })
    );
});

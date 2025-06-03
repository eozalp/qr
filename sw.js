const CACHE_NAME = 'alvetak-microqr-cache-v1'; // Updated cache name for Micro QR version
const URLS_TO_CACHE = [
    './', // Or '/' - represents the root of the PWA within its scope (/qr/)
    'index.html',
    'style.css',
    'script.js',
    'manifest.json',
    'offline.html', // Ensure this path is correct relative to /qr/
    // Add paths to your icons here if you want them cached, e.g.:
    'images/icon-192x192.png', // Assuming icons are in an 'images' folder relative to root
    'images/icon-512x512.png',
    'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js' // Cache the jsQR library
];

// Install event: opens the cache and adds core files to it.
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Önbellek açıldı');
                return cache.addAll(URLS_TO_CACHE);
            })
    );
});

// Fetch event: serves assets from cache if available, otherwise fetches from network.
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                // Not in cache - fetch from network
                return fetch(event.request).then(
                    networkResponse => {
                        // Check if we received a valid response
                        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
                            return networkResponse;
                        }

                        // IMPORTANT: Clone the response. A response is a stream
                        // and because we want the browser to consume the response
                        // as well as the cache consuming the response, we need
                        // to clone it so we have two streams.
                        const responseToCache = networkResponse.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });

                        return networkResponse;
                    }
                ).catch(error => {
                    console.error('Getirme başarısız oldu:', error);
                    // You could return a custom offline page here if needed
                    throw error;
                });
            })
    );
});

// Activate event: cleans up old caches.
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('Eski önbellek siliniyor:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

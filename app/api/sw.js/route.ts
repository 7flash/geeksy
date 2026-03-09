// app/api/sw.js/route.ts — Service Worker for offline caching
export async function GET() {
    const sw = `
// Geeksy Service Worker — Cache-first for assets, network-first for API
const CACHE = 'geeksy-v1';
const PRECACHE = ['/', '/skills', '/models', '/plugins'];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Network-first for API calls
    if (url.pathname.startsWith('/api/')) {
        e.respondWith(
            fetch(e.request).catch(() => caches.match(e.request))
        );
        return;
    }

    // Cache-first for everything else
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(res => {
                if (res.ok && e.request.method === 'GET') {
                    const clone = res.clone();
                    caches.open(CACHE).then(c => c.put(e.request, clone));
                }
                return res;
            });
        })
    );
});
`.trim();

    return new Response(sw, {
        headers: {
            'Content-Type': 'application/javascript',
            'Cache-Control': 'no-cache',
            'Service-Worker-Allowed': '/',
        },
    });
}

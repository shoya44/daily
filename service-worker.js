/* ========================================
   Daily — Service Worker (確定版)
   最小限のキャッシュとオフライン起動対応
   ======================================== */

const CACHE_NAME = 'daily-app-v10';
const CACHE_URLS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// インストール時に静的アセットをプリキャッシュ
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(CACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

// アクティベート時に古いキャッシュを削除
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// フェッチ処理
self.addEventListener('fetch', (event) => {
    // GET以外のメソッド（POST, PATCH, DELETE等）はキャッシュ処理を行わない
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // ブラウザ拡張機能由来のリクエスト（chrome-extension:, moz-extension: 等）は
    // Cache APIでput()できず未処理のPromise拒否になるため、http(s)以外は対象外とする。
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    // Supabase DB/Auth や Open-Meteo API はキャッシュ対象外
    if (url.hostname.includes('supabase.co') || url.hostname.includes('open-meteo.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cached => {
                if (cached) {
                    return cached;
                }
                return fetch(event.request)
                    .then(response => {
                        if (response.status === 200 && response.type === 'basic') {
                            const responseClone = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(event.request, responseClone))
                                .catch(err => console.error('Cache put error:', err));
                        }
                        return response;
                    })
                    .catch(() => {
                        // オフライン時のページ遷移は index.html を返す
                        if (event.request.mode === 'navigate') {
                            return caches.match('./index.html');
                        }
                    });
            })
    );
});

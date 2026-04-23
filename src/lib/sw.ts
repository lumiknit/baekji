/// <reference lib="webworker" />
const sw = self as unknown as ServiceWorkerGlobalScope;

declare const __APP_VERSION__: string;
const CACHE_NAME = `baekji-cache-v${__APP_VERSION__}`;

sw.addEventListener('install', () => {
  sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete old caches that don't match the current version
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          }),
      );
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') {
    return;
  }

  // HTTP 혹은 HTTPS 요청만 처리
  if (!req.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const networkResponse = await fetch(req);

        // 200 응답인 경우 캐시 저장
        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, networkResponse.clone());
        }

        return networkResponse;
      } catch (error) {
        // 네트워크 연결 실패 시 캐시에서 확인 (Network First, fallback to Cache)
        const cachedResponse = await caches.match(req);
        if (cachedResponse) {
          return cachedResponse;
        }
        throw error;
      }
    })(),
  );
});

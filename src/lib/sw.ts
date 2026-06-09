/// <reference lib="webworker" />
const sw = self as unknown as ServiceWorkerGlobalScope;

declare const __APP_VERSION__: string;
const CACHE_PREFIX = `baekji-`;
const CACHE_NAME = `${CACHE_PREFIX}v${__APP_VERSION__}`;

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
          .filter(
            (name) => name !== CACHE_NAME && name.startsWith(CACHE_PREFIX),
          )
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          }),
      );
      await sw.clients.claim();
    })(),
  );
});

const networkFirstFetch = async (
  event: FetchEvent,
  req: Request,
): Promise<Response> => {
  try {
    const networkResponse = await fetch(req);

    // Cache successful responses
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    // Network first, fallback to cache
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(req);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
};

const cacheFirstFetch = async (
  event: FetchEvent,
  req: Request,
): Promise<Response> => {
  // Check cache exists first.
  const cache = await caches.open(CACHE_NAME);
  const cachedResp = await cache.match(req);

  if (!cachedResp) {
    // Cache not found, fallback to same strategy to network first
    return await networkFirstFetch(event, req);
  }

  // Otherwise, fetching background, return the cached one;
  event.waitUntil(
    (async () => {
      const networkResponse = await fetch(req);
      if (networkResponse && networkResponse.status === 200) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, networkResponse.clone());
      }
    })(),
  );

  return cachedResp;
};

const cacheFirstRE = /(\/assets\/)|(\/fonts\/)/;

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') {
    return;
  }

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    // Bypass external APIs
    return;
  }

  // '/assets/*' has hash in file name, thus send cache first.
  const fetcher = cacheFirstRE.test(url.pathname)
    ? cacheFirstFetch
    : networkFirstFetch;

  event.respondWith(fetcher(event, req));
});

// Precache the shell, intro, core screen and motor; hashed assets are cache-first, other requests are network-first with offline fallbacks.
// Bump this revision for each production build; activation removes older Sentra caches.
const CACHE_NAME = 'sentra-core-v8';
const CACHE_PREFIX = 'sentra-core-';
const SHELL_ASSETS = ['/', '/index.html', '/manifest.json', '/icon.svg', '/conquer-orchestrator.svg'];
const CRITICAL_CHUNK_PATTERN = /(?:ConquerOrchestrator|OrchestratorBridge|WorldResponderSystem|EventBus|SentraCoreArena|SentraCoreDashboard|ResilientTCREIBus)-[A-Za-z0-9_-]+\.js/g;

async function cacheBuildAsset(cache, assetUrl, cachedAssets) {
  const url = new URL(assetUrl, self.location.origin);
  if (url.origin !== self.location.origin || cachedAssets.has(url.href)) return;
  cachedAssets.add(url.href);

  const response = await fetch(url.href);
  if (!response.ok) throw new Error(`No se pudo precargar ${url.pathname}: ${response.status}`);
  await cache.put(url.href, response.clone());

  if (!url.pathname.endsWith('.js')) return;
  const source = await response.text();
  const dependencies = source.match(CRITICAL_CHUNK_PATTERN) ?? [];
  for (const dependency of dependencies) {
    await cacheBuildAsset(cache, new URL(dependency, url).href, cachedAssets);
  }
}

async function precacheBuildAssets(cache) {
  const response = await fetch('/index.html', { cache: 'reload' });
  if (!response.ok) throw new Error(`No se pudo leer index.html: ${response.status}`);
  const html = await response.text();
  const assetUrls = Array.from(html.matchAll(/(?:src|href)=["']([^"']+)["']/g), (match) => match[1])
    .map((asset) => new URL(asset, self.location.origin))
    .filter((url) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'))
    .map((url) => url.href);
  const cachedAssets = new Set();
  for (const assetUrl of assetUrls) {
    await cacheBuildAsset(cache, assetUrl, cachedAssets);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(SHELL_ASSETS);
        await precacheBuildAssets(cache);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === 'navigate';
  const isStaticAsset = url.pathname.startsWith('/assets/')
    || url.pathname === '/manifest.json'
    || url.pathname.endsWith('.svg');

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreVary: isStaticAsset });

    if (isStaticAsset && cached) return cached;

    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      if (isNavigation) {
        const shell = await cache.match('/index.html') ?? await cache.match('/');
        if (shell) return shell;
      }
      throw error;
    }
  })());
});

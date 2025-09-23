// 타임스탬프를 포함한 캐시 이름으로 자동 업데이트
const CACHE_NAME = `safesys-v${Date.now()}`;
const urlsToCache = [
  '/',
  '/shield.svg',
  '/manifest.json'
];

const OFFLINE_HTML = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>오프라인</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f8fafc;color:#0f172a} .card{background:#fff;padding:24px 28px;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.04)} h1{font-size:18px;margin:0 0 8px} p{margin:0;color:#475569}</style></head><body><div class="card"><h1>오프라인 상태입니다</h1><p>네트워크 연결을 확인해 주세요.</p></div></body></html>';

self.addEventListener('install', (event) => {
  // 즉시 활성화
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // 이전 캐시 삭제
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // 즉시 클라이언트 제어
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  // HTML 페이지는 항상 네트워크에서 가져오기 (캐시 우회)
  if (event.request.destination === 'document') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(event.request);
          return networkResponse;
        } catch (err) {
          const cached = await caches.match(event.request) || await caches.match('/');
          if (cached) return cached;
          return new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
      })()
    );
    return;
  }

  // 정적 리소스는 캐시 사용
  event.respondWith(
    (async () => {
      try {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        const networkResponse = await fetch(event.request);
        return networkResponse;
      } catch (err) {
        // 네트워크 실패 시 빈 504 응답 반환 (Response 강제 보장)
        return new Response('', { status: 504, statusText: 'Gateway Timeout' });
      }
    })()
  );
});
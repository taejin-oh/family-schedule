// Service Worker — family-schedule PWA offline cache.
//
// 전략:
// - /_next/static, /icons — cache-first (해시 파일명이라 자동 무효화)
// - HTML 페이지 (navigate) — network-first, 실패 시 cache fallback (offline OK)
// - /api/* — fetch 그대로 통과 (intercept X). SSE/server actions/DB 변경 보호.
//
// 캐시 이름에 버전을 박아두고 새 버전 활성화 시 이전 캐시 삭제.

const CACHE = 'family-schedule-v1'

self.addEventListener('install', () => {
  // 새 SW를 즉시 waiting 단계 없이 active로.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // API / SSE / Server Actions는 SW가 절대 가로채지 않음.
  if (url.pathname.startsWith('/api/')) return

  // 정적 자산 — cache-first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(req))
    return
  }

  // HTML 페이지 (navigation) — network-first, 실패 시 캐시.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(networkFirst(req))
    return
  }
})

async function cacheFirst(req) {
  const cached = await caches.match(req)
  if (cached) return cached
  try {
    const res = await fetch(req)
    if (res.ok) {
      const cache = await caches.open(CACHE)
      cache.put(req, res.clone())
    }
    return res
  } catch {
    if (cached) return cached
    throw new Error('offline + no cache')
  }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req)
    if (res.ok) {
      const cache = await caches.open(CACHE)
      cache.put(req, res.clone())
    }
    return res
  } catch {
    const cached = await caches.match(req)
    if (cached) return cached
    // 마지막 fallback: 루트 페이지라도.
    const root = await caches.match('/')
    if (root) return root
    throw new Error('offline + no cache')
  }
}

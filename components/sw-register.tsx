'use client'

import { useEffect } from 'react'

/**
 * Service Worker 등록 — PWA offline cache 활성화.
 * `public/sw.js`가 install 시 자동 적용 (skipWaiting + clients.claim).
 * dev에선 동작 안 함 (next dev는 sw.js를 public에서 그대로 serve하지만 안정성 위해 prod만).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[sw] register failed', err)
      })
    }
    if (document.readyState === 'complete') onLoad()
    else window.addEventListener('load', onLoad, { once: true })
  }, [])
  return null
}

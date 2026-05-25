'use client'

import { useSyncExternalStore } from 'react'

function getSnapshot(query: string) {
  return () => window.matchMedia(query).matches
}

function getServerSnapshot() {
  return false
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', callback)
      return () => mql.removeEventListener('change', callback)
    },
    getSnapshot(query),
    getServerSnapshot,
  )
}

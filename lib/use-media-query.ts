'use client'

import { useCallback, useSyncExternalStore } from 'react'

const SERVER_SNAPSHOT = () => false

export function useMediaQuery(query: string): boolean {
  // Stable references per `query` — otherwise useSyncExternalStore re-subscribes
  // on every render because new closures look like different stores.
  const subscribe = useCallback((callback: () => void) => {
    const mql = window.matchMedia(query)
    mql.addEventListener('change', callback)
    return () => mql.removeEventListener('change', callback)
  }, [query])
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  return useSyncExternalStore(subscribe, getSnapshot, SERVER_SNAPSHOT)
}

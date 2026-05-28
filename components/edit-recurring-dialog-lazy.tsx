'use client'

import dynamic from 'next/dynamic'

/**
 * Dialog 본체는 base-ui Dialog/Sheet + 폼 + useMediaQuery + 액션 import로
 * 묵직하지만, recurring task list의 각 row마다 mount되면 초기 hydration이 무거워짐.
 * 첫 open 시점에만 lazy load.
 */
export const EditRecurringDialog = dynamic(
  () => import('./edit-recurring-dialog').then((m) => m.EditRecurringDialog),
  { ssr: false, loading: () => null },
)

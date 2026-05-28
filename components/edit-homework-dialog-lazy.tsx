'use client'

import dynamic from 'next/dynamic'

/**
 * 각 homework row마다 mount되는 비용을 줄이기 위해 lazy 처리.
 * 첫 click 시에만 chunk 로드.
 */
export const EditHomeworkDialog = dynamic(
  () => import('./edit-homework-dialog').then((m) => m.EditHomeworkDialog),
  { ssr: false, loading: () => null },
)

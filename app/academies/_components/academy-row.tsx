'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ItemActionsMenu } from '@/components/item-actions-menu'
import { useToast } from '@/components/toast'

export function AcademyRow({
  id, name, color, subjectLabel, scheduleLabel, onArchive, onUnarchive,
}: {
  id: number
  name: string
  color: string
  subjectLabel: string
  scheduleLabel: string | null
  onArchive: () => Promise<void>
  onUnarchive: () => Promise<void>
}) {
  const router = useRouter()
  const toast = useToast()

  async function handleArchive() {
    await onArchive()
    toast.show({
      label: `"${name}" 보관됨`,
      onUndo: async () => { await onUnarchive(); router.refresh() },
    })
  }

  return (
    <ItemActionsMenu
      itemKind="academy"
      onEdit={() => router.push(`/academies/${id}/edit`)}
      onArchive={handleArchive}
    >
      <div className="px-4 py-3 pr-12 flex items-center gap-3">
        <span
          className="w-[5px] h-9 rounded-full flex-shrink-0"
          style={{ background: color }}
          aria-hidden
        />
        <Link
          href={`/academies/${id}`}
          className="flex-1 min-w-0 -m-1 p-1 rounded-md hover:bg-accent transition-colors"
        >
          <div className="font-medium text-[15px]">{name}</div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            {subjectLabel}{scheduleLabel && ` · ${scheduleLabel}`}
          </div>
        </Link>
      </div>
    </ItemActionsMenu>
  )
}

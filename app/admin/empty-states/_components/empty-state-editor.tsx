'use client'

import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { useMediaQuery } from '@/lib/use-media-query'
import { updateEmptyStates, resetEmptyStatesToDefault } from '@/server/actions/empty-states'
import type { EmptyState } from '@/lib/empty-states'

export function EmptyStateEditor({ initial }: { initial: EmptyState[] }) {
  const [items, setItems] = useState<EmptyState[]>(initial)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [resetOpen, setResetOpen] = useState(false)

  const dirty = JSON.stringify(items) !== JSON.stringify(initial)

  function patch(idx: number, p: Partial<EmptyState>) {
    setItems((cur) => cur.map((it, i) => (i === idx ? { ...it, ...p } : it)))
    setSavedAt(null)
  }
  function remove(idx: number) {
    setItems((cur) => cur.filter((_, i) => i !== idx))
    setSavedAt(null)
  }
  function add() {
    setItems((cur) => [...cur, { emoji: '✨', title: '', sub: '' }])
    setSavedAt(null)
  }

  function save() {
    setError(null)
    start(async () => {
      const res = await updateEmptyStates(items)
      if (res.ok) setSavedAt(Date.now())
      else setError(res.error)
    })
  }

  function doReset() {
    setResetOpen(false)
    setError(null)
    start(async () => {
      await resetEmptyStatesToDefault()
      window.location.reload()
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {items.map((it, idx) => (
          <Card key={idx} className="p-3 gap-2">
            <div className="flex items-center gap-2">
              <Input
                value={it.emoji}
                onChange={(e) => patch(idx, { emoji: e.target.value })}
                placeholder="🎉"
                className="w-14 text-center !text-2xl"
                maxLength={8}
              />
              <Input
                value={it.title}
                onChange={(e) => patch(idx, { title: e.target.value })}
                placeholder="제목 (예: 오늘 다 끝!)"
                className="flex-1 font-medium"
                maxLength={80}
              />
              <button
                type="button"
                onClick={() => remove(idx)}
                aria-label="이 항목 삭제"
                className="shrink-0 h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <Input
              value={it.sub}
              onChange={(e) => patch(idx, { sub: e.target.value })}
              placeholder="부제 (예: 잘했어!)"
              className="text-sm text-muted-foreground"
              maxLength={80}
            />
          </Card>
        ))}
      </div>

      <Button type="button" variant="outline" onClick={add} className="w-full" disabled={pending}>
        + 항목 추가
      </Button>

      <div className="sticky bottom-0 z-10 bg-background pt-2 pb-4 -mx-1 px-1 border-t">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setResetOpen(true)}
            disabled={pending}
          >
            기본값 복원
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={pending || !dirty || items.length === 0}
            className="flex-1"
          >
            {pending ? '저장 중…' : dirty ? `${items.length}개 저장` : savedAt ? '저장됨 ✓' : '저장'}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        {savedAt && !error && !dirty && (
          <p className="text-xs text-green-600 mt-2">저장되었습니다. 아이 홈에서 확인해보세요.</p>
        )}
      </div>

      <ResetConfirm
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={doReset}
      />
    </div>
  )
}

function ResetBody({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        지금 저장된 카피를 모두 지우고 <strong className="text-foreground">기본 30개</strong>로 되돌립니다. 되돌리면 직접 만든 내용은 사라집니다.
      </p>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose} autoFocus>
          취소
        </Button>
        <Button variant="destructive" className="flex-1" onClick={onConfirm}>
          기본값 복원
        </Button>
      </div>
    </div>
  )
}

function ResetConfirm({
  open, onClose, onConfirm,
}: { open: boolean; onClose: () => void; onConfirm: () => void }) {
  const isDesktop = useMediaQuery('(hover: hover)')
  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>기본값으로 복원</DialogTitle>
          </DialogHeader>
          <ResetBody onConfirm={onConfirm} onClose={onClose} />
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>기본값으로 복원</SheetTitle>
        </SheetHeader>
        <ResetBody onConfirm={onConfirm} onClose={onClose} />
      </SheetContent>
    </Sheet>
  )
}

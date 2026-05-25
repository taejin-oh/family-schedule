'use client'

import { useState, useTransition } from 'react'
import { updateHomeworkItem } from '@/server/actions/homework'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { useMediaQuery } from '@/lib/use-media-query'

type Props = {
  open: boolean
  onClose: () => void
  itemId: number
  initialTitle: string
  initialNotes: string | null
  initialDueDate: string | null
}

function HomeworkEditForm({
  itemId,
  initialTitle,
  initialNotes,
  initialDueDate,
  onClose,
}: Omit<Props, 'open'>) {
  const [title, setTitle] = useState(initialTitle)
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [dueDate, setDueDate] = useState(initialDueDate ?? '')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleSave() {
    if (!title.trim()) { setError('제목은 비울 수 없습니다'); return }
    setError(null)
    startTransition(async () => {
      const res = await updateHomeworkItem(itemId, {
        title: title.trim(),
        notes: notes.trim() || null,
        dueDate: dueDate || null,
      })
      if (!res.ok) { setError(res.error ?? '저장 실패'); return }
      onClose()
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="hw-title">제목</Label>
        <Input
          id="hw-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="hw-notes">메모</Label>
        <Textarea
          id="hw-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="hw-due">마감일</Label>
        <Input
          id="hw-due"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button className="flex-1" onClick={handleSave}>저장</Button>
        <Button variant="outline" onClick={onClose}>취소</Button>
      </div>
    </div>
  )
}

export function EditHomeworkDialog({ open, onClose, ...formProps }: Props) {
  const isDesktop = useMediaQuery('(hover: hover)')

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>숙제 수정</DialogTitle>
          </DialogHeader>
          <HomeworkEditForm onClose={onClose} {...formProps} />
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>숙제 수정</SheetTitle>
        </SheetHeader>
        <HomeworkEditForm onClose={onClose} {...formProps} />
      </SheetContent>
    </Sheet>
  )
}

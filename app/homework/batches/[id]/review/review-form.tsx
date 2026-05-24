'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateDraftItem, addDraftItem, deleteDraftItem, commitBatch } from '@/server/actions/homework'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Item = { id: number; title: string; dueDate: string | null; source: 'ai'|'manual' }
type Photo = { path: string; isPdf: boolean }

export function ReviewForm({ batchId, initial, photos }: { batchId: number; initial: Item[]; photos: Photo[] }) {
  const router = useRouter()
  const [items, setItems] = useState<Item[]>(initial)
  const [busy, setBusy] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDue, setNewDue] = useState<string>('')

  function patchLocal(id: number, p: Partial<Item>) {
    setItems((cur) => cur.map((x) => x.id === id ? { ...x, ...p } : x))
  }

  async function persist(id: number, p: { title?: string; dueDate?: string | null }) {
    await updateDraftItem(id, p)
  }

  async function remove(id: number) {
    await deleteDraftItem(id)
    setItems((cur) => cur.filter((x) => x.id !== id))
  }

  async function add() {
    if (!newTitle.trim()) return
    const res = await addDraftItem(batchId, { title: newTitle.trim(), dueDate: newDue || null })
    if (res.ok) {
      setNewTitle(''); setNewDue('')
      router.refresh()
    }
  }

  async function commit() {
    setBusy(true)
    await commitBatch(batchId)
    router.push('/')
  }

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="md:col-span-2 space-y-3">
        {items.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            추출된 항목이 없습니다. 아래에서 수동으로 추가하세요.
          </Card>
        ) : (
          <Card className="p-0 divide-y">
            {items.map((it) => (
              <div key={it.id} className="p-3 flex gap-2 items-center">
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded font-medium',
                  it.source === 'ai' ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'
                )}>
                  {it.source === 'ai' ? 'AI' : '수동'}
                </span>
                <Input
                  value={it.title}
                  onChange={(e) => patchLocal(it.id, { title: e.target.value })}
                  onBlur={(e) => persist(it.id, { title: e.target.value })}
                  className="flex-1"
                />
                <Input
                  type="date"
                  value={it.dueDate ?? ''}
                  onChange={(e) => {
                    const v = e.target.value || null
                    patchLocal(it.id, { dueDate: v })
                    persist(it.id, { dueDate: v })
                  }}
                  className="w-40"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(it.id)}
                  className="text-destructive hover:text-destructive"
                >
                  삭제
                </Button>
              </div>
            ))}
          </Card>
        )}

        <Card className="p-3 flex gap-2 items-center">
          <Input
            placeholder="수동으로 추가할 항목"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="flex-1"
          />
          <Input
            type="date"
            value={newDue}
            onChange={(e) => setNewDue(e.target.value)}
            className="w-40"
          />
          <Button type="button" onClick={add} variant="secondary">+ 추가</Button>
        </Card>

        <Button
          onClick={commit}
          disabled={busy || items.length === 0}
          className="w-full"
        >
          {busy ? '확정 중…' : '✅ 확정'}
        </Button>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">원본 파일</div>
        {photos.map((p, i) => {
          const href = `/api/photo?path=${encodeURIComponent(p.path)}`
          if (p.isPdf) {
            return (
              <Card key={p.path} className="p-3 space-y-2">
                <div className="text-xs text-muted-foreground">📄 PDF {i + 1}</div>
                <a href={href} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                  새 창에서 열기
                </a>
              </Card>
            )
          }
          return (
            <a key={p.path} href={href} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={href} alt={`photo ${i + 1}`} className="w-full rounded-md border" />
            </a>
          )
        })}
      </div>
    </div>
  )
}

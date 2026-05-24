'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateDraftItem, addDraftItem, deleteDraftItem, commitBatch, rerunBatch } from '@/server/actions/homework'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type SimilarMatch = {
  title: string
  dueDate: string | null
  doneAt: Date | null
  score: number
}
type Item = {
  id: number
  title: string
  notes: string | null
  dueDate: string | null
  source: 'ai' | 'manual'
  similar?: SimilarMatch | null
}
type Photo = { path: string; isPdf: boolean }

export function ReviewForm({ batchId, initial, photos, currentHint }: { batchId: number; initial: Item[]; photos: Photo[]; currentHint: string | null }) {
  const router = useRouter()
  const [items, setItems] = useState<Item[]>(initial)
  const [busy, setBusy] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newDue, setNewDue] = useState<string>('')
  const [newHint, setNewHint] = useState(currentHint ?? '')
  const [rerunError, setRerunError] = useState<string | null>(null)

  function patchLocal(id: number, p: Partial<Item>) {
    setItems((cur) => cur.map((x) => (x.id === id ? { ...x, ...p } : x)))
  }

  async function persist(id: number, p: { title?: string; notes?: string | null; dueDate?: string | null }) {
    await updateDraftItem(id, p)
  }

  async function remove(id: number) {
    await deleteDraftItem(id)
    setItems((cur) => cur.filter((x) => x.id !== id))
  }

  async function add() {
    if (!newTitle.trim()) return
    const res = await addDraftItem(batchId, {
      title: newTitle.trim(),
      notes: newNotes.trim() || null,
      dueDate: newDue || null,
    })
    if (res.ok) {
      setNewTitle('')
      setNewNotes('')
      setNewDue('')
      router.refresh()
    }
  }

  async function commit() {
    setBusy(true)
    await commitBatch(batchId)
    router.push('/')
  }

  async function rerun() {
    setBusy(true)
    setRerunError(null)
    const res = await rerunBatch(batchId, { userHint: newHint || null })
    if (!res.ok) {
      setRerunError(res.error)
      setBusy(false)
      return
    }
    router.push('/homework/batches/' + res.data.batchId)
  }

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="md:col-span-2 space-y-3">
        {items.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            추출된 항목이 없습니다. 아래에서 수동으로 추가하세요.
          </Card>
        ) : (
          items.map((it) => (
            <Card key={it.id} className={cn('p-4 space-y-3', it.similar && 'ring-2 ring-amber-300/60')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-medium',
                      it.source === 'ai' ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {it.source === 'ai' ? 'AI 추출' : '수동 추가'}
                  </span>
                  {it.similar && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-800 border border-amber-300">
                      ⚠️ 유사 항목 있음 ({Math.round(it.similar.score * 100)}%)
                    </span>
                  )}
                </div>
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

              {it.similar && (
                <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2 space-y-0.5">
                  <div className="font-medium">이미 등록된 비슷한 항목:</div>
                  <div className="break-words">
                    “{it.similar.title}”
                    {it.similar.dueDate && <span className="text-muted-foreground"> · ~{it.similar.dueDate}</span>}
                    {it.similar.doneAt && <span className="text-green-700"> · ✓ 완료됨</span>}
                  </div>
                  <div className="text-muted-foreground/80">중복이면 삭제, 다른 거면 그대로 두세요.</div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor={`title-${it.id}`} className="text-xs text-muted-foreground">
                  숙제 내용
                </Label>
                <Textarea
                  id={`title-${it.id}`}
                  value={it.title}
                  onChange={(e) => patchLocal(it.id, { title: e.target.value })}
                  onBlur={(e) => persist(it.id, { title: e.target.value })}
                  rows={2}
                  className="resize-y"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`notes-${it.id}`} className="text-xs text-muted-foreground">
                  상세 메모 <span className="text-muted-foreground/60">(책 이름, 단원, 페이지, 분량 등)</span>
                </Label>
                <Textarea
                  id={`notes-${it.id}`}
                  value={it.notes ?? ''}
                  placeholder="예: 수학익힘책 7단원, p.45-52, 30문제, 오답노트 정리"
                  onChange={(e) => patchLocal(it.id, { notes: e.target.value })}
                  onBlur={(e) => persist(it.id, { notes: e.target.value || null })}
                  rows={3}
                  className="resize-y"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`due-${it.id}`} className="text-xs text-muted-foreground">
                  마감일
                </Label>
                <Input
                  id={`due-${it.id}`}
                  type="date"
                  value={it.dueDate ?? ''}
                  onChange={(e) => {
                    const v = e.target.value || null
                    patchLocal(it.id, { dueDate: v })
                    persist(it.id, { dueDate: v })
                  }}
                  className="w-44"
                />
              </div>
            </Card>
          ))
        )}

        <Card className="p-4 space-y-3 border-dashed">
          <div className="text-xs font-medium text-muted-foreground">+ 수동 추가</div>
          <div className="space-y-1.5">
            <Label htmlFor="new-title" className="text-xs text-muted-foreground">숙제 내용</Label>
            <Textarea
              id="new-title"
              placeholder="예: 수학익힘책 p.20-30 풀기"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              rows={2}
              className="resize-y"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-notes" className="text-xs text-muted-foreground">상세 메모 (선택)</Label>
            <Textarea
              id="new-notes"
              placeholder="책 이름, 단원, 분량 등"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              rows={2}
              className="resize-y"
            />
          </div>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-due" className="text-xs text-muted-foreground">마감일</Label>
              <Input
                id="new-due"
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                className="w-44"
              />
            </div>
            <Button type="button" onClick={add} variant="secondary" disabled={!newTitle.trim()}>
              추가
            </Button>
          </div>
        </Card>

        <Button onClick={commit} disabled={busy || items.length === 0} className="w-full">
          {busy ? '확정 중…' : `✅ ${items.length}개 항목 확정`}
        </Button>

        <details className="group">
          <summary className="cursor-pointer select-none text-sm text-muted-foreground hover:text-foreground list-none flex items-center gap-1">
            <span className="group-open:hidden">▶</span>
            <span className="hidden group-open:inline">▼</span>
            추출 결과가 이상한가요?
          </summary>
          <Card className="mt-2 p-4 space-y-3 border-dashed">
            <p className="text-xs text-muted-foreground">
              힌트를 수정해서 다시 추출할 수 있어요. 이전 batch와 항목은 그대로 보존되고 새 batch가 생성됩니다.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="rerun-hint" className="text-xs text-muted-foreground">AI 추출 힌트</Label>
              <Textarea
                id="rerun-hint"
                placeholder="예: 수학 숙제 알림장, 날짜와 과목명 포함"
                value={newHint}
                onChange={(e) => setNewHint(e.target.value)}
                rows={3}
                className="resize-y"
              />
            </div>
            <p className="text-xs text-muted-foreground">모델 변경은 설정 페이지에서</p>
            {rerunError && <p className="text-xs text-destructive">{rerunError}</p>}
            <Button type="button" onClick={rerun} disabled={busy} variant="secondary" className="w-full">
              🔁 다시 추출
            </Button>
          </Card>
        </details>
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

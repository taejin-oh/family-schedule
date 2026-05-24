'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { uploadHomework } from '@/server/actions/homework'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type Academy = { id: number; name: string; color: string; extractionHint: string | null }

export function UploadForm({ academies }: { academies: Academy[] }) {
  const router = useRouter()
  const [academyId, setAcademyId] = useState<number | null>(
    academies.length === 1 ? academies[0].id : null
  )
  const [hint, setHint] = useState<string>(
    academies.length === 1 ? (academies[0].extractionHint ?? '') : ''
  )
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // When user picks a different academy, prefill hint from that academy's default
  useEffect(() => {
    if (academyId === null) return
    const academy = academies.find((a) => a.id === academyId)
    setHint(academy?.extractionHint ?? '')
  }, [academyId, academies])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!academyId) { setError('학원을 선택하세요.'); return }
    if (files.length === 0) { setError('파일을 1장 이상 추가하세요.'); return }
    setBusy(true); setError(null)
    const res = await uploadHomework({ academyId, files, userHint: hint || null })
    if (!res.ok) { setError(res.error); setBusy(false); return }
    router.push(`/homework/batches/${res.data.batchId}`)
  }

  function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
    return `${Math.round(bytes / 1024)}KB`
  }

  function iconFor(file: File): string {
    if (file.type === 'application/pdf') return '📄'
    return '🖼️'
  }

  if (academies.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground space-y-3">
        <p>먼저 학원을 등록해야 합니다.</p>
        <Button onClick={() => router.push('/academies/new')}>학원 등록하러 가기</Button>
      </Card>
    )
  }

  const selectedAcademy = academies.find((a) => a.id === academyId)
  const hasAcademyDefault = !!selectedAcademy?.extractionHint

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-2">
          <Label>학원</Label>
          <div className="grid grid-cols-2 gap-2">
            {academies.map((a) => {
              const selected = academyId === a.id
              return (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => setAcademyId(a.id)}
                  className={cn(
                    'p-3 rounded-md border bg-card text-left flex items-center gap-2 transition-colors',
                    selected ? 'border-foreground ring-2 ring-foreground' : 'hover:bg-accent'
                  )}
                >
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: a.color }} />
                  <span className="font-medium truncate">{a.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="photos">파일 (사진 또는 PDF, 1개 이상)</Label>
          <input
            id="photos"
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-secondary file:text-secondary-foreground file:font-medium hover:file:bg-accent file:cursor-pointer"
          />
          {files.length > 0 && (
            <div className="text-sm text-muted-foreground">
              {files.length}개 선택됨
              <ul className="mt-1 space-y-0.5 text-xs">
                {files.slice(0, 5).map((f, i) => (
                  <li key={i} className="truncate">
                    {iconFor(f)} {f.name} <span className="text-muted-foreground/70">({formatSize(f.size)})</span>
                  </li>
                ))}
                {files.length > 5 && <li>… 외 {files.length - 5}개</li>}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="hint">
            AI 추출 힌트 (선택)
            {hasAcademyDefault && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                · 학원 기본값 적용됨 (이 업로드만 수정 가능)
              </span>
            )}
          </Label>
          <Textarea
            id="hint"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="예: 'Lesson topics' 열은 수업 토픽이라 무시. 오른쪽 'Homework' 열만 숙제. 맨 위 파란 바탕은 책 이름."
            rows={3}
            className="resize-y text-sm"
          />
          <p className="text-xs text-muted-foreground">
            없어도 AI가 알아서 숙제와 수업 안내를 구분함. 힌트가 있으면 더 정확함.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? '업로드 중…' : '업로드 후 분석'}
        </Button>
      </form>
    </Card>
  )
}

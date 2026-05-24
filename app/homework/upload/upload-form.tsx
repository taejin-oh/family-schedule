'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { uploadHomework } from '@/server/actions/homework'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type Academy = { id: number; name: string; color: string }

export function UploadForm({ academies }: { academies: Academy[] }) {
  const router = useRouter()
  const [academyId, setAcademyId] = useState<number | null>(academies.length === 1 ? academies[0].id : null)
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!academyId) { setError('학원을 선택하세요.'); return }
    if (files.length === 0) { setError('사진을 1장 이상 추가하세요.'); return }
    setBusy(true); setError(null)
    const res = await uploadHomework({ academyId, files })
    if (!res.ok) { setError(res.error); setBusy(false); return }
    router.push(`/homework/batches/${res.data.batchId}`)
  }

  if (academies.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground space-y-3">
        <p>먼저 학원을 등록해야 합니다.</p>
        <Button asChild={false} onClick={() => router.push('/academies/new')}>학원 등록하러 가기</Button>
      </Card>
    )
  }

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
          <Label htmlFor="photos">사진 (1장 이상)</Label>
          <input
            id="photos"
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-secondary file:text-secondary-foreground file:font-medium hover:file:bg-accent file:cursor-pointer"
          />
          {files.length > 0 && (
            <div className="text-sm text-muted-foreground">
              {files.length}장 선택됨
              <ul className="mt-1 list-disc list-inside text-xs">
                {files.slice(0, 5).map((f, i) => <li key={i} className="truncate">{f.name} ({Math.round(f.size / 1024)}KB)</li>)}
                {files.length > 5 && <li>… 외 {files.length - 5}장</li>}
              </ul>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? '업로드 중…' : '업로드 후 분석'}
        </Button>
      </form>
    </Card>
  )
}

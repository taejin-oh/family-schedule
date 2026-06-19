'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { setHomeworkScore, type HomeworkScore } from '@/server/actions/homework'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

const SCORES: HomeworkScore[] = ['상', '중', '하']

type ScoreSheetCtx = { open: (itemId: number, itemTitle: string) => void }
const Context = createContext<ScoreSheetCtx | null>(null)

/** 완료 후 점수 시트를 띄우는 훅. Provider 밖이면 null → 시트 없이 완료만. */
export function useScoreSheet() {
  return useContext(Context)
}

/**
 * 페이지 상단에 한 번만 두는 점수 시트 Provider.
 *
 * 완료(toggleItemDone)는 revalidatePath로 라우트를 새로고침해 완료된 항목 컴포넌트를
 * 언마운트시킨다. 시트를 항목별로 두면 그때 같이 언마운트돼 안 보인다. 그래서 시트를
 * 트리 상단(Provider)에 두어 새로고침에도 살아남게 한다 — 클라이언트 상태는 router
 * 새로고침을 가로질러 보존된다.
 */
export function ScoreSheetProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [target, setTarget] = useState<{ id: number; title: string } | null>(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)

  const open = (itemId: number, itemTitle: string) => {
    setReason('')
    setTarget({ id: itemId, title: itemTitle })
  }
  function close() {
    setTarget(null)
    setReason('')
    // 완료된 항목을 완료 목록으로 이동 + (점수 매겼으면) 칩 반영.
    router.refresh()
  }
  async function pick(s: HomeworkScore) {
    if (!target) return
    setPending(true)
    await setHomeworkScore(target.id, s, reason.trim() || null)
    setPending(false)
    close()
  }

  return (
    <Context.Provider value={{ open }}>
      {children}
      <Sheet open={target !== null} onOpenChange={(o) => { if (!o) close() }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>완료! 점수를 매길까요?</SheetTitle>
          </SheetHeader>
          <div className="text-sm text-muted-foreground mt-1 line-clamp-2 break-words">{target?.title}</div>
          <div className="flex gap-2 mt-4">
            {SCORES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={pending}
                onClick={() => pick(s)}
                className="flex-1 py-3 rounded-xl border text-lg font-bold bg-card hover:bg-accent active:bg-accent/70 transition-colors disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="이유(선택) — 점수 누르기 전에 입력"
            className="w-full mt-3 text-sm px-3 py-2 rounded-lg border bg-background"
          />
          <Button variant="ghost" className="w-full mt-3" onClick={close} disabled={pending}>
            건너뛰기
          </Button>
        </SheetContent>
      </Sheet>
    </Context.Provider>
  )
}

import { getSettings, updateSettings, listProviderOptions } from '@/server/actions/settings'
import {
  getStickerState,
  setActiveReward,
  addManualStamp,
  removeManualStamp,
  listRedemptions,
} from '@/server/actions/stickers'
import { getCleanupStats, runManualCleanup } from '@/server/actions/cleanup'
import { CLEANUP_CONFIG } from '@/server/util/batch-cleanup'
import { revalidatePath } from 'next/cache'
import { Card } from '@/components/ui/card'
import { TelegramTestButton } from './_components/telegram-test-button'
import { CleanupSection } from './_components/cleanup-section'

const fieldCls =
  'w-full bg-muted rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20'
const smallFieldCls =
  'bg-muted rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20'

export default async function SettingsPage() {
  const s = await getSettings()
  const providers = await listProviderOptions()
  const stickers = await getStickerState()
  const redemptions = await listRedemptions()
  const cleanupStats = await getCleanupStats()

  async function runCleanup() {
    'use server'
    return runManualCleanup()
  }

  async function save(formData: FormData) {
    'use server'
    const res = await updateSettings({
      visionProvider: String(formData.get('provider')),
      visionModel: String(formData.get('model')),
      telegramEnabled: formData.get('telegramEnabled') === 'on',
      telegramMorningEnabled: formData.get('telegramMorningEnabled') === 'on',
      telegramMorningTime: String(formData.get('telegramMorningTime') || '07:00'),
      telegramEveningEnabled: formData.get('telegramEveningEnabled') === 'on',
      telegramEveningTime: String(formData.get('telegramEveningTime') || '21:00'),
      telegramMiddayEnabled: formData.get('telegramMiddayEnabled') === 'on',
      telegramMiddayTime: String(formData.get('telegramMiddayTime') || '12:00'),
    })
    if (!res.ok) throw new Error(res.error ?? '저장 실패')
    revalidatePath('/admin/settings')
  }

  async function saveReward(formData: FormData) {
    'use server'
    const name = String(formData.get('name') ?? '').trim()
    const emoji = String(formData.get('emoji') ?? '🎁').trim() || '🎁'
    const target = Number(formData.get('targetCount') ?? 10)
    const res = await setActiveReward({ name, emoji, targetCount: target })
    if (!res.ok) throw new Error(res.error)
    revalidatePath('/admin/settings')
    revalidatePath('/')
  }

  async function addBonus(formData: FormData) {
    'use server'
    const notes = String(formData.get('notes') ?? '').trim()
    await addManualStamp(notes || undefined)
    revalidatePath('/admin/settings')
    revalidatePath('/')
  }

  async function removeStamp(formData: FormData) {
    'use server'
    const id = Number(formData.get('id'))
    const res = await removeManualStamp(id)
    if (!res.ok) throw new Error(res.error)
    revalidatePath('/admin/settings')
    revalidatePath('/')
  }

  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1">
        <h1 className="text-[30px] leading-tight font-bold tracking-tight">설정</h1>
        <p className="text-sm text-muted-foreground mt-0.5">앱 환경 · 보상 · 알림</p>
      </header>

      {/* 🎁 스티커 보상 */}
      <Card className="p-4 gap-3">
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          🎁 스티커 보상
        </h2>
        <p className="text-xs text-muted-foreground -mt-1">
          매일 오늘 할일을 다 끝내면 스티커 1개. 목표 개수에 도달하면 보상.
        </p>

        <form action={saveReward} className="space-y-2">
          <div className="flex gap-2">
            <input
              name="emoji"
              defaultValue={stickers.reward?.emoji ?? '🎁'}
              className={`${smallFieldCls} w-16 text-center`}
              aria-label="이모지"
            />
            <input
              name="name"
              defaultValue={stickers.reward?.name ?? ''}
              placeholder="보상 이름 (예: 새 보드게임)"
              className={`${smallFieldCls} flex-1`}
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">목표 스티커 수</span>
            <input
              name="targetCount"
              type="number"
              min={1}
              max={365}
              defaultValue={stickers.reward?.targetCount ?? 10}
              className={`${smallFieldCls} w-20 text-right`}
            />
          </label>
          <button
            type="submit"
            className="bg-foreground text-background text-sm font-semibold rounded-lg px-3 py-1.5 hover:opacity-90 transition-opacity"
          >
            보상 저장
          </button>
        </form>

        <div className="border-t border-foreground/10 pt-3">
          <div className="text-sm">
            현재 모은 스티커:{' '}
            <span className="font-bold text-lg tabular-nums">{stickers.count}</span>
            {stickers.target != null && (
              <span className="text-muted-foreground"> / {stickers.target}</span>
            )}
          </div>
          {stickers.stamps.length > 0 && (
            <ul className="text-xs space-y-1 mt-2 mb-2 max-h-32 overflow-auto">
              {stickers.stamps.map((st) => (
                <li key={st.id} className="flex items-center gap-2">
                  <span className="text-amber-500">★</span>
                  <span className="text-muted-foreground">
                    {st.kind === 'auto'
                      ? `자동 · ${st.forDate}`
                      : `보너스${st.notes ? ` · ${st.notes}` : ''}`}
                  </span>
                  {st.kind === 'manual' && (
                    <form action={removeStamp} className="inline">
                      <input type="hidden" name="id" value={st.id} />
                      <button
                        type="submit"
                        className="text-destructive hover:underline text-xs ml-auto"
                      >
                        지우기
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form action={addBonus} className="flex gap-2 mt-2">
            <input
              name="notes"
              placeholder="보너스 사유 (선택)"
              className={`${smallFieldCls} flex-1`}
            />
            <button
              type="submit"
              className="bg-emerald-600 text-white text-sm font-semibold rounded-lg px-3 py-1.5 hover:bg-emerald-700 transition-colors"
            >
              + 보너스
            </button>
          </form>
        </div>

        {redemptions.length > 0 && (
          <div className="border-t border-foreground/10 pt-3">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              받은 보상 이력
            </h3>
            <ul className="text-sm space-y-1 max-h-40 overflow-auto">
              {redemptions.map((r) => (
                <li key={r.id} className="flex items-baseline gap-2">
                  <span>{r.rewardEmoji}</span>
                  <span className="font-medium">{r.rewardName}</span>
                  <span className="text-xs text-muted-foreground">
                    · {new Date(r.redeemedAt).toLocaleDateString('ko-KR')} · {r.targetCount}개
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* 📦 업로드 정리 */}
      <Card className="p-4 gap-3">
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          📦 업로드 정리
        </h2>
        <p className="text-xs text-muted-foreground -mt-1 leading-relaxed">
          모든 숙제가 완료된 batch는 마지막 완료로부터{' '}
          <strong>{CLEANUP_CONFIG.ARCHIVE_AFTER_DAYS}일</strong> 후 보관 처리되고, 보관 후{' '}
          <strong>{CLEANUP_CONFIG.PHOTOS_DELETE_AFTER_DAYS}일</strong>이 지나면 사진만 삭제됩니다(기록은 유지).
          실패/대기 batch는 <strong>{CLEANUP_CONFIG.FAILED_DELETE_AFTER_DAYS}일</strong> 후 전체 삭제.
        </p>
        <CleanupSection stats={cleanupStats} onRun={runCleanup} />
      </Card>

      {/* AI provider + Telegram */}
      <Card className="p-4 gap-3">
        <form action={save} className="contents">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            🤖 AI 추출
          </h2>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Vision Provider</span>
            <select name="provider" defaultValue={s.visionProvider} className={fieldCls}>
              {providers.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Model</span>
            <select name="model" defaultValue={s.visionModel} className={fieldCls}>
              {providers.flatMap((p) => p.models.map((m) => (
                <option key={`${p.name}/${m}`} value={m}>{p.name} · {m}</option>
              )))}
            </select>
          </label>

          <hr className="border-foreground/10" />

          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            📱 텔레그램 다이제스트
          </h2>
          <p className="text-xs text-muted-foreground -mt-1">
            TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 환경변수가 설정되어 있어야 발송됩니다.
          </p>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="telegramEnabled"
              defaultChecked={s.telegramEnabled ?? false}
              className="h-4 w-4 accent-foreground"
            />
            <span className="font-medium">다이제스트 발송 사용</span>
          </label>

          <div className="space-y-2 pl-2">
            {[
              { key: 'Morning', label: '아침', timeKey: 'telegramMorningTime', defTime: '07:00', enabledKey: 'telegramMorningEnabled', enabledVal: s.telegramMorningEnabled ?? true },
              { key: 'Midday',  label: '점심', timeKey: 'telegramMiddayTime',  defTime: '12:00', enabledKey: 'telegramMiddayEnabled',  enabledVal: s.telegramMiddayEnabled ?? true },
              { key: 'Evening', label: '저녁', timeKey: 'telegramEveningTime', defTime: '21:00', enabledKey: 'telegramEveningEnabled', enabledVal: s.telegramEveningEnabled ?? true },
            ].map((row) => (
              <div key={row.key} className="flex items-center gap-3">
                <label className="flex items-center gap-2 min-w-[80px] text-sm">
                  <input
                    type="checkbox"
                    name={row.enabledKey}
                    defaultChecked={row.enabledVal}
                    className="h-4 w-4 accent-foreground"
                  />
                  <span>{row.label}</span>
                </label>
                <input
                  type="time"
                  name={row.timeKey}
                  defaultValue={(s[row.timeKey as keyof typeof s] as string | null) ?? row.defTime}
                  className={smallFieldCls}
                />
              </div>
            ))}
          </div>

          <button
            type="submit"
            className="bg-foreground text-background text-sm font-semibold rounded-lg px-3 py-2 hover:opacity-90 transition-opacity w-fit"
          >
            저장
          </button>
        </form>
      </Card>

      {/* Telegram test */}
      <Card className="p-4 gap-2">
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          텔레그램 연결 테스트
        </h2>
        <TelegramTestButton />
      </Card>

      <p className="text-xs text-muted-foreground px-1">
        Phase 0에서는 Claude만 구현되어 있어. Codex/Gemini provider는 Phase 1에서 추가.
      </p>
    </div>
  )
}

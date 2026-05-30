import { getSettings, updateSettings, listProviderOptions } from '@/server/actions/settings'
import {
  getStickerState,
  setActiveReward,
  addManualStamp,
  removeStamp as removeStampAction,
  listRedemptions,
} from '@/server/actions/stickers'
import { getCleanupStats, runManualCleanup } from '@/server/actions/cleanup'
import { CLEANUP_CONFIG } from '@/server/util/batch-cleanup'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { TelegramTestButton } from './_components/telegram-test-button'
import { CleanupSection } from './_components/cleanup-section'
import { SaveForm } from './_components/save-form'
import { ThemePicker } from './_components/theme-picker'

// 모바일 16px(text-base)/데스크톱 14px(md:text-sm). Android Chrome은 16px 미만 입력
// 포커스 시 화면을 auto-zoom하고 blur 후에도 복원하지 않음 → 키보드 닫아도 확대 유지 버그.
// 앱의 다른 입력(ui/input, ui/textarea, academy-form)이 쓰는 동일 컨벤션으로 맞춤.
const fieldCls =
  'w-full bg-muted rounded-lg px-3 py-2 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20'
const smallFieldCls =
  'bg-muted rounded-lg px-2.5 py-1.5 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20'

export default async function SettingsPage() {
  // 5개 독립 fetch를 병렬화. sequential await 시 RTT가 5배 누적됐음.
  const [s, providers, stickers, redemptions, cleanupStats] = await Promise.all([
    getSettings(),
    listProviderOptions(),
    getStickerState(),
    listRedemptions(),
    getCleanupStats(),
  ])

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
      telegramAcademyReminderEnabled: formData.get('telegramAcademyReminderEnabled') === 'on',
      telegramAcademyReminderMinutes: Number(formData.get('telegramAcademyReminderMinutes') || 10),
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
    const res = await removeStampAction(id)
    if (!res.ok) throw new Error(res.error)
    revalidatePath('/admin/settings')
    revalidatePath('/')
  }

  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1">
        <h1 className="text-[30px] leading-tight font-bold tracking-tight">설정</h1>
        <p className="text-sm text-muted-foreground mt-0.5">앱 환경 · 색 테마 · 보상 · 알림</p>
      </header>

      {/* 🎨 색 테마 */}
      <Card className="p-4 gap-3">
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          🎨 색 테마
        </h2>
        <p className="text-xs text-muted-foreground -mt-1">
          앱 전체 색감을 고르세요. 선택 즉시 모든 화면에 적용됩니다.
        </p>
        <ThemePicker current={(s.theme === 'warm' ? 'warm' : 'clarity')} />
      </Card>

      {/* 🎁 스티커 보상 */}
      <Card className="p-4 gap-3">
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          🎁 스티커 보상
        </h2>
        <p className="text-xs text-muted-foreground -mt-1">
          매일 오늘 할일을 다 끝내면 스티커 1개. 목표 개수에 도달하면 보상.
        </p>

        <SaveForm
          action={saveReward}
          submitLabel="보상 저장"
          className="space-y-2"
        >
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
        </SaveForm>

        <div className="border-t border-foreground/10 pt-3">
          <div className="text-sm">
            현재 모은 스티커:{' '}
            <span className="font-bold text-lg tabular-nums">{stickers.count}</span>
            {stickers.target != null && (
              <span className="text-muted-foreground"> / {stickers.target}</span>
            )}
          </div>
          {stickers.stamps.length > 0 && (
            <>
              <ul className="text-xs space-y-1 mt-2 mb-1">
                {[...stickers.stamps].reverse().slice(0, 5).map((st) => (
                  <li key={st.id} className="flex items-center gap-2">
                    <span className="text-reward">★</span>
                    <span className="text-muted-foreground">
                      {st.kind === 'auto'
                        ? `자동 · ${st.forDate}`
                        : `보너스${st.notes ? ` · ${st.notes}` : ''}`}
                    </span>
                    <form action={removeStamp} className="inline ml-auto">
                      <input type="hidden" name="id" value={st.id} />
                      <button
                        type="submit"
                        className="text-destructive hover:underline text-xs"
                      >
                        지우기
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
              <Link
                href="/admin/stickers/history"
                className="text-xs text-primary hover:underline mb-2 inline-block"
              >
                전체 보기 ({stickers.stamps.length}) →
              </Link>
            </>
          )}
          <form action={addBonus} className="flex gap-2 mt-2">
            <input
              name="notes"
              placeholder="보너스 사유 (선택)"
              className={`${smallFieldCls} flex-1`}
            />
            <button
              type="submit"
              className="bg-good text-white text-sm font-semibold rounded-lg px-3 py-1.5 hover:bg-good/90 transition-colors"
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
            <ul className="text-sm space-y-1">
              {redemptions.slice(0, 3).map((r) => (
                <li key={r.id} className="flex items-baseline gap-2">
                  <span>{r.rewardEmoji}</span>
                  <span className="font-medium">{r.rewardName}</span>
                  <span className="text-xs text-muted-foreground">
                    · {new Date(r.redeemedAt).toLocaleDateString('ko-KR')} · {r.targetCount}개
                  </span>
                </li>
              ))}
            </ul>
            {redemptions.length > 3 && (
              <Link
                href="/admin/stickers/history"
                className="text-xs text-primary hover:underline mt-2 inline-block"
              >
                전체 보기 ({redemptions.length}) →
              </Link>
            )}
          </div>
        )}
      </Card>

      {/* 💬 오늘 끝 카피 — 별도 페이지로 진입 */}
      <Card className="p-4 gap-2">
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          💬 오늘 끝 카피
        </h2>
        <p className="text-xs text-muted-foreground -mt-1 leading-relaxed">
          아이 홈에서 “오늘 할 일이 없어요” 메시지가 매일 다른 카피로 보입니다. 직접 추가·수정하거나 기본값으로 복원할 수 있어요.
        </p>
        <Link
          href="/admin/empty-states"
          className="text-sm font-medium text-primary hover:underline self-start"
        >
          카피 관리하기 →
        </Link>
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
        <SaveForm
          action={save}
          submitLabel="저장"
          className="contents"
          buttonBaseClassName="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-3 py-2 transition-colors w-fit"
        >
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
            📱 텔레그램 알림
          </h2>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="telegramEnabled"
              defaultChecked={s.telegramEnabled ?? false}
              className="h-4 w-4 accent-foreground"
            />
            <span className="font-medium">알림 전체 켜기</span>
            <span className="text-xs text-muted-foreground">— 휴가 등 일시 정지용. 끄면 아래 다이제스트·학원 알림 모두 발송 안 됨.</span>
          </label>

          {/* === 다이제스트 (예약 시각에 자동 발송) === */}
          <div className="border-t border-foreground/10 pt-3 space-y-2">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              ⏰ 예약 다이제스트
            </h3>
            <p className="text-xs text-muted-foreground -mt-1 leading-relaxed">
              <b>아침</b>: 어제까지 마감 + 오늘까지 끝낼 거 (내일 마감 포함) + 이번 주 진행률 + 오늘 학원<br />
              <b>저녁 (브리핑)</b>: 오늘 다녀온 학원 + 완료/미완료 + 제안 + 내일 마감
            </p>
            <div className="space-y-2 pl-2">
              {[
                { key: 'Morning', label: '아침', timeKey: 'telegramMorningTime', defTime: '07:00', enabledKey: 'telegramMorningEnabled', enabledVal: s.telegramMorningEnabled ?? true },
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
          </div>

          {/* === 학원 ±N분 알림 === */}
          <div className="border-t border-foreground/10 pt-3 space-y-2">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              🔔 학원 시작/종료 알림
            </h3>
            <p className="text-xs text-muted-foreground -mt-1 leading-relaxed">
              학원 시간표(`/timetable`)에 등록된 모든 학원의 <b>시작 N분 전</b>과 <b>종료 N분 전</b>에 자동 발송.
              학교처럼 매일 일과는 빼고 싶으면 해당 학원을 보관하거나 schedule rule을 비워주세요.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="telegramAcademyReminderEnabled"
                defaultChecked={s.telegramAcademyReminderEnabled ?? true}
                className="h-4 w-4 accent-foreground"
              />
              <span className="font-medium">학원 알림 사용</span>
            </label>
            <label className="flex items-center gap-2 text-sm pl-2">
              <span className="min-w-[80px]">몇 분 전</span>
              <input
                type="number"
                name="telegramAcademyReminderMinutes"
                defaultValue={s.telegramAcademyReminderMinutes ?? 10}
                min={1}
                max={60}
                className={smallFieldCls}
              />
              <span className="text-xs text-muted-foreground">분 (1~60)</span>
            </label>
          </div>

        </SaveForm>
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

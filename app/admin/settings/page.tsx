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
import { TelegramTestButton } from './_components/telegram-test-button'
import { CleanupSection } from './_components/cleanup-section'

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
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">설정</h1>

      <section className="bg-white p-4 rounded border space-y-3">
        <h2 className="text-base font-semibold">🎁 스티커 보상</h2>
        <p className="text-xs text-gray-500">
          매일 오늘 할일을 다 끝내면 스티커 1개가 자동으로 쌓여요. 목표 개수에 도달하면 보상을 줄 수 있어요.
        </p>

        <form action={saveReward} className="space-y-2">
          <div className="flex gap-2">
            <input
              name="emoji"
              defaultValue={stickers.reward?.emoji ?? '🎁'}
              className="border rounded px-2 py-1 w-16 text-center"
              aria-label="이모지"
            />
            <input
              name="name"
              defaultValue={stickers.reward?.name ?? ''}
              placeholder="보상 이름 (예: 새 보드게임)"
              className="flex-1 border rounded px-2 py-1"
              required
            />
          </div>
          <label className="flex items-center gap-2">
            <span className="text-sm">목표 스티커 수</span>
            <input
              name="targetCount"
              type="number"
              min={1}
              max={365}
              defaultValue={stickers.reward?.targetCount ?? 10}
              className="border rounded px-2 py-1 w-20 text-right"
            />
          </label>
          <button type="submit" className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm">
            보상 저장
          </button>
        </form>

        <div className="border-t pt-3">
          <div className="text-sm mb-2">
            현재 모은 스티커: <span className="font-bold text-lg">{stickers.count}</span>
            {stickers.target != null && (
              <span className="text-gray-500"> / {stickers.target}</span>
            )}
          </div>
          {stickers.stamps.length > 0 && (
            <ul className="text-xs space-y-1 mb-2 max-h-32 overflow-auto">
              {stickers.stamps.map((st) => (
                <li key={st.id} className="flex items-center gap-2">
                  <span>⭐</span>
                  <span className="text-gray-600">
                    {st.kind === 'auto'
                      ? `자동 · ${st.forDate}`
                      : `보너스${st.notes ? ` · ${st.notes}` : ''}`}
                  </span>
                  {st.kind === 'manual' && (
                    <form action={removeStamp} className="inline">
                      <input type="hidden" name="id" value={st.id} />
                      <button type="submit" className="text-red-600 hover:underline text-xs">
                        지우기
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form action={addBonus} className="flex gap-2">
            <input
              name="notes"
              placeholder="보너스 사유 (선택)"
              className="flex-1 border rounded px-2 py-1 text-sm"
            />
            <button type="submit" className="bg-emerald-600 text-white px-3 py-1.5 rounded text-sm">
              + 보너스
            </button>
          </form>
        </div>

        {redemptions.length > 0 && (
          <div className="border-t pt-3">
            <h3 className="text-sm font-semibold mb-2">받은 보상 이력</h3>
            <ul className="text-sm space-y-1 max-h-40 overflow-auto">
              {redemptions.map((r) => (
                <li key={r.id} className="flex items-baseline gap-2">
                  <span>{r.rewardEmoji}</span>
                  <span className="font-medium">{r.rewardName}</span>
                  <span className="text-xs text-gray-500">
                    · {new Date(r.redeemedAt).toLocaleDateString('ko-KR')} · {r.targetCount}개
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="bg-white p-4 rounded border space-y-3">
        <h2 className="text-base font-semibold">📦 업로드 정리</h2>
        <p className="text-xs text-gray-500 leading-relaxed">
          모든 숙제가 완료된 batch는 마지막 완료로부터 <strong>{CLEANUP_CONFIG.ARCHIVE_AFTER_DAYS}일</strong> 후 보관 처리되고,
          보관 후 <strong>{CLEANUP_CONFIG.PHOTOS_DELETE_AFTER_DAYS}일</strong>이 지나면 사진만 삭제돼요(기록은 유지).
          실패/대기 중인 batch는 <strong>{CLEANUP_CONFIG.FAILED_DELETE_AFTER_DAYS}일</strong> 후 전체 삭제됩니다.
        </p>
        <CleanupSection stats={cleanupStats} onRun={runCleanup} />
      </section>

      <form action={save} className="bg-white p-4 rounded border space-y-3">
        <label className="block">
          <div className="text-sm mb-1">Vision Provider</div>
          <select name="provider" defaultValue={s.visionProvider} className="w-full border rounded px-2 py-1.5">
            {providers.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
        </label>
        <label className="block">
          <div className="text-sm mb-1">Model</div>
          <select name="model" defaultValue={s.visionModel} className="w-full border rounded px-2 py-1.5">
            {providers.flatMap((p) => p.models.map((m) => (
              <option key={`${p.name}/${m}`} value={m}>{p.name} · {m}</option>
            )))}
          </select>
        </label>

        <hr className="border-gray-200" />

        <div>
          <div className="text-sm font-medium mb-2">텔레그램 다이제스트</div>
          <p className="text-xs text-gray-500 mb-3">
            TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 환경변수가 설정되어 있어야 발송됩니다.
            봇을 가족 그룹에 추가 후 그룹의 chat_id를 확인하세요.
          </p>

          <label className="flex items-center gap-2 mb-3">
            <input type="checkbox" name="telegramEnabled" defaultChecked={s.telegramEnabled ?? false} />
            <span className="text-sm">다이제스트 발송 사용</span>
          </label>

          <div className="space-y-2 pl-2">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 min-w-[80px]">
                <input type="checkbox" name="telegramMorningEnabled" defaultChecked={s.telegramMorningEnabled ?? true} />
                <span className="text-sm">아침</span>
              </label>
              <input
                type="time"
                name="telegramMorningTime"
                defaultValue={s.telegramMorningTime ?? '07:00'}
                className="border rounded px-2 py-1 text-sm"
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 min-w-[80px]">
                <input type="checkbox" name="telegramMiddayEnabled" defaultChecked={s.telegramMiddayEnabled ?? true} />
                <span className="text-sm">점심</span>
              </label>
              <input
                type="time"
                name="telegramMiddayTime"
                defaultValue={s.telegramMiddayTime ?? '12:00'}
                className="border rounded px-2 py-1 text-sm"
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 min-w-[80px]">
                <input type="checkbox" name="telegramEveningEnabled" defaultChecked={s.telegramEveningEnabled ?? true} />
                <span className="text-sm">저녁</span>
              </label>
              <input
                type="time"
                name="telegramEveningTime"
                defaultValue={s.telegramEveningTime ?? '21:00'}
                className="border rounded px-2 py-1 text-sm"
              />
            </div>
          </div>
        </div>

        <button className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm">저장</button>
      </form>

      <div className="bg-white p-4 rounded border">
        <div className="text-sm font-medium mb-2">텔레그램 연결 테스트</div>
        <TelegramTestButton />
      </div>

      <p className="text-xs text-gray-500">
        Phase 0에서는 Claude만 구현되어 있어. Codex/Gemini provider는 Phase 1에서 추가.
      </p>
    </div>
  )
}

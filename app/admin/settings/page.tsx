import { getSettings, updateSettings, listProviderOptions } from '@/server/actions/settings'
import { revalidatePath } from 'next/cache'
import { TelegramTestButton } from './_components/telegram-test-button'

export default async function SettingsPage() {
  const s = await getSettings()
  const providers = await listProviderOptions()

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

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">설정</h1>
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

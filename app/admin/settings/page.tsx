import { getSettings, updateSettings, listProviderOptions } from '@/server/actions/settings'
import { revalidatePath } from 'next/cache'

export default async function SettingsPage() {
  const s = await getSettings()
  const providers = await listProviderOptions()
  async function save(formData: FormData) {
    'use server'
    const res = await updateSettings({
      visionProvider: String(formData.get('provider')),
      visionModel: String(formData.get('model')),
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
        <button className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm">저장</button>
      </form>
      <p className="text-xs text-gray-500">
        Phase 0에서는 Claude만 구현되어 있어. Codex/Gemini provider는 Phase 1에서 추가.
      </p>
    </div>
  )
}

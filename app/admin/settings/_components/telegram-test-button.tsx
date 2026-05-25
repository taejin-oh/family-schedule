'use client'

import { useState } from 'react'
import { sendTestTelegram } from '@/server/actions/settings'

export function TelegramTestButton() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle')
  const [reason, setReason] = useState('')

  async function handleClick() {
    setStatus('sending')
    try {
      const res = await sendTestTelegram()
      if (res.ok) {
        setStatus('ok')
      } else {
        setStatus('fail')
        setReason(res.reason ?? '알 수 없는 오류')
      }
    } catch {
      setStatus('fail')
      setReason('네트워크 오류')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'sending'}
        className="border border-gray-300 px-2 py-1 rounded text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {status === 'sending' ? '발송 중…' : '테스트 발송'}
      </button>
      {status === 'ok' && <span className="text-xs text-green-600">발송 완료</span>}
      {status === 'fail' && <span className="text-xs text-red-600">실패: {reason}</span>}
    </div>
  )
}

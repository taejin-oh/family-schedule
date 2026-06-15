import { redirect } from 'next/navigation'

// 부모 관리(할 일) 화면은 이제 홈(`/`)이다. 예전 `/dashboard` 북마크/PWA 호환용 리다이렉트.
// force-dynamic: 프리렌더되면 meta-refresh 200 shell이 되어버려서, 매 요청마다
// 서버에서 redirect()를 실행해 정상 HTTP 리다이렉트(307)를 내도록 강제한다.
export const dynamic = 'force-dynamic'

export default function DashboardRedirect() {
  redirect('/')
}

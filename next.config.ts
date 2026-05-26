import type { NextConfig } from 'next'

const config: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '20mb' },
  },
  // Allow cross-origin requests during dev (Server Actions + HMR WebSocket).
  // Without LAN IP / .local entries, PC clients hitting the host directly are
  // rejected as cross-origin even though they're on the same network.
  allowedDevOrigins: [
    'selene-mac.tail033535.ts.net',
    '*.tail033535.ts.net',
    '192.168.219.157',
    'Taejinui-Macmini.local',
    '*.local',
  ],
  // dev mode로 운영하는 Phase 0에서 phone 접근 시 'N' dev indicator가
  // bottom nav '홈' 버튼 위에 겹쳤다. Next.js는 indicator를 꺼도 compile/
  // runtime error 토스트는 그대로 표시하므로 진단에 영향 없음.
  devIndicators: false,
}

export default config

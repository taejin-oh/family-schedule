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
}

export default config

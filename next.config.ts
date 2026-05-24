import type { NextConfig } from 'next'

const config: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '20mb' },
  },
  // Allow cross-origin requests from the Tailscale hostname during dev.
  // Server Actions enforce origin checking; without this, requests forwarded
  // through Tailscale Serve from selene-mac.tail033535.ts.net are rejected.
  allowedDevOrigins: [
    'selene-mac.tail033535.ts.net',
    '*.tail033535.ts.net',
  ],
}

export default config

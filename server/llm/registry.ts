import type { VisionProvider } from './types'
import { ClaudeCliProvider } from './claude-cli'

const PROVIDERS: Record<string, () => VisionProvider> = {
  claude: () => new ClaudeCliProvider(),
}

export function getProvider(name: string): VisionProvider {
  const factory = PROVIDERS[name]
  if (!factory) throw new Error(`Unknown provider "${name}". Known: ${Object.keys(PROVIDERS).join(', ')}`)
  return factory()
}

export function availableProviderNames(): string[] {
  return Object.keys(PROVIDERS)
}

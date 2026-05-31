import type { VisionProvider } from './types'
import { ClaudeCliProvider } from './claude-cli'
import { CodexProvider } from './codex'

const PROVIDERS: Record<string, () => VisionProvider> = {
  // codex(ChatGPT Plus, gpt-5.5) = 풀해상도 1순위 품질 경로.
  codex: () => new CodexProvider(),
  // claude(opus-4-8) = fallback/escalation (Anthropic subprocess 전용).
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

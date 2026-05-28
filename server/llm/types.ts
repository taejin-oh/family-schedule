export type DraftItem = {
  title: string
  dueDate: string | null   // 'YYYY-MM-DD'
  notes?: string
  confidence?: number       // 0~1, optional
  confidenceReason?: string // confidence < 0.7일 때 짧은 이유 (한국어 1줄)
  sourcePhotoIndex?: number // 0-based index into the imagePaths array
}

export type AcademyContext = {
  name: string
  subject: string
  nextSessionAt: Date | null
}

export type ExtractInput = {
  imagePaths: string[]
  academy: AcademyContext
  userHint?: string | null    // 부모가 학원 종이 구조를 설명하는 힌트
  model?: string
  timeoutMs?: number
}

export type ExtractOutput = {
  items: DraftItem[]
  rawResponse: string
  modelUsed: string
}

export interface VisionProvider {
  readonly name: 'claude' | 'codex' | 'gemini'
  readonly defaultModel: string
  readonly availableModels: readonly string[]
  extractHomework(input: ExtractInput): Promise<ExtractOutput>
}

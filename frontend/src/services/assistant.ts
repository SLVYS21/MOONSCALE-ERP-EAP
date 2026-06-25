import api from './api'

export type LlmProviderName = 'groq' | 'gemini' | 'anthropic'

export interface ProviderChoice {
  provider: LlmProviderName
  model: string
}

export interface BusinessHours {
  enabled: boolean
  startTime: string
  endTime: string
  days: number[]
  aiOffDuringHours: boolean
}

export interface AssistantConfig {
  _id: string
  key: string
  aiMasterEnabled: boolean
  systemPrompt: string
  primary: ProviderChoice
  fallback: ProviderChoice | null
  temperature: number
  maxTokens: number
  languages: string[]
  businessHours: BusinessHours
  contextWindow: number
  createdAt: string
  updatedAt: string
}

export const MODELS_BY_PROVIDER: Record<LlmProviderName, { label: string; value: string }[]> = {
  groq: [
    { label: 'Qwen 2.5 32B (fast, cheap)', value: 'qwen-2.5-32b' },
    { label: 'Qwen 2.5 72B', value: 'qwen-2.5-72b' },
    { label: 'Qwen QwQ 32B (reasoning)', value: 'qwen-qwq-32b' },
    { label: 'Llama 3.3 70B', value: 'llama-3.3-70b-versatile' },
    { label: 'Llama 3.1 8B (very cheap)', value: 'llama-3.1-8b-instant' },
  ],
  gemini: [
    { label: 'Gemini 2.5 Flash (recommended prod)', value: 'gemini-2.5-flash' },
    { label: 'Gemini 2.5 Flash Lite (cheapest)', value: 'gemini-2.5-flash-lite' },
    { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
  ],
  anthropic: [
    { label: 'Claude Haiku 4.5 (fallback prod)', value: 'claude-haiku-4-5-20251001' },
    { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
    { label: 'Claude Opus 4.7', value: 'claude-opus-4-7' },
  ],
}

export interface KnowledgeDoc {
  _id: string
  name: string
  type: 'pdf' | 'txt' | 'md' | 'image'
  url: string
  bytes: number
  chunkCount: number
  isAlwaysIncluded: boolean
  status: 'pending' | 'processing' | 'ready' | 'failed'
  errorMessage: string | null
  language: 'fr' | 'en' | 'mixed'
  createdAt: string
}

export const assistantApi = {
  getConfig() {
    return api.get<AssistantConfig>('/assistant/config').then((r) => r.data)
  },
  updateConfig(patch: Partial<AssistantConfig>) {
    return api.patch<AssistantConfig>('/assistant/config', patch).then((r) => r.data)
  },
  listKb() {
    return api.get<KnowledgeDoc[]>('/assistant/kb').then((r) => r.data)
  },
  uploadKb(file: File, isAlwaysIncluded: boolean) {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('isAlwaysIncluded', String(isAlwaysIncluded))
    return api.post<KnowledgeDoc>('/assistant/kb', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
  },
  updateKb(id: string, patch: { isAlwaysIncluded?: boolean }) {
    return api.patch<KnowledgeDoc>(`/assistant/kb/${id}`, patch).then((r) => r.data)
  },
  deleteKb(id: string) {
    return api.delete(`/assistant/kb/${id}`).then((r) => r.data)
  },
}

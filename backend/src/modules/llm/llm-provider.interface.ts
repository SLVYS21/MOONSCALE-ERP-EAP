export type LlmRole = 'system' | 'user' | 'assistant' | 'tool'

export interface LlmToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface LlmMessage {
  role: LlmRole
  content: string
  toolCalls?: LlmToolCall[]
  toolCallId?: string
  toolName?: string
}

export interface ToolParameterSchema {
  type: 'object'
  properties: Record<string, { type: string; description?: string; enum?: string[] }>
  required?: string[]
}

export interface ToolDef {
  name: string
  description: string
  parameters: ToolParameterSchema
}

export interface LlmGenerateOptions {
  messages: LlmMessage[]
  model: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  tools?: ToolDef[]
}

export interface LlmGenerateResult {
  text: string
  toolCalls: LlmToolCall[]
  tokensIn: number
  tokensOut: number
  costUsd: number
  provider: string
  model: string
  fallbackUsed: boolean
  latencyMs: number
  finishReason: 'stop' | 'tool_calls' | 'length' | 'other'
}

export interface ILlmProvider {
  readonly name: string
  generate(opts: LlmGenerateOptions): Promise<Omit<LlmGenerateResult, 'fallbackUsed'>>
}

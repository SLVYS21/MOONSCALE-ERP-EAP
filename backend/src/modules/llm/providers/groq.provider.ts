import { Injectable, Logger } from '@nestjs/common'
import Groq from 'groq-sdk'
import { randomUUID } from 'crypto'
import type { ILlmProvider, LlmGenerateOptions, LlmGenerateResult, LlmToolCall, ToolDef } from '../llm-provider.interface'
import { estimateCost } from '../pricing'

function buildOpenAiTools(tools?: ToolDef[]) {
  if (!tools?.length) return undefined
  return tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters as any },
  }))
}

@Injectable()
export class GroqProvider implements ILlmProvider {
  readonly name = 'groq'
  private readonly logger = new Logger(GroqProvider.name)
  private readonly client: Groq | null

  constructor() {
    const apiKey = process.env.GROQ_API_KEY
    this.client = apiKey ? new Groq({ apiKey }) : null
    if (!this.client) this.logger.warn('GROQ_API_KEY not set — GroqProvider.generate() will throw.')
  }

  async generate(opts: LlmGenerateOptions): Promise<Omit<LlmGenerateResult, 'fallbackUsed'>> {
    if (!this.client) throw new Error('Groq not configured')

    const oaiMessages: any[] = []
    if (opts.systemPrompt) oaiMessages.push({ role: 'system', content: opts.systemPrompt })
    for (const m of opts.messages) {
      if (m.role === 'tool') {
        oaiMessages.push({ role: 'tool', tool_call_id: m.toolCallId, name: m.toolName, content: m.content })
      } else if (m.role === 'assistant' && m.toolCalls?.length) {
        oaiMessages.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.args) },
          })),
        })
      } else {
        oaiMessages.push({ role: m.role, content: m.content })
      }
    }

    const t0 = Date.now()
    const res = await this.client.chat.completions.create({
      model: opts.model,
      messages: oaiMessages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 800,
      tools: buildOpenAiTools(opts.tools),
    })
    const latencyMs = Date.now() - t0

    const choice = res.choices[0]
    const text = choice?.message?.content ?? ''
    const tokensIn = res.usage?.prompt_tokens ?? 0
    const tokensOut = res.usage?.completion_tokens ?? 0
    const costUsd = estimateCost(opts.model, tokensIn, tokensOut)

    const toolCalls: LlmToolCall[] = (choice?.message?.tool_calls ?? []).map((tc: any) => {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(tc.function?.arguments ?? '{}') } catch { /* ignore */ }
      return { id: tc.id ?? randomUUID(), name: tc.function?.name ?? '', args }
    })

    const finishRaw = choice?.finish_reason
    const finishReason = finishRaw === 'tool_calls' ? 'tool_calls'
      : finishRaw === 'length' ? 'length'
      : finishRaw === 'stop' ? 'stop'
      : 'other'

    return { text, toolCalls, tokensIn, tokensOut, costUsd, provider: this.name, model: opts.model, latencyMs, finishReason }
  }
}

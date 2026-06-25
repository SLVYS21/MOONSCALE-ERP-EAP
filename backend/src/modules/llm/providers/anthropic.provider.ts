import { Injectable, Logger } from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'
import type { ILlmProvider, LlmGenerateOptions, LlmGenerateResult, LlmToolCall, ToolDef } from '../llm-provider.interface'
import { estimateCost } from '../pricing'

function buildAnthropicTools(tools?: ToolDef[]) {
  if (!tools?.length) return undefined
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as any,
  }))
}

@Injectable()
export class AnthropicProvider implements ILlmProvider {
  readonly name = 'anthropic'
  private readonly logger = new Logger(AnthropicProvider.name)
  private readonly client: Anthropic | null

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY
    this.client = apiKey ? new Anthropic({ apiKey }) : null
    if (!this.client) this.logger.warn('ANTHROPIC_API_KEY not set — AnthropicProvider.generate() will throw.')
  }

  async generate(opts: LlmGenerateOptions): Promise<Omit<LlmGenerateResult, 'fallbackUsed'>> {
    if (!this.client) throw new Error('Anthropic not configured')

    // Convert messages: tool messages → tool_result content blocks within user messages
    const anthMessages: any[] = []
    for (const m of opts.messages) {
      if (m.role === 'tool') {
        anthMessages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }],
        })
      } else if (m.role === 'assistant' && m.toolCalls?.length) {
        const blocks: any[] = []
        if (m.content) blocks.push({ type: 'text', text: m.content })
        for (const tc of m.toolCalls) {
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args })
        }
        anthMessages.push({ role: 'assistant', content: blocks })
      } else if (m.role === 'assistant') {
        anthMessages.push({ role: 'assistant', content: m.content })
      } else if (m.role === 'user') {
        anthMessages.push({ role: 'user', content: m.content })
      }
    }

    const t0 = Date.now()
    const res = await this.client.messages.create({
      model: opts.model,
      system: opts.systemPrompt,
      messages: anthMessages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 800,
      tools: buildAnthropicTools(opts.tools),
    })
    const latencyMs = Date.now() - t0

    let text = ''
    const toolCalls: LlmToolCall[] = []
    for (const block of res.content) {
      if (block.type === 'text') text += block.text
      if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, name: block.name, args: (block.input ?? {}) as Record<string, unknown> })
      }
    }

    const tokensIn = res.usage?.input_tokens ?? 0
    const tokensOut = res.usage?.output_tokens ?? 0
    const costUsd = estimateCost(opts.model, tokensIn, tokensOut)

    const finishReason = res.stop_reason === 'tool_use' ? 'tool_calls'
      : res.stop_reason === 'max_tokens' ? 'length'
      : res.stop_reason === 'end_turn' ? 'stop'
      : 'other'

    return { text, toolCalls, tokensIn, tokensOut, costUsd, provider: this.name, model: opts.model, latencyMs, finishReason }
  }
}

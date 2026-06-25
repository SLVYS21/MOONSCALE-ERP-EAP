import { Injectable, Logger } from '@nestjs/common'
import { GoogleGenAI } from '@google/genai'
import { randomUUID } from 'crypto'
import type { ILlmProvider, LlmGenerateOptions, LlmGenerateResult, LlmToolCall, ToolDef } from '../llm-provider.interface'
import { estimateCost } from '../pricing'

function buildGeminiTools(tools?: ToolDef[]) {
  if (!tools?.length) return undefined
  return [{
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters as any,
    })),
  }]
}

@Injectable()
export class GeminiProvider implements ILlmProvider {
  readonly name = 'gemini'
  private readonly logger = new Logger(GeminiProvider.name)
  private readonly client: GoogleGenAI | null

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null
    if (!this.client) this.logger.warn('GEMINI_API_KEY not set — GeminiProvider.generate() will throw.')
  }

  async generate(opts: LlmGenerateOptions): Promise<Omit<LlmGenerateResult, 'fallbackUsed'>> {
    if (!this.client) throw new Error('Gemini not configured')

    // Convert messages to Gemini contents format
    const contents: any[] = []
    for (const m of opts.messages) {
      if (m.role === 'tool') {
        contents.push({
          role: 'user',
          parts: [{ functionResponse: { name: m.toolName, response: { result: m.content } } }],
        })
      } else if (m.role === 'assistant') {
        const parts: any[] = []
        if (m.content) parts.push({ text: m.content })
        if (m.toolCalls?.length) {
          for (const tc of m.toolCalls) parts.push({ functionCall: { name: tc.name, args: tc.args } })
        }
        contents.push({ role: 'model', parts: parts.length > 0 ? parts : [{ text: '' }] })
      } else {
        contents.push({ role: 'user', parts: [{ text: m.content }] })
      }
    }

    const t0 = Date.now()
    const res = await this.client.models.generateContent({
      model: opts.model,
      contents,
      config: {
        systemInstruction: opts.systemPrompt,
        temperature: opts.temperature ?? 0.7,
        maxOutputTokens: opts.maxTokens ?? 800,
        tools: buildGeminiTools(opts.tools),
      },
    })
    const latencyMs = Date.now() - t0

    let text = ''
    const toolCalls: LlmToolCall[] = []
    const cand = res.candidates?.[0]
    if (cand?.content?.parts) {
      for (const part of cand.content.parts) {
        if ('text' in part && part.text) text += part.text
        if ('functionCall' in part && part.functionCall) {
          toolCalls.push({
            id: randomUUID(),
            name: part.functionCall.name ?? '',
            args: (part.functionCall.args ?? {}) as Record<string, unknown>,
          })
        }
      }
    }

    const tokensIn = res.usageMetadata?.promptTokenCount ?? 0
    const tokensOut = res.usageMetadata?.candidatesTokenCount ?? 0
    const costUsd = estimateCost(opts.model, tokensIn, tokensOut)

    const finishReason = toolCalls.length > 0 ? 'tool_calls'
      : cand?.finishReason === 'MAX_TOKENS' ? 'length'
      : cand?.finishReason === 'STOP' ? 'stop'
      : 'other'

    return { text, toolCalls, tokensIn, tokensOut, costUsd, provider: this.name, model: opts.model, latencyMs, finishReason }
  }
}

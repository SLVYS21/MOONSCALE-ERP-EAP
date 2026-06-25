import { Injectable, Logger } from '@nestjs/common'
import { GroqProvider } from './providers/groq.provider'
import { GeminiProvider } from './providers/gemini.provider'
import { AnthropicProvider } from './providers/anthropic.provider'
import type { ILlmProvider, LlmGenerateOptions, LlmGenerateResult } from './llm-provider.interface'

export type LlmProviderName = 'groq' | 'gemini' | 'anthropic'

export interface ProviderModelChoice {
  provider: LlmProviderName
  model: string
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name)
  private readonly providers: Record<LlmProviderName, ILlmProvider>

  constructor(
    private readonly groq: GroqProvider,
    private readonly gemini: GeminiProvider,
    private readonly anthropic: AnthropicProvider,
  ) {
    this.providers = { groq, gemini, anthropic }
  }

  /**
   * Generate with primary provider, fallback to fallbackProvider on error.
   * If only one is given, no fallback.
   */
  async generate(
    primary: ProviderModelChoice,
    opts: Omit<LlmGenerateOptions, 'model'>,
    fallback?: ProviderModelChoice,
  ): Promise<LlmGenerateResult> {
    const primaryProvider = this.providers[primary.provider]

    try {
      const r = await primaryProvider.generate({ ...opts, model: primary.model })
      return { ...r, fallbackUsed: false }
    } catch (err) {
      this.logger.warn(`Primary provider ${primary.provider} failed: ${(err as Error).message}`)
      if (!fallback) throw err

      const fallbackProvider = this.providers[fallback.provider]
      const r = await fallbackProvider.generate({ ...opts, model: fallback.model })
      return { ...r, fallbackUsed: true }
    }
  }
}

export type { LlmGenerateResult } from './llm-provider.interface'

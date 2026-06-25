import { Module } from '@nestjs/common'
import { GroqProvider } from './providers/groq.provider'
import { GeminiProvider } from './providers/gemini.provider'
import { AnthropicProvider } from './providers/anthropic.provider'
import { LlmService } from './llm.service'

@Module({
  providers: [GroqProvider, GeminiProvider, AnthropicProvider, LlmService],
  exports: [LlmService],
})
export class LlmModule {}

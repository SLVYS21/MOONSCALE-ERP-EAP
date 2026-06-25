// Prices in USD per 1M tokens. Update when providers change pricing.
export const LLM_PRICING: Record<string, { in: number; out: number }> = {
  // Groq
  'qwen-2.5-32b': { in: 0.29, out: 0.39 },
  'qwen-2.5-72b': { in: 0.79, out: 0.79 },
  'qwen-qwq-32b': { in: 0.29, out: 0.39 },
  'llama-3.3-70b-versatile': { in: 0.59, out: 0.79 },
  'llama-3.1-8b-instant': { in: 0.05, out: 0.08 },

  // Gemini
  'gemini-2.5-flash': { in: 0.075, out: 0.30 },
  'gemini-2.5-flash-lite': { in: 0.04, out: 0.15 },
  'gemini-2.5-pro': { in: 1.25, out: 5.00 },

  // Anthropic
  'claude-haiku-4-5-20251001': { in: 1.0, out: 5.0 },
  'claude-sonnet-4-6': { in: 3.0, out: 15.0 },
  'claude-opus-4-7': { in: 15.0, out: 75.0 },
}

export function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  const p = LLM_PRICING[model]
  if (!p) return 0
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000
}

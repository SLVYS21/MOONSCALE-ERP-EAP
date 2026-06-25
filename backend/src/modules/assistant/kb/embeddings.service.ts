import { Injectable, Logger } from '@nestjs/common'
import { GoogleGenAI } from '@google/genai'

const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? 'text-embedding-004'

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name)
  private readonly client: GoogleGenAI | null

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null
    if (!this.client) this.logger.warn('GEMINI_API_KEY not set — embeddings will be empty (no RAG).')
  }

  get available(): boolean {
    return this.client !== null
  }

  async embedOne(text: string): Promise<number[]> {
    if (!this.client) return []
    const res = await this.client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
    })
    return res.embeddings?.[0]?.values ?? []
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (!this.client) return texts.map(() => [])
    const out: number[][] = []
    // The SDK accepts batch; if it fails on a chunk we degrade to per-item to keep going
    try {
      const res = await this.client.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: texts,
      })
      for (const e of res.embeddings ?? []) out.push(e.values ?? [])
      if (out.length === texts.length) return out
    } catch (err) {
      this.logger.warn(`Batch embed failed, falling back to per-item: ${(err as Error).message}`)
    }
    out.length = 0
    for (const t of texts) {
      try { out.push(await this.embedOne(t)) }
      catch { out.push([]) }
    }
    return out
  }

  static cosine(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0
    let dot = 0, na = 0, nb = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      na += a[i] * a[i]
      nb += b[i] * b[i]
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb)
    return denom === 0 ? 0 : dot / denom
  }
}

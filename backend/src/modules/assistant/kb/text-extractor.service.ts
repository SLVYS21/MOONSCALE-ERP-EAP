import { Injectable, Logger } from '@nestjs/common'
import pdfParse from 'pdf-parse'
import { GoogleGenAI } from '@google/genai'
import type { KnowledgeDocType } from '../schemas/knowledge-document.schema'

@Injectable()
export class TextExtractorService {
  private readonly logger = new Logger(TextExtractorService.name)
  private readonly gemini: GoogleGenAI | null

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY
    this.gemini = apiKey ? new GoogleGenAI({ apiKey }) : null
  }

  detectType(filename: string, mimetype: string): KnowledgeDocType | null {
    const lower = filename.toLowerCase()
    if (lower.endsWith('.pdf') || mimetype === 'application/pdf') return 'pdf'
    if (lower.endsWith('.txt') || mimetype === 'text/plain') return 'txt'
    if (lower.endsWith('.md') || lower.endsWith('.markdown') || mimetype === 'text/markdown') return 'md'
    if (mimetype.startsWith('image/')) return 'image'
    return null
  }

  async extract(buffer: Buffer, type: KnowledgeDocType, mimetype?: string): Promise<string> {
    switch (type) {
      case 'pdf': {
        const res = {text: ""} //await this.pdfParse(buffer) //await pdfParse(buffer)
        return (res?.text ?? '').trim()
      }
      case 'txt':
      case 'md':
        return buffer.toString('utf-8').trim()
      case 'image': {
        if (!this.gemini) throw new Error('Gemini API key required for image OCR')
        const res = await this.gemini.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{
            role: 'user',
            parts: [
              { text: "Décris brièvement le contenu de cette image puis transcris fidèlement tout texte visible. Format Markdown." },
              { inlineData: { mimeType: mimetype ?? 'image/png', data: buffer.toString('base64') } },
            ],
          }],
          config: { temperature: 0.1, maxOutputTokens: 2000 },
        })
        return (res.text ?? '').trim()
      }
    }
  }

  /**
   * Naive chunker: ~chunkSize chars with overlap. Splits on paragraph boundaries when possible.
   */
  chunk(text: string, chunkSize = 1800, overlap = 200): string[] {
    if (!text) return []
    const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    if (cleaned.length <= chunkSize) return [cleaned]

    const chunks: string[] = []
    let i = 0
    while (i < cleaned.length) {
      let end = Math.min(i + chunkSize, cleaned.length)
      if (end < cleaned.length) {
        const nextParaBreak = cleaned.lastIndexOf('\n\n', end)
        const nextLineBreak = cleaned.lastIndexOf('\n', end)
        const nextSentBreak = cleaned.lastIndexOf('. ', end)
        const breakPoint = Math.max(nextParaBreak, nextLineBreak, nextSentBreak)
        if (breakPoint > i + chunkSize / 2) end = breakPoint + 1
      }
      chunks.push(cleaned.slice(i, end).trim())
      i = Math.max(end - overlap, i + 1)
    }
    return chunks.filter((c) => c.length > 20)
  }
}

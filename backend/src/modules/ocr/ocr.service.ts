import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Groq from 'groq-sdk'
import axios from 'axios'
import * as _pdfParseModule from 'pdf-parse'
const pdfParse = _pdfParseModule as unknown as (buf: Buffer) => Promise<{ text: string; numpages: number }>

export interface OcrImageResult {
  imageUrl: string
  extractedAmount: number | null
  extractedCurrency: string | null
  transactionDate: string | null
  transactionId: string | null
  sender: string | null
  paymentService: string | null
  rawText: string
  error: string | null
}

interface QueueTask {
  imageUrl: string
  resolve: (r: OcrImageResult) => void
  reject: (e: Error) => void
}

const RATE_MS = 2100     // 28 req/min par clé
const MAX_RETRIES = 3    // tentatives après 429

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf.slice(0, 4).toString('ascii') === '%PDF'
}

// Trouve le premier objet JSON valide dans une chaîne (robuste aux trailing content)
function extractJson(raw: string): unknown | null {
  // Strip markdown code fences ```json ... ```
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()) } catch { /* continue */ }
  }

  // Trouver premier { puis tester en remontant depuis le dernier }
  const start = raw.indexOf('{')
  if (start === -1) return null

  let end = raw.lastIndexOf('}')
  while (end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1))
    } catch {
      end = raw.lastIndexOf('}', end - 1)
    }
  }
  return null
}

// Parse le délai depuis un message 429 Groq : "Please try again in 6m33.984s" ou "in 45.2s"
function parseRetryAfterMs(message: string): number {
  const minSec = message.match(/(\d+)m([\d.]+)s/)
  if (minSec) return (parseInt(minSec[1]) * 60 + parseFloat(minSec[2])) * 1000 + 500
  const sec = message.match(/in ([\d.]+)s/)
  if (sec) return parseFloat(sec[1]) * 1000 + 500
  return 60_000
}

const TEXT_PROMPT = (text: string) =>
  `Tu es un assistant spécialisé dans les reçus de paiement mobiles africains (Wave, Orange Money, MTN Mobile Money, FedaPay, Western Union, etc.).

Voici le texte extrait d'un reçu de paiement (PDF) :
---
${text.slice(0, 3000)}
---

Extrais les informations suivantes et réponds UNIQUEMENT avec un objet JSON valide, sans texte autour.

{
  "amount": <nombre ou null>,
  "currency": <"F CFA" | "XOF" | "EUR" | "USD" | null>,
  "date": <"YYYY-MM-DD" ou date lisible ou null>,
  "transactionId": <référence/ID de transaction ou null>,
  "sender": <nom ou numéro de l'expéditeur ou null>,
  "paymentService": <"Wave" | "Orange Money" | "MTN" | "FedaPay" | "Western Union" | "MoneyGram" | autre service ou null>,
  "rawText": <texte brut complet en une ligne>
}`

const IMAGE_PROMPT = `Tu es un assistant OCR spécialisé dans les reçus de paiement mobiles africains (Wave, Orange Money, MTN Mobile Money, FedaPay, Western Union, etc.).

Analyse cette image de reçu de paiement et extrais les informations suivantes.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour.

{
  "amount": <nombre ou null>,
  "currency": <"F CFA" | "XOF" | "EUR" | "USD" | null>,
  "date": <"YYYY-MM-DD" ou date lisible ou null>,
  "transactionId": <référence/ID de transaction ou null>,
  "sender": <nom ou numéro de l'expéditeur ou null>,
  "paymentService": <"Wave" | "Orange Money" | "MTN" | "FedaPay" | "Western Union" | "MoneyGram" | autre service ou null>,
  "rawText": <tout le texte visible sur l'image en une ligne>
}`

function buildResult(imageUrl: string, parsed: Record<string, unknown>): OcrImageResult {
  return {
    imageUrl,
    extractedAmount: typeof parsed.amount === 'number' ? parsed.amount : null,
    extractedCurrency: (parsed.currency as string) ?? null,
    transactionDate: (parsed.date as string) ?? null,
    transactionId: (parsed.transactionId as string) ?? null,
    sender: (parsed.sender as string) ?? null,
    paymentService: (parsed.paymentService as string) ?? null,
    rawText: (parsed.rawText as string) ?? '',
    error: null,
  }
}

class OcrWorker {
  busy = false
  private lastRunAt = 0

  constructor(private readonly client: Groq) {}

  async run(imageUrl: string): Promise<OcrImageResult> {
    const wait = RATE_MS - (Date.now() - this.lastRunAt)
    if (wait > 0) await sleep(wait)
    this.lastRunAt = Date.now()
    return this.analyze(imageUrl)
  }

  private async analyze(imageUrl: string, attempt = 0): Promise<OcrImageResult> {
    const base: Omit<OcrImageResult, 'error'> = {
      imageUrl,
      extractedAmount: null,
      extractedCurrency: null,
      transactionDate: null,
      transactionId: null,
      sender: null,
      paymentService: null,
      rawText: '',
    }

    // ── Télécharger le fichier ────────────────────────────────────────
    let fileBuffer: Buffer
    let mimeType = 'image/jpeg'
    try {
      const resp = await axios.get<ArrayBuffer>(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 60_000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      mimeType = ((resp.headers['content-type'] as string) ?? 'image/jpeg').split(';')[0].trim()
      fileBuffer = Buffer.from(resp.data)
    } catch (err: unknown) {
      return { ...base, error: `Téléchargement échoué: ${(err as Error).message}` }
    }

    // ── PDF : extraction texte → modèle texte ────────────────────────
    const isPdf = mimeType === 'application/pdf' || isPdfBuffer(fileBuffer)
    if (isPdf) {
      let pdfText = ''
      try {
        const parsed = await pdfParse(fileBuffer)
        pdfText = (parsed.text as string).trim()
      } catch (err: unknown) {
        return { ...base, error: `PDF illisible: ${(err as Error).message}` }
      }

      if (!pdfText) return { ...base, error: 'PDF sans texte extractible (scan image non supporté)' }

      try {
        const completion = await this.client.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: TEXT_PROMPT(pdfText) }],
          max_tokens: 400,
          temperature: 0,
        })
        const raw = completion.choices[0]?.message?.content ?? ''
        const obj = extractJson(raw)
        if (!obj) throw new Error(`Réponse non-JSON: ${raw.slice(0, 120)}`)
        return buildResult(imageUrl, obj as Record<string, unknown>)
      } catch (err: unknown) {
        const msg = (err as Error).message ?? ''
        if (msg.includes('429') && attempt < MAX_RETRIES) {
          const wait = parseRetryAfterMs(msg)
          await sleep(wait)
          return this.analyze(imageUrl, attempt + 1)
        }
        return { ...base, error: `Analyse PDF échouée: ${msg}` }
      }
    }

    // ── Image : vision ────────────────────────────────────────────────
    const base64 = fileBuffer.toString('base64')
    try {
      const completion = await this.client.chat.completions.create({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
              { type: 'text', text: IMAGE_PROMPT },
            ],
          },
        ],
        max_tokens: 500,
        temperature: 0,
      })
      const raw = completion.choices[0]?.message?.content ?? ''
      const obj = extractJson(raw)
      if (!obj) throw new Error(`Réponse non-JSON: ${raw.slice(0, 120)}`)
      return buildResult(imageUrl, obj as Record<string, unknown>)
    } catch (err: unknown) {
      const msg = (err as Error).message ?? ''
      if (msg.includes('429') && attempt < MAX_RETRIES) {
        const wait = parseRetryAfterMs(msg)
        await sleep(wait)
        this.lastRunAt = Date.now() // réinitialiser le rate limiter local
        return this.analyze(imageUrl, attempt + 1)
      }
      return { ...base, error: `Analyse échouée: ${msg}` }
    }
  }
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name)
  private readonly workers: OcrWorker[] = []
  private readonly queue: QueueTask[] = []

  constructor(private config: ConfigService) {
    const keys = this.collectKeys()
    this.workers = keys.map((k) => new OcrWorker(new Groq({ apiKey: k })))
    if (this.workers.length === 0) {
      this.logger.warn('Aucune clé GROQ configurée — OCR désactivé')
    } else {
      this.logger.log(`OCR pool prêt: ${this.workers.length} worker(s) × 28 req/min = ${this.workers.length * 28} req/min`)
    }
  }

  get isAvailable() { return this.workers.length > 0 }
  get workerCount() { return this.workers.length }

  analyzeImage(imageUrl: string): Promise<OcrImageResult> {
    if (!this.isAvailable) {
      return Promise.resolve({
        imageUrl,
        extractedAmount: null,
        extractedCurrency: null,
        transactionDate: null,
        transactionId: null,
        sender: null,
        paymentService: null,
        rawText: '',
        error: 'OCR non configuré (GROQ_API_KEY manquant)',
      })
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ imageUrl, resolve, reject })
      this.pump()
    })
  }

  async analyzeBatch(
    imageUrls: string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<OcrImageResult[]> {
    const results: OcrImageResult[] = []
    let done = 0
    await Promise.all(
      imageUrls.map(async (url) => {
        const result = await this.analyzeImage(url)
        results.push(result)
        done++
        onProgress?.(done, imageUrls.length)
      }),
    )
    return results
  }

  private pump() {
    for (const worker of this.workers) {
      if (worker.busy || this.queue.length === 0) continue
      const task = this.queue.shift()!
      worker.busy = true
      worker
        .run(task.imageUrl)
        .then(task.resolve)
        .catch(task.reject)
        .finally(() => {
          worker.busy = false
          this.pump()
        })
    }
  }

  private collectKeys(): string[] {
    const keys: string[] = []
    for (let i = 1; i <= 10; i++) {
      const k = this.config.get<string>(`GROQ_API_KEY_${i}`)
      if (k) keys.push(k)
    }
    if (keys.length === 0) {
      const single = this.config.get<string>('GROQ_API_KEY')
      if (single) keys.push(single)
    }
    return keys
  }
}

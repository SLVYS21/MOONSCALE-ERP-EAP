import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { createHash } from 'crypto'
import { KnowledgeDocument, KnowledgeDocumentDocument } from '../schemas/knowledge-document.schema'
import { KnowledgeChunk, KnowledgeChunkDocument } from '../schemas/knowledge-chunk.schema'
import { CloudinaryService } from '../../cloudinary/cloudinary.service'
import { TextExtractorService } from './text-extractor.service'
import { EmbeddingsService } from './embeddings.service'

export interface RetrievedChunk {
  documentId: string
  documentName: string
  text: string
  similarity: number
}

@Injectable()
export class KbService {
  private readonly logger = new Logger(KbService.name)

  constructor(
    @InjectModel(KnowledgeDocument.name) private readonly docModel: Model<KnowledgeDocumentDocument>,
    @InjectModel(KnowledgeChunk.name) private readonly chunkModel: Model<KnowledgeChunkDocument>,
    private readonly cloudinary: CloudinaryService,
    private readonly extractor: TextExtractorService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  async upload(file: Express.Multer.File, opts: { uploadedBy?: string; isAlwaysIncluded?: boolean } = {}): Promise<KnowledgeDocumentDocument> {
    if (!file) throw new BadRequestException('No file provided')
    const type = this.extractor.detectType(file.originalname, file.mimetype)
    if (!type) throw new BadRequestException(`Unsupported file type: ${file.mimetype} (${file.originalname})`)

    const hash = createHash('sha256').update(file.buffer).digest('hex')
    const existing = await this.docModel.findOne({ hash })
    if (existing) return existing

    let url: string
    let cloudinaryPublicId: string | null = null
    try {
      url = await this.cloudinary.upload(file.buffer, 'moonscale/kb')
    } catch (err) {
      throw new BadRequestException(`Cloudinary upload failed: ${(err as Error).message}`)
    }

    const doc = await this.docModel.create({
      name: file.originalname,
      type,
      url,
      cloudinaryPublicId,
      bytes: file.size,
      hash,
      status: 'processing',
      isAlwaysIncluded: opts.isAlwaysIncluded ?? false,
      uploadedBy: opts.uploadedBy ? new Types.ObjectId(opts.uploadedBy) : null,
    })

    // Async processing: extract + chunk + embed. Don't block the response on this.
    void this.processDocument(String(doc._id), file.buffer, type, file.mimetype).catch((err) => {
      this.logger.error(`KB processing failed for ${doc.name}: ${(err as Error).message}`)
      this.docModel.updateOne({ _id: doc._id }, { $set: { status: 'failed', errorMessage: (err as Error).message } }).catch(() => {})
    })

    return doc
  }

  private async processDocument(docId: string, buffer: Buffer, type: 'pdf' | 'txt' | 'md' | 'image', mimetype?: string) {
    const text = await this.extractor.extract(buffer, type, mimetype)
    if (!text || text.length < 10) {
      await this.docModel.updateOne({ _id: docId }, { $set: { status: 'failed', errorMessage: 'Empty extraction' } })
      return
    }

    const chunks = this.extractor.chunk(text)
    const embeddings = this.embeddings.available
      ? await this.embeddings.embedMany(chunks)
      : chunks.map(() => [])

    const doc = await this.docModel.findById(docId)
    if (!doc) return

    await this.chunkModel.deleteMany({ documentId: doc._id })
    await this.chunkModel.insertMany(
      chunks.map((c, i) => ({
        documentId: doc._id,
        documentName: doc.name,
        text: c,
        position: i,
        embedding: embeddings[i] ?? [],
        tokenEstimate: Math.ceil(c.length / 4),
      })),
    )

    await this.docModel.updateOne(
      { _id: doc._id },
      { $set: { extractedText: text, chunkCount: chunks.length, status: 'ready', errorMessage: null } },
    )
    this.logger.log(`KB processed: ${doc.name} (${chunks.length} chunks)`)
  }

  async list(): Promise<KnowledgeDocumentDocument[]> {
    return this.docModel.find().sort({ createdAt: -1 }).lean() as unknown as KnowledgeDocumentDocument[]
  }

  async delete(id: string): Promise<{ ok: true }> {
    const doc = await this.docModel.findById(id)
    if (!doc) throw new NotFoundException('Document not found')
    await this.chunkModel.deleteMany({ documentId: doc._id })
    if (doc.cloudinaryPublicId) await this.cloudinary.delete(doc.cloudinaryPublicId)
    await this.docModel.deleteOne({ _id: doc._id })
    return { ok: true }
  }

  async updateFlags(id: string, patch: { isAlwaysIncluded?: boolean }): Promise<KnowledgeDocumentDocument> {
    const doc = await this.docModel.findByIdAndUpdate(id, { $set: patch }, { new: true })
    if (!doc) throw new NotFoundException('Document not found')
    return doc
  }

  /**
   * Retrieves top-k chunks most similar to the query. Skips chunks without embeddings.
   * For RAG. Returns empty array if embeddings unavailable.
   */
  async retrieveTopK(query: string, k = 3, minScore = 0.3): Promise<RetrievedChunk[]> {
    if (!this.embeddings.available) return []
    const qVec = await this.embeddings.embedOne(query)
    if (qVec.length === 0) return []

    // Pull all chunks with embeddings. For larger KBs (>10k chunks) this needs Atlas Vector Search.
    const chunks = await this.chunkModel.find({ embedding: { $exists: true, $ne: [] } }).lean()
    const scored = chunks
      .map((c) => ({
        documentId: String(c.documentId),
        documentName: c.documentName,
        text: c.text,
        similarity: EmbeddingsService.cosine(qVec, c.embedding),
      }))
      .filter((s) => s.similarity >= minScore)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k)

    return scored
  }

  /**
   * Returns the concatenated text of all docs marked isAlwaysIncluded. Used for direct context injection.
   */
  async getAlwaysIncludedContext(maxChars = 8000): Promise<string> {
    const docs = await this.docModel.find({ isAlwaysIncluded: true, status: 'ready' }).lean()
    if (docs.length === 0) return ''
    const parts: string[] = []
    let used = 0
    for (const d of docs) {
      const t = (d.extractedText ?? '').slice(0, maxChars - used)
      if (t.length < 20) continue
      parts.push(`--- ${d.name} ---\n${t}`)
      used += t.length
      if (used >= maxChars) break
    }
    return parts.join('\n\n')
  }
}

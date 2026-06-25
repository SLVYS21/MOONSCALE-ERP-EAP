import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AssistantConfig, AssistantConfigSchema } from './schemas/assistant-config.schema'
import { KnowledgeDocument, KnowledgeDocumentSchema } from './schemas/knowledge-document.schema'
import { KnowledgeChunk, KnowledgeChunkSchema } from './schemas/knowledge-chunk.schema'
import { AssistantService } from './assistant.service'
import { AssistantController } from './assistant.controller'
import { KbController } from './kb/kb.controller'
import { KbService } from './kb/kb.service'
import { TextExtractorService } from './kb/text-extractor.service'
import { EmbeddingsService } from './kb/embeddings.service'
import { CloudinaryModule } from '../cloudinary/cloudinary.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AssistantConfig.name, schema: AssistantConfigSchema },
      { name: KnowledgeDocument.name, schema: KnowledgeDocumentSchema },
      { name: KnowledgeChunk.name, schema: KnowledgeChunkSchema },
    ]),
    CloudinaryModule,
  ],
  providers: [AssistantService, KbService, TextExtractorService, EmbeddingsService],
  controllers: [AssistantController, KbController],
  exports: [AssistantService, KbService],
})
export class AssistantModule {}

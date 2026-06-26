import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { LlmModule } from '../llm/llm.module'
import { ContentTrackingModule } from '../content-tracking/content-tracking.module'
import { ContentController } from './content.controller'
import { ContentService } from './content.service'
import { VideoProject, VideoProjectSchema } from './schemas/video-project.schema'
import { ContentCreator, ContentCreatorSchema } from './schemas/content-creator.schema'
import { ContentSuggestion, ContentSuggestionSchema } from './schemas/content-suggestion.schema'
import { ContentCapture, ContentCaptureSchema } from './schemas/content-capture.schema'

@Module({
  imports: [
    LlmModule,
    ContentTrackingModule,
    MongooseModule.forFeature([
      { name: VideoProject.name, schema: VideoProjectSchema },
      { name: ContentCreator.name, schema: ContentCreatorSchema },
      { name: ContentSuggestion.name, schema: ContentSuggestionSchema },
      { name: ContentCapture.name, schema: ContentCaptureSchema },
    ]),
  ],
  controllers: [ContentController],
  providers: [ContentService],
})
export class ContentModule {}

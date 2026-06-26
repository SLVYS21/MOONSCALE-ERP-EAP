import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { LlmModule } from '../llm/llm.module'
import { ContentTrackingController } from './content-tracking.controller'
import { ContentTrackingService } from './content-tracking.service'
import { YouTubeScraperService } from './scrapers/youtube-scraper.service'
import { TikTokScraperService } from './scrapers/tiktok-scraper.service'
import { DailyScrapeJob } from './jobs/daily-scrape.job'
import { TrackedAccount, TrackedAccountSchema } from './schemas/tracked-account.schema'
import { TrackedVideo, TrackedVideoSchema } from './schemas/tracked-video.schema'
import { VideoMetricsSnapshot, VideoMetricsSnapshotSchema } from './schemas/video-metrics-snapshot.schema'
import { DailyReport, DailyReportSchema } from './schemas/daily-report.schema'
import { CreatorAnalysis, CreatorAnalysisSchema } from './schemas/creator-analysis.schema'

@Module({
  imports: [
    LlmModule,
    MongooseModule.forFeature([
      { name: TrackedAccount.name, schema: TrackedAccountSchema },
      { name: TrackedVideo.name, schema: TrackedVideoSchema },
      { name: VideoMetricsSnapshot.name, schema: VideoMetricsSnapshotSchema },
      { name: DailyReport.name, schema: DailyReportSchema },
      { name: CreatorAnalysis.name, schema: CreatorAnalysisSchema },
    ]),
  ],
  controllers: [ContentTrackingController],
  providers: [
    ContentTrackingService,
    YouTubeScraperService,
    TikTokScraperService,
    DailyScrapeJob,
  ],
  exports: [ContentTrackingService],
})
export class ContentTrackingModule {}

import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AnalyticsController } from './analytics.controller'
import { AnalyticsService } from './analytics.service'
import { VideoStat, VideoStatSchema } from './schemas/video-stat.schema'
import { MetaAdsStat, MetaAdsStatSchema } from './schemas/meta-ads-stat.schema'
import { YouTubeConfig, YouTubeConfigSchema } from './schemas/youtube-config.schema'
import { LeadsModule } from '../leads/leads.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VideoStat.name, schema: VideoStatSchema },
      { name: MetaAdsStat.name, schema: MetaAdsStatSchema },
      { name: YouTubeConfig.name, schema: YouTubeConfigSchema },
    ]),
    LeadsModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}

import {
  Controller, Get, Post, Query, Res, UseGuards,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { AnalyticsService } from './analytics.service'

@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  // ── TikTok CSV import ───────────────────────────────────────────────────────

  @Post('tiktok/import')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  importTikTok(
    @UploadedFile() file: Express.Multer.File,
    @Query('date') date?: string,
  ) {
    if (!file) throw new BadRequestException('Fichier CSV requis')
    return this.analyticsService.importTikTokCsv(file.buffer, date)
  }

  // ── Meta Ads ────────────────────────────────────────────────────────────────

  @Post('meta/pull')
  @UseGuards(JwtAuthGuard)
  pullMeta(@Query('date') date?: string) {
    return this.analyticsService.pullMetaAds(date)
  }

  @Get('meta/stats')
  @UseGuards(JwtAuthGuard)
  getMetaStats(
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('campaign_id') campaignId?: string,
  ) {
    return this.analyticsService.getMetaStats(dateFrom, dateTo, campaignId)
  }

  // ── YouTube OAuth2 ──────────────────────────────────────────────────────────

  @Get('youtube/auth-url')
  @UseGuards(JwtAuthGuard)
  getYouTubeAuthUrl() {
    return { url: this.analyticsService.getYouTubeAuthUrl() }
  }

  // No auth guard — Google redirects here after OAuth consent
  @Get('youtube/callback')
  async youTubeCallback(@Query('code') code: string, @Res() res: Response) {
    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/analytics?yt_error=no_code`)
    }
    try {
      await this.analyticsService.handleYouTubeCallback(code)
      return res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/analytics?yt_connected=1`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'error'
      return res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/analytics?yt_error=${encodeURIComponent(msg)}`)
    }
  }

  @Post('youtube/pull')
  @UseGuards(JwtAuthGuard)
  pullYouTube(@Query('date') date?: string) {
    return this.analyticsService.pullYouTube(date)
  }

  @Get('youtube/stats')
  @UseGuards(JwtAuthGuard)
  getYouTubeStats(
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('video_id') videoId?: string,
  ) {
    return this.analyticsService.getYouTubeStats(dateFrom, dateTo, videoId)
  }

  @Get('youtube/config')
  @UseGuards(JwtAuthGuard)
  getYouTubeConfig() {
    return this.analyticsService.getYouTubeConfig()
  }

  // ── TikTok stats ────────────────────────────────────────────────────────────

  @Get('tiktok/stats')
  @UseGuards(JwtAuthGuard)
  getTikTokStats(
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('video_id') videoId?: string,
  ) {
    return this.analyticsService.getTikTokStats(dateFrom, dateTo, videoId)
  }

  // ── Correlation ─────────────────────────────────────────────────────────────

  @Get('correlation')
  @UseGuards(JwtAuthGuard)
  getCorrelation(
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('platform') platform?: string,
  ) {
    return this.analyticsService.getViewsLeadsCorrelation(dateFrom, dateTo, platform)
  }

  // ── Overview ────────────────────────────────────────────────────────────────

  @Get('overview')
  @UseGuards(JwtAuthGuard)
  getOverview(
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
  ) {
    return this.analyticsService.getOverview(dateFrom, dateTo)
  }
}

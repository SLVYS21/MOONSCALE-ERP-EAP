import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards, HttpCode, HttpStatus, Query,
} from '@nestjs/common'
import { IsOptional, IsString, IsBoolean, IsIn } from 'class-validator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import {
  ContentTrackingService,
  CreateTrackedAccountDto,
  UpdateTrackedAccountDto,
} from './content-tracking.service'
import type { UserDocument } from '../users/schemas/user.schema'
import type { TrackedPlatform, TrackedAccountType } from './schemas/tracked-account.schema'

class CreateAccountBody implements CreateTrackedAccountDto {
  @IsString() name: string
  @IsIn(['youtube', 'tiktok', 'facebook']) platform: TrackedPlatform
  @IsString() handle: string
  @IsOptional() @IsString() channel_url?: string
  @IsOptional() @IsIn(['own', 'competitor']) type?: TrackedAccountType
}

class UpdateAccountBody implements UpdateTrackedAccountDto {
  @IsOptional() @IsString() name?: string
  @IsOptional() @IsBoolean() is_active?: boolean
  @IsOptional() @IsString() channel_url?: string
}

class AnalyzeCreatorBody {
  @IsIn(['youtube', 'tiktok']) platform: 'youtube' | 'tiktok'
  @IsString() handle: string
}

@Controller('content/tracking')
@UseGuards(JwtAuthGuard)
export class ContentTrackingController {
  constructor(private readonly tracking: ContentTrackingService) {}

  @Get('accounts')
  listAccounts(@CurrentUser() user: UserDocument) {
    return this.tracking.listAccounts(String(user._id))
  }

  @Post('accounts')
  createAccount(@Body() body: CreateAccountBody, @CurrentUser() user: UserDocument) {
    return this.tracking.createAccount(body, String(user._id))
  }

  @Get('accounts/:id')
  getAccount(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.tracking.getAccount(id, String(user._id))
  }

  @Patch('accounts/:id')
  updateAccount(
    @Param('id') id: string,
    @Body() body: UpdateAccountBody,
    @CurrentUser() user: UserDocument,
  ) {
    return this.tracking.updateAccount(id, body, String(user._id))
  }

  @Delete('accounts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    await this.tracking.deleteAccount(id, String(user._id))
  }

  @Get('accounts/:id/videos')
  listVideos(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.tracking.listAccountVideos(id, String(user._id))
  }

  @Get('videos/:videoId')
  getVideo(@Param('videoId') videoId: string, @CurrentUser() user: UserDocument) {
    return this.tracking.getVideoWithHistory(videoId, String(user._id))
  }

  @Get('accounts/:id/reports')
  listReports(
    @Param('id') id: string,
    @CurrentUser() user: UserDocument,
    @Query('limit') limit?: string,
  ) {
    const lim = limit ? Number(limit) : 30
    return this.tracking.listReports(id, String(user._id), lim)
  }

  @Post('accounts/:id/scrape-now')
  scrapeNow(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.tracking.scrapeAccount(id, String(user._id))
  }

  @Post('accounts/:id/report-now')
  reportNow(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.tracking.generateDailyReport(id, String(user._id))
  }

  // ── On-demand creator analysis ─────────────────────────────────────────────

  @Post('analyze-creator')
  analyzeCreator(@Body() body: AnalyzeCreatorBody, @CurrentUser() user: UserDocument) {
    return this.tracking.analyzeCreator(String(user._id), body.platform, body.handle)
  }

  @Get('creator-analyses')
  listCreatorAnalyses(
    @CurrentUser() user: UserDocument,
    @Query('limit') limit?: string,
  ) {
    return this.tracking.listCreatorAnalyses(String(user._id), limit ? Number(limit) : 30)
  }

  @Get('creator-analyses/:id')
  getCreatorAnalysis(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.tracking.getCreatorAnalysis(id, String(user._id))
  }
}

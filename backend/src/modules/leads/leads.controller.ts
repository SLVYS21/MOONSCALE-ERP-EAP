import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query,
  UseGuards, HttpCode, HttpStatus, Res, Logger,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { LeadsService, CreateLeadDto, UpdateLeadDto, ListLeadsQuery, CreateCallDto, UpdateCallDto, CreateScoringRuleDto, CreateTrackingLinkDto } from './leads.service'
import type { EapRuleCategory, EapMatchType, MatchConfig } from './schemas/eap-scoring-rule.schema'
import type { UserDocument } from '../users/schemas/user.schema'
import { IsOptional as IOpt, IsString as IStr, IsNumber as INum, IsBoolean as IBool, IsIn as IIn } from 'class-validator'
import { Type } from 'class-transformer'

// ── DTOs ─────────────────────────────────────────────────────────────────────

class CreateLeadBody implements CreateLeadDto {
  @IStr() name: string
  @IOpt() @IStr() email?: string
  @IOpt() @IStr() phone?: string
  @IOpt() @Type(() => Number) @INum() age?: number
  @IOpt() @IStr() utm_source?: string
  @IOpt() @IStr() reseau_source?: string
  @IOpt() @IStr() lead_magnet?: string
  @IOpt() @IStr() motivation?: string
  @IOpt() dynamic_fields?: Record<string, unknown>
  @IOpt() @IStr() source_type?: 'typebot' | 'meta_ads' | 'whatsapp_tracked' | 'whatsapp_direct' | 'manual' | 'import'
  @IOpt() offer_ids?: string[]
  @IOpt() @Type(() => Number) @INum() opportunity_amount?: number
  @IOpt() @IStr() notes?: string
}

class UpdateLeadBody implements UpdateLeadDto {
  @IOpt() @IStr() name?: string
  @IOpt() @IStr() email?: string
  @IOpt() @IStr() phone?: string
  @IOpt() @Type(() => Number) @INum() age?: number
  @IOpt() @IStr() reseau_source?: string
  @IOpt() @IStr() lead_magnet?: string
  @IOpt() @IStr() motivation?: string
  @IOpt() dynamic_fields?: Record<string, unknown>
  @IOpt() offer_ids?: string[]
  @IOpt() @Type(() => Number) @INum() opportunity_amount?: number
  @IOpt() @IStr() notes?: string
}

class UpdatePipelineBody {
  @IStr() status: 'nouveau' | 'mql' | 'sql' | 'rdv_programme' | 'appel_diagnostic' | 'won' | 'lost' | 'nurturing'
  @IOpt() @IStr() lost_reason?: string
}

class AssignCloserBody {
  closer_id: string | null
}

class LeadsQuery {
  @IOpt() @IStr() pipeline_status?: string
  @IOpt() @IStr() closer_id?: string
  @IOpt() @IStr() utm_source?: string
  @IOpt() @IStr() source_type?: string
  @IOpt() @IStr() search?: string
  @IOpt() @IStr() date_from?: string
  @IOpt() @IStr() date_to?: string
  @IOpt() @Type(() => Number) @INum() page?: number
  @IOpt() @Type(() => Number) @INum() limit?: number
}

class CreateCallBody implements CreateCallDto {
  @IOpt() @IStr() date?: string
  @IOpt() @Type(() => Number) @INum() duration?: number
  @IOpt() @IStr() google_meet_link?: string
  @IOpt() @IStr() transcript?: string
  @IOpt() @IStr() manual_notes?: string
  @IOpt() @IStr() status?: 'planned' | 'completed' | 'cancelled'
  @IOpt() @IStr() closer_id?: string
  @IOpt() @IStr() offer_proposed_id?: string
  @IOpt() @IBool() sendEmail?: boolean
}

class UpdateCallBody implements UpdateCallDto {
  @IOpt() @IStr() date?: string
  @IOpt() @Type(() => Number) @INum() duration?: number
  @IOpt() @IStr() google_meet_link?: string
  @IOpt() @IStr() transcript?: string
  @IOpt() @IStr() ai_summary?: string
  @IOpt() @IStr() manual_notes?: string
  @IOpt() @IStr() status?: 'planned' | 'completed' | 'cancelled'
  @IOpt() @IStr() closer_id?: string
  @IOpt() @IStr() offer_proposed_id?: string
}


class CreateScoringRuleBody implements CreateScoringRuleDto {
  @IStr() name: string
  @IOpt() @IStr() description?: string
  @IStr() condition_field: string
  @IStr() @IIn(['equals', 'contains', 'not_null', 'is_empty'])
  condition_operator: 'equals' | 'contains' | 'not_null' | 'is_empty'
  @IOpt() @IStr() condition_value?: string
  @Type(() => Number) @INum() points: number
  @IOpt() @IBool() is_active?: boolean
}

class UpdateScoringConfigBody {
  @IOpt() @Type(() => Number) @INum() mql_threshold?: number
  @IOpt() @Type(() => Number) @INum() sql_threshold?: number
  @IOpt() @Type(() => Number) @INum() eap_hot_a_threshold?: number
  @IOpt() @Type(() => Number) @INum() eap_hot_b_threshold?: number
  @IOpt() @Type(() => Number) @INum() eap_warm_threshold?: number
  @IOpt() @Type(() => Number) @INum() eap_cold_threshold?: number
}

class CreateEapScoringRuleBody {
  @IStr() key: string
  @IStr() category: EapRuleCategory
  @IStr() label: string
  @IOpt() @IStr() description?: string
  @IStr() match_type: EapMatchType
  @IOpt() match_config?: MatchConfig
  @Type(() => Number) @INum() points: number
  @IOpt() @Type(() => Number) @INum() priority?: number
  @IOpt() @Type(() => Number) @INum() display_order?: number
  @IOpt() @IBool() is_active?: boolean
  @IOpt() @IStr() disqualification_reason?: string
}

class UpdateEapScoringRuleBody {
  @IOpt() @IStr() label?: string
  @IOpt() @IStr() description?: string
  @IOpt() @IStr() match_type?: EapMatchType
  @IOpt() match_config?: MatchConfig
  @IOpt() @Type(() => Number) @INum() points?: number
  @IOpt() @Type(() => Number) @INum() priority?: number
  @IOpt() @Type(() => Number) @INum() display_order?: number
  @IOpt() @IBool() is_active?: boolean
  @IOpt() @IStr() disqualification_reason?: string
}

class CreateTrackingLinkBody implements CreateTrackingLinkDto {
  @IStr() src: string
  @IOpt() @IStr() type?: 'whatsapp' | 'typebot' | 'link'
  @IOpt() @IStr() description?: string
  @IOpt() @IStr() whatsapp_number?: string
  @IOpt() @IStr() target_url?: string
  @IOpt() @IStr() utm_source?: string
  @IOpt() @IStr() utm_campaign?: string
}

class UpdateTrackingLinkBody {
  @IOpt() @IStr() type?: 'whatsapp' | 'typebot' | 'link'
  @IOpt() @IStr() description?: string
  @IOpt() @IStr() whatsapp_number?: string
  @IOpt() @IStr() target_url?: string
  @IOpt() @IStr() utm_source?: string
  @IOpt() @IStr() utm_campaign?: string
}

// ── Controller: Leads ─────────────────────────────────────────────────────────

@Controller('leads')
@UseGuards(JwtAuthGuard)
export class LeadsController {
  constructor(private leadsService: LeadsService) {}

  // ── List & Create ──────────────────────────────────────────────────────────

  @Get()
  listLeads(@Query() query: LeadsQuery) {
    return this.leadsService.listLeads(query)
  }

  @Post()
  createLead(@Body() body: CreateLeadBody, @CurrentUser() user: UserDocument) {
    return this.leadsService.createLead(body, String(user._id))
  }

  // ── Import CSV Typebot ────────────────────────────────────────────────────

  @Post('import-csv')
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Fichier CSV requis')
    return this.leadsService.importFromCsv(file.buffer)
  }

  // ── Analytics ──────────────────────────────────────────────────────────────

  @Get('analytics')
  getAnalytics(@Query('date_from') dateFrom?: string, @Query('date_to') dateTo?: string) {
    return this.leadsService.getFunnelStats(dateFrom, dateTo)
  }

  @Get('kpis')
  getKpis(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.leadsService.getAcquisitionKpis(dateFrom, dateTo)
  }

  // ── Scoring ────────────────────────────────────────────────────────────────

  @Get('scoring-rules')
  listScoringRules() {
    return this.leadsService.listScoringRules()
  }

  @Post('scoring-rules')
  createScoringRule(@Body() body: CreateScoringRuleBody) {
    return this.leadsService.createScoringRule(body)
  }

  @Patch('scoring-rules/:ruleId')
  updateScoringRule(@Param('ruleId') ruleId: string, @Body() body: Partial<CreateScoringRuleBody>) {
    return this.leadsService.updateScoringRule(ruleId, body)
  }

  @Delete('scoring-rules/:ruleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteScoringRule(@Param('ruleId') ruleId: string) {
    return this.leadsService.deleteScoringRule(ruleId)
  }

  @Get('scoring-config')
  getScoringConfig() {
    return this.leadsService.getScoringConfig()
  }

  @Patch('scoring-config')
  updateScoringConfig(@Body() body: UpdateScoringConfigBody) {
    return this.leadsService.updateScoringConfig(body)
  }

  @Post('migrate-qualification-to-status')
  migrateQualificationToStatus() {
    return this.leadsService.migrateQualificationToStatus()
  }

  // ── EAP Scoring rules (CRUD) ───────────────────────────────────────────────

  @Get('eap-scoring-rules')
  listEapScoringRules() {
    return this.leadsService.listEapScoringRules()
  }

  @Post('eap-scoring-rules')
  createEapScoringRule(@Body() body: CreateEapScoringRuleBody) {
    return this.leadsService.createEapScoringRule(body)
  }

  @Patch('eap-scoring-rules/:ruleId')
  updateEapScoringRule(@Param('ruleId') ruleId: string, @Body() body: UpdateEapScoringRuleBody) {
    return this.leadsService.updateEapScoringRule(ruleId, body)
  }

  @Delete('eap-scoring-rules/:ruleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteEapScoringRule(@Param('ruleId') ruleId: string) {
    return this.leadsService.deleteEapScoringRule(ruleId)
  }

  @Post('eap-scoring-rules/reset-seed')
  @HttpCode(HttpStatus.OK)
  resetEapScoringSeed() {
    return this.leadsService.resetEapScoringSeed()
  }

  // ── EAP Scoring engine ─────────────────────────────────────────────────────

  @Post('scoring/recalculate-all')
  recalculateAllScores() {
    return this.leadsService.recalculateAllScores()
  }

  @Post(':id/scoring/rescore')
  async rescoreLead(@Param('id') id: string) {
    const lead = await this.leadsService.getLeadDocument(id)
    await this.leadsService.rescoreLead(lead)
    return this.leadsService.getLead(id)
  }

  @Post(':id/scoring/bonus')
  addManualBonus(
    @Param('id') id: string,
    @Body() body: { rule: string; points: number; reason?: string },
    @CurrentUser() user: UserDocument,
  ) {
    return this.leadsService.addManualBonus(id, body, String(user._id))
  }

  @Delete(':id/scoring/bonus/:index')
  removeManualBonus(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.leadsService.removeManualBonus(id, Number(index), String(user._id))
  }

  // ── WhatsApp Tracking Links ────────────────────────────────────────────────

  @Get('tracking-links')
  listTrackingLinks() {
    return this.leadsService.listTrackingLinks()
  }

  @Post('tracking-links')
  createTrackingLink(@Body() body: CreateTrackingLinkBody, @CurrentUser() user: UserDocument) {
    return this.leadsService.createTrackingLink(body, String(user._id))
  }

  @Patch('tracking-links/:linkId')
  updateTrackingLink(@Param('linkId') linkId: string, @Body() body: UpdateTrackingLinkBody) {
    return this.leadsService.updateTrackingLink(linkId, body)
  }

  @Delete('tracking-links/:linkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTrackingLink(@Param('linkId') linkId: string) {
    return this.leadsService.deleteTrackingLink(linkId)
  }

  // ── Typebot webhook + backfill ────────────────────────────────────────────

  @Get('typebot-bots')
  listTypebots() {
    return this.leadsService.listTypebots()
  }

  @Post('typebot-bots/:id/register-webhook')
  registerWebhook(@Param('id') id: string) {
    return this.leadsService.registerTypebotWebhook(id)
  }

  @Post('typebot-bots/:id/backfill')
  backfill(@Param('id') id: string) {
    return this.leadsService.backfillTypebot(id)
  }

  // ── Typebot form configs (variable mapping) ───────────────────────────────

  @Get('typebot-form-configs')
  listTypebotFormConfigs() {
    return this.leadsService.listTypebotFormConfigs()
  }

  @Post('typebot-form-configs/:id/sync')
  resyncTypebotFormConfig(@Param('id') id: string) {
    return this.leadsService.resyncTypebotFormConfig(id)
  }

  @Post('typebot-form-configs/:id/resync-leads')
  resyncFormLeads(
    @Param('id') id: string,
    @Body() body: { utm_source?: string },
  ) {
    return this.leadsService.resyncFormLeads(id, { utmSource: body?.utm_source })
  }

  @Post('typebot-form-configs/migrate')
  migrateTypebotConfigs() {
    return this.leadsService.migrateTypebotConfigs()
  }

  @Post('typebot-form-configs/migrate-leads')
  migrateLeadsFromFormConfigs() {
    return this.leadsService.migrateLeadsFromFormConfigs()
  }

  // ── Lead Detail ────────────────────────────────────────────────────────────

  @Get(':id')
  getLead(@Param('id') id: string) {
    return this.leadsService.getLead(id)
  }

  @Patch(':id')
  updateLead(@Param('id') id: string, @Body() body: UpdateLeadBody) {
    return this.leadsService.updateLead(id, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteLead(@Param('id') id: string) {
    return this.leadsService.deleteLead(id)
  }

  @Patch(':id/pipeline')
  updatePipeline(@Param('id') id: string, @Body() body: UpdatePipelineBody) {
    return this.leadsService.updatePipeline(id, body.status, body.lost_reason)
  }

  @Patch(':id/assign')
  assignCloser(@Param('id') id: string, @Body() body: AssignCloserBody) {
    return this.leadsService.assignCloser(id, body.closer_id)
  }

  // ── Cal.com ────────────────────────────────────────────────────────────────

  @Get(':id/calcom/slots')
  getCalComSlots(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.leadsService.getCalComSlots(id, String(user._id))
  }

  @Post(':id/calcom/book')
  createCalComBooking(
    @Param('id') id: string,
    @Body() body: { slot: string },
    @CurrentUser() user: UserDocument,
  ) {
    return this.leadsService.createCalComBooking(id, String(user._id), body.slot)
  }

  @Delete(':id/calls/:callId/calcom-cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancelCalComBooking(
    @Param('id') _id: string,
    @Param('callId') callId: string,
  ) {
    return this.leadsService.cancelCalComBooking(callId)
  }

  // ── Cal.com booking email pref ────────────────────────────────────────────

  @Post(':id/booking-pref')
  @HttpCode(HttpStatus.NO_CONTENT)
  setBookingPref(
    @Param('id') id: string,
    @Body() body: { sendEmail?: boolean },
  ) {
    this.leadsService.setBookingEmailPref(id, body.sendEmail ?? true)
  }

  // ── Calls ──────────────────────────────────────────────────────────────────

  @Get(':id/calls')
  listCalls(@Param('id') id: string) {
    return this.leadsService.listCalls(id)
  }

  @Post(':id/calls')
  createCall(
    @Param('id') id: string,
    @Body() body: CreateCallBody,
    @CurrentUser() user: UserDocument,
  ) {
    return this.leadsService.createCall(id, body, String(user._id))
  }

  @Patch(':id/calls/:callId')
  updateCall(
    @Param('id') id: string,
    @Param('callId') callId: string,
    @Body() body: UpdateCallBody,
    @CurrentUser() user: UserDocument,
  ) {
    return this.leadsService.updateCall(id, callId, body, String(user._id))
  }

  @Post(':id/calls/:callId/summarize')
  generateSummary(@Param('id') id: string, @Param('callId') callId: string) {
    return this.leadsService.generateCallSummary(id, callId)
  }

  @Post(':id/send-call-link')
  @HttpCode(HttpStatus.OK)
  sendCallLink(
    @Param('id') id: string,
    @Body() body: { bookingUrl: string; message?: string },
  ) {
    return this.leadsService.sendCallLink(id, body.bookingUrl, body.message ?? '')
  }

  @Post(':id/convert')
  convertToStudent(@Param('id') id: string) {
    return this.leadsService.convertToStudent(id)
  }
}

// ── Controller: Public WhatsApp Redirect ─────────────────────────────────────

@Controller('r')
export class TrackingRedirectController {
  private readonly logger = new Logger(TrackingRedirectController.name)

  constructor(private leadsService: LeadsService) {}

  @Get()
  async redirect(
    @Query('src') src: string,
    @Res() res: Response,
  ) {
    const userAgent = (res.req?.headers?.['user-agent'] as string) ?? ''

    if (!src) return res.redirect(302, 'https://wa.me/')

    const result = await this.leadsService.handleRedirect(src, userAgent)

    if (!result) {
      this.logger.warn(`Tracking redirect: unknown src=${src}`)
      return res.redirect(302, 'https://wa.me/')
    }

    if (result.type === 'whatsapp') {
      const clean = result.destination.replace(/\D/g, '')
      return res.redirect(302, `https://wa.me/${clean}`)
    }

    // typebot or generic link
    if (result.destination) return res.redirect(302, result.destination)
    return res.redirect(302, 'https://wa.me/')
  }
}

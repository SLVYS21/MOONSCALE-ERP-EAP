import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common'
import { IsString, IsOptional, IsIn, IsBoolean } from 'class-validator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { UserDocument } from '../users/schemas/user.schema'
import { WhatsAppService } from './whatsapp.service'
import { WhatsAppStatsService, type StatsRange } from './whatsapp-stats.service'
import { COMPLAINT_CATEGORIES, type ComplaintCategory } from './schemas/complaint.schema'
import type { ConversationStatus } from './schemas/conversation.schema'

class SendMessageBody {
  @IsOptional() @IsString() text?: string
  @IsOptional() @IsString() mediaUrl?: string
  @IsOptional() @IsIn(['image', 'video', 'audio', 'document']) mediaType?: 'image' | 'video' | 'audio' | 'document'
  @IsOptional() @IsString() mediaName?: string
}

class ToggleAiBody {
  @IsBoolean() enabled: boolean
}

class SetStatusBody {
  @IsIn(['bot', 'human', 'paused', 'closed']) status: ConversationStatus
}

class TagBody {
  @IsString() tag: string
}

class CreateComplaintBody {
  @IsIn(COMPLAINT_CATEGORIES as unknown as string[]) category: ComplaintCategory
  @IsString() description: string
}

class CreateQuickReplyBody {
  @IsString() shortcut: string
  @IsString() content: string
  @IsOptional() @IsString() label?: string
  @IsOptional() @IsBoolean() shared?: boolean
}

class SimulateInboundBody {
  @IsString() from: string
  @IsString() text: string
  @IsOptional() @IsString() fromName?: string
}

@Controller('whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class WhatsAppController {
  constructor(
    private readonly service: WhatsAppService,
    private readonly stats: WhatsAppStatsService,
  ) {}

  @Get('stats')
  getStats(@Query('range') range?: string) {
    const r: StatsRange = (['24h', '7d', '30d', 'all'].includes(range ?? '') ? range : '7d') as StatsRange
    return this.stats.getStats(r)
  }

  @Get('conversations')
  listConversations(
    @Query('status') status?: ConversationStatus,
    @Query('search') search?: string,
    @Query('tag') tag?: string,
    @Query('contactType') contactType?: 'lead' | 'student' | 'unknown',
  ) {
    return this.service.listConversations({ status, search, tag, contactType })
  }

  @Get('conversations/:id')
  getConversation(@Param('id') id: string) {
    return this.service.getConversation(id)
  }

  @Get('conversations/:id/messages')
  listMessages(@Param('id') id: string, @Query('limit') limit?: string, @Query('before') before?: string) {
    return this.service.listMessages(id, {
      limit: limit ? Number(limit) : undefined,
      before: before ? new Date(before) : undefined,
    })
  }

  @Post('conversations/:id/messages')
  sendMessage(@Param('id') id: string, @Body() body: SendMessageBody, @CurrentUser() user: UserDocument) {
    return this.service.sendAsCloser(id, String(user._id), body)
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    await this.service.markRead(id, String(user._id))
  }

  @Patch('conversations/:id/ai')
  toggleAi(@Param('id') id: string, @Body() body: ToggleAiBody) {
    return this.service.toggleAi(id, body.enabled)
  }

  @Patch('conversations/:id/status')
  setStatus(@Param('id') id: string, @Body() body: SetStatusBody) {
    return this.service.setStatus(id, body.status)
  }

  @Post('conversations/:id/lock')
  lock(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.service.lock(id, String(user._id))
  }

  @Post('conversations/:id/unlock')
  unlock(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.service.unlock(id, String(user._id))
  }

  @Post('conversations/:id/tags')
  addTag(@Param('id') id: string, @Body() body: TagBody) {
    return this.service.addTag(id, body.tag)
  }

  @Delete('conversations/:id/tags/:tag')
  removeTag(@Param('id') id: string, @Param('tag') tag: string) {
    return this.service.removeTag(id, tag)
  }

  @Post('conversations/:id/complaints')
  createComplaint(@Param('id') id: string, @Body() body: CreateComplaintBody, @CurrentUser() user: UserDocument) {
    return this.service.createComplaint(id, body, String(user._id))
  }

  @Get('complaints')
  listComplaints() {
    return this.service.listComplaints()
  }

  // ── Quick replies ─────────────────────────────────────────────────────────
  @Get('quick-replies')
  listQuickReplies(@CurrentUser() user: UserDocument) {
    return this.service.listQuickReplies(String(user._id))
  }

  @Post('quick-replies')
  createQuickReply(@Body() body: CreateQuickReplyBody, @CurrentUser() user: UserDocument) {
    return this.service.createQuickReply(String(user._id), body)
  }

  @Delete('quick-replies/:id')
  deleteQuickReply(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.service.deleteQuickReply(id, String(user._id))
  }

  // ── Simulator ─────────────────────────────────────────────────────────────
  @Post('simulator/inbound')
  simulateInbound(@Body() body: SimulateInboundBody) {
    return this.service.simulateInbound(body.from, body.text, body.fromName)
  }

  @Post('simulator/reset')
  async resetConversation(@Body() body: { phone: string }) {
    return this.service.resetConversation(body.phone)
  }
}

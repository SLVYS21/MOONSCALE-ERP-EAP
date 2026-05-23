import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common'
import { AutomationsService } from './automations.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator'
import { Type } from 'class-transformer'
import type { UserDocument } from '../users/schemas/user.schema'

// ── DTOs ─────────────────────────────────────────────────────────────────────

class CreateAutomationDto {
  @IsString() name: string
  @IsOptional() @IsString() description?: string
  @IsString() triggerType: string
  @IsOptional() @IsArray() steps?: unknown[]
}

class UpdateAutomationDto {
  @IsOptional() @IsString() name?: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsBoolean() isActive?: boolean
  @IsOptional() trigger?: Record<string, unknown>
  @IsOptional() @IsArray() steps?: unknown[]
}

class ListRunsDto {
  @IsOptional() @Type(() => Number) page?: number
  @IsOptional() @Type(() => Number) limit?: number
}

// ── Protected controller ──────────────────────────────────────────────────────

@Controller('automations')
@UseGuards(JwtAuthGuard)
export class AutomationsController {
  constructor(private automationsService: AutomationsService) {}

  @Get('circle-plans')
  async listCirclePlans() {
    return this.automationsService.listCirclePlans()
  }

  @Get()
  list(@CurrentUser() user: UserDocument) {
    return this.automationsService.listAutomations(
      (user._id as { toString(): string }).toString(),
      user.role,
    )
  }

  @Post()
  create(@Body() dto: CreateAutomationDto, @CurrentUser() user: UserDocument) {
    return this.automationsService.createAutomation(
      dto as Parameters<AutomationsService['createAutomation']>[0],
      (user._id as { toString(): string }).toString(),
    )
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.automationsService.getAutomation(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAutomationDto) {
    return this.automationsService.updateAutomation(id, dto as Parameters<AutomationsService['updateAutomation']>[1])
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.automationsService.deleteAutomation(id)
  }

  @Post(':id/toggle')
  @HttpCode(HttpStatus.OK)
  toggle(@Param('id') id: string) {
    return this.automationsService.toggleActive(id)
  }

  @Post('seed-defaults')
  @HttpCode(HttpStatus.OK)
  seedDefaults(@CurrentUser() user: UserDocument) {
    return this.automationsService.seedDefaultAutomations(
      (user._id as { toString(): string }).toString(),
    )
  }

  @Post(':id/run')
  @HttpCode(HttpStatus.OK)
  runManual(@Param('id') id: string) {
    return this.automationsService.runManual(id)
  }

  @Get(':id/runs')
  listRuns(@Param('id') id: string, @Query() q: ListRunsDto) {
    return this.automationsService.listRuns(id, q.page, q.limit)
  }
}

// ── Public webhook trigger (no auth) ─────────────────────────────────────────

@Controller('public/automations')
export class PublicAutomationsController {
  constructor(private automationsService: AutomationsService) {}

  @Post('webhook/:key')
  @HttpCode(HttpStatus.OK)
  trigger(@Param('key') key: string, @Body() body: Record<string, unknown>) {
    return this.automationsService.triggerWebhook(key, body)
  }
}

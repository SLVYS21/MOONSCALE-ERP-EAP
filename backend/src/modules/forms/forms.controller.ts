import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus, Req,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Request } from 'express'
import { FormsService } from './forms.service'
import { CloudinaryService } from '../cloudinary/cloudinary.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { IsString, IsOptional, IsArray } from 'class-validator'
import { Type } from 'class-transformer'
import type { UserDocument } from '../users/schemas/user.schema'

// ── DTOs ─────────────────────────────────────────────────────────────────────

class CreateFormDto {
  @IsString() title: string
  @IsOptional() @IsString() description?: string
}

class UpdateFormDto {
  @IsOptional() @IsString() title?: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsArray() fields?: unknown[]
  @IsOptional() settings?: Record<string, unknown>
}

class ListResponsesDto {
  @IsOptional() @Type(() => Number) page?: number
  @IsOptional() @Type(() => Number) limit?: number
}

class SubmitFormDto {
  @IsArray() answers: { fieldId: string; value: unknown }[]
}

// ── Protected controller (authenticated) ──────────────────────────────────────

@Controller('forms')
@UseGuards(JwtAuthGuard)
export class FormsController {
  constructor(private formsService: FormsService) {}

  @Get()
  listForms(@CurrentUser() user: UserDocument) {
    return this.formsService.listForms(
      (user._id as { toString(): string }).toString(),
      user.role,
    )
  }

  @Post()
  createForm(@Body() dto: CreateFormDto, @CurrentUser() user: UserDocument) {
    return this.formsService.createForm(
      dto,
      (user._id as { toString(): string }).toString(),
    )
  }

  @Get(':id')
  getForm(@Param('id') id: string) {
    return this.formsService.getForm(id)
  }

  @Patch(':id')
  updateForm(@Param('id') id: string, @Body() dto: UpdateFormDto) {
    return this.formsService.updateForm(id, dto as Parameters<FormsService['updateForm']>[1])
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  deleteForm(@Param('id') id: string) {
    return this.formsService.deleteForm(id)
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publishForm(@Param('id') id: string) {
    return this.formsService.publishForm(id)
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  unpublishForm(@Param('id') id: string) {
    return this.formsService.unpublishForm(id)
  }

  @Post(':id/duplicate')
  duplicateForm(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.formsService.duplicateForm(
      id,
      (user._id as { toString(): string }).toString(),
    )
  }

  @Get(':id/responses')
  listResponses(@Param('id') id: string, @Query() query: ListResponsesDto) {
    return this.formsService.listResponses(id, query.page, query.limit)
  }

  @Delete(':id/responses/:responseId')
  @HttpCode(HttpStatus.OK)
  deleteResponse(@Param('responseId') responseId: string) {
    return this.formsService.deleteResponse(responseId)
  }

  @Get(':id/stats')
  getFormStats(@Param('id') id: string) {
    return this.formsService.getFormStats(id)
  }
}

// ── Public controller (no auth) ───────────────────────────────────────────────

@Controller('public/forms')
export class PublicFormsController {
  constructor(
    private formsService: FormsService,
    private cloudinaryService: CloudinaryService,
  ) {}

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Aucun fichier reçu')
    const url = await this.cloudinaryService.upload(file.buffer, 'moonscale/forms')
    return { url }
  }

  @Get(':slug')
  getPublicForm(@Param('slug') slug: string) {
    return this.formsService.getFormBySlug(slug)
  }

  @Post(':slug/submit')
  @HttpCode(HttpStatus.OK)
  submitForm(
    @Param('slug') slug: string,
    @Body() dto: SubmitFormDto,
    @Req() req: Request,
  ) {
    return this.formsService.submitResponse(slug, dto.answers, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    })
  }
}

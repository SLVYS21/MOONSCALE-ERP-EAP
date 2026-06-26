import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus,
  BadRequestException, UseInterceptors, UploadedFile,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ContentService, CreateProjectDto, UpdateProjectDto } from './content.service'
import type { UserDocument } from '../users/schemas/user.schema'
import type { ContentPlatform, ContentCategory, ContentFormat, DurationType } from './schemas/video-project.schema'
import type { SuggestionStatus } from './schemas/content-suggestion.schema'
import { IsOptional as IOpt, IsString as IStr, IsNumber as INum, IsArray as IArr } from 'class-validator'
import { Type } from 'class-transformer'

class CreateProjectBody implements CreateProjectDto {
  @IStr() title: string
  @IOpt() @IStr() category?: ContentCategory
  @IOpt() @IStr() format?: ContentFormat
  @IOpt() @IStr() duration_type?: DurationType
  @IOpt() @IArr() platforms?: ContentPlatform[]
  @IOpt() @IStr() youtube_ref_url?: string | null
  @IOpt() @IStr() brain_dump?: string
  @IOpt() @IStr() notes?: string
}

class UpdateProjectBody implements UpdateProjectDto {
  @IOpt() @IStr() title?: string
  @IOpt() @IStr() description?: string
  @IOpt() @IStr() status?: 'idee' | 'script' | 'tournage' | 'montage' | 'publie'
  @IOpt() @IArr() platforms?: ContentPlatform[]
  @IOpt() @IStr() category?: ContentCategory
  @IOpt() @IStr() format?: ContentFormat
  @IOpt() @IStr() duration_type?: DurationType
  @IOpt() target_date?: string | null
  @IOpt() @IStr() published_url?: string | null
  @IOpt() @IStr() youtube_ref_url?: string | null
  @IOpt() @IStr() notes?: string
  @IOpt() @IStr() brain_dump?: string
  @IOpt() @IStr() value_proposition?: string
  @IOpt() @IArr() key_points?: string[]
  @IOpt() guest_name?: string | null
  @IOpt() @IStr() guest_value?: string
  @IOpt() @IStr() full_script?: string
  @IOpt() @IArr() thumbnail_descriptions?: string[]
  @IOpt() @Type(() => Number) @INum() order?: number
}

class AddChecklistBody {
  @IStr() label: string
}

class GenerateThumbnailBody {
  @IStr() description: string
  @Type(() => Number) @INum() thumbnail_index: number
}

class SelectHookBody {
  @Type(() => Number) @INum() hook_index: number
}

class QuickStructureBody {
  @IStr() raw_idea: string
}

class AddCreatorBody {
  @IStr() name: string
  @IStr() channel_url: string
  @IStr() platform: string
}

class UpdateSuggestionBody {
  @IStr() status: SuggestionStatus
}

class CreateCaptureBody {
  @IStr() text: string
  @IOpt() @IStr() source?: 'text' | 'voice'
}

class UpdateCaptureBody {
  @IStr() text: string
}

class AnalyzeReferencesBody {
  @IArr() video_urls: string[]
}

class CorrectScriptBody {
  @IStr() instruction: string
}

@Controller('content/projects')
@UseGuards(JwtAuthGuard)
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get()
  listProjects(
    @CurrentUser() user: UserDocument,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('period') period?: string,
    @Query('sort') sort?: string,
  ) {
    return this.contentService.listProjects(String(user._id), category, status, period, sort)
  }

  @Post()
  createProject(@Body() body: CreateProjectBody, @CurrentUser() user: UserDocument) {
    return this.contentService.createProject(body, String(user._id))
  }

  @Get('calendar')
  getCalendar(
    @CurrentUser() user: UserDocument,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    return this.contentService.getCalendar(
      String(user._id),
      Number(year) || new Date().getFullYear(),
      Number(month) || new Date().getMonth() + 1,
    )
  }

  // ── Quick structure (brain dump) ─────────────────────────────────────────────

  @Post('quick-structure')
  quickStructure(@Body() body: QuickStructureBody) {
    return this.contentService.quickStructure(body.raw_idea)
  }

  // ── Creators ─────────────────────────────────────────────────────────────────

  @Get('creators')
  listCreators(@CurrentUser() user: UserDocument) {
    return this.contentService.listCreators(String(user._id))
  }

  @Post('creators')
  addCreator(@Body() body: AddCreatorBody, @CurrentUser() user: UserDocument) {
    return this.contentService.addCreator(String(user._id), body)
  }

  @Delete('creators/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeCreator(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.contentService.removeCreator(id, String(user._id))
  }

  // ── Suggestions ──────────────────────────────────────────────────────────────

  @Get('suggestions')
  listSuggestions(@CurrentUser() user: UserDocument) {
    return this.contentService.listSuggestions(String(user._id))
  }

  @Post('suggestions/generate')
  generateSuggestions(@CurrentUser() user: UserDocument) {
    return this.contentService.generateDailySuggestions(String(user._id))
  }

  @Post('suggestions/:id/save')
  saveSuggestion(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.contentService.saveSuggestionAsProject(id, String(user._id))
  }

  @Patch('suggestions/:id')
  updateSuggestion(@Param('id') id: string, @Body() body: UpdateSuggestionBody) {
    return this.contentService.updateSuggestionStatus(id, body.status)
  }

  // ── Captures ─────────────────────────────────────────────────────────────────

  @Get('captures')
  listCaptures(@CurrentUser() user: UserDocument) {
    return this.contentService.listCaptures(String(user._id))
  }

  @Post('captures')
  createCapture(@Body() body: CreateCaptureBody, @CurrentUser() user: UserDocument) {
    return this.contentService.createCapture(String(user._id), {
      text: body.text,
      source: body.source ?? 'text',
    })
  }

  @Post('captures/transcribe')
  @UseInterceptors(FileInterceptor('audio'))
  transcribeAudio(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Aucun fichier audio reçu')
    return this.contentService.transcribeAudio(file.buffer, file.mimetype)
  }

  @Patch('captures/:captureId')
  updateCapture(
    @Param('captureId') captureId: string,
    @Body() body: UpdateCaptureBody,
    @CurrentUser() user: UserDocument,
  ) {
    return this.contentService.updateCapture(captureId, String(user._id), body.text)
  }

  @Delete('captures/:captureId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCapture(@Param('captureId') captureId: string, @CurrentUser() user: UserDocument) {
    return this.contentService.deleteCapture(captureId, String(user._id))
  }

  // ── Projects ─────────────────────────────────────────────────────────────────

  @Get(':id')
  getProject(@Param('id') id: string) {
    return this.contentService.getProject(id)
  }

  @Patch(':id')
  updateProject(@Param('id') id: string, @Body() body: UpdateProjectBody) {
    return this.contentService.updateProject(id, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteProject(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.contentService.deleteProject(id, String(user._id))
  }

  // ── AI ──────────────────────────────────────────────────────────────────────

  @Post(':id/analyze')
  analyzeProject(@Param('id') id: string) {
    return this.contentService.analyzeProject(id)
  }

  @Post(':id/generate-script')
  generateScript(@Param('id') id: string) {
    return this.contentService.generateScript(id)
  }

  @Post(':id/generate-thumbnail')
  generateThumbnail(@Param('id') id: string, @Body() body: GenerateThumbnailBody) {
    return this.contentService.generateThumbnail(id, body.description, body.thumbnail_index)
  }

  @Post(':id/select-hook')
  selectHook(@Param('id') id: string, @Body() body: SelectHookBody) {
    return this.contentService.selectHook(id, body.hook_index)
  }

  // ── Pipeline (references, script correction, publish time) ───────────────────

  @Post(':id/analyze-references')
  analyzeReferences(@Param('id') id: string, @Body() body: AnalyzeReferencesBody) {
    return this.contentService.analyzeReferenceVideos(id, body.video_urls)
  }

  @Post(':id/correct-script')
  correctScript(@Param('id') id: string, @Body() body: CorrectScriptBody) {
    return this.contentService.correctScript(id, body.instruction)
  }

  @Post(':id/suggest-publish-time')
  suggestPublishTime(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.contentService.suggestPublishTime(id, String(user._id))
  }

  // ── Checklist ───────────────────────────────────────────────────────────────

  @Post(':id/checklist/:itemId/toggle')
  toggleChecklistItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.contentService.toggleChecklistItem(id, itemId)
  }

  @Post(':id/checklist')
  addChecklistItem(@Param('id') id: string, @Body() body: AddChecklistBody) {
    return this.contentService.addChecklistItem(id, body.label)
  }

  @Delete(':id/checklist/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeChecklistItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.contentService.removeChecklistItem(id, itemId)
  }
}

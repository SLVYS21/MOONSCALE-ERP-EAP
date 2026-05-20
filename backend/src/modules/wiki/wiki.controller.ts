import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards,
} from '@nestjs/common'
import { WikiService } from './wiki.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { IsString, IsOptional } from 'class-validator'
import type { UserDocument } from '../users/schemas/user.schema'

class CreatePageDto {
  @IsString() title: string
  @IsOptional() @IsString() content?: string
  @IsOptional() @IsString() parentId?: string
  @IsOptional() @IsString() icon?: string
}

class UpdatePageDto {
  @IsOptional() @IsString() title?: string
  @IsOptional() @IsString() content?: string
  @IsOptional() @IsString() icon?: string
  @IsOptional() parentId?: string | null
}

@Controller('wiki')
@UseGuards(JwtAuthGuard)
export class WikiController {
  constructor(private wikiService: WikiService) {}

  @Get('tree')
  getTree() {
    return this.wikiService.getTree()
  }

  @Get(':slug')
  getPage(@Param('slug') slug: string) {
    return this.wikiService.getPage(slug)
  }

  @Post()
  createPage(@Body() dto: CreatePageDto, @CurrentUser() user: UserDocument) {
    return this.wikiService.createPage({ ...dto, createdById: user._id.toString() })
  }

  @Patch(':slug')
  updatePage(
    @Param('slug') slug: string,
    @Body() dto: UpdatePageDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.wikiService.updatePage(slug, dto, user._id.toString())
  }

  @Delete(':slug')
  deletePage(@Param('slug') slug: string) {
    return this.wikiService.deletePage(slug)
  }

  @Post('reorder')
  reorder(@Body() body: { updates: Array<{ id: string; order: number }> }) {
    return this.wikiService.reorderPages(body.updates)
  }
}

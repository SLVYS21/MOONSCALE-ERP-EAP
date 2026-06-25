import {
  Controller, Get, Post, Delete, Patch, Param, Body, UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { IsBoolean, IsOptional } from 'class-validator'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../../common/guards/roles.guard'
import { Roles } from '../../../common/decorators/roles.decorator'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import type { UserDocument } from '../../users/schemas/user.schema'
import { KbService } from './kb.service'

class UpdateFlagsBody {
  @IsOptional() @IsBoolean() isAlwaysIncluded?: boolean
}

@Controller('assistant/kb')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class KbController {
  constructor(private readonly service: KbService) {}

  @Get()
  list() {
    return this.service.list()
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('isAlwaysIncluded') isAlwaysIncluded: string | undefined,
    @CurrentUser() user: UserDocument,
  ) {
    return this.service.upload(file, {
      uploadedBy: String(user._id),
      isAlwaysIncluded: isAlwaysIncluded === 'true' || isAlwaysIncluded === '1',
    })
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateFlagsBody) {
    return this.service.updateFlags(id, body)
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id)
  }
}

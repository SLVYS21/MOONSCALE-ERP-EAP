import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common'
import { UsersService } from './users.service'
import { InviteUserDto } from './dto/invite-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ConfigService } from '@nestjs/config'
import type { UserDocument } from './schemas/user.schema'

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private usersService: UsersService,
    private configService: ConfigService,
  ) {}

  @Get()
  findAll() {
    return this.usersService.findAll()
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id)
  }

  @Post('invite')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  async invite(@Body() dto: InviteUserDto, @CurrentUser() user: UserDocument) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:5173')
    await this.usersService.invite(dto, user._id.toString(), frontendUrl)
    return { message: 'Invitation envoyée' }
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.usersService.updateUser(id, dto, user._id.toString(), user.role)
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  async deactivate(@Param('id') id: string) {
    await this.usersService.deactivateUser(id)
    return { message: 'Membre désactivé' }
  }
}

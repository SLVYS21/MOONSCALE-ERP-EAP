import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'
import { AcceptInvitationDto } from './dto/accept-invitation.dto'
import { CreateSuperAdminDto } from './dto/create-superadmin.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { UserDocument } from '../users/schemas/user.schema'

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password)
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken)
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@CurrentUser() user: UserDocument) {
    return this.authService.logout(user._id.toString())
  }

  @Post('accept-invitation')
  @HttpCode(HttpStatus.OK)
  acceptInvitation(@Body() dto: AcceptInvitationDto) {
    return this.authService.acceptInvitation(
      dto.token,
      dto.firstName,
      dto.lastName,
      dto.password,
    )
  }

  @Post('setup')
  @HttpCode(HttpStatus.CREATED)
  setup(@Body() dto: CreateSuperAdminDto) {
    return this.authService.setupSuperAdmin(
      dto.email,
      dto.password,
      dto.firstName,
      dto.lastName,
      dto.setupKey,
    )
  }
}

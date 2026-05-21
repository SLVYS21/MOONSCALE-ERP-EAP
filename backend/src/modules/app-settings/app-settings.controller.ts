import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common'
import { AppSettingsService } from './app-settings.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'

@Controller('app-settings')
@UseGuards(JwtAuthGuard)
export class AppSettingsController {
  constructor(private service: AppSettingsService) {}

  @Get()
  get() { return this.service.get() }

  @Patch()
  update(@Body() body: { lead_magnets?: string[]; lead_sources?: string[] }) {
    return this.service.update(body)
  }
}

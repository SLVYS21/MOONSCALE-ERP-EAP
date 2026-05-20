import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RemindersService } from './reminders.service'

@UseGuards(JwtAuthGuard)
@Controller('reminders')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Post('trigger')
  async trigger() {
    const { run, summary } = await this.remindersService.execute()
    return { run, summary }
  }

  @Get('runs')
  async listRuns(
    @Query('page') page = '1',
    @Query('limit') limit = '30',
  ) {
    return this.remindersService.listRuns(Number(page), Number(limit))
  }

  @Get('runs/:id')
  async getRun(@Param('id') id: string) {
    return this.remindersService.getRun(id)
  }
}

import { Controller, Get, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { UserDocument } from '../users/schemas/user.schema'
import { CalcomDbService } from './calcom-db.service'

@Controller('calcom')
@UseGuards(JwtAuthGuard)
export class CalcomDbController {
  constructor(private readonly calcomDbService: CalcomDbService) {}

  /** Returns the Cal.com booking URL for the currently logged-in user.
   *  Auto-discovered from the Cal.com PostgreSQL DB (username + event slug).
   *  Returns null if CALCOM_DB_* vars are not configured. */
  @Get('my-booking-url')
  async getMyBookingUrl(@CurrentUser() user: UserDocument) {
    const url = await this.calcomDbService.getBookingUrl(user.email)
    return { url }
  }
}

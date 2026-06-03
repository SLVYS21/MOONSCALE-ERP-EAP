import { Module } from '@nestjs/common'
import { CalcomDbService } from './calcom-db.service'
import { CalcomDbController } from './calcom-db.controller'
import { LeadsModule } from '../leads/leads.module'

@Module({
  imports: [LeadsModule],
  controllers: [CalcomDbController],
  providers: [CalcomDbService],
  exports: [CalcomDbService],
})
export class CalcomDbModule {}

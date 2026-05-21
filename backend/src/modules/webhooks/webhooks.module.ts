import { Module } from '@nestjs/common'
import { WebhooksController } from './webhooks.controller'
import { StudentsModule } from '../students/students.module'
import { FinancesModule } from '../finances/finances.module'
import { LeadsModule } from '../leads/leads.module'

@Module({
  imports: [StudentsModule, FinancesModule, LeadsModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}

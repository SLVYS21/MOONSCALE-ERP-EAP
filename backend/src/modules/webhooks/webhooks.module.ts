import { Module } from '@nestjs/common'
import { WebhooksController } from './webhooks.controller'
import { StudentsModule } from '../students/students.module'
import { FinancesModule } from '../finances/finances.module'

@Module({
  imports: [StudentsModule, FinancesModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}

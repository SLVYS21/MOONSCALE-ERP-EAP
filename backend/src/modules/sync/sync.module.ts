import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { SyncService } from './sync.service'
import { SyncController } from './sync.controller'
import { Student, StudentSchema } from '../students/schemas/student.schema'
import { Payment, PaymentSchema } from '../students/schemas/payment.schema'
import { FormationDashboard, FormationDashboardSchema } from '../students/schemas/formation-dashboard.schema'
import { CoachingDashboard, CoachingDashboardSchema } from '../students/schemas/coaching-dashboard.schema'
import { Form, FormSchema } from '../forms/schemas/form.schema'
import { AirtableModule } from '../airtable/airtable.module'
import { CircleModule } from '../circle/circle.module'
import { AutomationsModule } from '../automations/automations.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Student.name, schema: StudentSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: FormationDashboard.name, schema: FormationDashboardSchema },
      { name: CoachingDashboard.name, schema: CoachingDashboardSchema },
      { name: Form.name, schema: FormSchema },
    ]),
    AirtableModule,
    CircleModule,
    AutomationsModule,
  ],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}

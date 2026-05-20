import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { StudentsController } from './students.controller'
import { StudentsService } from './students.service'
import { Student, StudentSchema } from './schemas/student.schema'
import { Payment, PaymentSchema } from './schemas/payment.schema'
import { FormationDashboard, FormationDashboardSchema } from './schemas/formation-dashboard.schema'
import { CoachingDashboard, CoachingDashboardSchema } from './schemas/coaching-dashboard.schema'
import { Reminder, ReminderSchema } from './schemas/reminder.schema'
import { CircleModule } from '../circle/circle.module'
import { AirtableModule } from '../airtable/airtable.module'
import { MailModule } from '../mail/mail.module'
import { CloudinaryModule } from '../cloudinary/cloudinary.module'
import { AutomationsModule } from '../automations/automations.module'
import { OcrModule } from '../ocr/ocr.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Student.name, schema: StudentSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: FormationDashboard.name, schema: FormationDashboardSchema },
      { name: CoachingDashboard.name, schema: CoachingDashboardSchema },
      { name: Reminder.name, schema: ReminderSchema },
    ]),
    CircleModule,
    AirtableModule,
    MailModule,
    CloudinaryModule,
    AutomationsModule,
    OcrModule,
  ],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}

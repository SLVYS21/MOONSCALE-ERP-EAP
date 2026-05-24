import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { ScheduleModule } from '@nestjs/schedule'
import { ConfigModule } from '@nestjs/config'
import { AutomationsController, PublicAutomationsController } from './automations.controller'
import { AutomationsService } from './automations.service'
import { Automation, AutomationSchema } from './schemas/automation.schema'
import { AutomationRun, AutomationRunSchema } from './schemas/automation-run.schema'
import { MailModule } from '../mail/mail.module'
import { CircleModule } from '../circle/circle.module'
import { Student, StudentSchema } from '../students/schemas/student.schema'
import { Payment, PaymentSchema } from '../students/schemas/payment.schema'
import { Task, TaskSchema } from '../tasks/schemas/task.schema'
import { User, UserSchema } from '../users/schemas/user.schema'
import { Form, FormSchema } from '../forms/schemas/form.schema'
import { FormResponse, FormResponseSchema } from '../forms/schemas/form-response.schema'
import { Offer, OfferSchema } from '../offers/schemas/offer.schema'
import { Subscription, SubscriptionSchema } from '../offers/schemas/subscription.schema'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Automation.name, schema: AutomationSchema },
      { name: AutomationRun.name, schema: AutomationRunSchema },
      { name: Student.name, schema: StudentSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Task.name, schema: TaskSchema },
      { name: User.name, schema: UserSchema },
      { name: Form.name, schema: FormSchema },
      { name: FormResponse.name, schema: FormResponseSchema },
      { name: Offer.name, schema: OfferSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
    MailModule,
    CircleModule,
    ScheduleModule,
    ConfigModule,
  ],
  controllers: [AutomationsController, PublicAutomationsController],
  providers: [AutomationsService],
  exports: [AutomationsService],
})
export class AutomationsModule {}

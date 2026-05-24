import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { ScheduleModule } from '@nestjs/schedule'
import { OffersController } from './offers.controller'
import { OffersService } from './offers.service'
import { Offer, OfferSchema } from './schemas/offer.schema'
import { Subscription, SubscriptionSchema } from './schemas/subscription.schema'
import { Student, StudentSchema } from '../students/schemas/student.schema'
import { Payment, PaymentSchema } from '../students/schemas/payment.schema'
import { AutomationsModule } from '../automations/automations.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Offer.name,        schema: OfferSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Student.name,      schema: StudentSchema },
      { name: Payment.name,      schema: PaymentSchema },
    ]),
    AutomationsModule,
    ScheduleModule,
  ],
  controllers: [OffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}

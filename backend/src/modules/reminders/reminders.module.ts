import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { RemindersService } from './reminders.service'
import { RemindersController } from './reminders.controller'
import { StudentsModule } from '../students/students.module'
import { ReminderCronRun, ReminderCronRunSchema } from './schemas/cron-run.schema'

@Module({
  imports: [
    StudentsModule,
    MongooseModule.forFeature([{ name: ReminderCronRun.name, schema: ReminderCronRunSchema }]),
  ],
  controllers: [RemindersController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}

import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AutomationsController, PublicAutomationsController } from './automations.controller'
import { AutomationsService } from './automations.service'
import { Automation, AutomationSchema } from './schemas/automation.schema'
import { AutomationRun, AutomationRunSchema } from './schemas/automation-run.schema'
import { MailModule } from '../mail/mail.module'
import { Student, StudentSchema } from '../students/schemas/student.schema'
import { Task, TaskSchema } from '../tasks/schemas/task.schema'
import { User, UserSchema } from '../users/schemas/user.schema'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Automation.name, schema: AutomationSchema },
      { name: AutomationRun.name, schema: AutomationRunSchema },
      { name: Student.name, schema: StudentSchema },
      { name: Task.name, schema: TaskSchema },
      { name: User.name, schema: UserSchema },
    ]),
    MailModule,
  ],
  controllers: [AutomationsController, PublicAutomationsController],
  providers: [AutomationsService],
  exports: [AutomationsService],
})
export class AutomationsModule {}

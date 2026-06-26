import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import { ScheduleModule } from '@nestjs/schedule'
import { MulterModule } from '@nestjs/platform-express'
import { AuthModule } from './modules/auth/auth.module'
import { UsersModule } from './modules/users/users.module'
import { MailModule } from './modules/mail/mail.module'
import { StudentsModule } from './modules/students/students.module'
import { CircleModule } from './modules/circle/circle.module'
import { AirtableModule } from './modules/airtable/airtable.module'
import { CloudinaryModule } from './modules/cloudinary/cloudinary.module'
import { WebhooksModule } from './modules/webhooks/webhooks.module'
import { RemindersModule } from './modules/reminders/reminders.module'
import { WikiModule } from './modules/wiki/wiki.module'
import { TasksModule } from './modules/tasks/tasks.module'
import { FinancesModule } from './modules/finances/finances.module'
import { FormsModule } from './modules/forms/forms.module'
import { AutomationsModule } from './modules/automations/automations.module'
import { SyncModule } from './modules/sync/sync.module'
import { LeadsModule } from './modules/leads/leads.module'
import { AnalyticsModule } from './modules/analytics/analytics.module'
import { AppSettingsModule } from './modules/app-settings/app-settings.module'
import { ContentModule } from './modules/content/content.module'
import { ContentTrackingModule } from './modules/content-tracking/content-tracking.module'
import { OffersModule } from './modules/offers/offers.module'
import { CalcomDbModule } from './modules/calcom-db/calcom-db.module'
import { LlmModule } from './modules/llm/llm.module'
import { AssistantModule } from './modules/assistant/assistant.module'
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    MulterModule.register({ limits: { fileSize: 10 * 1024 * 1024 } }), // 10 MB
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI', 'mongodb://localhost:27017/moonscale-erp'),
      }),
    }),
    AuthModule,
    UsersModule,
    MailModule,
    StudentsModule,
    CircleModule,
    AirtableModule,
    CloudinaryModule,
    WebhooksModule,
    RemindersModule,
    WikiModule,
    TasksModule,
    FinancesModule,
    FormsModule,
    AutomationsModule,
    SyncModule,
    LeadsModule,
    AnalyticsModule,
    AppSettingsModule,
    ContentModule,
    ContentTrackingModule,
    OffersModule,
    CalcomDbModule,
    LlmModule,
    AssistantModule,
    WhatsAppModule,
  ],
})
export class AppModule {}

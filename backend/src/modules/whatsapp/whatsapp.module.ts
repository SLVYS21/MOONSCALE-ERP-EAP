import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Conversation, ConversationSchema } from './schemas/conversation.schema'
import { Message, MessageSchema } from './schemas/message.schema'
import { Complaint, ComplaintSchema } from './schemas/complaint.schema'
import { QuickReply, QuickReplySchema } from './schemas/quick-reply.schema'
import { FormSession, FormSessionSchema } from './schemas/form-session.schema'
import { Lead, LeadSchema } from '../leads/schemas/lead.schema'
import { Student, StudentSchema } from '../students/schemas/student.schema'
import { User, UserSchema } from '../users/schemas/user.schema'
import { WhatsAppService } from './whatsapp.service'
import { WhatsAppController } from './whatsapp.controller'
import { WhatsAppWebhookController } from './whatsapp-webhook.controller'
import { WhatsAppGateway } from './whatsapp.gateway'
import { FormRunnerService } from './forms/form-runner.service'
import { WhatsAppStatsService } from './whatsapp-stats.service'
import { SimulatorProvider } from './providers/simulator.provider'
import { EvolutionProvider } from './providers/evolution.provider'
import { WhatsAppProviderFactory } from './providers/whatsapp-provider.factory'
import { AssistantModule } from '../assistant/assistant.module'
import { LlmModule } from '../llm/llm.module'
import { LeadsModule } from '../leads/leads.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Complaint.name, schema: ComplaintSchema },
      { name: QuickReply.name, schema: QuickReplySchema },
      { name: FormSession.name, schema: FormSessionSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: Student.name, schema: StudentSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AssistantModule,
    LlmModule,
    LeadsModule,
  ],
  controllers: [WhatsAppController, WhatsAppWebhookController],
  providers: [
    WhatsAppService,
    WhatsAppGateway,
    FormRunnerService,
    WhatsAppStatsService,
    SimulatorProvider,
    EvolutionProvider,
    WhatsAppProviderFactory,
  ],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}

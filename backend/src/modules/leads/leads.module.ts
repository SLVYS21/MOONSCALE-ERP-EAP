import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Lead, LeadSchema } from './schemas/lead.schema'
import { Call, CallSchema } from './schemas/call.schema'
import { ScoringRule, ScoringRuleSchema } from './schemas/scoring-rule.schema'
import { ScoringConfig, ScoringConfigSchema } from './schemas/scoring-config.schema'
import { WhatsAppLink, WhatsAppLinkSchema } from './schemas/whatsapp-link.schema'
import { WhatsAppClick, WhatsAppClickSchema } from './schemas/whatsapp-click.schema'
import { LeadsService } from './leads.service'
import { LeadsController, TrackingRedirectController } from './leads.controller'
import { AutomationsModule } from '../automations/automations.module'
import { OffersModule } from '../offers/offers.module'
import { MailModule } from '../mail/mail.module'
import { Student, StudentSchema } from '../students/schemas/student.schema'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: Call.name, schema: CallSchema },
      { name: ScoringRule.name, schema: ScoringRuleSchema },
      { name: ScoringConfig.name, schema: ScoringConfigSchema },
      { name: WhatsAppLink.name, schema: WhatsAppLinkSchema },
      { name: WhatsAppClick.name, schema: WhatsAppClickSchema },
      { name: Student.name, schema: StudentSchema },
    ]),
    AutomationsModule,
    OffersModule,
    MailModule,
  ],
  controllers: [LeadsController, TrackingRedirectController],
  providers: [LeadsService],
  exports: [LeadsService, MongooseModule],
})
export class LeadsModule {}

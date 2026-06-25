import type { Model } from 'mongoose'
import type { ConversationDocument } from '../schemas/conversation.schema'
import type { ComplaintDocument } from '../schemas/complaint.schema'
import type { LeadDocument } from '../../leads/schemas/lead.schema'
import type { StudentDocument } from '../../students/schemas/student.schema'
import type { FormRunnerService } from '../forms/form-runner.service'

export interface ToolContext {
  conversation: ConversationDocument
  models: {
    Conversation: Model<ConversationDocument>
    Complaint: Model<ComplaintDocument>
    Lead: Model<LeadDocument>
    Student: Model<StudentDocument>
  }
  services: {
    formRunner: FormRunnerService
  }
}

export interface ToolHandlerResult {
  ok: boolean
  data?: unknown
  error?: string
}

import type { ToolDef } from '../../llm/llm-provider.interface'

export interface RegisteredTool {
  def: ToolDef
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolHandlerResult>
}

export type UserRole = 'superadmin' | 'admin' | 'member'

export interface Permissions {
  students: { view: boolean; edit: boolean; delete: boolean }
  finances: { view: boolean; edit: boolean }
  automations: { view: boolean; edit: boolean }
  forms: { view: boolean; edit: boolean }
  team: { view: boolean; manage: boolean }
}

export interface User {
  _id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  permissions: Permissions
  isActive: boolean
  avatar?: string
  lastActivity?: string
  createdAt: string
  calcom_user_id?: number | null
  calcom_event_type_id?: number | null
}

export interface Invitation {
  _id: string
  email: string
  role: 'admin' | 'member'
  invitedBy: { _id: string; firstName: string; lastName: string; email: string }
  expiresAt: string
  used: boolean
  status: 'pending' | 'accepted' | 'expired'
  createdAt: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface LoginResponse {
  user: User
  accessToken: string
  refreshToken: string
}

export interface ApiError {
  message: string
  statusCode: number
  error?: string
}

// ── Students ──────────────────────────────────────────────────────────────────

export type InfoStatus = 'EXACTE' | 'ERRONÉE' | 'NON VÉRIFIÉ'

export interface Student {
  _id: string
  name: string
  email: string
  whatsapp?: string
  occupation?: string
  source?: string
  infoStatus: InfoStatus
  notes: string
  // Enrichissement Airtable
  birthDate?: string | null
  ageRange?: string | null
  nbPartialPayments?: number
  airtableCreatedAt?: string | null
  airtableId?: string
  // Circle
  circleId?: number
  circleJoinedAt?: string
  circleAcceptedAt?: string
  circleLastSeenAt?: string | null
  circleTags?: { id: number; name: string }[]
  circleIsActive?: boolean
  circleLastSync?: string
  circleProfile?: string
  circleAvatarUrl?: string | null
  // Debt
  plan?: string | null
  debtStatus: DebtStatus
  debtSince?: string
  successProofs?: SuccessProof[]
  // Admin
  isAdmin?: boolean
  createdAt: string
  updatedAt: string
  // Audit history
  history?: Array<{ event: string; detail: string; actor: string | null; date: string }>
}

// ── Payments ──────────────────────────────────────────────────────────────────

export type PaymentStatus = 'NON TRAITÉ' | 'TRAITÉ' | 'REJETÉ'
export type PaymentModality = 'Complet' | 'Partiel'
export type PaymentProduct = string
export type PaymentCurrency = 'F CFA' | 'FCFA' | 'USD' | 'EURO'
export type PaymentGateway = string
export type CirclePlan = string

export interface Payment {
  _id: string
  studentId: string
  studentEmail: string
  studentName: string
  status: PaymentStatus
  modality?: PaymentModality
  amount?: number
  currency?: PaymentCurrency
  product?: PaymentProduct
  gateway?: PaymentGateway
  plan?: CirclePlan
  validityMonths?: number
  proofImages: string[]
  notes?: string
  source: 'tally' | 'chariow' | 'manual'
  tallySubmissionId?: string | null
  paidAt?: string | null
  processedBy?: string
  processedAt?: string
  createdAt: string
  updatedAt: string
}

// ── Dashboards ────────────────────────────────────────────────────────────────

export type FollowUpStatus = 'RELANCE 1' | 'RELANCE 2' | 'RELANCE 3' | 'EN RÈGLE'
export type CirclePaymentStatus = 'EN RÈGLE' | 'EN RETARD'

export interface FormationDashboard {
  _id: string
  studentId: string
  paymentModality?: PaymentModality
  paymentStatus?: CirclePaymentStatus
  nextPaymentDate?: string
  autoFollowUpStatus?: FollowUpStatus
  manualFollowUpStatus?: string
  action?: string
  notes?: string
}

export interface CoachingDashboard {
  _id: string
  studentId: string
  messagingEnabled?: boolean
  paymentDate?: string
  nextPaymentDate?: string
  paymentStatus?: CirclePaymentStatus
  autoFollowUpStatus?: FollowUpStatus
  manualFollowUpStatus?: string
  followUpNote?: string
  tags?: string[]
}

export interface StudentDetail {
  student: Student
  payments: Payment[]
  formation?: FormationDashboard
  coaching?: CoachingDashboard
}

// ── Wiki ──────────────────────────────────────────────────────────────────────

export interface WikiPage {
  _id: string
  title: string
  slug: string
  content: string
  parentId?: string | null
  icon: string
  order: number
  isPublished: boolean
  createdAt: string
  updatedAt: string
  children?: WikiPage[]
}

// ── Finances ──────────────────────────────────────────────────────────────────

export type TransactionType = 'income' | 'expense'
export type TransactionGateway = 'stripe' | 'chariow' | 'pawapay' | 'fedapay' | 'wave' | 'orange_money' | 'virement' | 'manual' | 'bank_import'
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'refunded'
export type CategoryType = 'income' | 'expense' | 'both'

export interface FinanceCategory {
  _id: string
  name: string
  type: CategoryType
  color: string
  icon: string
}

export interface Transaction {
  _id: string
  type: TransactionType
  amount: number
  currency: string
  description: string
  categoryId?: FinanceCategory | null
  date: string
  gateway: TransactionGateway
  status: TransactionStatus
  reference?: string | null
  notes: string
  attachments: string[]
  createdBy: User
  createdAt: string
  updatedAt: string
  customerEmail?: string | null
  customerName?: string | null
  customerPhone?: string | null
  productName?: string | null
  offerId?: string | null
  offerName?: string | null
  studentId?: string | null
  leadId?: string | null
  leadName?: string | null
}

export interface MonthStat {
  label: string
  income: number
  expense: number
}

export interface FinanceStats {
  currency: string
  month: { income: number; expense: number; net: number }
  year: { income: number; expense: number; net: number }
  byMonth: MonthStat[]
  byCategory: Array<{ name: string; color: string; icon: string; income: number; expense: number }>
  byGateway: Array<{ gateway: string; income: number; expense: number }>
}

// ── Tasks & Projects ──────────────────────────────────────────────────────────

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type ProjectStatus = 'active' | 'completed' | 'archived'

export interface ChecklistItem {
  text: string
  done: boolean
}

export interface TaskComment {
  text: string
  authorId: string
  author?: User
  createdAt: string
}

export interface Task {
  _id: string
  title: string
  description: string
  projectId?: string | null
  status: TaskStatus
  priority: TaskPriority
  assignedTo?: User | null
  createdBy: User
  dueDate?: string | null
  tags: string[]
  checklist: ChecklistItem[]
  comments: TaskComment[]
  order: number
  createdAt: string
  updatedAt: string
}

export interface Project {
  _id: string
  title: string
  description: string
  color: string
  icon: string
  status: ProjectStatus
  memberIds: User[]
  createdBy: User
  deadline?: string | null
  taskCount?: number
  completedCount?: number
  createdAt: string
  updatedAt: string
}

export interface TaskStats {
  total: number
  byStatus: Record<TaskStatus, number>
  overdue: number
  byMember: Array<{
    user: User
    total: number
    completed: number
    inProgress: number
    overdue: number
  }>
}

export interface ProjectWithColumns {
  project: Project
  columns: Record<TaskStatus, Task[]>
}

// ── Forms ─────────────────────────────────────────────────────────────────────

export type FormFieldType =
  | 'short_text' | 'long_text' | 'email' | 'number' | 'phone'
  | 'select' | 'radio' | 'checkbox' | 'date' | 'rating' | 'file'
  | 'heading' | 'paragraph'

export type ConditionOperator =
  | 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty'

export interface FieldCondition {
  fieldId: string
  operator: ConditionOperator
  value?: string
}

export interface FormField {
  id: string
  type: FormFieldType
  label: string
  placeholder?: string
  required: boolean
  options?: string[]
  content?: string
  validation?: { min?: number; max?: number }
  accept?: string
  maxFiles?: number
  condition?: FieldCondition | null
  order: number
}

export interface FormSettings {
  submitMessage: string
  redirectUrl?: string
  allowMultipleSubmissions: boolean
  notifyEmail?: string
}

export interface Form {
  _id: string
  title: string
  description: string
  slug: string
  fields: FormField[]
  settings: FormSettings
  isPublished: boolean
  responseCount?: number
  createdBy: User
  createdAt: string
  updatedAt: string
}

export interface FormResponseAnswer {
  fieldId: string
  value: unknown
}

export interface FormResponse {
  _id: string
  formId: string
  answers: FormResponseAnswer[]
  metadata: { ip?: string; userAgent?: string }
  createdAt: string
}

// ── Automations ───────────────────────────────────────────────────────────────

export type TriggerType =
  | 'form_submitted' | 'payment_created' | 'payment_treated'
  | 'student_created' | 'manual' | 'incoming_webhook'
  | 'reminder_due' | 'debt_detected'
  | 'lead_created' | 'lead_stage_changed' | 'lead_won' | 'call_completed'
  | 'cron_schedule'
  | 'subscription_created' | 'subscription_expiring' | 'partial_payment_due'
  | 'audience_based'

export type AudienceEntity = 'student' | 'payment'

export interface AudienceFilter {
  field: string
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty' | 'gt' | 'lt'
  value?: string
}

export interface AudienceConfig {
  entity: AudienceEntity
  filters: AudienceFilter[]
}

export interface OfferPlan {
  _id: string
  name: string
  durationMonths: number
  price: number
  currency: string
  partialDueAfterDays: number
  isActive: boolean
}

export interface Offer {
  _id: string
  name: string
  plans: OfferPlan[]
  isActive: boolean
  description: string
  features: string[]
  createdAt: string
}

export interface Subscription {
  _id: string
  studentId: string
  studentEmail: string
  offerId: string
  paymentId: string | null
  offerName: string
  offerProduct: string
  offerPlan: string | null
  durationMonths: number
  startDate: string
  endDate: string
  status: 'active' | 'expired' | 'cancelled'
  modality: 'Complet' | 'Partiel'
  paidAmount: number
  totalAmount: number
  currency: string
  nextPaymentDate: string | null
  remindersSent: number
  lastReminderAt: string | null
  createdAt: string
}

export type EmailBlock =
  | { type: 'text';    content: string; align: 'left' | 'center' | 'right' }
  | { type: 'image';   url: string; alt?: string; width?: string }
  | { type: 'button';  label: string; url: string; color: string; textColor: string; radius: 'none' | 'md' | 'full'; align: 'left' | 'center' | 'right' }
  | { type: 'divider' }
  | { type: 'spacer';  height: number }

export type StepType =
  | 'send_email'
  | 'http_request'
  | 'wait'
  | 'condition'
  | 'notify_team'
  | 'add_note'
  | 'update_student'
  | 'create_task'
  | 'create_payment'
  | 'create_student'
  | 'circle_invite'
  | 'circle_tag_add'
  | 'circle_tag_remove'
  | 'create_subscription'

export interface AutomationTrigger {
  type: TriggerType
  config: {
    formId?: string
    webhookKey?: string
    schedulePreset?: string
    audience?: AudienceConfig
  }
}

export interface StepCondition {
  field: string
  operator: string
  value: string
}

export interface AutomationStep {
  id: string
  type: StepType
  name?: string
  conditions?: StepCondition[]
  config: {
    to?: string
    subject?: string
    body?: string
    url?: string
    method?: string
    headers?: { key: string; value: string }[]
    requestBody?: string
    duration?: number
    unit?: 'seconds' | 'minutes' | 'hours'
    field?: string
    operator?: string
    value?: string
    recipients?: string
    note?: string
    studentField?: string
    studentValue?: string
    taskTitle?: string
    taskDescription?: string
    taskPriority?: string
    // create_payment / create_student / circle_*
    emailExpr?: string
    nameExpr?: string
    whatsappExpr?: string
    amountExpr?: string
    currency?: string
    product?: string
    modality?: string
    gateway?: string
    plan?: string
    circleTagId?: number
    circleTagName?: string
    circlePlanKey?: string
    // create_subscription
    matchMode?: 'auto' | 'manual'
    offerId?: string
    planName?: string
    // send_email block editor
    blocks?: EmailBlock[]
    tag?: string
  }
}

export interface Automation {
  _id: string
  name: string
  description: string
  isActive: boolean
  trigger: AutomationTrigger
  steps: AutomationStep[]
  runCount: number
  lastRunAt?: string | null
  createdBy: User
  createdAt: string
  updatedAt: string
}

export interface AutomationRunLog {
  stepId: string
  stepName: string
  status: 'ok' | 'error' | 'skipped'
  message: string
  timestamp: string
}

export interface AutomationRun {
  _id: string
  automationId: string
  triggerType: string
  status: 'running' | 'completed' | 'failed'
  logs: AutomationRunLog[]
  completedAt?: string | null
  error?: string | null
  createdAt: string
}

// ── Sync ──────────────────────────────────────────────────────────────────────

export type DebtStatus = 'ok' | 'potential' | 'confirmed'

export interface SuccessProof {
  _id: string
  url: string
  type: 'image' | 'video' | 'link'
  caption: string
  addedBy: string
  createdAt: string
}

export interface SyncStatus {
  lastAirtableSync: string | null
  lastCircleSync: string | null
  lastDebtorDetection: string | null
  lastTallySync: string | null
  circleApiCallsThisSession: number
}

export interface TallyImportResult {
  imported: number
  skipped: number
  errors: number
  durationMs: number
}

export interface AirtableSyncResult {
  students: { created: number; updated: number; skipped: number }
  payments: { created: number; updated: number; skipped: number }
  formation: { upserted: number }
  coaching: { upserted: number }
  durationMs: number
}

export interface CircleSyncResult {
  totalCircleMembers: number
  studentsMatched: number
  studentsUpdated: number
  apiCallsUsed: number
  durationMs: number
}

export interface DebtorResult {
  flagged: number
  cleared: number
  durationMs: number
}

export interface PendingStudentsResult {
  found: number
  students: { email: string; name: string; paymentId: string; submittedAt: string | null }[]
  durationMs: number
}

export interface PendingRespondent {
  responseId: string
  email: string
  name: string
  amount: number
  currency: string
  product: string
  modality: 'Complet' | 'Partiel'
  gateway: string
  proofCount: number
  submittedAt: string | null
}

export interface PendingRespondentsPreview {
  found: number
  respondents: PendingRespondent[]
  durationMs: number
}

export interface RegularizeResult {
  scanned: number
  alreadyInvited: number
  alreadyHavePayment: number
  created: number
  durationMs: number
}

export interface DebtorProofsResult {
  processed: number
  uploaded: number
  skipped: number
  errors: number
  durationMs: number
}

// ── Reminders cron history ────────────────────────────────────────────────────

export interface ReminderCronEntry {
  email: string
  studentName: string | null
  type: 'formation' | 'coaching'
  daysBeforePayment: number
  status: 'sent' | 'failed'
  restricted: boolean
  error: string | null
}

export interface ReminderCronRun {
  _id: string
  runAt: string
  durationMs: number
  totalReminders: number
  emailsSent: number
  emailsFailed: number
  accessRestricted: number
  fatalError: string | null
  entries: ReminderCronEntry[]
  createdAt: string
}

// ── Pagination ────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// ── Leads & Acquisition ───────────────────────────────────────────────────────

export type PipelineStatus =
  | 'nouveau'
  | 'mql'
  | 'sql'
  | 'rdv_programme'
  | 'appel_diagnostic'
  | 'won'
  | 'lost'
  | 'nurturing'

export type LeadSourceType =
  | 'typebot'
  | 'meta_ads'
  | 'whatsapp_tracked'
  | 'whatsapp_direct'
  | 'manual'
  | 'import'

export interface Lead {
  _id: string
  name: string
  email: string | null
  phone: string | null
  age: number | null
  utm_source: string | null
  reseau_source: string | null
  lead_magnet: string | null
  motivation: string
  dynamic_fields: Record<string, unknown>
  source_type: LeadSourceType
  pipeline_status: PipelineStatus
  closer_id: User | null
  lost_reason: string
  offer_ids: SubscriptionOffer[]
  opportunity_amount: number | null
  notes: string
  created_by: { _id: string; firstName: string; lastName: string } | null
  student_id: string | null
  typebot_result_id?: string | null
  source_form_id?: string | null
  source_form_name?: string | null
  submitted_at?: string | null
  pays?: string | null
  budget?: number | null
  events: Array<{ type: string; message: string; date: string; actor_id?: string | null }>
  createdAt: string
  updatedAt: string
}

export interface OfferPlan {
  _id: string
  name: string
  price: number
  currency: string
  durationMonths: number
  partialDueAfterDays: number
  isActive: boolean
}

export interface SubscriptionOffer {
  _id: string
  name: string
  description: string
  features: string[]
  isActive: boolean
  plans: OfferPlan[]
  createdAt?: string
  updatedAt?: string
}

export type CallStatus = 'planned' | 'completed' | 'cancelled'

export interface LeadCall {
  _id: string
  lead_id: string
  date: string | null
  duration: number | null
  google_meet_link: string
  transcript: string
  ai_summary: string
  manual_notes: string
  status: CallStatus
  closer_id: User | null
  offer_proposed_id: SubscriptionOffer | null
  calcom_booking_uid: string | null
  createdAt: string
  updatedAt: string
}

export interface ScoringRule {
  _id: string
  name: string
  description: string
  condition_field: string
  condition_operator: 'equals' | 'contains' | 'not_null' | 'is_empty'
  condition_value: string
  points: number
  is_active: boolean
  createdAt: string
}

export interface ScoringConfig {
  _id: string
  mql_threshold: number
  sql_threshold: number
}

export interface WhatsAppTrackingLink {
  _id: string
  src: string
  type: 'whatsapp' | 'typebot' | 'link'
  description: string
  whatsapp_number: string | null
  target_url: string | null
  utm_source: string | null
  utm_campaign: string | null
  click_count: number
  created_by: { _id: string; firstName: string; lastName: string } | null
  createdAt: string
}

export interface AppSettings {
  _id: string
  lead_magnets: string[]
  lead_sources: string[]
  custom_gateways: string[]
  callBookingUrl?: string
  exchangeRates?: Record<string, number>
}

export interface LeadFunnelStats {
  total: number
  by_pipeline: Array<{ _id: string; count: number }>
  by_source: Array<{ _id: string | null; count: number }>
  by_qualification: Array<{ _id: string | null; count: number }>
}

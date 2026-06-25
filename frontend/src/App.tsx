import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { AuthGuard, GuestGuard } from '@/components/auth/AuthGuard'
import { LoginPage } from '@/pages/auth/LoginPage'
import { AcceptInvitationPage } from '@/pages/auth/AcceptInvitationPage'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { TeamPage } from '@/pages/team/TeamPage'
import { StudentsPage } from '@/pages/students/StudentsPage'
import { StudentDetailPage } from '@/pages/students/StudentDetailPage'
import { PaymentsPage } from '@/pages/payments/PaymentsPage'
import { WikiPage } from '@/pages/wiki/WikiPage'
import { TasksPage } from '@/pages/tasks/TasksPage'
import { ProjectPage } from '@/pages/tasks/ProjectPage'
import { FinancesPage } from '@/pages/finances/FinancesPage'
import { FormsPage } from '@/pages/forms/FormsPage'
import { FormBuilderPage } from '@/pages/forms/FormBuilderPage'
import { PublicFormPage } from '@/pages/forms/PublicFormPage'
import { AutomationsPage } from '@/pages/automations/AutomationsPage'
import { AutomationBuilderPage } from '@/pages/automations/AutomationBuilderPage'
import { SyncPage } from '@/pages/sync/SyncPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { LeadsPage } from '@/pages/leads/LeadsPage'
import { LeadDetailPage } from '@/pages/leads/LeadDetailPage'
import { OffersPage } from '@/pages/leads/OffersPage'
import { ScoringPage } from '@/pages/leads/ScoringPage'
import { TrackingLinksPage } from '@/pages/leads/TrackingLinksPage'
import { AnalyticsPage } from '@/pages/analytics/AnalyticsPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { ContentPage } from '@/pages/content/ContentPage'
import { SubscriptionOffersPage } from '@/pages/payments/SubscriptionOffersPage'
import { InboxPage } from '@/pages/whatsapp/InboxPage'
import { SimulatorPage } from '@/pages/whatsapp/SimulatorPage'
import { AssistantConfigPage } from '@/pages/whatsapp/AssistantConfigPage'
import { WhatsAppStatsPage } from '@/pages/whatsapp/WhatsAppStatsPage'

export default function App() {
  return (
    <Routes>
      <Route element={<GuestGuard />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite" element={<AcceptInvitationPage />} />
      </Route>

      {/* Public form page — no auth, no sidebar */}
      <Route path="/f/:slug" element={<PublicFormPage />} />

      <Route element={<AuthGuard />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/students/:id" element={<StudentDetailPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/payments/offers" element={<SubscriptionOffersPage />} />
          <Route path="/sync" element={<SyncPage />} />
          <Route path="/wiki" element={<WikiPage />} />
          <Route path="/wiki/:slug" element={<WikiPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/:projectId" element={<ProjectPage />} />
          <Route path="/finances" element={<FinancesPage />} />
          <Route path="/automations" element={<AutomationsPage />} />
          <Route path="/automations/:id" element={<AutomationBuilderPage />} />
          <Route path="/forms" element={<FormsPage />} />
          <Route path="/forms/:id" element={<FormBuilderPage />} />
          <Route path="/finances" element={<PlaceholderPage title="Finances" description="Suivi multi-devises, plan comptable" />} />
          <Route path="/leads" element={<LeadsPage />} />
          <Route path="/leads/offers" element={<OffersPage />} />
          <Route path="/leads/scoring" element={<ScoringPage />} />
          <Route path="/leads/tracking" element={<TrackingLinksPage />} />
          <Route path="/leads/:id" element={<LeadDetailPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/content" element={<ContentPage />} />
          <Route path="/content/projects" element={<ContentPage />} />
          <Route path="/content/ideas" element={<ContentPage />} />
          <Route path="/content/suggestions" element={<ContentPage />} />
          <Route path="/content/creators" element={<ContentPage />} />
          <Route path="/messages" element={<PlaceholderPage title="Messages" description="Communication interne d'équipe" />} />
          <Route path="/whatsapp" element={<InboxPage />} />
          <Route path="/whatsapp/simulator" element={<SimulatorPage />} />
          <Route path="/whatsapp/assistant" element={<AssistantConfigPage />} />
          <Route path="/whatsapp/stats" element={<WhatsAppStatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

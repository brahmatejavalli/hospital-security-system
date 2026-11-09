import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { useAuth } from './lib/auth'
import { Layout } from './components/Layout'
import { Button, EmptyState, ErrorState, Loading } from './components/ui'
import { DashboardPage } from './pages/Dashboard'
import { VaultPage } from './pages/Vault'
import { StaffPage } from './pages/Staff'
import { AuditPage } from './pages/Audit'
import { AlertsPage } from './pages/Alerts'
import { SettingsPage } from './pages/Settings'
import { LoginPage } from './pages/Login'

function Permission({ name, children }: { name: string; children: ReactNode }) {
  const { user } = useAuth()
  if (!user?.permissions.includes(name)) return <NoAccess />
  return children
}
function NoAccess() {
  const navigate = useNavigate()
  return (
    <div className="panel">
      <EmptyState
        icon={<ShieldCheck size={32} />}
        title="A different role is needed here."
        description="Your account doesn’t have access to this part of the workspace. Contact an administrator if your role needs to change."
      >
        <Button onClick={() => navigate('/')}>
          <ArrowLeft size={15} />
          Back to overview
        </Button>
      </EmptyState>
    </div>
  )
}
export default function App() {
  const { user, loading, error, retry } = useAuth()
  if (loading) return <Loading full />
  if (error)
    return (
      <div className="bootstrap-error">
        <ErrorState message={error} retry={retry} />
      </div>
    )
  if (!user) return <LoginPage />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="vault" element={<VaultPage />} />
        <Route
          path="staff"
          element={
            <Permission name="manage_staff">
              <StaffPage />
            </Permission>
          }
        />
        <Route
          path="audit"
          element={
            <Permission name="view_audit">
              <AuditPage />
            </Permission>
          }
        />
        <Route
          path="alerts"
          element={
            <Permission name="view_alerts">
              <AlertsPage />
            </Permission>
          }
        />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

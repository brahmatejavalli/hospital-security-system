export type Role = 'admin' | 'doctor' | 'nurse' | 'auditor'
export type User = {
  id: number
  username: string
  email: string
  role: Role
  department: string
  is_active: boolean
  is_demo: boolean
  permissions: string[]
  last_login: string | null
  created_at: string
}
export type RecordFile = {
  id: string
  filename: string
  hash: string
  size: number
  content_type: string
  patient_id: string
  category: string
  department: string
  classification: 'Confidential' | 'Restricted' | 'Internal'
  uploaded_by: number
  uploader_name: string
  integrity_status: string
  created_at: string
  encryption: string
}
export type AuditEvent = {
  id: number
  actor_id: number | null
  actor_name: string
  action: string
  resource: string
  resource_id: string | null
  outcome: string
  ip_address: string
  detail: string
  is_demo: boolean
  created_at: string
}
export type SecurityAlert = {
  id: number
  title: string
  description: string
  severity: 'high' | 'medium' | 'low'
  status: 'open' | 'resolved'
  source_ip: string
  recommendation: string
  is_demo: boolean
  created_at: string
  resolved_at: string | null
  resolved_by: string | null
  resolution_note: string | null
}
export type Workspace = {
  name: string
  contact_email: string
  timezone: string
  session_minutes: number
  storage: string
  encryption: string
  hash_algorithm: string
  demo_enabled: boolean
}
export type Config = {
  demo_enabled: boolean
  max_upload_bytes: number
  departments: string[]
  categories: string[]
  classifications: string[]
}
export type Paginated<T> = { items: T[]; total: number; page: number; page_size: number }
export type ChartPoint = { date: string; authorized: number; blocked: number }
export type Dashboard = {
  record_count: number
  new_records: number
  previous_records: number
  active_staff: number
  team_preview: string[]
  access_today: number
  open_alerts: number
  security_score: number
  integrity_issues: number
  storage_bytes: number
  chart: ChartPoint[]
  authorized_total: number
  blocked_total: number
  recent_records: RecordFile[]
  recent_activity: AuditEvent[]
  as_of: string
  days: number
  severity_counts: { high: number; medium: number; low: number }
}
export type StaffResponse = Paginated<User> & {
  summary: { total: number; active: number; admins: number; departments: number }
}
export type AuditResponse = Paginated<AuditEvent> & { actions: string[] }
export type AlertsResponse = {
  items: SecurityAlert[]
  summary: { open: number; high: number; resolved: number }
}

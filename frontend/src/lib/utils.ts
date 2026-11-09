export function initials(name: string) {
  return name
    .replace(/^Dr\.\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase()
}
export function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3)
  return `${(bytes / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${['B', 'KB', 'MB', 'GB'][unit]}`
}
export function formatDate(value: string | null, timezone = 'Asia/Kolkata', withTime = false) {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : { year: 'numeric' }),
    timeZone: timezone,
  }).format(new Date(value))
}
export function timeAgo(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
export function recordTitle(filename: string) {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/-GF-\d{4}-\d+$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/^./, value => value.toUpperCase())
}
export const roleLabels: Record<string, string> = {
  admin: 'Administrator',
  doctor: 'Doctor',
  nurse: 'Nurse',
  auditor: 'Auditor',
}
export const actionLabels: Record<string, string> = {
  sign_in: 'Signed in',
  sign_out: 'Signed out',
  record_uploaded: 'Uploaded a record',
  record_downloaded: 'Downloaded a record',
  record_viewed: 'Accessed a record',
  record_deleted: 'Deleted a record',
  member_added: 'Added a team member',
  access_updated: 'Updated access',
  profile_updated: 'Updated profile',
  password_changed: 'Changed password',
  password_reset: 'Reset a member password',
  settings_updated: 'Updated settings',
  alert_resolved: 'Resolved an alert',
  report_exported: 'Exported a report',
  integrity_check: 'Checked file integrity',
}
export const actionLabel = (action: string) => actionLabels[action] ?? action.replaceAll('_', ' ')

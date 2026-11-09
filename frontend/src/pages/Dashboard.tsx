import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  FileLock2,
  Fingerprint,
  LockKeyhole,
  Plus,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import { api, download } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Dashboard as DashboardData, RecordFile } from '../lib/types'
import { actionLabel, formatBytes, timeAgo } from '../lib/utils'
import { AccessChart } from '../components/AccessChart'
import type { LayoutContext } from '../components/Layout'
import { DeleteRecordModal, RecordDetail, RecordsTable } from '../components/Records'
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  Select,
  useToast,
} from '../components/ui'

export function DashboardPage() {
  const [days, setDays] = useState(7)
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['dashboard', days],
    queryFn: () => api<DashboardData>(`/dashboard?days=${days}`),
    refetchInterval: 30_000,
  })
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null)
  const [deleteRecord, setDeleteRecord] = useState<RecordFile | null>(null)
  const [exporting, setExporting] = useState(false)
  const { user } = useAuth()
  const { openUpload } = useOutletContext<LayoutContext>()
  const toast = useToast()
  const navigate = useNavigate()
  const exportReport = async () => {
    setExporting(true)
    try {
      await download(`/reports/overview?days=${days}`, 'medguard-security-overview.csv')
      toast('Your security overview has been exported.')
    } catch (err) {
      toast((err as Error).message, true)
    } finally {
      setExporting(false)
    }
  }
  if (isPending) return <Loading />
  if (error || !data)
    return (
      <ErrorState
        message={error?.message ?? 'Unable to load the overview.'}
        retry={() => void refetch()}
      />
    )
  const metrics = [
    {
      label: 'Protected records',
      value: data.record_count.toLocaleString(),
      icon: FileLock2,
      tone: 'green',
      foot: (
        <>
          <span className="metric-trend">
            <ArrowUpRight size={13} />
            {data.new_records} new
          </span>
          <span>in the last {days} days</span>
        </>
      ),
      action: () => navigate('/vault'),
    },
    {
      label: 'Active team members',
      value: data.active_staff.toLocaleString(),
      icon: UsersRound,
      tone: 'blue',
      foot: (
        <>
          <span className="metric-foot-icon">
            <ShieldCheck size={13} />
          </span>
          <span>Role-based access enabled</span>
        </>
      ),
      action: user?.permissions.includes('manage_staff') ? () => navigate('/staff') : undefined,
    },
    {
      label: 'Authorized accesses today',
      value: data.access_today.toLocaleString(),
      icon: Fingerprint,
      tone: 'purple',
      foot: (
        <>
          <span className="metric-foot-icon">
            <Activity size={13} />
          </span>
          <span>
            {user?.permissions.includes('view_audit')
              ? 'Every action, accounted for'
              : 'Your authorized activity'}
          </span>
        </>
      ),
      action: user?.permissions.includes('view_audit') ? () => navigate('/audit') : undefined,
    },
    {
      label: 'Open security alerts',
      value: data.open_alerts.toString().padStart(2, '0'),
      icon: ShieldAlert,
      tone: 'amber',
      foot: (
        <>
          <span className={`metric-alert ${data.severity_counts.high ? '' : 'metric-trend'}`}>
            <span />
            {data.severity_counts.high
              ? `${data.severity_counts.high} high priority`
              : 'No high priority alerts'}
          </span>
          <span>to review</span>
        </>
      ),
      action: user?.permissions.includes('view_alerts') ? () => navigate('/alerts') : undefined,
    },
  ]
  return (
    <>
      <PageHeader
        eyebrow="WORKSPACE OVERVIEW"
        title="Security, at a glance."
        description="Your hospital’s data security. A little clearer, a lot calmer."
      >
        <span className="period-select">
          <CalendarDays size={15} />
          <Select
            aria-label="Overview reporting period"
            value={days}
            onChange={event => setDays(Number(event.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </Select>
        </span>
        {user?.permissions.includes('view_audit') && (
          <Button variant="secondary" loading={exporting} onClick={() => void exportReport()}>
            <ArrowDownToLine size={15} />
            Export report
          </Button>
        )}
      </PageHeader>
      <div className="welcome-strip">
        <span className="welcome-icon">
          <ShieldCheck size={19} />
        </span>
        <span>
          <strong>Good to see you, {user?.username.replace(/^Dr\.\s*/, '').split(' ')[0]}.</strong>{' '}
          Your workspace is protected and up to date.
        </span>
        <span className="welcome-status">
          <span />
          LIVE OVERVIEW
        </span>
      </div>
      <div className="metric-grid">
        {metrics.map(metric => (
          <div
            className={`metric-card metric-${metric.tone} ${metric.action ? 'metric-clickable' : ''}`}
            key={metric.label}
            onClick={metric.action}
            onKeyDown={
              metric.action
                ? event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      metric.action?.()
                    }
                  }
                : undefined
            }
            role={metric.action ? 'button' : undefined}
            tabIndex={metric.action ? 0 : undefined}
          >
            <div className="metric-top">
              <span>{metric.label}</span>
              <span className="metric-icon">
                <metric.icon size={19} strokeWidth={1.7} />
              </span>
            </div>
            <div className="metric-value">
              {metric.value}
              <span className="metric-spark" aria-hidden="true">
                {metric.tone === 'green' ? (
                  <svg viewBox="0 0 82 30">
                    <path d="m2 26 13-5 10 2 14-12 10 4L64 5l15-3" />
                  </svg>
                ) : metric.tone === 'blue' ? (
                  <span className="tiny-avatars">
                    {data.team_preview.map(name => (
                      <Avatar name={name} size="small" key={name} />
                    ))}
                    {data.active_staff > 2 && <i>+{data.active_staff - 2}</i>}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="metric-foot">{metric.foot}</div>
          </div>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h2>
                Access activity{' '}
                <span className="info-dot" title="Access events are grouped by UTC day">
                  i
                </span>
              </h2>
              <p>A pulse on your workspace’s access patterns.</p>
            </div>
            <span className="chart-period">{days} days</span>
          </div>
          <div className="chart-summary">
            <div>
              <strong>{data.authorized_total.toLocaleString()}</strong>
              <span>
                authorized events <span className="chart-total-note">this period</span>
              </span>
            </div>
            <div className="chart-legend">
              <span>
                <i />
                Authorized
              </span>
              <span>
                <i />
                Blocked
              </span>
            </div>
          </div>
          <AccessChart points={data.chart} />
          <div className="chart-footer">
            <CheckCheck size={14} />
            <span>
              {data.blocked_total > 0
                ? `${data.blocked_total} unauthorized attempts blocked by access controls`
                : 'No unauthorized attempts in this period'}
            </span>
            <Link to={user?.permissions.includes('view_audit') ? '/audit' : '/vault'}>
              View {user?.permissions.includes('view_audit') ? 'audit trail' : 'records'}{' '}
              <ArrowRight size={13} />
            </Link>
          </div>
        </section>
        <section className="panel posture-panel">
          <div className="panel-heading">
            <h2>Security posture</h2>
            <ShieldCheck size={19} strokeWidth={1.5} />
          </div>
          <div className="posture-score">
            <div
              className="score-ring"
              title="A simple indicator based on open alerts and integrity flags, not an independent security assessment."
            >
              <svg viewBox="0 0 142 142" aria-hidden="true">
                <circle cx="71" cy="71" r="60" className="score-ring-track" />
                <circle
                  cx="71"
                  cy="71"
                  r="60"
                  className="score-ring-progress"
                  strokeDasharray={`${data.security_score * 3.77} 377`}
                />
              </svg>
              <div>
                <ShieldCheck size={19} />
                <strong>
                  {data.security_score}
                  <small>/100</small>
                </strong>
                <span>SECURITY SCORE</span>
              </div>
            </div>
            <Badge tone={data.security_score >= 85 ? 'green' : 'amber'} dot>
              {data.security_score >= 85 ? 'Strong protection' : 'Needs attention'}
            </Badge>
          </div>
          <div className="posture-checklist">
            <div>
              <span>
                <LockKeyhole size={14} />
                AES-256 encryption
              </span>
              <Check size={15} />
            </div>
            <div>
              <span>
                <UsersRound size={14} />
                Role-based access
              </span>
              <Check size={15} />
            </div>
            <div>
              <span>
                <Fingerprint size={14} />
                Activity audit trail
              </span>
              <Check size={15} />
            </div>
          </div>
          <button
            className="posture-link"
            onClick={() =>
              navigate(
                user?.permissions.includes('view_alerts') ? '/alerts' : '/settings?tab=security',
              )
            }
          >
            {data.open_alerts && user?.permissions.includes('view_alerts')
              ? `${data.open_alerts} alerts need your attention`
              : 'View security settings'}
            <ArrowRight size={14} />
          </button>
        </section>
        <section className="panel recent-records-panel">
          <div className="panel-heading">
            <div className="heading-with-count">
              <h2>Recent records</h2>
              <Badge>{data.record_count}</Badge>
            </div>
            <Link className="text-link" to="/vault">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {data.recent_records.length ? (
            <RecordsTable
              records={data.recent_records}
              compact
              onSelect={record => setSelectedRecord(record.id)}
              onDelete={setDeleteRecord}
            />
          ) : (
            <EmptyState
              icon={<FileLock2 size={28} />}
              title="Your vault starts here"
              description="Upload your first record to store it securely."
            />
          )}
          <div className="records-panel-footer">
            <span>
              <ShieldCheck size={13} />
              All records encrypted at rest
            </span>
            {user?.permissions.includes('upload') && (
              <button className="text-link" onClick={openUpload}>
                <Plus size={13} />
                Upload record
              </button>
            )}
          </div>
        </section>
        <section className="panel recent-activity-panel">
          <div className="panel-heading">
            <h2>Recent activity</h2>
            <span className="live-dot" title="Refreshes every 30 seconds" />
          </div>
          <div className="activity-feed">
            {data.recent_activity.map(event => (
              <div className="feed-item" key={event.id}>
                <div className="feed-avatar">
                  <Avatar name={event.actor_name} size="small" />
                  <span
                    className={`feed-action-dot ${event.outcome === 'blocked' ? 'feed-blocked' : ''}`}
                  >
                    {event.outcome === 'blocked' ? <LockKeyhole size={8} /> : <Check size={8} />}
                  </span>
                </div>
                <div>
                  <p>
                    <strong>{event.actor_name}</strong> {actionLabel(event.action).toLowerCase()}
                    {event.outcome === 'blocked' ? ' · blocked' : ''}
                  </p>
                  <span>
                    {timeAgo(event.created_at)}
                    <span className="feed-separator">·</span>
                    {event.action === 'sign_in'
                      ? 'Workspace'
                      : event.outcome === 'blocked'
                        ? 'Access control'
                        : 'Records vault'}
                  </span>
                </div>
              </div>
            ))}
            {!data.recent_activity.length && (
              <p className="empty-feed">Your workspace activity will appear here.</p>
            )}
          </div>
          <Link
            className="activity-view-all"
            to={user?.permissions.includes('view_audit') ? '/audit' : '/vault'}
          >
            View {user?.permissions.includes('view_audit') ? 'all activity' : 'records'}
            <ArrowRight size={14} />
          </Link>
        </section>
      </div>
      <div className="bottom-reassurance">
        <span className="reassurance-icon">
          <ShieldCheck size={25} strokeWidth={1.5} />
        </span>
        <div>
          <strong>Good security makes room for better care.</strong>
          <span>
            {data.record_count} protected records. {formatBytes(data.storage_bytes)} securely
            stored. One less thing to worry about.
          </span>
        </div>
        <button
          onClick={() =>
            navigate(
              user?.permissions.includes('manage_staff') ? '/staff' : '/settings?tab=security',
            )
          }
        >
          Review {user?.permissions.includes('manage_staff') ? 'team access' : 'security'}
          <ChevronRight size={15} />
        </button>
      </div>
      {selectedRecord && (
        <RecordDetail
          recordId={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onDelete={record => {
            setSelectedRecord(null)
            setDeleteRecord(record)
          }}
        />
      )}
      {deleteRecord && (
        <DeleteRecordModal
          record={deleteRecord}
          onClose={() => setDeleteRecord(null)}
          onDeleted={() => setSelectedRecord(null)}
        />
      )}
    </>
  )
}

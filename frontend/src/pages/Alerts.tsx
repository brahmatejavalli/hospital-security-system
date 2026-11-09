import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Fingerprint,
  Info,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useRefresh, useWorkspace } from '../lib/queries'
import type { AlertsResponse, SecurityAlert } from '../lib/types'
import { formatDate, timeAgo } from '../lib/utils'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  InlineError,
  Loading,
  Modal,
  PageHeader,
  Select,
  useToast,
} from '../components/ui'

const severityLabel = { high: 'High priority', medium: 'Medium priority', low: 'Low priority' }
const severityTone = { high: 'red', medium: 'amber', low: 'blue' } as const
export function AlertsPage() {
  const [tab, setTab] = useState('open')
  const [severity, setSeverity] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = Number(searchParams.get('review'))
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['alerts', 'page'],
    queryFn: () => api<AlertsResponse>('/alerts'),
    refetchInterval: 30_000,
  })
  const selected = data?.items.find(alert => alert.id === selectedId)
  const items = data?.items.filter(
    alert => (tab === 'all' || alert.status === tab) && (!severity || alert.severity === severity),
  )
  const navigate = useNavigate()
  const openAlert = (id: number) => setSearchParams({ review: String(id) }, { replace: true })
  return (
    <>
      <PageHeader
        eyebrow="AWARENESS & RESPONSE"
        title="A little attention. A stronger defense."
        description="Review what matters, understand the context, and take the next step."
      >
        <Button variant="secondary" onClick={() => navigate('/audit?outcome=blocked')}>
          <Fingerprint size={16} />
          View audit trail
        </Button>
      </PageHeader>
      <div className="alert-summary-grid">
        {[
          { title: 'Awaiting review', value: data?.summary.open, icon: Clock3, color: 'amber' },
          { title: 'High priority', value: data?.summary.high, icon: ShieldAlert, color: 'red' },
          {
            title: 'Resolved & recorded',
            value: data?.summary.resolved,
            icon: CheckCircle2,
            color: 'green',
          },
        ].map(item => (
          <div className={`alert-summary-card alert-summary-${item.color}`} key={item.title}>
            <span>
              <item.icon size={22} />
            </span>
            <div>
              <strong>{String(item.value ?? '—').padStart(2, '0')}</strong>
              <small>{item.title}</small>
            </div>
          </div>
        ))}
      </div>
      <section className="alerts-section">
        <div className="alerts-toolbar">
          <div className="tabs" role="tablist" aria-label="Alert status">
            {[
              { key: 'open', label: 'Open alerts', count: data?.summary.open },
              { key: 'resolved', label: 'Resolved', count: data?.summary.resolved },
              { key: 'all', label: 'All alerts', count: data?.items.length },
            ].map(item => (
              <button
                key={item.key}
                role="tab"
                aria-selected={tab === item.key}
                className={tab === item.key ? 'tab-active' : ''}
                onClick={() => setTab(item.key)}
              >
                {item.label}
                <span>{item.count ?? 0}</span>
              </button>
            ))}
          </div>
          <Select
            aria-label="Filter by priority"
            value={severity}
            onChange={event => setSeverity(event.target.value)}
          >
            <option value="">All priorities</option>
            <option value="high">High priority</option>
            <option value="medium">Medium priority</option>
            <option value="low">Low priority</option>
          </Select>
        </div>
        {isPending ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error.message} retry={() => void refetch()} />
        ) : items?.length ? (
          <div className="alert-list">
            {items.map(alert => (
              <article
                className={`alert-card alert-card-${alert.severity} ${alert.status === 'resolved' ? 'alert-card-resolved' : ''}`}
                key={alert.id}
              >
                <span
                  className={`alert-type-icon severity-${alert.status === 'resolved' ? 'resolved' : alert.severity}`}
                >
                  {alert.status === 'resolved' ? (
                    <CheckCircle2 size={23} />
                  ) : alert.severity === 'high' ? (
                    <ShieldAlert size={23} />
                  ) : alert.severity === 'medium' ? (
                    <TriangleAlert size={23} />
                  ) : (
                    <Info size={23} />
                  )}
                </span>
                <div className="alert-card-main">
                  <div className="alert-card-labels">
                    <Badge
                      tone={alert.status === 'resolved' ? 'green' : severityTone[alert.severity]}
                      dot
                    >
                      {alert.status === 'resolved' ? 'Resolved' : severityLabel[alert.severity]}
                    </Badge>
                    {alert.is_demo && <span className="sample-label">Sample alert</span>}
                    <time>{timeAgo(alert.created_at)}</time>
                  </div>
                  <button className="alert-title" onClick={() => openAlert(alert.id)}>
                    {alert.title}
                  </button>
                  <p>{alert.description}</p>
                  <div className="alert-meta">
                    <span>
                      Source: <code>{alert.source_ip}</code>
                    </span>
                    <span className="meta-dot">·</span>
                    <span>Alert #{String(alert.id).padStart(4, '0')}</span>
                    {alert.status === 'resolved' && (
                      <>
                        <span className="meta-dot">·</span>
                        <span>Reviewed by {alert.resolved_by}</span>
                      </>
                    )}
                  </div>
                </div>
                <Button variant="secondary" onClick={() => openAlert(alert.id)}>
                  {alert.status === 'resolved' ? 'View details' : 'Review alert'}
                  <ChevronRight size={15} />
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel">
            <EmptyState
              icon={<ShieldCheck size={34} />}
              title={tab === 'open' ? 'A clear view. Nothing to review.' : 'No alerts in this view'}
              description={
                tab === 'open'
                  ? 'There are no open alerts matching your filters. We’ll keep the workspace audit trail ready for you.'
                  : 'Try another status or priority.'
              }
            />
          </div>
        )}
      </section>
      <div className="alert-help-note">
        <ShieldCheck size={21} />
        <div>
          <strong>Good security is a team effort.</strong>
          <p>
            Alerts capture application events, such as blocked record access and repeated failed
            sign-ins. Review sample alerts as a guide—not evidence of a real incident.
          </p>
        </div>
      </div>
      {selected && (
        <AlertDetail alert={selected} onClose={() => setSearchParams({}, { replace: true })} />
      )}
    </>
  )
}

function AlertDetail({ alert, onClose }: { alert: SecurityAlert; onClose: () => void }) {
  const { user } = useAuth()
  const { data: workspace } = useWorkspace()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = useRefresh()
  const toast = useToast()
  const navigate = useNavigate()
  const resolve = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api(`/alerts/${alert.id}/resolve`, { method: 'POST', body: JSON.stringify({ note }) })
      await refresh()
      toast('Alert resolved. Your review has been recorded in the audit trail.')
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title="Review security alert"
      description={`Alert #${String(alert.id).padStart(4, '0')}`}
      onClose={() => {
        if (!busy) onClose()
      }}
      drawer
    >
      <form onSubmit={resolve}>
        <div className="modal-body">
          <div className="alert-detail-title">
            <Badge tone={alert.status === 'resolved' ? 'green' : severityTone[alert.severity]} dot>
              {alert.status === 'resolved' ? 'Resolved' : severityLabel[alert.severity]}
            </Badge>
            <h3>{alert.title}</h3>
            <p>{alert.description}</p>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Detected at</dt>
              <dd>{formatDate(alert.created_at, workspace?.timezone, true)}</dd>
            </div>
            <div>
              <dt>Source IP</dt>
              <dd className="mono">{alert.source_ip}</dd>
            </div>
            <div>
              <dt>Event origin</dt>
              <dd>{alert.is_demo ? 'Synthetic demo alert' : 'Application security event'}</dd>
            </div>
          </dl>
          <div className="recommendation-box">
            <strong>
              <ShieldCheck size={16} />
              Recommended next step
            </strong>
            <p>{alert.recommendation}</p>
            <button
              type="button"
              onClick={() => {
                onClose()
                navigate(`/audit?q=${encodeURIComponent(alert.source_ip)}`)
              }}
            >
              Inspect related activity <ArrowRight size={14} />
            </button>
          </div>
          {alert.status === 'resolved' ? (
            <div className="resolution-box">
              <strong>
                <CheckCircle2 size={17} />
                Reviewed by {alert.resolved_by}
              </strong>
              <p>{alert.resolution_note}</p>
              <small>{formatDate(alert.resolved_at, workspace?.timezone, true)}</small>
            </div>
          ) : user?.permissions.includes('resolve_alerts') ? (
            <Field
              label="Resolution note"
              hint="Explain what you verified and any action you took."
            >
              <textarea
                className="textarea"
                aria-label="Resolution note"
                rows={4}
                placeholder="e.g. Verified with the team member. Access was expected during an on-call shift."
                value={note}
                onChange={event => setNote(event.target.value)}
                minLength={3}
                maxLength={1000}
                required
              />
            </Field>
          ) : (
            <div className="info-note">
              Only administrators can resolve alerts. Your auditor role has read-only access.
            </div>
          )}
          <InlineError message={error} />
        </div>
        <div className="modal-footer">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Close
          </Button>
          {alert.status === 'open' && user?.permissions.includes('resolve_alerts') && (
            <Button type="submit" loading={busy}>
              <Check size={16} />
              Mark resolved
            </Button>
          )}
        </div>
      </form>
    </Modal>
  )
}

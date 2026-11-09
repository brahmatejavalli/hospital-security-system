import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  ArrowDownToLine,
  CalendarDays,
  ChevronRight,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react'
import { api, download, params } from '../lib/api'
import { useDebounce } from '../lib/hooks'
import { useWorkspace } from '../lib/queries'
import type { AuditEvent, AuditResponse } from '../lib/types'
import { actionLabel, formatDate, recordTitle } from '../lib/utils'
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Loading,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  useToast,
} from '../components/ui'

export function AuditPage() {
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [action, setAction] = useState('')
  const [outcome, setOutcome] = useState(searchParams.get('outcome') ?? '')
  const [days, setDays] = useState(30)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<AuditEvent | null>(null)
  const [exporting, setExporting] = useState(false)
  const debounced = useDebounce(query)
  const { data: workspace } = useWorkspace()
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['audit', { q: debounced, action, outcome, days, page }],
    queryFn: () =>
      api<AuditResponse>(`/audit${params({ q: debounced, action, outcome, days, page })}`),
    placeholderData: keepPreviousData,
  })
  const toast = useToast()
  const exportReport = async () => {
    setExporting(true)
    try {
      await download(
        `/audit/export${params({ q: debounced, action, outcome, days })}`,
        'medguard-audit-trail.csv',
      )
      toast('Filtered audit trail exported. Up to 10,000 events are included.')
      void refetch()
    } catch (err) {
      toast((err as Error).message, true)
    } finally {
      setExporting(false)
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="VISIBILITY & ACCOUNTABILITY"
        title="Every action. A clearer picture."
        description="Know who did what, and when. With a trail that stays intact."
      >
        <span className="period-select">
          <CalendarDays size={15} />
          <Select
            aria-label="Audit reporting period"
            value={days}
            onChange={event => {
              setDays(Number(event.target.value))
              setPage(1)
            }}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </Select>
        </span>
        <Button variant="secondary" loading={exporting} onClick={() => void exportReport()}>
          <ArrowDownToLine size={15} />
          Export audit trail
        </Button>
      </PageHeader>
      <div className="audit-banner">
        <span>
          <Fingerprint size={25} />
        </span>
        <div>
          <strong>Accountability, by design.</strong>
          <p>
            Sign-ins, record access, permission changes, and security decisions — recorded in one
            place.
          </p>
        </div>
        <Badge tone="green">
          <ShieldCheck size={12} />
          Read-only history
        </Badge>
      </div>
      <section className="panel full-table-panel">
        <div className="table-panel-title">
          <div className="heading-with-count">
            <h2>Activity log</h2>
            <Badge>{data?.total ?? '—'} events</Badge>
          </div>
          <span className="subtle-label">
            Times shown in {workspace?.timezone ?? 'your timezone'}
          </span>
        </div>
        <div className="filter-toolbar">
          <SearchInput
            value={query}
            label="Search audit events"
            onChange={value => {
              setQuery(value)
              setPage(1)
            }}
            placeholder="Search people, records, or source IP…"
          />
          <div className="filter-controls">
            <Select
              aria-label="Filter by event type"
              value={action}
              onChange={event => {
                setAction(event.target.value)
                setPage(1)
              }}
            >
              <option value="">All event types</option>
              {data?.actions.map(value => (
                <option value={value} key={value}>
                  {actionLabel(value)}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by outcome"
              value={outcome}
              onChange={event => {
                setOutcome(event.target.value)
                setPage(1)
              }}
            >
              <option value="">All outcomes</option>
              <option value="success">Success</option>
              <option value="blocked">Blocked</option>
            </Select>
          </div>
        </div>
        {isPending ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error.message} retry={() => void refetch()} />
        ) : data?.items.length ? (
          <>
            <div className="table-scroll">
              <table className="data-table audit-table">
                <thead>
                  <tr>
                    <th>Team member</th>
                    <th>Action & resource</th>
                    <th>Source IP</th>
                    <th>Outcome</th>
                    <th>Date & time</th>
                    <th>
                      <span className="sr-only">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map(event => (
                    <tr key={event.id}>
                      <td>
                        <div className="audit-actor">
                          <Avatar name={event.actor_name} size="small" />
                          <strong>{event.actor_name}</strong>
                        </div>
                      </td>
                      <td>
                        <button className="audit-resource" onClick={() => setSelected(event)}>
                          <strong>{actionLabel(event.action)}</strong>
                          <small>
                            {event.resource.endsWith('.pdf')
                              ? recordTitle(event.resource)
                              : event.resource}
                          </small>
                        </button>
                      </td>
                      <td>
                        <code className="ip-address">{event.ip_address}</code>
                      </td>
                      <td>
                        <Badge tone={event.outcome === 'success' ? 'green' : 'amber'} dot>
                          {event.outcome === 'success' ? 'Success' : 'Blocked'}
                        </Badge>
                      </td>
                      <td className="audit-date">
                        {formatDate(event.created_at, workspace?.timezone, true)}
                        {event.is_demo && <small>Sample event</small>}
                      </td>
                      <td>
                        <button
                          className="row-details-button"
                          aria-label={`View event ${event.id}`}
                          onClick={() => setSelected(event)}
                        >
                          <ChevronRight size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={12}
              total={data.total}
              onChange={setPage}
              noun="events"
            />
          </>
        ) : (
          <EmptyState
            icon={<Fingerprint size={28} />}
            title="No events in this view"
            description="Try a broader time range or adjust your filters."
          />
        )}
      </section>
      <div className="page-note">
        <LockKeyhole size={14} />
        <span>
          Audit events cannot be edited or deleted through the application. CSV exports respect your
          current filters.
        </span>
      </div>
      {selected && (
        <Modal
          title="Activity details"
          description={`Audit event #${selected.id}`}
          onClose={() => setSelected(null)}
          drawer
        >
          <div className="modal-body">
            <div className="audit-detail-header">
              <span>
                <Fingerprint size={28} />
              </span>
              <h3>{actionLabel(selected.action)}</h3>
              <Badge tone={selected.outcome === 'success' ? 'green' : 'amber'} dot>
                {selected.outcome === 'success' ? 'Successful action' : 'Access blocked'}
              </Badge>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Team member</dt>
                <dd>{selected.actor_name}</dd>
              </div>
              <div>
                <dt>Date & time</dt>
                <dd>{formatDate(selected.created_at, workspace?.timezone, true)}</dd>
              </div>
              <div>
                <dt>Source IP</dt>
                <dd className="mono">{selected.ip_address}</dd>
              </div>
              <div>
                <dt>Event type</dt>
                <dd className="mono">{selected.action}</dd>
              </div>
            </dl>
            <div className="audit-detail-section">
              <span className="eyebrow">RESOURCE</span>
              <p>{selected.resource}</p>
              {selected.resource_id && <small className="mono">{selected.resource_id}</small>}
            </div>
            <div className="audit-detail-section">
              <span className="eyebrow">EVENT DETAILS</span>
              <p>{selected.detail || 'No additional details recorded.'}</p>
            </div>
            {selected.is_demo && (
              <div className="info-note">
                This is a synthetic historical event included with the demo workspace.
              </div>
            )}
          </div>
          <div className="modal-footer">
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Close
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}

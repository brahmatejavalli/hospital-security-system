import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import {
  ArrowDownUp,
  FileLock2,
  HardDrive,
  LockKeyhole,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { api, params } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useDebounce } from '../lib/hooks'
import type { Dashboard, Paginated, RecordFile } from '../lib/types'
import { formatBytes } from '../lib/utils'
import type { LayoutContext } from '../components/Layout'
import { DeleteRecordModal, RecordDetail, RecordsTable } from '../components/Records'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
} from '../components/ui'

export function VaultPage() {
  const { user, config } = useAuth()
  const { openUpload } = useOutletContext<LayoutContext>()
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const selectedId = searchParams.get('record')
  const [department, setDepartment] = useState('')
  const [classification, setClassification] = useState('')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)
  const [deleteRecord, setDeleteRecord] = useState<RecordFile | null>(null)
  const debounced = useDebounce(query)
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['records', { q: debounced, department, classification, sort, page }],
    queryFn: () =>
      api<Paginated<RecordFile>>(
        `/records${params({ q: debounced, department, classification, sort, page, page_size: 10 })}`,
      ),
    placeholderData: keepPreviousData,
  })
  const { data: dashboard } = useQuery({
    queryKey: ['dashboard', 7],
    queryFn: () => api<Dashboard>('/dashboard?days=7'),
  })
  const selectRecord = (recordId: string | null) =>
    setSearchParams(
      previous => {
        if (recordId) previous.set('record', recordId)
        else previous.delete('record')
        return previous
      },
      { replace: true },
    )
  const changeSearch = (value: string) => {
    setPage(1)
    setSearchParams(
      previous => {
        if (value) previous.set('q', value)
        else previous.delete('q')
        return previous
      },
      { replace: true },
    )
  }
  const clear = () => {
    changeSearch('')
    setDepartment('')
    setClassification('')
    setSort('newest')
    setPage(1)
  }
  return (
    <>
      <PageHeader
        eyebrow="ENCRYPTED RECORDS"
        title="A safer place for every record."
        description="Store, organize, and share with the right people. Securely."
      >
        {user?.permissions.includes('upload') && (
          <Button onClick={openUpload}>
            <Plus size={17} />
            Upload record
          </Button>
        )}
      </PageHeader>
      <div className="vault-summary">
        <div>
          <span className="summary-symbol">
            <FileLock2 size={19} />
          </span>
          <span>
            <strong>{dashboard?.record_count ?? '—'}</strong> protected records
          </span>
        </div>
        <span className="summary-divider" />
        <div>
          <HardDrive size={17} />
          <span>
            <strong>{formatBytes(dashboard?.storage_bytes ?? 0)}</strong> securely stored
          </span>
        </div>
        <span className="summary-divider" />
        <div>
          <ShieldCheck size={17} />
          <span>AES-256 encryption, always on</span>
        </div>
        <Badge tone="green" dot>
          Private by default
        </Badge>
      </div>
      <section className="panel full-table-panel">
        <div className="table-panel-title">
          <div className="heading-with-count">
            <h2>All records</h2>
            <Badge>{data?.total ?? '—'}</Badge>
          </div>
          <span className="subtle-label">
            <LockKeyhole size={13} />
            Secure records vault
          </span>
        </div>
        <div className="filter-toolbar">
          <SearchInput
            label="Search records"
            placeholder="Search records or patient ID…"
            value={query}
            onChange={changeSearch}
          />
          <div className="filter-controls">
            <Select
              aria-label="Filter by department"
              value={department}
              onChange={event => {
                setDepartment(event.target.value)
                setPage(1)
              }}
            >
              <option value="">All departments</option>
              {config?.departments.map(value => (
                <option key={value}>{value}</option>
              ))}
            </Select>
            <Select
              aria-label="Filter by classification"
              value={classification}
              onChange={event => {
                setClassification(event.target.value)
                setPage(1)
              }}
            >
              <option value="">All classifications</option>
              {config?.classifications.map(value => (
                <option key={value}>{value}</option>
              ))}
            </Select>
            <span className="sort-select">
              <ArrowDownUp size={14} />
              <Select
                aria-label="Sort records"
                value={sort}
                onChange={event => {
                  setSort(event.target.value)
                  setPage(1)
                }}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name A–Z</option>
              </Select>
            </span>
          </div>
        </div>
        {(query || department || classification) && (
          <div className="active-filters">
            <SlidersHorizontal size={13} />
            <span>{data?.total ?? 0} matching records</span>
            <button onClick={clear}>Clear filters</button>
            {isFetching && <span className="updating-label">Updating…</span>}
          </div>
        )}
        {isPending ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error.message} retry={() => void refetch()} />
        ) : data?.items.length ? (
          <>
            <RecordsTable
              records={data.items}
              onSelect={record => selectRecord(record.id)}
              onDelete={setDeleteRecord}
            />
            <Pagination
              page={page}
              pageSize={10}
              total={data.total}
              onChange={setPage}
              noun="records"
            />
          </>
        ) : (
          <EmptyState
            icon={<FileLock2 size={28} />}
            title={
              query || department || classification
                ? 'No records match these filters'
                : 'Your vault is ready'
            }
            description={
              query || department || classification
                ? 'Try a different search or clear your filters.'
                : 'Add your first record. We’ll take care of the encryption.'
            }
          >
            {query || department || classification ? (
              <Button variant="secondary" onClick={clear}>
                Clear filters
              </Button>
            ) : (
              user?.permissions.includes('upload') && (
                <Button onClick={openUpload}>
                  <Plus size={15} />
                  Upload a record
                </Button>
              )
            )}
          </EmptyState>
        )}
      </section>
      <div className="page-note">
        <ShieldCheck size={15} />
        <span>
          Files are encrypted before storage. Every download is authenticated and integrity-checked.
        </span>
      </div>
      {selectedId && (
        <RecordDetail
          recordId={selectedId}
          onClose={() => selectRecord(null)}
          onDelete={record => {
            selectRecord(null)
            setDeleteRecord(record)
          }}
        />
      )}
      {deleteRecord && (
        <DeleteRecordModal
          record={deleteRecord}
          onClose={() => setDeleteRecord(null)}
          onDeleted={() => selectRecord(null)}
        />
      )}
    </>
  )
}

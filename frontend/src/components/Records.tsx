import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Copy,
  Download,
  FileCheck2,
  FileText,
  FileUp,
  FolderLock,
  Image,
  LockKeyhole,
  MoreHorizontal,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { api, download } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useRefresh, useWorkspace } from '../lib/queries'
import type { RecordFile } from '../lib/types'
import { formatBytes, formatDate, recordTitle } from '../lib/utils'
import {
  Avatar,
  Badge,
  Button,
  Dropdown,
  ErrorState,
  Field,
  IconButton,
  InlineError,
  Input,
  Loading,
  Modal,
  Select,
  useToast,
} from './ui'

export function FileIcon({
  record,
  large = false,
}: {
  record: Pick<RecordFile, 'content_type'>
  large?: boolean
}) {
  const isImage = record.content_type.startsWith('image/')
  const type =
    record.content_type === 'application/pdf'
      ? 'PDF'
      : record.content_type === 'text/csv'
        ? 'CSV'
        : 'TXT'
  return (
    <span
      className={`file-icon ${isImage ? 'file-icon-image' : ''} ${large ? 'file-icon-large' : ''}`}
    >
      {isImage ? <Image size={large ? 30 : 21} /> : <FileText size={large ? 30 : 21} />}
      {!isImage && <span>{type}</span>}
    </span>
  )
}
export function ClassificationBadge({ value }: { value: RecordFile['classification'] }) {
  return (
    <Badge tone={value === 'Restricted' ? 'purple' : value === 'Internal' ? 'blue' : 'neutral'}>
      {value === 'Restricted' && <LockKeyhole size={10} />}
      {value}
    </Badge>
  )
}

export function RecordsTable({
  records,
  compact = false,
  onSelect,
  onDelete,
}: {
  records: RecordFile[]
  compact?: boolean
  onSelect: (record: RecordFile) => void
  onDelete?: (record: RecordFile) => void
}) {
  const { user } = useAuth()
  const { data: workspace } = useWorkspace()
  const toast = useToast()
  const refresh = useRefresh()
  const [downloading, setDownloading] = useState<string | null>(null)
  const handleDownload = async (record: RecordFile) => {
    setDownloading(record.id)
    try {
      await download(`/records/${record.id}/download`, record.filename)
      toast('Record verified and downloaded.')
      void refresh()
    } catch (error) {
      toast((error as Error).message, true)
      void refresh()
    } finally {
      setDownloading(null)
    }
  }
  return (
    <div className="table-scroll">
      <table className={`data-table records-table ${compact ? 'compact-table' : ''}`}>
        <thead>
          <tr>
            <th>Record name</th>
            {!compact && <th>Patient ID</th>}
            <th>{compact ? 'Department' : 'Classification'}</th>
            <th>{compact ? 'Status' : 'Uploaded by'}</th>
            {!compact && <th>Added</th>}
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map(record => (
            <tr key={record.id}>
              <td>
                <button className="file-name-cell" onClick={() => onSelect(record)}>
                  <FileIcon record={record} />
                  <span>
                    <strong>{recordTitle(record.filename)}</strong>
                    <small>
                      {compact
                        ? record.patient_id
                        : `${record.category} · ${formatBytes(record.size)}`}
                    </small>
                  </span>
                </button>
              </td>
              {!compact && (
                <td>
                  <span className="patient-id">{record.patient_id}</span>
                </td>
              )}
              <td>
                {compact ? (
                  <span className="department-text">{record.department}</span>
                ) : (
                  <ClassificationBadge value={record.classification} />
                )}
              </td>
              <td>
                {compact ? (
                  <span
                    className={`encrypted-status ${record.integrity_status !== 'verified' ? 'warning-status' : ''}`}
                  >
                    <ShieldCheck size={13} />
                    {record.integrity_status === 'verified' ? 'Encrypted' : 'Review'}
                  </span>
                ) : (
                  <div className="uploader">
                    <Avatar name={record.uploader_name} size="small" />
                    <span>{record.uploader_name.replace('Dr. ', '')}</span>
                  </div>
                )}
              </td>
              {!compact && (
                <td className="muted nowrap">
                  {formatDate(record.created_at, workspace?.timezone)}
                </td>
              )}
              <td>
                <Dropdown
                  trigger={(open, toggle) => (
                    <IconButton
                      label={`Actions for ${recordTitle(record.filename)}`}
                      aria-expanded={open}
                      onClick={toggle}
                    >
                      <MoreHorizontal size={19} />
                    </IconButton>
                  )}
                >
                  {close => (
                    <>
                      <button
                        className="menu-item"
                        onClick={() => {
                          close()
                          onSelect(record)
                        }}
                      >
                        <FileText size={15} />
                        View details
                      </button>
                      {user?.permissions.includes('download') && (
                        <button
                          className="menu-item"
                          disabled={downloading === record.id}
                          onClick={() => {
                            close()
                            void handleDownload(record)
                          }}
                        >
                          <Download size={15} />
                          Download record
                        </button>
                      )}
                      {onDelete && user?.permissions.includes('delete') && (
                        <>
                          <div className="menu-divider" />
                          <button
                            className="menu-item danger-text"
                            onClick={() => {
                              close()
                              onDelete(record)
                            }}
                          >
                            <Trash2 size={15} />
                            Delete record
                          </button>
                        </>
                      )}
                    </>
                  )}
                </Dropdown>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function UploadModal({ onClose }: { onClose: () => void }) {
  const { config, user } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [patientId, setPatientId] = useState('')
  const [category, setCategory] = useState('Lab report')
  const [department, setDepartment] = useState(
    user?.department === 'Administration'
      ? 'General Medicine'
      : (user?.department ?? 'General Medicine'),
  )
  const [classification, setClassification] = useState('Confidential')
  const fileInput = useRef<HTMLInputElement>(null)
  const refresh = useRefresh()
  const toast = useToast()
  const chooseFile = (selected: File | undefined) => {
    if (!selected) return
    if (selected.size > (config?.max_upload_bytes ?? 10 * 1024 * 1024)) {
      setError('This file is too large. The maximum size is 10 MB.')
      return
    }
    if (!/\.(pdf|png|jpe?g|csv|txt)$/i.test(selected.name)) {
      setError('Choose a PDF, PNG, JPG, CSV, or text file.')
      return
    }
    if (!selected.size) {
      setError('This file is empty. Choose a file with content.')
      return
    }
    setFile(selected)
    setError(null)
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    chooseFile(event.dataTransfer.files[0])
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!file) {
      setError('Choose a record to upload.')
      return
    }
    setBusy(true)
    setError(null)
    const data = new FormData()
    data.append('file', file)
    data.append('patient_id', patientId)
    data.append('category', category)
    data.append('department', department)
    data.append('classification', classification)
    try {
      await api<RecordFile>('/records', { method: 'POST', body: data })
      await refresh()
      toast('Record encrypted and securely added to your vault.')
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title="Upload a record"
      description="A secure home for your hospital’s important information."
      onClose={() => {
        if (!busy) onClose()
      }}
      wide
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <input
            ref={fileInput}
            type="file"
            className="sr-only"
            aria-label="Choose record file"
            accept=".pdf,.png,.jpg,.jpeg,.csv,.txt"
            onChange={(event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0])}
          />
          {file ? (
            <div className="selected-file">
              <span className="selected-file-icon">
                <FileCheck2 size={26} />
              </span>
              <span>
                <strong>{file.name}</strong>
                <small>{formatBytes(file.size)} · Ready to encrypt</small>
              </span>
              <IconButton
                label="Remove selected file"
                onClick={() => {
                  setFile(null)
                  if (fileInput.current) fileInput.current.value = ''
                }}
                type="button"
              >
                <X size={17} />
              </IconButton>
            </div>
          ) : (
            <button
              type="button"
              className={`upload-zone ${dragging ? 'dragging' : ''}`}
              onDragOver={event => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInput.current?.click()}
            >
              <span className="upload-zone-icon">
                <FileUp size={25} />
              </span>
              <strong>
                <span>Click to upload</span> or drag and drop
              </strong>
              <small>PDF, PNG, JPG, CSV or TXT · Up to 10 MB</small>
            </button>
          )}
          <div className="form-grid">
            <Field label="Patient reference ID" hint="Use an identifier, not a patient’s name.">
              <Input
                aria-label="Patient reference ID"
                placeholder="e.g. GF-2026-1048"
                value={patientId}
                onChange={event => setPatientId(event.target.value)}
                required
                minLength={2}
                maxLength={40}
              />
            </Field>
            <Field label="Record type">
              <Select
                aria-label="Record type"
                value={category}
                onChange={event => setCategory(event.target.value)}
              >
                {config?.categories.map(value => (
                  <option key={value}>{value}</option>
                ))}
              </Select>
            </Field>
            <Field label="Department">
              <Select
                aria-label="Department"
                value={department}
                onChange={event => setDepartment(event.target.value)}
              >
                {config?.departments.map(value => (
                  <option key={value}>{value}</option>
                ))}
              </Select>
            </Field>
            <Field label="Classification">
              <Select
                aria-label="Classification"
                value={classification}
                onChange={event => setClassification(event.target.value)}
              >
                {config?.classifications
                  .filter(value => user?.role !== 'nurse' || value !== 'Restricted')
                  .map(value => (
                    <option key={value}>{value}</option>
                  ))}
              </Select>
            </Field>
          </div>
          <div className="secure-note">
            <LockKeyhole size={17} />
            <span>
              Encrypted with AES-256 before storage. Integrity is verified with SHA3-256 on every
              download.
            </span>
          </div>
          <InlineError message={error} />
        </div>
        <div className="modal-footer">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            <Upload size={16} />
            {busy ? 'Encrypting & uploading…' : 'Encrypt & upload'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function RecordDetail({
  recordId,
  onClose,
  onDelete,
}: {
  recordId: string
  onClose: () => void
  onDelete?: (record: RecordFile) => void
}) {
  const {
    data: record,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['records', recordId],
    queryFn: () => api<RecordFile>(`/records/${recordId}`),
  })
  const { data: workspace } = useWorkspace()
  const { user } = useAuth()
  const toast = useToast()
  const refresh = useRefresh()
  const [busy, setBusy] = useState(false)
  const getFile = async () => {
    if (!record) return
    setBusy(true)
    try {
      await download(`/records/${record.id}/download`, record.filename)
      toast('Integrity verified. Your download is ready.')
      void refresh()
    } catch (err) {
      toast((err as Error).message, true)
      void refresh()
    } finally {
      setBusy(false)
    }
  }
  const copyHash = async () => {
    try {
      await navigator.clipboard.writeText(record?.hash ?? '')
      toast('SHA3-256 checksum copied.')
    } catch {
      toast('Your browser couldn’t copy the checksum. Select the text to copy it.', true)
    }
  }
  return (
    <Modal
      title="Record details"
      description="Every detail. Securely accounted for."
      onClose={onClose}
      drawer
    >
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error.message} retry={() => void refetch()} />
      ) : (
        record && (
          <>
            <div className="modal-body record-detail-body">
              <div className="record-detail-file">
                <FileIcon record={record} large />
                <h3>{recordTitle(record.filename)}</h3>
                <p>{record.filename}</p>
                <ClassificationBadge value={record.classification} />
              </div>
              <div className="detail-security">
                <ShieldCheck size={20} />
                <span>
                  <strong>
                    {record.integrity_status === 'verified'
                      ? 'Encrypted & protected'
                      : 'Integrity review required'}
                  </strong>
                  <small>
                    {record.integrity_status === 'verified'
                      ? 'Authentication and checksum verified on download'
                      : 'Downloads are blocked if verification fails'}
                  </small>
                </span>
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Patient reference</dt>
                  <dd className="mono">{record.patient_id}</dd>
                </div>
                <div>
                  <dt>Record type</dt>
                  <dd>{record.category}</dd>
                </div>
                <div>
                  <dt>Department</dt>
                  <dd>{record.department}</dd>
                </div>
                <div>
                  <dt>File size</dt>
                  <dd>{formatBytes(record.size)}</dd>
                </div>
                <div>
                  <dt>Uploaded by</dt>
                  <dd>{record.uploader_name}</dd>
                </div>
                <div>
                  <dt>Added on</dt>
                  <dd>{formatDate(record.created_at, workspace?.timezone, true)}</dd>
                </div>
                <div>
                  <dt>Encryption</dt>
                  <dd>{record.encryption}</dd>
                </div>
              </dl>
              <div className="checksum-box">
                <div>
                  <span>SHA3-256 CHECKSUM</span>
                  <IconButton label="Copy checksum" onClick={() => void copyHash()}>
                    <Copy size={15} />
                  </IconButton>
                </div>
                <code>{record.hash}</code>
              </div>
              {user?.role === 'nurse' && record.classification === 'Restricted' && (
                <div className="secure-note">
                  <LockKeyhole size={16} />
                  <span>
                    Restricted records can only be downloaded by doctors and administrators.
                  </span>
                </div>
              )}
              {user?.role === 'auditor' && (
                <p className="field-hint">
                  Auditor access includes metadata only, not record contents.
                </p>
              )}
            </div>
            <div className="modal-footer">
              <div className="footer-left">
                {onDelete && user?.permissions.includes('delete') && (
                  <IconButton
                    label="Delete record"
                    className="danger-text"
                    onClick={() => onDelete(record)}
                  >
                    <Trash2 size={19} />
                  </IconButton>
                )}
              </div>
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              {user?.permissions.includes('download') && (
                <Button
                  onClick={() => void getFile()}
                  loading={busy}
                  disabled={user.role === 'nurse' && record.classification === 'Restricted'}
                >
                  <Download size={16} />
                  Download
                </Button>
              )}
            </div>
          </>
        )
      )}
    </Modal>
  )
}

export function DeleteRecordModal({
  record,
  onClose,
  onDeleted,
}: {
  record: RecordFile
  onClose: () => void
  onDeleted?: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = useRefresh()
  const toast = useToast()
  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await api(`/records/${record.id}`, { method: 'DELETE' })
      await refresh()
      toast('Record deleted. Its audit history has been retained.')
      onDeleted?.()
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title="Delete this record?"
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <div className="modal-body">
        <div className="delete-warning-icon">
          <FolderLock size={27} />
        </div>
        <p className="confirm-text">
          <strong>{recordTitle(record.filename)}</strong> and its encrypted file will be permanently
          removed. This cannot be undone. Its audit history will be retained.
        </p>
        <InlineError message={error} />
      </div>
      <div className="modal-footer">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Keep record
        </Button>
        <Button variant="danger" loading={busy} onClick={() => void remove()}>
          <Trash2 size={16} />
          Delete record
        </Button>
      </div>
    </Modal>
  )
}

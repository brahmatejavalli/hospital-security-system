import { useState } from 'react'
import type { FormEvent } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Building2,
  ChevronRight,
  KeyRound,
  MoreHorizontal,
  Plus,
  Shield,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { api, params } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useDebounce } from '../lib/hooks'
import { useRefresh, useWorkspace } from '../lib/queries'
import type { Role, StaffResponse, User } from '../lib/types'
import { formatDate, roleLabels, timeAgo } from '../lib/utils'
import {
  Avatar,
  Badge,
  Button,
  Dropdown,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  InlineError,
  Input,
  Loading,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  useToast,
} from '../components/ui'

const roleDescriptions: Record<Role, string> = {
  admin: 'Full workspace access, including records, people, security, and settings.',
  doctor: 'Upload and download records, including records classified as Restricted.',
  nurse: 'Upload and download Internal and Confidential records. No Restricted access.',
  auditor:
    'Read-only access to record metadata, audit events, and security alerts. No file downloads.',
}
const roleTones = { admin: 'purple', doctor: 'blue', nurse: 'green', auditor: 'neutral' } as const

export function StaffPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [resetting, setResetting] = useState<User | null>(null)
  const [showRoles, setShowRoles] = useState(false)
  const { user } = useAuth()
  const { data: workspace } = useWorkspace()
  const debounced = useDebounce(query)
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['staff', { q: debounced, role, status, page }],
    queryFn: () => api<StaffResponse>(`/staff${params({ q: debounced, role, status, page })}`),
    placeholderData: keepPreviousData,
  })
  return (
    <>
      <PageHeader
        eyebrow="TEAM & PERMISSIONS"
        title="The right people. The right access."
        description="Build a trusted team, with a clear boundary for every role."
      >
        <Button variant="secondary" onClick={() => setShowRoles(true)}>
          <KeyRound size={15} />
          Role guide
        </Button>
        <Button onClick={() => setAdding(true)}>
          <UserPlus size={16} />
          Add team member
        </Button>
      </PageHeader>
      <div className="team-summary-grid">
        {[
          { label: 'Team members', value: data?.summary.total, icon: UsersRound },
          { label: 'Active accounts', value: data?.summary.active, icon: UserCheck },
          { label: 'Administrators', value: data?.summary.admins, icon: ShieldCheck },
          { label: 'Departments', value: data?.summary.departments, icon: Building2 },
        ].map(item => (
          <div className="team-summary-card" key={item.label}>
            <span>
              <item.icon size={20} />
            </span>
            <div>
              <strong>{item.value ?? '—'}</strong>
              <small>{item.label}</small>
            </div>
          </div>
        ))}
      </div>
      <section className="panel full-table-panel">
        <div className="table-panel-title">
          <div className="heading-with-count">
            <h2>Your team</h2>
            <Badge>{data?.total ?? '—'}</Badge>
          </div>
          <span className="subtle-label">
            <Shield size={13} />
            Access is verified on every request
          </span>
        </div>
        <div className="filter-toolbar">
          <SearchInput
            label="Search team members"
            placeholder="Search by name, email, or department…"
            value={query}
            onChange={value => {
              setPage(1)
              setSearchParams(value ? { q: value } : {}, { replace: true })
            }}
          />
          <div className="filter-controls">
            <Select
              aria-label="Filter by role"
              value={role}
              onChange={event => {
                setRole(event.target.value)
                setPage(1)
              }}
            >
              <option value="">All roles</option>
              {Object.entries(roleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by account status"
              value={status}
              onChange={event => {
                setStatus(event.target.value)
                setPage(1)
              }}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
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
              <table className="data-table staff-table">
                <thead>
                  <tr>
                    <th>Team member</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th>Last active</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map(member => (
                    <tr key={member.id}>
                      <td>
                        <button className="staff-name" onClick={() => setEditing(member)}>
                          <Avatar name={member.username} />
                          <span>
                            <strong>
                              {member.username}
                              {member.id === user?.id && <em>You</em>}
                            </strong>
                            <small>{member.email}</small>
                          </span>
                        </button>
                      </td>
                      <td>
                        <Badge tone={roleTones[member.role]}>
                          {member.role === 'admin' && <Shield size={11} />}
                          {roleLabels[member.role]}
                        </Badge>
                      </td>
                      <td className="department-text">{member.department}</td>
                      <td>
                        <Badge tone={member.is_active ? 'green' : 'neutral'} dot>
                          {member.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td
                        className="muted nowrap"
                        title={formatDate(member.last_login, workspace?.timezone, true)}
                      >
                        {member.last_login ? timeAgo(member.last_login) : 'Never signed in'}
                      </td>
                      <td>
                        <Dropdown
                          trigger={(open, toggle) => (
                            <IconButton
                              label={`Manage ${member.username}`}
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
                                  setEditing(member)
                                }}
                              >
                                <KeyRound size={15} />
                                Manage access
                              </button>
                              {!member.is_demo && member.id !== user?.id && (
                                <button
                                  className="menu-item"
                                  onClick={() => {
                                    close()
                                    setResetting(member)
                                  }}
                                >
                                  <KeyRound size={15} />
                                  Reset password
                                </button>
                              )}
                              <button
                                className="menu-item"
                                onClick={() => {
                                  close()
                                  setShowRoles(true)
                                }}
                              >
                                <ShieldCheck size={15} />
                                View role permissions
                              </button>
                            </>
                          )}
                        </Dropdown>
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
              noun="team members"
            />
          </>
        ) : (
          <EmptyState
            icon={<UsersRound size={28} />}
            title="No team members found"
            description="Try another name or adjust the role and status filters."
          />
        )}
      </section>
      <div className="access-reminder">
        <KeyRound size={20} />
        <div>
          <strong>Keep access intentional.</strong>
          <p>
            Review permissions regularly. Deactivating an account immediately revokes all of its
            sessions.
          </p>
        </div>
        <button onClick={() => setShowRoles(true)}>
          Explore roles <ChevronRight size={15} />
        </button>
      </div>
      {adding && <AddMemberModal onClose={() => setAdding(false)} />}
      {editing && (
        <EditAccessModal
          member={editing}
          onClose={() => setEditing(null)}
          onReset={member => {
            setEditing(null)
            setResetting(member)
          }}
        />
      )}
      {resetting && <ResetPasswordModal member={resetting} onClose={() => setResetting(null)} />}
      {showRoles && <RoleGuide onClose={() => setShowRoles(false)} />}
    </>
  )
}

function AddMemberModal({ onClose }: { onClose: () => void }) {
  const { config } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('nurse')
  const [department, setDepartment] = useState('General Medicine')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = useRefresh()
  const toast = useToast()
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/staff', {
        method: 'POST',
        body: JSON.stringify({ username: name, email, password, role, department }),
      })
      await refresh()
      toast(`${name} has been added to the team.`)
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title="Add a team member"
      description="Give someone the access they need, and nothing more."
      onClose={() => {
        if (!busy) onClose()
      }}
      wide
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="form-grid">
            <Field label="Full name">
              <Input
                aria-label="Full name"
                data-autofocus
                placeholder="e.g. Dr. Maya Patel"
                value={name}
                onChange={event => setName(event.target.value)}
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
              />
            </Field>
            <Field label="Work email">
              <Input
                aria-label="Work email"
                type="email"
                placeholder="name@hospital.org"
                value={email}
                onChange={event => setEmail(event.target.value)}
                required
                maxLength={254}
                autoComplete="email"
              />
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
            <Field label="Access role">
              <Select
                aria-label="Access role"
                value={role}
                onChange={event => setRole(event.target.value as Role)}
              >
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Initial password"
              className="full-width"
              hint="12–128 characters, including a letter and a number. Share it securely outside MedGuard."
            >
              <Input
                aria-label="Initial password"
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                placeholder="Create a strong initial password"
              />
            </Field>
          </div>
          <div className="role-explainer">
            <ShieldCheck size={19} />
            <span>
              <strong>{roleLabels[role]} permissions</strong>
              <p>{roleDescriptions[role]}</p>
            </span>
          </div>
          <div className="info-note">
            This creates an account immediately; it does not send an email invitation. The member
            can change their password from My profile.
          </div>
          <InlineError message={error} />
        </div>
        <div className="modal-footer">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            <Plus size={16} />
            Add team member
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function EditAccessModal({
  member,
  onClose,
  onReset,
}: {
  member: User
  onClose: () => void
  onReset: (member: User) => void
}) {
  const { user, config } = useAuth()
  const isSelf = member.id === user?.id
  const [role, setRole] = useState<Role>(member.role)
  const [department, setDepartment] = useState(member.department)
  const [active, setActive] = useState(member.is_active)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = useRefresh()
  const toast = useToast()
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api(`/staff/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role, department, is_active: active }),
      })
      await refresh()
      toast(`Access updated for ${member.username}.`)
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title="Manage team access"
      description="Clear permissions make a safer workspace."
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="member-edit-profile">
            <Avatar name={member.username} size="large" />
            <div>
              <strong>{member.username}</strong>
              <span>{member.email}</span>
            </div>
          </div>
          <div className="stack-fields">
            <Field label="Access role">
              <Select
                aria-label="Access role"
                disabled={isSelf}
                value={role}
                onChange={event => setRole(event.target.value as Role)}
              >
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="field-hint">{roleDescriptions[role]}</p>
            <Field label="Department">
              <Select
                aria-label="Department"
                value={department}
                disabled={isSelf}
                onChange={event => setDepartment(event.target.value)}
              >
                {config?.departments.map(value => (
                  <option key={value}>{value}</option>
                ))}
              </Select>
            </Field>
            <label className="toggle-setting">
              <span>
                <strong>Account active</strong>
                <small>
                  {active
                    ? 'This member can sign in to the workspace.'
                    : 'Sign-in and existing sessions will be blocked.'}
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label="Account active"
                checked={active}
                disabled={isSelf}
                onChange={event => setActive(event.target.checked)}
              />
              <span className="toggle-track" />
            </label>
          </div>
          {isSelf ? (
            <div className="info-note">
              You can’t change your own access. Ask another administrator to update your
              permissions.
            </div>
          ) : (
            <div className={`info-note ${!active ? 'warning-note' : ''}`}>
              Changes to access revoke all existing sessions for this member.{' '}
              {!active && 'Their files and audit history will be retained.'}
            </div>
          )}
          <InlineError message={error} />
        </div>
        <div className="modal-footer">
          {!isSelf && !member.is_demo && (
            <Button
              type="button"
              variant="ghost"
              className="footer-left"
              onClick={() => onReset(member)}
              disabled={busy}
            >
              <KeyRound size={14} />
              Reset password
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            {isSelf ? 'Close' : 'Cancel'}
          </Button>
          {!isSelf && (
            <Button type="submit" loading={busy}>
              Save access
            </Button>
          )}
        </div>
      </form>
    </Modal>
  )
}

function RoleGuide({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="A role for every responsibility."
      description="Permissions are enforced by the API, not just the interface."
      onClose={onClose}
      wide
    >
      <div className="modal-body role-guide">
        {Object.entries(roleDescriptions).map(([role, description]) => (
          <div key={role}>
            <span className={`role-guide-icon role-${role}`}>
              <ShieldCheck size={22} />
            </span>
            <span>
              <strong>{roleLabels[role]}</strong>
              <p>{description}</p>
            </span>
          </div>
        ))}
        <div className="info-note">
          All signed-in roles can search record metadata. Only administrators can delete records,
          manage staff, resolve alerts, or edit workspace settings.
        </div>
      </div>
      <div className="modal-footer">
        <Button onClick={onClose}>Got it</Button>
      </div>
    </Modal>
  )
}

function ResetPasswordModal({ member, onClose }: { member: User; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = useRefresh()
  const toast = useToast()
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('The new passwords don’t match.')
      return
    }
    setBusy(true)
    try {
      await api(`/staff/${member.id}/password`, {
        method: 'POST',
        body: JSON.stringify({ new_password: password }),
      })
      await refresh()
      toast(`Password reset for ${member.username}. Previous sessions have been revoked.`)
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title="Reset member password"
      description="Restore access without leaving old sessions behind."
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="member-edit-profile">
            <Avatar name={member.username} size="large" />
            <div>
              <strong>{member.username}</strong>
              <span>{member.email}</span>
            </div>
          </div>
          <div className="stack-fields">
            <Field label="New password" hint="12–128 characters, including a letter and a number.">
              <Input
                type="password"
                aria-label="New password"
                data-autofocus
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm new password">
              <Input
                type="password"
                aria-label="Confirm new password"
                value={confirm}
                onChange={event => setConfirm(event.target.value)}
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </Field>
          </div>
          <div className="info-note">
            All of this member’s current sessions will be revoked. Share the new password through an
            approved secure channel; no email is sent.
          </div>
          <InlineError message={error} />
        </div>
        <div className="modal-footer">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            <KeyRound size={15} />
            Reset password
          </Button>
        </div>
      </form>
    </Modal>
  )
}

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Building2,
  Check,
  CheckCircle2,
  Database,
  Fingerprint,
  Globe2,
  KeyRound,
  LockKeyhole,
  Save,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useRefresh, useWorkspace } from '../lib/queries'
import type { User, Workspace } from '../lib/types'
import { roleLabels } from '../lib/utils'
import {
  Avatar,
  Badge,
  Button,
  ErrorState,
  Field,
  InlineError,
  Input,
  Loading,
  PageHeader,
  Select,
  useToast,
} from '../components/ui'

export function SettingsPage() {
  const { data: workspace, isPending, error, refetch } = useWorkspace()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') ?? 'workspace'
  return (
    <>
      <PageHeader
        eyebrow="WORKSPACE PREFERENCES"
        title="Make yourself at home."
        description="A few thoughtful settings. A workspace that works for your team."
      />
      <div className="settings-tabs tabs" role="tablist" aria-label="Settings sections">
        {[
          { key: 'workspace', label: 'Workspace', icon: Building2 },
          { key: 'profile', label: 'My profile', icon: UserRound },
          { key: 'security', label: 'Security controls', icon: ShieldCheck },
        ].map(item => (
          <button
            role="tab"
            aria-selected={tab === item.key}
            key={item.key}
            className={tab === item.key ? 'tab-active' : ''}
            onClick={() => setSearchParams({ tab: item.key })}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </div>
      {isPending ? (
        <Loading />
      ) : error || !workspace ? (
        <ErrorState
          message={error?.message ?? 'Could not load your settings.'}
          retry={() => void refetch()}
        />
      ) : tab === 'profile' ? (
        <ProfileSettings key={user?.id} />
      ) : tab === 'security' ? (
        <SecuritySettings workspace={workspace} />
      ) : (
        <WorkspaceSettings
          key={`${workspace.name}-${workspace.timezone}-${workspace.session_minutes}-${workspace.contact_email}`}
          workspace={workspace}
        />
      )}
    </>
  )
}

function WorkspaceSettings({ workspace }: { workspace: Workspace }) {
  const { user } = useAuth()
  const canEdit = user?.permissions.includes('manage_settings')
  const [name, setName] = useState(workspace.name)
  const [email, setEmail] = useState(workspace.contact_email)
  const [timezone, setTimezone] = useState(workspace.timezone)
  const [minutes, setMinutes] = useState(workspace.session_minutes)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const refresh = useRefresh()
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/workspace', {
        method: 'PATCH',
        body: JSON.stringify({ name, contact_email: email, timezone, session_minutes: minutes }),
      })
      await refresh()
      toast('Workspace settings saved.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const timezones = [
    ...new Set([
      workspace.timezone,
      'Asia/Kolkata',
      'UTC',
      'Europe/London',
      'America/New_York',
      'Asia/Singapore',
    ]),
  ]
  return (
    <div className="settings-grid">
      <form className="panel settings-form" onSubmit={submit}>
        <div className="panel-heading">
          <div>
            <h2>Workspace details</h2>
            <p>A familiar identity for your hospital team.</p>
          </div>
          <Building2 size={20} />
        </div>
        <div className="settings-form-body">
          <div className="workspace-identity">
            <span>
              <Building2 size={29} />
            </span>
            <div>
              <strong>{workspace.name}</strong>
              <small>Hospital security workspace</small>
            </div>
            <Badge tone="green" dot>
              Active
            </Badge>
          </div>
          <div className="stack-fields">
            <Field label="Hospital / workspace name">
              <Input
                aria-label="Hospital / workspace name"
                value={name}
                onChange={event => setName(event.target.value)}
                required
                minLength={2}
                maxLength={100}
                disabled={!canEdit}
              />
            </Field>
            <Field
              label="Security contact email"
              hint="Displayed as your team’s security contact. No automatic emails are sent."
            >
              <Input
                aria-label="Security contact email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                required
                disabled={!canEdit}
              />
            </Field>
            <div className="form-grid">
              <Field label="Display timezone">
                <Select
                  aria-label="Display timezone"
                  value={timezone}
                  onChange={event => setTimezone(event.target.value)}
                  disabled={!canEdit}
                >
                  {timezones.map(value => (
                    <option value={value} key={value}>
                      {value.replaceAll('_', ' ')}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Session lifetime" hint="Applies to newly created sign-in sessions.">
                <Select
                  aria-label="Session lifetime"
                  value={minutes}
                  onChange={event => setMinutes(Number(event.target.value))}
                  disabled={!canEdit}
                >
                  {[15, 30, 60, 120, 480].map(value => (
                    <option value={value} key={value}>
                      {value < 60
                        ? `${value} minutes`
                        : `${value / 60} hour${value > 60 ? 's' : ''}`}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
          <InlineError message={error} />
        </div>
        <div className="settings-form-footer">
          <span>
            {canEdit
              ? 'Changes are recorded in the audit trail.'
              : 'Only administrators can edit workspace settings.'}
          </span>
          {canEdit && (
            <Button type="submit" loading={busy}>
              <Save size={15} />
              Save changes
            </Button>
          )}
        </div>
      </form>
      <aside className="settings-side-note">
        <span>
          <ShieldCheck size={30} strokeWidth={1.4} />
        </span>
        <h3>Trust starts with the basics.</h3>
        <p>
          Keep your workspace name familiar, your security contact current, and your session
          lifetime appropriate for a shared clinical environment.
        </p>
        <div>
          <Check size={14} />
          Every settings change is audited
        </div>
        <div>
          <Check size={14} />
          Encryption cannot be switched off
        </div>
        <div>
          <Check size={14} />
          Permissions checked server-side
        </div>
        {workspace.demo_enabled && (
          <div className="settings-demo-note">
            <strong>You’re in a demo workspace.</strong>
            <p>
              All seeded data is synthetic. Please don’t upload real patient records into this
              shared preview.
            </p>
          </div>
        )}
      </aside>
    </div>
  )
}

function ProfileSettings() {
  const { user, updateUser } = useAuth()
  const [name, setName] = useState(user!.username)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const toast = useToast()
  const refresh = useRefresh()
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    setProfileBusy(true)
    setProfileError(null)
    try {
      const updated = await api<User>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ username: name }),
      })
      updateUser(updated)
      await refresh()
      toast('Your profile has been updated.')
    } catch (err) {
      setProfileError((err as Error).message)
    } finally {
      setProfileBusy(false)
    }
  }
  const changePassword = async (event: FormEvent) => {
    event.preventDefault()
    setPasswordError(null)
    if (newPassword !== confirm) {
      setPasswordError('Your new passwords don’t match.')
      return
    }
    setPasswordBusy(true)
    try {
      await api('/auth/password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirm('')
      await refresh()
      toast('Password updated. Your other sessions have been signed out.')
    } catch (err) {
      setPasswordError((err as Error).message)
    } finally {
      setPasswordBusy(false)
    }
  }
  return (
    <div className="profile-settings-grid">
      <form className="panel settings-form" onSubmit={saveProfile}>
        <div className="panel-heading">
          <div>
            <h2>Your profile</h2>
            <p>The person behind the permissions.</p>
          </div>
          <UserRound size={19} />
        </div>
        <div className="settings-form-body">
          <div className="profile-settings-identity">
            <Avatar name={user!.username} size="large" />
            <div>
              <strong>{user!.username}</strong>
              <Badge tone="purple">{roleLabels[user!.role]}</Badge>
            </div>
          </div>
          <div className="stack-fields">
            <Field label="Full name">
              <Input
                aria-label="Full name"
                value={name}
                onChange={event => setName(event.target.value)}
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
              />
            </Field>
            <Field label="Work email">
              <Input aria-label="Work email" value={user!.email} type="email" disabled />
            </Field>
            <Field label="Department">
              <Input aria-label="Your department" value={user!.department} disabled />
            </Field>
          </div>
          <InlineError message={profileError} />
        </div>
        <div className="settings-form-footer">
          <span>Need an access change? Ask an administrator.</span>
          <Button type="submit" loading={profileBusy}>
            <Save size={15} />
            Save profile
          </Button>
        </div>
      </form>
      <form className="panel settings-form" onSubmit={changePassword}>
        <div className="panel-heading">
          <div>
            <h2>Change password</h2>
            <p>A fresh layer of peace of mind.</p>
          </div>
          <KeyRound size={19} />
        </div>
        <div className="settings-form-body">
          {user!.is_demo ? (
            <div className="demo-password-note">
              <LockKeyhole size={32} />
              <h3>Demo account, securely managed.</h3>
              <p>
                Passwords for synthetic demo accounts can’t be changed. Add a real test team member
                to try sign-in and password management.
              </p>
            </div>
          ) : (
            <>
              <div className="stack-fields">
                <Field label="Current password">
                  <Input
                    aria-label="Current password"
                    type="password"
                    value={currentPassword}
                    onChange={event => setCurrentPassword(event.target.value)}
                    required
                    maxLength={128}
                    autoComplete="current-password"
                  />
                </Field>
                <Field
                  label="New password"
                  hint="12–128 characters, including a letter and a number."
                >
                  <Input
                    aria-label="New password"
                    type="password"
                    value={newPassword}
                    onChange={event => setNewPassword(event.target.value)}
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="Confirm new password">
                  <Input
                    aria-label="Confirm new password"
                    type="password"
                    value={confirm}
                    onChange={event => setConfirm(event.target.value)}
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                  />
                </Field>
              </div>
              <InlineError message={passwordError} />
            </>
          )}
        </div>
        <div className="settings-form-footer">
          <span>Other sessions are revoked after a change.</span>
          {!user!.is_demo && (
            <Button type="submit" loading={passwordBusy}>
              <LockKeyhole size={15} />
              Update password
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

function SecuritySettings({ workspace }: { workspace: Workspace }) {
  const controls = [
    {
      icon: LockKeyhole,
      title: 'Authenticated file encryption',
      description:
        'AES-256-GCM encrypts file contents before they leave the application. Record IDs are authenticated as additional data.',
      value: workspace.encryption,
    },
    {
      icon: Fingerprint,
      title: 'File integrity verification',
      description:
        'Authentication tags and a SHA3-256 checksum are verified before every download. A failure blocks the file and raises an alert.',
      value: workspace.hash_algorithm,
    },
    {
      icon: UsersRound,
      title: 'Role-based access control',
      description:
        'Four server-enforced roles. Restricted files require doctor or administrator access. Auditors can only inspect metadata.',
      value: '4 access roles',
    },
    {
      icon: KeyRound,
      title: 'Account & session protection',
      description:
        'PBKDF2-SHA256 password hashes, expiring JWTs, HttpOnly session cookies, cross-site request checks, and sign-in rate limiting.',
      value: `${workspace.session_minutes}m sessions`,
    },
    {
      icon: Database,
      title: 'Private file storage',
      description:
        'Only encrypted file contents are stored here. Downloads pass through the authenticated API; there are no public file URLs.',
      value: workspace.storage,
    },
    {
      icon: ShieldCheck,
      title: 'Application audit trail',
      description:
        'Record activity and access changes are logged. There are no application endpoints to modify or delete audit events.',
      value: 'Always enabled',
    },
  ]
  return (
    <>
      <div className="security-settings-intro">
        <span>
          <ShieldCheck size={29} />
        </span>
        <div>
          <h2>Protection is not an optional extra.</h2>
          <p>These safeguards are built in and cannot be disabled from the workspace.</p>
        </div>
        <Badge tone="green" dot>
          Enabled
        </Badge>
      </div>
      <section className="panel security-controls-list">
        {controls.map(control => (
          <div className="security-control-row" key={control.title}>
            <span className="control-icon">
              <control.icon size={21} />
            </span>
            <div>
              <strong>{control.title}</strong>
              <p>{control.description}</p>
            </div>
            <span className="control-value">
              <CheckCircle2 size={14} />
              {control.value}
            </span>
          </div>
        ))}
      </section>
      <div className="deployment-note">
        <Globe2 size={22} />
        <div>
          <strong>A note for your deployment team</strong>
          <p>
            File encryption does not encrypt database metadata. Use TLS, database/disk encryption,
            access-controlled backups, externally protected audit storage, and a formal security
            review before handling real patient data. This application does not certify regulatory
            compliance.
          </p>
        </div>
      </div>
    </>
  )
}

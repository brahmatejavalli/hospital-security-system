import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileLock2,
  FileText,
  Fingerprint,
  LayoutDashboard,
  LifeBuoy,
  LockKeyhole,
  LogOut,
  Menu,
  Search,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useWorkspace } from '../lib/queries'
import type { AlertsResponse, Dashboard, RecordFile } from '../lib/types'
import { roleLabels, timeAgo } from '../lib/utils'
import { FileIcon, UploadModal } from './Records'
import { Avatar, Badge, Button, Dropdown, EmptyState, IconButton, Modal, useToast } from './ui'

const nav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/vault', label: 'Records vault', icon: FileLock2 },
  { to: '/staff', label: 'People & access', icon: UsersRound, permission: 'manage_staff' },
  { to: '/audit', label: 'Audit trail', icon: Fingerprint, permission: 'view_audit' },
  { to: '/alerts', label: 'Security alerts', icon: ShieldAlert, permission: 'view_alerts' },
]
export type LayoutContext = { openUpload: () => void }

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand ${light ? 'brand-light' : ''}`}>
      <span className="brand-symbol">
        <Shield size={31} strokeWidth={1.7} />
        <span className="brand-plus">+</span>
      </span>
      <span>
        medguard<span className="brand-period">.</span>
      </span>
    </div>
  )
}

export function Layout() {
  const { user, signOut } = useAuth()
  const { data: workspace } = useWorkspace()
  const { data: dashboard } = useQuery({
    queryKey: ['dashboard', 7],
    queryFn: () => api<Dashboard>('/dashboard?days=7'),
    refetchInterval: 30_000,
  })
  const { data: alerts } = useQuery({
    queryKey: ['alerts', 'notifications'],
    queryFn: () => api<AlertsResponse>('/alerts?status=open'),
    enabled: user?.permissions.includes('view_alerts'),
    refetchInterval: 30_000,
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  useEffect(() => {
    setMobileOpen(false)
    window.scrollTo(0, 0)
  }, [location.pathname])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(value => !value)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  const logout = async () => {
    try {
      await signOut()
      navigate('/')
    } catch (err) {
      toast((err as Error).message, true)
    }
  }
  const currentPage =
    nav.find(item => item.to === location.pathname)?.label ??
    (location.pathname === '/settings' ? 'Settings' : 'Workspace')
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {mobileOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <Brand light />
          <IconButton
            label="Close navigation"
            className="mobile-only"
            onClick={() => setMobileOpen(false)}
          >
            <X size={20} />
          </IconButton>
        </div>
        <div className="sidebar-tagline">HOSPITAL SECURITY WORKSPACE</div>
        <Dropdown
          align="left"
          className="workspace-selector"
          trigger={(open, toggle) => (
            <button className="workspace-button" onClick={toggle} aria-expanded={open}>
              <span className="workspace-building">
                <Building2 size={19} />
              </span>
              <span>
                <strong>{workspace?.name ?? 'Your hospital'}</strong>
                <small>Hospital workspace</small>
              </span>
              <ChevronDown size={14} />
            </button>
          )}
        >
          {close => (
            <>
              <span className="menu-heading">CURRENT WORKSPACE</span>
              <div className="workspace-menu-name">
                <Building2 size={17} />
                <strong>{workspace?.name}</strong>
                <Check size={15} />
              </div>
              <div className="menu-divider" />
              <button
                className="menu-item"
                onClick={() => {
                  close()
                  navigate('/settings')
                }}
              >
                <Settings2 size={15} />
                Workspace settings
              </button>
            </>
          )}
        </Dropdown>
        <div className="nav-section-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav
            .filter(item => !item.permission || user?.permissions.includes(item.permission))
            .map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
              >
                <item.icon size={19} strokeWidth={1.7} />
                <span>{item.label}</span>
                {item.to === '/alerts' && !!dashboard?.open_alerts && (
                  <span className="nav-count">{dashboard.open_alerts}</span>
                )}
                {item.to === '/' && <span className="active-indicator" />}
              </NavLink>
            ))}
        </nav>
        <div className="nav-section-label management-label">MANAGEMENT</div>
        <nav aria-label="Workspace management">
          <NavLink
            to="/settings"
            className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
          >
            <Settings2 size={19} strokeWidth={1.7} />
            <span>Settings</span>
          </NavLink>
          <button className="nav-link" onClick={() => setHelpOpen(true)}>
            <LifeBuoy size={19} strokeWidth={1.7} />
            <span>Help & support</span>
            <span className="nav-external">↗</span>
          </button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-protection">
          <span className="protection-symbol">
            <ShieldCheck size={23} strokeWidth={1.5} />
          </span>
          <strong>A little more peace of mind.</strong>
          <p>
            Your records stay encrypted.
            <br />
            Your team stays in control.
          </p>
          <button onClick={() => navigate('/settings?tab=security')}>
            Security settings <ArrowRight size={14} />
          </button>
          <span className="protection-decoration" aria-hidden="true">
            +
          </span>
        </div>
        {workspace?.demo_enabled && (
          <span className="demo-sidebar-label">
            <span /> DEMO WORKSPACE · SAMPLE DATA
          </span>
        )}
        <Dropdown
          align="left"
          className="profile-dropdown"
          trigger={(open, toggle) => (
            <button className="sidebar-user" onClick={toggle} aria-expanded={open}>
              <Avatar name={user!.username} />
              <span>
                <strong>{user!.username}</strong>
                <small>{roleLabels[user!.role]}</small>
              </span>
              <ChevronDown size={14} />
            </button>
          )}
        >
          {close => (
            <>
              <div className="profile-menu-summary">
                <strong>{user?.username}</strong>
                <small>{user?.email}</small>
              </div>
              <div className="menu-divider" />
              <button
                className="menu-item"
                onClick={() => {
                  close()
                  navigate('/settings?tab=profile')
                }}
              >
                <Settings2 size={15} />
                My profile
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  close()
                  setHelpOpen(true)
                }}
              >
                <CircleHelp size={15} />
                Help center
              </button>
              <div className="menu-divider" />
              <button
                className="menu-item danger-text"
                onClick={() => {
                  close()
                  void logout()
                }}
              >
                <LogOut size={15} />
                Sign out
              </button>
            </>
          )}
        </Dropdown>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <IconButton
              label="Open navigation"
              className="mobile-only"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={21} />
            </IconButton>
            <span className="breadcrumb">
              Workspace <ChevronRight size={13} />
              <strong>{currentPage}</strong>
            </span>
          </div>
          <div className="topbar-right">
            <button className="global-search-button" onClick={() => setSearchOpen(true)}>
              <Search size={16} />
              <span>Search anything…</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="topbar-divider" />
            <span className="system-status">
              <span />
              Workspace online
            </span>
            <Dropdown
              className="notifications-dropdown"
              trigger={(open, toggle) => (
                <IconButton
                  label="Security notifications"
                  aria-expanded={open}
                  className="notification-button"
                  onClick={toggle}
                >
                  <Bell size={19} strokeWidth={1.7} />
                  {!!alerts?.items.length && <span className="notification-dot" />}
                </IconButton>
              )}
            >
              {close => (
                <>
                  <div className="notification-heading">
                    <strong>Security notifications</strong>
                    <Badge tone="green">{alerts?.items.length ?? 0} open</Badge>
                  </div>
                  {alerts?.items.length ? (
                    alerts.items.slice(0, 4).map(alert => (
                      <button
                        className="notification-item"
                        key={alert.id}
                        onClick={() => {
                          close()
                          navigate(`/alerts?review=${alert.id}`)
                        }}
                      >
                        <span className={`notification-icon severity-${alert.severity}`}>
                          <ShieldAlert size={18} />
                        </span>
                        <span>
                          <strong>{alert.title}</strong>
                          <small>
                            {timeAgo(alert.created_at)} · {alert.severity} priority
                          </small>
                        </span>
                        <ChevronRight size={15} />
                      </button>
                    ))
                  ) : (
                    <div className="notifications-empty">
                      <ShieldCheck size={26} />
                      <strong>You’re all caught up</strong>
                      <p>No security alerts to review.</p>
                    </div>
                  )}
                  {user?.permissions.includes('view_alerts') && (
                    <button
                      className="notification-footer"
                      onClick={() => {
                        close()
                        navigate('/alerts')
                      }}
                    >
                      View all alerts <ArrowRight size={14} />
                    </button>
                  )}
                </>
              )}
            </Dropdown>
            <IconButton label="Open help center" onClick={() => setHelpOpen(true)}>
              <CircleHelp size={20} strokeWidth={1.7} />
            </IconButton>
            <span className="topbar-mini-avatar">
              <Avatar name={user!.username} size="small" />
            </span>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <Outlet context={{ openUpload: () => setUploadOpen(true) } satisfies LayoutContext} />
          <footer className="page-footer">
            <span>© {new Date().getFullYear()} MedGuard. Built around trust.</span>
            <span>
              <LockKeyhole size={12} />
              Your data. In safe hands.
            </span>
          </footer>
        </main>
      </div>
      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} />}
      {searchOpen && <CommandSearch onClose={() => setSearchOpen(false)} />}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  )
}

function CommandSearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 200)
    return () => clearTimeout(timer)
  }, [query])
  const { data, isFetching, error } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () =>
      api<{ records: RecordFile[]; staff: { id: number; username: string; department: string }[] }>(
        `/search?q=${encodeURIComponent(debounced)}`,
      ),
    enabled: debounced.trim().length >= 2,
  })
  const go = (path: string) => {
    onClose()
    navigate(path)
  }
  return (
    <Modal title="Search your workspace" onClose={onClose}>
      <div className="command-search">
        <Search size={21} />
        <input
          aria-label="Search your workspace"
          data-autofocus
          placeholder="Search records, patient IDs, or people…"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
      </div>
      <div className="command-results">
        {query.length < 2 ? (
          <>
            <span className="menu-heading">QUICK NAVIGATION</span>
            {nav
              .filter(item => !item.permission || user?.permissions.includes(item.permission))
              .map(item => (
                <button className="command-result" key={item.to} onClick={() => go(item.to)}>
                  <item.icon size={18} />
                  <span>{item.label}</span>
                  <ArrowRight size={15} />
                </button>
              ))}
          </>
        ) : isFetching ? (
          <p className="command-hint">Searching securely…</p>
        ) : error ? (
          <p className="command-hint danger-text">{error.message}</p>
        ) : data && !data.records.length && !data.staff.length ? (
          <EmptyState
            icon={<Search size={25} />}
            title="No matches just yet"
            description="Try a record name, patient reference ID, or team member."
          />
        ) : (
          <>
            {!!data?.records.length && <span className="menu-heading">RECORDS</span>}
            {data?.records.map(record => (
              <button
                className="command-result"
                key={record.id}
                onClick={() => go(`/vault?record=${record.id}`)}
              >
                <FileIcon record={record} />
                <span>
                  <strong>{record.filename}</strong>
                  <small>
                    {record.patient_id} · {record.department}
                  </small>
                </span>
                <ArrowRight size={15} />
              </button>
            ))}
            {!!data?.staff.length && <span className="menu-heading">TEAM MEMBERS</span>}
            {data?.staff.map(member => (
              <button
                className="command-result"
                key={member.id}
                onClick={() => go(`/staff?q=${encodeURIComponent(member.username)}`)}
              >
                <Avatar name={member.username} size="small" />
                <span>
                  <strong>{member.username}</strong>
                  <small>{member.department}</small>
                </span>
                <ArrowRight size={15} />
              </button>
            ))}
          </>
        )}
      </div>
      <div className="command-footer">
        <LockKeyhole size={12} />
        <span>Search results respect your role permissions.</span>
        <kbd>esc</kbd>
        <span>to close</span>
      </div>
    </Modal>
  )
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="A little help, when you need it."
      description="Get to know your hospital’s security workspace."
      onClose={onClose}
      wide
    >
      <div className="modal-body help-body">
        <div className="help-intro">
          <span>
            <LifeBuoy size={26} />
          </span>
          <div>
            <strong>Care for patients. We’ll help protect the records.</strong>
            <p>
              MedGuard brings encrypted storage, staff access, and a clear audit trail together in
              one workspace.
            </p>
          </div>
        </div>
        {[
          {
            icon: ArrowDownToLine,
            title: 'How do I upload and download records?',
            text: 'Open Records vault and select Upload record. Choose a supported file up to 10 MB, add the patient reference ID, department, and classification. Files are encrypted before storage. To download, open a record’s details; its authentication tag and SHA3-256 checksum are checked first.',
          },
          {
            icon: UsersRound,
            title: 'What can each role do?',
            text: 'Administrators manage the entire workspace. Doctors can upload and download all records. Nurses can upload and download Internal or Confidential records, but not Restricted records. Auditors can inspect metadata, audit events, and alerts, but cannot access file contents or change records.',
          },
          {
            icon: ShieldAlert,
            title: 'How should I handle a security alert?',
            text: 'Open Security alerts, review the source and recommended action, then inspect the related audit trail. An administrator can add a resolution note and mark the alert resolved. Sample alerts are marked as demo data; the application is not an external network or physical-security monitoring service.',
          },
          {
            icon: LockKeyhole,
            title: 'Where is my data stored?',
            text: 'Records are encrypted with AES-256-GCM and stored in a private local directory, or a private S3 bucket if configured. Database metadata is separate from encrypted file contents. Production deployments need TLS, database and disk protection, secure key backups, and an organizational security review.',
          },
          {
            icon: Sparkles,
            title: 'About the demo workspace',
            text: 'All seeded patient references, records, staff accounts, and historical events are synthetic. Changes in this preview are saved to the development database. Demo access is disabled in production. Do not upload real patient data into a shared demonstration environment.',
          },
        ].map(item => (
          <details className="help-accordion" key={item.title}>
            <summary>
              <item.icon size={18} />
              <span>{item.title}</span>
              <ChevronDown size={16} />
            </summary>
            <p>{item.text}</p>
          </details>
        ))}
        <a className="api-docs-link" href="/api/docs" target="_blank" rel="noreferrer">
          <FileText size={16} />
          <span>Developer? Explore the API documentation</span>
          <ArrowRight size={16} />
        </a>
      </div>
      <div className="modal-footer">
        <Button onClick={onClose}>Got it, thank you</Button>
      </div>
    </Modal>
  )
}

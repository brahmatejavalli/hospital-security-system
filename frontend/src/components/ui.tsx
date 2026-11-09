import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Search,
  X,
} from 'lucide-react'
import { initials } from '../lib/utils'

export function Button({
  children,
  variant = 'primary',
  loading = false,
  className = '',
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  loading?: boolean
}) {
  return (
    <button
      className={`button button-${variant} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 size={16} className="spin" />}
      {children}
    </button>
  )
}
export function IconButton({
  children,
  label,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className={`icon-button ${className}`} aria-label={label} title={label} {...props}>
      {children}
    </button>
  )
}
export function Badge({
  children,
  tone = 'neutral',
  dot = false,
}: {
  children: ReactNode
  tone?: 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'neutral'
  dot?: boolean
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  )
}
export function Avatar({
  name,
  size = 'medium',
}: {
  name: string
  size?: 'small' | 'medium' | 'large'
}) {
  const index = name.split('').reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 5
  return (
    <span className={`avatar avatar-${size} avatar-color-${index}`} aria-hidden="true">
      {initials(name)}
    </span>
  )
}
export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  const id = useId()
  const control = isValidElement<{ id?: string; 'aria-describedby'?: string }>(children)
    ? cloneElement(children, { id, 'aria-describedby': hint ? `${id}-hint` : undefined })
    : children
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {control}
      {hint && (
        <span id={`${id}-hint`} className="field-hint">
          {hint}
        </span>
      )}
    </div>
  )
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className ?? ''}`} />
}
export function Select({
  children,
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`select-wrap ${className}`}>
      <select {...props}>{children}</select>
      <ChevronDown size={14} aria-hidden="true" />
    </span>
  )
}
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  label = 'Search',
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  className?: string
}) {
  return (
    <div className={`search-input ${className}`}>
      <Search size={17} aria-hidden="true" />
      <input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={event => onChange(event.target.value)}
      />
      {value && (
        <button aria-label="Clear search" onClick={() => onChange('')}>
          <X size={14} />
        </button>
      )}
    </div>
  )
}
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  )
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
  drawer = false,
}: {
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
  drawer?: boolean
}) {
  const titleId = useId()
  const container = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const element = container.current
    const focusables = () =>
      Array.from(
        element?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter(el => el.offsetParent !== null)
    const timer = window.setTimeout(
      () =>
        (
          element?.querySelector<HTMLElement>('[data-autofocus]') ??
          focusables()[0] ??
          element
        )?.focus(),
      30,
    )
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
      if (event.key === 'Tab') {
        const available = focusables()
        if (available.length === 0) {
          event.preventDefault()
          element?.focus()
          return
        }
        const first = available[0],
          last = available[available.length - 1]
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === element)
        ) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])
  return createPortal(
    <div
      className={`modal-backdrop ${drawer ? 'drawer-backdrop' : ''}`}
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={`modal ${wide ? 'modal-wide' : ''} ${drawer ? 'drawer' : ''}`}
        ref={container}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
export function Dropdown({
  trigger,
  children,
  align = 'right',
  className = '',
}: {
  trigger: (open: boolean, toggle: () => void) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'right' | 'left'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  return (
    <div className={`dropdown ${className}`} ref={ref}>
      {trigger(open, () => setOpen(!open))}
      {open && (
        <div className={`dropdown-panel dropdown-${align}`}>{children(() => setOpen(false))}</div>
      )}
    </div>
  )
}
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
  noun = 'items',
}: {
  page: number
  pageSize: number
  total: number
  onChange: (value: number) => void
  noun?: string
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="pagination">
      <span>
        {total === 0 ? (
          `0 ${noun}`
        ) : (
          <>
            Showing{' '}
            <strong>
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}
            </strong>{' '}
            of <strong>{total}</strong> {noun}
          </>
        )}
      </span>
      <div>
        <IconButton label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ArrowLeft size={16} />
        </IconButton>
        {pages <= 5 ? (
          Array.from({ length: pages }, (_, index) => (
            <button
              key={index}
              className={`page-number ${page === index + 1 ? 'active' : ''}`}
              aria-label={`Page ${index + 1}`}
              aria-current={page === index + 1 ? 'page' : undefined}
              onClick={() => onChange(index + 1)}
            >
              {index + 1}
            </button>
          ))
        ) : (
          <span className="page-counter">
            Page {page} of {pages}
          </span>
        )}
        <IconButton label="Next page" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          <ArrowRight size={16} />
        </IconButton>
      </div>
    </div>
  )
}
export function Loading({ full = false }: { full?: boolean }) {
  return (
    <div className={`loading-state ${full ? 'loading-full' : ''}`} role="status">
      <Loader2 size={25} className="spin" />
      <span>Loading your workspace…</span>
    </div>
  )
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="empty-state error-state" role="alert">
      <span className="empty-icon">
        <AlertCircle size={26} />
      </span>
      <h3>Let’s try that again</h3>
      <p>{message}</p>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  )
}
export function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  )
}
export function InlineError({ message }: { message: string | null }) {
  return message ? (
    <div className="inline-error" role="alert">
      <AlertCircle size={16} />
      <span>{message}</span>
    </div>
  ) : null
}
export function CheckItem({ children }: { children: ReactNode }) {
  return (
    <span className="check-item">
      <Check size={13} />
      {children}
    </span>
  )
}

type Toast = { id: number; message: string; error?: boolean }
const ToastContext = createContext<(message: string, error?: boolean) => void>(() => {})
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const notify = (message: string, error = false) => {
    const id = Date.now() + Math.random()
    setToasts(previous => [...previous.slice(-3), { id, message, error }])
    timers.current.push(
      setTimeout(() => setToasts(previous => previous.filter(toast => toast.id !== id)), 5500),
    )
  }
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.error ? 'toast-error' : ''}`}>
            {toast.error ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}
            <span>{toast.message}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setToasts(previous => previous.filter(item => item.id !== toast.id))}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
export const useToast = () => useContext(ToastContext)

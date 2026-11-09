import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Fingerprint,
  HeartPulse,
  LockKeyhole,
  Shield,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { Brand } from '../components/Layout'
import { Button, IconButton, InlineError, Input, Modal } from '../components/ui'

export function LoginPage() {
  const { signIn, demo, config } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState<'login' | 'demo' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [help, setHelp] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy('login')
    setError(null)
    try {
      await signIn(email, password)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }
  const enterDemo = async () => {
    setBusy('demo')
    setError(null)
    try {
      await demo()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="login-page">
      <section className="login-story">
        <Brand light />
        <div className="login-story-content">
          <span className="eyebrow">A LITTLE MORE PEACE OF MIND</span>
          <h1>
            Protecting records.
            <br />
            Caring for people.
          </h1>
          <p>
            Security that stays one step ahead,
            <br />
            so care can stay at the center.
          </p>
          <div className="login-illustration" aria-hidden="true">
            <div className="illustration-orbit orbit-one" />
            <div className="illustration-orbit orbit-two" />
            <div className="illustration-shield">
              <Shield size={145} strokeWidth={0.8} />
              <HeartPulse size={60} strokeWidth={1.2} />
            </div>
            <div className="illustration-chip chip-encryption">
              <LockKeyhole size={17} />
              <span>AES-256 encrypted</span>
              <Check size={14} />
            </div>
            <div className="illustration-chip chip-access">
              <UsersRound size={17} />
              <span>Access, with intention.</span>
            </div>
            <div className="illustration-chip chip-audit">
              <Fingerprint size={17} />
              <span>Every action, accounted for.</span>
            </div>
            <span className="illustration-spark spark-one">+</span>
            <span className="illustration-spark spark-two">+</span>
          </div>
        </div>
        <div className="login-story-footer">
          <ShieldCheck size={18} />
          <span>Your data. Your team. Your trust.</span>
          <span>medguard.</span>
        </div>
      </section>
      <section className="login-form-section">
        <div className="login-mobile-brand">
          <Brand />
        </div>
        <div className="login-form-wrap">
          <span className="login-welcome-icon">
            <ShieldCheck size={27} strokeWidth={1.5} />
          </span>
          <h2>Welcome to your workspace.</h2>
          <p>A safer space for the work that matters.</p>
          <form onSubmit={submit}>
            <div className="login-field">
              <label htmlFor="email">Work email</label>
              <Input
                id="email"
                aria-label="Work email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="you@hospital.org"
                required
              />
            </div>
            <div className="login-field">
              <label htmlFor="password">Password</label>
              <div className="password-input">
                <Input
                  id="password"
                  aria-label="Password"
                  type={visible ? 'text' : 'password'}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  maxLength={128}
                />
                <IconButton
                  label={visible ? 'Hide password' : 'Show password'}
                  type="button"
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                </IconButton>
              </div>
            </div>
            <InlineError message={error} />
            <Button
              type="submit"
              className="login-submit"
              loading={busy === 'login'}
              disabled={!!busy}
            >
              <span>Sign in securely</span>
              <ArrowRight size={17} />
            </Button>
          </form>
          {config?.demo_enabled && (
            <>
              <div className="login-or">
                <span />
                or take a look around
                <span />
              </div>
              <Button
                variant="secondary"
                className="demo-login-button"
                onClick={() => void enterDemo()}
                loading={busy === 'demo'}
                disabled={!!busy}
              >
                <ShieldCheck size={17} />
                Explore demo workspace
                <ArrowRight size={16} />
              </Button>
              <p className="demo-login-note">
                A ready-to-explore workspace with synthetic data.
                <br />
                No registration. No real patient information.
              </p>
            </>
          )}
          <button className="login-help" onClick={() => setHelp(true)}>
            Need access? <span>We can point you in the right direction.</span>
          </button>
        </div>
        <div className="login-bottom">
          <LockKeyhole size={12} />
          Protected with care, by MedGuard.
        </div>
      </section>
      {help && (
        <Modal
          title="Let’s get you connected."
          description="Your workspace administrator can help."
          onClose={() => setHelp(false)}
        >
          <div className="modal-body">
            <p className="confirm-text">
              MedGuard is an invitation-only workspace. An administrator creates your account and
              shares the initial password through an approved, secure channel.
            </p>
            <div className="info-note">
              If you’ve lost access, ask your hospital’s security or IT administrator to reset your
              password from People & access. Self-service email password recovery is not configured
              in this application.
            </div>
            {config?.demo_enabled && (
              <p className="confirm-text">
                Just exploring? Close this dialog and select <strong>Explore demo workspace</strong>{' '}
                to try the sample environment.
              </p>
            )}
          </div>
          <div className="modal-footer">
            <Button onClick={() => setHelp(false)}>Got it</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

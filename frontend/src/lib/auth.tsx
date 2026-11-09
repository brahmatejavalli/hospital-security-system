import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from './api'
import type { Config, User } from './types'

type AuthState = {
  user: User | null
  loading: boolean
  error: string | null
  config: Config | null
  signIn: (email: string, password: string) => Promise<void>
  demo: () => Promise<void>
  signOut: () => Promise<void>
  updateUser: (user: User) => void
  retry: () => void
}
const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    async function initialize() {
      try {
        const publicConfig = await api<Config>('/config')
        if (cancelled) return
        setConfig(publicConfig)
        try {
          const current = await api<User>('/auth/me')
          if (!cancelled) setUser(current)
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 401) throw err
          if (publicConfig.demo_enabled && !sessionStorage.getItem('medguard-signed-out')) {
            try {
              const result = await api<{ user: User }>('/auth/demo', { method: 'POST' })
              if (!cancelled) setUser(result.user)
            } catch (demoError) {
              // Existing non-demo databases may have no sample administrator.
              if (!(demoError instanceof ApiError) || demoError.status !== 404) throw demoError
            }
          }
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void initialize()
    return () => {
      cancelled = true
    }
  }, [attempt])

  useEffect(() => {
    const expired = () => {
      sessionStorage.setItem('medguard-signed-out', 'true')
      setUser(null)
      queryClient.clear()
    }
    window.addEventListener('session-expired', expired)
    return () => window.removeEventListener('session-expired', expired)
  }, [queryClient])

  const signIn = async (email: string, password: string) => {
    const result = await api<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    sessionStorage.removeItem('medguard-signed-out')
    queryClient.clear()
    setUser(result.user)
  }
  const demo = async () => {
    const result = await api<{ user: User }>('/auth/demo', { method: 'POST' })
    sessionStorage.removeItem('medguard-signed-out')
    queryClient.clear()
    setUser(result.user)
  }
  const signOut = async () => {
    try {
      await api('/auth/logout', { method: 'POST' })
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) throw err
    }
    sessionStorage.setItem('medguard-signed-out', 'true')
    setUser(null)
    queryClient.clear()
  }
  const retry = useCallback(() => setAttempt(value => value + 1), [])
  return (
    <AuthContext.Provider
      value={{ user, loading, error, config, signIn, demo, signOut, updateUser: setUser, retry }}
    >
      {children}
    </AuthContext.Provider>
  )
}
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth requires AuthProvider')
  return context
}

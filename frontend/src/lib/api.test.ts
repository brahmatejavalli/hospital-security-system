import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'

afterEach(() => vi.unstubAllGlobals())
describe('same-origin API client', () => {
  it('sends same-origin credentials and the CSRF request header', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    expect(
      await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
      }),
    ).toEqual({ ok: true })
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('/api/auth/login')
    expect(options.credentials).toBe('same-origin')
    expect(options.headers.get('X-Requested-With')).toBe('MedGuard')
    expect(options.headers.get('Content-Type')).toBe('application/json')
  })
  it('lets the browser set multipart boundaries', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetch)
    await api('/records', { method: 'POST', body: new FormData() })
    expect(fetch.mock.calls[0][1].headers.has('Content-Type')).toBe(false)
  })
  it('preserves server validation errors in a readable form', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ detail: [{ msg: 'Value error, Choose a supported department.' }] }),
            { status: 422 },
          ),
        ),
    )
    await expect(api('/staff')).rejects.toThrow('Choose a supported department.')
  })
  it('clears authentication when a workspace request receives a 401', async () => {
    const listener = vi.fn()
    window.addEventListener('session-expired', listener)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ detail: 'Session expired' }), { status: 401 }),
        ),
    )
    await expect(api('/records')).rejects.toBeInstanceOf(ApiError)
    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener('session-expired', listener)
  })
  it('handles network and non-JSON proxy failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network error')))
    await expect(api('/workspace')).rejects.toThrow('Check your connection')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 })))
    await expect(api('/workspace')).rejects.toThrow('Something went wrong')
  })
})

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('X-Requested-With', 'MedGuard')
  if (options.body && !(options.body instanceof FormData))
    headers.set('Content-Type', 'application/json')
  let response: Response
  try {
    response = await fetch(`/api${path}`, { ...options, headers, credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, 'We couldn’t reach your workspace. Check your connection and try again.')
  }
  if (!response.ok) {
    let message = 'Something went wrong. Please try again.'
    try {
      const body = await response.json()
      if (typeof body.detail === 'string') message = body.detail
      else if (Array.isArray(body.detail))
        message = body.detail
          .map((item: { msg: string }) => item.msg.replace('Value error, ', ''))
          .join(' ')
    } catch {
      /* Keep the safe fallback for non-JSON proxy errors. */
    }
    if (response.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('session-expired'))
    throw new ApiError(response.status, message)
  }
  return response.json() as Promise<T>
}

export const params = (values: Record<string, string | number | undefined>) => {
  const result = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== '' && value !== undefined) result.set(key, String(value))
  })
  return result.toString() ? `?${result}` : ''
}

export async function download(path: string, fallbackName: string) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'MedGuard' },
  })
  if (!response.ok) {
    let message = 'The download couldn’t be completed. Please try again.'
    try {
      message = (await response.json()).detail || message
    } catch {
      /* non-JSON error */
    }
    if (response.status === 401) window.dispatchEvent(new Event('session-expired'))
    throw new ApiError(response.status, message)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fallbackName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UploadModal } from './Records'
import { ToastProvider } from './ui'
import { api } from '../lib/api'

const refresh = vi.fn().mockResolvedValue(undefined)
vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    user: { role: 'admin', department: 'Administration' },
    config: {
      max_upload_bytes: 10485760,
      categories: ['Lab report', 'Other'],
      departments: ['General Medicine', 'Administration'],
      classifications: ['Confidential', 'Restricted', 'Internal'],
    },
  }),
}))
vi.mock('../lib/queries', () => ({
  useRefresh: () => refresh,
  useWorkspace: () => ({ data: { timezone: 'UTC' } }),
}))
vi.mock('../lib/api', () => ({ api: vi.fn(), download: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
})
describe('encrypted record upload', () => {
  it('requires a file and explains supported formats', async () => {
    render(
      <ToastProvider>
        <UploadModal onClose={vi.fn()} />
      </ToastProvider>,
    )
    expect(screen.getByText('PDF, PNG, JPG, CSV or TXT · Up to 10 MB')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: 'Patient reference ID' }), 'TEST-1048')
    fireEvent.submit(screen.getByRole('button', { name: 'Encrypt & upload' }).closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a record to upload.')
    expect(api).not.toHaveBeenCalled()
  })
  it('submits the actual file and metadata, refreshes the workspace, and closes', async () => {
    vi.mocked(api).mockResolvedValue({ id: 'test-id' })
    const close = vi.fn()
    render(
      <ToastProvider>
        <UploadModal onClose={close} />
      </ToastProvider>,
    )
    const file = new File(['Synthetic sample'], 'test-record.txt', { type: 'text/plain' })
    await userEvent.upload(screen.getByLabelText('Choose record file'), file)
    await userEvent.type(screen.getByRole('textbox', { name: 'Patient reference ID' }), 'TEST-1048')
    await userEvent.click(screen.getByRole('button', { name: 'Encrypt & upload' }))
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(api).toHaveBeenCalledOnce()
    const [url, options] = vi.mocked(api).mock.calls[0]
    expect(url).toBe('/records')
    const body = options!.body as FormData
    expect(body.get('file')).toBe(file)
    expect(body.get('patient_id')).toBe('TEST-1048')
    expect(body.get('classification')).toBe('Confidential')
    expect(refresh).toHaveBeenCalledOnce()
  })
  it('keeps the dialog open and shows a recoverable backend error', async () => {
    vi.mocked(api).mockRejectedValue(new Error('Secure storage is temporarily unavailable.'))
    const close = vi.fn()
    render(
      <ToastProvider>
        <UploadModal onClose={close} />
      </ToastProvider>,
    )
    await userEvent.upload(
      screen.getByLabelText('Choose record file'),
      new File(['Sample'], 'test.txt', { type: 'text/plain' }),
    )
    await userEvent.type(screen.getByRole('textbox', { name: 'Patient reference ID' }), 'TEST-1048')
    await userEvent.click(screen.getByRole('button', { name: 'Encrypt & upload' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Secure storage is temporarily unavailable.',
    )
    expect(close).not.toHaveBeenCalled()
  })
  it('rejects empty files before a request is sent', async () => {
    render(
      <ToastProvider>
        <UploadModal onClose={vi.fn()} />
      </ToastProvider>,
    )
    await userEvent.upload(
      screen.getByLabelText('Choose record file'),
      new File([], 'empty.txt', { type: 'text/plain' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('This file is empty.')
    expect(api).not.toHaveBeenCalled()
  })
})

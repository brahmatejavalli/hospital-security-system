import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button, Modal, Pagination, SearchInput, ToastProvider, useToast } from './ui'

describe('workspace interactions', () => {
  it('prevents duplicate actions while a button is loading', () => {
    const click = vi.fn()
    render(
      <Button loading onClick={click}>
        Upload
      </Button>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
    expect(click).not.toHaveBeenCalled()
    expect(screen.getByRole('button')).toBeDisabled()
  })
  it('opens an accessible dialog and supports Escape and the close control', async () => {
    const close = vi.fn()
    render(
      <Modal title="Record details" onClose={close}>
        <p>Details</p>
      </Modal>,
    )
    expect(screen.getByRole('dialog', { name: 'Record details' })).toHaveAttribute(
      'aria-modal',
      'true',
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(close).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(close).toHaveBeenCalledTimes(2)
  })
  it('preserves field focus when the opening timer fires after user interaction', () => {
    vi.useFakeTimers()
    try {
      render(
        <Modal title="Upload a record" onClose={vi.fn()}>
          <input aria-label="Patient reference ID" />
        </Modal>,
      )
      const input = screen.getByRole('textbox', { name: 'Patient reference ID' })
      input.focus()
      act(() => vi.advanceTimersByTime(35))
      expect(input).toHaveFocus()
    } finally {
      vi.useRealTimers()
    }
  })
  it('supports clearing a search query', async () => {
    const change = vi.fn()
    render(<SearchInput value="cardiac" onChange={change} label="Search records" />)
    expect(screen.getByRole('textbox', { name: 'Search records' })).toHaveValue('cardiac')
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(change).toHaveBeenCalledWith('')
  })
  it('honors pagination boundaries and announces result counts', async () => {
    const change = vi.fn()
    render(<Pagination page={1} pageSize={10} total={25} onChange={change} noun="records" />)
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByText('1–10')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(change).toHaveBeenCalledWith(2)
    await userEvent.click(screen.getByRole('button', { name: 'Page 3' }))
    expect(change).toHaveBeenCalledWith(3)
  })
  it('shows and dismisses a success notification', async () => {
    function Trigger() {
      const toast = useToast()
      return <button onClick={() => toast('Record encrypted.')}>Notify</button>
    }
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Notify' }))
    expect(screen.getByText('Record encrypted.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.queryByText('Record encrypted.')).not.toBeInTheDocument()
  })
})

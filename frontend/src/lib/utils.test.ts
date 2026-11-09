import { describe, expect, it, vi } from 'vitest'
import { actionLabel, formatBytes, formatDate, initials, recordTitle, timeAgo } from './utils'
import { params } from './api'

describe('workspace formatting', () => {
  it.each([
    ['Dr. Ananya Rao', 'AR'],
    ['Priya', 'P'],
    ['  Emily Chen ', 'EC'],
    ['', ''],
  ])('creates initials for %s', (name, expected) => expect(initials(name)).toBe(expected))
  it.each([
    [0, '0 B'],
    [913, '913 B'],
    [1024, '1.0 KB'],
    [1048576, '1.0 MB'],
  ])('formats %s bytes', (bytes, expected) => expect(formatBytes(bytes)).toBe(expected))
  it('formats reference record names without altering ordinary filenames', () => {
    expect(recordTitle('blood-panel-results-GF-2026-1048.pdf')).toBe('Blood panel results')
    expect(recordTitle('clinical_notes.txt')).toBe('Clinical notes')
    expect(recordTitle('Report.2026.pdf')).toBe('Report.2026')
  })
  it('honors workspace display timezones', () => {
    expect(formatDate('2026-11-09T20:00:00Z', 'Asia/Kolkata')).toContain('10 Nov 2026')
    expect(formatDate('2026-11-09T20:00:00Z', 'UTC')).toContain('9 Nov 2026')
    expect(formatDate(null)).toBe('Never')
  })
  it('formats relative activity timestamps', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-09T12:00:00Z'))
    expect(timeAgo('2026-11-09T11:59:50Z')).toBe('Just now')
    expect(timeAgo('2026-11-09T11:35:00Z')).toBe('25m ago')
    expect(timeAgo('2026-11-09T10:00:00Z')).toBe('2h ago')
    expect(timeAgo('2026-11-07T10:00:00Z')).toBe('2d ago')
    vi.useRealTimers()
  })
  it('labels actions and safely falls back for newly introduced events', () => {
    expect(actionLabel('record_uploaded')).toBe('Uploaded a record')
    expect(actionLabel('new_event')).toBe('new event')
  })
  it('builds encoded query parameters without empty filters', () => {
    expect(params({ q: 'a & b', role: '', page: 2, sort: undefined })).toBe('?q=a+%26+b&page=2')
    expect(params({ q: '' })).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { formatDate } from './dates.js'

describe('formatDate', () => {
  it('shows the calendar date the API sent', () => {
    expect(formatDate('2026-11-04')).toBe('Nov 4, 2026')
    expect(formatDate('2027-01-01')).toBe('Jan 1, 2027')
    expect(formatDate('2026-12-31')).toBe('Dec 31, 2026')
  })
})

import { describe, expect, it } from 'vitest'
import {
  OVERDUE_LABEL,
  TICKET_STATUS_LABEL,
  daysText,
  furtherActionText,
  rejectionReason,
  ticketStatusLabel,
} from './labels.js'

const TICKET = { status: 'open', overdue: false, daysRemaining: 3, daysOverdue: 0 }

describe('ticketStatusLabel (AC 4.1, 10.2)', () => {
  it('labels every ticket status', () => {
    expect(Object.keys(TICKET_STATUS_LABEL).map((status) => ticketStatusLabel({ status }))).toEqual([
      'Open',
      'Awaiting review',
      'Rejected',
      'Follow-up scheduled',
      'Approved',
    ])
  })

  it('keeps the status of an overdue ticket; Overdue is a separate label', () => {
    expect(ticketStatusLabel({ status: 'awaiting_review', overdue: true })).toBe('Awaiting review')
    expect(OVERDUE_LABEL).toBe('Overdue')
  })
})

describe('daysText (AC 10.1, 11.3)', () => {
  it('counts the days left before the deadline', () => {
    expect(daysText(TICKET)).toBe('3 days left')
    expect(daysText({ ...TICKET, daysRemaining: 1 })).toBe('1 day left')
  })

  it('says a deadline of today is due today, not overdue', () => {
    expect(daysText({ ...TICKET, daysRemaining: 0 })).toBe('Due today')
  })

  it('counts the days past the deadline of an overdue ticket', () => {
    expect(daysText({ ...TICKET, overdue: true, daysRemaining: -2, daysOverdue: 2 })).toBe('2 days overdue')
    expect(daysText({ ...TICKET, overdue: true, daysRemaining: -1, daysOverdue: 1 })).toBe('1 day overdue')
  })

  it('has nothing to say about an approved ticket', () => {
    expect(daysText({ ...TICKET, status: 'approved', daysRemaining: -20 })).toBeNull()
  })
})

describe('furtherActionText (AC 6.2)', () => {
  it('uses the singular for one ticket', () => {
    expect(furtherActionText(1)).toBe('1 ticket needs further action')
  })

  it('uses the plural for several tickets', () => {
    expect(furtherActionText(3)).toBe('3 tickets need further action')
  })
})

describe('rejectionReason (AC 6.2)', () => {
  const submission = { decision: null, reviewComment: null }

  it("is the inspector's comment when the last submission was rejected", () => {
    const detail = {
      submissions: [
        { ...submission, decision: 'rejected', reviewComment: 'Too blurry.' },
        { ...submission, decision: 'rejected', reviewComment: 'The photo does not show the labels.' },
      ],
      followUps: [],
    }

    expect(rejectionReason(detail)).toBe('The photo does not show the labels.')
  })

  it('is the follow-up comment when a follow-up inspection found the issue unfixed', () => {
    const detail = {
      submissions: [{ ...submission, decision: 'follow_up', reviewComment: 'I need to see it in person.' }],
      followUps: [
        { inspectionId: 15, status: 'submitted', compliant: false, comment: 'Chicken still above the greens.' },
      ],
    }

    expect(rejectionReason(detail)).toBe('Chicken still above the greens.')
  })

  it('is null when nothing was sent back', () => {
    expect(rejectionReason({ submissions: [], followUps: [] })).toBeNull()
    expect(rejectionReason({ submissions: [submission], followUps: [] })).toBeNull()
  })
})

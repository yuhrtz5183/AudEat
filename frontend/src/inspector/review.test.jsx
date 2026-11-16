import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp, signInAs, stubApi } from '../test/renderApp.jsx'

function openReviewQueue() {
  stubApi()
  signInAs('inspector')
  return renderApp('/tickets')
}

describe('US 6 Review remediation', () => {
  it('lists evidence waiting for review and follow-ups already scheduled', async () => {
    openReviewQueue()

    const waiting = await screen.findByRole('list', { name: 'Tickets awaiting review' })
    expect(waiting).toHaveTextContent('Food-contact surfaces and utensils are clean and sanitized.')
    expect(waiting).toHaveTextContent('Blue Plate Diner')
    expect(screen.getByRole('list', { name: 'Scheduled follow-ups' })).toHaveTextContent(
      'Raw meat is stored below and apart from ready-to-eat food.',
    )
  })

  it('AC 6.1: approving the evidence resolves the issue', async () => {
    const { user } = openReviewQueue()

    await user.click(
      await screen.findByRole('link', { name: /Food-contact surfaces and utensils/ }),
    )
    await user.click(screen.getByRole('radio', { name: 'Approve' }))
    await user.click(screen.getByRole('button', { name: 'Record decision' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Remediation approved. The issue is resolved.',
    )
    expect(screen.getByText(/Resolved on/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record decision' })).not.toBeInTheDocument()
  })

  it('AC 6.2: a rejection needs a reason, then tells the owner further action is required', async () => {
    const { user } = openReviewQueue()

    await user.click(
      await screen.findByRole('link', { name: /Food-contact surfaces and utensils/ }),
    )
    await user.click(screen.getByRole('radio', { name: 'Reject' }))
    await user.click(screen.getByRole('button', { name: 'Record decision' }))
    expect(screen.getByText('Explain why further action is required.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Comment'), 'The photo does not show the repair.')
    await user.click(screen.getByRole('button', { name: 'Record decision' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Sent back to the store owner. Further action is required.',
    )
    expect(screen.getByText('The photo does not show the repair.')).toBeInTheDocument()
  })

  it('AC 6.3: a future follow-up leaves the issue unresolved', async () => {
    const { user } = openReviewQueue()

    await user.click(
      await screen.findByRole('link', { name: /Food-contact surfaces and utensils/ }),
    )
    await user.click(screen.getByRole('radio', { name: 'Schedule a follow-up' }))
    await user.type(screen.getByLabelText('Follow-up date'), '2099-06-01')
    await user.click(screen.getByRole('button', { name: 'Record decision' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Follow-up scheduled. The issue stays unresolved until that inspection is completed.',
    )
    expect(screen.getByText('Unresolved')).toBeInTheDocument()
    expect(screen.getByText(/Follow-up inspection on/)).toBeInTheDocument()
  })
})

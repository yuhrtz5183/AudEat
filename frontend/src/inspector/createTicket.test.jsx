import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp, signInAs, stubApi } from '../test/renderApp.jsx'

const REMEDIATION = 'Require hair restraints on every shift.'

function openSixViolationInspection() {
  stubApi()
  signInAs('inspector')
  return renderApp('/stores/1/inspections')
}

describe('US 3 Create a remediation ticket', () => {
  it('AC 3.1: a flagged issue without a ticket gets one the owner can be shown', async () => {
    const { user } = openSixViolationInspection()

    await user.click(await screen.findByRole('link', { name: /6 violations/ }))
    const issue = await screen.findByText('Food handlers wear clean clothing and hair restraints.')
    const card = issue.closest('li')
    await user.type(within(card).getByLabelText('Required remediation'), REMEDIATION)
    await user.type(within(card).getByLabelText('Deadline'), '2099-06-01')
    await user.click(within(card).getByRole('button', { name: 'Create ticket' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Ticket created. The store owner can see it.',
    )
    const saved = issue.closest('li')
    expect(await within(saved).findByText(/Ticket due/)).toBeInTheDocument()
    expect(saved).toHaveTextContent(REMEDIATION)
    expect(within(saved).queryByRole('button', { name: 'Create ticket' })).not.toBeInTheDocument()
  })

  it('AC 3.2: a missing deadline does not create the ticket', async () => {
    const { user } = openSixViolationInspection()

    await user.click(await screen.findByRole('link', { name: /6 violations/ }))
    const issue = await screen.findByText('Food handlers wear clean clothing and hair restraints.')
    const card = issue.closest('li')
    await user.type(within(card).getByLabelText('Required remediation'), REMEDIATION)
    await user.click(within(card).getByRole('button', { name: 'Create ticket' }))

    expect(within(card).getByText('A deadline is required.')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Create ticket' })).toBeInTheDocument()
  })
})

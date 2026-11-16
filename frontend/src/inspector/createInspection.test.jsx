import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp, signInAs, stubApi } from '../test/renderApp.jsx'

const COLD = /Cold food is held/

function startHarbor() {
  const api = stubApi()
  signInAs('inspector')
  const view = renderApp('/stores/2')
  return { ...view, fetch: api.fetch }
}

async function openDraft(user) {
  await user.click(await screen.findByRole('link', { name: 'Start an inspection' }))
  await screen.findByText(COLD)
}

describe('US 1 Create an inspection', () => {
  it('AC 1.1: starting again resumes the same draft, including a mark already made', async () => {
    const { user, fetch } = startHarbor()
    await openDraft(user)

    const cold = screen.getByText(COLD).closest('li')
    await user.click(within(cold).getByRole('radio', { name: 'Flagged' }))
    await waitFor(() => {
      expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true)
    })

    await user.click(screen.getByRole('link', { name: 'Back to store' }))
    await openDraft(user)

    expect(within(screen.getByText(COLD).closest('li')).getByRole('radio', { name: 'Flagged' })).toBeChecked()
    expect(fetch.mock.calls.filter(([url, init]) => (
      new URL(url, 'http://localhost').pathname.endsWith('/inspections') && (init?.method ?? 'GET') === 'POST'
    )).length).toBe(2)
  })

  it('AC 1.3: submitting before every line is marked shows the message and stays a draft', async () => {
    const { user } = startHarbor()
    await openDraft(user)

    await user.click(screen.getByRole('button', { name: 'Submit inspection' }))

    expect(screen.getAllByText('Mark this requirement.')).toHaveLength(8)
    expect(screen.getByRole('button', { name: 'Submit inspection' })).toBeInTheDocument()
  })

  it('AC 1.2: marking every line compliant submits the inspection with no violations', async () => {
    const { user } = startHarbor()
    await openDraft(user)

    for (const card of screen.getAllByRole('listitem')) {
      await user.click(within(card).getByRole('radio', { name: 'Compliant' }))
    }
    await user.click(screen.getByRole('button', { name: 'Submit inspection' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Inspection submitted.')
    expect(screen.queryByRole('button', { name: 'Submit inspection' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Back to inspection history' }))
    expect(await screen.findByRole('link', { name: /No violations/ })).toBeInTheDocument()
  })
})

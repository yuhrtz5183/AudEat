import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PNG_1x1 } from '../../mock/seed.js'
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

  it('AC 2.1: marking a requirement non-compliant flags it and allows entering a comment', async () => {
    const { user } = startHarbor()
    await openDraft(user)

    const cold = screen.getByText(COLD).closest('li')
    await user.click(within(cold).getByRole('radio', { name: 'Flagged' }))
    const commentField = within(cold).getByLabelText('Comment')
    await user.type(commentField, 'Walk-in cooler read 48°F.')

    await user.click(screen.getByRole('link', { name: 'Back to store' }))
    await openDraft(user)

    const coldResumed = screen.getByText(COLD).closest('li')
    expect(within(coldResumed).getByRole('radio', { name: 'Flagged' })).toBeChecked()
    expect(within(coldResumed).getByLabelText('Comment')).toHaveValue('Walk-in cooler read 48°F.')
  })

  it('AC 2.2: uploading a photo to a flagged issue attaches it and shows evidence before submitting', async () => {
    const { user } = startHarbor()
    await openDraft(user)

    const cold = screen.getByText(COLD).closest('li')
    await user.click(within(cold).getByRole('radio', { name: 'Flagged' }))

    const file = new File([PNG_1x1], 'cooler.png', { type: 'image/png' })
    const fileInput = within(cold).getByLabelText('Add a photo')
    await user.upload(fileInput, file)

    expect(await within(cold).findByLabelText('Evidence photos')).toBeInTheDocument()
    expect(within(cold).getByAltText('Issue photo')).toBeInTheDocument()

    // Clicking the thumbnail opens the full-size preview modal
    await user.click(within(cold).getByRole('button', { name: /View full photo/ }))
    expect(await screen.findByRole('dialog', { name: 'Issue photo' })).toBeInTheDocument()

    // Closing the modal
    await user.click(screen.getByRole('button', { name: 'Close photo preview' }))
    expect(screen.queryByRole('dialog', { name: 'Issue photo' })).not.toBeInTheDocument()

    // Deleting the photo removes it from the checklist
    await user.click(within(cold).getByRole('button', { name: /Delete Issue photo/ }))
    expect(within(cold).queryByAltText('Issue photo')).not.toBeInTheDocument()
    expect(within(cold).queryByLabelText('Evidence photos')).not.toBeInTheDocument()
  })
})

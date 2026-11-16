import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp, signInAs, stubApi } from '../test/renderApp.jsx'

const RAW_MEAT = /Raw meat is stored below/

describe('US 7 Record a follow-up inspection', () => {
  it('AC 7.3: completing the scheduled visit resolves the issue and adds it to history', async () => {
    stubApi({ today: '2026-11-15' })
    signInAs('inspector')
    const { user } = renderApp('/tickets')

    const scheduled = await screen.findByRole('list', { name: 'Scheduled follow-ups' })
    expect(scheduled).toHaveTextContent(RAW_MEAT)
    await user.click(within(scheduled).getByRole('link', { name: 'Complete follow-up' }))

    const line = await screen.findByText(RAW_MEAT)
    await user.click(within(line.closest('li')).getByRole('radio', { name: 'Compliant' }))
    await user.click(screen.getByRole('button', { name: 'Submit inspection' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Inspection submitted.')
    expect(screen.queryByRole('button', { name: 'Submit inspection' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Back to inspection history' }))
    expect(await screen.findByRole('link', { name: 'Nov 15, 2026 · No violations' })).toBeInTheDocument()
  })
})

import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp, signInAs, stubApi } from '../test/renderApp.jsx'

const TODAY = '2026-11-04'

function openHistory(storeId = 1) {
  stubApi({ today: TODAY })
  signInAs('inspector')
  return renderApp(`/stores/${storeId}/inspections`)
}

describe('US 8 Inspector views a store inspection history', () => {
  it("AC 8.1: lists the store's inspections, newest first, showing date, inspector and violations", async () => {
    openHistory(1)

    const list = await screen.findByRole('list', { name: 'Inspections' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(3)

    // Newest first (-10 days: Oct 25, 2026, 6 violations)
    expect(items[0]).toHaveTextContent('Oct 25, 2026')
    expect(items[0]).toHaveTextContent('Ivy Inspector')
    expect(items[0]).toHaveTextContent('6 violations')

    // Second (-30 days: Oct 5, 2026, no violations)
    expect(items[1]).toHaveTextContent('Oct 5, 2026')
    expect(items[1]).toHaveTextContent('Ivy Inspector')
    expect(items[1]).toHaveTextContent('No violations')

    // Oldest (-60 days: Sep 5, 2026, 1 violation)
    expect(items[2]).toHaveTextContent('Sep 5, 2026')
    expect(items[2]).toHaveTextContent('Ivy Inspector')
    expect(items[2]).toHaveTextContent('1 violation')
  })

  it('AC 8.2: selecting an inspection displays every requirement, comments, photos, and ticket status', async () => {
    const { user } = openHistory(1)

    // Select the newest inspection
    await user.click(await screen.findByRole('link', { name: /6 violations/ }))

    // Displays the inspection details page
    expect(await screen.findByRole('heading', { level: 1, name: 'Blue Plate Diner' })).toBeInTheDocument()
    const main = screen.getByRole('main')
    expect(within(main).getByText(/Oct 25, 2026/)).toBeInTheDocument()
    expect(within(main).getByText(/Ivy Inspector/)).toBeInTheDocument()

    const checklist = screen.getByRole('list', { name: 'Checklist' })
    // 8 checklist requirements
    expect(checklist.querySelectorAll(':scope > li')).toHaveLength(8)

    // Flagged issue with comment, photo and ticket
    const cooler = screen.getByText(/Cold food is held at 41°F/).closest('li')
    expect(within(cooler).getByText('Flagged')).toBeInTheDocument()
    expect(within(cooler).getByText('Walk-in cooler read 48°F.')).toBeInTheDocument()
    expect(within(cooler).getByAltText('Issue photo')).toBeInTheDocument()

    // Shows remediation ticket with current status (e.g. Open)
    expect(within(cooler).getByText('Open')).toBeInTheDocument()
    expect(within(cooler).getByText(/Ticket due/)).toBeInTheDocument()

    // Compliant issue
    const garbage = screen.getByText(/Garbage is kept in covered bins/).closest('li')
    expect(within(garbage).getByText('Compliant')).toBeInTheDocument()
  })

  it('AC 8.3: displays message when store has no completed inspections', async () => {
    // Harbor Noodle House (storeId: 2) has no inspections
    openHistory(2)

    expect(await screen.findByText('No inspections recorded for this store')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Inspections' })).not.toBeInTheDocument()
  })
})

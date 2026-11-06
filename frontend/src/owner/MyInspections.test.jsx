import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp, requestsTo, signInAs, stubApi } from '../test/renderApp.jsx'
import { violationsText } from './MyInspections.jsx'

// The seed is relative to today, so pin it to get fixed dates (DESIGN §5).
const TODAY = '2026-11-04'

function stubHistory(response) {
  return stubApi({
    today: TODAY,
    override: (method, path) => (path === '/api/my-store/inspections' ? response() : null),
  })
}

function summary(fields) {
  return {
    id: 1,
    inspectionDate: '2026-10-01',
    inspectorName: 'Ivy Inspector',
    violationCount: 0,
    followUp: false,
    ...fields,
  }
}

/** Each listed inspection as [date, violations], in page order. */
function rows() {
  return within(screen.getByRole('list', { name: 'Inspections' }))
    .getAllByRole('listitem')
    .map((item) => [
      item.querySelector('time').textContent,
      within(item).getByText('Violations', { selector: 'dt' }).nextElementSibling.textContent,
    ])
}

async function openHistory(who = 'owner') {
  signInAs(who)
  renderApp('/my-store/inspections')
  await screen.findByRole('list', { name: 'Inspections' })
}

describe("a store owner sees their store's inspection history (US 9)", () => {
  it("AC 9.1: lists only my store's inspections, newest first, with each date and number of violations", async () => {
    const { fetch } = stubApi({ today: TODAY })
    await openHistory()

    expect(rows()).toEqual([
      ['Oct 25, 2026', '6 violations'],
      ['Oct 5, 2026', 'No violations'],
      ['Sep 5, 2026', '1 violation'],
    ])
    // Corner Bakery's inspections (Oct 30, Sep 25) are not shown, and no store id is sent.
    expect(screen.queryByText('Oct 30, 2026')).not.toBeInTheDocument()
    expect(screen.queryByText('Sep 25, 2026')).not.toBeInTheDocument()
    expect(requestsTo(fetch, '/api/my-store/inspections')).toHaveLength(1)
    const sent = fetch.mock.calls
      .map(([url]) => new URL(url, 'http://localhost'))
      .filter((url) => url.pathname === '/api/my-store/inspections')
    expect(sent.map((url) => url.search)).toEqual([''])
    expect(screen.queryByText('No inspections recorded for this store')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Inspection history' })).toBeInTheDocument()
  })

  it("AC 9.1: another owner sees only their own store's history, with the follow-up marked", async () => {
    stubApi({ today: TODAY })
    await openHistory('otherOwner')

    expect(rows()).toEqual([
      ['Oct 30, 2026', '1 violation'],
      ['Oct 5, 2026', 'No violations'],
      ['Sep 25, 2026', '1 violation'],
    ])
    const followUp = screen.getAllByRole('listitem')[1]
    expect(within(followUp).getByText('Follow-up inspection')).toBeInTheDocument()
    expect(screen.getAllByText('Follow-up inspection')).toHaveLength(1)
    expect(screen.queryByText('Oct 25, 2026')).not.toBeInTheDocument()
    expect(screen.queryByText('No inspections recorded for this store')).not.toBeInTheDocument()
  })

  it('AC 9.1: keeps the order the API sends', async () => {
    stubHistory(() =>
      Response.json([
        summary({ id: 2, inspectionDate: '2026-09-01', violationCount: 2 }),
        summary({ id: 1, inspectionDate: '2026-10-01', violationCount: 1 }),
      ]),
    )
    await openHistory()

    expect(rows()).toEqual([
      ['Sep 1, 2026', '2 violations'],
      ['Oct 1, 2026', '1 violation'],
    ])
  })

  it('AC 9.1: says when the store has no recorded inspections', async () => {
    stubHistory(() => Response.json([]))
    signInAs('owner')
    renderApp('/my-store/inspections')

    expect(await screen.findByText('No inspections recorded for this store')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Inspections' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to my store' })).toHaveAttribute('href', '/my-store')
  })

  it('AC 9.1: shows a loading message, then the history', async () => {
    let finish
    stubHistory(() => new Promise((resolve) => { finish = resolve }))
    signInAs('owner')
    renderApp('/my-store/inspections')

    expect(screen.getByText('Loading your inspection history…')).toBeInTheDocument()
    finish(Response.json([summary({ violationCount: 3 })]))
    expect(await screen.findByText('3 violations')).toBeInTheDocument()
    expect(screen.queryByText('Loading your inspection history…')).not.toBeInTheDocument()
  })

  it('AC 9.1: offers a retry when the history fails to load', async () => {
    let failures = 1
    const { fetch } = stubHistory(() =>
      failures-- > 0 ? new Response('', { status: 503 }) : null,
    )
    signInAs('owner')
    const { user } = renderApp('/my-store/inspections')

    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('list', { name: 'Inspections' })).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load your inspection history.", { exact: false })).not.toBeInTheDocument()
    expect(requestsTo(fetch, '/api/my-store/inspections')).toHaveLength(2)
  })

  it('AC 9.1: the store page links to the history', async () => {
    stubApi({ today: TODAY })
    signInAs('owner')
    const { user } = renderApp('/my-store')

    await user.click(await screen.findByRole('link', { name: 'Inspection history' }))

    expect(await screen.findByRole('list', { name: 'Inspections' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/my-store/inspections')
  })
})

describe('violationsText', () => {
  it('words zero, one and several violations', () => {
    expect(violationsText(0)).toBe('No violations')
    expect(violationsText(1)).toBe('1 violation')
    expect(violationsText(6)).toBe('6 violations')
  })
})

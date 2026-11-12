import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp, requestsTo, signInAs, stubApi } from '../test/renderApp.jsx'

// The seed is relative to today, so pin it to get fixed deadlines (DESIGN §5).
const TODAY = '2026-11-04'

const COOLER = 'Cold food is held at 41°F (5°C) or below and hot food at 135°F (57°C) or above.'
const PAPER_TOWELS = 'Handwashing sinks are accessible and stocked with soap and paper towels.'
const LABELS = 'Stored food is labeled and within its use-by date.'
const CUTTING_BOARDS = 'Food-contact surfaces and utensils are clean and sanitized.'
const RAW_MEAT = 'Raw meat is stored below and apart from ready-to-eat food.'
const PESTS = 'There is no sign of pests.'

function ticket(fields) {
  return {
    id: 1,
    status: 'open',
    overdue: false,
    deadline: '2026-11-10',
    daysRemaining: 6,
    daysOverdue: 0,
    requiredRemediation: 'Fix it.',
    issue: { resultId: 1, requirement: 'An issue', comment: null, resolved: false },
    storeId: 1,
    storeName: 'Blue Plate Diner',
    inspectionId: 1,
    inspectionDate: '2026-10-25',
    followUpDate: null,
    followUpInspectionId: null,
    ...fields,
  }
}

function stubTickets(response) {
  return stubApi({
    today: TODAY,
    override: (method, path) => (path === '/api/my-store/tickets' ? response() : null),
  })
}

async function openMyTickets() {
  signInAs('owner')
  renderApp('/my-store/tickets')
  await screen.findByRole('list', { name: 'Open tickets' })
}

/** The list item of the ticket whose issue link names `requirement`. */
function ticketItem(requirement) {
  return screen.getByRole('link', { name: requirement }).closest('li')
}

/** The value next to a term of a details list, e.g. fact(item, 'Status'). */
function fact(container, term) {
  return within(container).getByText(term, { selector: 'dt' }).nextElementSibling
}

function issueOrder() {
  return screen
    .getAllByRole('listitem')
    .map((item) => within(item).getAllByRole('link')[0].textContent)
}

describe("a store owner sees their store's remediation tickets (US 4, 10)", () => {
  it('AC 4.1: shows each ticket with its flagged issue, deadline, status and required remediation', async () => {
    stubApi({ today: TODAY })
    await openMyTickets()

    const cooler = within(ticketItem(COOLER))
    expect(cooler.getByText('Walk-in cooler read 48°F.')).toBeInTheDocument()
    expect(cooler.getByText('Nov 2, 2026')).toBeInTheDocument()
    expect(cooler.getByText('Open')).toBeInTheDocument()
    expect(
      cooler.getByText('Repair the cooler and log temperatures twice daily.'),
    ).toBeInTheDocument()

    const labels = within(ticketItem(LABELS))
    expect(labels.getByText('Unlabeled containers in the walk-in.')).toBeInTheDocument()
    expect(labels.getByText('Rejected')).toBeInTheDocument()
    expect(labels.getByText('Label and date every container in the walk-in.')).toBeInTheDocument()

    expect(within(ticketItem(CUTTING_BOARDS)).getByText('Awaiting review')).toBeInTheDocument()
    expect(within(ticketItem(RAW_MEAT)).getByText('Follow-up scheduled')).toBeInTheDocument()
    expect(within(ticketItem(RAW_MEAT)).getByText('Nov 6, 2026')).toBeInTheDocument()
    expect(screen.queryByText('Corner Bakery Co.')).not.toBeInTheDocument()
    expect(screen.queryByText(/Dumpster lid/)).not.toBeInTheDocument()
  })

  it("AC 4.1: each ticket links to its details", async () => {
    stubApi({ today: TODAY })
    signInAs('owner')
    const { user } = renderApp('/my-store/tickets')

    await user.click(await screen.findByRole('link', { name: COOLER }))

    expect(screen.getByTestId('location')).toHaveTextContent(/^\/my-store\/tickets\/\d+$/)
    expect(await screen.findByText('Walk-in cooler read 48°F.')).toBeInTheDocument()
  })

  it('AC 10.1: lists the tickets nearest deadline first, with each deadline and the days remaining', async () => {
    stubApi({ today: TODAY })
    await openMyTickets()

    expect(issueOrder()).toEqual([COOLER, PAPER_TOWELS, LABELS, CUTTING_BOARDS, RAW_MEAT, PESTS])
    const deadlines = [
      [COOLER, 'Nov 2, 2026', '2 days overdue'],
      [PAPER_TOWELS, 'Nov 4, 2026', 'Due today'],
      [LABELS, 'Nov 7, 2026', '3 days left'],
      [CUTTING_BOARDS, 'Nov 9, 2026', '5 days left'],
      [RAW_MEAT, 'Nov 11, 2026', '7 days left'],
    ]
    for (const [requirement, deadline, days] of deadlines) {
      const item = within(ticketItem(requirement))
      expect(item.getByText(deadline)).toBeInTheDocument()
      expect(item.getByText(days)).toBeInTheDocument()
    }
  })

  it('AC 10.1: keeps the order the API sends', async () => {
    stubTickets(() =>
      Response.json([
        ticket({ id: 1, issue: { requirement: 'First issue', comment: null }, deadline: '2026-11-20' }),
        ticket({ id: 2, issue: { requirement: 'Second issue', comment: null }, deadline: '2026-11-05' }),
      ]),
    )
    await openMyTickets()

    expect(issueOrder()).toEqual(['First issue', 'Second issue'])
  })

  it('AC 10.1: shows approved tickets after the open ones, as resolved', async () => {
    stubApi({ today: TODAY })
    await openMyTickets()

    const resolved = screen.getByRole('list', { name: 'Resolved tickets' })
    expect(screen.getByRole('heading', { name: 'Resolved' })).toBeInTheDocument()
    expect(within(resolved).getAllByRole('listitem')).toHaveLength(1)
    expect(within(resolved).getByRole('link', { name: PESTS })).toBeInTheDocument()
    expect(within(resolved).getByText('Approved')).toBeInTheDocument()
    expect(
      within(screen.getByRole('list', { name: 'Open tickets' })).getAllByRole('listitem'),
    ).toHaveLength(5)
  })

  it('AC 10.2: labels the overdue ticket "Overdue", shows it first and keeps its status', async () => {
    stubApi({ today: TODAY })
    await openMyTickets()

    const firstItem = screen.getAllByRole('listitem')[0]
    const first = within(firstItem)
    expect(first.getByRole('link', { name: COOLER })).toBeInTheDocument()
    // "Overdue" is shown as the status, next to the current status.
    expect(fact(firstItem, 'Status')).toHaveTextContent(/^Overdue · Open$/)
    expect(fact(firstItem, 'Deadline')).toHaveTextContent('2 days overdue')
    expect(screen.getAllByText('Overdue')).toHaveLength(1)
    expect(fact(ticketItem(PAPER_TOWELS), 'Status')).toHaveTextContent(/^Open$/)
  })

  it('AC 10.2: shows overdue exactly as the API reports it (no date math in the browser)', async () => {
    // Deadlines that contradict the flags: a browser that worked out overdue or the day
    // counts from the dates (or today's date) would show these differently.
    stubTickets(() =>
      Response.json([
        ticket({
          id: 1,
          issue: { requirement: 'Deadline already passed', comment: null },
          status: 'open',
          overdue: false,
          deadline: '2020-01-01',
          daysRemaining: 0,
          daysOverdue: 0,
        }),
        ticket({
          id: 2,
          issue: { requirement: 'Deadline far ahead', comment: null },
          status: 'rejected',
          overdue: true,
          deadline: '2099-12-31',
          daysRemaining: -1,
          daysOverdue: 1,
        }),
      ]),
    )
    await openMyTickets()

    expect(issueOrder()).toEqual(['Deadline already passed', 'Deadline far ahead'])
    const notOverdue = ticketItem('Deadline already passed')
    expect(fact(notOverdue, 'Status')).toHaveTextContent(/^Open$/)
    expect(fact(notOverdue, 'Deadline')).toHaveTextContent('Due today')
    expect(within(notOverdue).queryByText(/overdue/i)).not.toBeInTheDocument()
    const overdue = ticketItem('Deadline far ahead')
    expect(fact(overdue, 'Status')).toHaveTextContent(/^Overdue · Rejected$/)
    expect(fact(overdue, 'Deadline')).toHaveTextContent('1 day overdue')
  })

  it('AC 10.2: a ticket due today is not overdue', async () => {
    stubApi({ today: TODAY })
    await openMyTickets()

    const dueToday = within(ticketItem(PAPER_TOWELS))
    expect(dueToday.getByText('Due today')).toBeInTheDocument()
    expect(dueToday.getByText('Open')).toBeInTheDocument()
    expect(dueToday.queryByText('Overdue')).not.toBeInTheDocument()
  })

  it('AC 10.2: an approved ticket past its deadline is not overdue', async () => {
    stubApi({ today: TODAY })
    await openMyTickets()

    const approved = within(ticketItem(PESTS))
    expect(approved.getByText('Approved')).toBeInTheDocument()
    expect(approved.getByText('Sep 25, 2026')).toBeInTheDocument()
    expect(approved.queryByText('Overdue')).not.toBeInTheDocument()
    expect(approved.queryByText(/overdue|left|Due today/)).not.toBeInTheDocument()
  })

  it('AC 10.2: an overdue ticket awaiting review shows both "Overdue" and its status', async () => {
    stubTickets(() =>
      Response.json([
        ticket({
          status: 'awaiting_review',
          overdue: true,
          deadline: '2026-11-03',
          daysRemaining: -1,
          daysOverdue: 1,
        }),
      ]),
    )
    await openMyTickets()

    const item = ticketItem('An issue')
    expect(fact(item, 'Status')).toHaveTextContent(/^Overdue · Awaiting review$/)
    expect(fact(item, 'Deadline')).toHaveTextContent('1 day overdue')
  })

  it('AC 4.1: says when the store has no remediation tickets', async () => {
    stubTickets(() => Response.json([]))
    signInAs('owner')
    renderApp('/my-store/tickets')

    expect(await screen.findByText('No remediation tickets')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to my store' })).toHaveAttribute('href', '/my-store')
  })

  it('AC 4.1: says when every ticket is resolved', async () => {
    stubTickets(() =>
      Response.json([ticket({ status: 'approved', deadline: '2026-10-01', daysRemaining: -34 })]),
    )
    signInAs('owner')
    renderApp('/my-store/tickets')

    expect(await screen.findByText('No open remediation tickets')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'An issue' })).toBeInTheDocument()
  })

  it('AC 4.1: shows the heading while the tickets load', async () => {
    let finish
    stubTickets(() => new Promise((resolve) => { finish = resolve }))
    signInAs('owner')
    renderApp('/my-store/tickets')

    expect(screen.getByRole('heading', { name: 'Remediation tickets' })).toBeInTheDocument()
    expect(document.title).toBe('Remediation tickets')
    expect(screen.getByText('Loading your tickets…')).toBeInTheDocument()

    finish(Response.json([ticket({})]))
    expect(await screen.findByRole('link', { name: 'An issue' })).toBeInTheDocument()
    expect(screen.queryByText('Loading your tickets…')).not.toBeInTheDocument()
  })

  it('AC 4.1: offers a retry when the tickets fail to load', async () => {
    let failures = 1
    const { fetch } = stubTickets(() =>
      failures-- > 0 ? new Response('', { status: 503 }) : null,
    )
    signInAs('owner')
    const { user } = renderApp('/my-store/tickets')

    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('link', { name: COOLER })).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load your tickets.", { exact: false })).not.toBeInTheDocument()
    expect(requestsTo(fetch, '/api/my-store/tickets')).toHaveLength(2)
  })

  it("AC 4.1: another owner sees only their own store's tickets", async () => {
    stubApi({ today: TODAY })
    signInAs('otherOwner')
    renderApp('/my-store/tickets')

    expect(
      await screen.findByRole('link', {
        name: 'Garbage is kept in covered bins and removed regularly.',
      }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByRole('link', { name: COOLER })).not.toBeInTheDocument()
  })
})

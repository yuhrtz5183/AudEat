import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp, requestsTo, signInAs, stubApi } from '../test/renderApp.jsx'

function myStore(counts) {
  return Response.json({ id: 1, name: 'Blue Plate Diner', address: '412 Main St', ...counts })
}

function stubMyStore(response) {
  return stubApi({ override: (method, path) => (path === '/api/my-store' ? response() : null) })
}

describe('a store owner sees their store (US 15)', () => {
  it("AC 15.1: shows the store's name, address and open ticket count", async () => {
    stubApi()
    signInAs('owner')
    renderApp('/my-store')

    expect(await screen.findByText('5 open remediation tickets')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Blue Plate Diner' })).toBeInTheDocument()
    expect(document.title).toBe('Blue Plate Diner')
    expect(screen.getByText('412 Main St')).toBeInTheDocument()
  })

  it('AC 15.1: links to my tickets and inspection history', async () => {
    stubApi()
    signInAs('owner')
    const { user } = renderApp('/my-store')

    const tickets = await screen.findByRole('link', { name: 'My remediation tickets' })
    expect(tickets).toHaveAttribute('href', '/my-store/tickets')
    expect(screen.getByRole('link', { name: 'Inspection history' })).toHaveAttribute(
      'href',
      '/my-store/inspections',
    )

    await user.click(tickets)
    expect(screen.getByTestId('location')).toHaveTextContent('/my-store/tickets')
  })

  it("AC 15.1: shows another owner only their own store's count, in the singular", async () => {
    stubApi()
    signInAs('otherOwner')
    renderApp('/my-store')

    expect(await screen.findByText('1 open remediation ticket')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Corner Bakery Co.' })).toBeInTheDocument()
    expect(screen.queryByText('Blue Plate Diner')).not.toBeInTheDocument()
  })

  it('AC 15.1: says when the store has no open tickets', async () => {
    stubMyStore(() => myStore({ openTicketCount: 0, rejectedCount: 0 }))
    signInAs('owner')
    renderApp('/my-store')

    expect(await screen.findByText('No open remediation tickets')).toBeInTheDocument()
  })

  it('AC 15.1 + 6.2: shows how many rejected tickets need further action', async () => {
    stubApi()
    signInAs('owner')
    renderApp('/my-store')

    expect(await screen.findByText('1 ticket needs further action')).toBeInTheDocument()
  })

  it('AC 15.1 + 6.2: shows no further-action notice when nothing was rejected', async () => {
    stubMyStore(() => myStore({ openTicketCount: 2, rejectedCount: 0 }))
    signInAs('owner')
    renderApp('/my-store')

    expect(await screen.findByText('2 open remediation tickets')).toBeInTheDocument()
    expect(screen.queryByText(/further action/)).not.toBeInTheDocument()
  })

  it('AC 15.1: names the store from the session while it loads', async () => {
    let finish
    stubMyStore(() => new Promise((resolve) => { finish = resolve }))
    signInAs('owner')
    renderApp('/my-store')

    expect(screen.getByRole('heading', { name: 'Blue Plate Diner' })).toBeInTheDocument()
    expect(screen.getByText('Loading your store…')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'My remediation tickets' })).not.toBeInTheDocument()

    finish(myStore({ openTicketCount: 5, rejectedCount: 1 }))
    expect(await screen.findByText('5 open remediation tickets')).toBeInTheDocument()
    expect(screen.queryByText('Loading your store…')).not.toBeInTheDocument()
  })

  it('AC 15.1: offers a retry when the store fails to load', async () => {
    let failures = 1
    const { fetch } = stubMyStore(() =>
      failures-- > 0 ? new Response('', { status: 503 }) : null,
    )
    signInAs('owner')
    const { user } = renderApp('/my-store')

    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('5 open remediation tickets')).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load your store.", { exact: false })).not.toBeInTheDocument()
    expect(requestsTo(fetch, '/api/my-store')).toHaveLength(2)
  })
})

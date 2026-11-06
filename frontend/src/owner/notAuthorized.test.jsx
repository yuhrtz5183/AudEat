import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp, requestsTo, signInAs, stubApi } from '../test/renderApp.jsx'

describe('owners cannot open inspector pages (AC 9.2, 15.2)', () => {
  it.each([
    ['AC 15.2', "the inspector's store list", '/stores', '/api/stores'],
    ['AC 9.2', "another store's inspection history", '/stores/3/inspections', '/api/stores/3/inspections'],
    // Inspection 7 is Corner Bakery's latest submitted inspection in the mock seed.
    ['AC 9.2', "another store's inspection", '/inspections/7', '/api/inspections/7'],
  ])('%s: an owner opening %s is returned to their store with a not-authorized message', async (ac, page, path, api) => {
    const { fetch } = stubApi()
    signInAs('owner')
    renderApp(path)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You are not authorized to view this page.',
    )
    expect(screen.getByTestId('location')).toHaveTextContent('/my-store')
    expect(screen.getByRole('heading', { name: 'Blue Plate Diner' })).toBeInTheDocument()
    expect(await screen.findByText('5 open remediation tickets')).toBeInTheDocument()
    expect(screen.queryByText('Corner Bakery Co.')).not.toBeInTheDocument()
    expect(screen.queryByText('Harbor Noodle House')).not.toBeInTheDocument()
    expect(requestsTo(fetch, api)).toHaveLength(0)
  })

  it('AC 15.2: shows no message when the owner opens their own store', async () => {
    stubApi()
    signInAs('owner')
    renderApp('/my-store')

    expect(screen.getByRole('heading', { name: 'Blue Plate Diner' })).toBeInTheDocument()
    expect(await screen.findByText('5 open remediation tickets')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp, stubApi } from '../test/renderApp.jsx'

const INSPECTOR = {
  name: 'Ada Inspector',
  email: 'ada@example.com',
  role: 'inspector',
}
const SESSION_KEY = 'audeat.session'

function signInInspector() {
  const api = stubApi()
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'inspector-token', user: INSPECTOR }))
  return api
}

describe('inspector store selection (US 14)', () => {
  it('AC 14.1: selecting a store shows its details and inspection options', async () => {
    signInInspector()
    const { user } = renderApp('/stores')

    await user.click(await screen.findByRole('link', { name: /Harbor Noodle House/ }))

    expect(screen.getByTestId('location')).toHaveTextContent('/stores/2')
    expect(screen.getByRole('heading', { name: 'Harbor Noodle House' })).toBeInTheDocument()
    expect(screen.getByText('88 Wharf Ave')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start an inspection' })).toHaveAttribute(
      'href',
      '/stores/2/inspections/new',
    )
    expect(screen.getByRole('link', { name: 'View inspection history' })).toHaveAttribute(
      'href',
      '/stores/2/inspections',
    )
  })

  it('AC 14.2: filters stores by a case-insensitive partial name', async () => {
    signInInspector()
    const { user } = renderApp('/stores')
    const list = await screen.findByRole('list', { name: 'Stores' })

    await user.type(screen.getByRole('searchbox', { name: 'Search stores by name' }), 'bAkEr')

    expect(within(list).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Corner Bakery Co.1500 Grand Blvd',
    ])
  })

  it('AC 14.3: shows the no-match message when search finds no stores', async () => {
    signInInspector()
    const { user } = renderApp('/stores')

    await user.type(
      await screen.findByRole('searchbox', { name: 'Search stores by name' }),
      'no matching store',
    )

    expect(await screen.findByRole('status')).toHaveTextContent('No stores found')
    expect(screen.queryByRole('list', { name: 'Stores' })).not.toBeInTheDocument()
  })

  it('AC 14.1: the store-specific inspection actions retain the selected store', async () => {
    signInInspector()
    const { user } = renderApp('/stores/2')

    await user.click(await screen.findByRole('link', { name: 'Start an inspection' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/stores/2/inspections/new')
    expect(screen.getByRole('heading', { name: 'New inspection' })).toBeInTheDocument()
    expect(screen.getByText('Harbor Noodle House')).toBeInTheDocument()
    expect(screen.getByText('Inspection creation is not available yet.')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Back to store' }))
    await user.click(screen.getByRole('link', { name: 'View inspection history' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/stores/2/inspections')
    expect(screen.getByRole('heading', { name: 'Inspection history' })).toBeInTheDocument()
    expect(screen.getByText('Inspection history is not available yet.')).toBeInTheDocument()
  })

  it('AC 14.4: opening new inspection without a selected store redirects with a message', async () => {
    const { fetch } = signInInspector()
    renderApp('/inspections/new')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Select a store before starting an inspection.',
    )
    expect(screen.getByTestId('location')).toHaveTextContent('/stores')
    expect(fetch.mock.calls.some(([url]) => new URL(url, 'http://localhost').pathname.includes('inspection'))).toBe(false)
  })
})

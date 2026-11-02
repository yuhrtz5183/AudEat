import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp, stubApi } from '../test/renderApp.jsx'

const OWNER = {
  name: 'Bea Owner',
  email: 'owner.blueplate@audeat.test',
  role: 'owner',
  storeId: 1,
  storeName: 'Blue Plate Diner',
}
const SESSION_KEY = 'audeat.session'

function signInOwner() {
  stubApi()
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'owner-token', user: OWNER }))
}

describe('owners cannot open inspector pages (AC 9.2, 15.2)', () => {
  it.each(['/stores', '/stores/3/inspections'])(
    'returns an owner opening %s to their store with a not-authorized message',
    async (path) => {
      signInOwner()
      renderApp(path)

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'You are not authorized to view this page.',
      )
      expect(screen.getByTestId('location')).toHaveTextContent('/my-store')
      expect(screen.getByRole('heading', { name: 'Blue Plate Diner' })).toBeInTheDocument()
      expect(screen.queryByText('Corner Bakery Co.')).not.toBeInTheDocument()
    },
  )

  it('shows no message when the owner opens their own store', () => {
    signInOwner()
    renderApp('/my-store')

    expect(screen.getByRole('heading', { name: 'Blue Plate Diner' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

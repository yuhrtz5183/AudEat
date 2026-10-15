import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { vi } from 'vitest'
import { createMockBackend } from '../../mock/backend.js'
import App from '../App.jsx'

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>
}

/**
 * Stubs fetch with the mock backend. `override(method, path, body)` may return a
 * Response (or throw) to replace the backend for a request.
 */
export function stubApi({ override } = {}) {
  const backend = createMockBackend()
  const fetch = vi.fn(async (url, init = {}) => {
    const method = init.method ?? 'GET'
    const path = new URL(url, 'http://localhost').pathname
    const body = init.body ? JSON.parse(init.body) : undefined
    const replaced = await override?.(method, path, body)
    if (replaced) return replaced
    const result = backend.handle(method, path, body)
    return Response.json(result.body, { status: result.status })
  })
  vi.stubGlobal('fetch', fetch)
  return { backend, fetch }
}

export function requestsTo(fetch, path) {
  return fetch.mock.calls
    .filter(([url]) => url.endsWith(path))
    .map(([, init]) => (init.body ? JSON.parse(init.body) : undefined))
}

export function renderApp(path = '/') {
  const user = userEvent.setup()
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  )
  return { user, ...view }
}

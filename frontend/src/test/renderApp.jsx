import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { vi } from 'vitest'
import { createMockBackend } from '../../mock/backend.js'
import { MOCK_TOKENS, MOCK_USERS } from '../../mock/seed.js'
import App from '../App.jsx'
import { saveSession } from '../auth/session.js'

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>
}

// FormData bodies (uploads) pass through as they are; everything else is JSON.
function parseBody(body) {
  if (body instanceof FormData) return body
  return body ? JSON.parse(body) : undefined
}

/**
 * Stubs fetch with the mock backend, seeded relative to `today` ('YYYY-MM-DD', default the
 * local date). `override(method, path, body)` may return a Response (or throw) to replace the
 * backend for a request.
 */
export function stubApi({ override, today } = {}) {
  const backend = createMockBackend({ today })
  const fetch = vi.fn(async (url, init = {}) => {
    const method = init.method ?? 'GET'
    const { pathname, search } = new URL(url, 'http://localhost')
    const body = parseBody(init.body)
    const replaced = await override?.(method, pathname, body)
    if (replaced) return replaced
    const authorization = new Headers(init.headers).get('Authorization') ?? undefined
    const result = backend.handle(method, pathname + search, body, { authorization })
    if (result.blob) {
      // jsdom's Blob is not one Node's Response can read, so pass the bytes.
      return new Response(await result.blob.arrayBuffer(), {
        status: result.status,
        headers: { 'Content-Type': result.blob.type },
      })
    }
    return Response.json(result.body, { status: result.status })
  })
  vi.stubGlobal('fetch', fetch)
  return { backend, fetch }
}

export function requestsTo(fetch, path) {
  return fetch.mock.calls
    .filter(([url]) => new URL(url, 'http://localhost').pathname === path)
    .map(([, init]) => parseBody(init?.body))
}

/** Signs in as a seeded demo user ('inspector', 'owner' or 'otherOwner') for this tab. */
export function signInAs(who) {
  saveSession({ token: MOCK_TOKENS[who], user: MOCK_USERS[who] }, false)
  return MOCK_USERS[who]
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

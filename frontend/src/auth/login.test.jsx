import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp, requestsTo, stubApi } from '../test/renderApp.jsx'

const INSPECTOR = { name: 'Ada Inspector', email: 'ada@example.com', password: 'correct-horse', role: 'inspector' }
const OWNER = { name: 'Sam Owner', email: 'sam@example.com', password: 'tasty-noodles', role: 'owner', storeId: '2' }
const SESSION_KEY = 'audeat.session'

function seedUsers() {
  const api = stubApi()
  api.backend.handle('POST', '/api/auth/register', INSPECTOR)
  api.backend.handle('POST', '/api/auth/register', OWNER)
  return api
}

function storeSession(storage, user, token = 'token-123') {
  storage.setItem(SESSION_KEY, JSON.stringify({ token, user }))
}

// An unsigned JWT is enough here: the frontend only reads the `exp` claim.
function jwtExpiringIn(seconds) {
  const encode = (value) =>
    btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  const exp = Math.floor(Date.now() / 1000) + seconds
  return `${encode({ alg: 'HS256' })}.${encode({ sub: '1', role: 'inspector', exp })}.signature`
}

async function signIn(user, { email, password }, { remember = false } = {}) {
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
  if (remember) await user.click(screen.getByRole('checkbox', { name: 'Keep me signed in' }))
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}

describe('US 13 Log in', () => {
  it('AC 13.1: logs an inspector in and shows the store list', async () => {
    const { fetch } = seedUsers()
    const { user } = renderApp('/login')

    await signIn(user, { ...INSPECTOR, email: `  ${INSPECTOR.email} ` })

    expect(await screen.findByRole('heading', { name: 'Stores' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/stores')
    expect(screen.getByText(INSPECTOR.name)).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Stores' })
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Blue Plate Diner412 Main St',
      'Corner Bakery Co.1500 Grand Blvd',
      'Harbor Noodle House88 Wharf Ave',
    ])
    expect(requestsTo(fetch, '/api/auth/login')).toEqual([{ email: INSPECTOR.email, password: INSPECTOR.password }])
  })

  it('AC 13.1: logs a store owner in and shows their store', async () => {
    seedUsers()
    const { user } = renderApp('/login')

    await signIn(user, OWNER)

    expect(await screen.findByRole('heading', { name: 'Harbor Noodle House' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/my-store')
  })

  it('AC 13.2: rejects a wrong password without saying which field was wrong', async () => {
    seedUsers()
    const { user } = renderApp('/login')

    await signIn(user, { email: INSPECTOR.email, password: 'wrong-password' })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Invalid email or password.')
    expect(alert).toHaveTextContent(
      "Check your password and try again, or create an account if you're new to AudEat.",
    )
    expect(alert).not.toHaveTextContent(/not registered|incorrect password|wrong password/i)
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('AC 13.2: keeps the email, clears the password and puts the cursor in it', async () => {
    seedUsers()
    const { user } = renderApp('/login')

    await signIn(user, { email: INSPECTOR.email, password: 'wrong-password' })
    await screen.findByRole('alert')

    expect(screen.getByLabelText('Email')).toHaveValue(INSPECTOR.email)
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveFocus()
    expect(screen.queryByText('Enter your password.')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Password'), INSPECTOR.password)
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Stores' })).toBeInTheDocument()
  })

  it('AC 13.2: responds to an unregistered email exactly as to a wrong password', async () => {
    seedUsers()
    const first = renderApp('/login')
    await signIn(first.user, { email: INSPECTOR.email, password: 'wrong-password' })
    const wrongPassword = (await screen.findByRole('alert')).textContent
    first.unmount()

    const second = renderApp('/login')
    await signIn(second.user, { email: 'nobody@example.com', password: 'whatever-1' })
    expect((await screen.findByRole('alert')).textContent).toBe(wrongPassword)
  })

  it('AC 13.4: tells an unregistered user to create an account and links to registration', async () => {
    seedUsers()
    const { user } = renderApp('/login')

    await signIn(user, { email: 'nobody@example.com', password: 'whatever-1' })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "create an account if you're new to AudEat",
    )

    await user.click(screen.getByRole('link', { name: 'create an account' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/register')
    expect(screen.getByLabelText('Email')).toHaveValue('nobody@example.com')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('AC 13.5: warns while Caps Lock is on and hides the warning when it is off', async () => {
    stubApi()
    const { user } = renderApp('/login')
    const password = screen.getByLabelText('Password')

    await user.click(password)
    await user.keyboard('{CapsLock}A')
    expect(screen.getByText('Caps Lock is on')).toBeInTheDocument()
    expect(password).toHaveAccessibleDescription('Caps Lock is on')

    await user.keyboard('{CapsLock}b')
    expect(screen.queryByText('Caps Lock is on')).not.toBeInTheDocument()
  })

  it('AC 13.5: only warns about Caps Lock on the login page', async () => {
    stubApi()
    const { user } = renderApp('/register')

    await user.click(screen.getByLabelText('Password'))
    await user.keyboard('{CapsLock}A')
    expect(screen.queryByText('Caps Lock is on')).not.toBeInTheDocument()
  })

  it.each(['/stores', '/my-store', '/', '/inspections/42'])('AC 13.3: redirects %s to login when not logged in', (path) => {
    stubApi()
    renderApp(path)

    expect(screen.getByTestId('location')).toHaveTextContent('/login')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
  })

  it('AC 13.3: lets the registration page through when not logged in', () => {
    stubApi()
    renderApp('/register')

    expect(screen.getByTestId('location')).toHaveTextContent('/register')
  })

  it.each(['/login/', '/LOGIN'])('AC 13.3: shows the login page for %s', (path) => {
    stubApi()
    renderApp(path)

    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
  })

  it.each(['/register/', '/Register'])('shows the registration page for %s', (path) => {
    stubApi()
    renderApp(path)

    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
  })

  it('AC 13.3: treats an expired login as logged out', () => {
    stubApi()
    storeSession(localStorage, INSPECTOR, jwtExpiringIn(-60))
    renderApp('/stores')

    expect(screen.getByTestId('location')).toHaveTextContent('/login')
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('AC 13.3: returns to the login page when the login expires while the app is open', async () => {
    stubApi()
    storeSession(sessionStorage, INSPECTOR, jwtExpiringIn(1))
    renderApp('/stores')
    expect(screen.getByTestId('location')).toHaveTextContent('/stores')

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'), {
      timeout: 3000,
    })
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('treats a malformed saved session as logged out', () => {
    stubApi()
    localStorage.setItem(SESSION_KEY, '{not json')
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 't', user: { role: 'admin' } }))
    renderApp('/stores')

    expect(screen.getByTestId('location')).toHaveTextContent('/login')
  })

  it('sends a logged-in user away from pages for another role', () => {
    stubApi()
    storeSession(sessionStorage, { ...OWNER, storeName: 'Harbor Noodle House' })
    renderApp('/stores')

    expect(screen.getByTestId('location')).toHaveTextContent('/my-store')
  })

  it('sends a logged-in user from the login page to their home page', () => {
    stubApi()
    storeSession(localStorage, INSPECTOR)
    renderApp('/login')

    expect(screen.getByTestId('location')).toHaveTextContent('/stores')
  })

  it('keeps the session across visits only when "Keep me signed in" is checked', async () => {
    seedUsers()
    const first = renderApp('/login')
    await signIn(first.user, INSPECTOR, { remember: true })
    await screen.findByRole('heading', { name: 'Stores' })
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).user.email).toBe(INSPECTOR.email)
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
    first.unmount()

    renderApp('/')
    expect(screen.getByTestId('location')).toHaveTextContent('/stores')
  })

  it('stores the session for this tab only by default', async () => {
    seedUsers()
    const { user } = renderApp('/login')
    await signIn(user, INSPECTOR)
    await screen.findByRole('heading', { name: 'Stores' })

    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull()
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('signs out and returns to the login page', async () => {
    stubApi()
    storeSession(localStorage, INSPECTOR)
    const { user } = renderApp('/stores')

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/login')
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('sends the session token with later API requests', async () => {
    const { fetch } = stubApi()
    storeSession(localStorage, INSPECTOR)
    const { request } = await import('../api/client.js')

    await request('/api/stores')

    expect(fetch.mock.calls.at(-1)[1].headers.Authorization).toBe('Bearer token-123')
  })

  it('shows a general error when the server cannot be reached', async () => {
    stubApi({
      override: () => {
        throw new TypeError('Failed to fetch')
      },
    })
    const { user } = renderApp('/login')

    await signIn(user, INSPECTOR)

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
  })
})

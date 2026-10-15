import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp, requestsTo, stubApi } from '../test/renderApp.jsx'

const ADA = {
  name: 'Ada Inspector',
  email: 'ada@example.com',
  password: 'correct-horse',
  role: 'inspector',
}

async function fillSignup(user, { name, email, password, confirm = password, role, storeName }) {
  if (name) await user.type(screen.getByLabelText('Full name'), name)
  if (email) await user.type(screen.getByLabelText('Email'), email)
  if (role === 'inspector') await user.click(screen.getByRole('radio', { name: /^inspector/i }))
  if (role === 'owner') await user.click(screen.getByRole('radio', { name: /^store owner/i }))
  if (storeName) {
    const option = await screen.findByRole('option', { name: new RegExp(storeName) })
    await user.selectOptions(screen.getByLabelText('Your store'), option)
  }
  if (password) await user.type(screen.getByLabelText('Password'), password)
  if (confirm) await user.type(screen.getByLabelText('Confirm password'), confirm)
}

function submit(user) {
  return user.click(screen.getByRole('button', { name: 'Create' }))
}

describe('US 12 Create an account', () => {
  it('AC 12.1: registers an inspector, confirms, and shows the login page', async () => {
    const { fetch } = stubApi()
    const { user } = renderApp('/register')

    await fillSignup(user, ADA)
    await submit(user)

    expect(await screen.findByRole('status')).toHaveTextContent('Account created. Sign in to continue.')
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Email')).toHaveValue(ADA.email)
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(requestsTo(fetch, '/api/auth/register')).toEqual([
      { name: ADA.name, email: ADA.email, password: ADA.password, role: 'inspector', storeId: null },
    ])
    expect(requestsTo(fetch, '/api/stores')).toHaveLength(0)
  })

  it('AC 12.1: registers a store owner against the store selected from the list', async () => {
    const { fetch } = stubApi()
    const { user } = renderApp('/register')

    await fillSignup(user, { ...ADA, name: 'Sam Owner', email: 'sam@example.com', role: 'owner', storeName: 'Harbor Noodle House' })
    await submit(user)

    expect(await screen.findByRole('status')).toHaveTextContent('Account created.')
    expect(requestsTo(fetch, '/api/auth/register')[0]).toMatchObject({ role: 'owner', storeId: '2' })

    // The account carries the selected role and store: signing in lands on that store.
    await user.type(screen.getByLabelText('Password'), ADA.password)
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Harbor Noodle House' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/my-store')
  })

  it('AC 12.2: rejects an email that is already registered', async () => {
    const { backend } = stubApi()
    backend.handle('POST', '/api/auth/register', { ...ADA, email: 'ADA@example.com' })
    const { user } = renderApp('/register')

    await fillSignup(user, ADA)
    await submit(user)

    const email = screen.getByLabelText('Email')
    expect(await screen.findByText('This email is already registered.')).toBeInTheDocument()
    expect(email).toHaveAccessibleDescription('This email is already registered.')
    expect(email).toHaveFocus()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/register')

    await user.type(email, 'm')
    expect(screen.queryByText('This email is already registered.')).not.toBeInTheDocument()
  })

  it('AC 12.3: shows a message next to each missing field and does not submit', async () => {
    const { fetch } = stubApi()
    const { user } = renderApp('/register')

    await submit(user)

    expect(screen.getByLabelText('Full name')).toHaveAccessibleDescription('Enter your full name.')
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter your email.')
    expect(screen.getByRole('group', { name: 'Account type' })).toHaveAccessibleDescription('Choose inspector or store owner.')
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Enter your password.')
    expect(screen.getByLabelText('Confirm password')).toHaveAccessibleDescription('Confirm your password.')
    expect(screen.getByLabelText('Full name')).toHaveFocus()
    expect(requestsTo(fetch, '/api/auth/register')).toHaveLength(0)
  })

  it('AC 12.3: rejects a badly formatted email and a password under 8 characters', async () => {
    const { fetch } = stubApi()
    const { user } = renderApp('/register')

    await fillSignup(user, { ...ADA, email: 'ada@example', password: 'seven77' })
    await submit(user)

    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter a valid email address.')
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Use at least 8 characters.')
    expect(requestsTo(fetch, '/api/auth/register')).toHaveLength(0)
  })

  it('AC 12.3: requires a store owner to select a store', async () => {
    const { fetch } = stubApi()
    const { user } = renderApp('/register')

    await fillSignup(user, { ...ADA, role: 'owner' })
    await screen.findByRole('option', { name: /Blue Plate Diner/ })
    await submit(user)

    expect(screen.getByLabelText('Your store')).toHaveAccessibleDescription('Choose your store.')
    expect(screen.getByLabelText('Your store')).toHaveFocus()
    expect(requestsTo(fetch, '/api/auth/register')).toHaveLength(0)
  })

  it('AC 12.3: shows field errors returned by the server next to the field', async () => {
    stubApi({
      override: (method, path) =>
        path === '/api/auth/register' ? Response.json({ errors: { name: 'Name is too long.' } }, { status: 400 }) : null,
    })
    const { user } = renderApp('/register')

    await fillSignup(user, ADA)
    await submit(user)

    expect(await screen.findByText('Name is too long.')).toBeInTheDocument()
    expect(screen.getByLabelText('Full name')).toHaveAccessibleDescription('Name is too long.')
  })

  it('offers a retry when the store list fails to load', async () => {
    let failures = 1
    stubApi({
      override: (method, path) =>
        path === '/api/stores' && failures-- > 0 ? new Response('', { status: 503 }) : null,
    })
    const { user } = renderApp('/register')

    await user.click(screen.getByRole('radio', { name: /^store owner/i }))
    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('option', { name: /Corner Bakery Co\./ })).toBeInTheDocument()
  })

  it('shows a general error when the server fails, keeping the form filled in', async () => {
    stubApi({
      override: (method, path) => (path === '/api/auth/register' ? new Response('', { status: 500 }) : null),
    })
    const { user } = renderApp('/register')

    await fillSignup(user, ADA)
    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
    expect(screen.getByLabelText('Full name')).toHaveValue(ADA.name)
    expect(screen.getByTestId('location')).toHaveTextContent('/register')
  })

  it('disables the button while the account is being created', async () => {
    let finish
    stubApi({
      override: (method, path) =>
        path === '/api/auth/register' ? new Promise((resolve) => { finish = resolve }) : null,
    })
    const { user } = renderApp('/register')

    await fillSignup(user, ADA)
    await submit(user)

    const button = screen.getByRole('button', { name: 'Creating account…' })
    expect(button).toBeDisabled()
    finish(Response.json({}, { status: 201 }))
    expect(await screen.findByRole('status')).toBeInTheDocument()
  })

  it('keeps the email but clears passwords when switching to sign in', async () => {
    stubApi()
    const { user } = renderApp('/register')

    await fillSignup(user, { email: ADA.email, password: ADA.password })
    await submit(user)
    await user.click(within(screen.getByRole('group', { name: 'Account' })).getByRole('button', { name: 'Sign in' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/login')
    expect(screen.getByLabelText('Email')).toHaveValue(ADA.email)
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.queryByText('Enter your full name.')).not.toBeInTheDocument()
  })
})

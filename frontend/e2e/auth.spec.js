import { expect, test } from '@playwright/test'

// The dev server's mock API keeps accounts for its lifetime, so each test uses a fresh email.
function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
}

async function register(page, { name, email, password, role, store }) {
  await page.goto('/register')
  await page.getByLabel('Full name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByRole('radio', { name: role === 'owner' ? /^Store owner/ : /^Inspector/ }).check()
  if (store) await page.getByLabel('Your store', { exact: true }).selectOption({ label: store })
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
}

async function signIn(page, { email, password }) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Continue' }).click()
}

test('AC 12.1 + 13.1: a store owner registers, logs in, and lands on their store', async ({ page }) => {
  const owner = { name: 'Sam Owner', email: uniqueEmail('owner'), password: 'tasty-noodles', role: 'owner' }

  await register(page, { ...owner, store: 'Harbor Noodle House · 88 Wharf Ave' })
  await expect(page.getByRole('status')).toHaveText('Account created. Sign in to continue.')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByLabel('Email')).toHaveValue(owner.email)

  await signIn(page, owner)
  await expect(page).toHaveURL(/\/my-store$/)
  await expect(page.getByRole('heading', { name: 'Harbor Noodle House' })).toBeVisible()
  await expect(page).toHaveTitle('Harbor Noodle House')
})

test('AC 12.1 + 13.1: an inspector registers, logs in, and lands on the store list', async ({ page }) => {
  const inspector = { name: 'Ada Inspector', email: uniqueEmail('inspector'), password: 'correct-horse', role: 'inspector' }

  await register(page, inspector)
  await expect(page.getByRole('status')).toBeVisible()
  await signIn(page, inspector)

  await expect(page).toHaveURL(/\/stores$/)
  await expect(page.getByRole('heading', { name: 'Stores' })).toBeVisible()
  const stores = page.getByRole('list', { name: 'Stores' })
  await expect(stores.getByRole('listitem')).toHaveCount(3)
  await expect(stores).toContainText('Harbor Noodle House')
})

test('AC 12.2: a duplicate email is rejected next to the email field', async ({ page }) => {
  const inspector = { name: 'Ada Inspector', email: uniqueEmail('dupe'), password: 'correct-horse', role: 'inspector' }

  await register(page, inspector)
  await expect(page.getByRole('status')).toBeVisible()
  await register(page, { ...inspector, email: inspector.email.toUpperCase() })

  await expect(page.getByLabel('Email')).toHaveAccessibleDescription('This email is already registered.')
  await expect(page.getByLabel('Email')).toBeFocused()
  await expect(page).toHaveURL(/\/register$/)
})

test('AC 12.3: invalid fields are flagged without creating the account', async ({ page }) => {
  const requests = []
  page.on('request', (request) => {
    if (request.url().includes('/api/auth/register')) requests.push(request)
  })

  await page.goto('/register')
  await page.getByLabel('Email').fill('not-an-email')
  await page.getByLabel('Password', { exact: true }).fill('short')
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  await expect(page.getByLabel('Full name')).toHaveAccessibleDescription('Enter your full name.')
  await expect(page.getByLabel('Email')).toHaveAccessibleDescription('Enter a valid email address.')
  await expect(page.getByText('Choose inspector or store owner.')).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAccessibleDescription('Use at least 8 characters.')
  expect(requests).toHaveLength(0)
})

test('AC 13.2 + 13.4: wrong credentials show one generic message with a sign-up link', async ({ page }) => {
  const inspector = { name: 'Ada Inspector', email: uniqueEmail('creds'), password: 'correct-horse', role: 'inspector' }
  await register(page, inspector)
  await expect(page.getByRole('status')).toBeVisible()

  await signIn(page, { email: inspector.email, password: 'wrong-password' })
  const wrongPassword = await page.getByRole('alert').textContent()
  expect(wrongPassword).toContain('Invalid email or password.')
  expect(wrongPassword).toContain("Check your password and try again, or create an account if you're new to AudEat.")

  // AC 13.2: email kept, password cleared, cursor back in the password field.
  await expect(page.getByLabel('Email')).toHaveValue(inspector.email)
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused()

  const nobody = uniqueEmail('nobody')
  await signIn(page, { email: nobody, password: 'whatever-1' })
  await expect(page.getByRole('alert')).toHaveText(wrongPassword)
  await expect(page).toHaveURL(/\/login$/)

  await page.getByRole('link', { name: 'create an account' }).click()
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.getByLabel('Email')).toHaveValue(nobody)
})

test('AC 13.5: the login page warns while Caps Lock is on', async ({ page }) => {
  // Playwright cannot toggle the OS Caps Lock state, so send key events that report it,
  // as a real browser does while Caps Lock is on.
  const pressWithCapsLock = (key, capsLock) =>
    password.evaluate(
      (input, [k, on]) => {
        for (const type of ['keydown', 'keyup']) {
          input.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, modifierCapsLock: on }))
        }
      },
      [key, capsLock],
    )

  await page.goto('/login')
  const password = page.getByLabel('Password', { exact: true })
  await password.click()

  await pressWithCapsLock('A', true)
  await expect(page.getByText('Caps Lock is on')).toBeVisible()
  await expect(password).toHaveAccessibleDescription('Caps Lock is on')

  await pressWithCapsLock('b', false)
  await expect(page.getByText('Caps Lock is on')).toBeHidden()
})

test('AC 13.3: protected pages redirect to login when not logged in', async ({ page }) => {
  for (const path of ['/stores', '/my-store', '/', '/inspections/42']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
  }
})

test('AC 13.3: an expired login redirects to the login page', async ({ page }) => {
  await page.addInitScript(() => {
    const encode = (value) => btoa(JSON.stringify(value)).replace(/=+$/, '')
    const exp = Math.floor(Date.now() / 1000) - 60
    const token = `${encode({ alg: 'HS256' })}.${encode({ sub: '1', exp })}.signature`
    const user = { id: 1, name: 'Ada', email: 'ada@example.com', role: 'inspector' }
    localStorage.setItem('audeat.session', JSON.stringify({ token, user }))
  })

  await page.goto('/stores')
  await expect(page).toHaveURL(/\/login$/)
})

test('signing out ends the session', async ({ page }) => {
  const inspector = { name: 'Ada Inspector', email: uniqueEmail('signout'), password: 'correct-horse', role: 'inspector' }
  await register(page, inspector)
  await expect(page.getByRole('status')).toBeVisible()
  await signIn(page, inspector)
  await expect(page).toHaveURL(/\/stores$/)

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/stores')
  await expect(page).toHaveURL(/\/login$/)
})

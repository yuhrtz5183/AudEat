import { expect, test } from '@playwright/test'

// Read-only on the seeded demo data (DESIGN §5), so it passes on the mock and on the dev-profile backend.
const BLUE_PLATE_OWNER = { email: 'owner.blueplate@audeat.test', password: 'audeat-demo' }

async function signIn(page, { email, password }) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/my-store$/)
}

test('AC 15.1: a store owner sees their store, its open tickets and links', async ({ page }) => {
  await signIn(page, BLUE_PLATE_OWNER)

  await expect(page.getByRole('heading', { name: 'Blue Plate Diner' })).toBeVisible()
  await expect(page.getByText('412 Main St')).toBeVisible()
  await expect(page.getByText('5 open remediation tickets')).toBeVisible()
  await expect(page.getByText('1 ticket needs further action')).toBeVisible()

  await page.getByRole('link', { name: 'My remediation tickets' }).click()
  await expect(page).toHaveURL(/\/my-store\/tickets$/)
  await expect(page.getByRole('heading', { name: 'Remediation tickets' })).toBeVisible()

  await page.goBack()
  await page.getByRole('link', { name: 'Inspection history' }).click()
  await expect(page).toHaveURL(/\/my-store\/inspections$/)
  await expect(page.getByRole('heading', { name: 'Inspection history' })).toBeVisible()
})

test('AC 15.2: a store owner opening the store list is returned to their store', async ({ page }) => {
  await signIn(page, BLUE_PLATE_OWNER)
  const storeListRequests = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/stores') storeListRequests.push(request)
  })

  await page.goto('/stores')

  await expect(page).toHaveURL(/\/my-store$/)
  await expect(page.getByRole('alert')).toHaveText('You are not authorized to view this page.')
  await expect(page.getByRole('heading', { name: 'Blue Plate Diner' })).toBeVisible()
  await expect(page.getByText('5 open remediation tickets')).toBeVisible()
  await expect(page.getByText('Corner Bakery Co.')).toBeHidden()
  await expect(page.getByText('Harbor Noodle House')).toBeHidden()
  expect(storeListRequests).toHaveLength(0)
})

test('AC 15.2: the not-authorized message does not come back on Back or reload', async ({ page }) => {
  await signIn(page, BLUE_PLATE_OWNER)
  await page.goto('/stores')
  await expect(page.getByRole('alert')).toBeVisible()

  await page.getByRole('link', { name: 'My remediation tickets' }).click()
  await expect(page.getByRole('heading', { name: 'Remediation tickets' })).toBeVisible()
  await page.goBack()
  await expect(page.getByText('5 open remediation tickets')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)

  await page.reload()
  await expect(page.getByText('5 open remediation tickets')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

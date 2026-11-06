import { expect, test } from '@playwright/test'

// Read-only on the seeded demo data (DESIGN §5), so it passes on the mock and on the dev-profile
// backend. Inspection dates are relative to today, so the spec checks order and violation counts,
// never dates.
const BLUE_PLATE_OWNER = { email: 'owner.blueplate@audeat.test', password: 'audeat-demo' }
const NOT_AUTHORIZED = 'You are not authorized to view this page.'

async function signIn(page, { email, password }) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/my-store$/)
}

test("AC 9.1: a store owner sees their store's inspections, newest first, with dates and violations", async ({ page }) => {
  await signIn(page, BLUE_PLATE_OWNER)
  await page.getByRole('link', { name: 'Inspection history' }).click()
  await expect(page).toHaveURL(/\/my-store\/inspections$/)

  const list = page.getByRole('list', { name: 'Inspections' })
  const items = list.getByRole('listitem')
  // Blue Plate's three completed inspections; the scheduled follow-up (a draft) is not listed.
  await expect(items).toHaveCount(3)
  await expect(items.locator('dd').filter({ hasText: /violation/ })).toHaveText([
    '6 violations',
    'No violations',
    '1 violation',
  ])
  await expect(page.getByText('Follow-up inspection')).toHaveCount(0)
  await expect(page.getByText('No inspections recorded for this store')).toHaveCount(0)
  // Each date is shown as text, e.g. "Oct 27, 2026" (the value depends on today, so only its form).
  await expect(items.locator('time')).toHaveText(Array(3).fill(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/))

  // Newest first: each date is later than the one after it.
  const dates = await items.locator('time').evaluateAll((times) =>
    times.map((time) => time.getAttribute('datetime')),
  )
  expect(dates).toHaveLength(3)
  expect([...dates].sort().reverse()).toEqual(dates)
  for (const date of dates) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

test("AC 9.2: an owner opening another store's history is denied and sees none of its data", async ({ page }) => {
  await signIn(page, BLUE_PLATE_OWNER)
  // The plain store list is public (registration needs it), so the spec can find Store B's id.
  // Against Spring Boot the API is on its own origin; on the mock the dev server answers.
  const api = process.env.E2E_API_URL ?? ''
  const stores = await (await page.request.get(`${api}/api/stores`)).json()
  const corner = stores.find((store) => store.name === 'Corner Bakery Co.')
  expect(corner).toBeTruthy()

  const historyRequests = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/stores/')) historyRequests.push(request)
  })

  await page.goto(`/stores/${corner.id}/inspections`)

  await expect(page).toHaveURL(/\/my-store$/)
  await expect(page.getByRole('alert')).toHaveText(NOT_AUTHORIZED)
  await expect(page.getByRole('heading', { name: 'Blue Plate Diner' })).toBeVisible()
  await expect(page.getByText('Corner Bakery Co.')).toHaveCount(0)
  await expect(page.getByText('1500 Grand Blvd')).toHaveCount(0)
  expect(historyRequests).toHaveLength(0)
})

import { expect, test } from '@playwright/test'

// Read-only on the seeded demo data (DESIGN §5, §6): sending evidence (AC 5.1) changes the
// ticket, so it is proven in vitest and the backend tests. AC 5.2 is refused before any request.
const BLUE_PLATE_OWNER = { email: 'owner.blueplate@audeat.test', password: 'audeat-demo' }

const PAPER_TOWELS = 'Handwashing sinks are accessible and stocked with soap and paper towels.'
const CUTTING_BOARDS = 'Food-contact surfaces and utensils are clean and sanitized.'

async function openMyTicket(page, requirement) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(BLUE_PLATE_OWNER.email)
  await page.getByLabel('Password', { exact: true }).fill(BLUE_PLATE_OWNER.password)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/my-store$/)
  await page.getByRole('link', { name: 'My remediation tickets' }).click()
  await page.getByRole('link', { name: requirement }).click()
  await expect(page).toHaveURL(/\/my-store\/tickets\/\d+$/)
  await expect(page.getByRole('region', { name: 'Flagged issue' }).getByText(requirement)).toBeVisible()
}

const remediation = (page) => page.getByRole('region', { name: 'Remediation' })

test('AC 5.2: without evidence the remediation is not sent and "Evidence is required." is shown', async ({ page }) => {
  const submissions = []
  page.on('request', (request) => {
    if (request.url().includes('/submissions')) submissions.push(`${request.method()} ${request.url()}`)
  })
  await openMyTicket(page, PAPER_TOWELS)
  await expect(remediation(page).getByText('Open', { exact: true })).toBeVisible()

  const form = page.getByRole('region', { name: 'Send evidence of the fix' })
  await form.getByLabel('How did you fix the issue?').fill('Restocked the sink with soap and paper towels.')
  await form.getByRole('button', { name: 'Send evidence' }).click()

  const files = form.getByLabel('Photos of the fix')
  await expect(form.getByText('Evidence is required.')).toBeVisible()
  await expect(files).toHaveAttribute('aria-invalid', 'true')
  await expect(files).toHaveAccessibleDescription('Evidence is required.')
  await expect(files).toBeFocused()
  expect(submissions).toEqual([])

  await page.reload()
  await expect(remediation(page).getByText('Open', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Send evidence of the fix' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Your evidence' })).toHaveCount(0)
  expect(submissions).toEqual([])
})

test('AC 5.1: the evidence form is offered on an open ticket and not on one awaiting review', async ({ page }) => {
  await openMyTicket(page, PAPER_TOWELS)
  const form = page.getByRole('region', { name: 'Send evidence of the fix' })
  await expect(form.getByLabel('How did you fix the issue?')).toBeVisible()
  await expect(form.getByLabel('Photos of the fix')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
  await expect(form.getByRole('button', { name: 'Send evidence' })).toBeEnabled()

  await page.getByRole('link', { name: 'Back to my tickets' }).click()
  await page.getByRole('link', { name: CUTTING_BOARDS }).click()
  await expect(remediation(page).getByText('Awaiting review')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Your evidence' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Send evidence of the fix' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Send evidence' })).toHaveCount(0)
})

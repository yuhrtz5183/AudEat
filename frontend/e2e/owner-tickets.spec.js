import { expect, test } from '@playwright/test'

// Read-only on the seeded demo data (DESIGN §5), so it passes on the mock and on the dev-profile
// backend. Deadlines are relative to today, so the spec checks day counts, never dates.
const BLUE_PLATE_OWNER = { email: 'owner.blueplate@audeat.test', password: 'audeat-demo' }

const COOLER = 'Cold food is held at 41°F (5°C) or below and hot food at 135°F (57°C) or above.'
const PAPER_TOWELS = 'Handwashing sinks are accessible and stocked with soap and paper towels.'
const LABELS = 'Stored food is labeled and within its use-by date.'
const CUTTING_BOARDS = 'Food-contact surfaces and utensils are clean and sanitized.'
const RAW_MEAT = 'Raw meat is stored below and apart from ready-to-eat food.'
const PESTS = 'There is no sign of pests.'

async function openMyTickets(page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(BLUE_PLATE_OWNER.email)
  await page.getByLabel('Password', { exact: true }).fill(BLUE_PLATE_OWNER.password)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/my-store$/)
  await page.getByRole('link', { name: 'My remediation tickets' }).click()
  await expect(page.getByRole('heading', { name: 'Remediation tickets' })).toBeVisible()
}

function ticket(page, requirement) {
  return page.getByRole('listitem').filter({ has: page.getByRole('link', { name: requirement }) })
}

test('AC 4.1 + 10.1 + 10.2: an owner sees their tickets, overdue and nearest deadline first', async ({ page }) => {
  await openMyTickets(page)

  const items = page.getByRole('listitem')
  await expect(items).toHaveCount(6)
  await expect(items.getByRole('link')).toHaveText([
    COOLER,
    PAPER_TOWELS,
    LABELS,
    CUTTING_BOARDS,
    RAW_MEAT,
    PESTS,
  ])

  const cooler = items.first()
  await expect(cooler.getByText('Overdue', { exact: true })).toBeVisible()
  await expect(cooler.getByText('Open', { exact: true })).toBeVisible()
  await expect(cooler.getByText('2 days overdue')).toBeVisible()
  await expect(cooler.getByText('Walk-in cooler read 48°F.')).toBeVisible()
  await expect(cooler.getByText('Repair the cooler and log temperatures twice daily.')).toBeVisible()
  await expect(cooler.locator('time')).toHaveCount(1)

  const paperTowels = ticket(page, PAPER_TOWELS)
  await expect(paperTowels.getByText('Due today')).toBeVisible()
  await expect(paperTowels.getByText('Open', { exact: true })).toBeVisible()
  await expect(paperTowels.getByText('Overdue', { exact: true })).toHaveCount(0)

  await expect(ticket(page, LABELS).getByText('Rejected', { exact: true })).toBeVisible()
  await expect(ticket(page, LABELS).getByText('3 days left')).toBeVisible()
  await expect(ticket(page, CUTTING_BOARDS).getByText('Awaiting review')).toBeVisible()
  await expect(ticket(page, CUTTING_BOARDS).getByText('5 days left')).toBeVisible()
  await expect(ticket(page, RAW_MEAT).getByText('Follow-up scheduled')).toBeVisible()
  await expect(ticket(page, RAW_MEAT).getByText('7 days left')).toBeVisible()

  const pests = items.last()
  await expect(pests.getByText('Approved', { exact: true })).toBeVisible()
  await expect(pests.getByText('Overdue', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Overdue', { exact: true })).toHaveCount(1)
})

test("AC 4.2: an owner opens a ticket and sees the issue, the inspector's comment, its photo and status", async ({ page }) => {
  await openMyTickets(page)

  await page.getByRole('link', { name: COOLER }).click()
  await expect(page).toHaveURL(/\/my-store\/tickets\/\d+$/)

  const issue = page.getByRole('region', { name: 'Flagged issue' })
  await expect(issue.getByText(COOLER)).toBeVisible()
  await expect(issue.getByText('Walk-in cooler read 48°F.')).toBeVisible()
  const photo = issue.getByRole('img', { name: 'Issue photo 1' })
  await expect(photo).toBeVisible()
  await expect(photo).toHaveAttribute('src', /^blob:/)

  const remediation = page.getByRole('region', { name: 'Remediation' })
  await expect(remediation.getByText('Overdue', { exact: true })).toBeVisible()
  await expect(remediation.getByText('Open', { exact: true })).toBeVisible()
  await expect(remediation.getByText('2 days overdue')).toBeVisible()
  await expect(remediation.getByText('Repair the cooler and log temperatures twice daily.')).toBeVisible()
})

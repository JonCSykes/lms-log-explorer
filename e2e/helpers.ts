import { type Page, expect } from '@playwright/test'

export async function waitForSessionScreen(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByTestId('sessions-sidebar')).toBeVisible()
  await expect(page.getByTestId('session-overview-card')).toBeVisible({
    timeout: 90000,
  })
}

export async function expandFirstSessionDay(page: Page): Promise<void> {
  const dayToggles = page.getByTestId('sessions-day-toggle')
  const dayCount = await dayToggles.count()

  if (dayCount > 0) {
    await dayToggles.first().click()
  }
}

export async function openFirstRequestDrawer(page: Page): Promise<void> {
  await page.getByLabel('Toggle Requests').click()
  const requestRows = page.getByTestId('request-row')
  await expect(requestRows.first()).toBeVisible()
  await requestRows.first().click()
  await expect(page.getByTestId('request-drawer')).toHaveClass(/translate-x-0/)
}

import { expect, test } from '@playwright/test'

import { waitForSessionScreen } from './helpers'

test('expands prompt audit and switches tabs', async ({ page }) => {
  await waitForSessionScreen(page)

  await page.getByLabel('Toggle Prompt Audit').click()

  await expect(page.getByRole('tab', { name: 'Messages' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'System' })).toBeVisible()

  await page.getByRole('tab', { name: 'System' }).click()
  await expect(
    page.getByText(/No system messages found\.|System Message/i)
  ).toBeVisible()
})

import { expect, test } from '@playwright/test'

import { waitForSessionScreen } from './helpers'

test('loads the session-first dashboard', async ({ page }) => {
  await waitForSessionScreen(page)

  await expect(page.getByTestId('stats-card')).toBeVisible()
  await expect(page.getByTestId('prompt-audit-card')).toBeVisible()
  await expect(page.getByTestId('requests-card')).toBeVisible()
  await expect(page.getByText('Session Overview')).toBeVisible()
})

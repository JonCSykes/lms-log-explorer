import { expect, test } from '@playwright/test'

import { openFirstRequestDrawer, waitForSessionScreen } from './helpers'

test('opens and closes request drawer', async ({ page }) => {
  await waitForSessionScreen(page)
  await openFirstRequestDrawer(page)

  await expect(page.getByTestId('request-data-card')).toBeVisible()
  await expect(page.getByTestId('request-timeline-card')).toBeVisible()

  await page.getByLabel('Close request details').first().click()
  await expect(page.getByTestId('request-drawer')).toHaveClass(
    /translate-x-full/
  )
})

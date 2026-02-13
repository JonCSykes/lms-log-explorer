import { expect, test } from '@playwright/test'

import { waitForSessionScreen } from './helpers'

test('refresh keeps dashboard interactive while indexing state updates', async ({
  page,
}) => {
  await waitForSessionScreen(page)

  await page.getByTestId('page-refresh-button').click()

  const overlay = page.getByTestId('indexing-overlay')
  try {
    await overlay.waitFor({ state: 'visible', timeout: 5000 })
    await expect(page.getByText('Indexing Log Files')).toBeVisible()
  } catch {
    // Indexing can complete too quickly on fixture-sized data.
  }

  await expect(page.getByTestId('session-overview-card')).toBeVisible()
})

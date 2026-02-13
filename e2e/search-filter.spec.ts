import { expect, test } from '@playwright/test'

import { waitForSessionScreen } from './helpers'

test('filters session groups from sidebar search', async ({ page }) => {
  await waitForSessionScreen(page)

  const searchInput = page.getByTestId('sessions-search-input')

  await searchInput.fill('zzzz-no-match-zzzz')
  await expect(page.getByText('No sessions found')).toBeVisible()

  await searchInput.fill('')
  await expect(page.getByText('No sessions found')).not.toBeVisible()
})

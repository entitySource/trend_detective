// Failure paths: missing data shows a friendly screen with Retry instead of a blank page or a raw error.
import { expect, test } from '@playwright/test'

test('globe shows a friendly retry screen when the data is missing', async ({ page }) => {
  await page.route('**/data/manifest.json', (route) => route.fulfill({ status: 404, body: 'Not found' }))
  await page.goto('./#/?v=t2m')
  await expect(page.getByRole('alert')).toContainText('We could not load the satellite data')
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await page.getByText('Technical details').click()
  await expect(page.getByText('manifest.json: HTTP 404')).toBeVisible()
})

test('a broken clue file is named, not shown as a JSON parse error', async ({ page }) => {
  await page.route('**/data/regions/t2m.json', (route) => route.fulfill({ status: 200, body: '<html>oops</html>' }))
  await page.goto('./#/?v=t2m')
  await page.getByText('Technical details').click()
  await expect(page.getByText('regions/t2m.json: not valid JSON')).toBeVisible()
})

test('the globe still works when the checks file is missing', async ({ page }) => {
  await page.route('**/data/validation.json', (route) => route.fulfill({ status: 404, body: 'Not found' }))
  await page.goto('./#/?v=t2m')
  await expect(page.getByRole('heading', { name: 'CHOOSE A CLUE' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

// The main student journeys, end to end in a real browser. Works on the real export and on the mock dataset.
import { expect, test } from '@playwright/test'

test.describe('globe', () => {
  test('loads with clues, places and the checks summary', async ({ page }) => {
    await page.goto('./#/?v=t2m')
    await expect(page.getByRole('heading', { name: 'CHOOSE A CLUE' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Air temperature' })).toBeVisible()
    await expect(page.getByText(/OF \d+ CHECKS PASSED/)).toBeVisible()
  })

  test('open a place, test it, get a verdict', async ({ page }) => {
    await page.goto('./#/?v=t2m')
    await page.getByRole('button', { name: /^Arctic/ }).first().click()
    await expect(page).toHaveURL(/s=arc/)
    await expect(page.getByText(/THE EVIDENCE: AIR TEMPERATURE/)).toBeVisible()
    await page.getByRole('button', { name: /^TEST IT/ }).click()
    await expect(page.getByText(/Case (closed|not proven)/)).toBeVisible()
    await expect(page.getByText(/NOT LUCK \(1 − P\)/i)).toBeVisible()
  })

  test('case file downloads a described CSV of the series', async ({ page }) => {
    await page.goto('./#/?v=t2m&s=arc')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /CSV/ }).click()])
    expect(download.suggestedFilename()).toBe('trend-detective_t2m_arc.csv')
    const text = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString('utf8'))
    expect(text.split('\n')[0]).toMatch(/^# Trend Detective: .+ at Arctic$/)
    expect(text).toContain('\nyear,anomaly\n2003,')
  })

  test('time machine re-tests on fewer years', async ({ page }) => {
    await page.goto('./#/?v=t2m&s=arc')
    const slider = page.getByRole('slider', { name: 'Use data up to this year' })
    await slider.focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(page).toHaveURL(/y=\d{4}/)
    await expect(page.getByRole('button', { name: /reset to \d{4}/ })).toBeVisible()
  })

  test('help popups open fully inside the window', async ({ page }) => {
    await page.goto('./#/?v=t2m&s=arc')
    const help = page.getByRole('button', { name: 'What does this mean?' }).first()
    await help.click()
    const tip = page.getByRole('tooltip')
    await expect(tip).toBeVisible()
    const box = (await tip.boundingBox())!
    const view = page.viewportSize()!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(view.width)
    expect(box.y + box.height).toBeLessThanOrEqual(view.height)
    await page.keyboard.press('Escape')
    await expect(tip).toBeHidden()
  })
})

test.describe('other pages', () => {
  test('trend map shows the map and folding controls', async ({ page }) => {
    await page.goto('./#/map')
    await expect(page.getByRole('application', { name: /Map of .* trend/ })).toBeVisible()
    await page.getByRole('button', { name: 'Fold the map controls away' }).click()
    await page.getByRole('button', { name: 'Show the map controls' }).click()
    await expect(page.getByText('WHAT THE COLOURS SHOW')).toBeVisible()
  })

  test('validation page lists every check with a status', async ({ page }) => {
    await page.goto('./#/checks')
    await expect(page.getByText(/OF \d+ CHECKS PASS/)).toBeVisible()
    expect(await page.locator('li h3').count()).toBeGreaterThan(1)
  })

  test('methods page loads', async ({ page }) => {
    await page.goto('./#/methods')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})

test('phone width has no sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const route of ['./#/?v=t2m', './#/map', './#/checks']) {
    await page.goto(route)
    await page.waitForLoadState('networkidle')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, route).toBeLessThanOrEqual(1)
  }
})

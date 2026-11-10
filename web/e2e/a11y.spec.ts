// Accessibility gate: no WCAG 2.1 A/AA violations (axe-core, the engine behind Lighthouse's accessibility score)
// on any page, including an open case file.
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const ROUTES = [
  { name: 'globe', path: './#/?v=t2m', ready: 'CHOOSE A CLUE' },
  { name: 'case file', path: './#/?v=t2m&s=arc', ready: 'THE EVIDENCE' },
  { name: 'trend map', path: './#/map', ready: 'WHAT THE COLOURS SHOW' },
  { name: 'validation', path: './#/checks', ready: 'CHECKS PASS' },
  { name: 'methods', path: './#/methods', ready: 'How it works' },
]

for (const r of ROUTES) {
  test(`${r.name} has no WCAG 2.1 AA violations`, async ({ page }) => {
    await page.goto(r.path)
    await expect(page.getByText(r.ready).first()).toBeVisible()
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  })
}

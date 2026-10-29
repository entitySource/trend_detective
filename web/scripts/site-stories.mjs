// Writes docs/site-stories.md from src/command/content.ts so the document and the app never drift apart.
import { writeFileSync } from 'node:fs'
const { SITES } = await import('../src/command/content.ts')
const lines = [
  '# Site case files',
  '',
  'Student-friendly case files for every investigation site, as shown in the app’s case-file panel.',
  'Generated from `web/src/command/content.ts` by `node --experimental-strip-types web/scripts/site-stories.mjs`; edit that file, not this one.',
  'Facts are context from the cited sources, rounded on purpose; the trend verdicts in the app come from our own analysis.',
  '',
]
for (const s of SITES) {
  const t = s.story
  lines.push(`## **${t.headline}**`, '', `*${s.name} · ${s.biome} · box ${s.bbox.join(', ')} (W, S, E, N)*`, '', `**Takeaway:** ${t.takeaway}`, '', '**Key facts**', '')
  for (const f of t.facts) lines.push(`- ${f}`)
  lines.push('', `**Why should you care?** ${t.why}`, '', `**Visual idea:** ${t.visual}`, '')
}
writeFileSync(new URL('../../docs/site-stories.md', import.meta.url), lines.join('\n'))
console.log(`wrote ${SITES.length} case files`)

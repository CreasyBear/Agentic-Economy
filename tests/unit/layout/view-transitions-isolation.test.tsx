import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const globalsCssPath = fileURLToPath(new URL('../../../src/styles/globals.css', import.meta.url))
const GLOBALS_CSS = readFileSync(globalsCssPath, 'utf8')

function normalizeCssChunk(chunk: string): string {
  return chunk.replace(/\s+/g, ' ').trim()
}

describe('Route view transition isolation (S-20)', () => {
  it('assigns ae-app-header to the persistent app header and freezes its transition group', () => {
    expect(GLOBALS_CSS).toMatch(
      /\[data-shell="app-header"\]\s*\{\s*view-transition-name:\s*ae-app-header;\s*\}/,
    )
    expect(GLOBALS_CSS).toMatch(
      /::view-transition-group\(ae-app-header\)\s*\{\s*animation:\s*none;\s*\}/,
    )
  })


  it('bounds the root transition group and content fades when motion is allowed', () => {
    const noPreferenceBlock = GLOBALS_CSS.match(
      /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{([\s\S]*?)\n\}/,
    )?.[1]
    expect(noPreferenceBlock).toBeTruthy()
    const block = normalizeCssChunk(noPreferenceBlock ?? '')
    expect(block).toContain(
      '::view-transition-group(root), ::view-transition-old(root), ::view-transition-new(root) { animation-duration: 80ms; animation-timing-function: var(--motion-ease-standard); }',
    )
  })

  it('disables all view-transition animations under prefers-reduced-motion: reduce', () => {
    expect(GLOBALS_CSS).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*::view-transition-group\(\*\)[\s\S]*::view-transition-old\(\*\)[\s\S]*::view-transition-new\(\*\)[\s\S]*animation:\s*none\s*!important;[\s\S]*\}/,
    )
  })
})

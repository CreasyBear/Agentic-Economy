import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const neutralSources = [
  'src/modules/capability-supply/public.ts',
  'src/modules/capability-supply/internal/convex-schema.ts',
  'convex/capabilitySupply.ts',
] as const

describe('capability supply boundaries', () => {
  it('does not import or fall back to V1 Request, catalog or routing binding authorities', () => {
    for (const source of sources()) {
      const legacyAuthorityImport = /from\s+['"][^'"]*(?:customer-request|catalog|routing-kernel|routingKernelBindings)[^'"]*['"]/
      expect(source).not.toMatch(legacyAuthorityImport)
    }
  })

  it('does not inspect adapter configuration keys in neutral registration or eligibility code', () => {
    const keyInspection = /(?:Object\.(?:keys|entries)|Reflect\.get)\([^)]*config|JSON\.parse\([^)]*config|\.config\s*(?:\[|\.)/
    for (const source of sources()) expect(source).not.toMatch(keyInspection)
  })

  it('does not admit operation or vertical business vocabulary into the V2 supply shape', () => {
    for (const source of sources()) {
      expect(source).not.toMatch(/\boperation\s*:/)
      expect(source).not.toMatch(/\b(?:shipping|booking|restaurant|accommodation|purchase)\b/i)
    }
  })
})

function sources(): string[] {
  return neutralSources.map((path) => readFileSync(path, 'utf8'))
}

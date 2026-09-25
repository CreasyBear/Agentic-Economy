import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const moduleRoot = 'src/modules/capability-supply/internal'

describe('capability-supply writer boundaries', () => {
  it('keeps pure writer modules free of Convex runtime and database access', () => {
    for (const folder of ['offering', 'binding', 'eligibility']) {
      const source = readFileSync(`${moduleRoot}/${folder}/write.ts`, 'utf8')
      expect(source).not.toMatch(/from\s+['"][^'"]*(?:_generated|convex\/server)['"]|\bMutationCtx\b|\bQueryCtx\b|\bDoc\s*<|\bdb\.(?:insert|patch|query)\b/)
      expect(source).not.toMatch(/\bbeginOperation\b|\bensureSupplyAudit\b|registerCapabilityOfferingCommand/)
    }
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../helpers/source-files'

const moduleRoot = 'src/modules/capability-supply/internal/publication'

describe('capability-supply publication boundaries', () => {
  it('keeps publication domain code free of Convex runtime', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from\s+['"][^'"]*(?:_generated|convex\/server)['"]|\bMutationCtx\b|\bQueryCtx\b|\bDoc\s*</)
      expect(source).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+(?:beginOperation|ensureSupplyAudit|succeedOperation)\b/)
    }
  })

  it('keeps withdrawn publications behind their lifecycle command', () => {
    const source = readFileSync(`${moduleRoot}/withdraw.ts`, 'utf8')
    expect(source).toContain('withdrawCapabilityCommand')
    expect(source).toContain('patchPublicationWithdrawn')
    expect(source).not.toMatch(/desiredEligibility|eligibilityPublicResult/)
  })
})

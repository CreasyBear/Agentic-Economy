import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../helpers/source-files'

describe('eligible supply boundaries', () => {
  it('keeps eligibility inventory independent of Convex runtime', () => {
    for (const file of ['ports.ts', 'list.ts', 'exact.ts']) {
      const source = readFileSync(`src/modules/capability-supply/internal/eligibility/${file}`, 'utf8')
      expect(source).not.toMatch(/from\s+['"][^'"]*(?:_generated|convex\/server)['"]|\bMutationCtx\b|\bQueryCtx\b|\bDoc\s*</)
    }
  })

  it('keeps eligible inventory separate from the operation ledger', () => {
    for (const file of listTsFiles('src/modules/capability-supply/internal/tool-ledger')) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/listIntegratedCapabilitySupply|listRouteableCapabilitySupply|getEligibleExactCapabilitySupply|EligibleSupplyPorts/)
    }
  })
})

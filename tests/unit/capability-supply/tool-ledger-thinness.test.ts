import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../helpers/source-files'

const moduleRoot = 'src/modules/capability-supply/internal'

describe('capability-supply operation ledger boundaries', () => {
  it('keeps ledger helpers independent of Convex runtime', () => {
    for (const file of listTsFiles(`${moduleRoot}/tool-ledger`)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from\s+['"][^'"]*(?:_generated|convex\/server)['"]|\bMutationCtx\b|\bQueryCtx\b|\bDoc\s*</)
    }
  })

  it('keeps ledger effects out of supply writer and publication domain modules', () => {
    for (const folder of ['offering', 'binding', 'eligibility', 'quarantine', 'shared', 'publication']) {
      for (const file of listTsFiles(`${moduleRoot}/${folder}`)) {
        const source = readFileSync(file, 'utf8')
        expect(source).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+(?:beginOperation|ensureSupplyAudit)\b/)
      }
    }
  })
})

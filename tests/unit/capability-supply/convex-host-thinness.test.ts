import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../helpers/source-files'

describe('capability-supply Convex boundaries', () => {
  it('keeps pure domain modules free of Convex runtime dependencies', () => {
    for (const folder of ['offering', 'binding', 'eligibility', 'quarantine', 'publication', 'shared', 'operation-ledger', 'graph']) {
      for (const file of listTsFiles(`src/modules/capability-supply/internal/${folder}`)) {
        const source = readFileSync(file, 'utf8')
        expect(source).not.toMatch(/from\s+['"][^'"]*(?:_generated|convex\/server)['"]|\bMutationCtx\b|\bDoc\s*</)
      }
    }
  })
})

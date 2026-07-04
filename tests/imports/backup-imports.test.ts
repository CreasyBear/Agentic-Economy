import { describe, expect, it } from 'vitest'

import { scanBackupImports } from '@/lib/ui/contract-scans'

import { cleanRuntimeTargets, fixtureTargets, isFixtureMode } from './scan-targets'

describe('backup import guardrail', () => {
  it('rejects backup and planning imports in the selected target set', () => {
    const violations = scanBackupImports(
      isFixtureMode() ? fixtureTargets('tests/fixtures/bad-imports/backup-import.fixture') : cleanRuntimeTargets()
    )

    if (isFixtureMode()) {
      expect(violations.map((violation) => violation.rule)).toEqual(
        expect.arrayContaining(['backup-import', 'forbidden-handshake-import']),
      )
      expect(violations.filter((violation) => violation.rule === 'forbidden-handshake-import')).toHaveLength(13)
      return
    }

    expect(violations).toEqual([])
  })
})


import { describe, expect, it } from 'vitest'
import { relative } from 'node:path'
import reui from '../../src/components/reui/upstream-manifest.json'

import { scanTypeScriptStandards } from '@/lib/ui/contract-scans'

import { cleanRuntimeTargets, fixtureTargets, isFixtureMode } from './scan-targets'

describe('TypeScript standards guardrail', () => {
  it('rejects broad runtime type holes', () => {
    const violations = scanTypeScriptStandards(
      isFixtureMode() ? fixtureTargets('tests/fixtures/bad-ts-standards') : cleanRuntimeTargets()
    )

    if (isFixtureMode()) {
      expect(violations.map((violation) => violation.rule)).toEqual(
        expect.arrayContaining([
          'explicit-any',
          'non-null-assertion',
          'convex-any-validator',
          'broad-status-string',
          'hard-coded-source-csrf',
          'client-exposed-source-write-secret',
        ])
      )
      return
    }

    // Only reviewed upstream generic implementation patterns are excepted.
    // Content hashes are independently checked by file-size-ceiling; all security rules stay active.
    expect(violations.filter(violation => !reui.files.some(entry =>
      entry.path === relative(process.cwd(), violation.file).split('\\').join('/')
      && entry.permittedTypePatterns.some(pattern => pattern === violation.rule),
    ))).toEqual([])
  })
})

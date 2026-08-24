import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { listActions } from '@/modules/actions'
import { legacyReleaseATables } from '../../../convex/legacyReleaseASchema'

const CHAT_ACTION_IDS = [
  'registry.operations.search',
  'registry.operations.detail',
  'registry.operations.compare',
  'registry.operations.inspectPlan',
  'operation.execute',
] as const

const LEGACY_WRITERS = {
  'convex/answerThreads.ts': [
    'continueDeleteAnswerThread',
    'deleteAnswerThread',
    'issueAnswerThreadShare',
    'persistAnswerTurnCheckpoint',
    'renewAnswerTurnLease',
    'reserveAnswerTurn',
    'revokeAnswerThreadShare',
    'stopAnswerTurn',
  ],
  'convex/externalRuns.ts': [
    'admitStart',
    'createManifest',
    'finalizeRun',
    'recordEvidence',
    'updateManifest',
  ],
  'convex/harnessSessions.ts': [
    'appendHarnessSessionEntry',
    'finalizeReservedAnswerTurn',
  ],
} as const

const LEGACY_READERS = {
  'convex/answerThreads.ts': [
    'getAnswerThread',
    'getAnswerThreadWithTurns',
    'getOwnedThreadProjection',
    'getSharedThreadProjection',
    'getThreadTurns',
    'listAdminHarnessRunTurns',
    'listSessionThreads',
    'readAnswerTurnCheckpoint',
    'readTurnToolCalls',
  ],
  'convex/externalRuns.ts': ['inspectManifest', 'readReport'],
  'convex/harnessSessions.ts': [
    'listHarnessRunEntries',
    'listHarnessSessionEntries',
    'readAdminHarnessSessionEntries',
  ],
} as const

const LEGACY_TABLES = [
  'answerThreadShares',
  'answerThreads',
  'answerToolCalls',
  'answerTurnReservations',
  'answerTurns',
  'externalRunEvidence',
  'externalRunGateDecisions',
  'externalRunManifests',
  'externalRunStarts',
  'harnessSessionEntries',
  'harnessSessions',
] as const

function exportsUsing(path: string, registrations: readonly string[]): readonly string[] {
  const registrationPattern = registrations.join('|')
  return [...readFileSync(path, 'utf8').matchAll(
    new RegExp(`^export const (\\w+) = (?:${registrationPattern})\\s*\\(`, 'gmu'),
  )].map((match) => match[1]!).sort()
}

describe('Operation chat prune boundary', () => {
  it('pins the five canonical chat Actions and excludes consequential surfaces', () => {
    const actions = listActions()
    const registeredIds = actions.map(({ id }) => id)
    const excludedActionIds = new Set([
      'operation.invoke',
      'operation.status',
      'operation.cancel',
      'operation.reconcile',
      'supply.publish',
      'supply.withdraw',
      'supply.earnings',
    ])

    expect(registeredIds).toEqual(expect.arrayContaining([...CHAT_ACTION_IDS]))
    expect(CHAT_ACTION_IDS.filter((id) => excludedActionIds.has(id))).toEqual([])

    const paymentBearingIds = actions
      .filter(({ effect }) => effect.class === 'payment' || effect.spendExposure !== 'none')
      .map(({ id }) => id)
    expect(paymentBearingIds).not.toEqual([])
    expect(CHAT_ACTION_IDS.filter((id) => paymentBearingIds.includes(id))).toEqual([])
  })

  it('freezes exactly fifteen legacy writers and retains fourteen readers', () => {
    expect(Object.values(LEGACY_WRITERS).flat()).toHaveLength(15)
    expect(Object.values(LEGACY_READERS).flat()).toHaveLength(14)
    for (const [path, exports] of Object.entries(LEGACY_WRITERS)) {
      const source = readFileSync(path, 'utf8')
      expect(exportsUsing(path, ['internalMutation', 'mutation', 'mutationGeneric']), path).toEqual(exports)
      expect([...source.matchAll(/handler: .*retiredLegacyWriter/gmu)], path).toHaveLength(exports.length)
      expect(source, path).toContain("throw new Error('legacy_writer_retired')")
    }
    for (const [path, exports] of Object.entries(LEGACY_READERS)) {
      expect(exportsUsing(path, ['query', 'queryGeneric']), path).toEqual(exports)
    }
  })

  it('keeps the temporary eleven-table schema self-contained', () => {
    expect(Object.keys(legacyReleaseATables).sort()).toEqual(LEGACY_TABLES)

    const releaseASchema = readFileSync('convex/legacyReleaseASchema.ts', 'utf8')
    expect([...releaseASchema.matchAll(/from '([^']+)'/gu)].map((match) => match[1])).toEqual([
      'convex/server',
      'convex/values',
    ])

    const schema = readFileSync('convex/schema.ts', 'utf8')
    expect(schema).toContain("import { legacyReleaseATables } from './legacyReleaseASchema'")
    expect(schema).toContain('...legacyReleaseATables')
    expect(schema).not.toContain('answerThreadTables')
    expect(schema).not.toContain('harnessTables')
    expect(schema).not.toContain('externalRunTables')
  })
})

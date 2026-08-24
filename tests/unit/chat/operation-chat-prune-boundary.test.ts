import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { listActions } from '@/modules/actions'
import { answerThreadTables } from '@/modules/answer-thread/internal/convex-schema'
import { externalRunTables } from '@/modules/external-run/internal/convex-schema'
import { harnessTables } from '@/modules/harness/internal/convex-schema'

const CHAT_ACTION_IDS = [
  'registry.operations.search',
  'registry.operations.detail',
  'registry.operations.compare',
  'registry.operations.inspectPlan',
  'operation.execute',
] as const

const LEGACY_PUBLIC_WRITERS = {
  'convex/answerThreads.ts': [
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

function publicWriterExports(path: string): readonly string[] {
  return [...readFileSync(path, 'utf8').matchAll(
    /^export const (\w+) = (?:action|actionGeneric|mutation|mutationGeneric)\s*\(/gmu,
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

  it('inventories the public legacy writers and eleven hard-reset tables', () => {
    for (const [path, exports] of Object.entries(LEGACY_PUBLIC_WRITERS)) {
      expect(publicWriterExports(path), path).toEqual(exports)
    }

    expect(Object.keys({
      ...answerThreadTables,
      ...harnessTables,
      ...externalRunTables,
    }).sort()).toEqual(LEGACY_TABLES)
  })
})

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { callSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import type { AnswerTurnRecord } from '@/modules/answer-thread/public'
import type { AdminMembership } from '@/modules/security/public'
import { requireAdminAuthority } from '@/modules/security/public'
import {
  buildHarnessRunViewerDetailResult,
  buildHarnessRunViewerListResult,
  normalizeHarnessRunViewerFilters,
} from './internal/run-viewer-projection'
import {
  HarnessRunViewerEvidenceFilterValues,
  HarnessRunViewerStatusFilterValues,
  type HarnessRunViewerAccess,
  type HarnessRunViewerDetailResult,
  type HarnessRunViewerFilters,
  type HarnessRunViewerListResult,
  type HarnessRunViewerSourceTurn,
  type HarnessRunViewerSourceState,
} from './run-viewer.schema'

const filtersSchema = z.object({
  status: z.enum(HarnessRunViewerStatusFilterValues).optional(),
  turnId: z.string().trim().min(1).optional(),
  threadId: z.string().trim().min(1).optional(),
  date: z.string().trim().min(1).optional(),
  hasRunEvidence: z.enum(HarnessRunViewerEvidenceFilterValues).optional(),
})

const detailSchema = filtersSchema.extend({
  turnId: z.string().trim().min(1),
})

type AdminHarnessRunTurnsSourceResult =
  | {
      kind: 'allowed'
      actorRef: string
      turns: readonly AnswerTurnRecord[]
      limit: number
      truncated: boolean
    }
  | {
      kind: 'denied'
      reason: 'missing_membership' | 'inactive_membership' | 'action_not_allowed'
      turns: readonly AnswerTurnRecord[]
      limit: number
      truncated: false
    }

const listAdminHarnessRunTurnsQuery = sourceQuery<
  HarnessRunViewerFilters & { limit?: number },
  AdminHarnessRunTurnsSourceResult
>('answerThreads:listAdminHarnessRunTurns')

export type HarnessRunViewerSourceRead = {
  access: HarnessRunViewerAccess
  turns: readonly AnswerTurnRecord[]
}

export type HarnessRunViewerSourcePort = {
  authorize(filters: HarnessRunViewerFilters): Promise<HarnessRunViewerAccess>
  readTurns(
    filters: HarnessRunViewerFilters,
    access: Extract<HarnessRunViewerAccess, { kind: 'allowed' }>,
  ): Promise<readonly HarnessRunViewerSourceTurn[]>
}

let testSourcePort: HarnessRunViewerSourcePort | undefined

export function setHarnessRunViewerSourcePortForTests(
  port: HarnessRunViewerSourcePort | undefined,
): () => void {
  const previous = testSourcePort
  testSourcePort = port
  return () => {
    testSourcePort = previous
  }
}

export function accessForHarnessRunViewerAdminMembership(
  membership: AdminMembership | undefined,
): HarnessRunViewerAccess {
  const authority = requireAdminAuthority(membership, 'read_admin_readbacks')
  if (authority.kind === 'denied') {
    return {
      kind: 'denied',
      reason: authority.reason,
      publicMessage: 'Admin runs require active source-owned membership.',
    }
  }

  return { kind: 'allowed', actorRef: authority.membership.clerkUserId }
}

export const readAdminRunViewerListServer = createServerFn()
  .validator((data) => filtersSchema.parse(data ?? {}))
  .handler(async ({ data }) => readAdminRunViewerListThroughSource(data))

export const readAdminRunViewerDetailServer = createServerFn()
  .validator((data) => detailSchema.parse(data))
  .handler(async ({ data }) => readAdminRunViewerDetailThroughSource(data.turnId, data))

export async function readAdminRunViewerListThroughSource(
  filters: HarnessRunViewerFilters = {},
): Promise<HarnessRunViewerListResult> {
  const normalizedFilters = normalizeHarnessRunViewerFilters(filters)
  const read = await readRunViewerSourceTurns(normalizedFilters)
  return buildHarnessRunViewerListResult({
    access: read.access,
    turns: read.turns,
    filters: normalizedFilters,
    source: read.source,
  })
}

export async function readAdminRunViewerDetailThroughSource(
  turnId: string,
  filters: HarnessRunViewerFilters = {},
): Promise<HarnessRunViewerDetailResult> {
  const normalizedFilters = normalizeHarnessRunViewerFilters({ ...filters, turnId })
  const read = await readRunViewerSourceTurns(normalizedFilters)
  return buildHarnessRunViewerDetailResult({
    access: read.access,
    turns: read.turns,
    turnId,
    filters: normalizedFilters,
    source: read.source,
  })
}

async function readRunViewerSourceTurns(filters: HarnessRunViewerFilters): Promise<
  HarnessRunViewerSourceRead & { source: HarnessRunViewerSourceState }
> {
  const source = readConfiguredSource()
  if (source !== undefined) {
    const read = await readAuthorizedTurns(source, filters)
    return { ...read, source: { kind: 'configured' } }
  }

  return readDefaultSourceTurns(filters)
}

async function readDefaultSourceTurns(filters: HarnessRunViewerFilters): Promise<
  HarnessRunViewerSourceRead & { source: HarnessRunViewerSourceState }
> {
  try {
    const result = await callSourceQuery(listAdminHarnessRunTurnsQuery, { ...filters, limit: 100 })
    if (result.kind === 'denied') {
      return {
        access: {
          kind: 'denied',
          reason: result.reason,
          publicMessage: 'Admin runs require active source-owned membership.',
        },
        turns: [],
        source: { kind: 'configured' },
      }
    }

    return {
      access: { kind: 'allowed', actorRef: result.actorRef },
      turns: result.turns,
      source: { kind: 'configured' },
    }
  } catch {
    return {
      access: {
        kind: 'denied',
        reason: 'missing_membership',
        publicMessage: 'Admin runs require active source-owned membership.',
      },
      turns: [],
      source: { kind: 'configured' },
    }
  }
}

async function readAuthorizedTurns(
  port: HarnessRunViewerSourcePort,
  filters: HarnessRunViewerFilters,
): Promise<HarnessRunViewerSourceRead> {
  const access = await port.authorize(filters)
  if (access.kind === 'denied') {
    return { access, turns: [] }
  }

  return {
    access,
    turns: await port.readTurns(filters, access),
  }
}

function readConfiguredSource(): HarnessRunViewerSourcePort | undefined {
  return testSourcePort
}


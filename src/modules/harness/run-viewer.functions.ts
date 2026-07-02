import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

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

const disabledSourceState = {
  kind: 'disabled',
  reason: 'admin_source_port_missing',
  publicMessage: 'Run evidence source reads are disabled until an admin-only source port is configured.',
} satisfies HarnessRunViewerSourceState

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
      publicMessage: 'Admin run evidence requires active source-owned membership.',
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
  const source = readConfiguredSource()

  if (source.kind === 'disabled') {
    return buildHarnessRunViewerDisabledListResult(normalizedFilters)
  }

  const read = await readAuthorizedTurns(source.port, normalizedFilters)
  return buildHarnessRunViewerListResult({
    access: read.access,
    turns: read.turns,
    filters: normalizedFilters,
    source: { kind: 'configured' },
  })
}

export async function readAdminRunViewerDetailThroughSource(
  turnId: string,
  filters: HarnessRunViewerFilters = {},
): Promise<HarnessRunViewerDetailResult> {
  const normalizedFilters = normalizeHarnessRunViewerFilters({ ...filters, turnId })
  const source = readConfiguredSource()

  if (source.kind === 'disabled') {
    return buildHarnessRunViewerDisabledDetailResult(turnId, normalizedFilters)
  }

  const read = await readAuthorizedTurns(source.port, normalizedFilters)
  return buildHarnessRunViewerDetailResult({
    access: read.access,
    turns: read.turns,
    turnId,
    filters: normalizedFilters,
    source: { kind: 'configured' },
  })
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

function readConfiguredSource():
  | { kind: 'configured'; port: HarnessRunViewerSourcePort }
  | { kind: 'disabled'; source: HarnessRunViewerSourceState } {
  if (testSourcePort !== undefined) {
    return { kind: 'configured', port: testSourcePort }
  }

  return { kind: 'disabled', source: disabledSourceState }
}

function buildHarnessRunViewerDisabledListResult(
  filters: HarnessRunViewerFilters,
): HarnessRunViewerListResult {
  return {
    kind: 'allowed',
    httpStatus: 200,
    generatedAt: Date.now(),
    actorRef: 'admin-run-viewer-source-disabled',
    filters,
    source: disabledSourceState,
    summary: {
      turns: 0,
      withHarnessRun: 0,
      legacyBackfilled: 0,
      missingRunEvidence: 0,
      attention: 0,
    },
    rows: [],
  }
}

function buildHarnessRunViewerDisabledDetailResult(
  turnId: string,
  filters: HarnessRunViewerFilters,
): HarnessRunViewerDetailResult {
  return {
    kind: 'not_found',
    httpStatus: 404,
    generatedAt: Date.now(),
    filters,
    source: disabledSourceState,
    turnId,
    publicMessage: `${disabledSourceState.publicMessage} No private turns were read.`,
    rows: [],
  }
}

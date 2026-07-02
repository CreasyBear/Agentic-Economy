import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import type { AnswerTurnRecord } from '@/modules/answer-thread/public'
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
  readTurns(filters: HarnessRunViewerFilters): Promise<HarnessRunViewerSourceRead>
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

  const read = await source.port.readTurns(normalizedFilters)
  return buildHarnessRunViewerListResult({
    access: read.access,
    turns: read.turns,
    filters: normalizedFilters,
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

  const read = await source.port.readTurns(normalizedFilters)
  return buildHarnessRunViewerDetailResult({
    access: read.access,
    turns: read.turns,
    turnId,
    filters: normalizedFilters,
  })
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

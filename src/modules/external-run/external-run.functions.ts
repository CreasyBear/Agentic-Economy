import { z } from 'zod'

import { isRecord } from '@/modules/common/is-record'
import {
  callSourceMutation,
  callSourceQuery,
  ConvexSourceError,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'

import {
  externalRunEvidenceInputSchema,
  externalRunManifestInputSchema,
  externalRunStartCandidateSchema,
} from './internal/contract'

const commandContextSchema = z.strictObject({
  operationKey: z.string().trim().min(1).max(200),
  correlationId: z.string().trim().min(1).max(200),
  reasonCode: z.string().trim().min(1).max(200),
  evidenceRefs: z.array(z.string().trim().min(1).max(200)).max(32),
  sourceWrite: z.unknown().optional(),
})

export const externalRunManifestCommandSchema = z.strictObject({
  manifest: externalRunManifestInputSchema,
  ...commandContextSchema.shape,
})
export type ExternalRunManifestCommand = z.infer<typeof externalRunManifestCommandSchema>

export const externalRunStartCommandSchema = z.strictObject({
  runId: z.string().trim().min(1).max(200),
  candidate: externalRunStartCandidateSchema,
  ...commandContextSchema.shape,
})
export type ExternalRunStartCommand = z.infer<typeof externalRunStartCommandSchema>

export const externalRunEvidenceCommandSchema = z.strictObject({
  runId: z.string().trim().min(1).max(200),
  evidence: externalRunEvidenceInputSchema,
  ...commandContextSchema.shape,
})
export type ExternalRunEvidenceCommand = z.infer<typeof externalRunEvidenceCommandSchema>

export const externalRunReportQuerySchema = z.strictObject({
  runId: z.string().trim().min(1).max(200),
})
export type ExternalRunReportQuery = z.infer<typeof externalRunReportQuerySchema>

type SourceResult = Readonly<Record<string, unknown>>

const createManifestMutation = sourceMutation<SourceResult, SourceResult>('externalRuns:createManifest')
const updateManifestMutation = sourceMutation<SourceResult, SourceResult>('externalRuns:updateManifest')
const admitStartMutation = sourceMutation<SourceResult, SourceResult>('externalRuns:admitStart')
const recordEvidenceMutation = sourceMutation<SourceResult, SourceResult>('externalRuns:recordEvidence')
const finalizeRunMutation = sourceMutation<SourceResult, SourceResult>('externalRuns:finalizeRun')
const inspectManifestQuery = sourceQuery<SourceResult, SourceResult>('externalRuns:inspectManifest')
const reportQuery = sourceQuery<SourceResult, SourceResult>('externalRuns:readReport')

export type ExternalRunSourceResult = Readonly<{
  kind: 'accepted' | 'replayed' | 'refused'
  [key: string]: unknown
}>

export async function createExternalRunManifestThroughSource(input: ExternalRunManifestCommand): Promise<ExternalRunSourceResult> {
  return callManifestMutation(createManifestMutation, input)
}

export async function updateExternalRunManifestThroughSource(input: ExternalRunManifestCommand): Promise<ExternalRunSourceResult> {
  return callManifestMutation(updateManifestMutation, input)
}

export async function admitExternalRunStartThroughSource(input: ExternalRunStartCommand): Promise<ExternalRunSourceResult> {
  return callManifestMutation(admitStartMutation, input)
}

export async function recordExternalRunEvidenceThroughSource(input: ExternalRunEvidenceCommand): Promise<ExternalRunSourceResult> {
  return callManifestMutation(recordEvidenceMutation, input)
}

export async function inspectExternalRunManifestThroughSource(input: ExternalRunReportQuery): Promise<ExternalRunSourceResult> {
  try {
    return asSourceResult(await callSourceQuery(inspectManifestQuery, externalRunReportQuerySchema.parse(input)))
  } catch (error) {
    return sourceUnavailable(error)
  }
}
export async function finalizeExternalRunThroughSource(input: ExternalRunManifestCommand): Promise<ExternalRunSourceResult> {
  return callManifestMutation(finalizeRunMutation, input)
}

export async function readExternalRunReportThroughSource(input: ExternalRunReportQuery): Promise<ExternalRunSourceResult> {
  try {
    return asSourceResult(await callSourceQuery(reportQuery, externalRunReportQuerySchema.parse(input)))
  } catch (error) {
    return sourceUnavailable(error)
  }
}

async function callManifestMutation(
  mutation: typeof createManifestMutation,
  input: ExternalRunManifestCommand | ExternalRunStartCommand | ExternalRunEvidenceCommand,
): Promise<ExternalRunSourceResult> {
  try {
    return asSourceResult(await callSourceMutation(mutation, input))
  } catch (error) {
    return sourceUnavailable(error)
  }
}

function asSourceResult(value: unknown): ExternalRunSourceResult {
  if (!isRecord(value)) return { kind: 'refused', reason: 'source_response_invalid' }
  const kind = value.kind
  if (kind !== 'accepted' && kind !== 'replayed' && kind !== 'refused') return { kind: 'refused', reason: 'source_response_invalid' }
  return value as ExternalRunSourceResult
}

function sourceUnavailable(error: unknown): ExternalRunSourceResult {
  return {
    kind: 'refused',
    reason: error instanceof ConvexSourceError && error.code === 'missing_auth' ? 'authentication_required' : 'source_unavailable',
  }
}

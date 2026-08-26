import type {
  MeasuredProtectedSurfaceInventory,
  MeasuredProtectedSurfaceRow,
} from '../../../lib/server/authority-boundary/protected-surface-manifest'
import {
  generateIsolationMatrix,
  type IsolationDecision,
  type IsolationMatrix,
  type IsolationProbe,
  type IsolationSurface,
} from './isolation'
import {
  SECRET_CANARY_SINKS,
  proveSecretCanaryIsolation,
  type SecretCanaryProof,
  type SecretCanarySink,
} from './secret-canary'
import type { AccountRef } from '../../principal-account/account/public'
import type { PrincipalRef } from '../../principal-account/principal/public'

const SHA256_PATTERN = /^[a-f0-9]{64}$/u
const EXPECTED_COUNTS = Object.freeze({
  serverFunctions: 43,
  publicConvex: 116,
  convexHttpActions: 1,
  crons: 10,
  backgroundFamilies: 25,
  frozenHttp: 39,
  frozenMcp: 14,
  frozenCli: 12,
})

export type ProductionEvidenceErrorCode =
  | 'production_evidence_inventory_invalid'
  | 'production_evidence_sink_invalid'

export class ProductionEvidenceError extends Error {
  readonly code: ProductionEvidenceErrorCode

  constructor(code: ProductionEvidenceErrorCode) {
    super(code)
    this.name = 'ProductionEvidenceError'
    this.code = code
  }
}

export type ProductionSinkEvidence = Readonly<{
  sourceRef: string
  textFragments?: readonly string[]
  byteFragments?: readonly Uint8Array[]
}>

export type ProductionEvidenceSinkCollectors = Readonly<Record<
  SecretCanarySink,
  () => Promise<ProductionSinkEvidence>
>>

export type ProductionEvidenceRequest = Readonly<{
  measuredInventory: MeasuredProtectedSurfaceInventory
  resolveSurface(row: MeasuredProtectedSurfaceRow): Promise<Omit<IsolationSurface, 'protection'>>
  actors: Readonly<{
    owner: PrincipalRef
    member: PrincipalRef
    stranger: PrincipalRef
    workload: PrincipalRef
  }>
  wrongAccountRef: AccountRef
  currentGeneration: number
  evaluate(probe: IsolationProbe): Promise<IsolationDecision>
  canary: Uint8Array
  sinkCollectors: ProductionEvidenceSinkCollectors
}>

export type ProductionEvidenceProof = Readonly<{
  measuredSurfaceCount: number
  measuredSurfaceRefs: readonly string[]
  isolation: IsolationMatrix
  canary: SecretCanaryProof
  sinkSourceRefs: readonly string[]
}>

export async function collectProductionEvidence(
  request: ProductionEvidenceRequest,
): Promise<ProductionEvidenceProof> {
  const measuredRows = measuredInventoryRows(request.measuredInventory)
  const surfaces: IsolationSurface[] = []
  for (const measured of measuredRows) {
    const protection = protectionFor(measured)
    const resolved = await request.resolveSurface(measured)
    if (resolved.surfaceRef !== measured.ref) throw inventoryError()
    surfaces.push(Object.freeze({ ...resolved, protection }))
  }

  const sinkKeys = Object.keys(request.sinkCollectors)
  if (sinkKeys.length !== SECRET_CANARY_SINKS.length
    || SECRET_CANARY_SINKS.some((sink) => !sinkKeys.includes(sink))) {
    throw sinkError()
  }
  const artifacts = []
  const sourceRefs: string[] = []
  for (const sink of SECRET_CANARY_SINKS) {
    let evidence: ProductionSinkEvidence
    try {
      evidence = await request.sinkCollectors[sink]()
    } catch {
      throw sinkError()
    }
    if (typeof evidence.sourceRef !== 'string'
      || evidence.sourceRef.length === 0
      || (!(evidence.textFragments?.some((fragment) => fragment.length > 0) ?? false)
        && !(evidence.byteFragments?.some((fragment) => fragment.byteLength > 0) ?? false))) {
      throw sinkError()
    }
    sourceRefs.push(evidence.sourceRef)
    artifacts.push(Object.freeze({
      sink,
      ...(evidence.textFragments === undefined
        ? {}
        : { textFragments: Object.freeze([...evidence.textFragments]) }),
      ...(evidence.byteFragments === undefined
        ? {}
        : { byteFragments: Object.freeze(evidence.byteFragments.map((value) => Uint8Array.from(value))) }),
    }))
  }
  if (new Set(sourceRefs).size !== SECRET_CANARY_SINKS.length) throw sinkError()

  const isolation = await generateIsolationMatrix({
    surfaces: Object.freeze(surfaces),
    actors: request.actors,
    wrongAccountRef: request.wrongAccountRef,
    currentGeneration: request.currentGeneration,
    evaluate: request.evaluate,
  })
  const canary = proveSecretCanaryIsolation(request.canary, artifacts)
  return Object.freeze({
    measuredSurfaceCount: measuredRows.length,
    measuredSurfaceRefs: Object.freeze(measuredRows.map((row) => row.ref)),
    isolation,
    canary,
    sinkSourceRefs: Object.freeze(sourceRefs),
  })
}

function measuredInventoryRows(
  inventory: MeasuredProtectedSurfaceInventory,
): readonly MeasuredProtectedSurfaceRow[] {
  const rows = [
    ...inventory.serverFunctions,
    ...inventory.publicConvex,
    ...inventory.convexHttpActions,
    ...inventory.crons,
    ...inventory.backgroundFamilies,
  ]
  if (inventory.format !== 'phase-2-protected-surfaces:v2'
    || !countsEqual(inventory.expectedCounts)
    || !countsEqual(inventory.actualCounts)
    || inventory.serverFunctions.length !== EXPECTED_COUNTS.serverFunctions
    || inventory.publicConvex.length !== EXPECTED_COUNTS.publicConvex
    || inventory.convexHttpActions.length !== EXPECTED_COUNTS.convexHttpActions
    || inventory.crons.length !== EXPECTED_COUNTS.crons
    || inventory.backgroundFamilies.length !== EXPECTED_COUNTS.backgroundFamilies
    || inventory.frozenContract.httpRefs.length !== EXPECTED_COUNTS.frozenHttp
    || inventory.frozenContract.mcpRefs.length !== EXPECTED_COUNTS.frozenMcp
    || inventory.frozenContract.cliRefs.length !== EXPECTED_COUNTS.frozenCli
    || !SHA256_PATTERN.test(inventory.frozenContract.sha256)
    || rows.length !== 195
    || new Set(rows.map((row) => row.ref)).size !== rows.length
    || rows.some((row) => row.status !== 'bound')
    || Object.values(inventory.blockedByKind).some((count) => count !== 0)) {
    throw inventoryError()
  }
  for (const row of rows) protectionFor(row)
  return Object.freeze(rows)
}

function protectionFor(row: MeasuredProtectedSurfaceRow): 'protected' | 'tested_public_exemption' {
  const exempt = row.binding === 'public_non_consequential'
    || row.binding === 'narrow_system_non_consequential'
  if (exempt) {
    if (row.consequential
      || row.authorityPath !== undefined
      || row.authoritySink !== undefined
      || row.exemption === undefined
      || row.exemption.sourceRef !== row.ref
      || row.exemption.testName.length === 0
      || !/^tests\/.+\.test\.ts$/u.test(row.exemption.testFile)
      || !SHA256_PATTERN.test(row.exemption.sha256)) {
      throw inventoryError()
    }
    return 'tested_public_exemption'
  }
  if (!row.consequential
    || row.exemption !== undefined
    || row.authoritySink === undefined
    || row.authorityPath === undefined
    || row.authorityPath.length < 2
    || row.authorityPath[0]?.ref !== row.ref
    || row.authorityPath.at(-1)?.ref !== row.authoritySink) {
    throw inventoryError()
  }
  return 'protected'
}

function countsEqual(counts: Readonly<Record<keyof typeof EXPECTED_COUNTS, number>>): boolean {
  return Object.entries(EXPECTED_COUNTS).every(([key, value]) =>
    counts[key as keyof typeof EXPECTED_COUNTS] === value)
}

function inventoryError(): ProductionEvidenceError {
  return new ProductionEvidenceError('production_evidence_inventory_invalid')
}

function sinkError(): ProductionEvidenceError {
  return new ProductionEvidenceError('production_evidence_sink_invalid')
}

import type {
  MeasuredProtectedSurfaceInventory,
  MeasuredProtectedSurfaceRow,
} from '../../../lib/server/authority-boundary/protected-surface-manifest'
import {
  SECRET_CANARY_SINKS,
  proveSecretCanaryIsolation,
  type SecretCanaryProof,
  type SecretCanarySink,
} from './secret-canary'

const SHA256_PATTERN = /^[a-f0-9]{64}$/u
const PHASE_2_BASELINE_COUNTS = Object.freeze({
  serverFunctions: 47,
  publicConvex: 117,
  convexHttpActions: 7,
  crons: 10,
  backgroundFamilies: 25,
  frozenHttp: 40,
  frozenMcp: 13,
  frozenCli: 12,
})

export type ProductionEvidenceErrorCode =
  | 'production_evidence_inventory_invalid'
  | 'production_evidence_runtime_handler_red'
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

export type ProductionRuntimeHandlerTestRow =
  | Readonly<{
      status: 'covered'
      surfaceRef: string
      testFile: string
      testName: string
      sha256: string
      caseLabels: readonly string[]
    }>
  | Readonly<{ status: 'red'; reason: string }>

export type ProductionRuntimeHandlerTestRegistry = Readonly<{
  format: 'phase-2-authority-sink-runtime-tests:v2'
  inventorySha256: string
  rows: Readonly<Record<string, ProductionRuntimeHandlerTestRow>>
}>

export type ProductionSurfaceAuthorityMap = Readonly<{
  format: 'phase-2-surface-authority-map:v1'
  inventorySha256: string
  total: number
  protected: number
  exemptions: number
  proved: number
  red: number
  rows: readonly Readonly<{
    surfaceRef: string
    runtimeHandlerRef: string
    authoritySink?: string
    status?: 'tested_exemption'
    testFile?: string
    testName?: string
    dominance?: Readonly<{ status: 'proved' | 'red'; sha256?: string }>
    runtimeIsolation?: Readonly<{
      testFile: string
      testName: string
      testSha256: string
      caseLabels: readonly string[]
    }>
  }>[]
}>

export type ProductionEvidenceRequest = Readonly<{
  measuredInventory: MeasuredProtectedSurfaceInventory
  measuredInventorySha256: string
  runtimeHandlerTests: ProductionRuntimeHandlerTestRegistry
  surfaceAuthorityMap: ProductionSurfaceAuthorityMap
  canary: Uint8Array
  sinkCollectors: ProductionEvidenceSinkCollectors
}>

export type ProductionEvidenceProof = Readonly<{
  baselineSurfaceCount: number
  baselineCounts: typeof PHASE_2_BASELINE_COUNTS
  candidateCounts: Readonly<Record<string, number>>
  measuredSurfaceCount: number
  measuredSurfaceRefs: readonly string[]
  surfaceRuntimeIsolationIndex: Readonly<{
    kind: 'measured_surface_runtime_isolation_index'
    inventorySha256: string
    surfaceCount: number
    protectedSurfaceCount: number
    testedExemptionCount: number
    caseCount: number
    surfaceRefs: readonly string[]
  }>
  runtimeHandlerTestIndex: Readonly<{
    kind: 'generated_authority_composition_test_index'
    inventorySha256: string
    sinkCount: number
    caseCount: number
    authoritySinks: readonly string[]
    testRefs: readonly string[]
  }>
  canary: SecretCanaryProof
  sinkSourceRefs: readonly string[]
}>

export async function collectProductionEvidence(
  request: ProductionEvidenceRequest,
): Promise<ProductionEvidenceProof> {
  const measuredRows = measuredInventoryRows(request.measuredInventory)
  const runtimeHandlerTestIndex = runtimeHandlerTestIndexEvidence(request, measuredRows)
  const surfaceRuntimeIsolationIndex = surfaceRuntimeIsolationEvidence(request, measuredRows)

  const sinkKeys = Object.keys(request.sinkCollectors)
  if (sinkKeys.length !== SECRET_CANARY_SINKS.length
    || SECRET_CANARY_SINKS.some((sink) => !sinkKeys.includes(sink))) {
    throw sinkError()
  }
  const collected = await Promise.all(SECRET_CANARY_SINKS.map(async (sink) => {
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
    return Object.freeze({
      sourceRef: evidence.sourceRef,
      artifact: Object.freeze({
      sink,
      ...(evidence.textFragments === undefined
        ? {}
        : { textFragments: Object.freeze([...evidence.textFragments]) }),
      ...(evidence.byteFragments === undefined
        ? {}
        : { byteFragments: Object.freeze(evidence.byteFragments.map((value) => Uint8Array.from(value))) }),
      }),
    })
  }))
  const sourceRefs = collected.map(({ sourceRef }) => sourceRef)
  const artifacts = collected.map(({ artifact }) => artifact)
  if (new Set(sourceRefs).size !== SECRET_CANARY_SINKS.length) throw sinkError()

  const canary = proveSecretCanaryIsolation(request.canary, artifacts)
  return Object.freeze({
    baselineSurfaceCount: baselineSurfaceCount(),
    baselineCounts: PHASE_2_BASELINE_COUNTS,
    candidateCounts: candidateCounts(request.measuredInventory),
    measuredSurfaceCount: measuredRows.length,
    measuredSurfaceRefs: Object.freeze(measuredRows.map((row) => row.ref)),
    surfaceRuntimeIsolationIndex,
    runtimeHandlerTestIndex,
    canary,
    sinkSourceRefs: Object.freeze(sourceRefs),
  })
}

function runtimeHandlerTestIndexEvidence(
  request: ProductionEvidenceRequest,
  measuredRows: readonly MeasuredProtectedSurfaceRow[],
): ProductionEvidenceProof['runtimeHandlerTestIndex'] {
  const registry = request.runtimeHandlerTests
  const protectedRows = measuredRows.filter((row) => protectionFor(row) === 'protected')
  const authoritySinks = Object.freeze([...new Set(protectedRows.map((row) => row.authoritySink as string))].sort())
  const registrySinks = Object.keys(registry.rows).sort()
  const expectedCases = ['owner', 'member', 'workload', 'missing_workload', 'stranger', 'wrong_account', 'stale_generation']
  if (registry.format !== 'phase-2-authority-sink-runtime-tests:v2'
    || !SHA256_PATTERN.test(request.measuredInventorySha256)
    || registry.inventorySha256 !== request.measuredInventorySha256
    || registrySinks.length !== authoritySinks.length
    || registrySinks.some((sink, index) => sink !== authoritySinks[index])) {
    throw inventoryError()
  }
  const testRefs: string[] = []
  for (const authoritySink of authoritySinks) {
    const row = registry.rows[authoritySink] as ProductionRuntimeHandlerTestRow
    if (row.status === 'red') throw runtimeHandlerRedError()
    const measured = protectedRows.find((candidate) => (
      candidate.authoritySink === authoritySink && candidate.ref === row.surfaceRef
    ))
    if (measured === undefined
      || !/^tests\/.+\.test\.ts$/u.test(row.testFile)
      || row.testName.length === 0
      || JSON.stringify(row.caseLabels) !== JSON.stringify(expectedCases)
      || !SHA256_PATTERN.test(row.sha256)) throw inventoryError()
    testRefs.push(`${row.testFile}:${row.testName}`)
  }
  return Object.freeze({
    kind: 'generated_authority_composition_test_index',
    inventorySha256: registry.inventorySha256,
    sinkCount: authoritySinks.length,
    caseCount: authoritySinks.length * expectedCases.length,
    authoritySinks,
    testRefs: Object.freeze(testRefs),
  })
}

function surfaceRuntimeIsolationEvidence(
  request: ProductionEvidenceRequest,
  measuredRows: readonly MeasuredProtectedSurfaceRow[],
): ProductionEvidenceProof['surfaceRuntimeIsolationIndex'] {
  const map = request.surfaceAuthorityMap
  const measuredByRef = new Map(measuredRows.map((row) => [row.ref, row]))
  const expectedRefs = measuredRows.map((row) => row.ref)
  if (map.format !== 'phase-2-surface-authority-map:v1'
    || map.inventorySha256 !== request.measuredInventorySha256
    || map.total !== measuredRows.length
    || map.protected + map.exemptions !== map.total
    || map.proved !== map.protected
    || map.red !== 0
    || map.rows.length !== map.total
    || JSON.stringify(map.rows.map((row) => row.surfaceRef)) !== JSON.stringify(expectedRefs)) {
    throw inventoryError()
  }
  const expectedCases = ['owner', 'member', 'workload', 'missing_workload', 'stranger', 'wrong_account', 'stale_generation']
  for (const row of map.rows) {
    const measured = measuredByRef.get(row.surfaceRef)
    if (measured === undefined || row.runtimeHandlerRef !== `${measured.file}:${measured.symbol}`) {
      throw inventoryError()
    }
    if (protectionFor(measured) === 'protected') {
      const composition = row.runtimeIsolation
      const sinkTest = request.runtimeHandlerTests.rows[measured.authoritySink as string]
      if (row.authoritySink !== measured.authoritySink
        || row.dominance?.status !== 'proved'
        || !SHA256_PATTERN.test(row.dominance.sha256 ?? '')
        || composition === undefined
        || sinkTest?.status !== 'covered'
        || composition.testFile !== sinkTest.testFile
        || composition.testName !== sinkTest.testName
        || composition.testSha256 !== sinkTest.sha256
        || JSON.stringify(composition.caseLabels) !== JSON.stringify(expectedCases)) throw inventoryError()
    } else if (row.status !== 'tested_exemption'
      || row.testFile !== measured.exemption?.testFile
      || row.testName !== measured.exemption?.testName
      || row.runtimeIsolation !== undefined) throw inventoryError()
  }
  return Object.freeze({
    kind: 'measured_surface_runtime_isolation_index',
    inventorySha256: map.inventorySha256,
    surfaceCount: map.total,
    protectedSurfaceCount: map.protected,
    testedExemptionCount: map.exemptions,
    caseCount: map.protected * expectedCases.length,
    surfaceRefs: Object.freeze([...expectedRefs]),
  })
}

function measuredInventoryRows(
  inventory: MeasuredProtectedSurfaceInventory,
): readonly MeasuredProtectedSurfaceRow[] {
  const rows = [
    ...inventory.serverFunctions,
    ...inventory.publicConvex,
    ...inventory.convexHttpActions,
    ...inventory.convexHttpRoutes,
    ...inventory.crons,
    ...inventory.backgroundFamilies,
  ]
  if (inventory.format !== 'phase-2-protected-surfaces:v2'
    || !baselineCountsEqual(inventory.expectedCounts)
    || !baselineCountsEqual(inventory.baselineCounts)
    || !exactCountsEqual(inventory.candidateCounts, inventory.actualCounts)
    || !candidateCountsEqual(inventory)
    || inventory.frozenContract.httpRefs.length !== PHASE_2_BASELINE_COUNTS.frozenHttp
    || inventory.frozenContract.mcpRefs.length !== PHASE_2_BASELINE_COUNTS.frozenMcp
    || inventory.frozenContract.cliRefs.length !== PHASE_2_BASELINE_COUNTS.frozenCli
    || !SHA256_PATTERN.test(inventory.frozenContract.sha256)
    || rows.length === 0
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

function baselineCountsEqual(
  counts: Readonly<Record<keyof typeof PHASE_2_BASELINE_COUNTS, number>>,
): boolean {
  return Object.entries(PHASE_2_BASELINE_COUNTS).every(([key, value]) =>
    counts[key as keyof typeof PHASE_2_BASELINE_COUNTS] === value)
}

function candidateCounts(
  inventory: MeasuredProtectedSurfaceInventory,
): Readonly<Record<string, number>> {
  return Object.freeze({ ...inventory.candidateCounts })
}

function candidateCountsEqual(inventory: MeasuredProtectedSurfaceInventory): boolean {
  const actual = inventory.actualCounts as Readonly<Record<string, number>>
  return actual.serverFunctions === inventory.serverFunctions.length
    && actual.publicConvex === inventory.publicConvex.length
    && actual.convexHttpActions === inventory.convexHttpActions.length
    && actual.convexHttpRoutes === inventory.convexHttpRoutes.length
    && actual.crons === inventory.crons.length
    && actual.backgroundFamilies === inventory.backgroundFamilies.length
    && actual.frozenHttp === inventory.frozenContract.httpRefs.length
    && actual.frozenMcp === inventory.frozenContract.mcpRefs.length
    && actual.frozenCli === inventory.frozenContract.cliRefs.length
}

function exactCountsEqual(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => left[key] === right[key])
}

function baselineSurfaceCount(): number {
  return PHASE_2_BASELINE_COUNTS.serverFunctions
    + PHASE_2_BASELINE_COUNTS.publicConvex
    + PHASE_2_BASELINE_COUNTS.convexHttpActions
    + PHASE_2_BASELINE_COUNTS.crons
    + PHASE_2_BASELINE_COUNTS.backgroundFamilies
}

function inventoryError(): ProductionEvidenceError {
  return new ProductionEvidenceError('production_evidence_inventory_invalid')
}

function runtimeHandlerRedError(): ProductionEvidenceError {
  return new ProductionEvidenceError('production_evidence_runtime_handler_red')
}

function sinkError(): ProductionEvidenceError {
  return new ProductionEvidenceError('production_evidence_sink_invalid')
}

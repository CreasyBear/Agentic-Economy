export const SURFACE_AUTHORITY_BINDINGS = [
  'public_non_consequential',
  'narrow_system_non_consequential',
  'signed_callback',
  'interactive_account',
  'canonical_agent',
  'workload_account',
] as const

export type SurfaceAuthorityBinding = typeof SURFACE_AUTHORITY_BINDINGS[number]

export type ProtectedSurfaceManifestRow = Readonly<{
  surfaceRef: string
  kind: 'http' | 'mcp' | 'cli' | 'server_function' | 'convex_public' | 'callback' | 'worker' | 'job' | 'cron' | 'continuation' | 'reconciliation'
  binding: SurfaceAuthorityBinding
  consequential: boolean
  enforcementMarker?: string
}>

export type MeasuredProtectedSurfaceRow = Readonly<{
  ref: string
  kind: ProtectedSurfaceManifestRow['kind']
  file: string
  symbol: string
  registrar: string
  binding: SurfaceAuthorityBinding
  consequential: boolean
  status: 'bound' | 'blocked'
  marker: string
  sha256: string
  declaration: Readonly<{
    file: string
    symbol: string
    line: number
    column: number
    sha256: string
  }>
  authoritySink?: string
  authorityPath?: readonly Readonly<{
    ref: string
    file: string
    line: number
    column: number
    via: 'declaration' | 'call' | 'function_reference'
  }>[]
  exemption?: Readonly<{
    testFile: string
    testName: string
    sourceRef: string
    sha256: string
  }>
  blocker?: Readonly<{ code: string; detail: string }>
}>

export type MeasuredProtectedSurfaceInventory = Readonly<{
  format: 'phase-2-protected-surfaces:v2'
  expectedCounts: Readonly<{
    serverFunctions: 43
    publicConvex: 116
    convexHttpActions: 1
    crons: 10
    backgroundFamilies: 25
    frozenHttp: 39
    frozenMcp: 14
    frozenCli: 12
  }>
  baselineCounts: Readonly<{
    serverFunctions: 43
    publicConvex: 116
    convexHttpActions: 1
    crons: 10
    backgroundFamilies: 25
    frozenHttp: 39
    frozenMcp: 14
    frozenCli: 12
  }>
  candidateCounts: Readonly<{
    serverFunctions: number
    publicConvex: number
    convexHttpActions: number
    convexHttpRoutes: number
    crons: number
    backgroundFamilies: number
    frozenHttp: number
    frozenMcp: number
    frozenCli: number
  }>
  actualCounts: Readonly<{
    serverFunctions: number
    publicConvex: number
    convexHttpActions: number
    convexHttpRoutes: number
    crons: number
    backgroundFamilies: number
    frozenHttp: number
    frozenMcp: number
    frozenCli: number
  }>
  frozenContract: Readonly<{
    sourceFile: '.planning/maturity-execution/contracts/public-surface-inventory.json'
    sha256: string
    httpRefs: readonly string[]
    mcpRefs: readonly string[]
    cliRefs: readonly string[]
  }>
  serverFunctions: readonly MeasuredProtectedSurfaceRow[]
  publicConvex: readonly MeasuredProtectedSurfaceRow[]
  convexHttpActions: readonly MeasuredProtectedSurfaceRow[]
  convexHttpRoutes: readonly MeasuredProtectedSurfaceRow[]
  crons: readonly MeasuredProtectedSurfaceRow[]
  backgroundFamilies: readonly MeasuredProtectedSurfaceRow[]
  blockedByKind: Readonly<Record<string, number>>
}>

const PUBLIC_HTTP = [
  'offering-ucp',
  'agent-skill',
  'http-signature-directory',
  'oauth-authorization-server-metadata',
  'oauth-protected-resource-metadata',
  'site-ucp',
  'business-detail',
  'business-search',
  'business-list',
  'anonymous-chat-edge',
  'developer-discovery-examples',
  'developer-discovery-schema',
  'liveness',
  'client-error-ingest',
  'readiness',
  'market-metrics',
  'api-registry',
  'release-identity',
  'service-detail',
  'service-search',
  'service-list',
  'llms-index',
  'oauth-device-authorization',
  'oauth-register',
  'oauth-token',
  'robots',
  'sitemap',
  'anonymous-chat-convex',
] as const

const INTERACTIVE_HTTP = ['oauth-authorize'] as const
const SIGNED_CALLBACK_HTTP = ['stripe-webhook'] as const
const CANONICAL_AGENT_HTTP = [
  'operation-compare',
  'operation-detail',
  'operation-inspect-plan',
  'operation-search',
  'operation-cancel',
  'operation-reconcile',
  'operation-status',
  'operation-call',
  'mcp-streamable-http',
] as const

const MCP_TOOLS = [
  'registry.search',
  'registry.detail',
  'registry.operations.search',
  'registry.operations.detail',
  'registry.operations.compare',
  'registry.operations.inspectPlan',
  'operation.execute',
  'operation.invoke',
  'operation.status',
  'operation.cancel',
  'operation.reconcile',
  'supply.publish',
  'supply.withdraw',
  'supply.earnings',
] as const

const PUBLIC_CLI = ['manifest', 'search', 'inspect', 'compare', 'inspect-plan'] as const
const INTERACTIVE_CLI = ['connect', 'fund', 'revoke'] as const
const CANONICAL_AGENT_CLI = ['call', 'status', 'cancel', 'recover'] as const

const BACKGROUND_SURFACES = [
  ['callback:stripe-money-webhook', 'callback', 'signed_callback'],
  ['callback:provider-connection-cleanup', 'callback', 'workload_account'],
  ['worker:capability-operation-run', 'worker', 'workload_account'],
  ['worker:capability-operation-recover', 'worker', 'workload_account'],
  ['worker:provider-connection-cleanup', 'worker', 'workload_account'],
  ['continuation:operation-workpool-complete', 'continuation', 'workload_account'],
  ['continuation:connection-workpool-complete', 'continuation', 'workload_account'],
  ['job:facilitator-discovery', 'job', 'workload_account'],
  ['job:market-external-refresh', 'job', 'narrow_system_non_consequential'],
  ['job:market-registry-refresh', 'job', 'narrow_system_non_consequential'],
  ['job:market-aggregate-backfill', 'job', 'narrow_system_non_consequential'],
  ['job:market-presence-refresh', 'job', 'narrow_system_non_consequential'],
  ['job:capability-supply-readiness', 'job', 'workload_account'],
  ['job:source-write-nonce-cleanup', 'job', 'narrow_system_non_consequential'],
  ['job:oauth-grant-cleanup', 'job', 'narrow_system_non_consequential'],
  ['job:supplier-settlement', 'job', 'workload_account'],
  ['reconciliation:scheduled-invocations', 'reconciliation', 'workload_account'],
  ['reconciliation:operation-http', 'reconciliation', 'canonical_agent'],
  ['reconciliation:operation-convex', 'reconciliation', 'canonical_agent'],
  ['reconciliation:owner-operation-convex', 'reconciliation', 'interactive_account'],
  ['reconciliation:charge', 'reconciliation', 'workload_account'],
  ['reconciliation:invocation-charge', 'reconciliation', 'workload_account'],
  ['reconciliation:external-spend', 'reconciliation', 'workload_account'],
  ['reconciliation:payout-transfer', 'reconciliation', 'interactive_account'],
  ['reconciliation:x402-attempt', 'reconciliation', 'workload_account'],
] as const satisfies readonly (readonly [string, ProtectedSurfaceManifestRow['kind'], SurfaceAuthorityBinding])[]

const CRON_SURFACES = [
  'cleanup expired agent access oauth grants',
  'cleanup expired source write nonces',
  'continue market aggregate backfill',
  'reconcile due facilitator invocations',
  'refresh Agentic Economy API registry',
  'refresh Agentic Market snapshots',
  'refresh capability supply readiness',
  'refresh current market presence',
  'refresh facilitator discovery',
  'run daily supplier settlement',
] as const

function rows(
  values: readonly string[],
  kind: ProtectedSurfaceManifestRow['kind'],
  binding: SurfaceAuthorityBinding,
  consequential: boolean,
): readonly ProtectedSurfaceManifestRow[] {
  return values.map((value) => Object.freeze({
    surfaceRef: `${kind}:${value}`,
    kind,
    binding,
    consequential,
  }))
}

export const PROTECTED_SURFACE_MANIFEST = Object.freeze([
  ...rows(PUBLIC_HTTP, 'http', 'public_non_consequential', false),
  ...rows(INTERACTIVE_HTTP, 'http', 'interactive_account', true),
  ...rows(SIGNED_CALLBACK_HTTP, 'http', 'signed_callback', true),
  ...rows(CANONICAL_AGENT_HTTP, 'http', 'canonical_agent', true),
  ...rows(MCP_TOOLS, 'mcp', 'canonical_agent', true),
  ...rows(PUBLIC_CLI, 'cli', 'public_non_consequential', false),
  ...rows(INTERACTIVE_CLI, 'cli', 'interactive_account', true),
  ...rows(CANONICAL_AGENT_CLI, 'cli', 'canonical_agent', true),
  ...rows(CRON_SURFACES, 'cron', 'workload_account', true),
  ...BACKGROUND_SURFACES.map(([surfaceRef, kind, binding]) => Object.freeze({
    surfaceRef,
    kind,
    binding,
    consequential: binding !== 'narrow_system_non_consequential',
  })),
])

export type ProtectedSurfaceManifest = typeof PROTECTED_SURFACE_MANIFEST

export function verifyProtectedSurfaceManifest(
  manifest: readonly ProtectedSurfaceManifestRow[] = PROTECTED_SURFACE_MANIFEST,
  measured?: MeasuredProtectedSurfaceInventory,
): Readonly<Record<ProtectedSurfaceManifestRow['kind'], number>> {
  if (manifest.length === 0 || new Set(manifest.map((row) => row.surfaceRef)).size !== manifest.length) {
    throw new Error('protected_surface_inventory_invalid')
  }
  if (manifest.some((row) => !SURFACE_AUTHORITY_BINDINGS.includes(row.binding)
    || row.surfaceRef.length === 0
    || row.surfaceRef.startsWith('internal:')
    || row.surfaceRef.includes('superuser')
    || (row.consequential && (row.binding === 'public_non_consequential'
      || row.binding === 'narrow_system_non_consequential')))) {
    throw new Error('protected_surface_binding_invalid')
  }
  const counts = Object.fromEntries(
    ['http', 'mcp', 'cli', 'server_function', 'convex_public', 'callback', 'worker', 'job', 'cron', 'continuation', 'reconciliation']
      .map((kind) => [kind, manifest.filter((row) => row.kind === kind).length]),
  ) as Record<ProtectedSurfaceManifestRow['kind'], number>
  if (counts.http !== 39 || counts.mcp !== 14 || counts.cli !== 12
    || counts.callback !== 2 || counts.worker !== 3 || counts.job !== 9 || counts.cron !== 10
    || counts.continuation !== 2 || counts.reconciliation !== 9) {
    throw new Error('protected_surface_inventory_invalid')
  }
  if (measured !== undefined) {
    const measuredRows = [...measured.serverFunctions, ...measured.publicConvex,
      ...measured.convexHttpActions, ...measured.crons, ...measured.backgroundFamilies]
    const blockedRows = measuredRows.filter((row) => row.status === 'blocked')
    if (measured.format !== 'phase-2-protected-surfaces:v2'
      || measured.expectedCounts.serverFunctions !== 43
      || measured.expectedCounts.publicConvex !== 116
      || measured.expectedCounts.convexHttpActions !== 1
      || measured.expectedCounts.crons !== 10
      || measured.expectedCounts.backgroundFamilies !== 25
      || measured.expectedCounts.frozenHttp !== 39
      || measured.expectedCounts.frozenMcp !== 14
      || measured.expectedCounts.frozenCli !== 12
      || measured.actualCounts.serverFunctions !== 43
      || measured.actualCounts.publicConvex !== 116
      || measured.actualCounts.convexHttpActions !== 1
      || measured.actualCounts.crons !== 10
      || measured.actualCounts.backgroundFamilies !== 25
      || measured.actualCounts.frozenHttp !== 39
      || measured.actualCounts.frozenMcp !== 14
      || measured.actualCounts.frozenCli !== 12
      || measured.frozenContract.sourceFile !== '.planning/maturity-execution/contracts/public-surface-inventory.json'
      || !/^[a-f0-9]{64}$/.test(measured.frozenContract.sha256)
      || measured.frozenContract.httpRefs.length !== 39
      || measured.frozenContract.mcpRefs.length !== 14
      || measured.frozenContract.cliRefs.length !== 12
      || new Set(measured.frozenContract.httpRefs).size !== 39
      || new Set(measured.frozenContract.mcpRefs).size !== 14
      || new Set(measured.frozenContract.cliRefs).size !== 12
      || measured.serverFunctions.length !== 43
      || measured.publicConvex.length !== 116
      || measured.convexHttpActions.length !== 1
      || measured.crons.length !== 10
      || measured.backgroundFamilies.length !== 25
      || new Set(measured.serverFunctions.map((row) => row.ref)).size !== measured.serverFunctions.length
      || new Set(measured.publicConvex.map((row) => row.ref)).size !== measured.publicConvex.length
      || new Set(measuredRows.map((row) => row.ref)).size !== measuredRows.length
      || blockedRows.length !== 0
      || Object.values(measured.blockedByKind).reduce((total, value) => total + value, 0) !== blockedRows.length
      || Object.entries(measured.blockedByKind).some(([kind, value]) =>
        value !== blockedRows.filter((row) => row.kind === kind).length)
      || measuredRows.some((row) => row.marker.length === 0
          || !/^[a-f0-9]{64}$/.test(row.sha256)
          || !/^[a-f0-9]{64}$/.test(row.declaration.sha256)
          || row.declaration.file !== row.file
          || row.declaration.symbol !== row.symbol
          || !Number.isInteger(row.declaration.line)
          || row.declaration.line < 1
          || !Number.isInteger(row.declaration.column)
          || row.declaration.column < 1
          || !SURFACE_AUTHORITY_BINDINGS.includes(row.binding))) {
      throw new Error('protected_surface_measured_gate_failed')
    }
    for (const row of measuredRows) {
      if (row.status === 'blocked') {
        if (row.blocker === undefined
          || row.blocker.code.length === 0
          || row.blocker.detail.length === 0
          || row.authorityPath !== undefined
          || row.authoritySink !== undefined
          || row.exemption !== undefined) {
          throw new Error('protected_surface_measured_gate_failed')
        }
        continue
      }
      if (row.status !== 'bound' || row.blocker !== undefined) {
        throw new Error('protected_surface_measured_gate_failed')
      }
      if (row.binding === 'public_non_consequential'
        || row.binding === 'narrow_system_non_consequential') {
        if (row.exemption === undefined
          || row.exemption.sourceRef !== row.ref
          || row.exemption.testFile === 'tests/maturity/phase-2-protected-surfaces.test.ts'
          || !/^tests\/.+\.test\.ts$/.test(row.exemption.testFile)
          || row.exemption.testName.length === 0
          || !/^[a-f0-9]{64}$/.test(row.exemption.sha256)
          || row.authorityPath !== undefined
          || row.authoritySink !== undefined) {
          throw new Error('protected_surface_measured_gate_failed')
        }
      } else if (row.exemption !== undefined
        || row.authoritySink === undefined
        || row.authorityPath === undefined
        || row.authorityPath.length < 2
        || row.authorityPath[0]?.ref !== row.ref
        || row.authorityPath[0]?.via !== 'declaration'
        || row.authorityPath.at(-1)?.ref !== row.authoritySink
        || row.authorityPath.slice(1).some((hop) => hop.via !== 'call'
          && hop.via !== 'function_reference')) {
        throw new Error('protected_surface_measured_gate_failed')
      }
    }
  }
  return Object.freeze(counts)
}

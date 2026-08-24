import { findAction, listOperationRouteDescriptors } from '@/modules/actions'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { OPERATION_MARKET_ACTION_ENTRIES } from '@/modules/registry/operation-entry'

export const EXPECTED_CLI_TARBALL_SHA256 =
  '109e14b023e883c72586825d8ba58d49766882dedd27d00dcb1a90158285c450' as const

export const CURRENT_OPERATION_RELEASE_THRESHOLDS = Object.freeze({
  twenty: Object.freeze({ maximumP95Milliseconds: 19.9837, maximumDatabaseQueriesExclusive: 261 }),
  twoHundredFiftySix: Object.freeze({ maximumP95Milliseconds: 215.5186, maximumDatabaseQueriesExclusive: 3329 }),
  maximumAcceptedSourceRows: 256,
  firstRefusedSourceRows: 257,
  maximumUnexplainedMismatchCount: 0,
})

type RecoveryClass = Readonly<{
  availability: 'available'
  observableTrigger: string
  action: string
}> | Readonly<{
  availability: 'not_applicable'
  reason: string
}>

export type ArchitectureWaveRollback = Readonly<{
  wave: 'wave_0' | 'wave_1' | 'wave_2' | 'wave_3' | 'wave_4'
  scope: string
  recovery: Readonly<{
    flagFlip: RecoveryClass
    codeRedeploy: RecoveryClass
    dataRepair: RecoveryClass
  }>
  providerEffectShadowExecution: false
  destructiveDownMigration: false
}>

const notApplicable = (reason: string): RecoveryClass => ({ availability: 'not_applicable', reason })
const available = (observableTrigger: string, action: string): RecoveryClass => ({
  availability: 'available',
  observableTrigger,
  action,
})

export const OPERATION_ARCHITECTURE_WAVE_ROLLBACKS: readonly ArchitectureWaveRollback[] = Object.freeze([
  {
    wave: 'wave_0',
    scope: 'verification foundation and truthful CLI package',
    recovery: {
      flagFlip: notApplicable('Verification and package-source changes have no runtime feature flag.'),
      codeRedeploy: available(
        'source gate, surface parity, external-consumer journey, or exact tarball digest fails',
        'revert the focused verification or CLI package commit; do not publish the artifact',
      ),
      dataRepair: notApplicable('Wave 0 creates no hosted data.'),
    },
    providerEffectShadowExecution: false,
    destructiveDownMigration: false,
  },
  {
    wave: 'wave_1',
    scope: 'dependency-neutral foundations',
    recovery: {
      flagFlip: notApplicable('Dependency direction is a source boundary, not a runtime choice.'),
      codeRedeploy: available(
        'declared import edge, route/action parity, or stable wire contract fails',
        'revert the single failing ownership-edge commit and redeploy the prior adapters',
      ),
      dataRepair: notApplicable('Wave 1 moves source ownership without changing durable data.'),
    },
    providerEffectShadowExecution: false,
    destructiveDownMigration: false,
  },
  {
    wave: 'wave_2',
    scope: 'canonical current Operation read model',
    recovery: {
      flagFlip: available(
        'unexplained digest/typed-outcome mismatch, elevated no-candidate/drop/capacity result, or p95/query threshold breach',
        'set capabilityCurrentOperationReadControls mode to old with a named release owner and reason',
      ),
      codeRedeploy: available(
        'stable browse/detail/compare/inspect route, action, wire, or Convex path parity fails',
        'redeploy the previous registry and capability-supply adapters while the old read path remains authoritative',
      ),
      dataRepair: available(
        'missing, stale, invalid, or orphan projection diagnostics are nonzero',
        'run the idempotent current Operation rebuild/backfill and retain additive projection rows',
      ),
    },
    providerEffectShadowExecution: false,
    destructiveDownMigration: false,
  },
  {
    wave: 'wave_3',
    scope: 'Call ownership and durable lifecycle seam',
    recovery: {
      flagFlip: notApplicable('Provider execution is never shadowed or selected by the read-path flag.'),
      codeRedeploy: available(
        'receipt/status parity fails, any duplicate effect is observed, or reconciliation-required rate grows unexpectedly',
        'redeploy the prior capability-execution adapter while retaining invocation rows, fences, receipts, and recovery state',
      ),
      dataRepair: notApplicable('Durable invocation evidence is reconciled through stable recovery paths, never rewritten by a down migration.'),
    },
    providerEffectShadowExecution: false,
    destructiveDownMigration: false,
  },
  {
    wave: 'wave_4',
    scope: 'remaining graph and stored compatibility adapters',
    recovery: {
      flagFlip: notApplicable('Compatibility and dependency seams are source adapters, not runtime variants.'),
      codeRedeploy: available(
        'module graph becomes cyclic, a runtime exception appears, or a stored compatibility read fails',
        'revert the focused adapter edge and redeploy the prior one-release compatibility facade',
      ),
      dataRepair: notApplicable('Stored compatibility values remain readable and are not destructively rewritten.'),
    },
    providerEffectShadowExecution: false,
    destructiveDownMigration: false,
  },
])

type OperationReleaseSurfaceCanary = Readonly<{
  journeyStep: 'search' | 'detail' | 'compare' | 'inspect_plan' | 'keyless_call' | 'authenticated_call' | 'status' | 'cancel' | 'reconcile'
  actionId: string
  routePath?: string
  convexFunctionPath: string
  surfaces: readonly string[]
}>

const operationConvexFunctionByActionId = Object.freeze({
  'registry.operations.search': 'capabilitySupplyOperations:search',
  'registry.operations.detail': 'capabilitySupplyOperations:detail',
  'registry.operations.compare': 'capabilitySupplyOperations:compare',
  'registry.operations.inspectPlan': 'capabilitySupplyOperations:inspectPlan',
  'operation.execute': 'capabilitySupplyOperations:readKeylessExecutable',
  'operation.invoke': 'capabilityOperationInvocations:invoke',
  'operation.status': 'capabilityOperationInvocations:readInvocationStatus',
  'operation.cancel': 'capabilityOperationInvocations:cancelInvocation',
  'operation.reconcile': 'capabilityOperationInvocations:reconcileInvocation',
} as const)

export function operationReleaseSurfaceCanaries(): readonly OperationReleaseSurfaceCanary[] {
  const browse = OPERATION_MARKET_ACTION_ENTRIES.map((entry) => ({
    journeyStep: entry.relation,
    actionId: entry.actionId,
    routePath: entry.pathTemplate,
    convexFunctionPath: operationConvexFunctionByActionId[entry.actionId as keyof typeof operationConvexFunctionByActionId],
    surfaces: entry.surfaces,
  }))
  const execute = findAction('operation.execute')
  if (execute === undefined) throw new Error('operation_release_execute_action_missing')
  const routeByActionId = new Map(listOperationRouteDescriptors().map((route) => [route.actionId, route]))
  const controlled = [
    { journeyStep: 'authenticated_call', contract: OPERATION_INVOKE_ROUTE_CONTRACT.invoke },
    { journeyStep: 'status', contract: OPERATION_INVOKE_ROUTE_CONTRACT.status },
    { journeyStep: 'cancel', contract: OPERATION_INVOKE_ROUTE_CONTRACT.cancel },
    { journeyStep: 'reconcile', contract: OPERATION_INVOKE_ROUTE_CONTRACT.reconcile },
  ] as const
  return [
    ...browse,
    {
      journeyStep: 'keyless_call',
      actionId: execute.id,
      convexFunctionPath: operationConvexFunctionByActionId['operation.execute'],
      surfaces: execute.surfaces,
    },
    ...controlled.map(({ journeyStep, contract }) => {
      const route = routeByActionId.get(contract.actionId)
      if (route === undefined) throw new Error(`operation_release_route_missing:${contract.actionId}`)
      return {
        journeyStep,
        actionId: contract.actionId,
        routePath: route.path,
        convexFunctionPath: operationConvexFunctionByActionId[contract.actionId],
        surfaces: findAction(contract.actionId)?.surfaces ?? [],
      }
    }),
  ]
}

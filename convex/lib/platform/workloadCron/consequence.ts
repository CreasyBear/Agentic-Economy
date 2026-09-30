import { getFunctionName, type FunctionReference } from 'convex/server'
import type { JsonValue } from '@/modules/capability-contract/public'
import { internal } from '../../../_generated/api'
import type { ActionCtx, MutationCtx, QueryCtx } from '../../../_generated/server'
import { reconcileWorkloadCronSnapshot } from './admission'
import { attributeInvocationResourceAccount } from './attribution'
import { CONSEQUENCE_OPERATIONS, type ConsequenceOperation } from './contracts'
import { WorkloadCronBoundaryError, type WorkloadCronActionBinding, type WorkloadCronName, type WorkloadCronSnapshot } from './context'

function declaredConsequenceOperation(reference: FunctionReference<'mutation', 'internal'>): ConsequenceOperation {
  const name = getFunctionName(reference)
  if (!CONSEQUENCE_OPERATIONS.includes(name as ConsequenceOperation)) {
    throw new WorkloadCronBoundaryError('workload_consequence_not_declared')
  }
  return name as ConsequenceOperation
}

export function bindWorkloadCronActionContext(
  ctx: ActionCtx,
  binding: WorkloadCronActionBinding,
): ActionCtx {
  const runMutation: ActionCtx['runMutation'] = async (reference, ...args) => {
    const payload = args[0] ?? {}
    return await ctx.runMutation(internal.workloadCron.dispatchConsequence, {
      name: binding.name,
      snapshot: binding.snapshot,
      ...(binding.resourceInvocationRef === undefined
        ? {}
        : { resourceInvocationRef: binding.resourceInvocationRef }),
      operation: declaredConsequenceOperation(reference as FunctionReference<'mutation', 'internal'>),
      payload,
    }) as never
  }
  return new Proxy(ctx, {
    get(target, property, receiver) {
      return property === 'runMutation'
        ? runMutation
        : Reflect.get(target, property, receiver)
    },
  })
}

type ConsequenceHandler = (
  ctx: MutationCtx,
  payload: Readonly<Record<string, JsonValue>>,
  current: WorkloadCronSnapshot,
) => Promise<JsonValue>

// Exhaustive by construction: removing an operation from CONSEQUENCE_OPERATIONS
// makes its entry here a type error, and no operation can fall through.
const CONSEQUENCE_HANDLERS: Record<ConsequenceOperation, ConsequenceHandler> = {
  'moneyTreasuryReconciliation:beginBatch': (ctx, payload) => ctx.runMutation(internal.moneyTreasuryReconciliation.beginBatch, payload as never),
  'moneyTreasuryReconciliation:finishBatch': (ctx, payload) => ctx.runMutation(internal.moneyTreasuryReconciliation.finishBatch, payload as never),
  'capabilityCallReports:claimWork': (ctx, payload) => ctx.runMutation(internal.capabilityCallReports.claimWork, payload as never),
  'capabilityCallReports:finishWork': (ctx, payload) => ctx.runMutation(internal.capabilityCallReports.finishWork, payload as never),
  'moneyPromotionalCredit:claimWork': (ctx, payload) => ctx.runMutation(internal.moneyPromotionalCredit.claimWork, payload as never),
  'moneyPromotionalCredit:finishWork': (ctx, payload) => ctx.runMutation(internal.moneyPromotionalCredit.finishWork, payload as never),
  'capabilityCalls:cancelBeforeClaim': (ctx, payload) => ctx.runMutation(internal.capabilityCalls.cancelBeforeClaim, payload as never),
  'capabilityCalls:claimAutomaticReconciliationCandidate': (ctx, payload) => ctx.runMutation(internal.capabilityCalls.claimAutomaticReconciliationCandidate, payload as never),
  'capabilityCalls:finishAutomaticReconciliation': (ctx, payload) => ctx.runMutation(internal.capabilityCalls.finishAutomaticReconciliation, payload as never),
  'capabilityCallX402AuthorizationExpiry:queueExpiredX402Authorization': (ctx, payload) => ctx.runMutation(internal.capabilityCallX402AuthorizationExpiry.queueExpiredX402Authorization, payload as never),
  'capabilitySupply:recordCapabilityProbeResult': (ctx, payload) => ctx.runMutation(internal.capabilitySupply.recordCapabilityProbeResult, payload as never),
  'facilitatorDiscovery:reconcile': (ctx, payload, current) => ctx.runMutation(internal.facilitatorDiscovery.reconcile, { ...payload, workload: current } as never),
  'moneyTreasury:recordObservation': async (ctx, payload): Promise<JsonValue> => {
    const result = await ctx.runMutation(internal.moneyTreasury.recordObservation, payload as never)
    if (result.kind === 'accepted') {
      return { kind: result.kind, replayed: result.replayed, observationRef: result.observationRef }
    }
    return { kind: result.kind, code: result.code, retryable: result.retryable }
  },
  'moneyX402PaymentAttempts:reconcileX402PaymentAttempt': (ctx, payload) => ctx.runMutation(internal.moneyX402PaymentAttempts.reconcileX402PaymentAttempt, payload as never),
}

export async function dispatchWorkloadCronConsequenceHandler(
  ctx: MutationCtx,
  args: Readonly<{
    name: WorkloadCronName
    snapshot: WorkloadCronSnapshot
    resourceInvocationRef?: string
    operation: ConsequenceOperation
    payload: Readonly<Record<string, JsonValue>>
  }>,
): Promise<JsonValue> {
  const current = await reconcileWorkloadCronSnapshot(ctx as Pick<QueryCtx, 'db'>, args.name, args.snapshot)
  if (args.resourceInvocationRef !== undefined) {
    await attributeInvocationResourceAccount(ctx, current, args.resourceInvocationRef, args.operation, args.payload)
  }
  return await CONSEQUENCE_HANDLERS[args.operation](ctx, args.payload, current)
}

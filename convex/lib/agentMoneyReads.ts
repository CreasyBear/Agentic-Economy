import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v, type Infer } from 'convex/values'

import type { MutationCtx } from '../_generated/server'
import {
  agentAccessPrincipalValue,
  verifyMarketAgentPrincipal,
} from '../agentAccessPrincipals'
import { exactAmount } from '../moneyLedgerValues'
import { requireSourceWrite, sourceWriteArgs } from '../sourceWriteAdmission'

const agentMoneyRequestFields = {
  agentPrincipal: agentAccessPrincipalValue,
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
} as const

const balanceArgsValue = v.object({
  currency: v.literal('AUD'),
  ...agentMoneyRequestFields,
})
export const agentBalanceArgs = balanceArgsValue.fields

export const agentBalanceResult = v.union(
  v.object({
    kind: v.literal('available'),
    principalRef: v.string(),
    accountRef: v.string(),
    balance: exactAmount,
    accountState: v.union(v.literal('active'), v.literal('locked')),
    version: v.number(),
    updatedAt: v.number(),
    funding: v.object({
      kind: v.literal('agent_funding_handoff'),
      configAction: v.literal('funding.handoff.config'),
      createAction: v.literal('funding.handoff.create'),
      statusAction: v.literal('funding.handoff.status'),
    }),
  }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
  v.object({ kind: v.literal('error'), code: v.literal('source_unavailable') }),
)

export const agentBalanceAdmissionResult = v.union(
  v.object({ kind: v.literal('allowed'), principalRef: v.string(), accountRef: v.string() }),
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
)

const activityValue = v.object({
  callRef: v.string(),
  credentialRef: v.string(),
  operationRef: v.string(),
  providerRef: v.string(),
  state: v.union(v.literal('completed'), v.literal('refused'), v.literal('outcome_unknown')),
  deliveryState: v.union(v.literal('delivered'), v.literal('not_delivered'), v.literal('unknown')),
  paymentState: v.union(v.literal('settled'), v.literal('released'), v.literal('unknown'), v.literal('not_applicable')),
  audAmountUnits: v.optional(v.string()),
  receiptRef: v.optional(v.string()),
  recoveryRef: v.optional(v.string()),
  observedAt: v.number(),
})

const activityArgsValue = v.object({
  currency: v.literal('AUD'),
  paginationOpts: paginationOptsValidator,
  ...agentMoneyRequestFields,
})
export const agentActivityArgs = activityArgsValue.fields

export const agentActivityResult = v.union(
  v.object({ kind: v.literal('available'), activity: paginationResultValidator(activityValue) }),
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
  v.object({ kind: v.literal('error'), code: v.literal('source_unavailable') }),
)

type AgentMoneyRequest = Readonly<{
  agentPrincipal: Infer<typeof agentAccessPrincipalValue>
  operationKey: string
  correlationId: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}>

async function admitAgentMoneyRead(
  ctx: MutationCtx,
  args: AgentMoneyRequest,
): Promise<Awaited<ReturnType<typeof verifyMarketAgentPrincipal>> | null> {
  const source = await requireSourceWrite(ctx, args, 'billing')
  if (source.kind === 'rejected') return null
  return await verifyMarketAgentPrincipal(ctx, args.agentPrincipal)
}

export async function prepareAgentBalanceHandler(
  ctx: MutationCtx,
  args: Infer<typeof balanceArgsValue>,
): Promise<Infer<typeof agentBalanceAdmissionResult>> {
  const admission = await admitAgentMoneyRead(ctx, args)
  if (admission?.kind !== 'allowed') return { kind: 'error', code: 'unauthenticated' }
  return {
    kind: 'allowed',
    principalRef: admission.principalId,
    accountRef: admission.ownerId,
  }
}

export async function listAgentActivityHandler(
  ctx: MutationCtx,
  args: Infer<typeof activityArgsValue>,
): Promise<Infer<typeof agentActivityResult>> {
  const admission = await admitAgentMoneyRead(ctx, args)
  if (admission?.kind !== 'allowed') return { kind: 'error', code: 'unauthenticated' }
  if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 100) {
    return { kind: 'error', code: 'source_unavailable' }
  }
  const page = await ctx.db.query('capabilityOperationCallProjections')
    .withIndex('by_accountRef_and_principalRef_and_createdAt', (query) => query
      .eq('accountRef', admission.ownerId)
      .eq('principalRef', admission.principalId))
    .order('desc')
    .paginate(args.paginationOpts)
  return {
    kind: 'available',
    activity: {
      ...page,
      page: page.page.map((row) => ({
        callRef: row.callRef,
        credentialRef: row.credentialRef,
        operationRef: row.operationRef,
        providerRef: row.providerRef,
        state: row.state,
        deliveryState: row.deliveryState,
        paymentState: row.paymentState,
        ...(row.audAmountUnits === undefined ? {} : { audAmountUnits: row.audAmountUnits }),
        ...(row.receiptRef === undefined ? {} : { receiptRef: row.receiptRef }),
        ...(row.recoveryRef === undefined ? {} : { recoveryRef: row.recoveryRef }),
        observedAt: row.updatedAt,
      })),
    },
  }
}

import { v, type Infer } from 'convex/values'

import {
  prepareActionPreparation as prepareActionPreparationMachine,
  resumeActionPreparation as resumeActionPreparationMachine,
} from '@/modules/customer-request/v2-preparation'
import {
  durableActionPreparationV2Value,
} from '@/modules/customer-request/runtime'

import { internalMutation, internalQuery } from './_generated/server'
import { customerRequestV2PreparationPorts } from './customerRequestV2PreparationPorts'

const approvalActorValue = v.object({
  kind: v.literal('clerk_owner'), requestPrincipalId: v.string(), ownerId: v.string(), credentialId: v.string(),
  authenticationEvidenceRef: v.string(), approvedAt: v.number(),
})
const prepareResultValue = v.union(
  v.object({ kind: v.literal('stored'), preparation: durableActionPreparationV2Value }),
  v.object({ kind: v.literal('replayed'), preparation: durableActionPreparationV2Value }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(v.literal('revision_changed'), v.literal('idempotency_key_reused')),
  }),
  v.object({
    kind: v.literal('needs_attention'),
    reason: v.union(
      v.literal('capability_graph_changed'), v.literal('historical_request_resubmit_required'),
      v.literal('preparation_recipient_unsupported'),
    ),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('request_not_found'), v.literal('action_not_found'), v.literal('request_not_ready'),
      v.literal('authority_reference_invalid'), v.literal('authority_invalid'),
    ),
  }),
)
const resumeResultValue = v.union(
  v.object({ kind: v.literal('current'), preparation: durableActionPreparationV2Value }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('stale') }),
)

export const prepare = internalMutation({
  args: {
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(),
    requestId: v.string(), expectedRevision: v.number(), actionId: v.string(),
    preparationRef: v.optional(v.string()), approvalActor: v.optional(approvalActorValue), now: v.number(),
  },
  returns: prepareResultValue,
  handler: async (ctx, args): Promise<Infer<typeof prepareResultValue>> => (
    await prepareActionPreparationMachine(
      args as unknown as Parameters<typeof prepareActionPreparationMachine>[0],
      customerRequestV2PreparationPorts(ctx),
    ) as Infer<typeof prepareResultValue>
  ),
})

export const resume = internalQuery({
  args: { requestId: v.string(), requestRevision: v.number(), actionId: v.string(), principalId: v.string() },
  returns: resumeResultValue,
  handler: async (ctx, args): Promise<Infer<typeof resumeResultValue>> => (
    await resumeActionPreparationMachine(
      args as unknown as Parameters<typeof resumeActionPreparationMachine>[0],
      customerRequestV2PreparationPorts(ctx),
    ) as Infer<typeof resumeResultValue>
  ),
})

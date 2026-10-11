import { vStreamArgs } from '@convex-dev/agent'
import { vStreamDelta, vStreamMessage } from '@convex-dev/agent/validators'
import { v } from 'convex/values'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'

const workStateValue = v.union(
  v.literal('submitted'), v.literal('working'), v.literal('input-required'),
  v.literal('auth-required'), v.literal('completed'), v.literal('failed'),
  v.literal('canceled'), v.literal('rejected'),
)
const keyPrincipalValue = v.object({
  kind: v.literal('agent_key'), principalId: v.string(), ownerId: v.string(),
  credentialId: v.string(), applicationRef: v.string(),
  environment: v.union(v.literal('sandbox'), v.literal('production')),
  scopes: v.array(v.string()),
  authorityMode: v.union(
    v.literal('read_only'), v.literal('approval_required'),
    v.literal('spending_policy'), v.literal('unrestricted_test_only'),
  ),
})
const turnPrincipalValue = v.union(v.object({ kind: v.literal('clerk') }), keyPrincipalValue)
const proofArgs = {
  operationKey: v.optional(v.string()), correlationId: v.optional(v.string()), ...sourceWriteArgs,
}
const turnFailureReasonValue = v.union(
  v.literal('generation_failed'), v.literal('generation_timed_out'), v.literal('outcome_unknown'),
)
const turnReadArgs = { principal: turnPrincipalValue, turnRef: v.string(), ...proofArgs }
const turnSnapshotValue = v.object({
  threadId: v.string(), turnRef: v.string(), promptMessageId: v.string(),
  state: workStateValue, sequence: v.number(), deadlineAt: v.optional(v.number()),
  cancelRequestedAt: v.optional(v.number()),
  failureReason: v.optional(turnFailureReasonValue), failureCallRefs: v.optional(v.array(v.string())),
  callRefs: v.array(v.string()), inFlightCallRefs: v.array(v.string()),
})
const startValue = v.object({
  threadId: v.string(), turnRef: v.string(), promptMessageId: v.string(),
  state: workStateValue, sequence: v.number(), deadlineAt: v.optional(v.number()),
})
export const trustedChatAuthorityValue = v.object({
  kind: v.literal('agent_key'), turnRef: v.string(), credentialLocator: v.string(),
  applicationRef: v.string(), environment: v.union(v.literal('sandbox'), v.literal('production')),
  scopes: v.array(v.string()), grantRef: v.string(),
})

export const ownerChatGrantStatusArgs = {}
export const ownerChatGrantStatusResult = v.object({ enabled: v.boolean() })

export const searchContinuationValue = v.object({
  kind: v.literal('search_next_page'), query: v.string(), cursor: v.string(),
})

export const startTurnArgs = {
    principal: turnPrincipalValue, threadId: v.optional(v.string()),
    prompt: v.string(), clientTurnId: v.string(),
    continuation: v.optional(searchContinuationValue), ...proofArgs,
  }
export const startTurnResult = v.union(
  startValue,
  // Thread still answering: expected state, returned as data so it is never an exception.
  v.object({ kind: v.literal('not_started'), code: v.literal('turn_fenced') }),
)

export const cancelTurnArgs = turnReadArgs
export const cancelTurnResult = v.union(
    v.object({ kind: v.literal('stopped'), turnRef: v.string(),
      inFlightEffects: v.array(v.object({ callRef: v.string() })) }),
    v.object({ kind: v.literal('in_flight'), turnRef: v.string(),
      inFlightEffects: v.array(v.object({ callRef: v.string() })) }),
  )

export const readTurnArgs = turnReadArgs
export const readTurnResult = turnSnapshotValue

export const readDeltasArgs = { ...turnReadArgs, streamArgs: vStreamArgs }

export const readDeltasResult = v.object({
  turnRef: v.string(), sequence: v.number(), state: workStateValue,
  deadlineAt: v.optional(v.number()),
  failureReason: v.optional(turnFailureReasonValue), failureCallRefs: v.optional(v.array(v.string())),
  streams: v.union(
    v.object({ kind: v.literal('list'), messages: v.array(vStreamMessage) }),
    v.object({ kind: v.literal('deltas'), deltas: v.array(vStreamDelta) }),
  ),
})

export const authorizeKeyGenerationArgs = { turnRef: v.string(), threadId: v.string(), promptMessageId: v.string() }
export const authorizeKeyGenerationResult = v.union(v.object({ ownerId: v.string(), authority: trustedChatAuthorityValue }), v.null())

export const recordOwnerChatCallArgs = { authority: trustedChatAuthorityValue, quoteRef: v.string(), callRef: v.string() }
export const recordOwnerChatCallResult = v.boolean()

export const authorizePayableToolArgs = { authority: trustedChatAuthorityValue, toolRef: v.optional(v.string()) }
export const authorizePayableToolResult = v.boolean()

export const finishTurnArgs = { turnRef: v.string(), promptMessageId: v.string(),
  state: v.union(v.literal('working'), v.literal('input-required'), v.literal('auth-required'),
    v.literal('completed'), v.literal('failed'), v.literal('rejected')),
  failureReason: v.optional(turnFailureReasonValue),
  expectedDeadlineAt: v.optional(v.number()),
}
export const finishTurnResult = v.boolean()

export const issueSearchContinuationArgs = {
  turnRef: v.string(), threadId: v.string(), promptMessageId: v.string(),
  query: v.string(), cursor: v.string(), inputJson: v.string(),
}
export const issueSearchContinuationResult = v.string()
export const readSearchContinuationArgs = {
  turnRef: v.string(), threadId: v.string(), promptMessageId: v.string(),
}
export const readSearchContinuationResult = v.union(
  v.object({ query: v.string(), cursor: v.string(), inputJson: v.string() }), v.null(),
)


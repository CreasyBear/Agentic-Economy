import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

const operatorControlKey = v.union(
  v.literal('claims_enabled'),
  v.literal('publish_enabled'),
  v.literal('registry_enabled'),
  v.literal('discovery_enabled'),
  v.literal('public_copy_safe_mode')
)

export const setOperatorControl = mutationGeneric({
  args: {
    key: operatorControlKey,
    enabled: v.boolean(),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    expiresAt: v.optional(v.number()),
    csrfToken: v.optional(v.string()),
    csrfCookie: v.optional(v.string()),
    origin: v.optional(v.string()),
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: v.object({
    kind: v.literal('error'),
    code: v.literal('operator_control_admin_denied'),
    retryable: v.boolean(),
    reason: v.string(),
  }),
  handler: async () => ({
    kind: 'error' as const,
    code: 'operator_control_admin_denied' as const,
    retryable: false,
    reason: 'Operator controls require source-owned owner_admin authority in the deployment boundary.',
  }),
})

export const readOperatorControls = queryGeneric({
  args: {},
  returns: v.object({
    kind: v.literal('denied'),
    reason: v.literal('missing_membership'),
    controls: v.array(
      v.object({
        key: operatorControlKey,
        configuredEnabled: v.boolean(),
        effectiveEnabled: v.boolean(),
        expired: v.boolean(),
        source: v.union(v.literal('default'), v.literal('source_owned')),
        updatedAt: v.number(),
      })
    ),
  }),
  handler: async () => ({
    kind: 'denied' as const,
    reason: 'missing_membership' as const,
    controls: [],
  }),
})

export type {
  AuditEventContract,
  FunnelEventType,
  OperationKeyRecord,
  OperatorControlKey,
  OperatorControlReadback,
  OperatorControlRecord,
  OperatorControlSourceState,
  OwnerActivationState,
  SetOperatorControlCommand,
  SetOperatorControlResult,
} from '../src/modules/observability/public'

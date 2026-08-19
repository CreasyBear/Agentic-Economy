import type { GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server'
import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import type { DataModel, Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'

import { admissionKey, assertAdmission } from './lib/rateLimit'

import { readCurrentActiveAdminMembership as readCurrentActiveMembership } from './authz'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { brandNonEmpty } from '../src/modules/common/ids'
import {
  ActivationStageValues,
  OperatorControlKeyValues,
  parseOwnerActivationStateRow,
  readOperatorControls as readOperatorControlsModule,
  recordFunnelEvent,
  setOperatorControl as setOperatorControlModule,
  type FunnelEventPersistenceRow,
  type RecordFunnelEventInput,
  type AuditEventContract,
  type OwnerActivationState,
  type OperatorControlReadback,
  type OperatorControlRecord,
  type OperatorControlSourceState,
  type SetOperatorControlResult,
} from '../src/modules/observability/public'
import {
  recordAdminActionDenied,
  requireAdminAuthority,
} from '../src/modules/security/public'
import type {
  AdminDecisionAudit,
  AdminMembership,
} from '../src/modules/security/public'

export const OPERATOR_CONTROL_KEY_COUNT = OperatorControlKeyValues.length

const operatorControlKey = v.union(
  v.literal('claims_enabled'),
  v.literal('publish_enabled'),
  v.literal('registry_enabled'),
  v.literal('discovery_enabled'),
  v.literal('public_copy_safe_mode'),
  v.literal('inquiries_enabled'),
  v.literal('inquiry_owner_replies_enabled'),
  v.literal('notification_dispatch_enabled'),
  v.literal('notification_webhooks_enabled'),
  v.literal('developer_discovery_publish_enabled'),
  v.literal('discovery_api_keys_enabled'),
  v.literal('protected_actions_enabled'),
  v.literal('protected_action_attempts_enabled'),
  v.literal('paid_activation_enabled'),
  v.literal('billing_webhooks_enabled'),
  v.literal('billing_reconciliation_enabled'),
  v.literal('business_actions_enabled'),
  v.literal('business_action_attempts_enabled'),
  v.literal('offering_authoring_enabled'),
  v.literal('offering_public_projection_enabled')
)

const operatorControlReadback = v.object({
  key: operatorControlKey,
  configuredEnabled: v.boolean(),
  effectiveEnabled: v.boolean(),
  expired: v.boolean(),
  expiresAt: v.optional(v.number()),
  source: v.union(v.literal('default'), v.literal('source_owned')),
  reasonCode: v.optional(v.string()),
  changedByAdminRef: v.optional(v.string()),
  correlationId: v.optional(v.string()),
  updatedAt: v.number(),
})

const operatorAuditSummary = v.object({
  eventType: v.union(v.literal('operator_control.changed'), v.literal('admin.action_denied')),
  actorRef: v.string(),
  targetRef: v.string(),
  beforeState: v.optional(v.string()),
  afterState: v.optional(v.string()),
  reasonCode: v.optional(v.string()),
})

const membershipAuditSummary = v.object({
  eventType: v.literal('action_denied'),
  actorRef: v.string(),
  targetRef: v.string(),
  reasonCode: v.string(),
})

const operatorControlRecord = v.object({
  key: operatorControlKey,
  enabled: v.boolean(),
  changedByAdminRef: v.string(),
  reasonCode: v.string(),
  evidenceRefs: v.array(v.string()),
  correlationId: v.string(),
  operationKey: v.string(),
  expiresAt: v.optional(v.number()),
  updatedAt: v.number(),
})

const setOperatorControlResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.union(v.literal('operator_control_changed'), v.literal('operator_control_replayed')),
    control: operatorControlRecord,
    readback: operatorControlReadback,
    auditEvent: operatorAuditSummary,
  }),
  v.object({
    kind: v.literal('error'),
    code: v.union(
      v.literal('operator_control_csrf_rejected'),
      v.literal('operator_control_admin_denied'),
      v.literal('operator_control_invalid_reason'),
      v.literal('operator_control_missing_evidence'),
      v.literal('operator_control_invalid_expiry')
    ),
    retryable: v.boolean(),
    reason: v.string(),
    auditEvent: v.optional(operatorAuditSummary),
    membershipAuditEvent: v.optional(membershipAuditSummary),
  })
)

const readOperatorControlsResult = v.union(
  v.object({
    kind: v.literal('allowed'),
    controls: v.array(operatorControlReadback),
  }),
  v.object({
    kind: v.literal('denied'),
    reason: v.union(
      v.literal('missing_membership'),
      v.literal('inactive_membership'),
      v.literal('action_not_allowed')
    ),
    controls: v.array(operatorControlReadback),
  })
)

const funnelEventType = v.union(
  v.literal('visitor_attributed'),
  v.literal('claim_cta_clicked'),
  v.literal('claim_started'),
  v.literal('auth_started'),
  v.literal('auth_completed'),
  v.literal('owner_interest_submitted'),
  v.literal('claim_submitted'),
  v.literal('slug_conflict'),
  v.literal('duplicate_suspected'),
  v.literal('publish_succeeded'),
  v.literal('service_added'),
  v.literal('capability_status_viewed'),
  v.literal('publish_failed'),
  v.literal('owner_status_viewed'),
  v.literal('share_url_copied'),
  v.literal('registry_search'),
  v.literal('service_registry_result_clicked'),
  v.literal('ucp_manifest_fetched'),
  v.literal('dispute_opened'),
  v.literal('suppression_applied'),
  v.literal('inquiry_available_seen'),
  v.literal('inquiry_started'),
  v.literal('inquiry_submitted'),
  v.literal('inquiry_rejected'),
  v.literal('owner_inbox_viewed'),
  v.literal('owner_inquiry_read'),
  v.literal('owner_inquiry_replied'),
  v.literal('inquiry_closed'),
  v.literal('notification_queued'),
  v.literal('notification_delivered'),
  v.literal('notification_failed'),
  v.literal('developer_docs_viewed'),
  v.literal('schema_downloaded'),
  v.literal('example_fixture_downloaded'),
  v.literal('discovery_health_viewed'),
  v.literal('protected_action_proposed'),
  v.literal('protected_action_policy_denied'),
  v.literal('protected_action_approved'),
  v.literal('protected_action_rejected'),
  v.literal('protected_action_attempted'),
  v.literal('protected_action_receipt_viewed'),
  v.literal('paid_activation_started'),
  v.literal('checkout_returned'),
  v.literal('checkout_cancelled'),
  v.literal('billing_provider_event_ingested'),
  v.literal('receipt_viewed'),
  v.literal('refund_or_dispute_recorded'),
  v.literal('billing_reconciliation_failed'),
  v.literal('billing_reconciliation_repaired'),
  v.literal('business_action_card_viewed'),
  v.literal('business_action_request_started'),
  v.literal('business_action_checkpoint_recorded'),
  v.literal('business_action_guardrail_allowed'),
  v.literal('business_action_guardrail_blocked'),
  v.literal('business_action_evidence_ingested'),
  v.literal('business_action_receipt_viewed'),
  v.literal('business_action_proof_gap_recorded')
)

const activationStage = v.union(
  v.literal('visitor'),
  v.literal('claim_started'),
  v.literal('published'),
  v.literal('activated'),
  v.literal('blocked')
)

const ownerActivationSummaryRow = v.object({
  stage: v.string(),
  count: v.number(),
})


export const setOperatorControl = mutationGeneric({
  args: {
    key: operatorControlKey,
    enabled: v.boolean(),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    expiresAt: v.optional(v.number()),
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: setOperatorControlResult,
  handler: async () => ({ kind: 'error' as const, code: 'operator_control_admin_denied' as const, retryable: false, reason: 'Operator controls are retired.' }),
})

export const readOperatorControls = queryGeneric({
  args: {},
  returns: readOperatorControlsResult,
  handler: async () => ({ kind: 'denied' as const, reason: 'missing_membership' as const, controls: [] }),
})

export const recordOwnerActivationEvent = mutationGeneric({
  args: {
    eventType: funnelEventType,
    source: v.string(),
    stage: activationStage,
    pseudonymousSessionId: v.string(),
    correlationId: v.string(),
    consentFlag: v.boolean(),
    referrer: v.optional(v.string()),
    utmSource: v.optional(v.string()),
    utmCampaign: v.optional(v.string()),
    actorRef: v.optional(v.string()),
    businessId: v.optional(v.string()),
    claimId: v.optional(v.string()),
    payload: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null()))),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async () => ({ ok: true as const }),
})

async function readOwnerActivationByBusiness(
  _db: GenericDatabaseReader<DataModel>,
  _businessId: OwnerActivationState['businessId']
): Promise<Map<string, OwnerActivationState>> { return new Map() }


async function upsertFunnelEventRow(
  _db: GenericDatabaseWriter<DataModel>,
  _event: FunnelEventPersistenceRow,
): Promise<void> { return }


async function readFirstFunnelEventByCorrelationId(
  _db: GenericDatabaseReader<DataModel>,
  _correlationId: FunnelEventPersistenceRow['correlationId'],
): Promise<Record<string, unknown> | null> { return null }


async function upsertOwnerActivationStateRow(
  _ctx: MutationCtx,
  _state: OwnerActivationState,
): Promise<void> { return }

export const readAdminOwnerActivationSummary = queryGeneric({
  args: {},
  returns: v.object({
    byStage: v.array(ownerActivationSummaryRow),
    totalTracked: v.number(),
  }),
  handler: async () => ({ byStage: [], totalTracked: 0 }),
})

export type {
  AuditEventContract,
  OperatorControlKey,
  OperatorControlReadback,
  OperatorControlRecord,
  OperatorControlSourceState,
  SetOperatorControlCommand,
  SetOperatorControlResult,
} from '../src/modules/observability/public'

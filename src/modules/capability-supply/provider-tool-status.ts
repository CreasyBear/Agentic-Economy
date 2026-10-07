import { z } from 'zod'

export const providerToolMaintenanceIdentitySchema = z.strictObject({
  businessId: z.string().trim().min(1),
  offeringRef: z.string().trim().min(1),
  offeringRevision: z.number().int().positive(),
  offeringSourceHash: z.string().trim().min(1),
  publicationRef: z.string().trim().min(1),
  publicationRevision: z.number().int().positive(),
})
export type ProviderToolMaintenanceIdentity = z.infer<typeof providerToolMaintenanceIdentitySchema>

export type ProviderToolState =
  | 'Draft'
  | 'Needs setup'
  | 'Submitted'
  | 'Under review'
  | 'Published'
  | 'Paused'
  | 'Action required'
  | 'Retired'

export const providerToolStatusInputSchema = z.strictObject({
  businessRef: z.string().trim().min(1),
  toolRef: z.string().trim().min(1),
})
export const providerToolOffboardingStatusInputSchema = z.strictObject({
  businessRef: z.string().trim().min(1),
})

// Maintenance keeps the exact durable identity. The caller must supply and retain
// one idempotency key before invoking a write; status never invents a retry key.
export const providerToolContinuationSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('supply.source.preview'),
    args: z.strictObject({ kind: z.literal('x402') }),
    requiredInput: z.tuple([z.literal('resourceUrl')]),
  }),
  z.strictObject({ action: z.literal('supply.status'), args: providerToolStatusInputSchema }),
  z.strictObject({
    action: z.literal('supply.recheck'),
    args: providerToolMaintenanceIdentitySchema,
    requiredInput: z.tuple([z.literal('idempotencyKey')]),
  }),
  z.strictObject({
    action: z.literal('supply.republish'),
    args: providerToolMaintenanceIdentitySchema,
    requiredInput: z.tuple([z.literal('idempotencyKey')]),
  }),
  z.strictObject({ action: z.literal('supply.offboarding.status'), args: providerToolOffboardingStatusInputSchema }),
])
export type ProviderToolContinuation = z.infer<typeof providerToolContinuationSchema>

export type ProviderToolOwnerHandoff = Readonly<{
  actor: 'business_owner'
  reason: 'credential_lost' | 'credential_cleanup_pending'
  destination: string
  ctaLabel: string
  description: string
  title: string
}>

export type ProviderToolStatusFacts = Readonly<{
  schemaVersion: 'provider_tools:v1'
  businessRef: string
  providerRef: string
  toolRef: string
  revision?: number | undefined
  maintenance?: ProviderToolMaintenanceIdentity | undefined
  observedAt: number
  validUntil?: number | undefined
  draftPresent: boolean
  setupComplete: boolean
  submitted: boolean
  reviewActive: boolean
  routeable: boolean
  paused: boolean
  retired: boolean
  retirementProven: boolean
  blockerCodes: readonly string[]
  source?: ProviderToolStatus['source']
  routeability?: ProviderToolStatus['routeability']
  authority?: ProviderToolStatus['authority']
  health?: ProviderToolStatus['health']
}>

export type ProviderToolStatus = Readonly<{
  schemaVersion: 'provider_tools:v1'
  businessRef: string
  providerRef: string
  toolRef: string
  revision?: number | undefined
  maintenance?: ProviderToolMaintenanceIdentity | undefined
  state: ProviderToolState
  reasonCodes: readonly string[]
  observedAt: number
  validUntil?: number | undefined
  source: Readonly<{
    kind: 'openapi' | 'mcp' | 'agent_plugin' | 'x402' | 'legacy' | 'unavailable'
    revision?: string | undefined
    digest?: string | undefined
  }>
  routeability: Readonly<{ available: boolean; reasonCodes: readonly string[] }>
  authority: Readonly<{
    kind: 'public' | 'connection' | 'unverified' | 'unavailable'
    connectionRef?: string | undefined
    providerRef?: string | undefined
  }>
  health: Readonly<{
    connection: 'not_required' | 'connected' | 'action_required' | 'unknown'
    validation: 'not_started' | 'in_progress' | 'passed' | 'failed'
    publication: 'not_published' | 'published' | 'paused' | 'removed'
    freshness: 'unobserved' | 'current' | 'stale' | 'failed'
    delivery:
      | Readonly<{ kind: 'unobserved'; provenance: 'canonical_call_receipts' }>
      | Readonly<{ kind: 'unavailable'; reason: 'window_too_large'; provenance: 'canonical_call_receipts' }>
      | Readonly<{
          kind: 'observed'
          deliveredCount: number
          notDeliveredCount: number
          unknownCount: number
          sampleSize: number
          lastObservedAt: number
          windowStartAt: number
          windowEndAt: number
          provenance: 'canonical_call_receipts'
        }>
    usefulOutcome:
      | Readonly<{ kind: 'unobserved'; provenance: 'qualified_use_receipts' }>
      | Readonly<{ kind: 'unavailable'; reason: 'window_too_large'; provenance: 'qualified_use_receipts' }>
      | Readonly<{
          kind: 'observed'
          qualifiedUseCount: number
          lastObservedAt: number
          windowStartAt: number
          windowEndAt: number
          provenance: 'qualified_use_receipts'
        }>
    operationalConditions: readonly string[]
  }>
  continuation?: ProviderToolContinuation | undefined
  ownerHandoff?: ProviderToolOwnerHandoff | undefined
}>

export type ProviderToolReasonPresentation = Readonly<{
  title: string
  description: string
}>

const reasonPresentations: Readonly<Record<string, ProviderToolReasonPresentation>> = {
  maintenance_identity_unavailable: {
    title: 'Publication identity unavailable',
    description: 'AE cannot confirm the exact current publication identity for this action. Resolve the owner records before rechecking or republishing.',
  },
  source_preview_unavailable: {
    title: 'Source preview unavailable',
    description: 'The current preview action supports x402 sources. This saved source cannot be resumed through that action.',
  },
  source_drift: {
    title: 'Source changed',
    description: 'The source no longer matches the submitted Tool. Recheck it before publication can continue.',
  },
  credential_lost: {
    title: 'Connection unavailable',
    description: 'The source connection is no longer available. Reconnect it before publication can continue.',
  },
  credential_cleanup_pending: {
    title: 'Connection cleanup pending',
    description: 'AE has removed local authority and is still confirming cleanup with the source.',
  },
  provider_authority_unverified: {
    title: 'Provider authority under review',
    description: 'AE is still verifying that this Business controls the source. Check the current status before taking another action.',
  },
  provider_offboarding: {
    title: 'Provider offboarding in progress',
    description: 'This Business is leaving AE. New work remains frozen while obligations and connections are closed.',
  },
  health_unobserved: {
    title: 'Validation pending',
    description: 'AE has not yet completed a successful source validation.',
  },
  health_stale: {
    title: 'Validation expired',
    description: 'The last successful source validation is no longer current.',
  },
  health_unhealthy: {
    title: 'Validation failed',
    description: 'The latest source validation did not pass.',
  },
}

export function providerToolReasonPresentation(
  code: string,
): ProviderToolReasonPresentation {
  return reasonPresentations[code] ?? {
    title: 'Tool needs attention',
    description: 'AE cannot confirm the current publication requirements. Check the current status before taking another action.',
  }
}

const PENDING_REVIEW_BLOCKERS = new Set([
  'health_unobserved',
  'provider_authority_unverified',
])

const REVIEW_INTERRUPTING_BLOCKERS = new Set([
  'source_drift',
  'credential_lost',
  'credential_cleanup_pending',
  'provider_offboarding',
])

function hasActionableBlocker(facts: ProviderToolStatusFacts): boolean {
  return facts.blockerCodes.some((code) => !PENDING_REVIEW_BLOCKERS.has(code))
}

function stateFor(facts: ProviderToolStatusFacts): ProviderToolState {
  if (facts.retired && facts.retirementProven) return 'Retired'
  const waitingForReview = (
    facts.reviewActive
    && !facts.blockerCodes.some((code) => REVIEW_INTERRUPTING_BLOCKERS.has(code))
  ) || (facts.submitted && !hasActionableBlocker(facts))
  if ((facts.blockerCodes.length > 0 && !waitingForReview) || (facts.retired && !facts.retirementProven)) {
    return 'Action required'
  }
  if (facts.paused) return 'Paused'
  if (facts.routeable) return 'Published'
  if (facts.reviewActive) return 'Under review'
  if (facts.submitted) return 'Submitted'
  if (!facts.setupComplete) return 'Needs setup'
  return 'Draft'
}

function maintenanceActionFor(
  facts: ProviderToolStatusFacts,
  state: ProviderToolState,
): 'supply.recheck' | 'supply.republish' | undefined {
  if (facts.retired || state === 'Submitted' || state === 'Under review') return undefined
  if (state === 'Paused') return 'supply.republish'
  if (facts.blockerCodes.some((code) => (
    code === 'source_drift'
    || code === 'health_unobserved'
    || code === 'health_stale'
    || code === 'health_unhealthy'
  ))) return 'supply.recheck'
  return undefined
}

function sourcePreviewSupported(facts: ProviderToolStatusFacts): boolean {
  return facts.source === undefined || facts.source.kind === 'unavailable' || facts.source.kind === 'x402'
}

function continuationFor(
  facts: ProviderToolStatusFacts,
  state: ProviderToolState,
): ProviderToolContinuation | undefined {
  if (facts.retired && !facts.retirementProven) {
    return { action: 'supply.offboarding.status', args: { businessRef: facts.businessRef } }
  }
  if (state === 'Needs setup' || state === 'Draft') {
    return sourcePreviewSupported(facts)
      ? { action: 'supply.source.preview', args: { kind: 'x402' }, requiredInput: ['resourceUrl'] }
      : undefined
  }
  const maintenanceAction = maintenanceActionFor(facts, state)
  if (maintenanceAction !== undefined) {
    const maintenance = providerToolMaintenanceIdentitySchema.safeParse(facts.maintenance)
    return maintenance.success
      ? { action: maintenanceAction, args: maintenance.data, requiredInput: ['idempotencyKey'] }
      : undefined
  }
  if (state === 'Submitted' || state === 'Under review' || facts.blockerCodes.length > 0) {
    return { action: 'supply.status', args: { businessRef: facts.businessRef, toolRef: facts.toolRef } }
  }
  return undefined
}

function ownerHandoffFor(
  facts: ProviderToolStatusFacts,
): ProviderToolOwnerHandoff | undefined {
  if (facts.blockerCodes.includes('credential_cleanup_pending')) {
    return {
      actor: 'business_owner',
      reason: 'credential_cleanup_pending',
      destination: '/owner/settings/integrations#provider-connections',
      ctaLabel: 'Review connection',
      description: 'Provider cleanup is still in progress. Review the connection status; AE retries cleanup automatically.',
      title: 'Connection cleanup pending',
    }
  }
  if (facts.blockerCodes.includes('credential_lost')) {
    return {
      actor: 'business_owner',
      reason: 'credential_lost',
      destination: '/owner/settings/integrations#provider-connections',
      ctaLabel: 'Reconnect source',
      description: 'The source connection is unavailable. Reconnect it before continuing.',
      title: 'Reconnect source',
    }
  }
  return undefined
}

export function projectProviderToolStatus(
  facts: ProviderToolStatusFacts,
): ProviderToolStatus {
  const state = stateFor(facts)
  const continuation = continuationFor(facts, state)
  const ownerHandoff = ownerHandoffFor(facts)
  const reasonCodes = [...facts.blockerCodes]
  if (maintenanceActionFor(facts, state) !== undefined && continuation === undefined) {
    reasonCodes.push('maintenance_identity_unavailable')
  }
  if ((state === 'Needs setup' || state === 'Draft') && !sourcePreviewSupported(facts)) {
    reasonCodes.push('source_preview_unavailable')
  }
  return {
    schemaVersion: 'provider_tools:v1',
    businessRef: facts.businessRef,
    providerRef: facts.providerRef,
    toolRef: facts.toolRef,
    ...(facts.revision === undefined ? {} : { revision: facts.revision }),
    ...(facts.maintenance === undefined ? {} : { maintenance: facts.maintenance }),
    state,
    reasonCodes: [...new Set(reasonCodes)],
    observedAt: facts.observedAt,
    ...(facts.validUntil === undefined ? {} : { validUntil: facts.validUntil }),
    source: facts.source ?? { kind: 'unavailable' },
    routeability: facts.routeability ?? { available: facts.routeable, reasonCodes: [...facts.blockerCodes] },
    authority: facts.authority ?? { kind: 'unavailable' },
    health: facts.health ?? {
      connection: 'unknown',
      validation: facts.reviewActive ? 'in_progress' : facts.routeable ? 'passed' : 'not_started',
      publication: facts.retired ? 'removed' : facts.paused ? 'paused' : facts.routeable ? 'published' : 'not_published',
      freshness: facts.routeable ? 'current' : 'unobserved',
      delivery: { kind: 'unobserved', provenance: 'canonical_call_receipts' },
      usefulOutcome: { kind: 'unobserved', provenance: 'qualified_use_receipts' },
      operationalConditions: [],
    },
    ...(continuation === undefined ? {} : { continuation }),
    ...(ownerHandoff === undefined ? {} : { ownerHandoff }),
  }
}

export const providerToolStatusSchema: z.ZodType<ProviderToolStatus> = z.strictObject({
  schemaVersion: z.literal('provider_tools:v1'),
  businessRef: z.string(),
  providerRef: z.string(),
  toolRef: z.string(),
  revision: z.number().int().positive().optional(),
  maintenance: providerToolMaintenanceIdentitySchema.optional(),
  state: z.enum(['Draft', 'Needs setup', 'Submitted', 'Under review', 'Published', 'Paused', 'Action required', 'Retired']),
  reasonCodes: z.array(z.string()),
  observedAt: z.number(),
  validUntil: z.number().optional(),
  source: z.strictObject({
    kind: z.enum(['openapi', 'mcp', 'agent_plugin', 'x402', 'legacy', 'unavailable']),
    revision: z.string().optional(),
    digest: z.string().optional(),
  }),
  routeability: z.strictObject({ available: z.boolean(), reasonCodes: z.array(z.string()) }),
  authority: z.strictObject({
    kind: z.enum(['public', 'connection', 'unverified', 'unavailable']),
    connectionRef: z.string().optional(),
    providerRef: z.string().optional(),
  }),
  health: z.strictObject({
    connection: z.enum(['not_required', 'connected', 'action_required', 'unknown']),
    validation: z.enum(['not_started', 'in_progress', 'passed', 'failed']),
    publication: z.enum(['not_published', 'published', 'paused', 'removed']),
    freshness: z.enum(['unobserved', 'current', 'stale', 'failed']),
    delivery: z.union([
      z.strictObject({ kind: z.literal('unobserved'), provenance: z.literal('canonical_call_receipts') }),
      z.strictObject({ kind: z.literal('unavailable'), reason: z.literal('window_too_large'), provenance: z.literal('canonical_call_receipts') }),
      z.strictObject({
        kind: z.literal('observed'),
        deliveredCount: z.number().int().nonnegative(),
        notDeliveredCount: z.number().int().nonnegative(),
        unknownCount: z.number().int().nonnegative(),
        sampleSize: z.number().int().positive(),
        lastObservedAt: z.number(),
        windowStartAt: z.number(),
        windowEndAt: z.number(),
        provenance: z.literal('canonical_call_receipts'),
      }),
    ]),
    usefulOutcome: z.union([
      z.strictObject({ kind: z.literal('unobserved'), provenance: z.literal('qualified_use_receipts') }),
      z.strictObject({ kind: z.literal('unavailable'), reason: z.literal('window_too_large'), provenance: z.literal('qualified_use_receipts') }),
      z.strictObject({
        kind: z.literal('observed'),
        qualifiedUseCount: z.number().int().positive(),
        lastObservedAt: z.number(),
        windowStartAt: z.number(),
        windowEndAt: z.number(),
        provenance: z.literal('qualified_use_receipts'),
      }),
    ]),
    operationalConditions: z.array(z.string()),
  }),
  continuation: providerToolContinuationSchema.optional(),
  ownerHandoff: z.strictObject({
    actor: z.literal('business_owner'),
    reason: z.enum(['credential_lost', 'credential_cleanup_pending']),
    destination: z.literal('/owner/settings/integrations#provider-connections'),
    ctaLabel: z.string(),
    description: z.string(),
    title: z.string(),
  }).optional(),
})

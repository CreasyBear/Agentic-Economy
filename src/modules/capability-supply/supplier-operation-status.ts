import { z } from 'zod'

export type SupplierOperationState =
  | 'Draft'
  | 'Needs setup'
  | 'Submitted'
  | 'Under review'
  | 'Published'
  | 'Paused'
  | 'Action required'
  | 'Retired'

export type SupplierOperationContinuation = Readonly<{
  action:
    | 'supply.source.preview'
    | 'supply.status'
    | 'supply.recheck'
    | 'supply.republish'
    | 'supply.offboarding.status'
}>

export type SupplierOperationOwnerHandoff = Readonly<{
  action: 'supply.connection.reconnect' | 'supply.connection.detail'
  blockedCapabilities: readonly ['supply.publish']
  cta: string
  ctaLabel: string
  description: string
  iconUrl: null
  status: 'required' | 'pending'
  title: string
}>

export type SupplierOperationStatusFacts = Readonly<{
  schemaVersion: 'supplier_operations:v1'
  businessRef: string
  providerRef: string
  operationRef: string
  revision?: number | undefined
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
  source?: SupplierOperationStatus['source']
  routeability?: SupplierOperationStatus['routeability']
  authority?: SupplierOperationStatus['authority']
  health?: SupplierOperationStatus['health']
}>

export type SupplierOperationStatus = Readonly<{
  schemaVersion: 'supplier_operations:v1'
  businessRef: string
  providerRef: string
  operationRef: string
  revision?: number | undefined
  state: SupplierOperationState
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
  continuation?: SupplierOperationContinuation | undefined
  ownerHandoff?: SupplierOperationOwnerHandoff | undefined
}>

function stateFor(facts: SupplierOperationStatusFacts): SupplierOperationState {
  if (facts.retired && facts.retirementProven) return 'Retired'
  if (facts.blockerCodes.length > 0 || (facts.retired && !facts.retirementProven)) {
    return 'Action required'
  }
  if (facts.paused) return 'Paused'
  if (facts.routeable) return 'Published'
  if (facts.reviewActive) return 'Under review'
  if (facts.submitted) return 'Submitted'
  if (!facts.setupComplete) return 'Needs setup'
  return 'Draft'
}

function continuationFor(
  facts: SupplierOperationStatusFacts,
  state: SupplierOperationState,
): SupplierOperationContinuation | undefined {
  if (facts.retired && !facts.retirementProven) {
    return { action: 'supply.offboarding.status' }
  }
  if (state === 'Needs setup') return { action: 'supply.source.preview' }
  if (state === 'Submitted' || state === 'Under review') return { action: 'supply.status' }
  if (state === 'Paused') return { action: 'supply.republish' }
  if (facts.blockerCodes.includes('source_drift')) return { action: 'supply.recheck' }
  return undefined
}

function ownerHandoffFor(
  facts: SupplierOperationStatusFacts,
): SupplierOperationOwnerHandoff | undefined {
  if (facts.blockerCodes.includes('credential_cleanup_pending')) {
    return {
      action: 'supply.connection.detail',
      blockedCapabilities: ['supply.publish'],
      cta: '/owner/supply/connections',
      ctaLabel: 'Review connection',
      description: 'Provider cleanup is still in progress. Review the connection status; AE retries cleanup automatically.',
      iconUrl: null,
      status: 'pending',
      title: 'Connection cleanup pending',
    }
  }
  if (facts.blockerCodes.includes('credential_lost')) {
    return {
      action: 'supply.connection.reconnect',
      blockedCapabilities: ['supply.publish'],
      cta: '/owner/supply/connections',
      ctaLabel: 'Reconnect source',
      description: 'The source connection is unavailable. Reconnect it before continuing.',
      iconUrl: null,
      status: 'required',
      title: 'Reconnect source',
    }
  }
  return undefined
}

export function projectSupplierOperationStatus(
  facts: SupplierOperationStatusFacts,
): SupplierOperationStatus {
  const state = stateFor(facts)
  const continuation = continuationFor(facts, state)
  const ownerHandoff = ownerHandoffFor(facts)
  return {
    schemaVersion: 'supplier_operations:v1',
    businessRef: facts.businessRef,
    providerRef: facts.providerRef,
    operationRef: facts.operationRef,
    ...(facts.revision === undefined ? {} : { revision: facts.revision }),
    state,
    reasonCodes: [...facts.blockerCodes],
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

export const supplierOperationStatusSchema: z.ZodType<SupplierOperationStatus> = z.strictObject({
  schemaVersion: z.literal('supplier_operations:v1'),
  businessRef: z.string(),
  providerRef: z.string(),
  operationRef: z.string(),
  revision: z.number().int().positive().optional(),
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
  continuation: z.strictObject({
    action: z.enum(['supply.source.preview', 'supply.status', 'supply.recheck', 'supply.republish', 'supply.offboarding.status']),
  }).optional(),
  ownerHandoff: z.strictObject({
    action: z.enum(['supply.connection.reconnect', 'supply.connection.detail']),
    blockedCapabilities: z.tuple([z.literal('supply.publish')]),
    cta: z.string(),
    ctaLabel: z.string(),
    description: z.string(),
    iconUrl: z.null(),
    status: z.enum(['required', 'pending']),
    title: z.string(),
  }).optional(),
})

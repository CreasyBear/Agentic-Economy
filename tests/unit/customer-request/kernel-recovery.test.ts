import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createKernelCustomerRequestActionRouter } from '@/modules/customer-request/kernel-router'
import { resolvePreparedOptionInspection } from '@/modules/customer-request/option-inspection'
import {
  createInMemoryPreparationDisclosureStore,
  preparationAuthorityDigest,
  type VerifiedPreparationAuthority,
} from '@/modules/customer-request/preparation-authority'
import {
  createInMemoryCustomerRequestPreparationStore,
  prepareCustomerRequestAction,
} from '@/modules/customer-request/preparation'
import {
  createCapabilityContractRegistry,
  createCustomerRequest,
  createPlanRevision,
  defineCapabilityContract,
} from '@/modules/customer-request/public'
import { createNeutralRoutingKernel, type CapabilityBindingAdapter } from '@/modules/routing-kernel/application'
import { createInMemoryStructuredQuotePreparationStore } from '@/modules/routing-kernel/structured-quote-preparation-store'

describe('Customer Request structured preparation recovery', () => {
  it('resumes one Request after provider uncertainty without a second effect or disclosure allocation', async () => {
    let now = 1_000
    let providerEffects = 0
    let reconciliations = 0
    const contract = defineCapabilityContract({
      capabilityContractId: 'room.quote:v1', name: 'Prepare a room quote', operation: 'quote',
      preparation: { purpose: 'prepare_room_quote', customerLabel: 'Prepare a meeting-room quote' },
      input: {
        attendeeCount: { valueType: 'integer', customerLabel: 'Attendee count', required: true },
        contactEmail: {
          valueType: 'string', customerLabel: 'Contact email', required: true,
          disclosure: {
            classification: 'personal', phase: 'preparation', recipient: 'candidate_provider',
            purposes: ['prepare_room_quote'],
          },
        },
      },
      output: {
        providerOfferRef: { valueType: 'provider_offer_ref', customerLabel: 'Provider offer', required: true, evidenceRole: 'provider_offer' },
      },
      consequence: { commitment: 'none', spend: 'quoted', reversibility: 'not_applicable', approval: 'explicit' },
    })
    const adapter: CapabilityBindingAdapter = {
      binding: {
        bindingId: 'binding:room-a', nodeId: 'node:room-a', networkId: 'network:venues',
        capabilityContractId: contract.capabilityContractId, operation: 'quote', admission: 'admitted', conformance: 'conformant',
        queryTerms: ['meeting room'], registrationHash: 'sha256:room-a', environment: 'production',
        adapterFeatures: { requestCancellation: 'unsupported', quotePreparation: 'structured_authorized' },
      },
      quote: async () => ({ kind: 'refused', reason: 'structured_only' }),
      quoteStructured: async () => {
        providerEffects += 1
        return { kind: 'uncertain', reason: 'provider_quote_timeout' }
      },
      reconcileStructuredQuote: async (input) => {
        reconciliations += 1
        if (reconciliations === 1) return { kind: 'uncertain', reason: 'provider_quote_unknown' }
        return {
          kind: 'quoted', issuerBindingId: input.recipient.bindingId, issuerNodeId: input.recipient.nodeId,
          capabilityContractId: input.capabilityContractId, capabilityContractVersion: input.capabilityContractVersion,
          registrationHash: input.registrationHash, environment: input.environment,
          expectedCost: { currency: 'AUD', amountMinor: 35_000 }, maximumCost: { currency: 'AUD', amountMinor: 35_000 },
          expectedLatencyMs: 300, providerQuoteRef: 'venue:quote:confirmed', providerQuoteExpiresAt: 10_000,
          offerOutputs: [], priceComponents: [{ label: 'Room', amountMinor: 35_000 }],
          materialTerms: [{ key: 'room', label: 'Room', value: 'Boardroom for eight people' }],
          cancellation: { kind: 'conditional', summary: 'Cancel without charge up to 24 hours before start.' },
          dataFields: [], disclosures: ['Boardroom for eight people', 'Cancel without charge up to 24 hours before start'],
        }
      },
      execute: async () => ({ kind: 'effect_not_committed', reason: 'not_used' }),
      reconcile: async () => ({ kind: 'reconciliation_pending' }),
    }
    const structuredStore = createInMemoryStructuredQuotePreparationStore()
    const kernel = createNeutralRoutingKernel({
      now: () => now++, executionMode: 'simulation', quoteTtlMs: 60_000,
      ids: { next: (prefix) => `${prefix}:recovery` }, bindings: [adapter], structuredPreparationStore: structuredStore,
    })
    let presentationAvailable = true
    const router = createKernelCustomerRequestActionRouter(kernel, {
      resolve: async () => presentationAvailable ? [{
        bindingId: 'binding:room-a', nodeId: 'node:room-a', businessName: 'Gather Rooms',
        commercialRelationship: {
          kind: 'none', summary: 'No registered commercial relationship.',
          influencesEligibility: false, influencesInclusion: false, influencesOrder: false,
          evidenceRefs: ['registration:room-a:commercial'],
        },
        cancellation: { kind: 'conditional', summary: 'Cancel without charge up to 24 hours before start.' },
      }] : [],
    })
    const registry = createCapabilityContractRegistry([contract])
    const request = createCustomerRequest({
      requestId: 'request:room:1', principalId: 'principal:1', delegatedAgentId: 'agent:1',
      intent: 'Find a meeting room for eight people.',
      routing: { networkId: 'network:venues', currency: 'AUD', maximumSpendMinor: 50_000, optimizeFor: 'cost' }, createdAt: 900,
    })
    const plan = createPlanRevision({
      planRevisionId: 'plan:room:1', requestId: request.requestId, requestRevision: request.revision,
      proposedByAgentId: request.delegatedAgentId,
      proposalProvenance: { kind: 'direct_structured', proposalDigest: 'sha256:' + '1'.repeat(64) }, createdAt: 950,
      completionEvidence: [{ actionId: 'action:quote', field: 'providerOfferRef' }],
      actions: [{
        actionId: 'action:quote', capabilityContractId: contract.capabilityContractId, dependsOn: [],
        input: {
          attendeeCount: { kind: 'literal', value: 8 },
          contactEmail: { kind: 'literal', value: 'customer@example.com' },
        },
      }],
    }, registry)
    const store = createInMemoryCustomerRequestPreparationStore()
    await store.putRequest(request)
    await store.putPlanRevision(plan)
    const authority = verifiedAuthority()
    const baseDisclosureStore = createInMemoryPreparationDisclosureStore([authority])
    let crashAfterOfferPersistence = true
    const disclosureStore = {
      ...baseDisclosureStore,
      reconcileReleased: async (input: Parameters<typeof baseDisclosureStore.reconcileReleased>[0]) => {
        if (crashAfterOfferPersistence) {
          crashAfterOfferPersistence = false
          throw new Error('simulated_crash_after_offer_persistence')
        }
        return await baseDisclosureStore.reconcileReleased(input)
      },
    }
    const dependencies = {
      store, router, registry, now: () => now, leaseMs: 100,
      preparationAuthorityVerifier: { verify: async () => ({ kind: 'verified' as const, authority }) },
      preparationDisclosureStore: disclosureStore,
      commitProtectedProjection: (value: Readonly<Record<string, string | number | boolean>>) => `hmac-sha256:${canonicalDigest(value).slice(7)}`,
    }
    const command = {
      preparationKey: 'prepare:room:1', requestId: request.requestId, requestRevision: request.revision,
      planRevisionId: plan.planRevisionId, actionId: 'action:quote',
      resolvedInput: { attendeeCount: 8, contactEmail: 'customer@example.com' },
      preparationAuthorityEvidenceRef: authority.verification.evidenceRef,
    } as const

    const first = await prepareCustomerRequestAction(command, dependencies)
    expect(first).toMatchObject({ kind: 'preparation_in_progress', inspectionRef: expect.stringMatching(/^preparation-allocation:/) })
    presentationAvailable = false
    now += 101
    const pending = await prepareCustomerRequestAction(command, dependencies)
    expect(pending).toMatchObject({ kind: 'preparation_in_progress', inspectionRef: expect.stringMatching(/^options_/) })
    now += 101
    await expect(prepareCustomerRequestAction(command, dependencies)).resolves.toMatchObject({
      kind: 'preparation_in_progress', inspectionRef: expect.stringMatching(/^options_/),
    })
    now += 101
    const resumed = await prepareCustomerRequestAction(command, dependencies)
    const replay = await prepareCustomerRequestAction(command, dependencies)

    expect(resumed).toMatchObject({
      kind: 'options_prepared', candidateSet: { candidates: [{
        business: { name: 'Gather Rooms' },
        commercialInfluence: { status: 'none', summary: 'No registered commercial relationship.' },
      }] },
    })
    expect(replay).toEqual(resumed)
    expect(providerEffects).toBe(1)
    expect(reconciliations).toBe(2)
    expect(JSON.stringify(resumed)).not.toContain('customer@example.com')
    if (resumed.kind !== 'options_prepared') throw new Error('expected_options')
    const inspection = await resolvePreparedOptionInspection({
      inspectionRef: resumed.candidateSet.candidates[0]!.inspectionRef,
      requestId: request.requestId, planRevisionId: plan.planRevisionId, actionId: 'action:quote',
    }, {
      structuredStore, disclosureStore: baseDisclosureStore, outputLabels: {},
    })
    expect(inspection).toMatchObject({
      kind: 'option_evidence', business: { name: 'Gather Rooms' },
      dataUse: { categories: ['Contact email'], purpose: 'Prepare a meeting-room quote', status: 'released' },
    })
    expect(JSON.stringify(inspection)).not.toMatch(/binding:|provider-offer|sha256|customer@example.com|contactEmail/)
    await expect(resolvePreparedOptionInspection({
      inspectionRef: 'evidence_' + '0'.repeat(64), requestId: request.requestId,
      planRevisionId: plan.planRevisionId, actionId: 'action:quote',
    }, { structuredStore, disclosureStore: baseDisclosureStore, outputLabels: {} })).resolves.toEqual({ kind: 'not_found' })
  })
})

function verifiedAuthority(): VerifiedPreparationAuthority {
  const material: Omit<VerifiedPreparationAuthority, 'authorityDigest' | 'status' | 'verification'> = {
    authorityId: 'authority:room:1', authorityVersion: 1, principalId: 'principal:1', delegatedAgentId: 'agent:1',
    requestId: 'request:room:1', requestRevision: 1, mode: 'single_use', permittedFields: ['contactEmail'],
    permittedRecipientKinds: ['candidate_provider'], permittedRecipientBindingIds: ['binding:room-a'],
    permittedPurposes: ['prepare_room_quote'], maximumRecipients: 1, maximumExposures: 1, maximumOperations: 1,
    grantedAt: 900, expiresAt: 20_000,
  }
  return {
    ...material, status: 'active', authorityDigest: preparationAuthorityDigest(material),
    verification: { evidenceRef: 'authority:evidence:room:1', issuerId: 'issuer:ae', signerId: 'signer:ae', keyId: 'key:1' },
  }
}

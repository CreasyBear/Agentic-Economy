import { describe, expect, it, vi } from 'vitest'

import { defineCapabilityContract } from '@/modules/capability-contract/public'
import type { CapabilityBindingRow } from '@/modules/capability-supply/internal/binding'
import type {
  CapabilityGraphPorts,
  GraphPublicationRow,
} from '@/modules/capability-supply/internal/graph'
import type { CapabilityOfferingRow } from '@/modules/capability-supply/internal/offering'
import {
  capabilityBindingEligibilityHash,
  capabilityBindingRegistrationHash,
  capabilityOfferingEligibilityHash,
  capabilityOfferingRegistrationHash,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
} from '@/modules/capability-supply/public'
import {
  collectSuppliedCandidateQuoteAction,
  prepareSuppliedCandidateQuote,
  qualifySuppliedCandidate,
  suppliedCandidateQuoteInputSchema,
  type SuppliedCandidateQuoteInput,
  type SuppliedCandidateQuoteResult,
} from '@/modules/capability-supply/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  createReconciliationEvidence,
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDevelopmentReleaseSignal,
  createDurableActionInvocationTracer,
  createInMemoryActionInvocationTracer,
  type ActionInvocationOrigin,
  type ActionInvocationView,
  type InvocationActor,
  type PreparedInvocation,
} from '@/modules/action-invocation'
import { capabilityContractV2 } from '../../fixtures/capability-contract-v2'

const nowMs = Date.parse('2026-07-19T08:00:00.000Z')
const nowIso = () => new Date(nowMs).toISOString()
const actor: InvocationActor = { callerRef: 'dev:caller', principalRef: 'dev:principal' }
const contract = defineCapabilityContract(capabilityContractV2({
  capabilityId: 'sandbox.route.service.quote',
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
}))
const candidate = {
  publicationRef: 'dev:publication',
  revision: 3,
  businessId: 'dev:business',
  offeringId: 'dev:offering',
  bindingId: 'dev:binding',
  contractRef: contract.ref,
}
const offeringRegistration = defineCapabilityOfferingRegistration({
  offeringId: candidate.offeringId,
  businessId: candidate.businessId,
  networkId: 'ae:public',
  contractRef: contract.ref,
  presentation: {
    label: 'Development quote provider',
    summary: 'Labelled fixture supply for quote collection evaluation.',
    price: { kind: 'on_request' },
    materialTerms: [],
    commercialRelationship: {
      kind: 'none',
      summary: 'No commercial influence in this development fixture.',
      influencesEligibility: false,
      influencesInclusion: false,
      influencesOrder: false,
      evidenceRefs: ['dev:commercial'],
    },
  },
  searchTerms: ['development quote'],
  registrationEvidenceRefs: ['dev:offering-registration'],
})
const bindingRegistration = defineCapabilityTransportBindingRegistration({
  bindingId: candidate.bindingId,
  offeringId: candidate.offeringId,
  networkId: 'ae:public',
  contractRef: contract.ref,
  endpointUrl: 'https://development.invalid/quote',
  credentialRef: 'dev:credential',
  continuation: { kind: 'single_response', evidenceRefs: ['dev:continuation'] },
  cancellation: { kind: 'unsupported', evidenceRefs: ['dev:cancellation'] },
  adapter: { adapterId: 'http-json:v1', config: null },
  registrationEvidenceRefs: ['dev:binding-registration'],
})
const admittedTransport = { configJson: 'null', configDigest: canonicalDigest(null) }
const origins: readonly ActionInvocationOrigin[] = [
  { kind: 'request_owned', requestRef: 'dev:request', revision: 4 },
  { kind: 'standalone', ...actor },
]

function offering(overrides: Partial<CapabilityOfferingRow> = {}): CapabilityOfferingRow {
  const registrationHash = capabilityOfferingRegistrationHash(offeringRegistration)
  const status = overrides.status ?? 'active'
  const admissionEvidenceRefs = ['dev:offering-admission']
  return {
    ...offeringRegistration,
    ...contract.ref,
    registrationHash,
    status,
    admissionEvidenceRefs,
    eligibilityHash: capabilityOfferingEligibilityHash({
      offeringId: candidate.offeringId,
      registrationHash,
      status,
      admissionEvidenceRefs,
    }),
    registeredAt: nowMs - 10_000,
    updatedAt: nowMs - 10_000,
    ...overrides,
  }
}

function binding(overrides: Partial<CapabilityBindingRow> = {}): CapabilityBindingRow {
  const registrationHash = capabilityBindingRegistrationHash(bindingRegistration, admittedTransport)
  const admission = overrides.admission ?? 'admitted'
  const conformance = overrides.conformance ?? 'conformant'
  const admissionEvidenceRefs = ['dev:binding-admission']
  const conformanceEvidenceRefs = ['dev:binding-conformance']
  return {
    _id: 'dev:binding-row',
    _creationTime: nowMs - 10_000,
    bindingId: candidate.bindingId,
    offeringId: candidate.offeringId,
    networkId: 'ae:public',
    ...contract.ref,
    endpointUrl: bindingRegistration.endpointUrl,
    credentialRef: bindingRegistration.credentialRef,
    continuation: bindingRegistration.continuation,
    cancellation: bindingRegistration.cancellation,
    adapterId: bindingRegistration.adapter.adapterId,
    ...admittedTransport,
    registrationEvidenceRefs: bindingRegistration.registrationEvidenceRefs,
    registrationHash,
    admission,
    conformance,
    admissionEvidenceRefs,
    conformanceEvidenceRefs,
    eligibilityHash: capabilityBindingEligibilityHash({
      bindingId: candidate.bindingId,
      registrationHash,
      admission,
      conformance,
      admissionEvidenceRefs,
      conformanceEvidenceRefs,
    }),
    registeredAt: nowMs - 10_000,
    updatedAt: nowMs - 10_000,
    ...overrides,
  }
}

function publication(overrides: Partial<GraphPublicationRow> = {}): GraphPublicationRow {
  return {
    id: 'dev:publication-row',
    ...candidate,
    ...contract.ref,
    sourceKind: 'openapi_http',
    sourceDigest: canonicalDigest({ fixture: 'published quote capability' }),
    disposition: 'current',
    credentialState: 'ready',
    healthState: 'healthy',
    readinessObservedAt: nowMs - 1_000,
    readinessValidUntil: nowMs + 60_000,
    registrationEvidenceRefs: ['dev:publication-registration'],
    readinessEvidenceRefs: ['dev:readiness'],
    ...overrides,
  }
}

function qualificationPorts(overrides: Partial<CapabilityGraphPorts> = {}): CapabilityGraphPorts {
  return {
    loadPublicationAtRevision: async () => publication(),
    listCurrentPublicationsByNetwork: async () => [],
    loadOfferingByOfferingId: async () => offering(),
    loadBindingByBindingId: async () => binding(),
    loadPublishedBusiness: async () => ({
      businessId: candidate.businessId,
      trustTier: 'fixture_only',
      publicStatus: 'published',
      claimStatus: 'published',
      suppressed: false,
      currentlyPublished: true,
    }),
    getActiveExactCapabilityContract: async () => ({
      kind: 'found',
      ref: contract.ref,
      documentJson: JSON.stringify(contract),
      registeredAt: nowMs - 10_000,
    }),
    getExactRegisteredCapabilityContract: async () => ({
      kind: 'found',
      contract,
      registeredAt: nowMs - 10_000,
    }),
    patchProbeReadiness: async () => undefined,
    ...overrides,
  }
}

async function quoteInputFor(ports = qualificationPorts()): Promise<SuppliedCandidateQuoteInput> {
  const qualification = await qualifySuppliedCandidate(ports, { candidate, now: nowMs })
  if (qualification.status !== 'eligible' || qualification.validUntil === undefined) {
    throw new Error(`Expected eligible fixture: ${qualification.reasons.join(',')}`)
  }
  return {
    target: candidate,
    qualificationDigest: qualification.qualificationDigest,
    qualificationValidUntil: qualification.validUntil,
    quoteRequest: {
      serviceReference: 'dev:service:aircon-assessment',
      requestedFields: ['price', 'validUntil', 'terms'],
      constraints: { suburb: 'Perth', timing: 'within 7 days' },
    },
    disclosure: {
      fields: [
        'quoteRequest.serviceReference',
        'quoteRequest.constraints.suburb',
        'quoteRequest.constraints.timing',
      ],
      limits: {
        'quoteRequest.serviceReference': 500,
        'quoteRequest.constraints.suburb': 120,
        'quoteRequest.constraints.timing': 120,
      },
      purpose: 'request_development_quote',
    },
    operationKey: 'dev:quote-operation:0001',
  }
}

function inMemoryTracer(
  adapter: ReturnType<typeof vi.fn>,
  releaseSignal = createDevelopmentReleaseSignal(),
) {
  return createInMemoryActionInvocationTracer({
    action: collectSuppliedCandidateQuoteAction,
    now: nowIso,
    nextInvocationRef: () => `dev:invocation:${Math.random()}`,
    nextAuthorityRef: () => 'dev:authority:quote',
    nextAttemptRef: () => 'dev:attempt:quote',
    developmentReleaseSignal: releaseSignal,
  })
}

describe('ADR-009 supplied-candidate development quote collection', () => {
  it.each(origins)('runs the real P1-H qualifier before exact authority for $kind', async (origin) => {
    const ports = qualificationPorts()
    const quoteInput = await quoteInputFor(ports)
    const adapter = vi.fn().mockResolvedValue({
      kind: 'quote_returned',
      environment: 'MOCK/DEVELOPMENT ONLY',
      quote: {
        quoteRef: 'dev:quote:0001',
        price: { amountMinor: 18_500, currency: 'AUD' },
        validUntil: nowMs + 3_600_000,
        terms: ['Development fixture; no provider commitment.'],
        evidenceRefs: ['dev:evidence:quote-contract'],
      },
    })
    const tracer = inMemoryTracer(adapter)
    const prepared = await prepareSuppliedCandidateQuote({
      tracer,
      qualificationPorts: ports,
      invocationInput: quoteInput,
      origin,
      actor,
      context: { developmentOnlySuppliedQuoteAdapter: adapter },
      now: () => nowMs,
    })
    expect(prepared.kind).toBe('prepared')
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    expect(prepared.view.prepared).toMatchObject({
      target: candidate,
      freshUntil: new Date(quoteInput.qualificationValidUntil).toISOString(),
      dataUse: { fields: quoteInput.disclosure.fields, limits: quoteInput.disclosure.limits },
    })
    const accepted = tracer.decide({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: prepared.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor,
      origin,
      accept: true,
    })
    if (accepted.kind !== 'accepted') throw new Error(accepted.code)
    const executed = await tracer.execute({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: accepted.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor,
      origin,
      materialInput: quoteInput,
    })
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(adapter).toHaveBeenCalledWith({
      target: candidate,
      operationKey: quoteInput.operationKey,
      request: {
        serviceReference: quoteInput.quoteRequest.serviceReference,
        constraints: quoteInput.quoteRequest.constraints,
      },
    })
    expect(adapter.mock.calls[0]![0]).not.toHaveProperty('request.requestedFields')
    expect(executed).toMatchObject({
      kind: 'accepted',
      view: {
        control: { state: 'terminal' },
        observedResolution: {
          state: 'returned',
          businessOutcome: 'completed',
          result: { kind: 'quote_returned', environment: 'MOCK/DEVELOPMENT ONLY' },
        },
      },
    })
  })

  it('does not allow caller assertions to create eligibility', async () => {
    const currentPorts = qualificationPorts()
    const quoteInput = await quoteInputFor(currentPorts)
    const tracer = inMemoryTracer(vi.fn())

    const forgedEnvelope = {
      ...quoteInput,
      qualification: {
        status: 'eligible',
        sources: [],
        qualificationDigest: quoteInput.qualificationDigest,
      },
    }
    expect(suppliedCandidateQuoteInputSchema.safeParse(forgedEnvelope).success).toBe(false)

    const blocked = await prepareSuppliedCandidateQuote({
      tracer,
      qualificationPorts: qualificationPorts({
        loadPublicationAtRevision: async () => publication({
          disposition: 'superseded',
          sourceDigest: canonicalDigest({ changed: true }),
        }),
      }),
      invocationInput: quoteInput,
      origin: origins[1]!,
      actor,
      context: {},
      now: () => nowMs,
    })
    expect(blocked).toEqual({ kind: 'refused', code: 'qualification_blocked' })
    expect(tracer.exportSnapshot().records).toEqual([])
  })

  it('returns a structured provider refusal without converting it into a thrown failure', async () => {
    const ports = qualificationPorts()
    const quoteInput = await quoteInputFor(ports)
    const adapter = vi.fn().mockResolvedValue({
      kind: 'refused',
      environment: 'MOCK/DEVELOPMENT ONLY',
      code: 'development_provider_declined',
      reason: 'The labelled development provider declined this quote request.',
    })
    const tracer = inMemoryTracer(adapter)
    const prepared = await prepareSuppliedCandidateQuote({
      tracer, qualificationPorts: ports, invocationInput: quoteInput,
      origin: origins[1]!, actor,
      context: { developmentOnlySuppliedQuoteAdapter: adapter },
      now: () => nowMs,
    })
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    const accepted = tracer.decide({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: prepared.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor, origin: origins[1]!, accept: true,
    })
    if (accepted.kind !== 'accepted') throw new Error(accepted.code)
    const refused = await tracer.execute({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: accepted.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor, origin: origins[1]!, materialInput: quoteInput,
    })
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(refused).toMatchObject({
      kind: 'accepted',
      view: {
        control: { state: 'terminal' },
        attempts: [{ outcome: { state: 'returned', businessOutcome: 'refused' } }],
        observedResolution: {
          state: 'returned',
          businessOutcome: 'refused',
          result: { kind: 'refused', code: 'development_provider_declined' },
        },
      },
    })
  })

  it('makes a demonstrably pre-release adapter failure safely retryable with one attributable attempt', async () => {
    const ports = qualificationPorts()
    const quoteInput = await quoteInputFor(ports)
    const releaseSignal = createDevelopmentReleaseSignal()
    const adapter = vi.fn().mockRejectedValue(new Error('development_transport_failed_before_release'))
    const tracer = inMemoryTracer(adapter, releaseSignal)
    const prepared = await prepareSuppliedCandidateQuote({
      tracer, qualificationPorts: ports, invocationInput: quoteInput,
      origin: origins[1]!, actor,
      context: { developmentOnlySuppliedQuoteAdapter: adapter },
      now: () => nowMs,
    })
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    const accepted = tracer.decide({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: prepared.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor, origin: origins[1]!, accept: true,
    })
    if (accepted.kind !== 'accepted') throw new Error(accepted.code)
    const failed = await tracer.execute({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: accepted.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor, origin: origins[1]!, materialInput: quoteInput,
    })
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(releaseSignal.wasReleased()).toBe(false)
    expect(failed).toMatchObject({
      kind: 'accepted',
      view: {
        control: { state: 'retryable', reason: 'pre_release_failure' },
        attempts: [{
          attemptNumber: 1,
          actor,
          release: { state: 'not_released' },
          outcome: { state: 'failed', retry: 'safe_before_release' },
        }],
      },
    })
  })

  it('refuses tampered digest and source changes after the client read', async () => {
    const originalPorts = qualificationPorts()
    const quoteInput = await quoteInputFor(originalPorts)
    const tracer = inMemoryTracer(vi.fn())
    const tamperedDigest = await prepareSuppliedCandidateQuote({
      tracer,
      qualificationPorts: originalPorts,
      invocationInput: { ...quoteInput, qualificationDigest: `sha256:${'f'.repeat(64)}` },
      origin: origins[1]!,
      actor,
      context: {},
      now: () => nowMs,
    })
    expect(tamperedDigest).toEqual({ kind: 'refused', code: 'qualification_digest_mismatch' })

    const changedSources = await prepareSuppliedCandidateQuote({
      tracer,
      qualificationPorts: qualificationPorts({
        loadPublicationAtRevision: async () => publication({
          readinessObservedAt: nowMs - 500,
          readinessEvidenceRefs: ['dev:readiness:replacement'],
        }),
      }),
      invocationInput: quoteInput,
      origin: origins[1]!,
      actor,
      context: {},
      now: () => nowMs,
    })
    expect(changedSources).toEqual({ kind: 'refused', code: 'qualification_digest_mismatch' })
    expect(tracer.exportSnapshot().records).toEqual([])
  })

  it('requalifies immediately before release and refuses changed readiness without calling the adapter', async () => {
    let currentPublication = publication()
    const ports = qualificationPorts({
      loadPublicationAtRevision: async () => currentPublication,
    })
    const quoteInput = await quoteInputFor(ports)
    const adapter = vi.fn()
    const tracer = inMemoryTracer(adapter)
    const prepared = await prepareSuppliedCandidateQuote({
      tracer, qualificationPorts: ports, invocationInput: quoteInput,
      origin: origins[1]!, actor,
      context: { developmentOnlySuppliedQuoteAdapter: adapter },
      now: () => nowMs,
    })
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    const accepted = tracer.decide({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: prepared.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor, origin: origins[1]!, accept: true,
    })
    if (accepted.kind !== 'accepted') throw new Error(accepted.code)
    currentPublication = publication({
      readinessObservedAt: nowMs - 250,
      readinessEvidenceRefs: ['dev:readiness:changed-after-authority'],
    })
    const refused = await tracer.execute({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: accepted.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor, origin: origins[1]!, materialInput: quoteInput,
    })
    expect(adapter).not.toHaveBeenCalled()
    expect(refused).toMatchObject({
      kind: 'accepted',
      view: {
        control: { state: 'terminal' },
        attempts: [{
          release: { state: 'not_released' },
          outcome: { state: 'returned', businessOutcome: 'refused' },
        }],
        observedResolution: {
          state: 'returned',
          execution: 'pre_release_refused',
          businessOutcome: 'refused',
          result: { kind: 'refused', code: 'qualification_changed_before_release' },
        },
      },
    })
    expect(JSON.stringify(refused)).not.toContain('"execution":"runner_returned"')
  })

  it.each([
    ['undisclosed constraint', (input: SuppliedCandidateQuoteInput) => ({
      ...input,
      quoteRequest: {
        ...input.quoteRequest,
        constraints: { ...input.quoteRequest.constraints, phone: '0400000000' },
      },
    })],
    ['extra disclosure', (input: SuppliedCandidateQuoteInput) => ({
      ...input,
      disclosure: {
        ...input.disclosure,
        fields: [...input.disclosure.fields, 'quoteRequest.constraints.phone'],
        limits: { ...input.disclosure.limits, 'quoteRequest.constraints.phone': 32 },
      },
    })],
    ['missing limit', (input: SuppliedCandidateQuoteInput) => {
      const { ['quoteRequest.constraints.timing']: _missing, ...limits } = input.disclosure.limits
      return { ...input, disclosure: { ...input.disclosure, limits } }
    }],
    ['over-limit value', (input: SuppliedCandidateQuoteInput) => ({
      ...input,
      disclosure: {
        ...input.disclosure,
        limits: { ...input.disclosure.limits, 'quoteRequest.constraints.suburb': 2 },
      },
    })],
  ] as const)('refuses %s before invocation or adapter release', async (_label, change) => {
    const ports = qualificationPorts()
    const quoteInput = change(await quoteInputFor(ports))
    const adapter = vi.fn()
    const tracer = inMemoryTracer(adapter)
    const refused = await prepareSuppliedCandidateQuote({
      tracer, qualificationPorts: ports, invocationInput: quoteInput,
      origin: origins[1]!, actor,
      context: { developmentOnlySuppliedQuoteAdapter: adapter },
      now: () => nowMs,
    })
    expect(refused).toEqual({ kind: 'refused', code: 'disclosure_invalid' })
    expect(tracer.exportSnapshot().records).toEqual([])
    expect(adapter).not.toHaveBeenCalled()
  })

  it('invalidates changed disclosure and refuses inherited cross-principal authority', async () => {
    const ports = qualificationPorts()
    const quoteInput = await quoteInputFor(ports)
    const tracer = inMemoryTracer(vi.fn())
    const prepared = await prepareSuppliedCandidateQuote({
      tracer, qualificationPorts: ports, invocationInput: quoteInput,
      origin: origins[1]!, actor, context: {}, now: () => nowMs,
    })
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    expect(tracer.decide({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: prepared.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor: { ...actor, principalRef: 'dev:other-principal' },
      origin: origins[1]!,
      accept: true,
    })).toMatchObject({ kind: 'refused', code: 'cross_principal_refused' })
    const accepted = tracer.decide({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: prepared.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor, origin: origins[1]!, accept: true,
    })
    if (accepted.kind !== 'accepted') throw new Error(accepted.code)
    await expect(tracer.execute({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: accepted.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor,
      origin: origins[1]!,
      materialInput: {
        ...quoteInput,
        disclosure: {
          ...quoteInput.disclosure,
          fields: [...quoteInput.disclosure.fields, 'quoteRequest.constraints.phone'],
        },
      },
    })).resolves.toMatchObject({ kind: 'refused', code: 'material_input_changed' })
  })

  it.each(origins)('durably reconstructs and reconciles possible release for $kind without quote data in neutral rows', async (origin) => {
    const ports = qualificationPorts()
    const quoteInput = await quoteInputFor(ports)
    const durableState = createDevelopmentDurableState<SuppliedCandidateQuoteResult>()
    const releaseSignal = createDevelopmentReleaseSignal()
    const adapter = vi.fn().mockImplementation(() => {
      releaseSignal.markReleased()
      throw new Error('development_response_lost_after_possible_release')
    })
    const source = {
      input: quoteInput,
      context: { developmentOnlySuppliedQuoteAdapter: adapter },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' } as ActionInvocationView<SuppliedCandidateQuoteResult>['observedResolution'],
    }
    const create = (resumeRef?: string) => createDurableActionInvocationTracer({
      action: collectSuppliedCandidateQuoteAction,
      port: createDevelopmentDurablePort(durableState),
      now: nowIso,
      nextInvocationRef: () => `dev:durable-quote:${origin.kind}`,
      nextAuthorityRef: () => `dev:durable-authority:${origin.kind}`,
      nextAttemptRef: () => `dev:durable-attempt:${origin.kind}`,
      developmentReleaseSignal: releaseSignal,
      resolveSourceState: () => source,
    }, resumeRef)
    const firstProcess = create()
    const prepared = await prepareSuppliedCandidateQuote({
      tracer: firstProcess,
      qualificationPorts: ports,
      invocationInput: quoteInput,
      origin,
      actor,
      context: source.context,
      now: () => nowMs,
    })
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    source.prepared = prepared.view.prepared!
    const accepted = firstProcess.decide({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: prepared.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor, origin, accept: true,
    })
    if (accepted.kind !== 'accepted') throw new Error(accepted.code)
    const uncertain = await firstProcess.execute({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: accepted.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor, origin, materialInput: quoteInput,
    })
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(uncertain).toMatchObject({
      kind: 'accepted',
      view: {
        persistence: 'durable_control',
        control: { state: 'reconciliation_required' },
        attempts: [{ release: { state: 'possibly_released' } }],
      },
    })
    if (uncertain.kind !== 'accepted') throw new Error(uncertain.code)
    source.observedResolution = uncertain.view.observedResolution

    const freshProcess = create(uncertain.view.invocationRef)
    expect(freshProcess.inspect(uncertain.view.invocationRef)).toMatchObject({
      origin,
      persistence: 'durable_control',
      control: { state: 'reconciliation_required' },
    })
    const reconciliationEvidence = createReconciliationEvidence({
      kind: 'action_invocation_reconciliation',
      version: 1,
      evidenceRef: `mock:quote-evidence:${origin.kind}:released`,
      source: 'supply.collectDevelopmentQuote:provider-observer:v1',
      invocationRef: uncertain.view.invocationRef,
      attemptRef: uncertain.view.attempts[0]!.attemptRef,
      effectGeneration: uncertain.view.attempts[0]!.effectGeneration,
      resolution: 'released',
      observedAt: nowIso(),
    })
    const unchangedBeforeMalformedEvidence = freshProcess.inspect(uncertain.view.invocationRef)
    const malformedEvidence = { ...reconciliationEvidence }
    Reflect.set(malformedEvidence, 'kind', 'malformed')
    const refusedEvidence = [
      malformedEvidence,
      {
        ...reconciliationEvidence,
        digest: `sha256:${'0'.repeat(64)}`,
      },
      createReconciliationEvidence({
        ...reconciliationEvidence,
        source: 'mock:wrong-provider-observer:v1',
      }),
      createReconciliationEvidence({
        ...reconciliationEvidence,
        attemptRef: 'mock:cross-attempt',
      }),
      createReconciliationEvidence({
        ...reconciliationEvidence,
        effectGeneration: reconciliationEvidence.effectGeneration + 1,
      }),
      createReconciliationEvidence({
        ...reconciliationEvidence,
        observedAt: '2026-07-19T08:00:00.001Z',
      }),
    ].map((evidence) => freshProcess.reconcile({
      invocationRef: uncertain.view.invocationRef,
      expectedInvocationVersion: uncertain.view.invocationVersion,
      attemptRef: uncertain.view.attempts[0]!.attemptRef,
      actor,
      origin,
      evidence,
    }))
    expect(refusedEvidence.map((decision) => decision.kind === 'refused' ? decision.code : 'accepted'))
      .toEqual([
        'evidence_malformed',
        'evidence_digest_mismatch',
        'evidence_source_mismatch',
        'evidence_attempt_mismatch',
        'evidence_generation_stale',
        'evidence_time_invalid',
      ])
    expect(freshProcess.inspect(uncertain.view.invocationRef)).toEqual(unchangedBeforeMalformedEvidence)

    const reconciled = freshProcess.reconcile({
      invocationRef: uncertain.view.invocationRef,
      expectedInvocationVersion: uncertain.view.invocationVersion,
      attemptRef: uncertain.view.attempts[0]!.attemptRef,
      actor,
      origin,
      evidence: reconciliationEvidence,
    })
    expect(reconciled).toMatchObject({
      kind: 'accepted',
      view: {
        control: { state: 'terminal' },
        attempts: [{
          release: { state: 'released' },
          outcome: { state: 'reconciled_released', externalOutcome: 'unknown' },
        }],
      },
    })
    if (reconciled.kind !== 'accepted') throw new Error(reconciled.code)
    expect(freshProcess.reconcile({
      invocationRef: uncertain.view.invocationRef,
      expectedInvocationVersion: uncertain.view.invocationVersion,
      attemptRef: uncertain.view.attempts[0]!.attemptRef,
      actor,
      origin,
      evidence: reconciliationEvidence,
    })).toMatchObject({ kind: 'accepted', view: { invocationVersion: reconciled.view.invocationVersion } })
    expect(freshProcess.reconcile({
      invocationRef: uncertain.view.invocationRef,
      expectedInvocationVersion: uncertain.view.invocationVersion,
      attemptRef: uncertain.view.attempts[0]!.attemptRef,
      actor,
      origin,
      evidence: createReconciliationEvidence({
        ...reconciliationEvidence,
        resolution: 'not_released',
      }),
    })).toMatchObject({ kind: 'refused', code: 'command_identity_conflict' })
    const unsafeRetry = await freshProcess.execute({
      invocationRef: reconciled.view.invocationRef,
      expectedInvocationVersion: reconciled.view.invocationVersion,
      authorityRef: reconciled.view.authority!.reference,
      actor, origin, materialInput: quoteInput,
    })
    expect(unsafeRetry).toMatchObject({ kind: 'refused', code: 'authority_not_accepted' })
    expect(adapter).toHaveBeenCalledTimes(1)

    const port = createDevelopmentDurablePort(durableState)
    const persisted = JSON.stringify({
      control: port.readControl(uncertain.view.invocationRef),
      attempts: port.readAttempts(uncertain.view.invocationRef, 10),
      history: port.readHistory(uncertain.view.invocationRef, 0, 20),
    })
    expect(port.readHistory(uncertain.view.invocationRef, 0, 20)).toContainEqual(
      expect.objectContaining({
        kind: 'reconcile',
        current: true,
        sourceEvidenceRef: reconciliationEvidence.evidenceRef,
        observation: expect.objectContaining({
          release: 'released',
          evidenceDigest: reconciliationEvidence.digest,
        }),
      }),
    )
    expect(persisted).not.toContain(quoteInput.quoteRequest.serviceReference)
    expect(persisted).not.toContain(quoteInput.quoteRequest.constraints.suburb)
    expect(persisted).not.toContain(quoteInput.disclosure.purpose)
    expect(persisted).not.toContain('dev:quote:0001')
    expect(persisted).toContain(quoteInput.operationKey)
    expect(port.readControl(uncertain.view.invocationRef)?.dataLimitSummary)
      .toEqual(quoteInput.disclosure.limits)
  })
})

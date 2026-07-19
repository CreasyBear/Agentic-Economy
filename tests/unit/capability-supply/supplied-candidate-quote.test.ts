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
import { resolveActionContract } from '@/modules/common/action'
import { registryDetailAction } from '@/modules/registry/registry.actions'
import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDevelopmentReleaseSignal,
  createDurableActionInvocationTracer,
  createInMemoryActionInvocationTracer,
  type ActionInvocationOrigin,
  type ActionInvocationView,
  type InvocationActor,
  type PreparedInvocation,
  type ReconciliationEvidence,
  type ReconciliationEvidenceMaterial,
} from '@/modules/action-invocation'
import { capabilityContractV2 } from '../../fixtures/capability-contract-v2'

const nowMs = Date.parse('2026-07-19T08:00:00.000Z')
const nowIso = () => new Date(nowMs).toISOString()
const actor: InvocationActor = { callerRef: 'dev:caller', principalRef: 'dev:principal' }

function createDevelopmentEvidenceSource() {
  const issued = new Set<string>()
  return {
    issue(material: ReconciliationEvidenceMaterial): ReconciliationEvidence {
      const exact: ReconciliationEvidenceMaterial = {
        kind: material.kind,
        version: material.version,
        evidenceRef: material.evidenceRef,
        source: material.source,
        invocationRef: material.invocationRef,
        attemptRef: material.attemptRef,
        effectGeneration: material.effectGeneration,
        resolution: material.resolution,
        observedAt: material.observedAt,
      }
      const evidence = { ...exact, digest: canonicalDigest(exact as never) }
      issued.add(canonicalDigest(evidence as never))
      return evidence
    },
    verify: (evidence: ReconciliationEvidence) =>
      issued.has(canonicalDigest(evidence as never)),
  }
}
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
  it('MOCK/DEVELOPMENT ONLY: transfer eval keeps direct reads direct and earns quote control through safety and continuity', async () => {
    // Preregistered falsifiers:
    // F1: narrow the seam if the consequential arm adds control burden without
    //     exact authority before release or attributable effect attempts.
    // F2: narrow the seam if possible release can be retried without reconciliation.
    // F3: narrow the seam if a fresh process cannot continue from durable records.
    // F4: reject universal orchestration if a read-only direct arm gains any
    //     invocation, authority, attempt, history, or supervisor record.
    const directReadContract = resolveActionContract(registryDetailAction)
    const directRead = {
      workflow: 'MOCK/DEVELOPMENT ONLY: inspect a field-service business before contact',
      controlRecords: 0,
      attributableEffectAttempts: 0,
      runnerCalls: 1,
      effectCalls: 0,
      authorityDecisions: 0,
      userOrSupervisorDecisions: 0,
      requiredContinuations: 0,
      logicalTransitions: 1,
    }
    expect(directReadContract).toMatchObject({
      consequenceClass: 'read_only',
      authorityRequirement: 'none',
      retryClass: 'replayable',
    })

    const ports = qualificationPorts()
    const quoteInput = {
      ...await quoteInputFor(ports),
      quoteRequest: {
        serviceReference: 'dev:service:strata-repair-assessment',
        requestedFields: ['price', 'validUntil', 'terms'],
        constraints: {
          siteType: 'strata_common_property',
          fault: 'water_ingress_assessment',
          accessWindow: 'weekday_business_hours',
        },
      },
      disclosure: {
        fields: [
          'quoteRequest.serviceReference',
          'quoteRequest.constraints.accessWindow',
          'quoteRequest.constraints.fault',
          'quoteRequest.constraints.siteType',
        ],
        limits: {
          'quoteRequest.serviceReference': 500,
          'quoteRequest.constraints.accessWindow': 120,
          'quoteRequest.constraints.fault': 120,
          'quoteRequest.constraints.siteType': 120,
        },
        purpose: 'request_development_quote' as const,
      },
      operationKey: 'dev:transfer:strata-repair:quote:1',
    }
    const directAdapter = vi.fn().mockResolvedValue({
      kind: 'quote_returned',
      environment: 'MOCK/DEVELOPMENT ONLY',
      quote: {
        quoteRef: 'dev:transfer:quote:direct',
        price: { amountMinor: 24_500, currency: 'AUD' },
        validUntil: nowMs + 3_600_000,
        terms: ['Development fixture only; no provider commitment or fulfilment.'],
        evidenceRefs: ['dev:evidence:transfer-contract'],
      },
    })
    const directResult = await collectSuppliedCandidateQuoteAction.run({
      data: quoteInput,
      context: {
        developmentOnlySuppliedQuoteAdapter: directAdapter,
        developmentOnlySuppliedQuoteQualificationPorts: ports,
        developmentOnlySuppliedQuoteNow: () => nowMs,
      },
    })
    expect(directResult).toMatchObject({ kind: 'quote_returned' })
    const directConsequential = {
      workflow: 'MOCK/DEVELOPMENT ONLY: direct registered quote runner',
      controlRecords: 0,
      attributableEffectAttempts: 0,
      runnerCalls: 1,
      effectCalls: directAdapter.mock.calls.length,
      authorityDecisions: 0,
      userOrSupervisorDecisions: 0,
      requiredContinuations: 0,
      logicalTransitions: 1,
      safety: 'not established: no exact authority or attributable attempt',
      continuity: 'not established: no durable reference',
    }

    const durableState = createDevelopmentDurableState<SuppliedCandidateQuoteResult>()
    const controlledRelease = createDevelopmentReleaseSignal()
    const controlledAdapter = vi.fn().mockImplementation(async () => {
      controlledRelease.markReleased()
      return {
        ...directResult,
        quote: {
          ...(directResult.kind === 'quote_returned' ? directResult.quote : {}),
          quoteRef: 'dev:transfer:quote:controlled',
        },
      }
    })
    const source = {
      input: quoteInput,
      context: { developmentOnlySuppliedQuoteAdapter: controlledAdapter },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: {
        state: 'pending',
      } as ActionInvocationView<SuppliedCandidateQuoteResult>['observedResolution'],
    }
    const tracer = createDurableActionInvocationTracer({
      action: collectSuppliedCandidateQuoteAction,
      port: createDevelopmentDurablePort(durableState),
      now: nowIso,
      nextInvocationRef: () => 'dev:transfer:invocation:strata-repair',
      nextAuthorityRef: () => 'dev:transfer:authority:strata-repair',
      nextAttemptRef: () => 'dev:transfer:attempt:strata-repair',
      developmentReleaseSignal: controlledRelease,
      resolveSourceState: () => source,
    })
    const origin: ActionInvocationOrigin = {
      kind: 'standalone',
      callerRef: actor.callerRef,
      principalRef: actor.principalRef,
    }
    const prepared = await prepareSuppliedCandidateQuote({
      tracer,
      qualificationPorts: ports,
      invocationInput: quoteInput,
      origin,
      actor,
      context: source.context,
      now: () => nowMs,
    })
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    source.prepared = prepared.view.prepared!
    expect(controlledAdapter).not.toHaveBeenCalled()

    const accepted = tracer.decide({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: prepared.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor,
      origin,
      accept: true,
    })
    if (accepted.kind !== 'accepted') throw new Error(accepted.code)
    const completed = await tracer.execute({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: accepted.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor,
      origin,
      materialInput: quoteInput,
    })
    if (completed.kind !== 'accepted') throw new Error(completed.code)
    source.observedResolution = completed.view.observedResolution
    expect(controlledAdapter).toHaveBeenCalledTimes(1)
    expect(completed.view).toMatchObject({
      persistence: 'durable_control',
      observedResolution: { state: 'returned', businessOutcome: 'completed' },
      attempts: [{ release: { state: 'released' } }],
    })

    const cold = tracer.coldResume(prepared.view.invocationRef)
    expect(cold.inspect(prepared.view.invocationRef)).toMatchObject({
      persistence: 'durable_control',
      origin,
      observedResolution: { state: 'returned', businessOutcome: 'completed' },
      attempts: [{ attemptRef: 'dev:transfer:attempt:strata-repair' }],
    })
    const controlled = {
      workflow: 'MOCK/DEVELOPMENT ONLY: controlled strata-repair quote',
      controlRecords: durableState.controls.size,
      attributableEffectAttempts: durableState.attempts.get(prepared.view.invocationRef)?.size ?? 0,
      runnerCalls: controlledAdapter.mock.calls.length,
      effectCalls: controlledAdapter.mock.calls.length,
      authorityDecisions: 1,
      userOrSupervisorDecisions: 1,
      requiredContinuations: resolveActionContract(
        collectSuppliedCandidateQuoteAction,
      ).safeContinuations.length,
      logicalTransitions: completed.view.invocationVersion,
      durableHistoryRecords: durableState.history.get(prepared.view.invocationRef)?.length ?? 0,
      safety: 'earned: exact authority precedes one attributable release',
      continuity: 'earned: fresh process reconstructs the same terminal reference',
    }

    expect(controlled).toMatchObject({
      controlRecords: 1,
      attributableEffectAttempts: 1,
      runnerCalls: 1,
      effectCalls: 1,
      authorityDecisions: 1,
      userOrSupervisorDecisions: 1,
    })
    expect(controlled.logicalTransitions).toBeGreaterThan(directConsequential.logicalTransitions)
    expect(controlled.requiredContinuations).toBeGreaterThan(0)
    expect(directRead).toMatchObject({
      controlRecords: 0,
      attributableEffectAttempts: 0,
      authorityDecisions: 0,
      userOrSupervisorDecisions: 0,
    })

    console.info(JSON.stringify({
      environment: 'MOCK/DEVELOPMENT ONLY',
      latencyMeasure: 'deterministic logical transitions; wall-clock/provider latency unproven',
      fixtureOutcome: 'structured development quote returned; no provider commitment or fulfilment',
      directRead,
      directConsequential,
      controlled,
      falsifiers: {
        F1: 'does_not_hold: exact authority and attributable release earn the added control',
        F2: 'does_not_hold: action contract requires reconcile_before_retry',
        F3: 'does_not_hold: cold resume reconstructed durable terminal control',
        F4: 'does_not_hold: read-only registry detail remains direct with zero control burden',
      },
      recommendation: 'retain Action Invocation for consequential quote release; bypass it for read-only direct work',
    }, null, 2))
  })

  it('keeps exact authority isolated across two independently qualified quote invocations', async () => {
    const ports = qualificationPorts()
    const inputA = await quoteInputFor(ports)
    const inputB = {
      ...inputA,
      quoteRequest: {
        ...inputA.quoteRequest,
        serviceReference: 'dev:service:independent-quote-b',
      },
      operationKey: 'dev:quote-operation:independent-b',
    }
    let invocationSequence = 0
    const tracer = createInMemoryActionInvocationTracer({
      action: collectSuppliedCandidateQuoteAction,
      now: nowIso,
      nextInvocationRef: () => `dev:invocation:authority-isolation:${++invocationSequence}`,
      nextAuthorityRef: () => `dev:authority:quote:${invocationSequence}`,
      nextAttemptRef: () => `dev:attempt:quote:${invocationSequence}`,
    })
    const prepare = (
      invocationInput: SuppliedCandidateQuoteInput,
      origin: ActionInvocationOrigin,
    ) =>
      prepareSuppliedCandidateQuote({
        tracer,
        qualificationPorts: ports,
        invocationInput,
        origin,
        actor,
        context: {},
        now: () => nowMs,
      })
    const preparedA = await prepare(inputA, origins[0]!)
    const preparedB = await prepare(inputB, origins[1]!)
    if (preparedA.kind !== 'prepared') throw new Error(preparedA.code)
    if (preparedB.kind !== 'prepared') throw new Error(preparedB.code)

    const acceptedA = tracer.decide({
      invocationRef: preparedA.view.invocationRef,
      expectedInvocationVersion: preparedA.view.invocationVersion,
      authorityRef: preparedA.view.authority!.reference,
      actor,
      origin: origins[0]!,
      accept: true,
    })
    expect(acceptedA).toMatchObject({ kind: 'accepted', view: { control: { state: 'authorized' } } })
    expect(tracer.decide({
      invocationRef: preparedB.view.invocationRef,
      expectedInvocationVersion: preparedB.view.invocationVersion,
      authorityRef: preparedA.view.authority!.reference,
      actor,
      origin: origins[1]!,
      accept: true,
    })).toMatchObject({ kind: 'refused' })
    await expect(tracer.execute({
      invocationRef: preparedA.view.invocationRef,
      expectedInvocationVersion: acceptedA.kind === 'accepted'
        ? acceptedA.view.invocationVersion
        : preparedA.view.invocationVersion,
      authorityRef: preparedA.view.authority!.reference,
      actor,
      origin: origins[0]!,
      materialInput: inputB,
    })).resolves.toMatchObject({ kind: 'refused', code: 'material_input_changed' })
    expect(tracer.inspect(preparedB.view.invocationRef)).toMatchObject({
      authority: { reference: preparedB.view.authority!.reference },
      control: { state: 'awaiting_authority' },
      attempts: [],
    })
  })

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

  it.each(origins.flatMap((origin) => [
    { origin, resolution: 'released' as const },
    { origin, resolution: 'not_released' as const },
  ]))('durably reconstructs $resolution reconciliation for $origin.kind without quote data in neutral rows', async ({
    origin,
    resolution,
  }) => {
    const evidenceSource = createDevelopmentEvidenceSource()
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
      verifyReconciliationEvidence: evidenceSource.verify,
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
    const reconciliationEvidence = evidenceSource.issue({
      kind: 'action_invocation_reconciliation',
      version: 1,
      evidenceRef: `mock:quote-evidence:${origin.kind}:${resolution}`,
      source: 'supply.collectDevelopmentQuote:provider-observer:v1',
      invocationRef: uncertain.view.invocationRef,
      attemptRef: uncertain.view.attempts[0]!.attemptRef,
      effectGeneration: uncertain.view.attempts[0]!.effectGeneration,
      resolution,
      observedAt: nowIso(),
    })
    const unchangedBeforeMalformedEvidence = freshProcess.inspect(uncertain.view.invocationRef)
    const malformedEvidence = { ...reconciliationEvidence }
    Reflect.set(malformedEvidence, 'kind', 'malformed')
    const forgedMaterial: ReconciliationEvidenceMaterial = {
      kind: reconciliationEvidence.kind,
      version: reconciliationEvidence.version,
      evidenceRef: `mock:forged:${origin.kind}:${resolution}`,
      source: reconciliationEvidence.source,
      invocationRef: reconciliationEvidence.invocationRef,
      attemptRef: reconciliationEvidence.attemptRef,
      effectGeneration: reconciliationEvidence.effectGeneration,
      resolution: reconciliationEvidence.resolution,
      observedAt: reconciliationEvidence.observedAt,
    }
    const forgedEvidence = {
      ...forgedMaterial,
      digest: canonicalDigest(forgedMaterial as never),
    }
    const refusedEvidence = [
      malformedEvidence,
      {
        ...reconciliationEvidence,
        digest: `sha256:${'0'.repeat(64)}`,
      },
      evidenceSource.issue({
        ...reconciliationEvidence,
        source: 'mock:wrong-provider-observer:v1',
      }),
      evidenceSource.issue({
        ...reconciliationEvidence,
        attemptRef: 'mock:cross-attempt',
      }),
      evidenceSource.issue({
        ...reconciliationEvidence,
        effectGeneration: reconciliationEvidence.effectGeneration + 1,
      }),
      evidenceSource.issue({
        ...reconciliationEvidence,
        observedAt: '2026-07-19T08:00:00.001Z',
      }),
      evidenceSource.issue({
        ...reconciliationEvidence,
        observedAt: '2026-07-19T07:59:59.999Z',
      }),
      forgedEvidence,
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
        'evidence_time_invalid',
        'evidence_source_unverified',
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
    expect(reconciled).toMatchObject(resolution === 'released'
      ? {
          kind: 'accepted',
          view: {
            control: { state: 'terminal' },
            attempts: [{
              release: { state: 'released' },
              outcome: { state: 'reconciled_released', externalOutcome: 'unknown' },
            }],
          },
        }
      : {
          kind: 'accepted',
          view: {
            control: { state: 'retryable' },
            attempts: [{
              release: { state: 'not_released' },
              outcome: { state: 'reconciled_not_released', retry: 'safe_after_reconciliation' },
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
      evidence: evidenceSource.issue({
        ...reconciliationEvidence,
        resolution: resolution === 'released' ? 'not_released' : 'released',
      }),
    })).toMatchObject({ kind: 'refused', code: 'command_identity_conflict' })
    const coldAfterReconciliation = create(reconciled.view.invocationRef)
    const coldView = coldAfterReconciliation.inspect(reconciled.view.invocationRef)
    expect(coldView).toMatchObject({
      control: resolution === 'released' ? { state: 'terminal' } : { state: 'retryable' },
      attempts: [resolution === 'released'
        ? {
            release: { state: 'released' },
            outcome: { state: 'reconciled_released' },
          }
        : {
            release: { state: 'not_released' },
            outcome: { state: 'reconciled_not_released' },
          }],
    })
    expect(coldView?.control).toEqual(reconciled.view.control)
    expect(coldView?.attempts).toEqual(reconciled.view.attempts)
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
          release: resolution,
          evidenceDigest: reconciliationEvidence.digest,
        }),
        attemptTransition: expect.objectContaining({
          attemptRef: uncertain.view.attempts[0]!.attemptRef,
          effectGeneration: uncertain.view.attempts[0]!.effectGeneration,
          priorReleaseState: 'possibly_released',
          nextReleaseState: resolution,
          priorOutcomeState: 'uncertain',
          nextOutcomeState: resolution === 'released'
            ? 'reconciled_released'
            : 'reconciled_not_released',
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

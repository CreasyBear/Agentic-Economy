import { describe, expect, it, vi } from 'vitest'

import {
  createDevelopmentReleaseSignal,
  createInMemoryActionInvocationTracer,
  roundTripControlSnapshot,
  type ActionInvocationOrigin,
  type InvocationActor,
} from '@/modules/action-invocation'
import {
  collectSuppliedCandidateQuoteAction,
  prepareSuppliedCandidateQuote,
  type SuppliedCandidateQualification,
  type SuppliedCandidateQuoteInput,
} from '@/modules/capability-supply/server'

const nowMs = Date.parse('2026-07-19T08:00:00.000Z')
const nowIso = () => new Date(nowMs).toISOString()
const actor: InvocationActor = { callerRef: 'dev:caller', principalRef: 'dev:principal' }
const candidate = {
  publicationRef: 'dev:publication',
  revision: 3,
  businessId: 'dev:business',
  offeringId: 'dev:offering',
  bindingId: 'dev:binding',
  contractRef: {
    capabilityId: 'sandbox.route.service.quote',
    version: 1,
    contractDigest: `sha256:${'a'.repeat(64)}`,
  },
}
const qualification: SuppliedCandidateQualification = {
  kind: 'supplied_candidate_qualification',
  environment: 'SOURCE-OWNED DEVELOPMENT EVIDENCE',
  candidate,
  status: 'eligible',
  reasons: [],
  observedAt: nowMs - 1_000,
  validUntil: nowMs + 60_000,
  qualificationDigest: `sha256:${'b'.repeat(64)}`,
  sources: [],
}
const quoteInput: SuppliedCandidateQuoteInput = {
  target: candidate,
  qualificationDigest: qualification.qualificationDigest,
  qualificationValidUntil: qualification.validUntil!,
  quoteRequest: {
    serviceReference: 'dev:service:aircon-assessment',
    requestedFields: ['price', 'validUntil', 'terms'],
    constraints: { suburb: 'Perth', timing: 'within 7 days' },
  },
  disclosure: {
    fields: ['quoteRequest.serviceReference', 'quoteRequest.constraints.suburb', 'quoteRequest.constraints.timing'],
    limits: {
      'quoteRequest.serviceReference': 500,
      'quoteRequest.constraints.suburb': 120,
      'quoteRequest.constraints.timing': 120,
    },
    purpose: 'request_development_quote',
  },
  operationKey: 'dev:quote-operation:0001',
}
const origins: readonly ActionInvocationOrigin[] = [
  { kind: 'request_owned', requestRef: 'dev:request', revision: 4 },
  { kind: 'standalone', ...actor },
]

function tracer(adapter: ReturnType<typeof vi.fn>, releaseSignal = createDevelopmentReleaseSignal()) {
  return {
    control: createInMemoryActionInvocationTracer({
      action: collectSuppliedCandidateQuoteAction,
      now: nowIso,
      nextInvocationRef: () => `dev:invocation:${Math.random()}`,
      nextAuthorityRef: () => 'dev:authority:quote',
      nextAttemptRef: () => 'dev:attempt:quote',
      developmentReleaseSignal: releaseSignal,
    }),
    context: { developmentOnlySuppliedQuoteAdapter: adapter },
    releaseSignal,
  }
}

async function authorizeAndExecute(
  origin: ActionInvocationOrigin,
  adapter: ReturnType<typeof vi.fn>,
) {
  const harness = tracer(adapter)
  const prepared = prepareSuppliedCandidateQuote({
    tracer: harness.control,
    qualification,
    invocationInput: quoteInput,
    origin,
    actor,
    context: harness.context,
    now: nowMs,
  })
  expect(prepared.kind).toBe('prepared')
  if (prepared.kind !== 'prepared') throw new Error(prepared.code)
  const accepted = harness.control.decide({
    invocationRef: prepared.view.invocationRef,
    expectedInvocationVersion: prepared.view.invocationVersion,
    authorityRef: prepared.view.authority!.reference,
    actor,
    origin,
    accept: true,
  })
  expect(accepted.kind).toBe('accepted')
  if (accepted.kind !== 'accepted') throw new Error(accepted.code)
  const executed = await harness.control.execute({
    invocationRef: prepared.view.invocationRef,
    expectedInvocationVersion: accepted.view.invocationVersion,
    authorityRef: prepared.view.authority!.reference,
    actor,
    origin,
    materialInput: quoteInput,
  })
  return { ...harness, prepared: prepared.view, accepted, executed }
}

describe('ADR-009 supplied-candidate development quote collection', () => {
  it.each(origins)('keeps exact disclosure and result semantics for $kind origin', async (origin) => {
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
    const result = await authorizeAndExecute(origin, adapter)

    expect(result.prepared.prepared).toMatchObject({
      target: candidate,
      freshUntil: new Date(qualification.validUntil!).toISOString(),
      dataUse: {
        fields: quoteInput.disclosure.fields,
        limits: quoteInput.disclosure.limits,
      },
    })
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(result.executed).toMatchObject({
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

  it('returns a structured provider refusal without upgrading it to a thrown failure', async () => {
    const adapter = vi.fn().mockResolvedValue({
      kind: 'refused',
      environment: 'MOCK/DEVELOPMENT ONLY',
      code: 'development_provider_declined',
      reason: 'The labelled provider fixture declined this request.',
    })
    const result = await authorizeAndExecute(origins[1]!, adapter)
    expect(result.executed).toMatchObject({
      kind: 'accepted',
      view: {
        attempts: [{ outcome: { state: 'returned', businessOutcome: 'refused' } }],
        observedResolution: { state: 'returned', businessOutcome: 'refused' },
      },
    })
  })

  it('fails closed before authority for stale, blocked, mismatched, or altered qualification', () => {
    const adapter = vi.fn()
    const harness = tracer(adapter)
    const prepare = (changedQualification: SuppliedCandidateQualification, changedInput = quoteInput) =>
      prepareSuppliedCandidateQuote({
        tracer: harness.control, qualification: changedQualification,
        invocationInput: changedInput, origin: origins[1]!, actor,
        context: harness.context, now: nowMs,
      })
    expect(prepare({ ...qualification, validUntil: nowMs })).toEqual({ kind: 'refused', code: 'qualification_stale' })
    expect(prepare({ ...qualification, status: 'blocked', reasons: ['readiness_stale'] }))
      .toEqual({ kind: 'refused', code: 'qualification_blocked' })
    expect(prepare(qualification, { ...quoteInput, qualificationDigest: `sha256:${'c'.repeat(64)}` }))
      .toEqual({ kind: 'refused', code: 'qualification_digest_mismatch' })
    expect(prepare(qualification, { ...quoteInput, target: { ...candidate, bindingId: 'dev:other' } }))
      .toEqual({ kind: 'refused', code: 'candidate_mismatch' })
    expect(adapter).not.toHaveBeenCalled()
  })

  it('invalidates changed disclosure and refuses inherited cross-principal authority', () => {
    const adapter = vi.fn()
    const harness = tracer(adapter)
    const prepared = prepareSuppliedCandidateQuote({
      tracer: harness.control, qualification, invocationInput: quoteInput,
      origin: origins[1]!, actor, context: harness.context, now: nowMs,
    })
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    const wrongPrincipal = harness.control.decide({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: prepared.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor: { ...actor, principalRef: 'dev:other-principal' },
      origin: origins[1]!,
      accept: true,
    })
    expect(wrongPrincipal).toMatchObject({ kind: 'refused', code: 'cross_principal_refused' })
    const accepted = harness.control.decide({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: prepared.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor, origin: origins[1]!, accept: true,
    })
    if (accepted.kind !== 'accepted') throw new Error(accepted.code)
    return expect(harness.control.execute({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: accepted.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor,
      origin: origins[1]!,
      materialInput: {
        ...quoteInput,
        disclosure: { ...quoteInput.disclosure, fields: [...quoteInput.disclosure.fields, 'quoteRequest.constraints.phone'] },
      },
    })).resolves.toMatchObject({ kind: 'refused', code: 'material_input_changed' })
  })

  it('distinguishes pre-release retry from possible-release reconciliation and cold-resumes control', async () => {
    const preReleaseAdapter = vi.fn().mockRejectedValue(new Error('development_transport_unavailable'))
    const pre = await authorizeAndExecute(origins[1]!, preReleaseAdapter)
    expect(pre.executed).toMatchObject({ kind: 'accepted', view: { control: { state: 'retryable' } } })

    const releasedSignal = createDevelopmentReleaseSignal()
    const uncertainAdapter = vi.fn().mockImplementation(() => {
      releasedSignal.markReleased()
      throw new Error('development_response_lost')
    })
    const harness = tracer(uncertainAdapter, releasedSignal)
    const prepared = prepareSuppliedCandidateQuote({
      tracer: harness.control, qualification, invocationInput: quoteInput,
      origin: origins[1]!, actor, context: harness.context, now: nowMs,
    })
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    const accepted = harness.control.decide({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: prepared.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor, origin: origins[1]!, accept: true,
    })
    if (accepted.kind !== 'accepted') throw new Error(accepted.code)
    const uncertain = await harness.control.execute({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: accepted.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor, origin: origins[1]!, materialInput: quoteInput,
    })
    expect(uncertain).toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'reconciliation_required' }, attempts: [{ release: { state: 'possibly_released' } }] },
    })
    if (uncertain.kind !== 'accepted') throw new Error(uncertain.code)
    const snapshot = roundTripControlSnapshot(harness.control.exportSnapshot())
    const resumed = createInMemoryActionInvocationTracer({
      action: collectSuppliedCandidateQuoteAction,
      now: nowIso,
      nextInvocationRef: () => 'unused',
      initialSnapshot: snapshot,
      resolveSourceState: () => ({
        input: quoteInput,
        context: harness.context,
        prepared: uncertain.view.prepared!,
        observedResolution: uncertain.view.observedResolution,
      }),
    })
    expect(resumed.inspect(uncertain.view.invocationRef)?.control)
      .toEqual(uncertain.view.control)
    const retry = await resumed.execute({
      invocationRef: uncertain.view.invocationRef,
      expectedInvocationVersion: uncertain.view.invocationVersion,
      authorityRef: uncertain.view.authority!.reference,
      actor, origin: origins[1]!, materialInput: quoteInput,
    })
    expect(retry).toMatchObject({ kind: 'refused', code: 'reconciliation_required' })
  })
})

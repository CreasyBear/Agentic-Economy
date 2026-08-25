import { describe, expect, it, vi } from 'vitest'

import { createDevelopmentEvidenceVerifier } from '../../../tools/dev/fixtures/capability-supply/development-evidence-fixture'
import {
  collectSuppliedCandidateQuoteAction,
  prepareSuppliedCandidateQuote,
  type SuppliedCandidateQuoteResult,
} from '@/modules/capability-supply/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  type ActionInvocationView,
  type InvocationDecision,
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDevelopmentReleaseSignal,
  createDurableActionInvocationTracer,
  type PreparedInvocation,
  type ReconciliationEvidenceMaterial,
} from '@/modules/action-invocation'
import {
  actor,
  nowIso,
  nowMs,
  origins,
  qualificationPorts,
  quoteInputFor,
} from './supplied-candidate-quote-harness'

describe('ADR-009 supplied-candidate development quote collection', () => {
  it.each(origins.flatMap((origin) => [
    { origin, resolution: 'released' as const },
    { origin, resolution: 'not_released' as const },
  ]))('durably reconstructs $resolution reconciliation for $origin.kind without quote data in neutral rows', async ({
    origin,
    resolution,
  }) => {
    const evidenceSource = createDevelopmentEvidenceVerifier()
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
    const create = () => createDurableActionInvocationTracer({
      action: collectSuppliedCandidateQuoteAction,
      port: createDevelopmentDurablePort(durableState),
      now: nowIso,
      nextInvocationRef: () => `dev:durable-quote:${origin.kind}`,
      nextAuthorityRef: () => `dev:durable-authority:${origin.kind}`,
      nextAttemptRef: () => `dev:durable-attempt:${origin.kind}`,
      developmentReleaseSignal: releaseSignal,
      verifyReconciliationEvidence: evidenceSource.verify,
      resolveSourceState: () => source,
    })
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
    const accepted = await firstProcess.decide({
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
        control: { state: 'reconciliation_required' },
        attempts: [{ release: { state: 'possibly_released' } }],
      },
    })
    if (uncertain.kind !== 'accepted') throw new Error(uncertain.code)
    source.observedResolution = uncertain.view.observedResolution

    const freshProcess = await firstProcess.coldResume(uncertain.view.invocationRef)
    expect(freshProcess.inspect(uncertain.view.invocationRef)).toMatchObject({
      origin,
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
    const refusedEvidence: InvocationDecision<SuppliedCandidateQuoteResult>[] = []
    for (const evidence of [
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
    ]) {
      refusedEvidence.push(await freshProcess.reconcile({
        invocationRef: uncertain.view.invocationRef,
        expectedInvocationVersion: uncertain.view.invocationVersion,
        attemptRef: uncertain.view.attempts[0]!.attemptRef,
        actor,
        origin,
        evidence,
      }))
    }
    expect(refusedEvidence.map((decision: InvocationDecision<SuppliedCandidateQuoteResult>) =>
      decision.kind === 'refused' ? decision.code : 'accepted'))
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

    const reconciled = await freshProcess.reconcile({
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
    expect(await freshProcess.reconcile({
      invocationRef: uncertain.view.invocationRef,
      expectedInvocationVersion: uncertain.view.invocationVersion,
      attemptRef: uncertain.view.attempts[0]!.attemptRef,
      actor,
      origin,
      evidence: reconciliationEvidence,
    })).toMatchObject({ kind: 'accepted', view: { invocationVersion: reconciled.view.invocationVersion } })
    expect(await freshProcess.reconcile({
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
    const coldAfterReconciliation = await firstProcess.coldResume(reconciled.view.invocationRef)
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
      control: await port.readControl(uncertain.view.invocationRef),
      attempts: await port.readAttempts(uncertain.view.invocationRef, 10),
      history: await port.readHistory(uncertain.view.invocationRef, 0, 20),
    })
    expect(await port.readHistory(uncertain.view.invocationRef, 0, 20)).toContainEqual(
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
    expect((await port.readControl(uncertain.view.invocationRef))?.dataLimitSummary)
      .toEqual(quoteInput.disclosure.limits)
  })
})

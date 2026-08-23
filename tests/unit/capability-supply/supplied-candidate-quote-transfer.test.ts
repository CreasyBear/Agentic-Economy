import { describe, expect, it, vi } from 'vitest'

const { directReadFixture } = vi.hoisted(() => ({
  directReadFixture: {
    kind: 'not_found' as const,
    code: 'business_not_found' as const,
    reason: 'MOCK/DEVELOPMENT ONLY: no public listing for the development slug.',
  },
}))

vi.mock('@/modules/registry/registry.functions', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/modules/registry/registry.functions')>(),
  readPublicOfferingRegistryBusinessDetail: vi.fn().mockResolvedValue(directReadFixture),
}))

import { collectSuppliedCandidateQuoteAction, prepareSuppliedCandidateQuote, type SuppliedCandidateQuoteResult } from '@/modules/capability-supply/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { resolveActionContract } from '@/modules/common/action'
import {
  type ActionInvocationOrigin,
  type ActionInvocationView,
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDevelopmentReleaseSignal,
  createDurableActionInvocationTracer,
  readCompletedResultIdentity,
  type PreparedInvocation,
} from '@/modules/action-invocation'
import { registryDetailAction } from '@/modules/registry/registry.actions'
import {
  actionToHarnessToolContract,
  createHarnessToolBoundaryInstrumentation,
} from '@/modules/harness/tool-contract'
import { evaluateAdr009Transfer } from '../../eval/support/adr009-transfer-comparison'
import type { TransferBoundaryEvent } from '../../eval/support/adr009-transfer-comparison'
import {
  actor,
  nowMs,
  nowIso,
  qualificationPorts,
  quoteInputFor,
} from './supplied-candidate-quote-harness'

describe('ADR-009 supplied-candidate development quote collection', () => {
  it('MOCK/DEVELOPMENT ONLY: transfer eval keeps direct reads direct and earns quote control through safety and continuity', async () => {
    const directReadContract = resolveActionContract(registryDetailAction)
    const directReadEvents: TransferBoundaryEvent[] = []
    const directReadInstrumentation = createHarnessToolBoundaryInstrumentation(
      (event) => directReadEvents.push(event),
    )
    const directReadResult = await actionToHarnessToolContract(
      registryDetailAction,
      directReadInstrumentation,
    ).execute({ input: { slug: 'development-direct-read' }, context: {} })
    expect(directReadResult).toEqual(directReadFixture)
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
    const directConsequentialEvents: TransferBoundaryEvent[] = []
    const directAdapter = vi.fn().mockImplementation(async () => {
      directConsequentialEvents.push({
        kind: 'effect_call',
        actionId: collectSuppliedCandidateQuoteAction.id,
      })
      return {
        kind: 'quote_returned' as const,
        environment: 'MOCK/DEVELOPMENT ONLY' as const,
        quote: {
          quoteRef: 'dev:transfer:quote:direct',
          price: { currency: 'AUD', units: '24500', exponent: 2 },
          validUntil: nowMs + 3_600_000,
          terms: ['Development fixture only; no provider commitment or fulfilment.'],
          evidenceRefs: ['dev:evidence:transfer-contract'],
        },
      }
    })
    const directConsequentialInstrumentation = createHarnessToolBoundaryInstrumentation(
      (event) => directConsequentialEvents.push(event),
    )
    const directResult = await actionToHarnessToolContract(
      collectSuppliedCandidateQuoteAction,
      directConsequentialInstrumentation,
    ).execute({
      input: quoteInput,
      context: {
        developmentOnlySuppliedQuoteAdapter: directAdapter,
        developmentOnlySuppliedQuoteQualificationPorts: ports,
        developmentOnlySuppliedQuoteNow: () => nowMs,
      },
    }) as SuppliedCandidateQuoteResult
    expect(directResult).toMatchObject({ kind: 'quote_returned' })
    if (directResult.kind !== 'quote_returned') throw new Error(directResult.kind)

    const durableState = createDevelopmentDurableState<SuppliedCandidateQuoteResult>()
    const durablePort = createDevelopmentDurablePort(durableState)
    const controlledRelease = createDevelopmentReleaseSignal()
    const controlledResult = {
      ...directResult,
      quote: {
        ...directResult.quote,
        quoteRef: 'dev:transfer:quote:controlled',
      },
    }
    const controlledEvents: TransferBoundaryEvent[] = []
    const controlledAdapter = vi.fn().mockImplementation(async () => {
      controlledEvents.push({
        kind: 'direct_runner_started',
        actionId: collectSuppliedCandidateQuoteAction.id,
      })
      controlledEvents.push({
        kind: 'effect_call',
        actionId: collectSuppliedCandidateQuoteAction.id,
      })
      controlledRelease.markReleased()
      controlledEvents.push({
        kind: 'direct_runner_returned',
        actionId: collectSuppliedCandidateQuoteAction.id,
        outcome: controlledResult.kind,
      })
      return controlledResult
    })
    const source = {
      input: quoteInput,
      context: { developmentOnlySuppliedQuoteAdapter: controlledAdapter },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: {
        state: 'pending',
      } as ActionInvocationView<SuppliedCandidateQuoteResult>['observedResolution'],
      resultIdentity: {
        sourceResultRef: 'dev:transfer:source-result:strata-repair',
        resultDigest: canonicalDigest(controlledResult),
      },
    }
    const tracer = createDurableActionInvocationTracer({
      action: collectSuppliedCandidateQuoteAction,
      port: durablePort,
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

    const accepted = await tracer.decide({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: prepared.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference,
      actor,
      origin,
      accept: true,
    })
    if (accepted.kind !== 'accepted') throw new Error(accepted.code)
    controlledEvents.push({
      kind: 'approval_policy',
      policy: 'prompt',
      reason: 'exact invocation authority accepted before release',
    })
    controlledEvents.push({
      kind: 'authority_decision',
      invocationRef: prepared.view.invocationRef,
    })
    controlledEvents.push({
      kind: 'user_or_supervisor_decision',
      invocationRef: prepared.view.invocationRef,
    })
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
      observedResolution: { state: 'returned', businessOutcome: 'completed' },
      attempts: [{ release: { state: 'released' } }],
    })

    const cold = await tracer.coldResume(prepared.view.invocationRef)
    const coldView = cold.inspect(prepared.view.invocationRef)
    expect(coldView).toMatchObject({
      origin,
      observedResolution: { state: 'returned', businessOutcome: 'completed' },
      attempts: [{ attemptRef: 'dev:transfer:attempt:strata-repair' }],
    })
    const effectCountBeforeReferenceReuse = controlledAdapter.mock.calls.length
    const identity = await readCompletedResultIdentity(
      durablePort,
      prepared.view.invocationRef,
      actor,
      () => ({
        sourceResultRef: source.resultIdentity.sourceResultRef,
        result: controlledResult,
      }),
    )
    if (identity.kind === 'refused') throw new Error(identity.code)
    const completedReference = {
      invocationRef: identity.invocationRef,
      actionId: identity.actionId,
      sourceResultRef: identity.sourceResultRef,
      resultDigest: identity.resultDigest,
    }
    const projection = {
      kind: 'projected' as const,
      projection: {
        state: 'incomplete' as const,
        noEffect: true as const,
        nodes: [
          { nodeRef: 'dev:transfer:node:completed-quote', state: 'completed' as const },
          { nodeRef: 'dev:transfer:node:next-review', state: 'current' as const },
        ],
      },
    }
    expect(controlledAdapter).toHaveBeenCalledTimes(effectCountBeforeReferenceReuse)
    const referenceAndProjection = JSON.stringify({
      references: [completedReference],
      projection: projection.projection,
    })
    expect(referenceAndProjection).not.toMatch(
      /authority|attempt|control|raw quote|quoteRef|price|terms|evidenceRefs|RoutePlan|Bundle/u,
    )
    controlledEvents.push({
      kind: 'action_invocation',
      invocationRef: prepared.view.invocationRef,
    })
    for (const control of durableState.controls.values()) {
      controlledEvents.push({ kind: 'control', invocationRef: control.invocationRef })
    }
    for (const attempt of durableState.attempts.get(prepared.view.invocationRef)?.values() ?? []) {
      controlledEvents.push({
        kind: 'attempt',
        invocationRef: prepared.view.invocationRef,
        attemptRef: attempt.attemptRef,
      })
    }
    for (const history of durableState.history.get(prepared.view.invocationRef) ?? []) {
      controlledEvents.push({
        kind: 'history',
        invocationRef: prepared.view.invocationRef,
        commandId: history.commandId,
      })
    }
    const comparison = evaluateAdr009Transfer({
      events: {
        direct_read: directReadEvents,
        direct_consequential: directConsequentialEvents,
        controlled: controlledEvents,
      },
      requiredContinuations: {
        direct_read: directReadContract.safeContinuations.length,
        direct_consequential: resolveActionContract(
          collectSuppliedCandidateQuoteAction,
        ).safeContinuations.length,
        controlled: resolveActionContract(
          collectSuppliedCandidateQuoteAction,
        ).safeContinuations.length,
      },
      controlledReadback: {
        invocationVersion: coldView?.invocationVersion ?? 0,
        controlRecords: durableState.controls.size,
        attributableAttempts: durableState.attempts.get(prepared.view.invocationRef)?.size ?? 0,
        durableHistoryRecords: durableState.history.get(prepared.view.invocationRef)?.length ?? 0,
        terminalResultReconstructed:
          coldView?.observedResolution.state === 'returned'
          && coldView.observedResolution.businessOutcome === 'completed',
        exactAuthorityBeforeRelease:
          accepted.view.control.state === 'authorized'
          && completed.view.attempts[0]?.release.state === 'released',
        retryClass: resolveActionContract(collectSuppliedCandidateQuoteAction).retryClass,
      },
      referenceReuse: {
        completedReferences: 1,
        completedNodes: 1,
        currentNodes: 1,
        effectsBeforeReuse: effectCountBeforeReferenceReuse,
        effectsAfterReuse: controlledAdapter.mock.calls.length,
        copiedLifecycleOrResultFields: referenceAndProjection.match(
          /authority|attempt|control|quoteRef|price|terms|evidenceRefs/u,
        )?.length ?? 0,
        persistedRoutePlansOrBundles: 0,
      },
    })

    expect(comparison.measurements.controlled).toMatchObject({
      controlRecords: 1,
      attributableAttempts: 1,
      runnerCalls: 1,
      effectCalls: 1,
      authorityDecisions: 1,
      userOrSupervisorDecisions: 1,
    })
    expect(comparison.measurements.referenceReuse).toEqual({
      completedReferences: 1,
      completedNodes: 1,
      currentNodes: 1,
      effectsBeforeReuse: 1,
      effectsAfterReuse: 1,
      copiedLifecycleOrResultFields: 0,
      persistedRoutePlansOrBundles: 0,
    })
    expect(comparison.measurements.controlled.logicalTransitions)
      .toBeGreaterThan(comparison.measurements.directConsequential.logicalTransitions)
    expect(comparison.measurements.controlled.requiredContinuations).toBeGreaterThan(0)
    expect(comparison.measurements.directRead).toMatchObject({
      controlRecords: 0,
      attributableAttempts: 0,
      userOrSupervisorDecisions: 0,
    })
    expect(comparison.failedFalsifiers).toEqual([])
    expect(comparison.recommendation)
      .toBe('retain_control_for_consequential_and_bypass_read_only')
    console.info(JSON.stringify(comparison, null, 2))
  })
})

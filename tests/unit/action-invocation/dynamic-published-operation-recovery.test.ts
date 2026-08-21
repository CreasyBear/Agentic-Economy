import { describe, expect, it, vi } from 'vitest'

import {
  buildDynamicPublishedInput,
  createDevelopmentDynamicPublishedSource,
  createInvocationApplication,
  derivePaidOperationSemantics,
  loadDynamicPublishedAdapterSnapshot,
  materialDigest,
  readDevelopmentHostSnapshot,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  buildDevelopmentPublishedOperationEvidence,
} from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'
import { createInMemoryX402PaymentAttemptPort } from '../../helpers/x402-payment-attempt'
import {
  actor,
  createAdapter,
  dynamicSnapshotAnchors,
  lostResponseRuntime,
  origins,
  successRuntime,
} from './dynamic-published-operation-harness'

describe('dynamic PublishedOperation Action Invocation recovery', () => {
  it('holds post-payment loss for reconciliation and cold-resumes exact control', async () => {
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const clock = fixture.operation.readiness.observedAt + 1_000
    vi.spyOn(Date, 'now').mockReturnValue(clock)
    const effects = { payment: 0, provider: 0 }
    const source = createDevelopmentDynamicPublishedSource([fixture.operation])
    const adapter = createAdapter(
      fixture.operation,
      lostResponseRuntime(fixture.operation.binding.endpointUrl, effects),
      clock,
      source,
    )
    const origin = origins[1]!
    const prepared = await adapter.prepare({
      origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
    })
    const decided = await adapter.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const acquired = await adapter.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, leaseOwner: 'worker:one', leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') throw new Error('not leased')
    const uncertain = await adapter.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
    expect(uncertain.kind === 'accepted' && uncertain.view.control).toMatchObject({
      state: 'reconciliation_required',
    })
    expect(effects).toEqual({ payment: 1, provider: 1 })
    const snapshot = adapter.exportDevelopmentSnapshot()
    expect(snapshot.controls[0]?.control.acceptedAuthority).toEqual({
      kind: 'approve_each',
      authorityRef: prepared.authority!.reference,
    })
    expect(readDevelopmentHostSnapshot({
      host: 'standalone_external_agent',
      snapshot,
    }).semanticRead.authority.kind).toBe('approve_each')
    const malformedHostSnapshot = JSON.parse(JSON.stringify(snapshot))
    const malformedHostControl = malformedHostSnapshot.controls[0]
    if (malformedHostControl === undefined) throw new Error('malformed_host_control_missing')
    malformedHostControl.control.acceptedAuthority = { kind: 'forged' }
    expect(() => readDevelopmentHostSnapshot({
      host: 'standalone_external_agent',
      snapshot: malformedHostSnapshot,
    })).toThrow('durable_control_authority_invalid')
    expect(snapshot.format).toBe('dynamic-published-action-invocation:development:v4')
    expect(snapshot.paymentAttempts).toEqual([
      expect.objectContaining({
        state: 'reconciliation_required',
        paymentIdentifier: expect.stringMatching(/^sha256:/),
        amount: { currency: 'USD', units: '10000', exponent: 6 },
        custodyRef: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        authorizationDigest: expect.stringMatching(/^sha256:/),
      }),
    ])
    expect(snapshot.paymentAuthorizationEvents).toEqual([
      expect.objectContaining({
        authorization: 'created',
        authorizationDigest: snapshot.paymentAttempts[0]?.authorizationDigest,
      }),
    ])
    expect(JSON.stringify(snapshot)).not.toContain('mock:signature')
    expect(JSON.stringify(snapshot)).not.toContain('mock:credential')
    if (uncertain.kind !== 'accepted') throw new Error(uncertain.code)
    const paymentAttempt = snapshot.paymentAttempts[0]
    if (paymentAttempt === undefined) throw new Error('payment_attempt_missing')
    const semantics = derivePaidOperationSemantics({
      view: uncertain.view,
      paymentAttempt,
      operation: {
        operationKey: fixture.operation.operationId,
        providerId: fixture.operation.identity.businessId,
        providerName: 'Development Quote Provider',
        operationRevision: String(fixture.operation.identity.publicationRevision),
        materialInputs: { symbol: 'BTC', convert: 'USD' },
      },
      presentation: {
        title: 'Get the latest BTC price in USD',
        summary: 'Retrieve one current BTC/USD measurement.',
        blocks: [{ kind: 'text', label: 'Pair', value: 'BTC/USD' }],
      },
      maximumAuthorizedCharge: { currency: 'USD', units: '1', exponent: 2 },
      queryRecipient: fixture.operation.identity.businessId,
      resultDelivery: { state: 'not_delivered' },
      environment: {
        name: 'local-development',
        evidenceClass: 'labelled_local_mock',
        claimCeiling: 'mechanism_only',
      },
    })
    expect(semantics).toMatchObject({
      queryRelease: { state: 'unknown' },
      paymentAuthorization: { state: 'created' },
      paymentSubmission: { state: 'possibly_submitted' },
      settlement: { state: 'unknown' },
      continuations: [{ kind: 'reconcile' }],
    })
    expect(semantics.continuations.some(({ kind }) => kind === 'retry')).toBe(false)
    const preparedMaterial = buildDynamicPublishedInput({
      operation: fixture.operation,
      descriptor: fixture.descriptor,
      value: { symbol: 'BTC', convert: 'USD' },
    })
    const snapshotAnchors = {
      operation: fixture.operation,
      descriptor: fixture.descriptor,
      actor,
      origin,
      issuedAuthority: {
        reference: prepared.authority!.reference,
        accepted: { kind: 'approve_each' as const, authorityRef: prepared.authority!.reference },
        materialInputDigest: materialDigest(
          preparedMaterial,
          ['operationKey', 'inputDigest', 'sourceSnapshotDigest', 'target'],
        ),
      },
      expectedEffectCount: 1,
      expectedChallengeDigest: snapshot.paymentAttempts[0]!.challengeDigest,
      expectedSemanticClaim: {
        ownerInvocationRef: prepared.invocationRef,
        status: 'uncertain' as const,
      },
    }
    const loaded = loadDynamicPublishedAdapterSnapshot(
      structuredClone(snapshot),
      snapshotAnchors,
    )
    const tamperCases: readonly [string, (copy: any) => void][] = [
      ['invocationRef', (copy) => { copy.paymentAttempts[0].invocationRef = 'invocation:other' }],
      ['attemptRef', (copy) => { copy.paymentAttempts[0].attemptRef = 'attempt:other' }],
      ['effectGeneration', (copy) => { copy.paymentAttempts[0].effectGeneration += 1 }],
      ['duplicate row', (copy) => { copy.paymentAttempts.push({ ...copy.paymentAttempts[0] }) }],
      ['missing row', (copy) => { copy.paymentAttempts = [] }],
      ['missing authorization event', (copy) => { copy.paymentAuthorizationEvents = [] }],
      ['authorization downgrade', (copy) => {
        copy.paymentAuthorizationEvents[0].authorization = 'not_created'
        delete copy.paymentAuthorizationEvents[0].authorizationDigest
      }],
      ['payTo', (copy) => { copy.paymentAttempts[0].payTo = '0xother-recipient' }],
      ['amount', (copy) => {
        copy.paymentAttempts[0].amount = { currency: 'USD', units: '999999', exponent: 6 }
      }],
      ['scheme', (copy) => { copy.paymentAttempts[0].scheme = 'other' }],
      ['network', (copy) => { copy.paymentAttempts[0].network = 'eip155:1' }],
      ['asset', (copy) => { copy.paymentAttempts[0].asset = '0xother-asset' }],
      ['challengeDigest', (copy) => {
        copy.paymentAttempts[0].challengeDigest = 'sha256:other-challenge'
      }],
    ]
    const tamperDispositions = tamperCases.map(([name, mutate]) => {
      const tampered = JSON.parse(JSON.stringify(snapshot))
      mutate(tampered)
      try {
        loadDynamicPublishedAdapterSnapshot(tampered, {
          operation: fixture.operation,
          descriptor: fixture.descriptor,
          actor,
          origin,
          issuedAuthority: {
            reference: prepared.authority!.reference,
            accepted: { kind: 'approve_each', authorityRef: prepared.authority!.reference },
            materialInputDigest: materialDigest(
              preparedMaterial,
              ['operationKey', 'inputDigest', 'sourceSnapshotDigest', 'target'],
            ),
          },
          expectedEffectCount: 1,
          expectedChallengeDigest: snapshot.paymentAttempts[0]!.challengeDigest,
          expectedSemanticClaim: {
            ownerInvocationRef: prepared.invocationRef,
            status: 'uncertain',
          },
        })
        return [name, 'accepted']
      } catch (error) {
        return [
          name,
          error instanceof Error ? error.message : 'non_error_rejection',
        ]
      }
    })
    expect(tamperDispositions).toEqual(tamperCases.map(([name]) => [
      name,
      'dynamic_published_snapshot_semantics_invalid',
    ]))
    expect(effects).toEqual({ payment: 1, provider: 1 })
    const coldSource = createDevelopmentDynamicPublishedSource(
      [fixture.operation],
      loaded.sourceRows,
      loaded.semanticClaims,
    )
    const cold = createAdapter(
      fixture.operation,
      successRuntime(fixture.operation.binding.endpointUrl, effects),
      clock + 1_000,
      coldSource,
      {
        durablePort: loaded.durablePort,
        developmentSnapshot: loaded.developmentSnapshot,
        initialSnapshot: loaded.initialSnapshot,
        sequenceBase: loaded.developmentSnapshot.controls.size,
        paymentAttemptPort: createInMemoryX402PaymentAttemptPort(
          loaded.paymentAttempts,
          loaded.paymentAuthorizationEvents,
        ),
        verifyPaymentReconciliationEvidence: () => true,
      },
    )
    expect(cold.inspect(prepared.invocationRef)?.control).toMatchObject({ state: 'reconciliation_required' })
    const cancelled = await cold.cancel({
      invocationRef: prepared.invocationRef,
      idempotencyKey: `cancel:${prepared.invocationRef}:possible-release`,
      expectedInvocationVersion: uncertain.kind === 'accepted' ? uncertain.view.invocationVersion : 0,
      actor,
      origin,
    })
    expect(cancelled).toMatchObject({ kind: 'refused', code: 'invalid_control_state' })
    const retry = await cold.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: uncertain.kind === 'accepted' ? uncertain.view.invocationVersion : 0,
      authorityRef: prepared.authority!.reference,
      actor, origin, leaseOwner: 'worker:two', leaseMs: 30_000,
    })
    expect(retry).toMatchObject({ kind: 'refused', code: 'invalid_control_state' })
    const view = cold.inspect(prepared.invocationRef)!
    const attempt = view.attempts[0]!
    const evidenceMaterial = {
      kind: 'action_invocation_reconciliation' as const,
      version: 1 as const,
      evidenceRef: 'provider:reconciliation:one',
      source: `published-operation:${fixture.operation.operationId}`,
      invocationRef: view.invocationRef,
      attemptRef: attempt.attemptRef,
      effectGeneration: attempt.effectGeneration,
      resolution: 'released' as const,
      observedAt: new Date(clock + 1_000).toISOString(),
    }
    const validEvidence = {
      ...evidenceMaterial,
      digest: canonicalDigest(evidenceMaterial),
    }
    const paymentEvidenceMaterial = {
      kind: 'x402_payment_reconciliation' as const,
      version: 1 as const,
      evidenceRef: 'payment:reconciliation:one',
      evidenceRefs: ['provider:payment-readback:one'],
      source: `x402:${paymentAttempt.providerEndpoint}`,
      paymentIdentifier: paymentAttempt.paymentIdentifier,
      challengeDigest: paymentAttempt.challengeDigest,
      providerEndpoint: paymentAttempt.providerEndpoint,
      scheme: paymentAttempt.scheme,
      network: paymentAttempt.network,
      asset: paymentAttempt.asset,
      payTo: paymentAttempt.payTo,
      amount: paymentAttempt.amount,
      invocationRef: paymentAttempt.invocationRef,
      attemptRef: paymentAttempt.attemptRef,
      effectGeneration: paymentAttempt.effectGeneration,
      resolution: 'not_settled' as const,
      observedAt: new Date(clock + 1_000).toISOString(),
    }
    const paymentEvidence = {
      ...paymentEvidenceMaterial,
      digest: canonicalDigest(paymentEvidenceMaterial),
    }
    const invalidControlApplication = createInvocationApplication({
      adapter: cold,
      sourceCommands: {
        leaseOwner: () => 'worker:reconciliation',
        reconciliationEvidence: () => undefined,
      },
    })
    const invalidControlHost = invalidControlApplication.bindStandalone({ actor })
    const invalidControl = await invalidControlHost.recoverPaidOperation(
      view.invocationRef,
      { ...validEvidence, evidenceRef: 'provider:reconciliation:tampered-after-signing' },
      paymentEvidence,
    )
    expect(invalidControl).toMatchObject({ kind: 'refused', code: 'evidence_digest_mismatch' })
    expect(cold.inspect(prepared.invocationRef)?.control)
      .toMatchObject({ state: 'reconciliation_required' })
    expect(cold.exportDevelopmentSnapshot().paymentAttempts[0]).toMatchObject({
      state: 'reconciliation_required',
    })
    expect(effects).toEqual({ payment: 1, provider: 1 })
    const interruptedApplication = createInvocationApplication({
      adapter: cold,
      sourceCommands: {
        leaseOwner: () => 'worker:reconciliation',
        reconciliationEvidence: () => undefined,
        afterPaymentReconciliationPersist: () => {
          throw new Error('development_crash_after_payment_reconciliation_persist')
        },
      },
    })
    await expect(interruptedApplication.bindStandalone({ actor }).recoverPaidOperation(
      view.invocationRef,
      validEvidence,
      paymentEvidence,
    )).rejects.toThrow('development_crash_after_payment_reconciliation_persist')
    const cutSnapshot = cold.exportDevelopmentSnapshot()
    expect(cutSnapshot.paymentAttempts[0]).toMatchObject({
      state: 'not_settled',
      reconciliationEvidenceRef: paymentEvidence.evidenceRef,
      reconciliationEvidenceDigest: paymentEvidence.digest,
    })
    expect(cold.inspect(prepared.invocationRef)?.control)
      .toMatchObject({ state: 'reconciliation_required' })
    const cutLoaded = loadDynamicPublishedAdapterSnapshot(
      structuredClone(cutSnapshot),
      {
        operation: fixture.operation,
        descriptor: fixture.descriptor,
        actor,
        origin,
        issuedAuthority: {
          reference: prepared.authority!.reference,
          accepted: { kind: 'approve_each', authorityRef: prepared.authority!.reference },
          materialInputDigest: materialDigest(
            preparedMaterial,
            ['operationKey', 'inputDigest', 'sourceSnapshotDigest', 'target'],
          ),
        },
        expectedEffectCount: 1,
        expectedChallengeDigest: cutSnapshot.paymentAttempts[0]!.challengeDigest,
        expectedSemanticClaim: {
          ownerInvocationRef: prepared.invocationRef,
          status: 'uncertain',
        },
      },
    )
    const replayAdapter = createAdapter(
      fixture.operation,
      successRuntime(fixture.operation.binding.endpointUrl, effects),
      clock + 1_000,
      createDevelopmentDynamicPublishedSource(
        [fixture.operation],
        cutLoaded.sourceRows,
        cutLoaded.semanticClaims,
      ),
      {
        durablePort: cutLoaded.durablePort,
        developmentSnapshot: cutLoaded.developmentSnapshot,
        initialSnapshot: cutLoaded.initialSnapshot,
        sequenceBase: cutLoaded.developmentSnapshot.controls.size,
        paymentAttemptPort: createInMemoryX402PaymentAttemptPort(
          cutLoaded.paymentAttempts,
          cutLoaded.paymentAuthorizationEvents,
        ),
        verifyPaymentReconciliationEvidence: () => true,
      },
    )
    const replayHost = createInvocationApplication({
      adapter: replayAdapter,
      sourceCommands: {
        leaseOwner: () => 'worker:reconciliation',
        reconciliationEvidence: () => undefined,
      },
    }).bindStandalone({ actor })
    const conflictingMaterial = {
      ...paymentEvidenceMaterial,
      evidenceRef: 'payment:reconciliation:conflict',
    }
    const conflicting = await replayHost.recoverPaidOperation(
      view.invocationRef,
      validEvidence,
      { ...conflictingMaterial, digest: canonicalDigest(conflictingMaterial) },
    )
    expect(conflicting).toMatchObject({
      kind: 'refused',
      code: 'reconciliation_evidence_unavailable',
    })
    expect(replayAdapter.inspect(prepared.invocationRef)?.control)
      .toMatchObject({ state: 'reconciliation_required' })
    const reconciled = await replayHost.recoverPaidOperation(
      view.invocationRef,
      validEvidence,
      paymentEvidence,
    )
    expect(reconciled.kind === 'reconciled' && reconciled.view.control).toEqual({
      state: 'terminal',
    })
    expect(replayAdapter.exportDevelopmentSnapshot().paymentAttempts[0]).toMatchObject({
      state: 'not_settled',
      reconciliationEvidenceDigest: paymentEvidence.digest,
    })
    expect(effects).toEqual({ payment: 1, provider: 1 })
  })

  it('shares one uncertain provider outcome without retrying the effect', async () => {
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const clock = fixture.operation.readiness.observedAt + 1_000
    vi.spyOn(Date, 'now').mockReturnValue(clock)
    const effects = { payment: 0, provider: 0 }
    const source = createDevelopmentDynamicPublishedSource([fixture.operation])
    const adapter = createAdapter(
      fixture.operation,
      lostResponseRuntime(fixture.operation.binding.endpointUrl, effects),
      clock,
      source,
    )
    const origin = origins[1]!
    const lease = async (worker: string) => {
      const prepared = await adapter.prepare({
        origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
      })
      const decided = await adapter.decide({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: prepared.invocationVersion,
        authorityRef: prepared.authority!.reference,
        actor, origin, accept: true,
      })
      if (decided.kind !== 'accepted') throw new Error(decided.code)
      const acquired = await adapter.acquire({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: decided.view.invocationVersion,
        authorityRef: prepared.authority!.reference,
        actor, origin, leaseOwner: worker, leaseMs: 30_000,
      })
      if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') throw new Error('not leased')
      return { prepared, view: acquired.view }
    }
    const [first, second] = await Promise.all([
      lease('worker:uncertain:first'),
      lease('worker:uncertain:second'),
    ])
    if (first.view.control.state !== 'leased' || second.view.control.state !== 'leased') {
      throw new Error('not leased')
    }
    const execute = async (entry: typeof first) => await adapter.executeAcquired({
      invocationRef: entry.prepared.invocationRef,
      expectedInvocationVersion: entry.view.invocationVersion,
      attemptRef: entry.view.control.state === 'leased' ? entry.view.control.attemptRef : '',
      leaseOwner: entry.view.control.state === 'leased' ? entry.view.control.leaseOwner : '',
      effectGeneration: entry.view.control.state === 'leased' ? entry.view.control.effectGeneration : 0,
    })
    const [firstResult, secondResult] = await Promise.all([execute(first), execute(second)])
    expect(firstResult.kind === 'accepted' && firstResult.view.control)
      .toMatchObject({ state: 'reconciliation_required' })
    expect(secondResult.kind === 'accepted' && secondResult.view.control)
      .toMatchObject({ state: 'reconciliation_required' })
    expect(effects).toEqual({ payment: 1, provider: 1 })
    expect(source.list().every(
      ({ observedResolution }) => observedResolution.state === 'threw',
    )).toBe(true)
  })

  it('cold-reuses shared uncertainty with separate attribution and zero new effect', async () => {
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const clock = fixture.operation.readiness.observedAt + 1_000
    vi.spyOn(Date, 'now').mockReturnValue(clock)
    const effects = { payment: 0, provider: 0 }
    const source = createDevelopmentDynamicPublishedSource([fixture.operation])
    const adapter = createAdapter(
      fixture.operation,
      lostResponseRuntime(fixture.operation.binding.endpointUrl, effects),
      clock,
      source,
    )
    const origin = origins[1]!
    const first = await adapter.prepare({
      origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
    })
    const firstDecided = await adapter.decide({
      invocationRef: first.invocationRef,
      expectedInvocationVersion: first.invocationVersion,
      authorityRef: first.authority!.reference,
      actor, origin, accept: true,
    })
    if (firstDecided.kind !== 'accepted') throw new Error(firstDecided.code)
    const firstLease = await adapter.acquire({
      invocationRef: first.invocationRef,
      expectedInvocationVersion: firstDecided.view.invocationVersion,
      authorityRef: first.authority!.reference,
      actor, origin, leaseOwner: 'worker:cold:owner', leaseMs: 30_000,
    })
    if (firstLease.kind !== 'accepted' || firstLease.view.control.state !== 'leased') throw new Error('not leased')
    const uncertain = await adapter.executeAcquired({
      invocationRef: first.invocationRef,
      expectedInvocationVersion: firstLease.view.invocationVersion,
      attemptRef: firstLease.view.control.attemptRef,
      leaseOwner: firstLease.view.control.leaseOwner,
      effectGeneration: firstLease.view.control.effectGeneration,
    })
    expect(uncertain.kind === 'accepted' && uncertain.view.control)
      .toMatchObject({ state: 'reconciliation_required' })
    const snapshot = adapter.exportDevelopmentSnapshot()
    const loaded = loadDynamicPublishedAdapterSnapshot(
      structuredClone(snapshot),
      {
        ...dynamicSnapshotAnchors(fixture, first, origin, 'uncertain', 1),
        expectedChallengeDigest: snapshot.paymentAttempts[0]!.challengeDigest,
      },
    )
    const coldSource = createDevelopmentDynamicPublishedSource(
      [fixture.operation],
      loaded.sourceRows,
      loaded.semanticClaims,
    )
    const cold = createAdapter(
      fixture.operation,
      successRuntime(fixture.operation.binding.endpointUrl, effects),
      clock + 1,
      coldSource,
      {
        durablePort: loaded.durablePort,
        developmentSnapshot: loaded.developmentSnapshot,
        initialSnapshot: loaded.initialSnapshot,
        sequenceBase: loaded.developmentSnapshot.controls.size,
        paymentAttemptPort: createInMemoryX402PaymentAttemptPort(
          loaded.paymentAttempts,
          loaded.paymentAuthorizationEvents,
        ),
      },
    )
    const second = await cold.prepare({
      origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
    })
    const secondDecided = await cold.decide({
      invocationRef: second.invocationRef,
      expectedInvocationVersion: second.invocationVersion,
      authorityRef: second.authority!.reference,
      actor, origin, accept: true,
    })
    if (secondDecided.kind !== 'accepted') throw new Error(secondDecided.code)
    const secondLease = await cold.acquire({
      invocationRef: second.invocationRef,
      expectedInvocationVersion: secondDecided.view.invocationVersion,
      authorityRef: second.authority!.reference,
      actor, origin, leaseOwner: 'worker:cold:reuse', leaseMs: 30_000,
    })
    if (secondLease.kind !== 'accepted' || secondLease.view.control.state !== 'leased') throw new Error('not leased')
    const shared = await cold.executeAcquired({
      invocationRef: second.invocationRef,
      expectedInvocationVersion: secondLease.view.invocationVersion,
      attemptRef: secondLease.view.control.attemptRef,
      leaseOwner: secondLease.view.control.leaseOwner,
      effectGeneration: secondLease.view.control.effectGeneration,
    })
    expect(shared.kind === 'accepted' && shared.view.control)
      .toMatchObject({ state: 'reconciliation_required' })
    expect(shared.kind === 'accepted' && shared.view.acceptedAuthority)
      .not.toEqual(uncertain.kind === 'accepted' ? uncertain.view.acceptedAuthority : undefined)
    expect(effects).toEqual({ payment: 1, provider: 1 })
  })

  it('cold-continues an acquired owner after process loss between claim and release', async () => {
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const clock = fixture.operation.readiness.observedAt + 1_000
    vi.spyOn(Date, 'now').mockReturnValue(clock)
    const source = createDevelopmentDynamicPublishedSource([fixture.operation])
    const adapter = createAdapter(
      fixture.operation,
      successRuntime(fixture.operation.binding.endpointUrl, { payment: 0, provider: 0 }),
      clock,
      source,
    )
    const origin = origins[1]!
    const prepared = await adapter.prepare({
      origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
    })
    const decided = await adapter.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const acquired = await adapter.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, leaseOwner: 'worker:process-kill', leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') throw new Error('not leased')
    const row = source.read(prepared.invocationRef)!
    expect(source.claimSemanticEffect({
      semanticBaseKey: row.semanticBaseKey,
      semanticIdentityDigest: row.semanticIdentityDigest,
      principalRef: actor.principalRef,
      invocationRef: prepared.invocationRef,
    })).toEqual({ kind: 'owner' })
    const loaded = loadDynamicPublishedAdapterSnapshot(
      structuredClone(adapter.exportDevelopmentSnapshot()),
      dynamicSnapshotAnchors(fixture, prepared, origin, 'pending', 1),
    )
    const coldSource = createDevelopmentDynamicPublishedSource(
      [fixture.operation],
      loaded.sourceRows,
      loaded.semanticClaims,
    )
    const effects = { payment: 0, provider: 0 }
    const cold = createAdapter(
      fixture.operation,
      successRuntime(fixture.operation.binding.endpointUrl, effects),
      clock + 1,
      coldSource,
      {
        durablePort: loaded.durablePort,
        developmentSnapshot: loaded.developmentSnapshot,
        initialSnapshot: loaded.initialSnapshot,
        sequenceBase: loaded.developmentSnapshot.controls.size,
        paymentAttemptPort: createInMemoryX402PaymentAttemptPort(
          loaded.paymentAttempts,
          loaded.paymentAuthorizationEvents,
        ),
      },
    )
    const completed = await cold.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
    expect(completed.kind === 'accepted' && completed.view.control).toEqual({ state: 'terminal' })
    expect(effects).toEqual({ payment: 1, provider: 1 })
  })
})

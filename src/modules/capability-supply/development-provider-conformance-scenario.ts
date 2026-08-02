import {
  createDevelopmentDynamicPublishedSource,
  createDevelopmentInvocationApplication,
  createDevelopmentPaidOperationApplicationService,
  createDynamicPublishedActionInvocationAdapter,
  buildDynamicPublishedInput,
  loadDynamicPublishedAdapterSnapshot,
  materialDigest,
  type DynamicPublishedInvocationResult,
  type PaidOperationInterpreter,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import { presentDevelopmentBtcUsdQuoteResult } from './btc-usd-quote-result'
import {
  projectDevelopmentAlternateBtcUsdQuoteResult,
} from './development-alternate-btc-usd-quote-result'
import {
  buildDevelopmentAlternatePublishedOperationEvidence,
} from './development-alternate-published-operation-evidence'
import { projectDevelopmentBtcUsdQuoteResult } from './btc-usd-quote-result'
import {
  buildDevelopmentPublishedOperationEvidence,
} from './development-published-operation-evidence'
import type { PublishedOperation } from './public'
import type {
  RouteTransportRuntime,
  X402RouteTransportRuntime,
} from './route-transport-runtime'
import { encodeX402PaymentRequiredHeader } from './server'

type ProviderKey = 'A' | 'B'
type Counters = { authorizations: number; signatures: number; sends: number }

const actor = {
  callerRef: 'agent:development-provider-selection',
  principalRef: 'principal:development-provider-selection',
}
const input = { symbol: 'BTC', convert: 'USD' } as const
const receivedAt = '2026-07-20T08:05:00.000Z'
const rawPayloads = {
  A: {
    data: {
      BTC: {
        symbol: 'BTC',
        quote: { USD: { price: 118_245.12, last_updated: '2026-07-20T08:04:00.000Z' } },
      },
    },
  },
  B: {
    spot: {
      base: 'BTC',
      quote: 'USD',
      amount: '118245.12',
      observed_at: '2026-07-20T08:04:00.000Z',
    },
  },
} as const

function requireProviderFixture<T>(value: T | undefined, errorCode: string): T {
  if (value === undefined) throw new Error(errorCode)
  return value
}

export async function runDevelopmentProviderConformanceScenario() {
  const fixtureA = buildDevelopmentPublishedOperationEvidence()
  const fixtureB = buildDevelopmentAlternatePublishedOperationEvidence()
  const successA = await runSelected('A', fixtureA, rawPayloads.A, 'success')
  const uncertainA = await runSelected('A', fixtureA, rawPayloads.A, 'uncertain')
  const aEvidence = reconciliationEvidenceFor(uncertainA)
  const aBeforeReconciliation = liveState(uncertainA)
  const aNotSettled = await uncertainA.live.host.recoverPaidOperation(
    uncertainA.prepared.invocationRef,
    aEvidence.action,
    aEvidence.payment,
  )
  const aAfterReconciliation = liveState(uncertainA)
  const successB = await runSelected('B', fixtureB, rawPayloads.B, 'success')
  const uncertainB = await runSelected('B', fixtureB, rawPayloads.B, 'uncertain', 'replay-target')
  const invalidA = await runSelected('A', fixtureA, { unexpected: true }, 'success')

  const crossedPayloads = {
    aIntoB: projectDevelopmentAlternateBtcUsdQuoteResult({
      payload: rawPayloads.A,
      receivedAt,
    }),
    bIntoA: projectDevelopmentBtcUsdQuoteResult({
      payload: rawPayloads.B,
      receivedAt,
    }),
  }

  const crossRefusals = await buildCommandRefusals(successA, successB)
  const reconciliationReplay = await replayAReconciliationAgainstB(
    uncertainA,
    uncertainB,
    aEvidence,
  )
  const uncertainAPaymentAttempt = requireProviderFixture(
    uncertainA.paymentAttempt,
    'provider_a_payment_attempt_missing',
  )
  const restoreRefusals = [
    restoreSnapshot('A-as-B', uncertainA, fixtureB, uncertainA.snapshot),
    restoreSnapshot('B-as-A', uncertainB, fixtureA, uncertainB.snapshot),
    restorePayeeTamper(uncertainA),
    restorePaymentIdentifierCollision(uncertainB, uncertainAPaymentAttempt.paymentIdentifier),
  ]

  return {
    rawPayloads,
    countersBeforeExplicitB: { authorizations: 0, signatures: 0, sends: 0 },
    successes: { A: successA, B: successB },
    uncertainA,
    aNotSettled: {
      source: 'reconciliation' as const,
      outcome: aNotSettled,
      before: aBeforeReconciliation,
      after: aAfterReconciliation,
      evidence: aEvidence,
    },
    invalidA,
    explicitBAfterANotSettled: successB,
    explicitBAfterAInvalid: await runSelected('B', fixtureB, rawPayloads.B, 'success', 'after-invalid'),
    crossedPayloads,
    crossRefusals,
    reconciliationReplay,
    restoreRefusals,
  }
}

async function runSelected(
  key: ProviderKey,
  fixture: Readonly<{
    operation: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>['operation']
    descriptor: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>['descriptor']
  }>,
  payload: unknown,
  mode: 'success' | 'uncertain',
  suffix = 'primary',
) {
  const counters: Counters = { authorizations: 0, signatures: 0, sends: 0 }
  const operation = fixture.operation
  const clock = operation.readiness.observedAt + 1_000
  const runtime = paymentRuntime(operation, payload, counters, mode)
  let invocationSequence = 0
  let authoritySequence = 0
  let attemptSequence = 0
  const scope = `${key.toLowerCase()}:${operation.identity.businessId}:${operation.operationId}:${operation.identity.publicationRevision}:${suffix}`
  const adapter = createDynamicPublishedActionInvocationAdapter({
    operation,
    source: createDevelopmentDynamicPublishedSource([operation]),
    runtime,
    now: () => clock,
    nextInvocationRef: () => `invocation:${scope}:${++invocationSequence}`,
    nextAuthorityRef: () => `authority:${scope}:${++authoritySequence}`,
    nextAttemptRef: () => `attempt:${scope}:${++attemptSequence}`,
    verifyPaymentReconciliationEvidence: () => true,
  })
  const application = createDevelopmentInvocationApplication({
    adapter,
    sourceCommands: {
      leaseOwner: () => `worker:${scope}`,
      reconciliationEvidence: () => undefined,
    },
  })
  const host = application.bindStandalone({ actor })
  const service = createDevelopmentPaidOperationApplicationService({
    host,
    interpreter: interpreter(key, operation, payload),
  })
  const prepared = host.prepare(input, 60_000)
  const initial = service.inspect({
    invocationRef: prepared.invocationRef,
    expectedInvocationVersion: prepared.invocationVersion,
  })
  const authorized = await service.command({
    invocationRef: prepared.invocationRef,
    expectedInvocationVersion: prepared.invocationVersion,
    command: { kind: 'authorize', accept: true },
  })
  if (authorized.kind !== 'accepted') throw new Error(`development_${key}_authorize_refused`)
  const realDateNow = Date.now
  Date.now = () => clock
  let executed
  try {
    executed = await service.command({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: authorized.value.semantics.identity.expectedInvocationVersion,
      command: { kind: 'execute' },
    })
  } finally {
    Date.now = realDateNow
  }
  const snapshot = adapter.exportSnapshot()
  const view = host.inspect(prepared.invocationRef)
  if (view === undefined) throw new Error(`development_${key}_view_missing`)
  return {
    provider: key,
    operation,
    descriptor: fixture.descriptor,
    commands: ['authorize', 'execute'] as const,
    prepared,
    initial,
    authorized,
    executed,
    view,
    snapshot,
    snapshotDigest: canonicalDigest(snapshot),
    counters,
    paymentAttempt: snapshot.paymentAttempts[0],
    normalized: key === 'A'
      ? projectDevelopmentBtcUsdQuoteResult({ payload, receivedAt })
      : projectDevelopmentAlternateBtcUsdQuoteResult({ payload, receivedAt }),
    live: { adapter, host, service },
  }
}

function interpreter(
  key: ProviderKey,
  operation: PublishedOperation,
  payload: unknown,
): PaidOperationInterpreter<DynamicPublishedInvocationResult> {
  return {
    interpret: () => {
      const projected = key === 'A'
        ? projectDevelopmentBtcUsdQuoteResult({ payload, receivedAt })
        : projectDevelopmentAlternateBtcUsdQuoteResult({ payload, receivedAt })
      const resultDelivery = projected.kind === 'accepted'
        ? presentDevelopmentBtcUsdQuoteResult(projected.result).resultDelivery
        : { state: 'invalid' as const, code: projected.code, evidenceRefs: [] }
      return {
        operation: {
          operationKey: operation.operationId,
          providerId: operation.identity.businessId,
          providerName: key === 'A' ? 'Development Quote Provider' : 'Development Alternate Quote Provider',
          operationRevision: String(operation.identity.publicationRevision),
          materialInputs: input,
        },
        presentation: {
          title: 'Get the latest BTC price in USD',
          summary: 'Retrieve one current BTC/USD measurement.',
          blocks: [{ kind: 'text' as const, label: 'Pair', value: 'BTC/USD' }],
        },
        maximumAuthorizedCharge: { currency: 'USD', amountMinor: 1 },
        queryRecipient: operation.identity.businessId,
        resultDelivery,
        environment: {
          name: 'local-development',
          evidenceClass: 'labelled_local_mock',
          claimCeiling: 'mechanism_only_not_real_settlement_or_provider_fulfilment',
        },
      }
    },
  }
}

function paymentRuntime(
  operation: PublishedOperation,
  payload: unknown,
  counters: Counters,
  mode: 'success' | 'uncertain',
): X402RouteTransportRuntime {
  const config = JSON.parse(operation.transport.configJson)
  const query = config.query.map((entry: { parameter: string }) =>
    `${entry.parameter}=${entry.parameter === 'base' ? 'BTC' : entry.parameter === 'quote' ? 'USD' : input[entry.parameter as keyof typeof input]}`,
  ).join('&')
  const challenge = {
    x402Version: 2 as const,
    resource: { url: `${operation.binding.endpointUrl}?${query}` },
    accepts: [{
      scheme: config.scheme,
      network: config.network,
      amount: '10000',
      asset: config.asset,
      payTo: config.payTo,
      maxTimeoutSeconds: 30,
      extra: {},
    }],
  }
  const custody = new Map<string, {
    custodyRef: string
    authorizationDigest: string
    paymentSignature: string
  }>()
  return {
    resolveCredential: () => `mock:credential:${operation.identity.businessId}`,
    x402PaymentSigningAvailable: () => true,
    prepareX402PaymentAuthorization: async (request) => {
      const identity = canonicalDigest({
        provider: operation.identity.businessId,
        paymentIdentifier: request.paymentIdentifier,
        challengeDigest: request.challengeDigest,
        attemptRef: request.attemptRef,
        effectGeneration: request.effectGeneration,
      })
      const prior = custody.get(identity)
      if (prior !== undefined) {
        return {
          custodyRef: prior.custodyRef,
          authorizationDigest: prior.authorizationDigest,
        }
      }
      counters.authorizations += 1
      counters.signatures += 1
      const paymentSignature = `mock:signature:${operation.identity.businessId}:${identity}`
      const prepared = {
        custodyRef: canonicalDigest({
          kind: 'development-x402-custody:v1',
          provider: operation.identity.businessId,
          identity,
        }),
        authorizationDigest: canonicalDigest(paymentSignature),
      }
      custody.set(identity, { ...prepared, paymentSignature })
      return prepared
    },
    readX402PaymentAuthorization: async ({ custodyRef, authorizationDigest }) =>
      [...custody.values()].find((value) =>
        value.custodyRef === custodyRef && value.authorizationDigest === authorizationDigest)?.paymentSignature,
    readX402PaymentAuthorizationByDigest: async ({ authorizationDigest }) =>
      [...custody.values()].find((value) => value.authorizationDigest === authorizationDigest)?.paymentSignature,
    send: async (_url, init) => {
      if (init?.headers?.['Payment-Signature'] === undefined) {
        return new Response('', {
          status: 402,
          headers: { 'payment-required': encodeX402PaymentRequiredHeader(challenge) },
        })
      }
      counters.sends += 1
      if (mode === 'uncertain') throw new Error(`lost_response:${operation.identity.businessId}`)
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          'payment-response': `mock:payment-proof:${operation.identity.businessId}`,
          'provider-receipt': `mock:receipt:${operation.identity.businessId}`,
        },
      })
    },
  }
}

async function buildCommandRefusals(
  a: Awaited<ReturnType<typeof runSelected>>,
  b: Awaited<ReturnType<typeof runSelected>>,
) {
  const cases = [
    {
      caseName: 'duplicate_authorize',
      selected: a,
      input: {
        invocationRef: a.prepared.invocationRef,
        expectedInvocationVersion: a.prepared.invocationVersion,
        command: { kind: 'authorize' as const, accept: true },
      },
    },
    {
      caseName: 'crossed_a_continuation_on_b',
      selected: b,
      input: {
        invocationRef: a.prepared.invocationRef,
        expectedInvocationVersion: a.view.invocationVersion,
        command: { kind: 'execute' as const },
      },
    },
    {
      caseName: 'stale_expected_version',
      selected: b,
      input: {
        invocationRef: b.prepared.invocationRef,
        expectedInvocationVersion: b.prepared.invocationVersion,
        command: { kind: 'execute' as const },
      },
    },
  ] as const
  const records = []
  for (const item of cases) {
    const before = crossState(a, b)
    const outcome = await item.selected.live.service.command(item.input)
    records.push({
      caseName: item.caseName,
      source: 'command' as const,
      input: item.input,
      outcome,
      before,
      after: crossState(a, b),
    })
  }
  return records
}

function crossState(
  a: Awaited<ReturnType<typeof runSelected>>,
  b: Awaited<ReturnType<typeof runSelected>>,
) {
  return {
    A: liveState(a),
    B: liveState(b),
  }
}

function restoreSnapshot(
  selected: string,
  run: Awaited<ReturnType<typeof runSelected>>,
  otherFixture: Readonly<{
    operation: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>['operation']
    descriptor: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>['descriptor']
  }>,
  snapshot: Awaited<ReturnType<typeof runSelected>>['snapshot'],
) {
  const before = liveState(run)
  try {
    const loaded = loadDynamicPublishedAdapterSnapshot(snapshot, snapshotAnchors(run, otherFixture))
    const after = liveState(run)
    return { selected, source: 'snapshot_restore' as const, outcome: { kind: 'accepted' as const, loaded }, before, after }
  } catch (error) {
    const after = liveState(run)
    return {
      selected,
      source: 'snapshot_restore' as const,
      outcome: {
        kind: 'refused' as const,
        code: error instanceof Error ? error.message : 'non_error_rejection',
      },
      before,
      after,
    }
  }
}

function snapshotAnchors(
  run: Awaited<ReturnType<typeof runSelected>>,
  fixture: Readonly<{
    operation: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>['operation']
    descriptor: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>['descriptor']
  }> = run,
) {
  const preparedAuthority = requireProviderFixture(
    run.prepared.authority,
    'provider_prepared_authority_missing',
  )
  return {
    operation: fixture.operation,
    descriptor: fixture.descriptor,
    actor,
    origin: {
      kind: 'standalone' as const,
      callerRef: actor.callerRef,
      principalRef: actor.principalRef,
    },
    issuedAuthority: {
      reference: preparedAuthority.reference,
      accepted: { kind: 'approve_each' as const, authorityRef: preparedAuthority.reference },
      materialInputDigest: materialDigest(buildDynamicPublishedInput({
        operation: run.operation,
        descriptor: run.descriptor,
        value: input,
      }), ['operationKey', 'inputDigest', 'sourceSnapshotDigest', 'target']),
    },
    expectedEffectCount: 1,
    ...(run.paymentAttempt === undefined
      ? {}
      : { expectedChallengeDigest: run.paymentAttempt.challengeDigest }),
    expectedSemanticClaim: {
      ownerInvocationRef: run.prepared.invocationRef,
      status: run.view.control.state === 'terminal' ? 'completed' as const : 'uncertain' as const,
    },
  }
}

function restorePayeeTamper(run: Awaited<ReturnType<typeof runSelected>>) {
  const copy = structuredClone(run.snapshot)
  if (copy.paymentAttempts[0] === undefined) throw new Error('payee_tamper_payment_attempt_missing')
  ;(copy.paymentAttempts[0] as { payTo: string }).payTo = '0xother-recipient'
  return restoreSnapshot('A-payee-tamper', run, run, copy)
}

function restorePaymentIdentifierCollision(
  run: Awaited<ReturnType<typeof runSelected>>,
  paymentIdentifier: string,
) {
  const copy = structuredClone(run.snapshot)
  if (copy.paymentAttempts[0] === undefined) throw new Error('collision_payment_attempt_missing')
  ;(copy.paymentAttempts[0] as { paymentIdentifier: string }).paymentIdentifier = paymentIdentifier
  return restoreSnapshot('forced-payment-identifier-collision', run, run, copy)
}

function reconciliationEvidenceFor(run: Awaited<ReturnType<typeof runSelected>>) {
  const paymentAttempt = run.paymentAttempt
  const attempt = run.view.attempts[0]
  if (paymentAttempt === undefined || attempt === undefined) {
    throw new Error('reconciliation_material_missing')
  }
  const observedAt = new Date(run.operation.readiness.observedAt + 1_000).toISOString()
  const actionMaterial = {
    kind: 'action_invocation_reconciliation' as const,
    version: 1 as const,
    evidenceRef: `provider:reconciliation:${run.provider}`,
    source: `published-operation:${run.operation.operationId}`,
    invocationRef: run.view.invocationRef,
    attemptRef: attempt.attemptRef,
    effectGeneration: attempt.effectGeneration,
    resolution: 'released' as const,
    observedAt,
  }
  const paymentMaterial = {
    kind: 'x402_payment_reconciliation' as const,
    version: 1 as const,
    evidenceRef: `payment:reconciliation:${run.provider}`,
    evidenceRefs: [`provider:payment-readback:${run.provider}`],
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
    observedAt,
  }
  return {
    action: { ...actionMaterial, digest: canonicalDigest(actionMaterial) },
    payment: { ...paymentMaterial, digest: canonicalDigest(paymentMaterial) },
  }
}

async function replayAReconciliationAgainstB(
  a: Awaited<ReturnType<typeof runSelected>>,
  b: Awaited<ReturnType<typeof runSelected>>,
  evidence: ReturnType<typeof reconciliationEvidenceFor>,
) {
  const before = crossState(a, b)
  const outcome = await b.live.host.recoverPaidOperation(
    b.prepared.invocationRef,
    evidence.action,
    evidence.payment,
  )
  return {
    caseName: 'a_reconciliation_replay_against_b',
    source: 'reconciliation' as const,
    outcome,
    before,
    after: crossState(a, b),
  }
}

function liveState(run: Awaited<ReturnType<typeof runSelected>>) {
  const snapshot = run.live.adapter.exportSnapshot()
  return {
    snapshot,
    snapshotDigest: canonicalDigest(snapshot),
    counters: { ...run.counters },
  }
}

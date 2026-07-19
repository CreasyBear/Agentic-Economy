import { invokeRegisteredRouteTransport } from './route-transport-runtime'
import {
  developmentReconciliableLostResponseRuntime,
  developmentSuccessRuntime,
  type DevelopmentEffectCounts,
  type DevelopmentTransportTraceEvent,
} from './development-host-scenario-runtime'
import { buildDevelopmentPublishedOperationEvidence } from './development-published-operation-evidence'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  directEndpointBaselineTask,
  gate10FrozenPassPolicy,
  type DirectEndpointBaselineRun,
  type DirectEndpointCase,
  type DirectEndpointTraceEvent,
} from './direct-endpoint-baseline-contract'

type Authority = Readonly<{
  reference: string
  inputDigest: string
  scopeDigest: string
  accepted: boolean
  valid: boolean
}>

export async function runFrozenDirectEndpointBaseline(): Promise<DirectEndpointBaselineRun> {
  const originalNow = Date.now
  Date.now = () => buildDevelopmentPublishedOperationEvidence().operation.readiness.observedAt + 1_000
  try {
    const cases = []
    for (const caseName of directEndpointBaselineTask.cases) cases.push(await runCase(caseName))
    const material = {
      format: 'adr-010-direct-endpoint-baseline-run:v2' as const,
      environment: 'MOCK/DEVELOPMENT ONLY' as const,
      task: directEndpointBaselineTask,
      policy: gate10FrozenPassPolicy,
      cases,
    }
    return {
      ...material,
      executableDigest: canonicalDigest(material as unknown as StableHashValue),
    }
  } finally {
    Date.now = originalNow
  }
}

async function runCase(caseName: DirectEndpointCase) {
  const fixture = buildDevelopmentPublishedOperationEvidence()
  assertTaskBinding(fixture)
  const trace: DirectEndpointTraceEvent[] = []
  const effects: DevelopmentEffectCounts = { payment: 0, provider: 0 }
  const append = (
    source: DirectEndpointTraceEvent['source'],
    kind: DirectEndpointTraceEvent['kind'],
    detail: DirectEndpointTraceEvent['detail'],
  ) => trace.push({ sequence: trace.length + 1, case: caseName, source, kind, detail })
  const observeTransport = (event: DevelopmentTransportTraceEvent) => append(
    event.kind.startsWith('provider_') ? 'provider_runtime' : 'transport_runtime',
    event.kind,
    event.detail,
  )
  const attemptRef = `direct:${caseName}:attempt:1`
  const reconciliable = caseName === 'post_release_uncertainty'
    ? developmentReconciliableLostResponseRuntime(
        fixture.operation.binding.endpointUrl,
        effects,
        attemptRef,
        observeTransport,
      )
    : undefined
  const runtime = reconciliable?.runtime ?? developmentSuccessRuntime(
    fixture.operation.binding.endpointUrl,
    effects,
    observeTransport,
  )
  append('direct_controller', 'command', { name: 'begin', facts: directEndpointBaselineTask.startingFacts })
  append('direct_controller', 'prompt', { missingFields: directEndpointBaselineTask.initialMissingFields })
  append('direct_controller', 'answer', { fields: directEndpointBaselineTask.answer })
  let input: Readonly<Record<string, string>> = {
    ...directEndpointBaselineTask.startingFacts,
    ...directEndpointBaselineTask.answer,
  }
  let authority = prepareAuthority(input, fixture, append, caseName, 1)
  authority = decideAuthority(authority, append)
  if (caseName === 'material_correction') {
    append('direct_controller', 'command', {
      name: 'correct',
      expectedInputDigest: authority.inputDigest,
      corrections: directEndpointBaselineTask.correction,
    })
    input = { ...input, ...directEndpointBaselineTask.correction }
    append('direct_controller', 'authority_invalidated', {
      authorityRef: authority.reference,
      reason: 'material_input_changed',
      oldInputDigest: authority.inputDigest,
      newInputDigest: canonicalDigest(input),
    })
    authority = { ...authority, valid: false }
    append('direct_controller', 'command', { name: 'execute', authorityRef: authority.reference })
    append('direct_controller', 'authority_refused', {
      authorityRef: authority.reference,
      reason: exactAuthorityRefusal(authority, input),
    })
    authority = decideAuthority(prepareAuthority(input, fixture, append, caseName, 2), append)
  }
  append('direct_controller', 'command', { name: 'execute', authorityRef: authority.reference })
  const refusal = exactAuthorityRefusal(authority, input)
  if (refusal !== null) throw new Error(`direct_endpoint_authority_refused:${refusal}`)
  const observation = await invokeRegisteredRouteTransport({
    binding: {
      adapterId: fixture.operation.binding.adapter.adapterId,
      endpointUrl: fixture.operation.binding.endpointUrl,
      credentialRef: fixture.operation.binding.credentialRef,
      configJson: fixture.operation.transport.configJson,
      configDigest: fixture.operation.transport.configDigest,
    },
    authority: {
      attemptRef,
      operationKeyDigest: canonicalDigest({ caseName, input }),
      mandateDigest: authority.scopeDigest,
      grantDigest: canonicalDigest(authority),
      capabilityContractDigest: fixture.operation.identity.contractDigest,
      maximumSpend: directEndpointBaselineTask.operation.price,
      expiresAt: fixture.operation.readiness.validUntil,
      callIdentity: {
        keyId: `direct:${authority.reference}`,
        signature: canonicalDigest({ authorityRef: authority.reference, input }),
      },
    },
    inputJson: JSON.stringify(input),
  }, runtime)
  append(
    'direct_controller',
    'observation',
    observation as unknown as Readonly<Record<string, StableHashValue>>,
  )
  if (observation.disposition === 'unknown' && observation.releaseStarted) {
    append('direct_controller', 'continuation', {
      name: 'reconcile_before_retry',
      humanDecisionRequired: false,
      reason: observation.failureCode ?? 'unknown',
    })
    const reconciled = reconciliable?.reconcile(attemptRef)
    if (reconciled?.resolution !== 'released') throw new Error('direct_endpoint_reconciliation_failed')
    append('direct_controller', 'observation', {
      disposition: 'reconciled_released',
      evidence: reconciled.evidence,
      attemptRef,
    })
    return {
      case: caseName,
      trace,
      final: {
        state: 'reconciled_released' as const,
        outputDigest: null,
        releaseStarted: true,
        providerCalls: effects.provider,
        paymentAttempts: effects.payment,
      },
    }
  }
  if (observation.disposition !== 'succeeded' || observation.outputJson === undefined) {
    throw new Error(`direct_endpoint_execution_failed:${observation.failureCode ?? observation.disposition}`)
  }
  return {
    case: caseName,
    trace,
    final: {
      state: 'completed' as const,
      outputDigest: canonicalDigest(JSON.parse(observation.outputJson) as StableHashValue),
      releaseStarted: observation.releaseStarted,
      providerCalls: effects.provider,
      paymentAttempts: effects.payment,
    },
  }
}

function prepareAuthority(
  input: Readonly<Record<string, string>>,
  fixture: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>,
  append: (
    source: DirectEndpointTraceEvent['source'],
    kind: DirectEndpointTraceEvent['kind'],
    detail: DirectEndpointTraceEvent['detail'],
  ) => void,
  caseName: DirectEndpointCase,
  generation: number,
): Authority {
  const inputDigest = canonicalDigest(input)
  const scope = {
    operationId: fixture.operation.operationId,
    operationVersion: fixture.descriptor.version,
    publicationRef: fixture.operation.identity.publicationRef,
    publicationRevision: fixture.operation.identity.publicationRevision,
    materialDigest: fixture.operation.materialDigest,
    inputDigest,
    amount: directEndpointBaselineTask.operation.price,
    payment: directEndpointBaselineTask.operation.payment,
    recipient: directEndpointBaselineTask.operation.recipient,
    purpose: directEndpointBaselineTask.operation.purpose,
    disclosedFields: directEndpointBaselineTask.operation.disclosedFields,
  }
  const authority = {
    reference: `direct:${caseName}:authority:${generation}`,
    inputDigest,
    scopeDigest: canonicalDigest(scope),
    accepted: false,
    valid: true,
  }
  append('direct_controller', 'prepared', { authorityRef: authority.reference, scope })
  return authority
}

function decideAuthority(
  authority: Authority,
  append: (
    source: DirectEndpointTraceEvent['source'],
    kind: DirectEndpointTraceEvent['kind'],
    detail: DirectEndpointTraceEvent['detail'],
  ) => void,
): Authority {
  append('direct_controller', 'authority_decision', {
    authorityRef: authority.reference,
    decision: 'approve',
    scopeDigest: authority.scopeDigest,
  })
  return { ...authority, accepted: true }
}

function exactAuthorityRefusal(
  authority: Authority,
  input: Readonly<Record<string, string>>,
): 'authority_not_accepted' | 'material_input_changed' | null {
  if (!authority.accepted) return 'authority_not_accepted'
  if (!authority.valid || authority.inputDigest !== canonicalDigest(input)) return 'material_input_changed'
  return null
}

function assertTaskBinding(
  fixture: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>,
): void {
  const task = directEndpointBaselineTask.operation
  if (fixture.operation.identity.endpoint.resource !== `${task.method} ${task.path}`
    || fixture.operation.identity.publicationRef !== task.publicationRef
    || fixture.operation.identity.publicationRevision !== task.publicationRevision
    || fixture.operation.identity.price.kind !== 'fixed'
    || fixture.operation.identity.price.currency !== task.price.currency
    || fixture.operation.identity.price.amountMinor !== task.price.amountMinor
    || fixture.operation.identity.payment.kind !== 'x402'
    || fixture.operation.identity.payment.network !== task.payment.network
    || fixture.operation.identity.payment.asset !== task.payment.asset
    || fixture.operation.identity.payment.payTo !== task.payment.payTo) {
    throw new Error('direct_endpoint_task_binding_invalid')
  }
}

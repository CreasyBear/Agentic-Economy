import { describe, expect, it } from 'vitest'

import {
  handleHostedPaidOperationHumanCommand,
  handleHostedPaidOperationHumanInspect,
  type HostedPaidOperationTransportGateway,
} from '@/lib/server/hosted-paid-operation-human-api'
import {
  handleHostedPaidOperationAgentCommand,
  handleHostedPaidOperationAgentInspect,
} from '@/lib/server/hosted-paid-operation-agent-api'
import type { PaidOperationProjection } from '@/modules/action-invocation/paid-operation-application-service'

describe('hosted paid-operation authenticated adapters', () => {
  it('projects identical semantics and frozen host inputs without treating identity as authority', async () => {
    const projection = paidProjection()
    const gateway: HostedPaidOperationTransportGateway = {
      inspect: async () => ({ kind: 'accepted', value: projection }),
      command: async () => ({ kind: 'accepted', value: projection }),
    }
    const human = await handleHostedPaidOperationHumanInspect('invocation:paid', 3, {
      authenticate: async () => ({ userId: 'owner:paid', sessionId: 'session:human' }),
      gateway,
      provenance: 'Labelled mock provider',
    })
    const agent = await handleHostedPaidOperationAgentInspect('invocation:paid', 3, {
      authenticate: async () => ({
        kind: 'authenticated',
        principal: {
          actor: { principalRef: 'owner:paid', callerRef: 'session:human' },
          credentialId: 'key:paid',
          scopes: ['paid_operation:invoke'],
        },
      }),
      gateway,
      provenance: 'Labelled mock provider',
    })
    const humanBody = await human.json()
    const agentBody = await agent.json()

    expect(humanBody.projection.semanticDigest).toBe(agentBody.projection.semanticDigest)
    expect(humanBody).toMatchObject({
      schema: 'agentic-paid-operation:v1',
      expectedInvocationVersion: 3,
      environment: {
        name: 'Local labelled sandbox',
        provenance: 'Labelled mock provider',
        evidenceClass: 'local_labelled_sandbox_fixture',
        claimCeiling: 'Local authenticated route fixtures only.',
      },
      card: {
        disclosure: {
          providerDisplayName: 'Mock provider A',
          materialFields: ['convert', 'symbol'],
          maximumCharge: { currency: 'USD', amountMinor: 1 },
        },
        authorize: expect.objectContaining({ command: 'authorize', accept: true }),
        refuse: expect.objectContaining({ command: 'authorize', accept: false }),
        pendingCommand: null,
        transportRescue: null,
        paymentTruth: { state: 'not_submitted' },
        settlementTruth: { state: 'no_evidence' },
        resultTruth: { state: 'not_delivered' },
        safeContinuation: expect.objectContaining({ command: 'authorize' }),
        operationBlocks: expect.any(Array),
        runtimeEvidence: expect.objectContaining({
          evidenceClass: 'local_labelled_sandbox_fixture',
        }),
        technicalDetails: expect.objectContaining({
          invocationRef: 'invocation:paid',
          expectedInvocationVersion: 3,
          semanticDigest: 'sha256:semantic',
        }),
      },
    })
    expect(JSON.stringify(humanBody)).not.toMatch(/authorityRef|reconciliationEvidence|paymentReconciliationEvidence/u)
    expect(JSON.stringify(agentBody)).not.toMatch(/authorityRef|reconciliationEvidence|paymentReconciliationEvidence/u)
  })

  it('does not disclose facts before auth or across owners and fences stale/disallowed commands', async () => {
    let mutations = 0
    const gateway: HostedPaidOperationTransportGateway = {
      inspect: async () => ({ kind: 'refused', code: 'invocation_not_found' }),
      command: async ({ command }) => {
        mutations += 1
        return command.kind === 'execute'
          ? { kind: 'refused', code: 'stale_invocation_version' }
          : { kind: 'refused', code: 'continuation_not_allowed' }
      },
    }
    const unauthenticated = await handleHostedPaidOperationHumanInspect('secret-ref', 3, {
      authenticate: async () => null,
      gateway,
      provenance: 'Labelled mock provider',
    })
    expect(unauthenticated.status).toBe(401)
    expect(await unauthenticated.json()).toEqual({
      kind: 'refused',
      code: 'authentication_required',
      relation: { authenticate: '/sign-in?redirect=%2Factions%2Fpaid%2Fsecret-ref' },
    })

    const unavailable = await handleHostedPaidOperationHumanInspect('secret-ref', 3, {
      authenticate: async () => ({ userId: 'owner:other', sessionId: 'session:other' }),
      gateway,
      provenance: 'Labelled mock provider',
    })
    expect(unavailable.status).toBe(404)
    expect(await unavailable.json()).toEqual({
      kind: 'refused',
      code: 'invocation_not_found',
    })

    const stale = await handleHostedPaidOperationHumanCommand(
      new Request('https://ae.test/actions/paid/secret-ref', {
        method: 'POST',
        body: JSON.stringify({
          command: 'execute',
          commandId: 'command:one',
          expectedInvocationVersion: 3,
        }),
      }),
      'secret-ref',
      {
        authenticate: async () => ({ userId: 'owner:paid', sessionId: 'session:paid' }),
        gateway,
        provenance: 'Labelled mock provider',
        currentVersion: async () => 4,
      },
    )
    expect(stale.status).toBe(409)
    expect(await stale.json()).toEqual({
      kind: 'refused',
      code: 'stale_invocation_version',
      suppliedVersion: 3,
      currentExpectedInvocationVersion: 4,
      relation: { inspect: '/actions/paid/secret-ref?expectedInvocationVersion=4' },
    })
    expect(mutations).toBe(1)
  })

  it('accepts public reconciliation intent only and converts ambiguous transport into read-only inspect recovery', async () => {
    const seen: unknown[] = []
    const gateway: HostedPaidOperationTransportGateway = {
      inspect: async () => ({ kind: 'accepted', value: paidProjection() }),
      command: async (input) => {
        seen.push(input)
        throw new Error('transport_lost')
      },
    }
    const response = await handleHostedPaidOperationAgentCommand(
      new Request('https://ae.test/api/v1/paid-operations/invocation:paid/commands', {
        method: 'POST',
        body: JSON.stringify({
          command: 'reconcile',
          commandId: 'command:reconcile',
          expectedInvocationVersion: 3,
        }),
      }),
      'invocation:paid',
      {
        authenticate: async () => ({
          kind: 'authenticated',
          principal: {
            actor: { principalRef: 'owner:paid', callerRef: 'agent:key' },
            credentialId: 'key:paid',
            scopes: ['paid_operation:invoke'],
          },
        }),
        gateway,
        provenance: 'Labelled mock provider',
        requestId: () => 'request:ambiguous',
      },
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      kind: 'update_not_confirmed',
      requestId: 'request:ambiguous',
      relation: {
        inspect: '/api/v1/paid-operations/invocation%3Apaid?expectedInvocationVersion=3',
      },
    })
    expect(seen).toEqual([expect.objectContaining({
      command: { kind: 'reconcile' },
      commandId: 'command:reconcile',
    })])

    const fabricated = await handleHostedPaidOperationAgentCommand(
      new Request('https://ae.test/api/v1/paid-operations/invocation:paid/commands', {
        method: 'POST',
        body: JSON.stringify({
          command: 'reconcile',
          commandId: 'command:fake',
          expectedInvocationVersion: 3,
          resolution: 'settled',
        }),
      }),
      'invocation:paid',
      {
        authenticate: async () => ({
          kind: 'authenticated',
          principal: {
            actor: { principalRef: 'owner:paid', callerRef: 'agent:key' },
            credentialId: 'key:paid',
            scopes: ['paid_operation:invoke'],
          },
        }),
        gateway,
        provenance: 'Labelled mock provider',
      },
    )
    expect(fabricated.status).toBe(422)
    expect(seen).toHaveLength(1)
  })
})

function paidProjection(): PaidOperationProjection {
  const semantics = {
    schema: 'agentic-paid-operation:v1',
    identity: { invocationRef: 'invocation:paid', expectedInvocationVersion: 3 },
    operation: {
      operationKey: 'btc-usd',
      providerId: 'provider:A',
      providerName: 'Mock provider A',
      operationRevision: 'revision:1',
      materialInputs: { symbol: 'BTC', convert: 'USD' },
    },
    presentation: {
      title: 'Get the latest BTC price in USD',
      summary: 'One labelled mock paid operation.',
      blocks: [{ kind: 'text', label: 'Task', value: 'BTC to USD' }],
    },
    maximumAuthorizedCharge: { currency: 'USD', amountMinor: 1 },
    queryRelease: { state: 'not_released' },
    paymentAuthorization: { state: 'not_created' },
    paymentSubmission: { state: 'not_submitted' },
    settlement: { state: 'no_evidence' },
    resultDelivery: { state: 'not_delivered' },
    environment: {
      name: 'Local labelled sandbox',
      evidenceClass: 'local_labelled_sandbox_fixture',
      claimCeiling: 'Local authenticated route fixtures only.',
    },
    error: null,
    continuations: [{
      kind: 'authorize',
      command: 'authorize_paid_operation',
      requiredInput: ['authorityDecision'],
      expectedInvocationVersion: 3,
      authorityRequired: true,
    }],
  } as const
  return {
    semantics,
    human: {
      kind: 'human_rich_paid_operation',
      title: semantics.presentation.title,
      sections: [],
      semantics,
      semanticDigest: 'sha256:semantic',
      semanticDigestUse: 'projection_equality_only_not_authority',
    },
    agent: {
      kind: 'external_agent_paid_operation',
      semantics,
      semanticDigest: 'sha256:semantic',
      semanticDigestUse: 'projection_equality_only_not_authority',
    },
  }
}

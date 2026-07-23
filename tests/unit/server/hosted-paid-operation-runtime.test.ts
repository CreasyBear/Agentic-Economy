import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  createHostedPaidOperationRuntime,
  type HostedPaidOperationIntentTransport,
} from '@/lib/server/hosted-paid-operation-runtime'
import type { HostedPaidOperationTransportResult } from '@/lib/server/hosted-paid-operation-human-api'

describe('hosted paid-operation intent runtime', () => {
  it('sends only closed create, inspect and command intent', async () => {
    const calls: unknown[] = []
    const accepted = projection(1)
    const transport: HostedPaidOperationIntentTransport = {
      create: async (input) => {
        calls.push(input)
        return { kind: 'created', invocationRef: 'invocation:1', expectedInvocationVersion: 1 }
      },
      inspect: async (input) => {
        calls.push(input)
        return accepted
      },
      command: async (input) => {
        calls.push(input)
        return accepted
      },
      currentVersion: async () => 1,
    }
    const runtime = createHostedPaidOperationRuntime({ transport })
    const forgedActor = { principalRef: 'forged:principal', callerRef: 'forged:caller' }
    await runtime.creation.create({ actor: forgedActor, setup: { providerKey: 'A' } })
    await runtime.gateway.inspect({
      actor: forgedActor,
      invocationRef: 'invocation:1',
      expectedInvocationVersion: 1,
    })
    await runtime.gateway.command({
      actor: forgedActor,
      invocationRef: 'invocation:1',
      expectedInvocationVersion: 1,
      commandId: 'command:1',
      command: { kind: 'authorize', accept: true },
    })
    expect(calls).toEqual([
      { providerKey: 'A' },
      { invocationRef: 'invocation:1', expectedInvocationVersion: 1 },
      {
        invocationRef: 'invocation:1',
        expectedInvocationVersion: 1,
        commandId: 'command:1',
        command: { kind: 'authorize', accept: true },
      },
    ])
    expect(JSON.stringify(calls)).not.toMatch(
      /owner|principal|authorityRef|selectedSource|payment|result|evidence|resolution/u,
    )
  })

  it('preserves shared projection digest, version and provenance for both adapters', async () => {
    const accepted = projection(4)
    const transport: HostedPaidOperationIntentTransport = {
      create: async () => ({ kind: 'created', invocationRef: 'invocation:1', expectedInvocationVersion: 1 }),
      inspect: async () => accepted,
      command: async () => accepted,
      currentVersion: async () => 4,
    }
    const runtime = createHostedPaidOperationRuntime({
      transport,
      provenance: 'Labelled mock provider',
    })
    const result = await runtime.gateway.inspect({
      actor: { principalRef: 'ignored', callerRef: 'ignored' },
      invocationRef: 'invocation:1',
      expectedInvocationVersion: 4,
    })
    expect(result).toBe(accepted)
    expect(runtime.provenance).toBe('Labelled mock provider')
    if (result.kind !== 'accepted') return
    expect(result.value.human.semanticDigest).toBe(result.value.agent.semanticDigest)
    expect(result.value.semantics.identity.expectedInvocationVersion).toBe(4)
  })

  it('closes the generated tree over exactly the five accepted route shapes', () => {
    const tree = readFileSync('src/routeTree.gen.ts', 'utf8')
    for (const route of [
      '/actions/paid/new',
      '/actions/paid/$invocationRef',
      '/api/v1/paid-operations',
      '/api/v1/paid-operations/$invocationRef',
      '/api/v1/paid-operations/$invocationRef/commands',
    ]) {
      expect(tree).toContain(route)
    }
    expect(tree).not.toContain('/actions/paid/index')
    expect(tree).not.toContain('/api/v1/paid-operations/$invocationRef/retry')
  })

  it('keeps inspect on the query transport instead of accepting POST inspect', () => {
    const runtimeSource = readFileSync(
      'src/lib/server/hosted-paid-operation-runtime.ts',
      'utf8',
    )

    expect(runtimeSource).not.toContain("input.command.kind === 'inspect'")
    expect(runtimeSource).toContain(
      "const inspectIntent = sourceQuery('hostedPaidOperationGateway:authenticatedInspect')",
    )
  })
})

function projection(version: number): HostedPaidOperationTransportResult {
  const semantics = {
    schema: 'agentic-paid-operation:v1',
    identity: { invocationRef: 'invocation:1', expectedInvocationVersion: version },
    operation: {
      operationKey: 'btc-usd-a',
      providerId: 'provider:a',
      providerName: 'Sandbox provider A',
      operationRevision: '1',
      materialInputs: { symbol: 'BTC', convert: 'USD' },
    },
    presentation: {
      title: 'Get the latest BTC price in USD',
      summary: 'Labelled sandbox task.',
      blocks: [{ kind: 'text', label: 'Pair', value: 'BTC/USD' }],
    },
    maximumAuthorizedCharge: { currency: 'USD', amountMinor: 1 },
    queryRelease: { state: 'not_released' },
    paymentAuthorization: { state: 'not_created' },
    paymentSubmission: { state: 'not_submitted' },
    settlement: { state: 'no_evidence' },
    resultDelivery: { state: 'not_delivered' },
    environment: {
      name: 'local-labelled-sandbox-fixture',
      evidenceClass: 'local_labelled_sandbox_fixture',
      claimCeiling: 'durable_fixture_mechanics_only',
    },
    error: null,
    continuations: [],
  } as const
  return {
    kind: 'accepted',
    value: {
      semantics,
      human: {
        kind: 'human_rich_paid_operation',
        title: semantics.presentation.title,
        sections: [],
        semantics,
        semanticDigest: 'sha256:shared',
        semanticDigestUse: 'projection_equality_only_not_authority',
      },
      agent: {
        kind: 'external_agent_paid_operation',
        semantics,
        semanticDigest: 'sha256:shared',
        semanticDigestUse: 'projection_equality_only_not_authority',
      },
    },
  }
}

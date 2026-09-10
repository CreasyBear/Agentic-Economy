import { describe, expect, it } from 'vitest'

import {
  createAgentAuditEnvelope,
  type AgentAuditInput,
} from '@/modules/agent-access/agent-audit'

const vector = {
  actorPrincipalRef: `prn_${'1'.repeat(32)}`,
  activeAccountRef: `acc_${'2'.repeat(32)}`,
  agentRef: `prn_${'3'.repeat(32)}`,
  correlationRef: 'corr:vector/one',
  idempotencyRef: 'idempotency:vector/one',
  authorityGeneration: 7,
  occurredAt: 1_700_000_000_000,
} as const

describe('Agent audit target field boundary', () => {
  it('uses agentRef externally while preserving the lifecycle digest vector', () => {
    const input: AgentAuditInput = {
      ...vector,
      eventType: 'agent.created',
      beforeState: 'missing',
      outcome: 'created',
    }

    const envelope = createAgentAuditEnvelope(input)

    expect(envelope).toMatchObject({
      eventId: 'audit:agent.created:195be3293c26428d0aafe655f001af5047b19db9e4734613011d4ee8033ca860',
      targetType: 'agent',
      targetRef: vector.agentRef,
      commandDigest: 'sha256:195be3293c26428d0aafe655f001af5047b19db9e4734613011d4ee8033ca860',
    })
    expect(envelope).not.toHaveProperty('agentPrincipalRef')
  })

  it('uses the protected hash material for credential-observation vectors', () => {
    const input: AgentAuditInput = {
      ...vector,
      eventType: 'agent.credential.authenticated',
      credentialRef: `crd_${'4'.repeat(32)}`,
      beforeState: 'presented',
      outcome: 'authenticated',
    }

    const envelope = createAgentAuditEnvelope(input)

    expect(envelope).toMatchObject({
      eventId: 'audit:agent.credential.authenticated:a0d0b8c7d0672f040da28c2790cc476bcb19dc0af9327010ec48bb760ea1ab57',
      targetRef: vector.agentRef,
      commandDigest: 'sha256:0f7645918c97edbe60a67d3d92a4dbf98b1399d6b9a3dd9f5edd4bc07e51e5f7',
    })
  })
})

import { describe, expect, it } from 'vitest'

import {
  handleHostedPaidOperationHumanCreate,
  type HostedPaidOperationCreationGateway,
} from '@/lib/server/hosted-paid-operation-human-api'
import { handleHostedPaidOperationAgentCreate } from '@/lib/server/hosted-paid-operation-agent-api'

describe('hosted paid-operation evaluator creation adapters', () => {
  it('accepts the native human setup form as closed provider intent', async () => {
    const calls: unknown[] = []
    const creation: HostedPaidOperationCreationGateway = {
      create: async (input) => {
        calls.push(input)
        return {
          kind: 'created',
          invocationRef: 'invocation:form',
          expectedInvocationVersion: 1,
        }
      },
    }
    const response = await handleHostedPaidOperationHumanCreate(
      new Request('https://ae.test/actions/paid/new', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ providerKey: 'B' }),
      }),
      {
        authenticate: async () => ({ userId: 'owner:paid', sessionId: 'session:human' }),
        creation,
      },
    )

    expect(response.status).toBe(201)
    expect(calls).toEqual([{
      actor: { principalRef: 'owner:paid', callerRef: 'session:human' },
      setup: { providerKey: 'B' },
    }])
  })

  it('accepts only providerKey and lets the source derive actor and consequence identities', async () => {
    const calls: unknown[] = []
    const creation: HostedPaidOperationCreationGateway = {
      create: async (input) => {
        calls.push(input)
        return {
          kind: 'created',
          invocationRef: 'invocation:server-generated',
          expectedInvocationVersion: 1,
        }
      },
    }
    const request = () => new Request('https://ae.test/api/v1/paid-operations', {
      method: 'POST',
      body: JSON.stringify({ providerKey: 'A' }),
    })
    const human = await handleHostedPaidOperationHumanCreate(request(), {
      authenticate: async () => ({ userId: 'owner:paid', sessionId: 'session:human' }),
      creation,
    })
    const agent = await handleHostedPaidOperationAgentCreate(request(), {
      authenticate: async () => ({
        kind: 'authenticated',
        principal: {
          actor: { principalRef: 'owner:paid', callerRef: 'agent:key' },
          credentialId: 'key:paid',
          scopes: ['paid_operation:invoke'],
        },
      }),
      creation,
    })
    expect(human.status).toBe(201)
    expect(agent.status).toBe(201)
    expect(await human.json()).toEqual({
      kind: 'created',
      invocationRef: 'invocation:server-generated',
      expectedInvocationVersion: 1,
      relation: {
        inspect: '/actions/paid/invocation%3Aserver-generated?expectedInvocationVersion=1',
      },
    })
    expect(await agent.json()).toEqual({
      kind: 'created',
      invocationRef: 'invocation:server-generated',
      expectedInvocationVersion: 1,
      relation: {
        inspect: '/api/v1/paid-operations/invocation%3Aserver-generated?expectedInvocationVersion=1',
      },
    })
    expect(calls).toEqual([
      {
        actor: { principalRef: 'owner:paid', callerRef: 'session:human' },
        setup: { providerKey: 'A' },
      },
      {
        actor: { principalRef: 'owner:paid', callerRef: 'agent:key' },
        setup: { providerKey: 'A' },
      },
    ])
    expect(JSON.stringify(calls)).not.toMatch(/authority|payment|effect|amount|recipient/u)
  })

  it('rejects evaluator setup bypass before creation', async () => {
    let creations = 0
    const creation: HostedPaidOperationCreationGateway = {
      create: async () => {
        creations += 1
        return {
          kind: 'created',
          invocationRef: 'invocation:unexpected',
          expectedInvocationVersion: 1,
        }
      },
    }
    const response = await handleHostedPaidOperationAgentCreate(
      new Request('https://ae.test/api/v1/paid-operations', {
        method: 'POST',
        body: JSON.stringify({
          providerKey: 'A',
          ownerId: 'owner:forged',
          authorityRef: 'authority:forged',
        }),
      }),
      {
        authenticate: async () => ({
          kind: 'authenticated',
          principal: {
            actor: { principalRef: 'owner:paid', callerRef: 'agent:key' },
            credentialId: 'key:paid',
            scopes: ['paid_operation:invoke'],
          },
        }),
        creation,
      },
    )
    expect(response.status).toBe(422)
    expect(creations).toBe(0)
  })
})

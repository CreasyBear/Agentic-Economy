import { makeFunctionReference } from 'convex/server'

import type {
  AgentAccessPrincipal,
  IssuedAgentBindingRegistration,
} from '@/modules/agent-access/agent-access'
import {
  createCustomerRequestServiceAssertion,
  toStableHashValue,
  type CustomerRequestServiceAssertion,
} from '@/modules/agent-access/service-auth-envelope'
import { issuedAgentGrantRef } from '@/modules/agent-access/issued-agent-binding'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import type { ConvexFixtureBackend } from './convex-fixtures'

const DEFAULT_REGISTER_OPERATION = 'agentAccessPrincipals.registerIssuedAgentBindingForServer'

const registerBinding = makeFunctionReference<
  'mutation',
  IssuedAgentBindingRegistration & Readonly<{ serviceAuth: CustomerRequestServiceAssertion }>,
  Readonly<Record<string, unknown>>
>('agentAccessPrincipals:registerIssuedAgentBindingForServer')

export type IssuedBuyerAgent = Readonly<{
  input: IssuedAgentBindingRegistration
  principal: AgentAccessPrincipal
}>

export type IssueBuyerAgentRegistration = Omit<
  IssuedAgentBindingRegistration,
  'issuanceKey' | 'grantRef' | 'credentialId' | 'createdAt' | 'expiresAt'
>

export async function issueBuyerAgent(
  backend: ConvexFixtureBackend,
  owner: ReturnType<ConvexFixtureBackend['withIdentity']>,
  subject: string,
  options: Readonly<{
    serviceKey: string
    registerOperation?: string
    issuanceKey: string
    registration: IssueBuyerAgentRegistration
    createdAt?: number
    expiresAt?: number
  }>,
): Promise<IssuedBuyerAgent> {
  const createdAt = options.createdAt ?? Date.now()
  const expiresAt = options.expiresAt ?? createdAt + 600_000
  const input: IssuedAgentBindingRegistration = {
    issuanceKey: options.issuanceKey,
    grantRef: issuedAgentGrantRef(subject, options.issuanceKey),
    credentialId: `credential:${subject}`,
    ...options.registration,
    createdAt,
    expiresAt,
  }
  const serviceAuth = await createCustomerRequestServiceAssertion({
    key: options.serviceKey,
    operation: options.registerOperation ?? DEFAULT_REGISTER_OPERATION,
    command: toStableHashValue({
      ...input,
      scopes: [...input.scopes],
      toolRefs: [...input.toolRefs],
    }),
    principal: {
      principalId: 'ae:server-function',
      ownerId: 'ae:server-function',
      credentialId: 'ae:server-function',
      scopes: [MARKET_TOOLS_CALL_SCOPE],
    },
    issuedAt: createdAt,
  })
  const result = await owner.mutation(registerBinding, { ...input, serviceAuth })
  if (result.kind !== 'recorded' && result.kind !== 'replayed') {
    throw new Error(`buyer_binding_failed:${JSON.stringify(result)}`)
  }
  const stored = await backend.run(async (ctx) => ctx.db.query('agentAccessPrincipals')
    .withIndex('by_credentialId', (index) => index.eq('credentialId', input.credentialId))
    .unique())
  if (stored === null) throw new Error('buyer_principal_missing')
  return {
    input,
    principal: {
      principalId: stored.principalId,
      ownerId: stored.ownerId,
      credentialId: stored.credentialId,
      applicationRef: stored.applicationRef,
      environment: stored.environment,
      scopes: [...stored.scopes],
      authorityMode: stored.authorityMode,
    },
  }
}

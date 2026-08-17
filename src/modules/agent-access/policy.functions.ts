import { callPublicSourceMutation, sourceMutation } from '@/lib/server/convex-source'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  createCustomerRequestServiceAssertion,
  toStableHashValue,
  type CustomerRequestServiceAssertion,
} from '@/modules/agent-access/service-auth-envelope'

import { MARKET_OPERATIONS_INVOKE_SCOPE } from './contract'
import {
  createAgentAccessGrant,
  type AgentAccessGrant,
  type AgentAccessGrantInput,
} from './policy'
import type {
  AgentAccessGrantRegistrationResult,
  AgentAccessGrantRevocationInput,
  AgentAccessGrantRevocationResult,
} from './agent-access'

const REGISTER_GRANT_SERVER_OPERATION = 'agentAccessPolicy.registerGrantForServer'
const REVOKE_GRANT_SERVER_OPERATION = 'agentAccessPolicy.revokeGrantForServer'

type GrantServerRefusal = Readonly<{ kind: 'refused'; code: 'authentication_required' }>
type RegisterAgentAccessGrantArgs = Readonly<{
  grant: AgentAccessGrant
  serviceAuth: CustomerRequestServiceAssertion
}>
type RegisterAgentAccessGrantSourceResult = Readonly<{
  kind: 'recorded' | 'replayed'
  grantRef: string
  generation: number
  policyDigest: string
  lifecycle: 'active' | 'revoked' | 'expired'
  expiresAt: number
}> | Readonly<{
  kind: 'conflict'
  code: 'grant_exists' | 'generation_stale' | 'grant_material_invalid'
}> | GrantServerRefusal

type RevokeAgentAccessGrantArgs = AgentAccessGrantRevocationInput & Readonly<{
  serviceAuth: CustomerRequestServiceAssertion
}>
type RevokeAgentAccessGrantSourceResult = AgentAccessGrantRevocationResult | GrantServerRefusal

const registerAgentAccessGrantMutation = sourceMutation<RegisterAgentAccessGrantArgs, RegisterAgentAccessGrantSourceResult>(
  'agentAccessPolicy:registerGrantForServer',
)
const revokeAgentAccessGrantMutation = sourceMutation<RevokeAgentAccessGrantArgs, RevokeAgentAccessGrantSourceResult>(
  'agentAccessPolicy:revokeGrantForServer',
)

export async function registerAgentAccessGrant(input: AgentAccessGrantInput): Promise<AgentAccessGrantRegistrationResult> {
  const decision = createAgentAccessGrant(input)
  if (decision.kind === 'refused') return { kind: 'conflict' }
  try {
    const serviceAuth = await createAgentAccessServerAssertion(
      REGISTER_GRANT_SERVER_OPERATION,
      toStableHashValue({ grant: decision.grant }),
      decision.grant,
    )
    const result = await callPublicSourceMutation(registerAgentAccessGrantMutation, {
      grant: decision.grant,
      serviceAuth,
    })
    if (result.kind === 'conflict') return { kind: 'conflict' }
    if (result.kind === 'refused') return { kind: 'unavailable' }
    return result
  } catch {
    return { kind: 'unavailable' }
  }
}

export async function revokeAgentAccessGrant(
  input: AgentAccessGrantRevocationInput,
): Promise<AgentAccessGrantRevocationResult> {
  const serviceAuth = await createAgentAccessServerAssertion(
    REVOKE_GRANT_SERVER_OPERATION,
    toStableHashValue(input),
    input,
  )
  const result = await callPublicSourceMutation(revokeAgentAccessGrantMutation, {
    ...input,
    serviceAuth,
  })
  if (result.kind === 'refused') throw new Error('agent_access_grant_server_auth_rejected')
  return result
}

async function createAgentAccessServerAssertion(
  operation: string,
  command: StableHashValue,
  principal: Readonly<{ principalId: string; ownerId: string; credentialId: string }>,
): Promise<CustomerRequestServiceAssertion> {
  const key = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (key === undefined || key.length < 32) throw new Error('agent_access_grant_server_auth_unavailable')
  return await createCustomerRequestServiceAssertion({
    key,
    operation,
    command,
    principal: {
      ...principal,
      scopes: [MARKET_OPERATIONS_INVOKE_SCOPE],
    },
    issuedAt: Date.now(),
  })
}
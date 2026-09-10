import { callPublicSourceMutation, sourceMutation } from '@/lib/server/convex-source'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  createCustomerRequestServiceAssertion,
  toStableHashValue,
  type CustomerRequestServiceAssertion,
} from '@/modules/agent-access/service-auth-envelope'

import { MARKET_TOOLS_CALL_SCOPE } from './contract'
import {
  createAgentAccessGrant,
  type AgentAccessGrant,
  type AgentAccessGrantInput,
} from './policy'
import type {
  AgentAccessGrantRegistrationResult,
} from './agent-access'

const REGISTER_GRANT_SERVER_OPERATION = 'agentAccessPolicy.registerGrantForServer'

type GrantServerRefusal = Readonly<{ kind: 'refused'; code: 'authentication_required' }>
type RegisterAgentAccessGrantArgs = Readonly<{
  grant: AgentAccessGrant
  serviceAuth: CustomerRequestServiceAssertion
}>
type RegisterAgentAccessGrantSourceResult = Readonly<{
  kind: 'recorded' | 'replayed'
  grantRef: string
  generation: number
  spendingPolicyDigest: string
  lifecycle: 'active' | 'revoked' | 'expired'
  expiresAt: number
}> | Readonly<{
  kind: 'conflict'
  code: 'grant_exists' | 'generation_stale' | 'grant_material_invalid'
}> | GrantServerRefusal


const registerAgentAccessGrantMutation = sourceMutation<RegisterAgentAccessGrantArgs, RegisterAgentAccessGrantSourceResult>(
  'agentAccessPolicy:registerGrantForServer',
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
      scopes: [MARKET_TOOLS_CALL_SCOPE],
    },
    issuedAt: Date.now(),
  })
}

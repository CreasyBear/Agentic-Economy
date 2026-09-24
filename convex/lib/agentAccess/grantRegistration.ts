import type { Infer } from 'convex/values'
import type { MutationCtx } from '../../_generated/server'
import { env } from '../../_generated/server'
import { internal } from '../../_generated/api'
import { agentAccessGrantV2Value } from '@/modules/agent-access/public'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import { verifyCustomerRequestServiceAssertion, type CustomerRequestServiceAssertion } from '@/modules/agent-access/service-auth-envelope'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { AgentAccessGrant } from '@/modules/agent-access/policy'
import { serverServiceAuth, grantWriteForServerResult } from './contracts'

export const registerGrantForServerArgs = { grant: agentAccessGrantV2Value, serviceAuth: serverServiceAuth }
export { grantWriteForServerResult }
export type RegisterGrantForServerArgs = {
  grant: AgentAccessGrant
  serviceAuth: Infer<typeof serverServiceAuth>
}
export type RegisterGrantForServerResult = Infer<typeof grantWriteForServerResult>

const registerGrantServerOperation = 'agentAccessPolicy.registerGrantForServer'

async function verifyServerAssertion(
  operation: string,
  command: StableHashValue,
  assertion: CustomerRequestServiceAssertion,
): Promise<boolean> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (key === undefined || key.length < 32) return false
  return await verifyCustomerRequestServiceAssertion({
    key,
    operation,
    command,
    assertion,
  })
}

function grantBindingMatchesAssertion(grant: AgentAccessGrant, assertion: CustomerRequestServiceAssertion): boolean {
  return assertion.scopes.includes(MARKET_TOOLS_CALL_SCOPE)
    && assertion.principalId === grant.principalId
    && assertion.ownerId === grant.ownerId
    && assertion.credentialId === grant.credentialId
}

export async function registerGrantForServerHandler(ctx: MutationCtx, args: RegisterGrantForServerArgs): Promise<RegisterGrantForServerResult> {
    if (!grantBindingMatchesAssertion(args.grant, args.serviceAuth)
      || !await verifyServerAssertion(registerGrantServerOperation, { grant: args.grant }, args.serviceAuth)) {
      return { kind: 'refused' as const, code: 'authentication_required' as const }
    }
    const principal = await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_principalId', (principalQuery) => principalQuery.eq('principalId', args.grant.principalId))
      .unique()
    if (principal === null
      || principal.credentialId !== args.grant.credentialId
      || principal.lifecycle !== 'active'
      || (principal.expiresAt !== undefined && principal.expiresAt <= Date.now())) {
      return { kind: 'refused' as const, code: 'authentication_required' as const }
    }
    return await ctx.runMutation(internal.agentAccessPolicy.upsertGrant, {
      grant: { ...args.grant, ownerId: principal.ownerId },
    })
}

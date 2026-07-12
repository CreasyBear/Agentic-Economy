import { httpRouter } from 'convex/server'

import { verifyAgentIdentity } from '@/modules/routing-kernel/caller-identity'
import { authorizeRouteForPrincipal } from '@/modules/routing-kernel/authorization'
import { handleRoutingKernelHttpRequest } from '@/modules/routing-kernel/http'
import { handleRoutingKernelMcpRequest } from '@/modules/routing-kernel/mcp'
import { handleRoutingKernelDescriptorRequest } from '@/modules/routing-kernel/descriptor'
import { canonicalAuthorityDigest } from '@/modules/routing-kernel/public'

import { httpAction } from './_generated/server'
import { createRegisteredRoutingKernel } from './routingKernel'
import { createConvexKernelStore } from './routingKernelStoreAdapter'
import { internal } from './_generated/api'

const http = httpRouter()

http.route({
  path: '/.well-known/ae-routing.json',
  method: 'GET',
  handler: httpAction(async (_ctx, request) => handleRoutingKernelDescriptorRequest(request)),
})

function routingDependencies(ctx: Parameters<Parameters<typeof httpAction>[0]>[0]) {
  return {
    operations: createRegisteredRoutingKernel(ctx).operations,
    authenticate: async (candidate: Request, bodyText: string) => {
      const signedRequest = new Request(candidate.url, { method: candidate.method, headers: candidate.headers, body: bodyText })
      const configuredAgents = (process.env.AE_ROUTING_SIGNATURE_AGENTS ?? '').split(',').map((value) => value.trim()).filter(Boolean)
      const allowedSignatureAgents = [...new Set(configuredAgents)]
      const agent = await verifyAgentIdentity(signedRequest, {
        expectedAuthority: new URL(candidate.url).host, bodyText,
        allowedSignatureAgents, pretrustedDirectoryOrigins: allowedSignatureAgents,
        fetchDirectory: async (signatureAgent) => {
          try {
            const result = await ctx.runAction(internal.routingKernelTransport.fetchSignatureDirectory, { signatureAgent })
            if (result.status < 200 || result.status >= 300) console.warn('routing_agent_directory_refused', {
              status: result.status,
              server: result.server,
              mitigation: result.mitigation,
              challenge: result.challengePresent ? 'present' : 'absent',
            })
            return new Response(result.bodyText, { status: result.status, headers: { 'Content-Type': result.contentType } })
          } catch (error) {
            console.warn('routing_agent_directory_unreachable', {
              errorName: error instanceof Error ? error.name : 'unknown',
            })
            throw error
          }
        },
      })
      if (agent.kind !== 'identity') {
        console.warn('routing_agent_authentication_refused', {
          reason: agent.kind === 'error' ? agent.code : 'unsigned',
        })
        return { kind: 'unauthenticated' as const }
      }
      const agentId = `agent:${agent.signatureAgent}:${agent.keyid}`
      const grant = await ctx.runQuery(internal.routingKernelAgentGrants.resolve, { agentId, now: Date.now() })
      if (grant === null) return { kind: 'unauthenticated' as const }
      if (grant.protectedFieldSetId === undefined || grant.maximumDisclosureAttempts === undefined || grant.maximumDisclosureExposures === undefined
        || grant.allowedRecipientBindingIds === undefined || grant.allowedDisclosurePurposes === undefined) return { kind: 'unauthenticated' as const }
      return {
        kind: 'authenticated' as const,
        caller: { agentId, principalId: grant.principalId },
        grant: { grantId: grant.grantId, networkIds: grant.networkIds, maximumSpendMinor: grant.maximumSpendMinor, currency: grant.currency, allowedDataFields: grant.allowedDataFields, protectedFieldSetId: grant.protectedFieldSetId, maximumDisclosureAttempts: grant.maximumDisclosureAttempts, maximumDisclosureExposures: grant.maximumDisclosureExposures, allowedRecipientBindingIds: grant.allowedRecipientBindingIds, allowedDisclosurePurposes: grant.allowedDisclosurePurposes, expiresAt: grant.expiresAt },
      }
    },
    authorize: async (input: {
      caller: { agentId: string; principalId: string }; quoteId: string; quoteDigest: string
      maximumSpendMinor: number; currency: string; expiresAt: number; allowedDataFields: readonly string[]
      idempotencyKey: string
      sourceGrantId: string
    }) => {
      const kernel = createRegisteredRoutingKernel(ctx)
      const quote = await createConvexKernelStore(ctx).getQuote(input.quoteId)
      if (quote === undefined) return { kind: 'authorization_refused' as const, reason: 'quote_not_found' }
      const budget = await ctx.runQuery(internal.routingKernelAgentGrants.resolveBudgetAuthority, { sourceGrantId: input.sourceGrantId, networkId: quote.networkId, now: Date.now() })
      if (budget === null || budget.agentId !== input.caller.agentId || budget.principalId !== input.caller.principalId) {
        return { kind: 'authorization_refused' as const, reason: 'budget_authority_unavailable' }
      }
      const dataBudget = await ctx.runQuery(internal.routingKernelAgentGrants.resolveDataAuthorizationBudget, { sourceGrantId: input.sourceGrantId, networkId: quote.networkId, now: Date.now() })
      if (dataBudget === null || dataBudget.agentId !== input.caller.agentId || dataBudget.principalId !== input.caller.principalId) {
        return { kind: 'authorization_refused' as const, reason: 'data_authorization_unavailable' }
      }
      const result = await authorizeRouteForPrincipal({
        ...input,
        budgetAuthorityRef: budget.budgetAuthorityRef,
        budgetMaximumGrossMinor: budget.maximumGrossMinor,
        dataAuthorizationBudgetRef: dataBudget.dataAuthorizationBudgetRef,
        protectedFieldSetId: dataBudget.protectedFieldSetId,
        dataBudgetMaximumAttempts: dataBudget.maximumAttempts,
        dataBudgetMaximumExposures: dataBudget.maximumExposures,
        allowedRecipientBindingIds: dataBudget.permittedRecipientBindingIds,
        allowedDisclosurePurposes: dataBudget.permittedPurposes,
        maximumDisclosureAttempts: dataBudget.maximumAttempts,
        maximumDisclosureExposures: dataBudget.maximumExposures,
        authorizationRef: `route-authorization:${canonicalAuthorityDigest({
          caller: input.caller, quoteId: input.quoteId, quoteDigest: input.quoteDigest,
          maximumSpendMinor: input.maximumSpendMinor, currency: input.currency, expiresAt: input.expiresAt,
          allowedDataFields: [...input.allowedDataFields].sort(), idempotencyKey: input.idempotencyKey,
          sourceGrantId: input.sourceGrantId, budgetAuthorityRef: budget.budgetAuthorityRef,
          dataAuthorizationBudgetRef: dataBudget.dataAuthorizationBudgetRef,
        })}`,
        principalId: input.caller.principalId, agentId: input.caller.agentId, now: Date.now(),
      }, {
        getQuote: async (quoteId) => await createConvexKernelStore(ctx).getQuote(quoteId),
        issue: async (authorization) => await kernel.authority.authorize(authorization),
      })
      return result.kind === 'authorized'
        ? { kind: 'authorized' as const, authorizationRef: result.authorization.authorizationRef }
        : result
    },
  }
}

for (const path of ['/v1/route', '/v1/authorize', '/v1/execute', '/v1/reconcile', '/v1/inspect', '/v1/cancel'] as const) {
  http.route({
    path,
    method: 'POST',
    handler: httpAction(async (ctx, request) => await handleRoutingKernelHttpRequest(request, routingDependencies(ctx))),
  })
}

http.route({ path: '/mcp', method: 'POST', handler: httpAction(async (ctx, request) => await handleRoutingKernelMcpRequest(request, routingDependencies(ctx))) })
http.route({ path: '/mcp', method: 'GET', handler: httpAction(async (ctx, request) => await handleRoutingKernelMcpRequest(request, routingDependencies(ctx))) })

export default http

import { v } from 'convex/values'

import { compileCustomerRequest } from '@/modules/customer-request/compiler'
import { createJsonCustomerRequestInterpreter } from '@/modules/customer-request/interpreter'
import { createOpenRouterCustomerRequestTransport } from '@/modules/customer-request/openrouter-transport'
import { projectCustomerRequest } from '@/modules/customer-request/customer-projection'

import { action } from './_generated/server'
import { loadConvexCapabilityContractRegistry } from './customerRequestCapabilityContractRegistryAdapter'
import { createConvexCustomerRequestCompilationStore } from './customerRequestCompilationStoreAdapter'

const literalValue = v.union(v.string(), v.number(), v.boolean())
const customerProjection = v.union(
  v.object({
    kind: v.literal('request'), requestRef: v.string(), revision: v.number(),
    status: v.union(v.literal('ready_to_compare'), v.literal('needs_information'), v.literal('unsupported')),
    summary: v.string(), nextAction: v.union(v.literal('compare_options'), v.literal('provide_information'), v.literal('revise_request')),
    missingFields: v.array(v.object({ field: v.string(), label: v.string(), explanation: v.string() })), stepCount: v.number(),
  }),
  v.object({
    kind: v.literal('conflict'), requestRef: v.string(),
    reason: v.union(v.literal('revision_changed'), v.literal('identity_changed'), v.literal('idempotency_key_reused')),
  }),
)

export const submit = action({
  args: {
    compilationKey: v.string(), requestId: v.string(), expectedRevision: v.optional(v.number()), delegatedAgentId: v.string(),
    customerJob: v.string(), knownFacts: v.record(v.string(), literalValue),
    routing: v.object({
      networkId: v.string(), currency: v.string(), maximumSpendMinor: v.number(),
      optimizeFor: v.union(v.literal('cost'), v.literal('latency')),
    }),
  },
  returns: v.union(
    customerProjection,
    v.object({ kind: v.literal('refused'), reason: v.union(v.literal('authentication_required'), v.literal('interpreter_unavailable'), v.literal('capabilities_unavailable')) }),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) return { kind: 'refused' as const, reason: 'authentication_required' as const }
    const apiKey = process.env.OPENROUTER_API_KEY?.trim()
    if (apiKey === undefined || apiKey.length === 0) return { kind: 'refused' as const, reason: 'interpreter_unavailable' as const }
    const registry = await loadConvexCapabilityContractRegistry(ctx)
    if (registry.list().length === 0) return { kind: 'refused' as const, reason: 'capabilities_unavailable' as const }
    const result = await compileCustomerRequest({
      ...args,
      principalId: identity.tokenIdentifier,
    }, {
      interpreter: createJsonCustomerRequestInterpreter({
        interpreterId: `openrouter:${process.env.AE_CUSTOMER_REQUEST_MODEL?.trim() || 'openai/gpt-4.1-mini'}`,
        transport: createOpenRouterCustomerRequestTransport({
          apiKey,
          model: process.env.AE_CUSTOMER_REQUEST_MODEL?.trim() || 'openai/gpt-4.1-mini',
          ...(process.env.AE_OPENROUTER_API_BASE_URL?.trim() ? { apiBaseUrl: process.env.AE_OPENROUTER_API_BASE_URL.trim() } : {}),
          ...(process.env.AE_SITE_URL?.trim() ? { siteUrl: process.env.AE_SITE_URL.trim() } : {}),
        }),
        timeoutMs: 20_000,
        maximumResponseBytes: 64_000,
      }),
      registry,
      store: createConvexCustomerRequestCompilationStore(ctx),
      now: Date.now,
    })
    return writableProjection(projectCustomerRequest(result))
  },
})

function writableProjection(projection: ReturnType<typeof projectCustomerRequest>) {
  return projection.kind === 'conflict' ? { ...projection } : {
    ...projection, missingFields: projection.missingFields.map((field) => ({ ...field })),
  }
}

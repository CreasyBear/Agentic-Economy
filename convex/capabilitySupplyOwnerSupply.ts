"use node"

import { Agent, fetch as guardedFetch } from 'undici'
import { v, type Infer } from 'convex/values'

import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'

import { internal } from './_generated/api'
import { action, type ActionCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { resolveBusinessActor } from './authz'

const ownerSupplyEndpointValue = v.object({
  sourceKind: v.union(v.literal('openapi_http'), v.literal('mcp'), v.literal('x402')),
  descriptor: v.string(),
  selector: v.string(),
  endpointUrl: v.string(),
  method: v.union(v.literal('GET'), v.literal('POST')),
  queryMapping: v.string(),
  protocolVersion: v.string(),
  toolName: v.string(),
  requestTimeoutMs: v.number(),
  credentialRef: v.string(),
})
const ownerSupplyPricingValue = v.object({
  version: v.literal('pricing:v1'),
  unit: v.literal('call'),
  currency: v.string(),
  paidAmountMinor: v.number(),
  freeTier: v.optional(v.object({ maxCalls: v.number(), window: v.union(v.literal('day'), v.literal('month')) })),
})
const ownerSupplyActionValue = v.object({
  endpoint: ownerSupplyEndpointValue,
  pricing: v.optional(ownerSupplyPricingValue),
})
const ownerSupplyCompletedValue = v.object({
  step: v.union(v.literal('readiness'), v.literal('test')),
  state: v.literal('completed'),
  offeringRef: v.string(),
  revision: v.number(),
  message: v.string(),
})
const ownerSupplyActionResultValue = v.union(
  ownerSupplyCompletedValue,
  v.object({
    step: v.union(v.literal('readiness'), v.literal('test')),
    state: v.literal('refused'),
    refusal: v.union(
      v.literal('authorization_denied'), v.literal('target_not_public'),
      v.literal('transport_unreachable'), v.literal('http_redirect'),
      v.literal('http_4xx'), v.literal('http_5xx'), v.literal('response_invalid'),
    ),
  }),
)
type OwnerSupplyActionResult = Infer<typeof ownerSupplyActionResultValue>
const ownerSupplyInput = {
  businessId: v.id('businesses'),
  offeringRef: v.string(),
  revision: v.number(),
  operationKey: v.string(),
  value: ownerSupplyActionValue,
}

async function isOwnerSupplyActionAuthorized(ctx: ActionCtx, businessId: Id<'businesses'>): Promise<boolean> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return false
  return await ctx.runQuery(internal.capabilitySupply.authorizeOwnerSupplyAction, { businessId })
}

function isOwnerSupplyRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ownerSupplyValue(value: unknown): Record<string, unknown> {
  return isOwnerSupplyRecord(value) ? value : {}
}

function ownerSupplyEndpoint(value: unknown): { kind: 'available'; url: URL } | { kind: 'refused'; refusal: 'target_not_public' } {
  const endpoint = ownerSupplyValue(ownerSupplyValue(value).endpoint)
  const endpointUrl = typeof endpoint.endpointUrl === 'string' ? endpoint.endpointUrl : ''
  try {
    const url = new URL(endpointUrl)
    if (url.protocol !== 'https:') return { kind: 'refused', refusal: 'target_not_public' }
    return { kind: 'available', url }
  } catch {
    return { kind: 'refused', refusal: 'target_not_public' }
  }
}

function ownerSupplyHttpRefusal(status: number): 'http_redirect' | 'http_4xx' | 'http_5xx' {
  if (status >= 300 && status < 400) return 'http_redirect'
  return status >= 500 ? 'http_5xx' : 'http_4xx'
}

export const runOwnerSupplyReadiness = action({
  args: ownerSupplyInput,
  returns: ownerSupplyActionResultValue,
  handler: async (ctx, args): Promise<OwnerSupplyActionResult> => {
    if (!await isOwnerSupplyActionAuthorized(ctx, args.businessId)) {
      return { step: 'readiness', state: 'refused', refusal: 'authorization_denied' }
    }
    const endpoint = ownerSupplyEndpoint(args.value)
    if (endpoint.kind === 'refused') return { step: 'readiness', state: 'refused', refusal: endpoint.refusal }
    if (!await isPublicHttpTarget(endpoint.url, defaultDnsResolver)) {
      return { step: 'readiness', state: 'refused', refusal: 'target_not_public' }
    }
    const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
    try {
      const response = await guardedFetch(endpoint.url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(10_000), dispatcher })
      if (response.status < 200 || response.status >= 300) {
        return { step: 'readiness', state: 'refused', refusal: ownerSupplyHttpRefusal(response.status) }
      }
      return { step: 'readiness', state: 'completed', offeringRef: args.offeringRef, revision: args.revision, message: 'The public endpoint responded successfully.' }
    } catch {
      return { step: 'readiness', state: 'refused', refusal: 'transport_unreachable' }
    } finally {
      await dispatcher.close().catch(() => undefined)
    }
  },
})

export const runOwnerSupplyTest = action({
  args: ownerSupplyInput,
  returns: ownerSupplyActionResultValue,
  handler: async (ctx, args): Promise<OwnerSupplyActionResult> => {
    if (!await isOwnerSupplyActionAuthorized(ctx, args.businessId)) {
      return { step: 'test', state: 'refused', refusal: 'authorization_denied' }
    }
    const endpoint = ownerSupplyEndpoint(args.value)
    if (endpoint.kind === 'refused') return { step: 'test', state: 'refused', refusal: endpoint.refusal }
    if (!await isPublicHttpTarget(endpoint.url, defaultDnsResolver)) {
      return { step: 'test', state: 'refused', refusal: 'target_not_public' }
    }
    const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
    try {
      const response = await guardedFetch(endpoint.url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ service: 'home-office-video-setup', postcode: '5003', timeout: 30 }),
        redirect: 'manual', signal: AbortSignal.timeout(10_000), dispatcher,
      })
      if (!response.ok) return { step: 'test', state: 'refused', refusal: ownerSupplyHttpRefusal(response.status) }
      const body: unknown = await response.json()
      if (!isOwnerSupplyRecord(body) || body.kind !== 'quoted') return { step: 'test', state: 'refused', refusal: 'response_invalid' }
      return { step: 'test', state: 'completed', offeringRef: args.offeringRef, revision: args.revision, message: 'A real quote was returned by your endpoint.' }
    } catch {
      return { step: 'test', state: 'refused', refusal: 'transport_unreachable' }
    } finally {
      await dispatcher.close().catch(() => undefined)
    }
  },
})

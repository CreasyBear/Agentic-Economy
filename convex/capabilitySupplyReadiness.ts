"use node"

import { Agent, fetch as guardedFetch } from 'undici'
import { v } from 'convex/values'
import { makeFunctionReference } from 'convex/server'

import { runCapabilityReadinessProbe, type CapabilityProbeOutcome } from '@/modules/capability-supply/public'
import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'

import { internalAction } from './_generated/server'

const probeReference = makeFunctionReference<'action', { publicationRef: string; expectedRevision: number }>(
  'capabilitySupplyReadiness:probe',
)
type Target = { publicationRef: string; revision: number; bindingId: string; capabilityId: string; endpointUrl: string; credentialRef: string; adapterId: string; probeKind: 'ae_quote' | 'openapi_http' | 'mcp' | 'x402'; targetDigest: string }
const readTargetReference = makeFunctionReference<'query', { publicationRef: string; expectedRevision: number },
  { kind: 'available'; target: Target } | { kind: 'unavailable' }>('capabilitySupply:readCapabilityProbeTarget')
const recordReference = makeFunctionReference<'mutation',
  { publicationRef: string; expectedRevision: number; targetDigest: string; outcome: CapabilityProbeOutcome },
  { kind: 'observed'; publicationRef: string; revision: number; lifecycle: unknown } | { kind: 'refused'; reason: string }
>('capabilitySupply:recordCapabilityProbeResult')

export const probe = internalAction({
  args: { publicationRef: v.string(), expectedRevision: v.number() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const result = await ctx.runQuery(readTargetReference, args)
    if (result.kind !== 'available') return { kind: 'unavailable' as const }
    const target = result.target
    const observation = await runCapabilityReadinessProbe(target, {
      resolveCredential: async (reference) => resolveCredential(reference),
      validateTarget: async (url) => isPublicHttpTarget(url, defaultDnsResolver),
      send: sendGuarded,
    })
    const recorded = await ctx.runMutation(recordReference, {
      publicationRef: target.publicationRef, expectedRevision: target.revision,
      targetDigest: target.targetDigest, outcome: observation.outcome,
    })
    if (recorded.kind === 'observed') {
      await ctx.scheduler.runAfter(observation.outcome === 'healthy' ? 4 * 60_000 : 60_000,
        probeReference,
        { publicationRef: target.publicationRef, expectedRevision: target.revision })
    }
    return recorded
  },
})

function resolveCredential(reference: string): string | undefined {
  // Credential names are stored data (`env:NAME`), so generated typed env access cannot express this lookup.
  const match = /^env:([A-Z][A-Z0-9_]{1,199})$/.exec(reference)
  return match?.[1] === undefined ? undefined : process.env[match[1]]
}

async function sendGuarded(request: Request): Promise<Response> {
  const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
  try {
    const response = await guardedFetch(request.url, {
      method: request.method, headers: Object.fromEntries(request.headers.entries()),
      body: await request.text(), redirect: 'manual', signal: request.signal, dispatcher,
    })
    const body = await readBoundedResponse(response, 64 * 1024)
    return new Response(body.ok ? body.bytes : null, {
      status: body.ok ? response.status : 413,
      headers: body.ok ? Object.fromEntries(response.headers.entries()) : {
        'Content-Type': 'text/plain', 'X-AE-Probe-Outcome': 'response_too_large',
      },
    })
  } finally {
    await dispatcher.close().catch(() => undefined)
  }
}

async function readBoundedResponse(response: Awaited<ReturnType<typeof guardedFetch>>, limit: number) {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel().catch(() => undefined)
    return { ok: false as const }
  }
  if (response.body === null) return { ok: true as const, bytes: new Uint8Array() }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const item = await reader.read()
      if (item.done) break
      total += item.value.byteLength
      if (total > limit) { await reader.cancel(); return { ok: false as const } }
      chunks.push(item.value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return { ok: true as const, bytes }
}

"use node"

import { Agent, fetch as guardedFetch } from 'undici'
import { v } from 'convex/values'
import type { RegisteredAction } from 'convex/server'

import { runCapabilityReadinessProbe } from '@/modules/capability-supply/public'
import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'

import { internal } from './_generated/api'
import { internalAction } from './_generated/server'

type PublicationLifecycle = {
  state: 'inactive' | 'active' | 'withdrawn' | 'incompatible'
  reasons: Array<
    | 'admission_unproven'
    | 'conformance_unproven'
    | 'credential_readiness_unobserved'
    | 'health_unobserved'
    | 'credential_unavailable'
    | 'health_unhealthy'
    | 'health_stale'
    | 'withdrawn'
    | 'incompatible_revision'
    | 'eligibility_integrity_failure'
  >
}
type ProbeRecordResult =
  | { kind: 'observed'; publicationRef: string; revision: number; lifecycle: PublicationLifecycle }
  | { kind: 'refused'; reason: 'revision_changed' | 'target_changed' }
type ProbeResult = ProbeRecordResult | { kind: 'unavailable' }
type ProbeArgs = { publicationRef: string; expectedRevision: number }
type Target = { publicationRef: string; revision: number; bindingId: string; capabilityId: string; endpointUrl: string; credentialRef: string; adapterId: string; probeKind: 'ae_quote' | 'openapi_http' | 'mcp' | 'x402'; targetDigest: string }

const publicationLifecycleValue = v.object({
  state: v.union(v.literal('inactive'), v.literal('active'), v.literal('withdrawn'), v.literal('incompatible')),
  reasons: v.array(v.union(
    v.literal('admission_unproven'),
    v.literal('conformance_unproven'),
    v.literal('credential_readiness_unobserved'),
    v.literal('health_unobserved'),
    v.literal('credential_unavailable'),
    v.literal('health_unhealthy'),
    v.literal('health_stale'),
    v.literal('withdrawn'),
    v.literal('incompatible_revision'),
    v.literal('eligibility_integrity_failure'),
  )),
})
const probeResultValue = v.union(
  v.object({ kind: v.literal('unavailable') }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(v.literal('revision_changed'), v.literal('target_changed')),
  }),
  v.object({
    kind: v.literal('observed'),
    publicationRef: v.string(),
    revision: v.number(),
    lifecycle: publicationLifecycleValue,
  }),
)

export const probe: RegisteredAction<'internal', ProbeArgs, ProbeResult> = internalAction({
  args: { publicationRef: v.string(), expectedRevision: v.number() },
  returns: probeResultValue,
  handler: async (ctx, args): Promise<ProbeResult> => {
    const result: { kind: 'available'; target: Target } | { kind: 'unavailable' } = await ctx.runQuery(
      internal.capabilitySupply.readCapabilityProbeTarget,
      args,
    )
    if (result.kind !== 'available') return { kind: 'unavailable' as const }
    const target: Target = result.target
    const observation = await runCapabilityReadinessProbe(target, {
      resolveCredential: async (reference) => resolveCredential(reference),
      validateTarget: async (url) => isPublicHttpTarget(url, defaultDnsResolver),
      send: sendGuarded,
    })
    const recorded: ProbeRecordResult = await ctx.runMutation(
      internal.capabilitySupply.recordCapabilityProbeResult,
      {
      publicationRef: target.publicationRef, expectedRevision: target.revision,
      targetDigest: target.targetDigest, outcome: observation.outcome,
      },
    )
    if (recorded.kind === 'observed') {
      await ctx.scheduler.runAfter(observation.outcome === 'healthy' ? 4 * 60_000 : 60_000,
        internal.capabilitySupplyReadiness.probe,
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

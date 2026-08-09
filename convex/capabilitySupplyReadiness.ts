"use node"

import { Agent, fetch as guardedFetch } from 'undici'
import { v } from 'convex/values'
import type { RegisteredAction } from 'convex/server'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'
import {
  runCapabilityReadinessProbe,
  type CapabilityConnectionAuthoritySnapshot,
  type CapabilityTransportAuthority,
} from '@/modules/capability-supply/public'

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
type Target = {
  publicationRef: string
  revision: number
  bindingId: string
  capabilityId: string
  endpointUrl: string
  authority: CapabilityTransportAuthority
  connectionAuthority?: CapabilityConnectionAuthoritySnapshot
  adapterId: string
  probeQuery: Array<{ parameter: string; value: string }>
  probeInputJson?: string
  outputSchemaJson?: string
  targetDigest: string
}

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
      resolveProviderConnectionCredential: async (authority) => {
        const expected = target.connectionAuthority
        if (authority.kind !== 'provider_connection' || expected === undefined
          || authority.connectionRef !== expected.connectionRef
          || authority.providerRef !== expected.providerRef) return undefined
        const row = await ctx.runQuery(internal.capabilityProviderConnections.read, {
          connectionRef: expected.connectionRef,
        })
        if (row === null
          || row.providerRef !== expected.providerRef
          || row.adapterId !== expected.adapterId
          || row.authorityGeneration !== expected.authorityGeneration
          || row.authorityDigest !== expected.authorityDigest
          || [...row.grantedScopes].sort().join('\u0000') !== [...expected.grantedScopes].sort().join('\u0000')
          || [...row.grantedResources].sort().join('\u0000') !== [...expected.grantedResources].sort().join('\u0000')) return undefined
        const resolved = await ctx.runQuery(internal.capabilityProviderConnections.resolveCredentialRef, {
          connectionRef: expected.connectionRef,
          expectedAuthorityGeneration: expected.authorityGeneration,
          expectedAuthorityDigest: expected.authorityDigest,
          now: Date.now(),
        })
        return resolved.kind === 'resolved' ? resolved.credentialRef : undefined
      },
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
    return recorded
  },
})

async function sendGuarded(request: Request): Promise<Response> {
  const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
  try {
    const upstream = await guardedFetch(request.url, {
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      ...(request.method === 'GET' || request.method === 'HEAD' ? {} : { body: await request.text() }),
      redirect: 'manual',
      signal: request.signal,
      dispatcher,
    })
    const body = await readBoundedRequestText(upstream, 64 * 1024)
    return new Response(body.ok ? body.text : null, {
      status: body.ok ? upstream.status : 413,
      headers: body.ok ? Object.fromEntries(upstream.headers.entries()) : {
        'Content-Type': 'text/plain', 'X-AE-Probe-Outcome': 'response_too_large',
      },
    })
  } finally {
    await dispatcher.close().catch(() => undefined)
  }
}


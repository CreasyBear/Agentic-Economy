"use node";

import { v } from 'convex/values'
import { Agent, fetch as guardedFetch } from 'undici'

import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'
import { internalAction } from './_generated/server'

export const send = internalAction({
  args: { endpointUrl: v.string(), credentialRef: v.string(), bodyText: v.string(), idempotencyKey: v.optional(v.string()) },
  handler: async (_ctx, args) => {
    const endpoint = new URL(args.endpointUrl)
    if (endpoint.protocol !== 'https:' || !await isPublicHttpTarget(endpoint, defaultDnsResolver)) throw new Error('endpoint_not_public')
    const credential = resolveCredential(args.credentialRef)
    if (credential === undefined) throw new Error('credential_unavailable')
    const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
    try {
      const response = await guardedFetch(endpoint, {
        method: 'POST', redirect: 'manual', dispatcher, signal: AbortSignal.timeout(10_000), body: args.bodyText,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${credential}`, ...(args.idempotencyKey === undefined ? {} : { 'Idempotency-Key': args.idempotencyKey }) },
      })
      const bodyText = await response.text()
      if (new TextEncoder().encode(bodyText).byteLength > 64 * 1024) throw new Error('provider_response_too_large')
      return { status: response.status, contentType: response.headers.get('content-type') ?? '', bodyText }
    } finally { await dispatcher.close() }
  },
})

export const fetchSignatureDirectory = internalAction({
  args: { signatureAgent: v.string() },
  handler: async (_ctx, args) => {
    const endpoint = new URL('/.well-known/http-message-signatures-directory', args.signatureAgent)
    if (endpoint.protocol !== 'https:' || !await isPublicHttpTarget(endpoint, defaultDnsResolver)) throw new Error('signature_directory_not_public')
    const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
    try {
      const response = await guardedFetch(endpoint, {
        method: 'GET', redirect: 'manual', dispatcher, signal: AbortSignal.timeout(10_000),
        headers: { Accept: 'application/json', 'User-Agent': 'Agentic-Economy-Routing-Verifier/1.0' },
      })
      const bodyText = await response.text()
      if (new TextEncoder().encode(bodyText).byteLength > 64 * 1024) throw new Error('signature_directory_response_too_large')
      return {
        status: response.status,
        bodyText,
        contentType: response.headers.get('content-type') ?? 'application/json',
        server: response.headers.get('server') ?? 'unknown',
        mitigation: response.headers.get('x-vercel-mitigated') ?? 'none',
        challengePresent: response.headers.get('x-vercel-challenge-token') !== null,
      }
    } finally {
      await dispatcher.close()
    }
  },
})

function resolveCredential(reference: string): string | undefined {
  const match = /^env:([A-Z][A-Z0-9_]{1,100})$/.exec(reference)
  return match?.[1] === undefined ? undefined : process.env[match[1]]
}

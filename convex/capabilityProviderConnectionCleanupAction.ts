"use node"

import { degradeBackend } from '@/lib/observability/degrade-backend'
import {
  isCanonicalCredentiallessX402ProviderConnection,
  providerConnectionCleanupRequestDigest,
} from '../src/modules/capability-supply/provider-connection'
import { sendGuardedHttpRequest } from '../src/modules/network-guard/server'
import { env, internalAction } from './_generated/server'
import {
  cleanupArgs,
  convexCleanupResult,
  isCleanupResult,
  readCurrentCleanupTarget,
  unknownResult,
  workerResult,
  type CleanupResult,
  type CleanupTarget,
} from './capabilityProviderConnectionCleanup'

function cleanupEndpoint(): string | undefined {
  const raw = env.AE_SITE_URL?.trim()
  if (raw === undefined) return undefined
  try {
    const url = new URL(raw)
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
    return (url.protocol === 'https:' || (url.protocol === 'http:' && loopback))
      && url.username === ''
      && url.password === ''
      && url.pathname === '/'
      && url.search === ''
      && url.hash === ''
      && url.origin === raw
      ? `${raw}/api/internal/provider-connection-cleanup`
      : undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'cleanupEndpoint', reason: 'invalid_response' })
  }
}

async function revokeMcpConnection(target: CleanupTarget, requestDigest: string): Promise<CleanupResult> {
  const endpoint = cleanupEndpoint()
  const token = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (endpoint === undefined || token === undefined || token.length < 43 || target.secret === undefined) {
    return unknownResult('cleanup_action_failed')
  }
  let response: Response
  try {
    const request = new Request(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        connectionRef: target.connectionRef,
        adapterId: target.adapterId,
        requestDigest,
        secret: target.secret,
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    const hostname = new URL(endpoint).hostname
    response = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
      ? await fetch(request)
      : await sendGuardedHttpRequest(request, 16 * 1024)
  } catch (cause) {
    return degradeBackend(cause, unknownResult('cleanup_action_failed'), { site: 'revokeMcpConnection', reason: 'source_unavailable' })
  }
  const declared = Number(response.headers.get('content-length'))
  if (!response.ok || (Number.isFinite(declared) && declared > 16 * 1024)) {
    return unknownResult('cleanup_action_failed')
  }
  let body: unknown
  try {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > 16 * 1024) return unknownResult('cleanup_action_failed')
    body = JSON.parse(text)
  } catch (cause) {
    return degradeBackend(cause, unknownResult('cleanup_action_failed'), { site: 'revokeMcpConnection', reason: 'invalid_response' })
  }
  return isCleanupResult(body) ? body : unknownResult('cleanup_action_failed')
}

export const perform = internalAction({
  args: cleanupArgs,
  returns: workerResult,
  handler: async (ctx, args) => {
    try {
      const targetValue = await readCurrentCleanupTarget(ctx, args)
      if (targetValue === null) {
        return { kind: 'cleanup' as const, result: convexCleanupResult(unknownResult('cleanup_target_unavailable')) }
      }
      if (args.workKind === 'lease_drain') {
        return await readCurrentCleanupTarget(ctx, args) === null
          ? { kind: 'cleanup' as const, result: convexCleanupResult(unknownResult('cleanup_authority_changed')) }
          : { kind: 'lease_drain' as const }
      }
      if (
        targetValue.revocationRef === undefined
        || targetValue.cleanupAttempt !== args.cleanupAttempt
        || providerConnectionCleanupRequestDigest({
          revocationRef: targetValue.revocationRef,
          cleanupAttempt: args.cleanupAttempt,
          connectionRef: args.connectionRef,
          expectedAuthorityGeneration: args.expectedAuthorityGeneration,
          expectedAuthorityDigest: args.expectedAuthorityDigest,
          adapterId: targetValue.adapterId,
        }) !== args.requestDigest
      ) return { kind: 'cleanup' as const, result: convexCleanupResult(unknownResult('cleanup_request_mismatch')) }
      if (await readCurrentCleanupTarget(ctx, args) === null) {
        return { kind: 'cleanup' as const, result: convexCleanupResult(unknownResult('cleanup_authority_changed')) }
      }
      if (isCanonicalCredentiallessX402ProviderConnection(targetValue)) {
        return {
          kind: 'cleanup' as const,
          result: convexCleanupResult({
            outcome: 'detached',
            reasonCode: 'local_detached',
            evidenceRefs: ['provider_cleanup:local_detached'],
          }),
        }
      }
      if (targetValue.adapterId === 'mcp-jsonrpc:v1') {
        return {
          kind: 'cleanup' as const,
          result: convexCleanupResult(await revokeMcpConnection(targetValue, args.requestDigest)),
        }
      }
      return {
        kind: 'cleanup' as const,
        result: convexCleanupResult({
          outcome: 'unsupported',
          reasonCode: 'cleanup_adapter_unsupported',
          evidenceRefs: ['provider_cleanup:adapter_unsupported'],
        }),
      }
    } catch (cause) {
      return degradeBackend(cause, { kind: 'cleanup' as const, result: convexCleanupResult(unknownResult('cleanup_action_failed')) }, { site: 'perform', reason: 'source_unavailable' })
    }
  },
})

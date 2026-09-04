import { vOnCompleteArgs } from '@convex-dev/workpool'
import { v } from 'convex/values'

import {
  isCanonicalCredentiallessX402ProviderConnection,
  providerConnectionCleanupRequestDigest,
  type ProviderConnectionCleanupOutcome,
} from '../src/modules/capability-supply/provider-connection'
import { isCanonicalDigest } from '../src/modules/common/canonical-digest'
import { isRecord } from '../src/modules/common/is-record'
import { sendGuardedHttpRequest } from '../src/modules/network-guard/server'
import { internal } from './_generated/api'
import { internalAction, internalMutation, type ActionCtx, type MutationCtx } from './_generated/server'
import {
  cleanupResourceAuthorityMatches,
} from './lib/providerConnections/lifecycle'
import {
  cleanupResourceAuthorityValue,
  type CleanupResourceAuthority,
} from './lib/providerConnections/contracts'

const cleanupOutcome = v.union(
  v.literal('detached'),
  v.literal('revoked'),
  v.literal('already_revoked'),
  v.literal('unsupported'),
  v.literal('provider_refused'),
  v.literal('outcome_unknown'),
)
const workKind = v.union(v.literal('lease_drain'), v.literal('cleanup'))
const cleanupResult = v.object({
  outcome: cleanupOutcome,
  responseDigest: v.optional(v.string()),
  reasonCode: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
})
const workerResult = v.union(
  v.object({ kind: v.literal('lease_drain') }),
  v.object({ kind: v.literal('cleanup'), result: cleanupResult }),
)
const cleanupArgs = {
  connectionRef: v.string(),
  commandId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  requestDigest: v.string(),
  cleanupAttempt: v.number(),
  workKind,
  resourceAuthority: cleanupResourceAuthorityValue,
}
const cleanupContext = v.object({
  connectionRef: v.string(),
  commandId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  requestDigest: v.string(),
  cleanupAttempt: v.number(),
  workKind,
  resourceAuthority: cleanupResourceAuthorityValue,
})

type CleanupResult = Readonly<{
  outcome: ProviderConnectionCleanupOutcome
  responseDigest?: string
  reasonCode?: string
  evidenceRefs: string[]
}>

type CleanupTarget = Readonly<{
  connectionRef: string
  providerRef: string
  providerAccountRef: string
  adapterId: string
  credentialRef: string | null
  grantedScopes: string[]
  grantedResources: string[]
  authorityGeneration: number
  authorityDigest: string
  lifecycle: 'revocation_pending' | 'cleanup_required'
  revocationRef?: string
  cleanupAttempt?: number
  secret?: Readonly<{
    secretRef: string
    activeGeneration: string
    pointerRevision: number
  }>
  resourceAuthority: CleanupResourceAuthority
}>

function unknownResult(reasonCode: 'cleanup_target_unavailable' | 'cleanup_request_mismatch' | 'cleanup_authority_changed' | 'cleanup_action_failed'): CleanupResult {
  return { outcome: 'outcome_unknown', reasonCode, evidenceRefs: [`provider_cleanup:${reasonCode}`] }
}
type ConvexCleanupResult = {
  outcome: ProviderConnectionCleanupOutcome
  responseDigest?: string
  reasonCode?: string
  evidenceRefs: string[]
}

function convexCleanupResult(result: CleanupResult): ConvexCleanupResult {
  return {
    outcome: result.outcome,
    ...(result.responseDigest === undefined ? {} : { responseDigest: result.responseDigest }),
    ...(result.reasonCode === undefined ? {} : { reasonCode: result.reasonCode }),
    evidenceRefs: [...result.evidenceRefs],
  }
}

function isCleanupTarget(value: unknown): value is CleanupTarget {
  return typeof value === 'object' && value !== null
    && 'connectionRef' in value && typeof value.connectionRef === 'string'
    && 'providerRef' in value && typeof value.providerRef === 'string'
    && 'providerAccountRef' in value && typeof value.providerAccountRef === 'string'
    && 'adapterId' in value && typeof value.adapterId === 'string'
    && 'credentialRef' in value && (typeof value.credentialRef === 'string' || value.credentialRef === null)
    && 'grantedScopes' in value && Array.isArray(value.grantedScopes)
    && value.grantedScopes.every((scope) => typeof scope === 'string')
    && 'grantedResources' in value && Array.isArray(value.grantedResources)
    && value.grantedResources.every((resource) => typeof resource === 'string')
    && 'authorityGeneration' in value && typeof value.authorityGeneration === 'number'
    && 'authorityDigest' in value && typeof value.authorityDigest === 'string'
    && 'lifecycle' in value && (value.lifecycle === 'revocation_pending' || value.lifecycle === 'cleanup_required')
    && (!('revocationRef' in value) || value.revocationRef === undefined || typeof value.revocationRef === 'string')
    && (!('cleanupAttempt' in value) || value.cleanupAttempt === undefined || typeof value.cleanupAttempt === 'number')
    && (!('secret' in value) || value.secret === undefined || isSecretPointer(value.secret))
    && 'resourceAuthority' in value
    && isCleanupResourceAuthority(value.resourceAuthority)
}

function isSecretPointer(value: unknown): value is NonNullable<CleanupTarget['secret']> {
  return isRecord(value)
    && typeof value.secretRef === 'string'
    && typeof value.activeGeneration === 'string'
    && Number.isSafeInteger(value.pointerRevision)
    && Number(value.pointerRevision) >= 1
}

function isCleanupResourceAuthority(value: unknown): value is CleanupResourceAuthority {
  if (!isRecord(value)) return false
  return typeof value.connectionRef === 'string'
    && typeof value.authorityGeneration === 'number'
    && typeof value.owningAccountRef === 'string'
    && typeof value.actorPrincipalRef === 'string'
    && typeof value.accountRevision === 'number'
    && typeof value.ownershipRef === 'string'
    && typeof value.grantRef === 'string'
    && typeof value.grantGeneration === 'number'
    && typeof value.authorityExpiresAt === 'number'
}

type CleanupInvocation = Readonly<{
  connectionRef: string
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  requestDigest: string
  cleanupAttempt: number
  resourceAuthority: CleanupResourceAuthority
}>

async function readCurrentCleanupTarget(
  ctx: Pick<ActionCtx, 'runQuery'> | Pick<MutationCtx, 'runQuery'>,
  args: CleanupInvocation,
): Promise<CleanupTarget | null> {
  const target = await ctx.runQuery(internal.capabilityProviderConnections.readCleanupTarget, {
    connectionRef: args.connectionRef,
    commandId: args.commandId,
    expectedAuthorityGeneration: args.expectedAuthorityGeneration,
    expectedAuthorityDigest: args.expectedAuthorityDigest,
    requestDigest: args.requestDigest,
    cleanupAttempt: args.cleanupAttempt,
    now: Date.now(),
  })
  return isCleanupTarget(target)
    && cleanupResourceAuthorityMatches(target.resourceAuthority, args.resourceAuthority)
    ? target
    : null
}

const cleanupOutcomeValues: Record<ProviderConnectionCleanupOutcome, true> = {
  detached: true,
  revoked: true,
  already_revoked: true,
  unsupported: true,
  provider_refused: true,
  outcome_unknown: true,
}

function isCleanupResult(value: unknown): value is CleanupResult {
  if (
    typeof value !== 'object'
    || value === null
    || !('outcome' in value)
    || typeof value.outcome !== 'string'
    || cleanupOutcomeValues[value.outcome as ProviderConnectionCleanupOutcome] !== true
  ) return false
  if ('responseDigest' in value && value.responseDigest !== undefined && (typeof value.responseDigest !== 'string' || !isCanonicalDigest(value.responseDigest))) return false
  if ('reasonCode' in value && value.reasonCode !== undefined && (typeof value.reasonCode !== 'string' || !/^[a-z][a-z0-9_:-]{0,79}$/.test(value.reasonCode))) return false
  if (!('evidenceRefs' in value) || !Array.isArray(value.evidenceRefs) || value.evidenceRefs.some((ref) => typeof ref !== 'string' || !/^provider_cleanup:[a-z][a-z0-9_:-]{0,79}$/.test(ref))) return false
  return true
}

function cleanupEndpoint(): string | undefined {
  const raw = process.env.AE_SITE_URL?.trim()
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
  } catch {
    return undefined
  }
}

async function revokeMcpConnection(target: CleanupTarget, requestDigest: string): Promise<CleanupResult> {
  const endpoint = cleanupEndpoint()
  const token = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
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
  } catch {
    return unknownResult('cleanup_action_failed')
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
  } catch {
    return unknownResult('cleanup_action_failed')
  }
  return isCleanupResult(body) ? body : unknownResult('cleanup_action_failed')
}

export const run = internalAction({
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
    } catch {
      return { kind: 'cleanup' as const, result: convexCleanupResult(unknownResult('cleanup_action_failed')) }
    }
  },
})

export const completeWork = internalMutation({
  args: vOnCompleteArgs(cleanupContext),
  returns: v.null(),
  handler: async (ctx, { workId, context, result }) => {
    try {
      if (await readCurrentCleanupTarget(ctx, context) === null) return null
      if (context.workKind === 'lease_drain' && result.kind === 'success' && isRecord(result.returnValue) && result.returnValue.kind === 'lease_drain') {
        await ctx.runMutation(internal.capabilityProviderConnections.advanceLeaseDrain, {
          ...context,
          workId,
          now: Date.now(),
          resourceAuthority: context.resourceAuthority,
        })
        return null
      }
      const cleanup = result.kind === 'success' && isRecord(result.returnValue) && result.returnValue.kind === 'cleanup' && isCleanupResult(result.returnValue.result)
        ? result.returnValue.result
        : unknownResult('cleanup_action_failed')
      await ctx.runMutation(internal.capabilityProviderConnections.recordCleanupResult, {
        connectionRef: context.connectionRef,
        commandId: context.commandId,
        expectedAuthorityGeneration: context.expectedAuthorityGeneration,
        expectedAuthorityDigest: context.expectedAuthorityDigest,
        cleanupAttempt: context.cleanupAttempt,
        workId,
        requestDigest: context.requestDigest,
        outcome: cleanup.outcome,
        ...(cleanup.responseDigest === undefined ? {} : { responseDigest: cleanup.responseDigest }),
        ...(cleanup.reasonCode === undefined ? {} : { reasonCode: cleanup.reasonCode }),
        evidenceRefs: [...cleanup.evidenceRefs],
        now: Date.now(),
        resourceAuthority: context.resourceAuthority,
      })
    } catch {
      return null
    }
    return null
  },
})

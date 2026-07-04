"use node";

import { lookup } from 'node:dns/promises'
import net from 'node:net'

import type { Id } from './_generated/dataModel'
import { internalAction } from './_generated/server'
import { anyApi, type FunctionReference } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '../src/modules/common/convex-literals'
import {
  AeEndpointCheckAllowedMethods,
  AeEndpointCheckBackoffMs,
  AeEndpointCheckMaxBodyBytes,
  AeEndpointCheckStandardVersion,
  AeEndpointCheckTimeoutMs,
  BusinessCapabilityKindValues,
  CapabilityTrustStateValues,
  evaluateBusinessOriginManifestContradictions,
  evaluateFreshnessFacet,
  evaluateSchemaFacet,
  parseBusinessOriginManifest,
  type BusinessCapabilityKind,
  type CapabilityCheckFacetResults,
  type CapabilityTrustState,
  type ReachabilityFacetResult,
} from '../src/modules/capabilities/public'

const capabilityKind = literalUnion(BusinessCapabilityKindValues)
const capabilityTrustState = literalUnion(CapabilityTrustStateValues)
const endpointCheckMethod = literalUnion(AeEndpointCheckAllowedMethods)

type EndpointCheckMethod = (typeof AeEndpointCheckAllowedMethods)[number]

type EndpointCheckReadback = Readonly<{
  attemptId: string
  standardVersion: typeof AeEndpointCheckStandardVersion
  checkedAt: number
  trustState: CapabilityTrustState
  checkedEvidenceCount: number
  reachabilityCode: string
  schemaCode: string
  freshnessCode: string
  contradictionCode: string
  publicReadbackAllowed: true
  privatePayloadAllowed: false
}>

type EndpointCheckResult = Readonly<{
  kind: 'ok'
  code: 'capability_check_recorded' | 'capability_check_replayed'
  attemptId: string
  capabilityId: string
  trustState: CapabilityTrustState
  status: 'succeeded' | 'failed' | 'stale'
  repairAction: 'none' | 'retry_later' | 'no_repair'
  retryAfter?: number
  readback: EndpointCheckReadback
}>

type RecordEndpointCheckArgs = Readonly<{
  attemptId: string
  capabilityId: string
  businessId: Id<'businesses'>
  serviceId?: Id<'businessServices'>
  descriptorKey: string
  descriptorJson: string
  kind: BusinessCapabilityKind
  standardVersion: typeof AeEndpointCheckStandardVersion
  method: EndpointCheckMethod
  url: string
  allowedOrigin: string
  manifestUrl: string
  schemaRef: 'ae-ucp:v1'
  sourceHash: string
  previousSourceHash: string
  previousState: CapabilityTrustState
  generatedAt: number
  domainControl: {
    originUrl: string
    checkedAt: number
    expiresAt: number
  }
  aeHeldFacts: {
    businessName: string
    category: string
    claimedLocation: string
    claimedServiceIdentity: string
    publicUrl: string
    originUrl: string
    ownerIdentifiers: string[]
  }
  checkedAt: number
  retryCount: number
  facets: CapabilityCheckFacetResults
  failureMessageRedacted?: string
}>

const recordEndpointCheckAttemptRef: FunctionReference<
  'mutation',
  'internal',
  RecordEndpointCheckArgs,
  EndpointCheckResult
> = anyApi.capabilities?.recordEndpointCheckAttempt ?? missingFunctionReference('capabilities:recordEndpointCheckAttempt')

function missingFunctionReference(name: string): never {
  throw new Error(`Convex anyApi did not expose ${name}.`)
}

const readbackResult = v.object({
  attemptId: v.string(),
  standardVersion: v.literal(AeEndpointCheckStandardVersion),
  checkedAt: v.number(),
  trustState: capabilityTrustState,
  checkedEvidenceCount: v.number(),
  reachabilityCode: v.string(),
  schemaCode: v.string(),
  freshnessCode: v.string(),
  contradictionCode: v.string(),
  publicReadbackAllowed: v.literal(true),
  privatePayloadAllowed: v.literal(false),
})

const endpointCheckResult = v.object({
  kind: v.literal('ok'),
  code: v.union(v.literal('capability_check_recorded'), v.literal('capability_check_replayed')),
  attemptId: v.string(),
  capabilityId: v.string(),
  trustState: capabilityTrustState,
  status: v.union(v.literal('succeeded'), v.literal('failed'), v.literal('stale')),
  repairAction: v.union(v.literal('none'), v.literal('retry_later'), v.literal('no_repair')),
  retryAfter: v.optional(v.number()),
  readback: readbackResult,
})

export const runEndpointCheck = internalAction({
  args: {
    attemptId: v.string(),
    capabilityId: v.string(),
    businessId: v.id('businesses'),
    serviceId: v.optional(v.id('businessServices')),
    descriptorKey: v.string(),
    kind: capabilityKind,
    method: endpointCheckMethod,
    url: v.string(),
    allowedOrigin: v.string(),
    manifestUrl: v.string(),
    schemaRef: v.literal('ae-ucp:v1'),
    sourceHash: v.string(),
    previousSourceHash: v.string(),
    previousState: capabilityTrustState,
    generatedAt: v.number(),
    retryCount: v.number(),
    now: v.optional(v.number()),
    domainControl: v.object({
      originUrl: v.string(),
      checkedAt: v.number(),
      expiresAt: v.number(),
    }),
    aeHeldFacts: v.object({
      businessName: v.string(),
      category: v.string(),
      claimedLocation: v.string(),
      claimedServiceIdentity: v.string(),
      publicUrl: v.string(),
      originUrl: v.string(),
      ownerIdentifiers: v.array(v.string()),
    }),
  },
  returns: endpointCheckResult,
  handler: async (ctx, args): Promise<EndpointCheckResult> => {
    const now = args.now ?? Date.now()
    const exhausted = args.retryCount >= AeEndpointCheckBackoffMs.length
    const fetchResult = await fetchEndpoint({
      method: args.method,
      url: args.url,
      allowedOrigin: args.allowedOrigin,
      domainControlOrigin: args.domainControl.originUrl,
      domainControlExpiresAt: args.domainControl.expiresAt,
      now,
      exhausted,
    })

    const parsed = fetchResult.kind === 'ok' ? parseBody(fetchResult.bodyText, args.allowedOrigin) : undefined
    const sourceHash = parsed?.kind === 'parsed' ? parsed.retainedManifest.sourceHash : args.sourceHash
    const generatedAt = parsed?.kind === 'parsed' ? parsedGeneratedAt(parsed.retainedManifest.generatedAt, args.generatedAt) : args.generatedAt
    const facets: CapabilityCheckFacetResults = {
      reachability: fetchResult.reachability,
      schema: schemaFacet(parsed, exhausted),
      freshness: evaluateFreshnessFacet({
        kind: args.kind,
        now,
        generatedAt,
        sourceHash,
        previousSourceHash: args.previousSourceHash,
      }),
      contradiction: parsed?.kind === 'parsed'
        ? evaluateBusinessOriginManifestContradictions({ manifest: parsed.retainedManifest, aeHeldFacts: args.aeHeldFacts })
        : { facet: 'contradiction', outcome: 'pass', code: 'not_contradicted' },
    }

    const descriptor = parsed?.kind === 'parsed'
      ? parsed.descriptor
      : { kind: args.kind, originUrl: args.allowedOrigin, manifestUrl: args.manifestUrl, schemaRef: args.schemaRef }

    const result: EndpointCheckResult = await ctx.runMutation(recordEndpointCheckAttemptRef, {
      attemptId: args.attemptId,
      capabilityId: args.capabilityId,
      businessId: args.businessId,
      ...(args.serviceId === undefined ? {} : { serviceId: args.serviceId }),
      descriptorKey: args.descriptorKey,
      descriptorJson: JSON.stringify(descriptor),
      kind: args.kind,
      standardVersion: AeEndpointCheckStandardVersion,
      method: args.method,
      url: args.url,
      allowedOrigin: args.allowedOrigin,
      manifestUrl: args.manifestUrl,
      schemaRef: args.schemaRef,
      sourceHash,
      previousSourceHash: args.previousSourceHash,
      previousState: args.previousState,
      generatedAt,
      checkedAt: now,
      domainControl: args.domainControl,
      aeHeldFacts: args.aeHeldFacts,
      retryCount: args.retryCount,
      facets,
      ...(fetchResult.kind === 'ok' ? {} : { failureMessageRedacted: fetchResult.reason }),
    })

    return result
  },
})

type FetchEndpointInput = Readonly<{
  method: 'GET' | 'HEAD'
  url: string
  allowedOrigin: string
  domainControlOrigin: string
  domainControlExpiresAt: number
  now: number
  exhausted: boolean
}>

type FetchEndpointResult =
  | Readonly<{ kind: 'ok'; bodyText: string; reachability: ReachabilityFacetResult }>
  | Readonly<{ kind: 'blocked'; reason: string; reachability: ReachabilityFacetResult }>

async function fetchEndpoint(input: FetchEndpointInput): Promise<FetchEndpointResult> {
  const target = parseUrl(input.url)
  const allowedOrigin = parseUrl(input.allowedOrigin)
  const domainControlOrigin = parseUrl(input.domainControlOrigin)

  if (target === undefined || allowedOrigin === undefined || domainControlOrigin === undefined) {
    return blocked('host_not_allowed', 'invalid_endpoint_url', false, input.exhausted)
  }
  if (target.protocol !== 'https:' || allowedOrigin.protocol !== 'https:' || domainControlOrigin.protocol !== 'https:') {
    return blocked('non_https', 'non_https_endpoint', false, input.exhausted)
  }
  if (target.origin !== allowedOrigin.origin || allowedOrigin.origin !== domainControlOrigin.origin) {
    return blocked('host_not_allowed', 'endpoint_origin_not_allowlisted', false, input.exhausted)
  }
  if (input.now > input.domainControlExpiresAt) {
    return blocked('host_not_allowed', 'domain_control_expired', false, input.exhausted)
  }

  let current = target
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const hostCheck = await validateResolvedHost(current.hostname)
    if (hostCheck.kind === 'blocked') {
      return blocked(hostCheck.reason, hostCheck.message, false, input.exhausted)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), AeEndpointCheckTimeoutMs)
    try {
      const response = await fetch(current.toString(), {
        method: input.method,
        redirect: 'manual',
        signal: controller.signal,
      })

      if (isRedirect(response.status)) {
        const location = response.headers.get('location')
        const redirected = location === null ? undefined : parseUrl(location, current)
        if (redirected === undefined || redirected.origin !== allowedOrigin.origin) {
          return blocked('unsafe_redirect', 'redirect_target_not_allowlisted', false, input.exhausted)
        }
        current = redirected
        continue
      }

      if (response.status < 200 || response.status > 299) {
        return blocked('http_status', `http_status_${response.status}`, true, input.exhausted)
      }

      if (input.method === 'HEAD') {
        return { kind: 'ok', bodyText: '', reachability: reachable() }
      }

      const bodyResult = await readBodyWithCap(response, AeEndpointCheckMaxBodyBytes)
      if (bodyResult.kind === 'too_large') {
        return blocked('body_too_large', 'response_body_too_large', true, input.exhausted)
      }
      return { kind: 'ok', bodyText: bodyResult.bodyText, reachability: reachable() }
    } catch (error) {
      if (isAbortError(error)) {
        return blocked('timeout', 'fetch_timeout', true, input.exhausted)
      }
      if (isTlsError(error)) {
        return blocked('tls_invalid', 'tls_invalid', false, input.exhausted)
      }
      return blocked('timeout', 'fetch_failed', true, input.exhausted)
    } finally {
      clearTimeout(timeout)
    }
  }

  return blocked('unsafe_redirect', 'redirect_limit_exceeded', false, input.exhausted)
}

function parseBody(bodyText: string, allowedOrigin: string): ReturnType<typeof parseBusinessOriginManifest> {
  try {
    return parseBusinessOriginManifest(JSON.parse(bodyText), allowedOrigin)
  } catch {
    return { kind: 'rejected', reason: 'schema_invalid' }
  }
}

function schemaFacet(
  parsed: ReturnType<typeof parseBusinessOriginManifest> | undefined,
  exhausted: boolean
): CapabilityCheckFacetResults['schema'] {
  if (parsed?.kind === 'parsed') {
    return evaluateSchemaFacet({ schemaRef: parsed.descriptor.schemaRef, strictParse: true, forbiddenClaims: [], exhausted: false })
  }
  if (parsed?.kind === 'rejected' && parsed.reason === 'forbidden_claim') {
    return evaluateSchemaFacet({
      schemaRef: 'ae-ucp:v1',
      strictParse: true,
      forbiddenClaims: parsed.forbiddenClaims,
      exhausted: true,
    })
  }
  return evaluateSchemaFacet({ schemaRef: 'ae-ucp:v1', strictParse: false, forbiddenClaims: [], exhausted })
}

function parsedGeneratedAt(value: string, fallback: number): number {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : fallback
}

function parseUrl(value: string, base?: URL): URL | undefined {
  try {
    return base === undefined ? new URL(value) : new URL(value, base)
  } catch {
    return undefined
  }
}

function reachable(): ReachabilityFacetResult {
  return { facet: 'reachability', outcome: 'pass', code: 'reachable' }
}

function blocked(
  reason: Exclude<ReachabilityFacetResult, { outcome: 'pass' }>['reason'],
  message: string,
  retryable: boolean,
  exhausted: boolean
): FetchEndpointResult {
  return {
    kind: 'blocked',
    reason: message,
    reachability: {
      facet: 'reachability',
      outcome: 'fail',
      code: 'unreachable',
      reason,
      retryable,
      exhausted,
    },
  }
}

type HostCheckResult =
  | Readonly<{ kind: 'ok' }>
  | Readonly<{ kind: 'blocked'; reason: 'private_network' | 'host_not_allowed'; message: string }>

async function validateResolvedHost(hostname: string): Promise<HostCheckResult> {
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true })
    if (addresses.length === 0) {
      return { kind: 'blocked', reason: 'host_not_allowed', message: 'dns_unresolved' }
    }
    if (addresses.some((record) => isPrivateAddress(record.address))) {
      return { kind: 'blocked', reason: 'private_network', message: 'resolved_private_network' }
    }
    return { kind: 'ok' }
  } catch {
    return { kind: 'blocked', reason: 'host_not_allowed', message: 'dns_unresolved' }
  }
}

function isPrivateAddress(address: string): boolean {
  const mappedV4 = ipv4FromMappedIpv6(address)
  if (mappedV4 !== undefined) return isPrivateIpv4(mappedV4)

  const ipVersion = net.isIP(address)
  if (ipVersion === 4) return isPrivateIpv4(address)
  if (ipVersion === 6) return isPrivateIpv6(address)
  return true
}

function ipv4FromMappedIpv6(address: string): string | undefined {
  const prefix = '::ffff:'
  if (!address.toLowerCase().startsWith(prefix)) return undefined
  const ipv4 = address.slice(prefix.length)
  return net.isIP(ipv4) === 4 ? ipv4 : undefined
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [first, second] = parts
  if (first === undefined || second === undefined) return true

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  )
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase()
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  )
}

function isRedirect(status: number): boolean {
  return status >= 300 && status <= 399
}

async function readBodyWithCap(
  response: Response,
  maxBytes: number
): Promise<Readonly<{ kind: 'ok'; bodyText: string }> | Readonly<{ kind: 'too_large' }>> {
  if (response.body === null) return { kind: 'ok', bodyText: '' }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const next = await reader.read()
    if (next.done) break
    total += next.value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      return { kind: 'too_large' }
    }
    chunks.push(next.value)
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { kind: 'ok', bodyText: new TextDecoder().decode(body) }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function isTlsError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return message.includes('certificate') || message.includes('tls') || message.includes('ssl')
}

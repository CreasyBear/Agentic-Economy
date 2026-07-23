import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { dirname, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { ConsumerComparisonEvidence } from './consumer-comparison-evidence'

const profiles = new Set(['machine_data:v1', 'professional_service:v1'])
const requiredCommands = [
  'npm run verify:phase5:release-source',
  'npm run verify:phase5:browser',
  'npm run check:convex-codegen',
  'test -z "$(git status --porcelain=v1 --untracked-files=all)"',
]
const digestPattern = /^sha256:[a-f0-9]{64}$/u
const semanticDigestPattern = /^hash:[a-f0-9]{8}$/u

export function verifyConsumerComparisonEvidence(
  input: unknown,
  expected: { revision: string; tree: string; deploymentId: string; artifactRoot: string },
): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  if (!isRecord(input)) return { ok: false, errors: ['manifest_not_object'] }
  const packet = input as unknown as ConsumerComparisonEvidence
  if (packet.schemaVersion !== 'ae.consumer-comparison-evidence:v1') errors.push('schema_version_invalid')
  if (packet.source?.revision !== expected.revision) errors.push('source_revision_mismatch')
  if (packet.source?.tree !== expected.tree) errors.push('source_tree_mismatch')
  if (packet.source?.clean !== true) errors.push('source_not_clean')
  if (packet.deployment?.servedRevision !== expected.revision) errors.push('served_revision_mismatch')
  if (packet.deployment?.identitySource !== 'provider_authenticated_release_readback') errors.push('deployment_identity_untrusted')
  if (packet.deployment?.deploymentId !== expected.deploymentId) errors.push('deployment_id_mismatch')
  if (!isPublicHttpsOrigin(packet.deployment?.baseUrl)) errors.push('hosted_https_public_origin_required')
  if (packet.data?.label !== 'labelled_demo') errors.push('data_not_labelled')

  const profileCounts = new Map<string, number>()
  const selections = Array.isArray(packet.data?.selections) ? packet.data.selections : []
  if (selections.length < 4) errors.push('four_labelled_selections_required')
  for (const selection of selections) {
    if (!profiles.has(selection.profileVersion) || selection.dataLabel !== 'labelled_demo') {
      errors.push('selection_profile_or_label_invalid')
    }
    profileCounts.set(selection.profileVersion, (profileCounts.get(selection.profileVersion) ?? 0) + 1)
  }
  if ([...profiles].some((profile) => (profileCounts.get(profile) ?? 0) < 2)) errors.push('two_selections_per_profile_required')
  if (!selectionUrlMatches(selections, packet.deployment?.baseUrl)) errors.push('selection_canonical_url_mismatch')
  if (
    packet.commands?.length !== requiredCommands.length
    || requiredCommands.some((required, index) => packet.commands?.[index] !== required)
  ) {
    errors.push('mandatory_gate_command_missing')
  }

  const artifactEntries = [
    packet.artifacts?.humanLoaderResponse,
    packet.artifacts?.structuredPostResponse,
    packet.artifacts?.zeroEffectObservation,
    ...(packet.artifacts?.screenshots ?? []),
  ]
  for (const artifact of artifactEntries) {
    if (!artifact || typeof artifact.path !== 'string' || !digestPattern.test(artifact.digest)) {
      errors.push('artifact_reference_invalid')
      continue
    }
    if (!within(expected.artifactRoot, artifact.path)) errors.push('artifact_outside_expected_root')
    try {
      if (digestFile(artifact.path) !== artifact.digest) errors.push('artifact_digest_mismatch')
    } catch {
      errors.push('artifact_unreadable')
    }
  }

  if (packet.artifacts?.humanLoaderResponse?.semanticDigest
    !== packet.artifacts?.structuredPostResponse?.semanticDigest) {
    errors.push('human_agent_semantic_mismatch')
  }
  verifyPublicResponse(packet.artifacts?.humanLoaderResponse, errors)
  verifyPublicResponse(packet.artifacts?.structuredPostResponse, errors)
  verifyZeroEffect(packet.artifacts?.zeroEffectObservation, errors)

  const suppliedChecksum = packet.packetChecksum
  if (!digestPattern.test(suppliedChecksum) || checksumConsumerComparisonEvidence(packet) !== suppliedChecksum) {
    errors.push('packet_checksum_mismatch')
  }
  if (containsForbiddenMaterial(packet)) errors.push('sensitive_or_unowned_material')
  return { ok: errors.length === 0, errors: [...new Set(errors)] }
}

export function checksumConsumerComparisonEvidence(packet: ConsumerComparisonEvidence): string {
  return `sha256:${createHash('sha256').update(stableJson({ ...packet, packetChecksum: '' })).digest('hex')}`
}

function verifyPublicResponse(
  artifact: ConsumerComparisonEvidence['artifacts']['humanLoaderResponse'] | undefined,
  errors: string[],
): void {
  if (artifact === undefined) return
  try {
    const value: unknown = JSON.parse(readFileSync(artifact.path, 'utf8'))
    if (
      !isRecord(value)
      || value.semanticDigest !== artifact.semanticDigest
      || !semanticDigestPattern.test(artifact.semanticDigest)
    ) {
      errors.push('public_response_semantics_invalid')
    }
    if (containsForbiddenMaterial(value)) errors.push('sensitive_or_unowned_material')
  } catch {
    errors.push('public_response_unreadable')
  }
}

function verifyZeroEffect(
  artifact: ConsumerComparisonEvidence['artifacts']['zeroEffectObservation'] | undefined,
  errors: string[],
): void {
  if (artifact === undefined) return
  try {
    const value: unknown = JSON.parse(readFileSync(artifact.path, 'utf8'))
    if (!isRecord(value)
      || value.schemaVersion !== 'ae.consumer-comparison-zero-effect:v2'
      || value.observer !== 'playwright:consumer-comparison-network-observation:v1'
      || artifact.observer !== value.observer
      || !isStringArray(value.allowedRequests)
      || !isStringArray(value.internalObservationRequests)
      || !isStringArray(value.effectfulRequests)
      || !sameStrings(
        value.internalObservationRequests,
        classifyRequests(value.allowedRequests).internalObservationRequests,
      )
      || !sameStrings(value.effectfulRequests, classifyRequests(value.allowedRequests).effectfulRequests)
      || value.effectfulRequests.length !== 0) {
      errors.push('authoritative_zero_effect_observation_invalid')
    }
  } catch {
    errors.push('zero_effect_observation_unreadable')
  }
}

function classifyRequests(requests: readonly string[]): Readonly<{
  internalObservationRequests: string[]
  effectfulRequests: string[]
}> {
  const inspectOnlyPosts = new Set(['/api/answer/turn', '/api/compare'])
  const internalObservationPosts = new Set(['/api/observability/funnel'])
  const internalObservationRequests: string[] = []
  const effectfulRequests: string[] = []
  for (const request of requests) {
    const [method, pathname, extra] = request.split(' ')
    if (extra !== undefined || method === undefined || pathname === undefined) {
      effectfulRequests.push(request)
      continue
    }
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') continue
    if (method === 'POST' && inspectOnlyPosts.has(pathname)) continue
    if (method === 'POST' && internalObservationPosts.has(pathname)) {
      internalObservationRequests.push(request)
      continue
    }
    effectfulRequests.push(request)
  }
  return { internalObservationRequests, effectfulRequests }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function sameStrings(left: readonly unknown[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index])
}

function selectionUrlMatches(
  selections: ConsumerComparisonEvidence['data']['selections'],
  baseUrl: string | undefined,
): boolean {
  try {
    const [first] = selections
    if (first === undefined || selections.some((selection) => selection.canonicalUrl !== first.canonicalUrl)) return false
    const url = new URL(first.canonicalUrl)
    if (baseUrl === undefined || url.origin !== new URL(baseUrl).origin || url.pathname !== '/compare') return false
    const encoded = url.searchParams.getAll('selection')
    if (encoded.length !== selections.length) return false
    return selections.every((selection, index) => {
      const parsed: unknown = JSON.parse(encoded[index]!)
      return isRecord(parsed)
        && parsed.businessId === selection.businessId
        && parsed.offeringRef === selection.offeringRef
        && parsed.offeringRevision === selection.revision
        && parsed.projectionObservedAt === selection.projectionObservedAt
    })
  } catch {
    return false
  }
}

function containsForbiddenMaterial(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenMaterial)
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, entry]) => (
    /auth(?:orization|token)?|credential|customer.?text|source.?hash|private.?projection|provider.?effect|api.?key|secret/iu.test(key)
    || containsForbiddenMaterial(entry)
  ))
}

function digestFile(path: string): string {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`
}

function within(root: string, path: string): boolean {
  const fromRoot = relative(resolve(root), resolve(path))
  return fromRoot !== '..' && !fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
}

function isPublicHttpsOrigin(value: unknown): boolean {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== ''
      || url.pathname !== '/' || url.search !== '' || url.hash !== '') return false
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return false
    const version = isIP(hostname)
    if (version === 4) {
      const [a = 0, b = 0] = hostname.split('.').map(Number)
      return !(a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))
    }
    if (version === 6) {
      return !(hostname === '::1' || hostname === '::' || hostname.startsWith('fc')
        || hostname.startsWith('fd') || /^fe[89ab]/u.test(hostname))
    }
    return true
  } catch {
    return false
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function main(): void {
  const manifestPath = process.argv[2]
  if (manifestPath === undefined) throw new Error('manifest_path_required')
  const revision = process.env.CONSUMER_COMPARISON_EXPECTED_REVISION?.trim()
  const tree = process.env.CONSUMER_COMPARISON_EXPECTED_TREE?.trim()
  const deploymentId = process.env.CONSUMER_COMPARISON_DEPLOYMENT_ID?.trim()
  if (revision === undefined || tree === undefined || deploymentId === undefined) throw new Error('expected_source_identity_required')
  const result = verifyConsumerComparisonEvidence(JSON.parse(readFileSync(manifestPath, 'utf8')), {
    revision,
    tree,
    deploymentId,
    artifactRoot: dirname(resolve(manifestPath)),
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (!result.ok) process.exitCode = 1
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) main()

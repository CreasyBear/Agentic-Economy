import { createHash } from 'node:crypto'
import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { isAbsolute, relative, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { verifyHostedCustomerRequestRelease } from './verify-customer-request-release'

const profiles = new Set(['machine_data:v1', 'professional_service:v1'])
const requiredCommands = [
  'npm run verify:phase5:release-source',
  'npm run verify:phase5:browser',
  'npm run check:convex-codegen',
  'test -z "$(git status --porcelain=v1 --untracked-files=all)"',
]
const semanticDigest = /^hash:[a-f0-9]{8}$/u
const gitObject = /^[a-f0-9]{40}$/u
const forbiddenKey = /auth(?:orization|token)?|credential|customer.?text|source.?hash|private.?projection|provider.?effect|api.?key|secret/iu

export interface ConsumerComparisonEvidenceInput {
  source: { cwd: string; expectedRevision: string; expectedTree: string }
  deployment: { baseUrl: string; expectedDeploymentId: string; smokeAuth: string }
  data: {
    label: 'labelled_demo'
    seedVersion: string
    selections: Array<{
      businessId: string
      offeringRef: string
      revision: number
      projectionObservedAt: number
      profileVersion: 'machine_data:v1' | 'professional_service:v1'
      dataLabel: 'labelled_demo'
      canonicalUrl: string
    }>
  }
  artifacts: {
    humanLoaderResponse: string
    structuredPostResponse: string
    zeroEffectObservation: string
    screenshots: Array<{ state: string; path: string }>
  }
  commands: string[]
  firstFailures: string[]
}

export interface ConsumerComparisonEvidence {
  schemaVersion: 'ae.consumer-comparison-evidence:v1'
  source: { revision: string; tree: string; clean: true }
  deployment: {
    baseUrl: string
    deploymentId: string
    servedRevision: string
    identitySource: 'provider_authenticated_release_readback'
  }
  data: Omit<ConsumerComparisonEvidenceInput['data'], 'selections'> & {
    selections: ConsumerComparisonEvidenceInput['data']['selections']
  }
  artifacts: {
    humanLoaderResponse: { path: string; digest: string; semanticDigest: string }
    structuredPostResponse: { path: string; digest: string; semanticDigest: string }
    zeroEffectObservation: { path: string; digest: string; observer: string }
    screenshots: Array<{ state: string; path: string; digest: string }>
  }
  commands: string[]
  firstFailures: string[]
  claimCeiling: 'authenticated exact-revision hosted labelled comparison capability only'
  packetChecksum: string
}

export interface ConsumerComparisonEvidenceDependencies {
  inspectRepository?: (cwd: string) => { revision: string; tree: string; clean: boolean }
  authenticateDeployment?: (input: {
    baseUrl: string
    expectedDeploymentId: string
    expectedRevision: string
    smokeAuth: string
  }) => Promise<{ deploymentId: string; servedRevision: string }>
}

export async function createConsumerComparisonEvidence(
  input: ConsumerComparisonEvidenceInput,
  dependencies: ConsumerComparisonEvidenceDependencies = {},
): Promise<ConsumerComparisonEvidence> {
  assertNoUnownedMaterial({
    ...input,
    deployment: { ...input.deployment, smokeAuth: undefined },
  })
  assertPublicHttpsOrigin(input.deployment.baseUrl)
  if (!gitObject.test(input.source.expectedRevision) || !gitObject.test(input.source.expectedTree)) {
    throw new Error('expected_git_identity_invalid')
  }
  const repository = (dependencies.inspectRepository ?? inspectRepository)(input.source.cwd)
  if (repository.revision !== input.source.expectedRevision) throw new Error('repository_revision_mismatch')
  if (repository.tree !== input.source.expectedTree) throw new Error('repository_tree_mismatch')
  if (!repository.clean) throw new Error('repository_not_clean')

  assertData(input)
  assertCommands(input.commands)
  const deployment = await (dependencies.authenticateDeployment ?? authenticateDeployment)({
    baseUrl: input.deployment.baseUrl,
    expectedDeploymentId: input.deployment.expectedDeploymentId,
    expectedRevision: input.source.expectedRevision,
    smokeAuth: required(input.deployment.smokeAuth, 'smoke_auth_required'),
  })
  if (deployment.deploymentId !== input.deployment.expectedDeploymentId) throw new Error('deployment_id_mismatch')
  if (deployment.servedRevision !== input.source.expectedRevision) throw new Error('served_revision_mismatch')

  for (const path of [
    input.artifacts.humanLoaderResponse,
    input.artifacts.structuredPostResponse,
    input.artifacts.zeroEffectObservation,
    ...input.artifacts.screenshots.map((screenshot) => screenshot.path),
  ]) assertArtifactWithin(input.source.cwd, path)
  const human = readPublicResponse(input.artifacts.humanLoaderResponse)
  const structured = readPublicResponse(input.artifacts.structuredPostResponse)
  if (human.semanticDigest !== structured.semanticDigest) throw new Error('human_agent_semantic_mismatch')
  const zeroEffect = readZeroEffect(input.artifacts.zeroEffectObservation)

  const packet = {
    schemaVersion: 'ae.consumer-comparison-evidence:v1',
    source: { revision: repository.revision, tree: repository.tree, clean: true },
    deployment: {
      baseUrl: input.deployment.baseUrl,
      deploymentId: deployment.deploymentId,
      servedRevision: deployment.servedRevision,
      identitySource: 'provider_authenticated_release_readback',
    },
    data: structuredClone(input.data),
    artifacts: {
      humanLoaderResponse: {
        path: input.artifacts.humanLoaderResponse,
        digest: digestFile(input.artifacts.humanLoaderResponse),
        semanticDigest: human.semanticDigest,
      },
      structuredPostResponse: {
        path: input.artifacts.structuredPostResponse,
        digest: digestFile(input.artifacts.structuredPostResponse),
        semanticDigest: structured.semanticDigest,
      },
      zeroEffectObservation: {
        path: input.artifacts.zeroEffectObservation,
        digest: digestFile(input.artifacts.zeroEffectObservation),
        observer: zeroEffect.observer,
      },
      screenshots: input.artifacts.screenshots.map(({ state, path }) => ({
        state: required(state, 'screenshot_state_required'),
        path,
        digest: digestFile(path),
      })),
    },
    commands: [...input.commands],
    firstFailures: [...input.firstFailures],
    claimCeiling: 'authenticated exact-revision hosted labelled comparison capability only',
    packetChecksum: '',
  } satisfies ConsumerComparisonEvidence
  packet.packetChecksum = checksum(packet)
  return packet
}

export function writeConsumerComparisonEvidenceOnce(
  outputPath: string,
  packet: ConsumerComparisonEvidence,
): void {
  let descriptor: number
  try {
    descriptor = openSync(outputPath, 'wx')
  } catch (error) {
    if (isNodeError(error) && error.code === 'EEXIST') throw new Error('evidence_manifest_already_exists')
    throw error
  }
  try {
    writeFileSync(descriptor, `${JSON.stringify(packet, null, 2)}\n`, 'utf8')
  } finally {
    closeSync(descriptor)
  }
}

function inspectRepository(cwd: string): { revision: string; tree: string; clean: boolean } {
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  return {
    revision: git('rev-parse', 'HEAD'),
    tree: git('rev-parse', 'HEAD^{tree}'),
    clean: git('status', '--porcelain=v1', '--untracked-files=all') === '',
  }
}

async function authenticateDeployment(input: {
  baseUrl: string
  expectedDeploymentId: string
  expectedRevision: string
  smokeAuth: string
}): Promise<{ deploymentId: string; servedRevision: string }> {
  const verified = await verifyHostedCustomerRequestRelease({
    baseUrl: input.baseUrl,
    apiKey: input.smokeAuth,
    expectedRevision: input.expectedRevision,
    expectedDeploymentId: input.expectedDeploymentId,
  })
  return { deploymentId: verified.deploymentId, servedRevision: verified.revision }
}

function assertData(input: ConsumerComparisonEvidenceInput): void {
  if (input.data.label !== 'labelled_demo' || input.data.seedVersion.trim().length === 0) {
    throw new Error('labelled_demo_data_required')
  }
  if (input.data.selections.length < 4) throw new Error('four_labelled_selections_required')
  const profileCounts = new Map<string, number>()
  const exact = new Set<string>()
  for (const selection of input.data.selections) {
    if (!profiles.has(selection.profileVersion) || selection.dataLabel !== input.data.label) {
      throw new Error('selection_profile_or_label_invalid')
    }
    profileCounts.set(selection.profileVersion, (profileCounts.get(selection.profileVersion) ?? 0) + 1)
    const key = `${selection.businessId}\u0000${selection.offeringRef}\u0000${selection.revision}`
    if (exact.has(key)) throw new Error('duplicate_selection')
    exact.add(key)
  }
  if ([...profiles].some((profile) => (profileCounts.get(profile) ?? 0) < 2)) {
    throw new Error('two_selections_per_profile_required')
  }
  assertSelectionUrl(input.data.selections, input.deployment.baseUrl)
}

function assertSelectionUrl(
  selections: ConsumerComparisonEvidenceInput['data']['selections'],
  baseUrl: string,
): void {
  const [first] = selections
  if (first === undefined || selections.some((selection) => selection.canonicalUrl !== first.canonicalUrl)) {
    throw new Error('selection_canonical_url_mismatch')
  }
  const url = new URL(first.canonicalUrl)
  if (url.origin !== new URL(baseUrl).origin || url.pathname !== '/compare') {
    throw new Error('selection_canonical_url_mismatch')
  }
  const encoded = url.searchParams.getAll('selection')
  if (encoded.length !== selections.length) throw new Error('selection_canonical_url_mismatch')
  for (const [index, selection] of selections.entries()) {
    let parsed: unknown
    try {
      parsed = JSON.parse(encoded[index]!)
    } catch {
      throw new Error('selection_canonical_url_mismatch')
    }
    if (!isRecord(parsed)
      || parsed.businessId !== selection.businessId
      || parsed.offeringRef !== selection.offeringRef
      || parsed.offeringRevision !== selection.revision
      || parsed.projectionObservedAt !== selection.projectionObservedAt) {
      throw new Error('selection_canonical_url_mismatch')
    }
  }
}

function assertCommands(commands: string[]): void {
  if (
    commands.length !== requiredCommands.length
    || requiredCommands.some((requiredCommand, index) => commands[index] !== requiredCommand)
  ) {
    throw new Error('mandatory_gate_command_missing')
  }
}

function assertPublicHttpsOrigin(value: string): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('hosted_https_public_origin_required')
  }
  const hostname = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.pathname !== '/'
    || url.search !== '' || url.hash !== '' || isPrivateHost(hostname)) {
    throw new Error('hosted_https_public_origin_required')
  }
}

function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return true
  const version = isIP(hostname)
  if (version === 4) {
    const [a = 0, b = 0] = hostname.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  }
  if (version === 6) {
    return hostname === '::1' || hostname === '::' || hostname.startsWith('fc')
      || hostname.startsWith('fd') || hostname.startsWith('fe8') || hostname.startsWith('fe9')
      || hostname.startsWith('fea') || hostname.startsWith('feb')
  }
  return false
}

function readPublicResponse(path: string): { semanticDigest: string } {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  assertNoUnownedMaterial(value)
  if (
    !isRecord(value)
    || typeof value.semanticDigest !== 'string'
    || !semanticDigest.test(value.semanticDigest)
  ) {
    throw new Error('public_response_semantic_digest_invalid')
  }
  return { semanticDigest: value.semanticDigest }
}

function readZeroEffect(path: string): { observer: string } {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isRecord(value)
    || value.schemaVersion !== 'ae.consumer-comparison-zero-effect:v2'
    || value.observer !== 'playwright:consumer-comparison-network-observation:v1'
    || !isStringArray(value.allowedRequests)
    || !isStringArray(value.internalObservationRequests)
    || !Array.isArray(value.effectfulRequests)
    || !sameStrings(
      value.internalObservationRequests,
      classifyRequests(value.allowedRequests).internalObservationRequests,
    )
    || !sameStrings(value.effectfulRequests, classifyRequests(value.allowedRequests).effectfulRequests)
    || value.effectfulRequests.length !== 0) {
    throw new Error('authoritative_zero_effect_observation_invalid')
  }
  return { observer: value.observer }
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

function assertNoUnownedMaterial(value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) assertNoUnownedMaterial(entry)
    return
  }
  if (!isRecord(value)) return
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined && forbiddenKey.test(key)) throw new Error('sensitive_or_unowned_material')
    assertNoUnownedMaterial(entry)
  }
}

function digestFile(path: string): string {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`
}

function assertArtifactWithin(root: string, path: string): void {
  const candidate = resolve(path)
  const fromRoot = relative(resolve(root), candidate)
  if (!isAbsolute(candidate) || fromRoot === '..' || fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new Error('artifact_outside_source_root')
  }
}

function checksum(packet: ConsumerComparisonEvidence): string {
  return `sha256:${createHash('sha256').update(stableJson({ ...packet, packetChecksum: '' })).digest('hex')}`
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function required(value: string, error: string): string {
  if (value.trim().length === 0) throw new Error(error)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && 'code' in value
}

async function main(): Promise<void> {
  const inputPath = process.argv[2]
  const outputPath = process.argv[3]
  if (inputPath === undefined || outputPath === undefined) {
    throw new Error('usage: consumer-comparison-evidence <input.json> <output.json>')
  }
  const input = JSON.parse(readFileSync(inputPath, 'utf8')) as ConsumerComparisonEvidenceInput
  input.deployment.smokeAuth = required(process.env.CONSUMER_COMPARISON_SMOKE_AUTH ?? '', 'smoke_auth_required')
  const packet = await createConsumerComparisonEvidence(input)
  writeConsumerComparisonEvidenceOnce(outputPath, packet)
  process.stdout.write(`${JSON.stringify({ kind: 'consumer_comparison_evidence_created', packetChecksum: packet.packetChecksum })}\n`)
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) await main()

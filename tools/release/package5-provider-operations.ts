import { pathToFileURL } from 'node:url'
import { z } from 'zod'

import { jsonValueSchema } from '../../src/modules/capability-contract/public'
import {
  OPERATION_INSPECT_PATH,
  operationInspectResultSchema,
} from '../../src/modules/capability-execution/operation-commitment'
import {
  operationInvokeInputSchema,
  operationInvokeMachineResultSchema,
} from '../../src/modules/capability-execution/operation-invoke-contracts'
import { OPERATION_INVOKE_HTTP_PATH } from '../../src/modules/capability-execution/operation-invoke-entry'
import {
  supplySourceInputSchema,
  supplySourcePreviewSchema,
  type SupplyOperationCandidate,
} from '../../src/modules/capability-supply/source-preview'
import {
  publishSupplyOperationV2InputSchema,
} from '../../src/modules/capability-supply/supply-publication-v2'
import {
  supplyOperationsListResultSchema,
  supplyPublishResultSchema,
  supplyStatusResultSchema,
  SUPPLY_ACTION_ROUTE_CONTRACTS,
} from '../../src/modules/capability-supply/supply-actions'
import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import {
  OPERATION_MARKET_DESCRIBE_PATH,
  OPERATION_MARKET_SEARCH_PATH,
} from '../../src/modules/common/market-operation-paths'
import {
  operationChoiceDescribeOutputSchema,
  operationChoiceSearchOutputSchema,
} from '../../src/modules/registry/operation-choice-contracts'

const SOURCE_KINDS = ['openapi', 'mcp', 'agent_plugin', 'x402'] as const
const MAX_RESPONSE_BYTES = 1_048_576
const MAX_PROVIDER_DIRECTORY_PAGES = 100

const sourceKindSchema = z.enum(SOURCE_KINDS)
const jsonObjectSchema = z.record(z.string(), jsonValueSchema)
const fixtureSchema = z.strictObject({
  kind: sourceKindSchema,
  source: supplySourceInputSchema,
  candidateMatch: z.union([
    z.strictObject({ path: z.string().startsWith('/'), method: z.enum(['get', 'post']) }),
    z.strictObject({ toolName: z.string().trim().min(1) }),
    z.strictObject({ resourceUrl: z.string().url(), method: z.enum(['GET', 'POST']) }),
  ]),
  connectionRef: z.string().trim().min(1).optional(),
  presentation: publishSupplyOperationV2InputSchema.shape.presentation,
  consequences: publishSupplyOperationV2InputSchema.shape.consequences,
  pricing: publishSupplyOperationV2InputSchema.shape.pricing,
  validationInput: jsonObjectSchema,
  invokeInput: jsonObjectSchema,
}).superRefine((fixture, context) => {
  if (fixture.source.kind !== fixture.kind) {
    context.addIssue({ code: 'custom', path: ['source', 'kind'], message: 'fixture_source_kind_mismatch' })
  }
  if (fixture.source.environment !== 'sandbox' && fixture.source.environment !== 'production') {
    context.addIssue({ code: 'custom', path: ['source', 'environment'], message: 'fixture_environment_invalid' })
  }
  const match = fixture.candidateMatch
  if (fixture.kind === 'openapi' && !('path' in match)) {
    context.addIssue({ code: 'custom', path: ['candidateMatch'], message: 'openapi_candidate_match_required' })
  }
  if ((fixture.kind === 'mcp' || fixture.kind === 'agent_plugin') && !('toolName' in match)) {
    context.addIssue({ code: 'custom', path: ['candidateMatch'], message: 'mcp_candidate_match_required' })
  }
  if (fixture.kind === 'x402' && !('resourceUrl' in match)) {
    context.addIssue({ code: 'custom', path: ['candidateMatch'], message: 'x402_candidate_match_required' })
  }
})

export type Package5SourceKind = (typeof SOURCE_KINDS)[number]
export type Package5SourceFixture = z.infer<typeof fixtureSchema>

export type Package5ProviderOperationsConfig = Readonly<{
  baseUrl: string
  expectedSourceRevision: string
  providerApiKey: string
  buyerApiKey: string
  businessRef: string
  environment: 'sandbox' | 'production'
  fixtures: readonly Package5SourceFixture[]
  maxStatusWaitMs: number
  statusDelayMs: number
  fetch: typeof globalThis.fetch
  now: () => number
  sleep: (milliseconds: number) => Promise<void>
}>

const fixtureReceiptSchema = z.strictObject({
  sourceKind: sourceKindSchema,
  source: z.strictObject({
    sourceDigest: z.string(),
    sourceRevision: z.string(),
    candidateRef: z.string(),
  }),
  publication: z.strictObject({
    publicationRef: z.string(),
    publicationRevision: z.number().int().positive(),
    operationRef: z.string(),
  }),
  supplierOperation: z.strictObject({
    state: z.literal('Published'),
    revision: z.number().int().positive(),
    observedAt: z.number(),
    validUntil: z.number().optional(),
  }),
  buyer: z.strictObject({
    commitmentRef: z.string(),
    invocationRef: z.string(),
    evidenceHash: z.string(),
    outputDigest: z.string(),
  }),
})

export const package5ProviderOperationsReceiptSchema = z.strictObject({
  schemaVersion: z.literal('package5-provider-operations-release:v1'),
  deployment: z.strictObject({
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
    origin: z.string().url(),
    environment: z.enum(['sandbox', 'production']),
  }),
  observedAt: z.number().int().nonnegative(),
  businessDigest: z.string(),
  fixtures: z.tuple([
    fixtureReceiptSchema,
    fixtureReceiptSchema,
    fixtureReceiptSchema,
    fixtureReceiptSchema,
  ]),
})

export type Package5ProviderOperationsReceipt = z.infer<typeof package5ProviderOperationsReceiptSchema>

export class Package5AuthorityReviewRequired extends Error {
  readonly reviewUrl: string
  readonly sourceKind: Package5SourceKind
  readonly operationRef: string

  constructor(input: Readonly<{
    reviewUrl: string
    sourceKind: Package5SourceKind
    operationRef: string
  }>) {
    super(`package5_source_authority_review_required:${input.reviewUrl}`)
    this.name = 'Package5AuthorityReviewRequired'
    this.reviewUrl = input.reviewUrl
    this.sourceKind = input.sourceKind
    this.operationRef = input.operationRef
  }
}

type JsonResponse = Readonly<{ status: number; body: unknown }>

function required(env: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = env[name]?.trim()
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`)
  return value
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim().length === 0) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`)
  return parsed
}

function parseFixture(env: Readonly<Record<string, string | undefined>>, kind: Package5SourceKind): Package5SourceFixture {
  const name = `AE_PACKAGE5_${kind.toUpperCase()}_FIXTURE_JSON`
  const raw = required(env, name)
  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    throw new Error(`${name} must be valid JSON`)
  }
  const parsed = fixtureSchema.safeParse(value)
  if (!parsed.success) throw new Error(`${name} does not match the Package 5 fixture contract`)
  return parsed.data
}

function hostedOrigin(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:') throw new Error('AE_PACKAGE5_BASE_URL must use HTTPS')
  if (url.username.length > 0 || url.password.length > 0 || url.search.length > 0 || url.hash.length > 0) {
    throw new Error('AE_PACKAGE5_BASE_URL must be a credential-free origin')
  }
  return url.origin
}

export function package5ProviderOperationsConfigFromEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  fetch: typeof globalThis.fetch = globalThis.fetch,
): Package5ProviderOperationsConfig {
  // Resolve every prerequisite before returning a runnable configuration. No
  // request may begin while a source, identity, or exact release is ambiguous.
  const baseUrl = hostedOrigin(required(env, 'AE_PACKAGE5_BASE_URL'))
  const expectedSourceRevision = required(env, 'AE_PACKAGE5_EXPECTED_SOURCE_REVISION')
  if (!/^[a-f0-9]{40}$/u.test(expectedSourceRevision)) {
    throw new Error('AE_PACKAGE5_EXPECTED_SOURCE_REVISION must be a 40-character Git revision')
  }
  const providerApiKey = required(env, 'AE_PACKAGE5_PROVIDER_API_KEY')
  const buyerApiKey = required(env, 'AE_PACKAGE5_BUYER_API_KEY')
  const businessRef = required(env, 'AE_PACKAGE5_BUSINESS_REF')
  const environment = z.enum(['sandbox', 'production']).parse(required(env, 'AE_PACKAGE5_ENVIRONMENT'))
  const fixtures = SOURCE_KINDS.map((kind) => parseFixture(env, kind))
  for (const fixture of fixtures) {
    if (fixture.source.environment !== environment) throw new Error(`AE_PACKAGE5_${fixture.kind.toUpperCase()}_FIXTURE_JSON environment mismatch`)
  }
  return {
    baseUrl,
    expectedSourceRevision,
    providerApiKey,
    buyerApiKey,
    businessRef,
    environment,
    fixtures,
    maxStatusWaitMs: parsePositiveInteger(env.AE_PACKAGE5_MAX_STATUS_WAIT_MS, 180_000, 'AE_PACKAGE5_MAX_STATUS_WAIT_MS'),
    statusDelayMs: parsePositiveInteger(env.AE_PACKAGE5_STATUS_DELAY_MS, 5_000, 'AE_PACKAGE5_STATUS_DELAY_MS'),
    fetch,
    now: Date.now,
    sleep: async (milliseconds) => await new Promise((resolve) => setTimeout(resolve, milliseconds)),
  }
}

async function requestJson(
  config: Package5ProviderOperationsConfig,
  path: string,
  init: RequestInit,
): Promise<JsonResponse> {
  const response = await config.fetch(new URL(path, config.baseUrl), init)
  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new Error(`package5_response_too_large:${path}`)
  }
  let body: unknown
  try {
    body = text.length === 0 ? null : JSON.parse(text) as unknown
  } catch {
    throw new Error(`package5_response_not_json:${path}`)
  }
  return { status: response.status, body }
}

function headers(apiKey?: string): HeadersInit {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    ...(apiKey === undefined ? {} : { authorization: `Bearer ${apiKey}` }),
  }
}

async function post(
  config: Package5ProviderOperationsConfig,
  path: string,
  body: unknown,
  apiKey?: string,
): Promise<JsonResponse> {
  return await requestJson(config, path, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(body),
  })
}

function requireSuccess(response: JsonResponse, code: string): unknown {
  if (response.status < 200 || response.status >= 300) throw new Error(`${code}:http_${response.status}`)
  return response.body
}

function selectCandidate(fixture: Package5SourceFixture, candidates: readonly SupplyOperationCandidate[]): SupplyOperationCandidate {
  const matches = candidates.filter((candidate) => {
    const selector = candidate.sourceSelector
    const match = fixture.candidateMatch
    if ('path' in match) return 'path' in selector && selector.path === match.path && selector.method === match.method
    if ('resourceUrl' in match) return 'resourceUrl' in selector && selector.resourceUrl === match.resourceUrl && selector.method === match.method
    return 'toolName' in selector && selector.toolName === match.toolName
  })
  if (matches.length !== 1) throw new Error(`package5_${fixture.kind}_candidate_not_exact`)
  const candidate = matches[0]!
  if (candidate.disposition.kind !== 'supported') throw new Error(`package5_${fixture.kind}_candidate_unsupported`)
  return candidate
}

async function waitForPublished(
  config: Package5ProviderOperationsConfig,
  publication: Readonly<{
    operationRef: string
    publicationRef: string
    publicationRevision: number
    sourceKind: Package5SourceKind
    sourceDigest: string
    sourceUrl: string
  }>,
) {
  const startedAt = config.now()
  const maximumAttempts = config.statusDelayMs === 0
    ? 1
    : Math.max(1, Math.ceil(config.maxStatusWaitMs / config.statusDelayMs) + 1)
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const response = await post(config, SUPPLY_ACTION_ROUTE_CONTRACTS.status.path, {
      businessRef: config.businessRef,
      operationRef: publication.operationRef,
    }, config.providerApiKey)
    const parsed = supplyStatusResultSchema.safeParse(requireSuccess(response, 'package5_supply_status_failed'))
    if (!parsed.success || parsed.data.kind !== 'available') throw new Error('package5_supply_status_invalid')
    if (parsed.data.status.state === 'Published') return parsed.data.status
    if (parsed.data.status.state === 'Action required'
      && parsed.data.status.reasonCodes.includes('provider_authority_unverified')) {
      const reviewUrl = new URL('/admin/index-health', config.baseUrl)
      reviewUrl.searchParams.set('publicationRef', publication.publicationRef)
      reviewUrl.searchParams.set('expectedRevision', String(publication.publicationRevision))
      reviewUrl.searchParams.set('expectedSourceDigest', publication.sourceDigest)
      reviewUrl.searchParams.set('operationRef', publication.operationRef)
      reviewUrl.searchParams.set('sourceKind', publication.sourceKind)
      reviewUrl.searchParams.set('sourceUrl', publication.sourceUrl)
      throw new Package5AuthorityReviewRequired({
        reviewUrl: reviewUrl.toString(),
        sourceKind: publication.sourceKind,
        operationRef: publication.operationRef,
      })
    }
    if (parsed.data.status.state === 'Action required' || parsed.data.status.state === 'Retired') {
      throw new Error(`package5_supply_status_terminal:${parsed.data.status.state}`)
    }
    if (config.now() - startedAt >= config.maxStatusWaitMs || attempt + 1 >= maximumAttempts) {
      throw new Error('package5_supply_status_timeout')
    }
    await config.sleep(config.statusDelayMs)
  }
  throw new Error('package5_supply_status_timeout')
}

async function proveProviderDirectory(
  config: Package5ProviderOperationsConfig,
  operationRef: string,
): Promise<void> {
  let cursor: string | undefined
  for (let pageNumber = 0; pageNumber < MAX_PROVIDER_DIRECTORY_PAGES; pageNumber += 1) {
    const response = await post(config, SUPPLY_ACTION_ROUTE_CONTRACTS.operationsList.path, {
      businessRef: config.businessRef,
      limit: 100,
      ...(cursor === undefined ? {} : { cursor }),
    }, config.providerApiKey)
    const parsed = supplyOperationsListResultSchema.safeParse(requireSuccess(response, 'package5_supply_list_failed'))
    if (!parsed.success || parsed.data.kind !== 'available') throw new Error('package5_supply_list_invalid')
    const found = parsed.data.page.find((status) => status.operationRef === operationRef)
    if (found !== undefined) {
      if (found.state !== 'Published' || !found.routeability.available) throw new Error('package5_supply_list_not_published')
      return
    }
    if (parsed.data.isDone) throw new Error('package5_supply_list_operation_missing')
    const next = parsed.data.continueCursor
    if (next === null || next === cursor) throw new Error('package5_supply_list_cursor_invalid')
    cursor = next
  }
  throw new Error('package5_supply_list_page_limit')
}

function exactOperation(items: readonly { operationRef: string }[], operationRef: string, code: string): void {
  if (items.filter((item) => item.operationRef === operationRef).length !== 1) throw new Error(code)
}

async function proveFixture(
  config: Package5ProviderOperationsConfig,
  fixture: Package5SourceFixture,
) {
  const previewResponse = await post(config, SUPPLY_ACTION_ROUTE_CONTRACTS.sourcePreview.path, fixture.source, config.providerApiKey)
  const preview = supplySourcePreviewSchema.safeParse(requireSuccess(previewResponse, `package5_${fixture.kind}_preview_failed`))
  if (!preview.success || preview.data.kind !== 'ready') throw new Error(`package5_${fixture.kind}_preview_not_ready`)
  const candidate = selectCandidate(fixture, preview.data.candidates)

  const publishInput = publishSupplyOperationV2InputSchema.parse({
    businessRef: config.businessRef,
    source: fixture.source,
    candidateRef: candidate.candidateRef,
    expectedSourceDigest: preview.data.sourceDigest,
    ...(fixture.connectionRef === undefined ? {} : { connectionRef: fixture.connectionRef }),
    presentation: fixture.presentation,
    consequences: fixture.consequences,
    pricing: fixture.pricing,
    validationInput: fixture.validationInput,
    environment: config.environment,
    idempotencyKey: `package5:${config.expectedSourceRevision}:${fixture.kind}`,
    attestation: {
      authorisedToPublish: true,
      informationAccurate: true,
      publishAfterSuccessfulValidation: true,
    },
  })
  const publishResponse = await post(config, SUPPLY_ACTION_ROUTE_CONTRACTS.publish.path, publishInput, config.providerApiKey)
  const published = supplyPublishResultSchema.safeParse(requireSuccess(publishResponse, `package5_${fixture.kind}_publish_failed`))
  if (!published.success || published.data.kind === 'refused') throw new Error(`package5_${fixture.kind}_publish_refused`)

  const supplierStatus = await waitForPublished(config, {
    operationRef: published.data.operationRef,
    publicationRef: published.data.publicationRef,
    publicationRevision: published.data.publicationRevision,
    sourceKind: fixture.kind,
    sourceDigest: preview.data.sourceDigest,
    sourceUrl: preview.data.provenance.sourceUrl,
  })
  if (supplierStatus.source.kind !== fixture.kind
    || supplierStatus.source.revision !== preview.data.sourceRevision
    || supplierStatus.source.digest !== preview.data.sourceDigest
    || !supplierStatus.routeability.available) {
    throw new Error(`package5_${fixture.kind}_authoritative_readback_mismatch`)
  }
  await proveProviderDirectory(config, published.data.operationRef)

  const searchResponse = await post(config, OPERATION_MARKET_SEARCH_PATH, {
    query: fixture.presentation.name,
    limit: 20,
  })
  const search = operationChoiceSearchOutputSchema.safeParse(requireSuccess(searchResponse, `package5_${fixture.kind}_search_failed`))
  if (!search.success || search.data.kind !== 'ok') throw new Error(`package5_${fixture.kind}_search_invalid`)
  exactOperation(search.data.items, published.data.operationRef, `package5_${fixture.kind}_search_identity_mismatch`)

  const describeResponse = await post(config, OPERATION_MARKET_DESCRIBE_PATH, {
    operationRef: published.data.operationRef,
  })
  const describe = operationChoiceDescribeOutputSchema.safeParse(requireSuccess(describeResponse, `package5_${fixture.kind}_describe_failed`))
  if (!describe.success || describe.data.kind !== 'found'
    || describe.data.operation.operationRef !== published.data.operationRef
    || describe.data.operation.healthStatus !== 'operational') {
    throw new Error(`package5_${fixture.kind}_describe_invalid`)
  }

  // This request cannot cross the effect boundary because the current public
  // contract accepts only a Commitment. It proves the pre-Commitment writer is
  // truly gone from the deployed gateway.
  const obsoleteInvoke = await post(config, OPERATION_INVOKE_HTTP_PATH, {
    operationRef: published.data.operationRef,
    input: fixture.invokeInput,
    idempotencyKey: `package5-obsolete:${config.expectedSourceRevision}:${fixture.kind}`,
  }, config.buyerApiKey)
  if (obsoleteInvoke.status >= 200 && obsoleteInvoke.status < 300) throw new Error('package5_old_invoke_shape_accepted')
  if (obsoleteInvoke.status !== 400
    || typeof obsoleteInvoke.body !== 'object'
    || obsoleteInvoke.body === null
    || !('code' in obsoleteInvoke.body)
    || obsoleteInvoke.body.code !== 'invalid_request') {
    throw new Error('package5_old_invoke_shape_rejection_invalid')
  }

  const inspectResponse = await post(config, OPERATION_INSPECT_PATH, {
    operationRef: published.data.operationRef,
    input: fixture.invokeInput,
  }, config.buyerApiKey)
  const inspection = operationInspectResultSchema.safeParse(requireSuccess(inspectResponse, `package5_${fixture.kind}_inspect_failed`))
  if (!inspection.success || inspection.data.kind !== 'committed') throw new Error(`package5_${fixture.kind}_inspect_not_committed`)
  if (inspection.data.operationRef !== published.data.operationRef
    || canonicalDigest(inspection.data.normalizedInput) !== canonicalDigest(fixture.invokeInput)) {
    throw new Error(`package5_${fixture.kind}_commitment_mismatch`)
  }
  const invokeInput = operationInvokeInputSchema.parse(inspection.data.continuation.input)
  const invokeResponse = await post(config, inspection.data.continuation.path, invokeInput, config.buyerApiKey)
  const invocation = operationInvokeMachineResultSchema.safeParse(requireSuccess(invokeResponse, `package5_${fixture.kind}_invoke_failed`))
  if (!invocation.success || invocation.data.kind !== 'completed'
    || invocation.data.operationRef !== published.data.operationRef) {
    throw new Error(`package5_${fixture.kind}_invoke_not_completed`)
  }

  return fixtureReceiptSchema.parse({
    sourceKind: fixture.kind,
    source: {
      sourceDigest: preview.data.sourceDigest,
      sourceRevision: preview.data.sourceRevision,
      candidateRef: candidate.candidateRef,
    },
    publication: {
      publicationRef: published.data.publicationRef,
      publicationRevision: published.data.publicationRevision,
      operationRef: published.data.operationRef,
    },
    supplierOperation: {
      state: supplierStatus.state,
      revision: supplierStatus.revision,
      observedAt: supplierStatus.observedAt,
      ...(supplierStatus.validUntil === undefined ? {} : { validUntil: supplierStatus.validUntil }),
    },
    buyer: {
      commitmentRef: inspection.data.commitmentRef,
      invocationRef: invocation.data.invocationRef,
      evidenceHash: invocation.data.evidenceHash,
      outputDigest: canonicalDigest(invocation.data.output),
    },
  })
}

function assertReceiptContainsNoCredentials(
  receipt: Package5ProviderOperationsReceipt,
  config: Package5ProviderOperationsConfig,
): void {
  const serialized = JSON.stringify(receipt)
  if (serialized.includes(config.providerApiKey) || serialized.includes(config.buyerApiKey)) {
    throw new Error('package5_receipt_contains_credential')
  }
  if (/"(?:authorization|apiKey|accessToken|refreshToken|secret|connectionRef)"\s*:/iu.test(serialized)) {
    throw new Error('package5_receipt_contains_credential_field')
  }
}

export async function runPackage5ProviderOperationsRelease(
  rawConfig: Package5ProviderOperationsConfig,
): Promise<Package5ProviderOperationsReceipt> {
  const fixtures = rawConfig.fixtures.map((fixture) => fixtureSchema.parse(fixture))
  if (fixtures.length !== SOURCE_KINDS.length
    || fixtures.some((fixture, index) => fixture.kind !== SOURCE_KINDS[index])) {
    throw new Error('package5_fixture_set_must_be_openapi_mcp_agent_plugin_x402')
  }
  const releaseResponse = await requestJson(rawConfig, '/api/v1/release', {
    method: 'GET',
    headers: { accept: 'application/json' },
  })
  const release = z.strictObject({
    kind: z.literal('ok'),
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
  }).safeParse(requireSuccess(releaseResponse, 'package5_release_identity_unavailable'))
  if (!release.success || release.data.sourceRevision !== rawConfig.expectedSourceRevision) {
    throw new Error('package5_deployed_source_revision_mismatch')
  }

  const evidence = []
  for (const fixture of fixtures) evidence.push(await proveFixture(rawConfig, fixture))
  const receipt = package5ProviderOperationsReceiptSchema.parse({
    schemaVersion: 'package5-provider-operations-release:v1',
    deployment: {
      sourceRevision: release.data.sourceRevision,
      origin: new URL(rawConfig.baseUrl).origin,
      environment: rawConfig.environment,
    },
    observedAt: rawConfig.now(),
    businessDigest: canonicalDigest({ businessRef: rawConfig.businessRef }),
    fixtures: evidence,
  })
  assertReceiptContainsNoCredentials(receipt, rawConfig)
  return receipt
}

export async function main(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<void> {
  const receipt = await runPackage5ProviderOperationsRelease(
    package5ProviderOperationsConfigFromEnvironment(env),
  )
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'package5_release_failed'}\n`)
    process.exitCode = 1
  })
}

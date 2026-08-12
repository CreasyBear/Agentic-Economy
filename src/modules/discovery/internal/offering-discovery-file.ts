import type { BuildDiscoveryFileOptions, DiscoveryFileBuildResult } from '@/modules/discovery/public'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import {
  OPERATION_MARKET_COMPARE_PATH,
  OPERATION_MARKET_DETAIL_PATH,
  OPERATION_MARKET_INSPECT_PLAN_PATH,
  OPERATION_MARKET_SEARCH_PATH,
} from '@/modules/registry/operation-paths'

export const DiscoveryPublicSurfacePaths = [
  '/',
  '/claim',
  '/for-agents',
  '/privacy/remove-business',
  '/.well-known/ucp',
  '/api/businesses',
  OPERATION_MARKET_SEARCH_PATH,
  OPERATION_MARKET_DETAIL_PATH,
  OPERATION_MARKET_COMPARE_PATH,
  OPERATION_MARKET_INSPECT_PLAN_PATH,
] as const

/** Public listings remain facts only; Operation invocation has a separate authenticated authority boundary. */
export const DiscoveryListingBoundaryLine =
  'Published business facts do not select or invoke an Operation. Search and inspect current Operations anonymously, then use the authenticated Operation gateway for invoke, status, cancel, and reconcile.'

/** Public loop copy shared by the machine-readable discovery surfaces. */
export const OperationMarketAnonymousBoundaryLine =
  'Anonymous: search, detail, compare, inspect-plan. Authenticated: invoke, status, cancel, reconcile.'
export const OperationMarketIdempotencyLine =
  'The request JSON body field `idempotencyKey` is required for invoke, cancel, and reconcile; choose it once for the intended invocation and retain it.'
export const OperationMarketInvokeScopeLine = `Required invoke scope: \`${OPERATION_INVOKE_ROUTE_CONTRACT.scope}\`.`

/** Public route order and authority boundary for the machine-readable index. */
export function operationMarketLines(canonicalBaseUrl: string): readonly string[] {
  const { invoke, status, cancel, reconcile } = OPERATION_INVOKE_ROUTE_CONTRACT
  const cli = 'npm run -s ae --'
  return [
    '## Operation market loop',
    '',
    `1. No-install Step 1: \`GET ${canonicalBaseUrl}/.well-known/ucp\` (for example, \`curl -fsSL ${canonicalBaseUrl}/.well-known/ucp\`).`,
    `2. Search a job anonymously with \`${cli} search "<job>" --json\` or \`POST ${canonicalBaseUrl}${OPERATION_MARKET_SEARCH_PATH}\`.`,
    `3. Inspect one exact result with \`${cli} inspect "<operationRef>" --json\` or \`POST ${canonicalBaseUrl}${OPERATION_MARKET_DETAIL_PATH}\`; read inputs, terms, price, effects, availability, and evidence.`,
    `4. Optional anonymous reads: \`${cli} compare "$AE_OPERATION_REF_1" "$AE_OPERATION_REF_2" --json\` or \`POST ${canonicalBaseUrl}${OPERATION_MARKET_COMPARE_PATH}\`; \`POST ${canonicalBaseUrl}${OPERATION_MARKET_INSPECT_PLAN_PATH}\`.`,
    `5. Run \`${cli} connect --json\` to complete the OAuth device flow or validate the configured key against the gateway.`,
    `6. Invoke with \`${cli} invoke "<operationRef>" "$AE_INPUT_JSON" --idempotency-key "$AE_IDEMPOTENCY_KEY" --json\` (\`${invoke.method} ${canonicalBaseUrl}${invoke.path}\`). ${OperationMarketIdempotencyLine}`,
    `7. Read \`${cli} status "$AE_INVOCATION_REF" --json\` (\`${status.method} ${canonicalBaseUrl}${status.path}\`).`,
    `8. Cancel with \`${cli} advanced cancel "$AE_INVOCATION_REF" --idempotency-key "$AE_IDEMPOTENCY_KEY" --json\` (\`${cancel.method} ${canonicalBaseUrl}${cancel.path}\`). Cancellation requires the AE access key \`AE_API_KEY\` plus the request JSON body field \`idempotencyKey\`.`,
    `9. Reconcile uncertain work with \`${cli} recover "$AE_INVOCATION_REF" "$AE_EVIDENCE_JSON" --idempotency-key "$AE_IDEMPOTENCY_KEY" --json\` (\`${reconcile.method} ${canonicalBaseUrl}${reconcile.path}\`) using bounded evidence, the same invocation, and the same stable key.`,
    '',
    OperationMarketAnonymousBoundaryLine,
    'The AE key identifies the caller. It never contains provider credentials or silently grants payment or consequential authority.',
    OperationMarketInvokeScopeLine,
    'Never infer fulfilment, payment, deployment, or a receipt from discovery, a caller key, or a pending invocation.',
    '',
    'Errors use application/problem+json. Retry only when retryable=true, respect Retry-After, and preserve the same operation, input, and idempotency key. Unknown outcomes require status then reconcile, never a new invocation.',
  ]
}

const offeringLlmsSampleLimit = 12
const offeringLlmsByteCeiling = 4096

export function buildOfferingLlmsUrlsFromSlugs(
  slugs: readonly string[],
  options: BuildDiscoveryFileOptions,
): readonly string[] {
  const canonicalBaseUrl = trimTrailingSlashes(options.canonicalBaseUrl)
  return [...new Set([
    ...DiscoveryPublicSurfacePaths.map((path) => `${canonicalBaseUrl}${path}`),
    ...slugs.flatMap((slug) => [
      `${canonicalBaseUrl}/${slug}`,
      `${canonicalBaseUrl}/${slug}/ucp`,
      `${canonicalBaseUrl}/api/businesses/${slug}`,
    ]),
  ])]
}

/** Durable Offering-based assistant index with a bounded inline sample. */
export function buildOfferingLlmsTxt(
  businesses: readonly PublicBusinessCatalogApiV2Dto[],
  options: BuildDiscoveryFileOptions & { totalBusinesses?: number },
): DiscoveryFileBuildResult {
  const canonicalBaseUrl = trimTrailingSlashes(options.canonicalBaseUrl)
  const urls = buildOfferingLlmsUrlsFromSlugs(businesses.map((business) => business.slug), options)
  const beforeSample = [
    '# Agentic Economy',
    '',
    ...operationMarketLines(canonicalBaseUrl),
    '',
    'Public instructions:',
    `- Skill: ${canonicalBaseUrl}/SKILL.md`,
    `- Deployment manifest: ${canonicalBaseUrl}/.well-known/ucp`,
    `- Human guide: ${canonicalBaseUrl}/for-agents`,
    `- MCP: ${canonicalBaseUrl}/mcp`,
    '',
    'Published businesses (secondary directory):',
  ]
  const afterSample = [
    `- full list=${canonicalBaseUrl}/api/businesses`,
    `- total=${options.totalBusinesses ?? businesses.length}; the lines above are a bounded sample`,
    '',
    'Boundary:',
    `- ${DiscoveryListingBoundaryLine}`,
    '',
    'Privacy and correction:',
    `- ${canonicalBaseUrl}/privacy/remove-business`,
    '',
  ]
  const encoder = new TextEncoder()
  const framingBytes = encoder.encode([...beforeSample, ...afterSample].join('\n')).length
  const sample: string[] = []
  let sampleBytes = 0
  for (const business of businesses.slice(0, offeringLlmsSampleLimit)) {
    const line = `- slug=${business.slug} path=/${business.slug}`
    const cost = encoder.encode(line).length + 1
    if (sample.length > 0 && framingBytes + sampleBytes + cost > offeringLlmsByteCeiling) break
    sampleBytes += cost
    sample.push(line)
  }
  return {
    body: [...beforeSample, ...(sample.length === 0 ? ['- none'] : sample), ...afterSample].join('\n'),
    urls,
  }
}

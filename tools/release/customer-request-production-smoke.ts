import { pathToFileURL } from 'node:url'

import { isRecord } from '../../src/modules/common/is-record'
import { trimTrailingSlashes } from '../../src/modules/common/trim-trailing-slashes'
import { exactAmountSchema, type ExactAmount } from '../../src/modules/money/public'

import { resolveVercelProtectionBypassSecret } from './vercel-protection-bypass'

const DEFAULT_BASE_URL = 'https://agentic-economy-phi.vercel.app'

type DirectBaselineConfig = Readonly<{
  providerOrigins: readonly string[]
  credential: string
  predeclaredGain: 'recoverable_progress'
  maximumTotalCost: ExactAmount
  cohort: unknown
}>

type CustomerRequestJourneyFinish =
  | 'cancel'
  | 'cancel_after_current'
  | 'adapter_cancel_accepted'
  | 'adapter_cancel_rejected'
  | 'adapter_cancel_unknown'
  | 'complete'
  | 'outcome_unknown'
  | 'invalid_output'
  | 'provider_denied'
  | 'partial_result'

export type CustomerRequestProductionSmokeConfig = Readonly<{
  baseUrl: string
  agentApiKey?: string
  deploymentProtectionBypass?: string
  expectedRevision?: string
  expectedDeploymentId?: string
  expectedRoute?: Readonly<{
    stepCount: number
    businesses: readonly string[]
    recipients?: readonly Readonly<{ name: string; purposes: readonly string[] }>[]
  }>
  facts: Readonly<Record<string, unknown>>
  fetch: typeof globalThis.fetch
  finish?: CustomerRequestJourneyFinish
  messages: readonly string[]
  preflightOnly: boolean
  requestText: string
  directBaseline?: DirectBaselineConfig
}>

export function customerRequestProductionSmokeConfigFromEnvironment(
  env: Record<string, string | undefined>,
  agentApiKey = env.AE_CUSTOMER_REQUEST_API_KEY,
): CustomerRequestProductionSmokeConfig {
  const normalizedAgentKey = optionalText(agentApiKey)
  const bypass = resolveVercelProtectionBypassSecret(env)
  const revision = optionalText(env.AE_RELEASE_SOURCE_REVISION)
  const deploymentId = optionalText(env.AE_RELEASE_DEPLOYMENT_ID)
  const finish = parseFinish(env.AE_CUSTOMER_REQUEST_FINISH)
  const directBaseline = parseDirectBaseline(env, finish)
  return {
    baseUrl: trimTrailingSlashes(env.AE_CUSTOMER_REQUEST_BASE_URL ?? DEFAULT_BASE_URL),
    ...(normalizedAgentKey === undefined ? {} : { agentApiKey: normalizedAgentKey }),
    ...(bypass === undefined ? {} : { deploymentProtectionBypass: bypass }),
    ...(revision === undefined ? {} : { expectedRevision: revision }),
    ...(deploymentId === undefined ? {} : { expectedDeploymentId: deploymentId }),
    ...parseExpectedRoute(env),
    facts: parseFacts(env.AE_CUSTOMER_REQUEST_FACTS_JSON),
    fetch: globalThis.fetch,
    finish,
    messages: parseMessages(env.AE_CUSTOMER_REQUEST_MESSAGES_JSON),
    preflightOnly: false,
    requestText: env.AE_CUSTOMER_REQUEST_TEXT ?? 'Find the cheapest labelled sandbox option.',
    ...(directBaseline === undefined ? {} : { directBaseline }),
  }
}

export async function runCustomerRequestProductionSmoke(
  _config: CustomerRequestProductionSmokeConfig,
): Promise<never> {
  throw new Error('customer_request_module_deleted')
}

function parseDirectBaseline(
  env: Record<string, string | undefined>,
  finish: CustomerRequestJourneyFinish,
): DirectBaselineConfig | undefined {
  const raw = {
    origins: optionalText(env.AE_DIRECT_PROVIDER_ORIGINS_JSON),
    credential: optionalText(env.AE_DIRECT_PROVIDER_CREDENTIAL),
    gain: optionalText(env.AE_DIRECT_PREDECLARED_GAIN),
    maximum: optionalText(env.AE_DIRECT_MAXIMUM_TOTAL_COST_JSON),
    cohort: optionalText(env.AE_AGENT_JOURNEY_COHORT_JSON),
  }
  if (Object.values(raw).every((value) => value === undefined)) return undefined
  if (Object.values(raw).some((value) => value === undefined)) {
    throw new Error('Direct comparison requires complete explicit configuration')
  }
  if (finish !== 'complete') throw new Error('Direct comparison requires AE_CUSTOMER_REQUEST_FINISH=complete')
  if (raw.gain !== 'recoverable_progress') {
    throw new Error('AE_DIRECT_PREDECLARED_GAIN must be recoverable_progress')
  }
  const origins: unknown = JSON.parse(required(raw.origins, 'AE_DIRECT_PROVIDER_ORIGINS_JSON'))
  const maximum: unknown = JSON.parse(required(raw.maximum, 'AE_DIRECT_MAXIMUM_TOTAL_COST_JSON'))
  const cohort: unknown = JSON.parse(required(raw.cohort, 'AE_AGENT_JOURNEY_COHORT_JSON'))
  if (!Array.isArray(origins) || !origins.every((value) => typeof value === 'string')) {
    throw new Error('AE_DIRECT_PROVIDER_ORIGINS_JSON must contain at least two provider origins')
  }
  if (!isExactAmount(maximum)) throw new Error('AE_DIRECT_MAXIMUM_TOTAL_COST_JSON must be nonnegative money')
  const config: DirectBaselineConfig = {
    providerOrigins: origins, credential: required(raw.credential, 'AE_DIRECT_PROVIDER_CREDENTIAL'),
    predeclaredGain: raw.gain, maximumTotalCost: maximum, cohort,
  }
  assertDirectBaselineConfig(config)
  return config
}

function assertDirectBaselineConfig(config: DirectBaselineConfig): void {
  if (config.providerOrigins.length < 2 || config.providerOrigins.some((origin) => !isSafeProviderOrigin(origin))) {
    throw new Error('AE_DIRECT_PROVIDER_ORIGINS_JSON must contain at least two safe provider origins')
  }
  if (config.credential.trim().length === 0) throw new Error('AE_DIRECT_PROVIDER_CREDENTIAL is required')
  if (!isExactAmount(config.maximumTotalCost)) {
    throw new Error('AE_DIRECT_MAXIMUM_TOTAL_COST_JSON must be nonnegative money')
  }
}

function isSafeProviderOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    const loopbackHttp = url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
    return (url.protocol === 'https:' || loopbackHttp)
      && url.username === '' && url.password === '' && url.hash === ''
  } catch {
    return false
  }
}

function isExactAmount(value: unknown): value is ExactAmount {
  return exactAmountSchema.safeParse(value).success
}

function parseFinish(
  value: string | undefined,
): CustomerRequestJourneyFinish {
  const finish = optionalText(value) ?? 'cancel'
  if (finish !== 'cancel' && finish !== 'cancel_after_current'
    && finish !== 'adapter_cancel_accepted' && finish !== 'adapter_cancel_rejected'
    && finish !== 'adapter_cancel_unknown'
    && finish !== 'complete' && finish !== 'outcome_unknown'
    && finish !== 'invalid_output' && finish !== 'provider_denied' && finish !== 'partial_result') {
    throw new Error(
      'AE_CUSTOMER_REQUEST_FINISH must be cancel, cancel_after_current, adapter_cancel_accepted, adapter_cancel_rejected, adapter_cancel_unknown, complete, outcome_unknown, invalid_output, provider_denied, or partial_result',
    )
  }
  return finish
}

function parseExpectedRoute(
  env: Record<string, string | undefined>,
): Readonly<{
  expectedRoute?: Readonly<{
    stepCount: number
    businesses: readonly string[]
    recipients?: readonly Readonly<{ name: string; purposes: readonly string[] }>[]
  }>
}> {
  const countText = optionalText(env.AE_CUSTOMER_REQUEST_EXPECTED_STEP_COUNT)
  const businessesText = optionalText(env.AE_CUSTOMER_REQUEST_EXPECTED_BUSINESSES_JSON)
  const recipientsText = optionalText(env.AE_CUSTOMER_REQUEST_EXPECTED_RECIPIENTS_JSON)
  if (countText === undefined && businessesText === undefined && recipientsText === undefined) return {}
  const stepCount = Number(countText)
  const businesses: unknown = businessesText === undefined ? undefined : JSON.parse(businessesText)
  const recipients: unknown = recipientsText === undefined ? undefined : JSON.parse(recipientsText)
  if (!Number.isInteger(stepCount) || stepCount < 1
    || !Array.isArray(businesses)
    || businesses.length < 1
    || !businesses.every((value) => typeof value === 'string' && value.length > 0)) {
    throw new Error('Expected route requires a positive step count and a JSON array of business names')
  }
  if (recipients !== undefined && (!Array.isArray(recipients) || !recipients.every(isExpectedRecipient))) {
    throw new Error('AE_CUSTOMER_REQUEST_EXPECTED_RECIPIENTS_JSON must list names and non-empty purposes')
  }
  return {
    expectedRoute: {
      stepCount,
      businesses,
      ...(recipients === undefined ? {} : { recipients }),
    },
  }
}

function isExpectedRecipient(
  value: unknown,
): value is Readonly<{ name: string; purposes: readonly string[] }> {
  if (!isRecord(value)) return false
  const recipient = value
  return typeof recipient.name === 'string' && recipient.name.length > 0
    && Array.isArray(recipient.purposes) && recipient.purposes.length > 0
    && recipient.purposes.every((purpose) => typeof purpose === 'string' && purpose.length > 0)
}

function parseFacts(value: string | undefined): Readonly<Record<string, unknown>> {
  if (value === undefined || value.trim().length === 0) return {}
  const parsed: unknown = JSON.parse(value)
  if (!isRecord(parsed)) {
    throw new Error('AE_CUSTOMER_REQUEST_FACTS_JSON must be a JSON object keyed by requirementKey')
  }
  return parsed as Readonly<Record<string, unknown>>
}

function parseMessages(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim().length === 0) return []
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string' && item.trim().length > 0)) {
    throw new Error('AE_CUSTOMER_REQUEST_MESSAGES_JSON must be a JSON array of non-empty answers')
  }
  return parsed
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.trim().length === 0) throw new Error(`${name} is required`)
  return value.trim()
}

async function main(): Promise<void> {
  await runCustomerRequestProductionSmoke({
    ...customerRequestProductionSmokeConfigFromEnvironment(process.env),
    preflightOnly: process.argv.includes('--preflight'),
  })
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? `FAIL ${error.message}` : 'FAIL unexpected_error')
    process.exitCode = 1
  })
}

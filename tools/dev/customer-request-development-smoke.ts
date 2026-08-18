import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadEnv } from 'vite'

import { trimTrailingSlashes } from '../../src/modules/common/trim-trailing-slashes'
import {
  customerRequestProductionSmokeConfigFromEnvironment,
  type CustomerRequestProductionSmokeConfig,
} from '../release/customer-request-production-smoke'

const DEFAULT_BASE_URL = 'http://127.0.0.1:3002'
const DEFAULT_REQUEST = 'Resolve a labelled sandbox service, then prepare its quote. Keep the total under AUD 15.'
const DEFAULT_BUSINESSES = ['Sandbox Route Resolver', 'Sandbox Route Quoter'] as const
const DEFAULT_RECIPIENTS = [
  { name: 'Sandbox Route Resolver', purposes: ['resolve_sandbox_service_reference'] },
  { name: 'Sandbox Route Quoter', purposes: ['prepare_sandbox_service_quote'] },
] as const

export type CustomerRequestDevelopmentSmokeConfig = Readonly<{
  baseUrl: string
  trustedDevelopmentOrigin?: string
  clerkSecretKey: string
  clerkInstanceId: string
  clerkSubject: string
  convexDeployment: string
  sourceRevision: string
  request: string
  facts: Readonly<Record<string, unknown>>
  messages: readonly string[]
  finish: 'complete' | 'cancel' | 'cancel_after_current' | 'adapter_cancel_accepted'
    | 'adapter_cancel_rejected' | 'adapter_cancel_unknown' | 'outcome_unknown'
    | 'invalid_output' | 'provider_denied' | 'partial_result'
  expiryRecovery?: Readonly<{ waitMs: number }>
  unsupportedRecovery?: Readonly<{ message: string }>
  expectedRoute: Readonly<{
    stepCount: number
    businesses: readonly string[]
    recipients?: readonly Readonly<{ name: string; purposes: readonly string[] }>[]
  }>
  repeatPermission: boolean
  journeySigningKey?: Readonly<{ keyId: string; privateKey: string }>
  journeyTrustedKeys?: readonly Readonly<{ keyId: string; publicKey: string }>[]
  directBaseline?: NonNullable<CustomerRequestProductionSmokeConfig['directBaseline']>
  fetch: typeof globalThis.fetch
}>

export function customerRequestDevelopmentSmokeConfig(
  env: Record<string, string | undefined>,
  sourceRevision = currentSourceRevision(),
): CustomerRequestDevelopmentSmokeConfig {
  const baseUrl = trimTrailingSlashes(env.AE_CUSTOMER_REQUEST_BASE_URL ?? DEFAULT_BASE_URL)
  const shared = customerRequestProductionSmokeConfigFromEnvironment({
    AE_CUSTOMER_REQUEST_BASE_URL: baseUrl,
    AE_CUSTOMER_REQUEST_TEXT: env.AE_CUSTOMER_REQUEST_TEXT ?? DEFAULT_REQUEST,
    AE_CUSTOMER_REQUEST_FACTS_JSON: env.AE_CUSTOMER_REQUEST_FACTS_JSON,
    AE_CUSTOMER_REQUEST_MESSAGES_JSON: env.AE_CUSTOMER_REQUEST_MESSAGES_JSON,
    AE_CUSTOMER_REQUEST_FINISH: env.AE_CUSTOMER_REQUEST_FINISH ?? 'complete',
    AE_CUSTOMER_REQUEST_EXPECTED_STEP_COUNT: env.AE_CUSTOMER_REQUEST_EXPECTED_STEP_COUNT ?? '2',
    AE_CUSTOMER_REQUEST_EXPECTED_BUSINESSES_JSON:
      env.AE_CUSTOMER_REQUEST_EXPECTED_BUSINESSES_JSON ?? JSON.stringify(DEFAULT_BUSINESSES),
    AE_CUSTOMER_REQUEST_EXPECTED_RECIPIENTS_JSON:
      env.AE_CUSTOMER_REQUEST_EXPECTED_RECIPIENTS_JSON ?? JSON.stringify(DEFAULT_RECIPIENTS),
    AE_DIRECT_PROVIDER_ORIGINS_JSON: env.AE_DIRECT_PROVIDER_ORIGINS_JSON,
    AE_DIRECT_PROVIDER_CREDENTIAL: env.AE_DIRECT_PROVIDER_CREDENTIAL,
    AE_DIRECT_PREDECLARED_GAIN: env.AE_DIRECT_PREDECLARED_GAIN,
    AE_DIRECT_MAXIMUM_TOTAL_COST_JSON: env.AE_DIRECT_MAXIMUM_TOTAL_COST_JSON,
    AE_AGENT_JOURNEY_COHORT_JSON: env.AE_AGENT_JOURNEY_COHORT_JSON,
  })
  const journeyKeyring = env.AE_CUSTOMER_REQUEST_JOURNEY_SIGNING_KEY === undefined
    ? undefined
    : (() => {
      throw new Error('customer_request_module_deleted')
    })()
  const trustedDevelopmentOrigin = resolveTrustedDevelopmentOrigin(
    baseUrl,
    env.AE_CUSTOMER_REQUEST_TRUSTED_DEVELOPMENT_ORIGIN,
  )
  const repeatPermission = env.AE_CUSTOMER_REQUEST_REPEAT_PERMISSION === 'true'
  if (repeatPermission && shared.finish !== 'complete') {
    throw new Error('Repeat-permission development proof requires AE_CUSTOMER_REQUEST_FINISH=complete')
  }
  return {
    baseUrl,
    ...(trustedDevelopmentOrigin === undefined ? {} : { trustedDevelopmentOrigin }),
    clerkSecretKey: required(env.CLERK_SECRET_KEY, 'CLERK_SECRET_KEY'),
    clerkInstanceId: required(env.AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID, 'AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID'),
    clerkSubject: required(env.AE_CUSTOMER_REQUEST_CLERK_SUBJECT, 'AE_CUSTOMER_REQUEST_CLERK_SUBJECT'),
    convexDeployment: normalizeConvexDevelopmentDeployment(required(env.CONVEX_DEPLOYMENT, 'CONVEX_DEPLOYMENT')),
    sourceRevision: validateSourceRevision(sourceRevision),
    request: shared.requestText,
    facts: shared.facts,
    messages: shared.messages,
    finish: shared.finish ?? 'complete',
    ...(env.AE_CUSTOMER_REQUEST_EXPIRY_RECOVERY_WAIT_MS === undefined ? {} : {
      expiryRecovery: {
        waitMs: positiveInteger(
          env.AE_CUSTOMER_REQUEST_EXPIRY_RECOVERY_WAIT_MS,
          'AE_CUSTOMER_REQUEST_EXPIRY_RECOVERY_WAIT_MS',
        ),
      },
    }),
    ...(env.AE_CUSTOMER_REQUEST_UNSUPPORTED_RECOVERY_MESSAGE === undefined ? {} : {
      unsupportedRecovery: {
        message: required(
          env.AE_CUSTOMER_REQUEST_UNSUPPORTED_RECOVERY_MESSAGE,
          'AE_CUSTOMER_REQUEST_UNSUPPORTED_RECOVERY_MESSAGE',
        ),
      },
    }),
    expectedRoute: shared.expectedRoute ?? {
      stepCount: 2, businesses: DEFAULT_BUSINESSES, recipients: DEFAULT_RECIPIENTS,
    },
    repeatPermission,
    ...(journeyKeyring === undefined ? {} : {
      journeySigningKey: journeyKeyring.active,
      journeyTrustedKeys: journeyKeyring.trusted,
    }),
    ...(shared.directBaseline === undefined ? {} : { directBaseline: shared.directBaseline }),
    fetch: globalThis.fetch,
  }
}

export async function runCustomerRequestDevelopmentSmoke(
  _config: CustomerRequestDevelopmentSmokeConfig,
): Promise<never> {
  throw new Error('customer_request_module_deleted')
}

function currentSourceRevision(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

function normalizeConvexDevelopmentDeployment(value: string): string {
  const match = /^(?:dev:([a-z0-9-]+)|local:([a-z0-9_-]+))$/u.exec(value.trim())
  const deploymentName = match?.[1] ?? match?.[2]
  if (deploymentName === undefined) throw new Error('CONVEX_DEPLOYMENT must name an exact dev deployment')
  return `convex:${deploymentName}`
}

function validateSourceRevision(value: string): string {
  if (!/^[a-f0-9]{40}$/u.test(value)) throw new Error('development source revision must be an exact Git commit')
  return value
}

function resolveTrustedDevelopmentOrigin(baseUrl: string, value: string | undefined): string | undefined {
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    throw new Error('AE_CUSTOMER_REQUEST_BASE_URL must be an exact origin')
  }
  if (base.protocol !== 'https:') return undefined
  const isExactBaseOrigin = base.username === '' && base.password === ''
    && trimTrailingSlashes(base.pathname) === '' && base.search === '' && base.hash === ''
    && baseUrl === base.origin
  if (!isExactBaseOrigin) throw new Error('AE_CUSTOMER_REQUEST_BASE_URL must be an exact HTTPS origin')
  const trusted = trimTrailingSlashes(required(value, 'AE_CUSTOMER_REQUEST_TRUSTED_DEVELOPMENT_ORIGIN'))
  let trustedUrl: URL
  try {
    trustedUrl = new URL(trusted)
  } catch {
    throw new Error('AE_CUSTOMER_REQUEST_TRUSTED_DEVELOPMENT_ORIGIN must be an exact HTTPS origin')
  }
  const isExactOrigin = trustedUrl.protocol === 'https:' && trustedUrl.username === ''
    && trustedUrl.password === '' && trimTrailingSlashes(trustedUrl.pathname) === ''
    && trustedUrl.search === '' && trustedUrl.hash === ''
  if (!isExactOrigin || trustedUrl.origin !== base.origin || trusted !== base.origin) {
    throw new Error('AE_CUSTOMER_REQUEST_TRUSTED_DEVELOPMENT_ORIGIN must exactly match AE_CUSTOMER_REQUEST_BASE_URL')
  }
  return trusted
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`${name} is required`)
  return normalized
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`)
  return parsed
}

async function main(): Promise<void> {
  const fileEnv = loadEnv('development', process.cwd(), '')
  await runCustomerRequestDevelopmentSmoke(customerRequestDevelopmentSmokeConfig({ ...fileEnv, ...process.env }))
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? `FAIL ${error.message}` : 'FAIL unexpected_error')
    process.exitCode = 1
  })
}

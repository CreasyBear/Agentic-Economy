import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadEnv } from 'vite'

import { compareAgentJourneys } from '../../src/modules/customer-request/agent-journey-comparison'
import { runFrozenDirectAgentBaseline } from '../../src/modules/customer-request/direct-agent-baseline'
import { runHostedCustomerRequestJourney } from '../../src/modules/customer-request/hosted-agent-journey'
import { withTemporaryClerkApiKey } from '../release/customer-request-production-credential'
import {
  customerRequestProductionSmokeConfigFromEnvironment,
  type CustomerRequestProductionSmokeConfig,
} from '../release/customer-request-production-smoke'

const DEFAULT_BASE_URL = 'http://127.0.0.1:3002'
const DEFAULT_REQUEST = 'Resolve a labelled sandbox service, then prepare its quote. Keep the total under AUD 15.'
const DEFAULT_BUSINESSES = ['Sandbox Route Resolver', 'Sandbox Route Quoter'] as const

export type CustomerRequestDevelopmentSmokeConfig = Readonly<{
  baseUrl: string
  clerkSecretKey: string
  clerkInstanceId: string
  clerkSubject: string
  convexDeployment: string
  sourceRevision: string
  request: string
  facts: Readonly<Record<string, unknown>>
  messages: readonly string[]
  finish: 'complete' | 'cancel' | 'outcome_unknown'
  expectedRoute: Readonly<{ stepCount: number; businesses: readonly string[] }>
  directBaseline?: NonNullable<CustomerRequestProductionSmokeConfig['directBaseline']>
  fetch: typeof globalThis.fetch
}>

export function customerRequestDevelopmentSmokeConfig(
  env: Record<string, string | undefined>,
  sourceRevision = currentSourceRevision(),
): CustomerRequestDevelopmentSmokeConfig {
  const baseUrl = (env.AE_CUSTOMER_REQUEST_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/u, '')
  const shared = customerRequestProductionSmokeConfigFromEnvironment({
    AE_CUSTOMER_REQUEST_BASE_URL: baseUrl,
    AE_CUSTOMER_REQUEST_TEXT: env.AE_CUSTOMER_REQUEST_TEXT ?? DEFAULT_REQUEST,
    AE_CUSTOMER_REQUEST_FACTS_JSON: env.AE_CUSTOMER_REQUEST_FACTS_JSON,
    AE_CUSTOMER_REQUEST_MESSAGES_JSON: env.AE_CUSTOMER_REQUEST_MESSAGES_JSON,
    AE_CUSTOMER_REQUEST_FINISH: env.AE_CUSTOMER_REQUEST_FINISH ?? 'complete',
    AE_CUSTOMER_REQUEST_EXPECTED_STEP_COUNT: env.AE_CUSTOMER_REQUEST_EXPECTED_STEP_COUNT ?? '2',
    AE_CUSTOMER_REQUEST_EXPECTED_BUSINESSES_JSON:
      env.AE_CUSTOMER_REQUEST_EXPECTED_BUSINESSES_JSON ?? JSON.stringify(DEFAULT_BUSINESSES),
    AE_DIRECT_PROVIDER_ORIGINS_JSON: env.AE_DIRECT_PROVIDER_ORIGINS_JSON,
    AE_DIRECT_PROVIDER_CREDENTIAL: env.AE_DIRECT_PROVIDER_CREDENTIAL,
    AE_DIRECT_PREDECLARED_GAIN: env.AE_DIRECT_PREDECLARED_GAIN,
    AE_DIRECT_MAXIMUM_TOTAL_COST_JSON: env.AE_DIRECT_MAXIMUM_TOTAL_COST_JSON,
  })
  return {
    baseUrl,
    clerkSecretKey: required(env.CLERK_SECRET_KEY, 'CLERK_SECRET_KEY'),
    clerkInstanceId: required(env.AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID, 'AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID'),
    clerkSubject: required(env.AE_CUSTOMER_REQUEST_CLERK_SUBJECT, 'AE_CUSTOMER_REQUEST_CLERK_SUBJECT'),
    convexDeployment: normalizeConvexDevelopmentDeployment(required(env.CONVEX_DEPLOYMENT, 'CONVEX_DEPLOYMENT')),
    sourceRevision: validateSourceRevision(sourceRevision),
    request: shared.requestText,
    facts: shared.facts,
    messages: shared.messages,
    finish: shared.finish ?? 'complete',
    expectedRoute: shared.expectedRoute ?? { stepCount: 2, businesses: DEFAULT_BUSINESSES },
    ...(shared.directBaseline === undefined ? {} : { directBaseline: shared.directBaseline }),
    fetch: globalThis.fetch,
  }
}

export async function runCustomerRequestDevelopmentSmoke(
  config: CustomerRequestDevelopmentSmokeConfig,
) {
  let proof: Awaited<ReturnType<typeof runHostedCustomerRequestJourney>> | undefined
  await withTemporaryClerkApiKey({
    clerkSecretKey: config.clerkSecretKey,
    expectedInstanceId: config.clerkInstanceId,
    subject: config.clerkSubject,
    fetch: config.fetch,
    keyNamePrefix: 'AE development cold-agent acceptance',
    revocationReason: 'Temporary development acceptance completed',
    run: async (agentApiKey) => {
      proof = await runHostedCustomerRequestJourney({
        environment: 'development',
        baseUrl: config.baseUrl,
        agentApiKey,
        expectedRevision: config.sourceRevision,
        expectedDeploymentId: config.convexDeployment,
        verifyRelease: async () => ({
          kind: 'verified', revision: config.sourceRevision, deploymentId: config.convexDeployment,
        }),
        agent: { name: 'ae-development-cold-external-agent', version: '1' },
        scenario: {
          request: config.request,
          facts: config.facts,
          messages: config.messages,
          finish: config.finish,
          expectedRoute: config.expectedRoute,
        },
        sandbox: true,
        fetch: config.fetch,
      })
    },
  })
  if (proof === undefined) throw new Error('customer_request_development_proof_missing')
  if (config.directBaseline === undefined) {
    process.stdout.write(`${JSON.stringify(proof)}\n`)
    return proof
  }
  const direct = await runFrozenDirectAgentBaseline({
    job: config.request,
    providerOrigins: config.directBaseline.providerOrigins,
    credential: config.directBaseline.credential,
    predeclaredGain: config.directBaseline.predeclaredGain,
    hardConstraints: { maximumTotalCost: config.directBaseline.maximumTotalCost },
    agent: { name: 'frozen-direct-development-integrator', version: '1' },
    fetch: config.fetch,
  })
  const comparison = compareAgentJourneys({ direct, ae: proof })
  const combined = {
    kind: 'development_customer_request_comparison' as const,
    release: { revision: config.sourceRevision, deploymentId: config.convexDeployment },
    direct, ae: proof, comparison,
    claimBoundary: 'labelled_sandbox_comparison_not_independently_operated_supply_fulfilment_or_customer_value' as const,
  }
  process.stdout.write(`${JSON.stringify(combined)}\n`)
  if (comparison.verdict !== 'pass_for_declared_class') {
    throw new Error(`customer_request_comparison_failed:${comparison.failures.join(',')}`)
  }
  return combined
}

function currentSourceRevision(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

function normalizeConvexDevelopmentDeployment(value: string): string {
  const match = /^dev:([a-z0-9-]+)$/u.exec(value.trim())
  if (match?.[1] === undefined) throw new Error('CONVEX_DEPLOYMENT must name an exact dev deployment')
  return `convex:${match[1]}`
}

function validateSourceRevision(value: string): string {
  if (!/^[a-f0-9]{40}$/u.test(value)) throw new Error('development source revision must be an exact Git commit')
  return value
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`${name} is required`)
  return normalized
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

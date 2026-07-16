import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadEnv } from 'vite'

import { compareAgentJourneys } from '../../src/modules/customer-request/agent-journey-comparison'
import { runFrozenDirectAgentBaseline } from '../../src/modules/customer-request/direct-agent-baseline'
import {
  resolveCustomerRequestJourneyKeyring,
  runSignedHostedCustomerRequestJourney,
  verifyCustomerRequestJourneyProof,
} from '../../src/modules/customer-request/journey-proof-attestation'
import { withTemporaryClerkApiKey } from '../release/customer-request-production-credential'
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
    AE_CUSTOMER_REQUEST_EXPECTED_RECIPIENTS_JSON:
      env.AE_CUSTOMER_REQUEST_EXPECTED_RECIPIENTS_JSON ?? JSON.stringify(DEFAULT_RECIPIENTS),
    AE_DIRECT_PROVIDER_ORIGINS_JSON: env.AE_DIRECT_PROVIDER_ORIGINS_JSON,
    AE_DIRECT_PROVIDER_CREDENTIAL: env.AE_DIRECT_PROVIDER_CREDENTIAL,
    AE_DIRECT_PREDECLARED_GAIN: env.AE_DIRECT_PREDECLARED_GAIN,
    AE_DIRECT_MAXIMUM_TOTAL_COST_JSON: env.AE_DIRECT_MAXIMUM_TOTAL_COST_JSON,
  })
  const journeyKeyring = env.AE_CUSTOMER_REQUEST_JOURNEY_SIGNING_KEY === undefined
    ? undefined
    : resolveCustomerRequestJourneyKeyring(env)
  const repeatPermission = env.AE_CUSTOMER_REQUEST_REPEAT_PERMISSION === 'true'
  if (repeatPermission && shared.finish !== 'complete') {
    throw new Error('Repeat-permission development proof requires AE_CUSTOMER_REQUEST_FINISH=complete')
  }
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
  config: CustomerRequestDevelopmentSmokeConfig,
) {
  const journeySigningKey = config.journeySigningKey
  const journeyTrustedKeys = config.journeyTrustedKeys
  if (journeySigningKey === undefined || journeyTrustedKeys === undefined) {
    throw new Error('AE_CUSTOMER_REQUEST_JOURNEY_SIGNING_KEY is required')
  }
  let signed: Awaited<ReturnType<typeof runSignedHostedCustomerRequestJourney>> | undefined
  await withTemporaryClerkApiKey({
    clerkSecretKey: config.clerkSecretKey,
    expectedInstanceId: config.clerkInstanceId,
    subject: config.clerkSubject,
    ...(config.repeatPermission
      ? { scopes: ['customer_requests:create', 'customer_requests:standing_authority'] }
      : {}),
    fetch: config.fetch,
    keyNamePrefix: 'AE development cold-agent acceptance',
    revocationReason: 'Temporary development acceptance completed',
    run: async (agentApiKey, identity) => {
      signed = await runSignedHostedCustomerRequestJourney({
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
          ...(config.expiryRecovery === undefined ? {} : { expiryRecovery: config.expiryRecovery }),
          ...(config.unsupportedRecovery === undefined
            ? {}
            : { unsupportedRecovery: config.unsupportedRecovery }),
          expectedRoute: config.expectedRoute,
          ...(config.repeatPermission
            ? {
                repeatPermission: {
                  delegatedCredentialId: identity.credentialId,
                  occurrences: 2,
                },
              }
            : {}),
        },
        sandbox: true,
        fetch: config.fetch,
      }, journeySigningKey)
    },
  })
  if (signed === undefined) throw new Error('customer_request_development_proof_missing')
  const verification = verifyCustomerRequestJourneyProof(signed, journeyTrustedKeys)
  if (verification.kind !== 'verified') {
    throw new Error(`customer_request_journey_attestation_${verification.reason}`)
  }
  const proof = verification.proof
  if (config.directBaseline === undefined) {
    process.stdout.write(`${JSON.stringify(signed)}\n`)
    return signed
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
  if (proof.final.state === 'in_progress') {
    throw new Error('customer_request_direct_comparison_requires_terminal_ae_result')
  }
  const terminalProof = proof as Parameters<typeof compareAgentJourneys>[0]['ae']
  const comparison = compareAgentJourneys({ direct, ae: terminalProof })
  const combined = {
    kind: 'development_customer_request_comparison' as const,
    release: { revision: config.sourceRevision, deploymentId: config.convexDeployment },
    direct, ae: proof, attestation: signed.attestation, comparison,
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

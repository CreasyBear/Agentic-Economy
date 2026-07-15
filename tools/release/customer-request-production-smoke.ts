import { pathToFileURL } from 'node:url'

import {
  runHostedCustomerRequestJourney,
  verifyHostedCustomerRequestFrontDoor,
  type HostedCustomerRequestJourneyProof,
} from '../../src/modules/customer-request/hosted-agent-journey'

import { verifyHostedCustomerRequestRelease } from './verify-customer-request-release'

const DEFAULT_BASE_URL = 'https://agentic-economy-phi.vercel.app'

export type CustomerRequestProductionSmokeConfig = Readonly<{
  baseUrl: string
  agentApiKey?: string
  deploymentProtectionBypass?: string
  expectedRevision?: string
  expectedDeploymentId?: string
  expectedRoute?: Readonly<{ stepCount: number; businesses: readonly string[] }>
  facts: Readonly<Record<string, unknown>>
  fetch: typeof globalThis.fetch
  finish?: 'cancel' | 'complete'
  messages: readonly string[]
  preflightOnly: boolean
  requestText: string
}>

export function customerRequestProductionSmokeConfigFromEnvironment(
  env: Record<string, string | undefined>,
  agentApiKey = env.AE_CUSTOMER_REQUEST_API_KEY,
): CustomerRequestProductionSmokeConfig {
  const normalizedAgentKey = optionalText(agentApiKey)
  const bypass = optionalText(env.AE_CUSTOMER_REQUEST_VERCEL_BYPASS_SECRET)
  const revision = optionalText(env.AE_RELEASE_SOURCE_REVISION)
  const deploymentId = optionalText(env.AE_RELEASE_DEPLOYMENT_ID)
  return {
    baseUrl: (env.AE_CUSTOMER_REQUEST_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/u, ''),
    ...(normalizedAgentKey === undefined ? {} : { agentApiKey: normalizedAgentKey }),
    ...(bypass === undefined ? {} : { deploymentProtectionBypass: bypass }),
    ...(revision === undefined ? {} : { expectedRevision: revision }),
    ...(deploymentId === undefined ? {} : { expectedDeploymentId: deploymentId }),
    ...parseExpectedRoute(env),
    facts: parseFacts(env.AE_CUSTOMER_REQUEST_FACTS_JSON),
    fetch: globalThis.fetch,
    finish: parseFinish(env.AE_CUSTOMER_REQUEST_FINISH),
    messages: parseMessages(env.AE_CUSTOMER_REQUEST_MESSAGES_JSON),
    preflightOnly: false,
    requestText: env.AE_CUSTOMER_REQUEST_TEXT ?? 'Find the cheapest labelled sandbox option.',
  }
}

export async function runCustomerRequestProductionSmoke(
  config: CustomerRequestProductionSmokeConfig,
): Promise<HostedCustomerRequestJourneyProof | undefined> {
  const frontDoor = {
    baseUrl: config.baseUrl, fetch: config.fetch,
    ...(config.deploymentProtectionBypass === undefined
      ? {} : { deploymentProtectionBypass: config.deploymentProtectionBypass }),
  }
  if (config.preflightOnly) {
    await verifyHostedCustomerRequestFrontDoor(frontDoor)
    process.stdout.write(`${JSON.stringify({ result: 'PASS', proof: 'front_door_only' })}\n`)
    return undefined
  }
  const agentApiKey = required(config.agentApiKey, 'AE_CUSTOMER_REQUEST_API_KEY')
  const expectedRevision = required(config.expectedRevision, 'AE_RELEASE_SOURCE_REVISION')
  const expectedDeploymentId = required(config.expectedDeploymentId, 'AE_RELEASE_DEPLOYMENT_ID')
  const verifyRelease = async () => await verifyHostedCustomerRequestRelease({
    baseUrl: config.baseUrl, apiKey: agentApiKey, expectedRevision, expectedDeploymentId,
    fetchImpl: config.fetch,
    ...(config.deploymentProtectionBypass === undefined
      ? {} : { deploymentProtectionBypass: config.deploymentProtectionBypass }),
  })
  const proof = await runHostedCustomerRequestJourney({
    ...frontDoor,
    agentApiKey, expectedRevision, expectedDeploymentId, verifyRelease,
    agent: { name: 'ae-hosted-cold-external-agent', version: '2' },
    scenario: {
      request: config.requestText, facts: config.facts, messages: config.messages,
      finish: config.finish ?? 'cancel',
      ...(config.expectedRoute === undefined ? {} : { expectedRoute: config.expectedRoute }),
    },
    sandbox: true,
  })
  process.stdout.write(`${JSON.stringify(proof)}\n`)
  return proof
}

function parseFinish(value: string | undefined): 'cancel' | 'complete' {
  const finish = optionalText(value) ?? 'cancel'
  if (finish !== 'cancel' && finish !== 'complete') {
    throw new Error('AE_CUSTOMER_REQUEST_FINISH must be cancel or complete')
  }
  return finish
}

function parseExpectedRoute(
  env: Record<string, string | undefined>,
): Readonly<{ expectedRoute?: Readonly<{ stepCount: number; businesses: readonly string[] }> }> {
  const countText = optionalText(env.AE_CUSTOMER_REQUEST_EXPECTED_STEP_COUNT)
  const businessesText = optionalText(env.AE_CUSTOMER_REQUEST_EXPECTED_BUSINESSES_JSON)
  if (countText === undefined && businessesText === undefined) return {}
  const stepCount = Number(countText)
  const businesses: unknown = businessesText === undefined ? undefined : JSON.parse(businessesText)
  if (!Number.isInteger(stepCount) || stepCount < 1
    || !Array.isArray(businesses)
    || businesses.length < 1
    || !businesses.every((value) => typeof value === 'string' && value.length > 0)) {
    throw new Error('Expected route requires a positive step count and a JSON array of business names')
  }
  return { expectedRoute: { stepCount, businesses } }
}

function parseFacts(value: string | undefined): Readonly<Record<string, unknown>> {
  if (value === undefined || value.trim().length === 0) return {}
  const parsed: unknown = JSON.parse(value)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
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

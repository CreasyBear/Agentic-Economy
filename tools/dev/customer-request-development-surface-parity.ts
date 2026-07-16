import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { loadEnv } from 'vite'
import { z } from 'zod'

import { compareCustomerRequestSurfaces } from '../../src/modules/customer-request/cross-surface-parity'
import {
  runSignedHostedCustomerRequestJourney,
  verifyCustomerRequestJourneyProof,
} from '../../src/modules/customer-request/journey-proof-attestation'
import { withTemporaryClerkAcceptanceCredentials } from '../release/customer-request-production-credential'
import { customerRequestDevelopmentSmokeConfig } from './customer-request-development-smoke'

const execFileAsync = promisify(execFile)
const observationSchema = z.strictObject({
  requestRef: z.string().min(1),
  revision: z.number().int().nonnegative(),
  state: z.literal('completed'),
  evidenceState: z.literal('completed'),
  resultDigest: z.string().startsWith('sha256:'),
  businesses: z.array(z.string().min(1)).min(1),
  resumedAfterReload: z.literal(true),
})

export function parseHumanRequestObservation(stdout: string) {
  const lines = stdout.split(/\r?\n/u)
    .filter((line) => line.startsWith('AE_HUMAN_REQUEST_OBSERVATION '))
  if (lines.length !== 1) throw new Error('customer_request_human_observation_missing')
  return observationSchema.parse(JSON.parse(lines[0]!.slice('AE_HUMAN_REQUEST_OBSERVATION '.length)))
}

export async function runCustomerRequestDevelopmentSurfaceParity(
  env: Record<string, string | undefined>,
) {
  const sourceRevision = required(env.AE_RELEASE_SOURCE_REVISION, 'AE_RELEASE_SOURCE_REVISION')
  const config = customerRequestDevelopmentSmokeConfig(env, sourceRevision)
  const journeySigningKey = config.journeySigningKey
  const journeyTrustedKeys = config.journeyTrustedKeys
  if (journeySigningKey === undefined || journeyTrustedKeys === undefined) {
    throw new Error('AE_CUSTOMER_REQUEST_JOURNEY_SIGNING_KEY is required')
  }
  const baseUrl = config.baseUrl
  let result: ReturnType<typeof compareCustomerRequestSurfaces> | undefined
  await withTemporaryClerkAcceptanceCredentials({
    clerkSecretKey: required(env.CLERK_SECRET_KEY, 'CLERK_SECRET_KEY'),
    expectedInstanceId: required(env.AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID, 'AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID'),
    subject: required(env.AE_CUSTOMER_REQUEST_CLERK_SUBJECT, 'AE_CUSTOMER_REQUEST_CLERK_SUBJECT'),
    fetch: globalThis.fetch,
    keyNamePrefix: 'AE development cross-surface parity',
    revocationReason: 'Temporary development cross-surface parity completed',
    run: async ({ agentApiKey, customerSessionToken }) => {
      const signedAgent = await runSignedHostedCustomerRequestJourney({
        environment: 'development',
        baseUrl,
        agentApiKey,
        expectedRevision: sourceRevision,
        expectedDeploymentId: config.convexDeployment,
        verifyRelease: async () => ({
          kind: 'verified', revision: sourceRevision, deploymentId: config.convexDeployment,
        }),
        agent: { name: 'ae-development-cross-surface-agent', version: '1' },
        scenario: {
          request: config.request,
          facts: config.facts,
          messages: config.messages,
          finish: 'complete',
          expectedRoute: config.expectedRoute,
        },
        sandbox: true,
        fetch: config.fetch,
      }, journeySigningKey)
      const verification = verifyCustomerRequestJourneyProof(signedAgent, journeyTrustedKeys)
      if (verification.kind !== 'verified') throw new Error(`customer_request_journey_attestation_${verification.reason}`)
      const agent = verification.proof
      let playwright: Readonly<{ stdout: string }>
      try {
        playwright = await execFileAsync(
          'npx',
          [
            'playwright', 'test', '--config=playwright.deploy-smoke.config.ts',
            'tests/deploy-smoke/customer-request-human-lifecycle-smoke.spec.ts',
          ],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              ...env,
              AE_CUSTOMER_REQUEST_BASE_URL: baseUrl,
              AE_CUSTOMER_REQUEST_FINISH: 'complete',
              AE_CUSTOMER_REQUEST_HUMAN_SESSION_TOKEN: customerSessionToken,
              AE_CUSTOMER_REQUEST_EXISTING_REF: agent.final.requestRef,
            },
            maxBuffer: 10 * 1024 * 1024,
          },
        )
      } catch (error) {
        const diagnostic = childProcessDiagnostic(error)
          .replaceAll(customerSessionToken, '[REDACTED_SESSION_TOKEN]')
          .slice(-8_000)
        throw new Error(`customer_request_human_browser_failed:${diagnostic}`)
      }
      const human = parseHumanRequestObservation(playwright.stdout)
      if (agent.final.state !== 'completed' || agent.final.evidenceState !== 'completed'
        || agent.final.resultDigest === undefined) throw new Error('customer_request_agent_parity_result_missing')
      result = compareCustomerRequestSurfaces({
        human,
        agent: {
          requestRef: agent.final.requestRef,
          revision: agent.final.revision,
          state: agent.final.state,
          evidenceState: agent.final.evidenceState,
          resultDigest: agent.final.resultDigest,
          businesses: agent.final.selectedBusinesses,
        },
      })
      if (result.verdict !== 'pass') {
        throw new Error(`customer_request_surface_parity_failed:${result.failures.join(',')}`)
      }
    },
  })
  if (result === undefined) throw new Error('customer_request_surface_parity_proof_missing')
  const proof = {
    ...result,
    environment: 'development' as const,
    baseUrl,
    sourceRevision,
    deploymentId: config.convexDeployment,
    journeyAttestation: 'verified' as const,
    claimBoundary: 'same_subject_same_request_sandbox_surface_parity_not_real_supply_fulfilment_or_customer_value' as const,
  }
  process.stdout.write(`${JSON.stringify(proof)}\n`)
  return proof
}

function childProcessDiagnostic(error: unknown): string {
  if (error === null || typeof error !== 'object') return 'unexpected_error'
  const value = error as Record<string, unknown>
  return [value.stdout, value.stderr, value.message]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join('\n')
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`${name} is required`)
  return normalized
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const fileEnv = loadEnv('development', process.cwd(), '')
  await runCustomerRequestDevelopmentSurfaceParity({ ...fileEnv, ...process.env }).catch((error: unknown) => {
    console.error(error instanceof Error ? `FAIL ${error.message}` : 'FAIL unexpected_error')
    process.exitCode = 1
  })
}

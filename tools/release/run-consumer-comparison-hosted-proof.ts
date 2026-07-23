import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { withTemporaryClerkApiKey } from './customer-request-production-credential'

const artifactDirectory = resolve(required('CONSUMER_COMPARISON_ARTIFACT_DIR'))
const packetPath = resolve(required('CONSUMER_COMPARISON_PACKET_PATH'))
mkdirSync(artifactDirectory, { recursive: true })

await withTemporaryClerkApiKey({
  clerkSecretKey: required('CLERK_SECRET_KEY'),
  expectedInstanceId: required('AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID'),
  subject: required('AE_CUSTOMER_REQUEST_CLERK_SUBJECT'),
  fetch: globalThis.fetch,
  keyNamePrefix: 'AE Phase 5 hosted comparison proof',
  run: async (apiKey) => {
    const env = { ...process.env, CONSUMER_COMPARISON_SMOKE_AUTH: apiKey }
    run('npm', [
      'exec', '--', 'playwright', 'test',
      '--config=playwright.deploy-smoke.config.ts',
      'tests/deploy-smoke/consumer-comparison-smoke.spec.ts',
    ], env)
    run('npm', [
      'exec', '--', 'tsx',
      'tools/release/consumer-comparison-evidence.ts',
      resolve(artifactDirectory, 'consumer-comparison-evidence-input.json'),
      packetPath,
    ], env)
    run('npm', [
      'exec', '--', 'tsx',
      'tools/release/verify-consumer-comparison-evidence.ts',
      packetPath,
    ], env)
  },
})

function run(command: string, args: string[], env: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`phase5_hosted_proof_command_failed:${command}:${result.status ?? 'signal'}`)
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (value === undefined || value.length === 0) throw new Error(`${name}_required`)
  return value
}

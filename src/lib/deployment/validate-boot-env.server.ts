import { bootValidationClass } from './environment'
import { validateClerkWebhookEnvironment, validateControlPlaneEnvironment } from './env-schema'

// Ordinary requests require the shared control-plane configuration. New money
// effects and readiness retain the full static production manifest.
// Development deployments can use NODE_ENV=production without live secrets.
let validated = false

export function ensureBootEnvironmentValidated(): void {
  if (validated) return

  const environment = bootValidationClass(process.env)
  const result = validateControlPlaneEnvironment(process.env, environment)
  if (result.ok) {
    validated = true
    return
  }

  const message = result.problems.map((problem) => `${problem.name}: ${problem.reason}`).join('\n')
  throw new Error(`Invalid environment configuration:\n${message}`)
}

// Callback admission neither reads nor populates the full boot cache.
export function ensureClerkWebhookEnvironmentValidated(): void {
  const result = validateClerkWebhookEnvironment(process.env, bootValidationClass(process.env))
  if (result.ok) return
  const message = result.problems.map(problem => `${problem.name}: ${problem.reason}`).join('\n')
  throw new Error(`Invalid environment configuration:\n${message}`)
}

export function resetBootEnvironmentValidationForTests(): void {
  validated = false
}

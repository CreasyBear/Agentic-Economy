import { bootValidationClass } from './environment'
import { validateClerkWebhookEnvironment, validateEnvironment } from './env-schema'

// Production money requires the full static manifest at the request boundary;
// provider health and operational approval remain separate payment checks.
// Development deployments can use NODE_ENV=production without live secrets.
let validated = false

export function ensureBootEnvironmentValidated(): void {
  if (validated) return

  const environment = bootValidationClass(process.env)
  const result = validateEnvironment(process.env, environment)
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

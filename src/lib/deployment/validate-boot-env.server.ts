import { bootValidationClass } from './environment'
import { validateEnvironment } from './env-schema'

// Validate only shared infrastructure at the request boundary. Model, money
// rail, custody and observability settings are checked by the operations that
// need them; a missing enhancement cannot take down public pages.
// Vercel Preview uses NODE_ENV=production but does not inherit hosted secrets.
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

export function resetBootEnvironmentValidationForTests(): void {
  validated = false
}

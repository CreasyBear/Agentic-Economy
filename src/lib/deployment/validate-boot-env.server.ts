import { bootValidationClass } from './environment'
import { validateEnvironment } from './env-schema'

// Boot-time configuration validation.
//
// Before this existed, ~112 scattered `process.env` reads meant a missing or
// malformed secret surfaced as a mystery failure deep inside some degraded
// runtime path -- long after the process had already come up "successfully".
// Running the full manifest-driven check once, per process, turns that into
// a same-second, actionable boot failure.
//
// Vercel Preview sets NODE_ENV=production while VERCEL_ENV=preview. Hosted
// production secrets stay Production-only; preview must not inherit that
// fail-closed set. Mark the process validated only after a successful check
// or a non-production warning so a production throw stays on every request.
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
  if (environment === 'production') {
    throw new Error(`Invalid environment configuration:\n${message}`)
  }
  console.error(`Invalid environment configuration:\n${message}`)
  validated = true
}

export function resetBootEnvironmentValidationForTests(): void {
  validated = false
}

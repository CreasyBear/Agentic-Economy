import { readTrimmedEnv } from '@/lib/server/read-trimmed-env'
import { validateEnvironment } from './env-schema'

// Boot-time configuration validation.
//
// Before this existed, ~112 scattered `process.env` reads meant a missing or
// malformed secret surfaced as a mystery failure deep inside some degraded
// runtime path -- long after the process had already come up "successfully".
// Running the full manifest-driven check once, per process, turns that into
// a same-second, actionable boot failure.
let validated = false

export function ensureBootEnvironmentValidated(): void {
  if (validated) return

  const nodeEnv = readTrimmedEnv(process.env, 'NODE_ENV')
  const environment = nodeEnv === 'development' ? 'development' : 'production'
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
}

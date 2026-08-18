import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadEnv } from 'vite'
import { z } from 'zod'

const observationSchema = z.strictObject({
  requestRef: z.string().min(1),
  revision: z.number().int().nonnegative(),
  state: z.enum(['completed', 'outcome_unknown']),
  evidenceState: z.enum(['completed', 'outcome_unknown']),
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
  _env: Record<string, string | undefined>,
): Promise<never> {
  throw new Error('customer_request_module_deleted')
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const fileEnv = loadEnv('development', process.cwd(), '')
  await runCustomerRequestDevelopmentSurfaceParity({ ...fileEnv, ...process.env }).catch((error: unknown) => {
    console.error(error instanceof Error ? `FAIL ${error.message}` : 'FAIL unexpected_error')
    process.exitCode = 1
  })
}

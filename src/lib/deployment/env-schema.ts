import { z } from 'zod'
import { readTrimmedEnv } from '@/lib/server/read-trimmed-env'
import { deploymentPaymentEnvironment } from './environment'
import { DEPLOYMENT_MANIFEST, fieldRules, type FieldRule } from './manifest'

export type EnvValidationProblem = Readonly<{ name: string; reason: string }>
export type EnvValidationResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; problems: readonly EnvValidationProblem[] }>

// Boot validates the manifest's shared requirements only. Operation-specific
// values are parsed at their own boundary, not on public requests.
const kindSchemas: Readonly<Record<FieldRule['kind'], z.ZodType<string>>> = {
  url: z.url(),
  boolean: z.enum(['true', 'false']),
  'host-list': z
    .string()
    .min(1)
    .refine(
      (value) => value.split(',').every((entry) => entry.trim().length > 0),
      { message: 'must be a comma-separated list of non-empty entries' },
    ),
  'credential-ref': z.string().min(1),
}

const defaultSchema: z.ZodType<string> = z.string().min(1)

function fieldRuleFor(name: string): FieldRule | undefined {
  return fieldRules.find((rule) => rule.name === name)
}

function schemaFor(name: string): z.ZodType<string> {
  const rule = fieldRuleFor(name)
  return rule === undefined ? defaultSchema : kindSchemas[rule.kind]
}

function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'invalid value'
}

export function validateEnvironment(
  env: NodeJS.ProcessEnv,
  environment: 'development' | 'production',
): EnvValidationResult {
  const problems: EnvValidationProblem[] = []
  const seen = new Set<string>()
  const addProblem = (name: string, reason: string): void => {
    const key = `${name}:${reason}`
    if (seen.has(key)) return
    seen.add(key)
    problems.push(Object.freeze({ name, reason }))
  }
  const validatePresentValue = (name: string, value: string): void => {
    const result = schemaFor(name).safeParse(value)
    if (!result.success) addProblem(name, firstIssueMessage(result.error))
  }

  const { requiredProduction, forbiddenProduction } = DEPLOYMENT_MANIFEST.configuration

  if (deploymentPaymentEnvironment(env) === undefined) {
    addProblem('AE_DEPLOYMENT_ENVIRONMENT', 'must be exactly production or development')
  }

  if (environment === 'production') {
    for (const group of requiredProduction) {
      if (group.mode === 'one-of') {
        const anyPresent = group.names.some((name) => readTrimmedEnv(env, name) !== undefined)
        if (!anyPresent) {
          for (const name of group.names) addProblem(name, 'required in production but missing (one-of group)')
          continue
        }
        for (const name of group.names) {
          const value = readTrimmedEnv(env, name)
          if (value !== undefined) validatePresentValue(name, value)
        }
        continue
      }
      for (const name of group.names) {
        const value = readTrimmedEnv(env, name)
        if (value === undefined) {
          addProblem(name, 'required in production but missing')
          continue
        }
        validatePresentValue(name, value)
      }
    }

    for (const name of forbiddenProduction) {
      if (readTrimmedEnv(env, name) !== undefined) addProblem(name, 'forbidden in production but present')
    }
  }

  return problems.length === 0 ? { ok: true } : { ok: false, problems: Object.freeze(problems) }
}

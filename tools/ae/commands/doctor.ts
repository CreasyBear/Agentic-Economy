import type { CliOptions } from '../lib/args'
import { heading, line, printJson, table } from '../lib/output'

type DoctorGroup = 'core' | 'optionalProviders'
type DoctorStatus = 'configured' | 'missing'
type DoctorVariable = Readonly<{ name: string; group: DoctorGroup }>
export type DoctorEntry = Readonly<{ name: string; status: DoctorStatus }>
export type DoctorReport = Readonly<{
  core: readonly DoctorEntry[]
  optionalProviders: readonly DoctorEntry[]
}>

export const DOCTOR_ENVIRONMENT_VARIABLES = [
  { name: 'CONVEX_URL', group: 'core' },
  { name: 'VITE_CONVEX_URL', group: 'core' },
  { name: 'AE_SOURCE_WRITE_SECRET', group: 'core' },
  { name: 'OPENROUTER_API_KEY', group: 'core' },
  { name: 'VITE_CLERK_PUBLISHABLE_KEY', group: 'core' },
  { name: 'CLERK_SECRET_KEY', group: 'core' },
  { name: 'CLERK_JWT_ISSUER_DOMAIN', group: 'core' },
  { name: 'EXA_API_KEY', group: 'optionalProviders' },
  { name: 'OPENWEATHER_API_KEY', group: 'optionalProviders' },
  { name: 'SERPAPI_API_KEY', group: 'optionalProviders' },
  { name: 'TAVILY_API_KEY', group: 'optionalProviders' },
  { name: 'COINGECKO_DEMO_API_KEY', group: 'optionalProviders' },
] as const satisfies readonly DoctorVariable[]

export function collectDoctorReport(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): DoctorReport {
  const read = (variable: DoctorVariable): DoctorEntry => {
    const value = environment[variable.name]
    return {
      name: variable.name,
      status: value !== undefined && value.length > 0 ? 'configured' : 'missing',
    }
  }
  return {
    core: DOCTOR_ENVIRONMENT_VARIABLES.filter((variable) => variable.group === 'core').map(read),
    optionalProviders: DOCTOR_ENVIRONMENT_VARIABLES.filter((variable) => variable.group === 'optionalProviders').map(read),
  }
}

/** `ae advanced doctor [--json]` — inspect names only; never expose environment values. */
export async function runDoctorCommand(_args: readonly string[], options: CliOptions): Promise<void> {
  const report = collectDoctorReport()
  if (options.json) {
    printJson(report)
    return
  }

  heading('Agentic-economy environment readiness')
  line('Names only; values are never shown.')
  line('')
  line('Core runtime')
  tableEntries(report.core)
  line('')
  line('Optional keyed providers')
  tableEntries(report.optionalProviders)
}

function tableEntries(entries: readonly DoctorEntry[]): void {
  table(entries.map((entry) => [entry.name, entry.status] as const))
}

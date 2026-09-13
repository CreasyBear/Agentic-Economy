export type ServiceMode = 'standard' | 'hosted_alpha' | 'invalid'

// Explicit malformed or conflicting configuration must never enable Calls.
export function resolveServiceMode(
  environment: Readonly<Record<string, string | undefined>>,
): ServiceMode {
  const mode = environment.AE_SERVICE_MODE
  if (mode === undefined) return 'standard'
  if (environment.AE_PACKAGE4_SANDBOX_DEPLOYMENT_PROFILE !== undefined) return 'invalid'
  return mode === 'hosted_alpha' ? 'hosted_alpha' : 'invalid'
}

export function serviceModeAllowsEnvironment(mode: ServiceMode, environment: string): boolean {
  return mode === 'standard' || (mode === 'hosted_alpha' && environment === 'sandbox')
}

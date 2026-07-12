export type ReadinessStatus = 'configured' | 'invalid' | 'unconfigured'
export type ProviderReadiness = Readonly<{
  status: ReadinessStatus
  evidenceClass: 'local_configuration_only'
  liveReachability: 'unverified'
  checks: Readonly<Record<string, 'present' | 'missing'>>
  reason?: string
}>
export function loadShippoConfiguration(env: Readonly<Record<string, string | undefined>>): Readonly<Record<string, unknown>>
export function loadEasyPostConfiguration(env: Readonly<Record<string, string | undefined>>): Readonly<Record<string, unknown>>
export function providerReadinessInventory(env: Readonly<Record<string, string | undefined>>): Readonly<{
  schemaVersion: 'ae-provider-readiness:v1'
  shippo: ProviderReadiness
  easypost: ProviderReadiness
}>

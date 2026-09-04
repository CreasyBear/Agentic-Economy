import { readTrimmedEnv, type StringEnvironment } from './read-trimmed-env'

export const PACKAGE5_ROLLOUT_FLAGS = Object.freeze({
  writes: 'AE_PACKAGE5_WRITES_ENABLED',
  httpCredentials: 'AE_SUPPLY_HTTP_CREDENTIALS_ENABLED',
  mcpOAuth: 'AE_SUPPLY_MCP_OAUTH_ENABLED',
  providerOffboarding: 'AE_PROVIDER_OFFBOARDING_ENABLED',
} as const)

export type Package5RolloutCapability = keyof typeof PACKAGE5_ROLLOUT_FLAGS
export type Package5RolloutCode =
  | 'package5_writes_disabled'
  | 'supply_http_credentials_disabled'
  | 'supply_mcp_oauth_disabled'
  | 'provider_offboarding_disabled'

export type Package5RolloutDecision =
  | Readonly<{ enabled: true }>
  | Readonly<{ enabled: false; code: Package5RolloutCode }>

const PACKAGE5_WRITE_ACTIONS = new Set([
  'supply.publish',
  'supply.withdraw',
  'supply.recheck',
  'supply.republish',
  'supply.connection.connect',
  'supply.connection.reconnect',
])

/**
 * Local development remains frictionless. Explicit false values and controlled
 * deployments without an explicit true fail closed. Recovery, callback,
 * readback, and revocation paths deliberately do not call this helper.
 */
export function package5RolloutDecision(
  capability: Package5RolloutCapability,
  environment: StringEnvironment = process.env,
): Package5RolloutDecision {
  if (!rolloutFlagEnabled(PACKAGE5_ROLLOUT_FLAGS.writes, environment)) {
    return { enabled: false, code: 'package5_writes_disabled' }
  }
  if (capability === 'writes') return { enabled: true }
  if (rolloutFlagEnabled(PACKAGE5_ROLLOUT_FLAGS[capability], environment)) {
    return { enabled: true }
  }
  return {
    enabled: false,
    code: capability === 'httpCredentials'
      ? 'supply_http_credentials_disabled'
      : capability === 'mcpOAuth'
        ? 'supply_mcp_oauth_disabled'
        : 'provider_offboarding_disabled',
  }
}

export function package5SupplyActionRolloutDecision(
  actionId: string,
  input: unknown,
  environment: StringEnvironment = process.env,
): Package5RolloutDecision {
  if (!PACKAGE5_WRITE_ACTIONS.has(actionId)) return { enabled: true }
  if (actionId !== 'supply.connection.connect') {
    return package5RolloutDecision('writes', environment)
  }
  if (isRecord(input) && input.kind === 'http_credential') {
    return package5RolloutDecision('httpCredentials', environment)
  }
  if (isRecord(input) && input.kind === 'mcp_oauth') {
    return package5RolloutDecision('mcpOAuth', environment)
  }
  return package5RolloutDecision('writes', environment)
}

function rolloutFlagEnabled(name: string, environment: StringEnvironment): boolean {
  const configured = readTrimmedEnv(environment, name)
  if (configured !== undefined) return configured === 'true'
  return !isControlledDeployment(environment)
}

function isControlledDeployment(environment: StringEnvironment): boolean {
  return readTrimmedEnv(environment, 'NODE_ENV') === 'production'
    || readTrimmedEnv(environment, 'AE_PACKAGE4_SANDBOX_DEPLOYMENT_PROFILE') === 'synthetic_vps_fixture'
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

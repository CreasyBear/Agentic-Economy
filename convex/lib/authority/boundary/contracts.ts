import { v } from 'convex/values'
import { AGENT_ACCESS_ENVIRONMENT_VALUES, type AgentAccessEnvironment } from '@/modules/agent-access/agent-access'
import { AGENT_ACCESS_AUTHORITY_MODE_VALUES, type AgentAccessAuthorityMode } from '@/modules/agent-access/contract'
import { sourceWriteAdmissionArg, sourceWriteRequestArg } from '../../../sourceWriteAdmission'

export const AUTHORITY_VALUE_PATTERN = /^[A-Za-z0-9*][A-Za-z0-9._:/*-]{0,199}$/u
export const PRINCIPAL_REF_PATTERN = /^prn_[0-9a-f]{32}$/u
export const ACCOUNT_REF_PATTERN = /^acc_[0-9a-f]{32}$/u
export const CREDENTIAL_REF_PATTERN = /^crd_[0-9a-f]{32}$/u
export const GRANT_REF_PATTERN = /^grt_[0-9a-f]{32}$/u
export const MAX_REQUIRED_SCOPES = 64

export const environmentValue = v.union(v.literal('sandbox'), v.literal('production'))
export const authorityModeValue = v.union(
  v.literal('read_only'),
  v.literal('approval_required'),
  v.literal('spending_policy'),
  v.literal('unrestricted_test_only'),
)

export const canonicalAgentBindingValue = v.object({
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  canonicalCredentialRef: v.string(),
  grantRef: v.string(),
  grantGeneration: v.number(),
  snapshotRef: v.string(),
  applicationRef: v.string(),
  environment: environmentValue,
  scopes: v.array(v.string()),
  authorityMode: authorityModeValue,
})

export type ResolveAgentBindingArgs = Readonly<{
  credentialId: string
  applicationRef: string
  environment: AgentAccessEnvironment
  scopes: readonly string[]
  requiredScopes: readonly string[]
  authorityMode: AgentAccessAuthorityMode
  operationKey: string
  correlationId: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}>

export const resolveAgentBindingArgs = {
  credentialId: v.string(),
  applicationRef: v.string(),
  environment: environmentValue,
  scopes: v.array(v.string()),
  requiredScopes: v.array(v.string()),
  authorityMode: authorityModeValue,
  operationKey: v.string(),
  correlationId: v.string(),
  sourceWrite: v.optional(sourceWriteAdmissionArg),
  sourceWriteRequest: v.optional(sourceWriteRequestArg),
}
export const resolveAgentBindingResult = v.union(canonicalAgentBindingValue, v.null())

function canonicalAuthorityValues(values: readonly string[], allowEmpty: boolean): readonly string[] | undefined {
  if (!Array.isArray(values)
    || (!allowEmpty && values.length === 0)
    || values.length > MAX_REQUIRED_SCOPES
    || values.some((value) => typeof value !== 'string' || !AUTHORITY_VALUE_PATTERN.test(value))
    || new Set(values).size !== values.length) return undefined
  return Object.freeze([...values].sort())
}

function canonicalAuthorityValue(value: unknown): value is string {
  return typeof value === 'string' && AUTHORITY_VALUE_PATTERN.test(value)
}

export function canonicalResolveInput(input: ResolveAgentBindingArgs): Readonly<{
  scopes: readonly string[]
  requiredScopes: readonly string[]
}> | undefined {
  const scopes = canonicalAuthorityValues(input.scopes, true)
  const requiredScopes = canonicalAuthorityValues(input.requiredScopes, false)
  if (!canonicalAuthorityValue(input.credentialId)
    || !canonicalAuthorityValue(input.applicationRef)
    || !canonicalAuthorityValue(input.operationKey)
    || !canonicalAuthorityValue(input.correlationId)
    || scopes === undefined
    || requiredScopes === undefined
    || requiredScopes.some((scope) => !scopes.includes(scope))
    || !AGENT_ACCESS_ENVIRONMENT_VALUES.includes(input.environment)
    || !AGENT_ACCESS_AUTHORITY_MODE_VALUES.includes(input.authorityMode)) return undefined
  return { scopes, requiredScopes }
}

export function currentServerTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

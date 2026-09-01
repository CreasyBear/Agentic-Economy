import { constantTimeStringEqual } from '@/lib/server/constant-time'
import {
  isLocalE2EAuthBypassEnabled,
  LOCAL_E2E_OPERATOR_PRINCIPAL,
} from '@/lib/server/local-e2e-bypass'
import type {
  AgentAccessKeyApi,
  AgentAccessKeyCreateInput,
  AgentAccessKeyRecord,
} from '@/modules/agent-access/agent-access'
import { canonicalDigest } from '@/modules/common/canonical-digest'

type LocalE2EAgentKeyRecord = Readonly<{
  id: string
  name: string
  subject: typeof LOCAL_E2E_OPERATOR_PRINCIPAL
  secret: string
  scopes: readonly string[]
  claims: Readonly<Record<string, string>>
  createdAt: number
  expiresAt: number
  revoked: boolean
  createMaterialDigest: string
}>

export type LocalE2EAgentKeyAuthentication = Readonly<{
  candidate: Readonly<{
    isAuthenticated: true
    tokenType: 'api_key'
    id: string
    subject: typeof LOCAL_E2E_OPERATOR_PRINCIPAL
    scopes: readonly string[]
    claims: Readonly<Record<string, unknown>>
  }>
  current: Readonly<{
    id: string
    subject: typeof LOCAL_E2E_OPERATOR_PRINCIPAL
    revoked: false
    expired: false
    scopes: readonly string[]
    claims: Readonly<Record<string, unknown>>
  }>
}>

const LOCAL_E2E_AGENT_KEY_REGISTRY = Symbol.for('agentic-economy.local-e2e-agent-key-registry')
const existingLocalAgentKeyRegistry = Reflect.get(process, LOCAL_E2E_AGENT_KEY_REGISTRY) as unknown
const localAgentKeys = existingLocalAgentKeyRegistry instanceof Map
  ? existingLocalAgentKeyRegistry as Map<string, LocalE2EAgentKeyRecord>
  : new Map<string, LocalE2EAgentKeyRecord>()
if (existingLocalAgentKeyRegistry === undefined) {
  Reflect.set(process, LOCAL_E2E_AGENT_KEY_REGISTRY, localAgentKeys)
} else if (!(existingLocalAgentKeyRegistry instanceof Map)) {
  throw new Error('local_e2e_agent_key_registry_unavailable')
}

export function createLocalE2EAgentAccessKeyApi(): AgentAccessKeyApi {
  return {
    list: async ({ subject, includeInvalid, limit }) => {
      requireLocalBypass()
      const now = Date.now()
      return {
        data: [...localAgentKeys.values()]
          .filter((record) => record.subject === subject
            && (includeInvalid || (!record.revoked && record.expiresAt > now)))
          .slice(0, limit)
          .map((record) => projectRecord(record, now)),
      }
    },
    create: async (input) => {
      requireLocalBypass()
      const now = Date.now()
      const id = localKeyId(input)
      const existing = localAgentKeys.get(id)
      if (existing !== undefined) {
        if (existing.revoked || existing.expiresAt <= now || !sameCreateMaterial(existing, input)) {
          throw new Error('local_e2e_agent_key_conflict')
        }
        return { id }
      }
      if (input.subject !== LOCAL_E2E_OPERATOR_PRINCIPAL
        || !Number.isSafeInteger(input.secondsUntilExpiration)
        || input.secondsUntilExpiration <= 0) throw new Error('local_e2e_agent_key_unavailable')
      const secret = `ak_secret_local_${crypto.randomUUID().replaceAll('-', '')}`
      localAgentKeys.set(id, Object.freeze({
        id,
        name: input.name,
        subject: LOCAL_E2E_OPERATOR_PRINCIPAL,
        secret,
        scopes: Object.freeze([...input.scopes]),
        claims: Object.freeze({ ...input.claims }),
        createdAt: now,
        expiresAt: now + input.secondsUntilExpiration * 1_000,
        revoked: false,
        createMaterialDigest: createMaterialDigest(input),
      }))
      return { id, secret }
    },
    getSecret: async (keyId) => {
      requireLocalBypass()
      const record = localAgentKeys.get(keyId)
      if (record === undefined || record.revoked || record.expiresAt <= Date.now()) {
        throw new Error('local_e2e_agent_key_unavailable')
      }
      return { secret: record.secret }
    },
    get: async (keyId) => {
      requireLocalBypass()
      const record = localAgentKeys.get(keyId)
      if (record === undefined) throw new Error('local_e2e_agent_key_unavailable')
      return projectRecord(record, Date.now())
    },
    revoke: async ({ apiKeyId }) => {
      requireLocalBypass()
      const record = localAgentKeys.get(apiKeyId)
      if (record !== undefined && !record.revoked) {
        localAgentKeys.set(apiKeyId, Object.freeze({ ...record, revoked: true }))
      }
    },
  }
}

export function authenticateLocalE2EAgentKey(
  request: Request,
  now = Date.now(),
): LocalE2EAgentKeyAuthentication | undefined {
  if (!isLocalE2EAuthBypassEnabled()) return undefined
  const authorization = request.headers.get('authorization')
  const bearer = authorization === null ? undefined : /^Bearer ([^\s]+)$/u.exec(authorization)?.[1]
  if (bearer === undefined) return undefined

  let matched: LocalE2EAgentKeyRecord | undefined
  for (const record of localAgentKeys.values()) {
    if (constantTimeStringEqual(record.secret, bearer)) matched ??= record
  }
  if (matched === undefined || matched.revoked || matched.expiresAt <= now) return undefined
  const shared = {
    id: matched.id,
    subject: matched.subject,
    scopes: matched.scopes,
    claims: matched.claims,
  } as const
  return {
    candidate: { ...shared, isAuthenticated: true, tokenType: 'api_key' },
    current: { ...shared, revoked: false, expired: false },
  }
}

function localKeyId(input: AgentAccessKeyCreateInput): string {
  return `ak_local_e2e_${canonicalDigest({
    version: 'ae.local-e2e-agent-key:v1',
    subject: input.subject,
    issuanceKey: input.claims.aeIssuanceKey,
    grantRef: input.claims.aeGrantRef,
  }).slice('sha256:'.length)}`
}

function sameCreateMaterial(record: LocalE2EAgentKeyRecord, input: AgentAccessKeyCreateInput): boolean {
  return record.createMaterialDigest === createMaterialDigest(input)
}

function createMaterialDigest(input: AgentAccessKeyCreateInput): string {
  return canonicalDigest({
    version: 'ae.local-e2e-agent-key-material:v1',
    name: input.name,
    subject: input.subject,
    createdBy: input.createdBy,
    scopes: input.scopes,
    secondsUntilExpiration: input.secondsUntilExpiration,
    claims: input.claims,
    description: input.description,
  })
}

function projectRecord(record: LocalE2EAgentKeyRecord, now: number): AgentAccessKeyRecord {
  return {
    id: record.id,
    name: record.name,
    subject: record.subject,
    revoked: record.revoked,
    expired: record.expiresAt <= now,
    claims: record.claims,
    scopes: record.scopes,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  }
}

function requireLocalBypass(): void {
  if (!isLocalE2EAuthBypassEnabled()) throw new Error('local_e2e_agent_key_unavailable')
}

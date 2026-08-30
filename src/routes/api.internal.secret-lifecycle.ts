import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { readTrimmedEnv, type StringEnvironment } from '@/lib/server/read-trimmed-env'
import { isRecord } from '@/modules/common/is-record'
import {
  InfisicalCloudSecretStore,
  ProductionSecretLifecycleService,
  SecretLifecycleError,
  VercelOidcIdentityTokenProvider,
  secretGeneration,
  secretRef,
  withEphemeralSecretMaterial,
  type SecretGenerationValidator,
  type SecretLifecycleJournal,
  type SecretLifecycleRecord,
  type SecretMaterialLease,
  type SecretPointer,
  type SecretPointerAdvanceRequest,
  type SecretPointerControl,
  type SecretRef,
  type SecretTarget,
} from '@/modules/secrets/public'
import { delegationGrantRef, delegationSnapshotRef } from '@/modules/authority/delegation/public'
import { accountRef, principalRef } from '@/modules/principal-account/public'

const MAX_BODY_BYTES = 256 * 1024
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/u
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u
const OPAQUE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u

type LifecycleAction = 'provision' | 'rotate' | 'reconcile'
type SecretLifecycleJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly SecretLifecycleJsonValue[]
  | Readonly<{ [key: string]: SecretLifecycleJsonValue }>
type SecretPointerAuthority = Readonly<{
  operation: LifecycleAction
  snapshotRef: ReturnType<typeof delegationSnapshotRef>
  accountRef: ReturnType<typeof accountRef>
  actorPrincipalRef: ReturnType<typeof principalRef>
  grantRef: string
  grantGeneration: number
  correlationRef: string
  idempotencyRef: string
  occurredAt: number
}>
type LifecycleRequest = Readonly<{
  action: LifecycleAction
  authority: SecretPointerAuthority
  secretRef: SecretRef
  idempotencyRef: string
  materialBase64?: string
}>

export const Route = createFileRoute('/api/internal/secret-lifecycle')({
  server: {
    handlers: {
      POST: ({ request }) => handleSecretLifecycleRequest(request),
      GET: () => methodNotAllowed(['POST']),
      PUT: () => methodNotAllowed(['POST']),
      PATCH: () => methodNotAllowed(['POST']),
      DELETE: () => methodNotAllowed(['POST']),
      HEAD: () => methodNotAllowed(['POST']),
      OPTIONS: () => methodNotAllowed(['POST']),
      TRACE: () => methodNotAllowed(['POST']),
      CONNECT: () => methodNotAllowed(['POST']),
    },
  },
})

function noStore(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length
    && expected.every((key) => Object.hasOwn(value, key))
}

function isJsonValue(value: unknown): value is SecretLifecycleJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isRecord(value) && Object.values(value).every(isJsonValue)
}

function parseLifecycleRecord(value: SecretLifecycleJsonValue): SecretLifecycleRecord | undefined {
  if (!isRecord(value)) return undefined
  const expected = value.previousGeneration === undefined
    ? ['operationRef', 'idempotencyRef', 'operation', 'secretRef', 'targetGeneration', 'previousRevision', 'state', 'createdAt', 'updatedAt']
    : ['operationRef', 'idempotencyRef', 'operation', 'secretRef', 'targetGeneration', 'previousGeneration', 'previousRevision', 'state', 'createdAt', 'updatedAt']
  if (!exactKeys(value, expected)
    || typeof value.operationRef !== 'string' || !OPAQUE_REF_PATTERN.test(value.operationRef)
    || typeof value.idempotencyRef !== 'string' || !OPAQUE_REF_PATTERN.test(value.idempotencyRef)
    || (value.operation !== 'provision' && value.operation !== 'rotate')
    || !['prepared', 'active', 'failed_validation', 'external_effect_unknown', 'pointer_conflict'].includes(String(value.state))
    || !Number.isSafeInteger(value.previousRevision) || Number(value.previousRevision) < 0
    || !Number.isSafeInteger(value.createdAt) || Number(value.createdAt) < 0
    || !Number.isSafeInteger(value.updatedAt) || Number(value.updatedAt) < Number(value.createdAt)) return undefined
  try {
    const previousGeneration = value.previousGeneration === undefined
      ? undefined
      : secretGeneration(String(value.previousGeneration))
    return Object.freeze({
      operationRef: value.operationRef,
      idempotencyRef: value.idempotencyRef,
      operation: value.operation,
      secretRef: secretRef(String(value.secretRef)),
      targetGeneration: secretGeneration(String(value.targetGeneration)),
      ...(previousGeneration === undefined ? {} : { previousGeneration }),
      previousRevision: Number(value.previousRevision),
      state: value.state as SecretLifecycleRecord['state'],
      createdAt: Number(value.createdAt),
      updatedAt: Number(value.updatedAt),
    })
  } catch {
    return undefined
  }
}

function required(environment: StringEnvironment, name: string): string {
  const value = readTrimmedEnv(environment, name)
  if (value === undefined) throw new TypeError('secret_lifecycle_configuration_invalid')
  return value
}

async function sha256(value: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(value).buffer))
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  let mismatch = left.byteLength ^ right.byteLength
  for (let index = 0; index < left.byteLength; index += 1) {
    mismatch |= left[index]! ^ (right[index] ?? 0)
  }
  return mismatch === 0
}

async function channelAuthenticated(request: Request, environment: StringEnvironment): Promise<boolean> {
  const authorization = request.headers.get('authorization')
  const supplied = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : undefined
  const configured = readTrimmedEnv(environment, 'AE_SECRET_LIFECYCLE_RPC_TOKEN')
  if (supplied === undefined || configured === undefined
    || !TOKEN_PATTERN.test(supplied) || !TOKEN_PATTERN.test(configured)) return false
  const encoder = new TextEncoder()
  return bytesEqual(await sha256(encoder.encode(supplied)), await sha256(encoder.encode(configured)))
}

async function readRequest(request: Request): Promise<LifecycleRequest | undefined> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return undefined
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return undefined
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return undefined
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!isRecord(value) || !['provision', 'rotate', 'reconcile'].includes(String(value.action))) return undefined
  const action = value.action as LifecycleAction
  const expected = action === 'reconcile'
    ? ['action', 'authority', 'secretRef', 'idempotencyRef']
    : ['action', 'authority', 'secretRef', 'idempotencyRef', 'materialBase64']
  if (!exactKeys(value, expected) || !isRecord(value.authority)) return undefined
  try {
    const authority = canonicalAuthority(value.authority)
    const canonicalSecretRef = secretRef(String(value.secretRef))
    const idempotencyRef = String(value.idempotencyRef)
    if (authority.operation !== action || authority.idempotencyRef !== idempotencyRef) return undefined
    if (action === 'reconcile') {
      return Object.freeze({ action, authority, secretRef: canonicalSecretRef, idempotencyRef })
    }
    if (typeof value.materialBase64 !== 'string'
      || value.materialBase64.length === 0
      || !BASE64_PATTERN.test(value.materialBase64)
      || !canonicalBase64(value.materialBase64)) return undefined
    return Object.freeze({
      action,
      authority,
      secretRef: canonicalSecretRef,
      idempotencyRef,
      materialBase64: value.materialBase64,
    })
  } catch {
    return undefined
  }
}

function canonicalBase64(value: string): boolean {
  const decoded = Buffer.from(value, 'base64')
  try {
    return decoded.byteLength > 0 && decoded.toString('base64') === value
  } finally {
    decoded.fill(0)
  }
}

function canonicalAuthority(value: Record<string, unknown>): SecretPointerAuthority {
  if (!exactKeys(value, [
    'operation', 'snapshotRef', 'accountRef', 'actorPrincipalRef', 'grantRef',
    'grantGeneration', 'correlationRef', 'idempotencyRef', 'occurredAt',
  ])) throw new TypeError('secret_lifecycle_authority_invalid')
  const operation = value.operation
  if (operation !== 'provision' && operation !== 'rotate' && operation !== 'reconcile') {
    throw new TypeError('secret_lifecycle_authority_invalid')
  }
  if (!Number.isSafeInteger(value.grantGeneration) || Number(value.grantGeneration) < 1
    || !Number.isSafeInteger(value.occurredAt) || Number(value.occurredAt) < 0
    || typeof value.correlationRef !== 'string' || !OPAQUE_REF_PATTERN.test(value.correlationRef)
    || typeof value.idempotencyRef !== 'string' || !OPAQUE_REF_PATTERN.test(value.idempotencyRef)) {
    throw new TypeError('secret_lifecycle_authority_invalid')
  }
  return Object.freeze({
    operation,
    snapshotRef: delegationSnapshotRef(String(value.snapshotRef)),
    accountRef: accountRef(String(value.accountRef)),
    actorPrincipalRef: principalRef(String(value.actorPrincipalRef)),
    grantRef: delegationGrantRef(String(value.grantRef)),
    grantGeneration: Number(value.grantGeneration),
    correlationRef: String(value.correlationRef),
    idempotencyRef: String(value.idempotencyRef),
    occurredAt: Number(value.occurredAt),
  })
}

function customerStore(environment: StringEnvironment): InfisicalCloudSecretStore {
  const organizationSlug = readTrimmedEnv(environment, 'AE_INFISICAL_CUSTOMER_ORGANIZATION_SLUG')
  return new InfisicalCloudSecretStore({
    baseUrl: required(environment, 'AE_INFISICAL_BASE_URL'),
    projectId: required(environment, 'AE_INFISICAL_CUSTOMER_PROJECT_ID'),
    environment: required(environment, 'AE_INFISICAL_CUSTOMER_ENVIRONMENT'),
    secretPath: required(environment, 'AE_INFISICAL_CUSTOMER_SECRET_PATH'),
    machineIdentityId: required(environment, 'AE_INFISICAL_CUSTOMER_MACHINE_IDENTITY_ID'),
    ...(organizationSlug === undefined ? {} : { organizationSlug }),
    identityTokenProvider: new VercelOidcIdentityTokenProvider(),
  })
}

function convexSiteOrigin(environment: StringEnvironment): string {
  const explicit = readTrimmedEnv(environment, 'CONVEX_SITE_URL')
  if (explicit !== undefined) {
    const url = new URL(explicit)
    if (url.protocol !== 'https:' || url.username.length > 0 || url.password.length > 0
      || !url.hostname.endsWith('.convex.site') || url.origin !== explicit) {
      throw new TypeError('secret_lifecycle_configuration_invalid')
    }
    return url.origin
  }
  const url = new URL(required(environment, 'CONVEX_URL'))
  if (url.protocol !== 'https:' || url.username.length > 0 || url.password.length > 0
    || !url.hostname.endsWith('.convex.cloud') || url.origin !== required(environment, 'CONVEX_URL')) {
    throw new TypeError('secret_lifecycle_configuration_invalid')
  }
  url.hostname = `${url.hostname.slice(0, -'.convex.cloud'.length)}.convex.site`
  return url.origin
}

async function rpc(
  environment: StringEnvironment,
  operation: string,
  args: Record<string, unknown>,
): Promise<SecretLifecycleJsonValue> {
  const { sendGuardedHttpRequest } = await import('@/modules/network-guard/server')
  const response = await sendGuardedHttpRequest(new Request(
    `${convexSiteOrigin(environment)}/internal/secret-lifecycle`,
    {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${required(environment, 'AE_SECRET_LIFECYCLE_RPC_TOKEN')}`,
    },
    body: JSON.stringify({ operation, args }),
    redirect: 'error',
    },
  ), 512 * 1024)
  const body: unknown = await response.json().catch(() => undefined)
  if (!response.ok || !isRecord(body) || body.kind !== 'ok' || !isJsonValue(body.result)) {
    throw new SecretLifecycleError('secret_lifecycle_ambiguous')
  }
  return body.result
}

function remotePersistence(environment: StringEnvironment, authority: SecretPointerAuthority): {
  journal: SecretLifecycleJournal
  pointerControl: SecretPointerControl
} {
  const call = async (operation: string, args: Record<string, unknown>) =>
    await rpc(environment, operation, { authority, ...args })
  const journal: SecretLifecycleJournal = Object.freeze({
    getByIdempotency: async (idempotencyRef) => {
      const result = await call('journal_read', { idempotencyRef })
      if (result === null) return undefined
      const record = parseLifecycleRecord(result)
      if (record === undefined) throw new SecretLifecycleError('secret_lifecycle_ambiguous')
      return record
    },
    insertPrepared: async (record) => { await call('journal_insert', { record }) },
    replace: async (record, expectedState) => {
      await call('journal_replace', { record, expectedState })
    },
  })
  const pointerControl: SecretPointerControl = Object.freeze({
    getActive: async (ref: SecretRef) => {
      const result = await call('pointer_read', { secretRef: ref })
      if (result === null) return undefined
      if (!isRecord(result)) throw new SecretLifecycleError('secret_lifecycle_ambiguous')
      return Object.freeze({
        secretRef: secretRef(String(result.secretRef)),
        activeGeneration: secretGeneration(String(result.activeGeneration)),
        revision: Number(result.revision),
      }) satisfies SecretPointer
    },
    initializeActive: async (target: SecretTarget) => {
      await call('pointer_initialize', {
        secretRef: target.secretRef,
        activeGeneration: target.generation,
      })
    },
    advanceActive: async (request: SecretPointerAdvanceRequest) => {
      await call('pointer_advance', {
        secretRef: request.secretRef,
        expectedActiveGeneration: request.expectedActiveGeneration,
        expectedRevision: request.expectedRevision,
        newGeneration: request.newGeneration,
      })
    },
  })
  return Object.freeze({ journal, pointerControl })
}

function exactMaterialValidator(expectedDigest: Uint8Array): SecretGenerationValidator {
  return Object.freeze({
    validate: async (_target: SecretTarget, lease: SecretMaterialLease) => {
      let actual: Uint8Array | undefined
      await lease.useBytes(async (bytes) => { actual = await sha256(bytes) })
      return actual !== undefined && bytesEqual(actual, expectedDigest)
    },
  })
}

function decodeMaterial(value: string): Uint8Array {
  const decoded = Buffer.from(value, 'base64')
  if (decoded.byteLength === 0 || decoded.toString('base64') !== value) {
    decoded.fill(0)
    throw new TypeError('secret_lifecycle_material_invalid')
  }
  return new Uint8Array(decoded.buffer, decoded.byteOffset, decoded.byteLength)
}

export async function handleSecretLifecycleRequest(
  request: Request,
  environment: StringEnvironment = process.env,
): Promise<Response> {
  if (!await channelAuthenticated(request, environment)) return noStore({ kind: 'unavailable' }, 401)
  const input = await readRequest(request)
  if (input === undefined) return noStore({ kind: 'unavailable' }, 400)
  try {
    const persistence = remotePersistence(environment, input.authority)
    if (input.action === 'reconcile') {
      const result = await new ProductionSecretLifecycleService({
        store: customerStore(environment),
        pointerControl: persistence.pointerControl,
        journal: persistence.journal,
        validator: exactMaterialValidator(new Uint8Array(32)),
      }).reconcile({ idempotencyRef: input.idempotencyRef })
      return noStore({ kind: 'active', result }, 200)
    }
    const materialBase64 = input.materialBase64
    if (materialBase64 === undefined) return noStore({ kind: 'unavailable' }, 400)
    const material = decodeMaterial(materialBase64)
    try {
      const expectedDigest = await sha256(material)
      const service = new ProductionSecretLifecycleService({
        store: customerStore(environment),
        pointerControl: persistence.pointerControl,
        journal: persistence.journal,
        validator: exactMaterialValidator(expectedDigest),
      })
      const materialSource = Object.freeze({
        withMaterial: async (operation: (lease: SecretMaterialLease) => Promise<void>) =>
          await withEphemeralSecretMaterial(material, operation),
      })
      const result = input.action === 'provision'
        ? await service.provision({
            secretRef: input.secretRef,
            idempotencyRef: input.idempotencyRef,
            materialSource,
          })
        : await service.rotate({
            secretRef: input.secretRef,
            idempotencyRef: input.idempotencyRef,
            materialSource,
          })
      return noStore({ kind: 'active', result }, 200)
    } finally {
      material.fill(0)
    }
  } catch (error) {
    const code = error instanceof SecretLifecycleError ? error.code : 'secret_lifecycle_ambiguous'
    return noStore({ kind: 'unavailable', code }, code === 'secret_lifecycle_conflict' ? 409 : 503)
  }
}

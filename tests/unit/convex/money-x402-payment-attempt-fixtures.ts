import {
  BASE_MAINNET_NETWORK,
  BASE_MAINNET_USDC_ADDRESS,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import type { StableHashValue } from '@/modules/common/stable-hash'

export type Row = Record<string, unknown> & { _id: string }
export type QueryBuilder = {
  eq: (field: string, value: unknown) => QueryBuilder
  lte: (field: string, value: unknown) => QueryBuilder
}
export type Query = {
  withIndex: (name: string, build: (query: QueryBuilder) => QueryBuilder) => Query
  unique: () => Promise<Row | null>
  take: (limit: number) => Promise<Row[]>
}
export type Db = {
  query: (table: string) => Query
  get: (id: string) => Promise<Row | null>
  insert: (table: string, value: Record<string, unknown>) => Promise<string>
  patch: (id: string, value: Record<string, unknown>) => Promise<void>
}
export type Handler = (
  ctx: {
    db: Db
    runMutation?: () => Promise<null>
    scheduler?: {
      runAt?: (timestamp: number, reference: unknown, args: Record<string, unknown>) => unknown
      runAfter?: (delayMs: number, reference: unknown, args: Record<string, unknown>) => unknown
    }
  },
  args: Record<string, unknown>,
) => Promise<unknown>
export type HandlerExport = { _handler: Handler }

export const AUTHORIZATION_EXPIRED_EVIDENCE_SOURCE =
  'x402_authorization_expired:provider_transaction_or_chain_nonce_evidence_required'

export const custodyRef = 'sha256:custody'
export const authorizationDigest = 'sha256:authorization'
export const fingerprint = 'sha256:request-one'
export const paymentIdentifier = 'ae_payment-one'
export const firstDigest = canonicalDigest('header:first')
export const secondDigest = canonicalDigest('header:second')
export const paymentPayer = '0x0000000000000000000000000000000000000001'
export const paymentNonce = `0x${'11'.repeat(32)}`
export const signingKey = '11111111-1111-4111-8111-111111111111'
export const paymentAuthorizationValidBefore = '999'
export const paymentAuthorizationExpiresAt = 999_000
export const quarantinedResponseDigest = canonicalDigest('paid-response')
export const quarantinedOutputJson = JSON.stringify({ result: 'usable-after-reconciliation' })

export const unsignedMaterial = {
  x402Version: 2,
  resource: { url: 'https://provider.example/pay' },
  accepted: {
    scheme: 'exact',
    network: BASE_MAINNET_NETWORK,
    amount: '1',
    asset: BASE_MAINNET_USDC_ADDRESS,
    payTo: '0xrecipient',
    maxTimeoutSeconds: 60,
    extra: { assetTransferMethod: 'eip3009' },
  },
  authorization: {
    from: paymentPayer,
    to: '0xrecipient',
    value: '1',
    validAfter: '0',
    validBefore: '999',
    nonce: paymentNonce,
  },
  typedData: {
    domain: { chainId: '8453' },
    types: { TransferWithAuthorization: [{ name: 'value', type: 'uint256' }] },
    primaryType: 'TransferWithAuthorization',
    message: { value: '1', validBefore: '999' },
  },
} as const

export const unsignedMaterialJson = stableStringify(unsignedMaterial as unknown as StableHashValue)
export const unsignedMaterialDigest = canonicalDigest(unsignedMaterial)

export function attempt(): Row {
  return {
    _id: `attempt-row:${Math.random()}`,
    dispatchRef: 'invocation:test',
    attemptRef: 'attempt:test',
    effectGeneration: 1,
    paymentIdentifier,
    operationKeyDigest: 'sha256:operation',
    challengeDigest: 'sha256:challenge',
    challengeJson: '{}',
    selectedRequirementJson: '{}',
    providerEndpoint: 'https://provider.example/pay',
    credentialRef: 'credential:test',
    scheme: 'exact',
    network: BASE_MAINNET_NETWORK,
    asset: BASE_MAINNET_USDC_ADDRESS,
    payTo: '0xrecipient',
    amountUnits: '1',
    currency: 'USDC',
    exponent: 6,
    custodyRef,
    authorizationDigest,
    requestFingerprint: fingerprint,
    state: 'prepared',
    preparedAt: 1,
    evidenceRefs: [],
  }
}

export const unsignedIdentityFields = {
  paymentUnsignedMaterialJson: unsignedMaterialJson,
  paymentUnsignedMaterialDigest: unsignedMaterialDigest,
  paymentSigningIdempotencyKey: signingKey,
  paymentPayer,
  paymentNonce,
  paymentAuthorizationValidBefore,
  paymentAuthorizationExpiresAt,
}

export function signedAttemptRow(overrides: Record<string, unknown> = {}): Row {
  return {
    ...attempt(),
    ...unsignedIdentityFields,
    paymentSignatureDigest: firstDigest,
    ...overrides,
  }
}

export function intentRowWithoutExpiresAt(): Row {
  return {
    ...attempt(),
    paymentUnsignedMaterialJson: unsignedMaterialJson,
    paymentUnsignedMaterialDigest: unsignedMaterialDigest,
    paymentSigningIdempotencyKey: signingKey,
    paymentPayer,
    paymentNonce,
    paymentAuthorizationValidBefore,
  }
}

export function attemptRowWithSigningClaim(
  paymentSigningClaimedAt: number,
  evidence: Record<string, unknown> = {},
): Row {
  return {
    ...attempt(),
    paymentSigningClaimedAt,
    ...evidence,
  }
}

export function memoryDbWithPayment(row: Row): MemoryDb {
  const db = new MemoryDb()
  db.seed(row)
  return db
}

export function paymentAndInvocationSnapshot(db: MemoryDb): string {
  return JSON.stringify({
    payments: db.rows('moneyX402PaymentAttempts'),
    invocations: db.rows('capabilityCalls'),
  })
}

export function authorizationFailureArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    dispatchRef: 'invocation:test',
    attemptRef: 'attempt:test',
    effectGeneration: 1,
    code: 'provider_authority_invalid',
    ...overrides,
  }
}

export function expiryPreparedPaymentRow(overrides: Record<string, unknown> = {}): Row {
  return {
    ...attempt(),
    toolRef: 'operation:test',
    inputDigest: 'sha256:input',
    reservationRef: 'reservation:test',
    paymentUnsignedMaterialJson: unsignedMaterialJson,
    paymentAuthorizationExpiresAt: 4_000,
    ...overrides,
  }
}

export function seedExpiryInvocationControl(
  db: MemoryDb,
  controlOverrides: Record<string, unknown> = {},
): void {
  db.seedTable('capabilityCalls', invocationRow())
  db.seedTable('actionExecutionControls', actionControlRow(controlOverrides))
}

export function seedExpiryQueuePair(
  db: MemoryDb,
  options: {
    suffix: string
    payment: Record<string, unknown>
  },
): void {
  const { suffix, payment } = options
  const invocationRef = `invocation:${suffix}`
  const attemptRef = `attempt:${suffix}`
  db.seed({
    ...attempt(),
    _id: `payment:${suffix}`,
    dispatchRef: invocationRef,
    attemptRef,
    custodyRef: `sha256:custody:${suffix}`,
    authorizationDigest: `sha256:authorization:${suffix}`,
    paymentUnsignedMaterialJson: unsignedMaterialJson,
    ...payment,
  })
  db.seedTable('capabilityCalls', invocationRow({
    callRef: invocationRef,
    attemptRef,
    principalId: `principal:${suffix}`,
    credentialId: `credential:${suffix}`,
  }))
  db.seedTable('actionExecutionControls', actionControlRow({
    executionRef: invocationRef,
    attemptRef,
  }))
}

export function expiryArgsForSuffix(suffix: string): Record<string, unknown> {
  return expiryArgs({
    callRef: `invocation:${suffix}`,
    principalId: `principal:${suffix}`,
    credentialId: `credential:${suffix}`,
    attemptRef: `attempt:${suffix}`,
    custodyRef: `sha256:custody:${suffix}`,
    authorizationDigest: `sha256:authorization:${suffix}`,
  })
}

export function seedPaymentObservationAttempt(
  db: MemoryDb,
  state: 'observed' | 'reconciliation_required',
  settlementStatus: 'settled' | 'unknown',
  completeness: 'complete' | 'missing-transport',
): Record<string, unknown> {
  const args = paymentObservationArgs({ settlementStatus })
  const base = {
    ...attempt(),
    state,
    toolRef: args.toolRef,
    inputDigest: args.inputDigest,
    settlementStatus,
    paymentResponseDigest: args.paymentResponseDigest,
    observedAt: completeness === 'complete' ? 1_000 : 900,
  }
  if (completeness === 'complete') {
    db.seed({
      ...base,
      paymentObservationDigest: args.paymentObservationDigest,
      transportObservationDigest: args.transportObservationDigest,
      transportRequestDigest: args.transportRequestDigest,
      ...(settlementStatus === 'unknown'
        ? { quarantinedResponseDigest, quarantinedOutputJson }
        : {}),
    })
  } else {
    db.seed(base)
  }
  return args
}

export function prepareArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    aeEnvironment: 'production',
    dispatchRef: 'invocation:test',
    attemptRef: 'attempt:test',
    effectGeneration: 1,
    toolRef: 'operation:test',
    inputDigest: 'sha256:input',
    paymentIdentifier,
    operationKeyDigest: 'sha256:operation',
    challengeDigest: 'sha256:challenge',
    challengeJson: '{}',
    selectedRequirementJson: '{}',
    providerEndpoint: 'https://provider.example/pay',
    credentialRef: 'credential:test',
    scheme: 'exact',
    network: BASE_MAINNET_NETWORK,
    asset: BASE_MAINNET_USDC_ADDRESS,
    payTo: '0xrecipient',
    amountUnits: '1',
    currency: 'USDC',
    exponent: 6,
    reservationRef: 'reservation:test',
    requestFingerprint: fingerprint,
    ...overrides,
  }
}

export function claimArgs(): Record<string, unknown> {
  return { custodyRef, authorizationDigest, requestFingerprint: fingerprint }
}

export function readArgs(): Record<string, unknown> {
  return { custodyRef, authorizationDigest, requestFingerprint: fingerprint }
}

export function intentArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    custodyRef,
    authorizationDigest,
    paymentUnsignedMaterialJson: unsignedMaterialJson,
    paymentUnsignedMaterialDigest: unsignedMaterialDigest,
    paymentSigningIdempotencyKey: signingKey,
    paymentPayer,
    paymentNonce,
    paymentAuthorizationValidBefore,
    paymentAuthorizationExpiresAt,
    requestFingerprint: fingerprint,
    ...overrides,
  }
}

export function digestArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    custodyRef,
    authorizationDigest,
    paymentSignatureDigest: firstDigest,
    paymentPayer,
    paymentNonce,
    requestFingerprint: fingerprint,
    ...overrides,
  }
}

export function eventArgs(): Record<string, unknown> {
  return {
    dispatchRef: 'invocation:test',
    attemptRef: 'attempt:test',
    effectGeneration: 1,
    paymentIdentifier,
    challengeDigest: 'sha256:challenge',
    scheme: 'exact',
    network: BASE_MAINNET_NETWORK,
    asset: BASE_MAINNET_USDC_ADDRESS,
    payTo: '0xrecipient',
    amountUnits: '1',
    currency: 'USDC',
    exponent: 6,
    providerEndpoint: 'https://provider.example/pay',
    custodyRef,
    authorizationDigest,
  }
}

export function observationArgs(): Record<string, unknown> {
  return {
    ...eventArgs(),
    state: 'observed',
    settlementStatus: 'settled',
    settlementDigest: 'sha256:settlement',
    evidenceRefs: ['evidence:receipt'],
  }
}

export function paymentObservationArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const settlementStatus = overrides.settlementStatus ?? 'settled'
  return {
    dispatchRef: 'invocation:test',
    attemptRef: 'attempt:test',
    effectGeneration: 1,
    paymentIdentifier,
      toolRef: 'operation:test',
    inputDigest: 'sha256:input',
    transportObservationDigest: 'sha256:transport-observation',
    transportRequestDigest: 'sha256:transport-request',
    paymentObservationDigest: 'sha256:payment-observation',
    settlementStatus,
    paymentResponseDigest: 'sha256:payment-response',
    ...(settlementStatus === 'unknown'
      ? { quarantinedResponseDigest, quarantinedOutputJson }
      : {}),
    observedAt: 2_000,
    ...overrides,
  }
}

export function reconciliationArgs(): Record<string, unknown> {
  return {
    dispatchRef: 'invocation:test',
    attemptRef: 'attempt:test',
    effectGeneration: 1,
    toolRef: 'operation:test',
    inputDigest: 'sha256:input',
    evidenceRef: 'evidence:x402-reconciliation',
    evidenceDigest: 'sha256:x402-reconciliation',
    reservationRef: 'reservation:test',
    paymentIdentifier,
    challengeDigest: 'sha256:challenge',
    settlementStatus: 'settled',
    amountUnits: '1',
    currency: 'USDC',
    exponent: 6,
    paymentResponseDigest: 'sha256:payment-response',
    transportObservationDigest: 'sha256:transport-observation',
    transportRequestDigest: 'sha256:transport-request',
    paymentObservationDigest: 'sha256:payment-observation',
    observedAt: 2_000,
  }
}

function reconciliationAuthorityRefs() {
  const principalId = `prn_${'2'.repeat(32)}`
  const ownerId = `acc_${'3'.repeat(32)}`
  const credentialId = `crd_${'4'.repeat(32)}`
  const grantRef = `grt_${'5'.repeat(32)}`
  const bindingRef = `eib_${'6'.repeat(32)}`
  const storedCredentialRef = `crd_${'7'.repeat(32)}`
  const expiresAt = 8_000_000_000_000
  return {
    principalId,
    ownerId,
    credentialId,
    grantRef,
    bindingRef,
    storedCredentialRef,
    expiresAt,
  }
}

export function seedReconciliationAuthority(
  db: MemoryDb,
  grantLifecycle: 'active' | 'revoked',
): void {
  const refs = reconciliationAuthorityRefs()
  db.seed({
    ...attempt(),
    state: 'reconciliation_required',
    toolRef: 'operation:test',
    inputDigest: 'sha256:input',
    reservationRef: 'reservation:test',
    transportObservationDigest: 'sha256:transport-observation',
    transportRequestDigest: 'sha256:transport-request',
    paymentObservationDigest: 'sha256:payment-observation',
    settlementStatus: 'unknown',
  })
  db.seedTable('capabilityCalls', invocationRow({
    principalId: refs.principalId,
    ownerId: refs.ownerId,
    credentialId: refs.credentialId,
    grantRef: refs.grantRef,
    grantExpiresAt: refs.expiresAt,
  }))
  const sharedGrant = {
    principalId: refs.principalId,
    ownerId: refs.ownerId,
    credentialId: refs.credentialId,
    applicationRef: 'application:test',
    environment: 'sandbox',
    expiresAt: refs.expiresAt,
  }
  db.seedTable('principals', {
    _id: 'principals:agent',
    principalRef: refs.principalId,
    kind: 'agent',
    lifecycle: 'active',
  })
  db.seedTable('accounts', {
    _id: 'accounts:owner',
    accountRef: refs.ownerId,
    lifecycle: 'active',
    currentOwnershipRef: `own_${'9'.repeat(32)}`,
  })
  db.seedTable('agentAccessPrincipals', {
    _id: 'agentAccessPrincipals:agent',
    ...sharedGrant,
    scopes: ['market_tools:call'],
    grantGeneration: 1,
    spendingPolicyDigest: 'sha256:policy',
    lifecycle: 'active',
  })
  db.seedTable('agentAccessGrants', {
    _id: 'agentAccessGrants:grant',
    grantRef: refs.grantRef,
    ...sharedGrant,
    generation: 1,
    policyDigest: 'sha256:policy',
    lifecycle: grantLifecycle,
  })
  db.seedTable('memberships', {
    _id: 'memberships:agent',
    accountRef: refs.ownerId,
    memberPrincipalRef: refs.principalId,
    lifecycle: 'active',
  })
  db.seedTable('externalIdentityBindings', {
    _id: 'externalIdentityBindings:agent',
    bindingRef: refs.bindingRef,
    principalRef: refs.principalId,
    providerNamespace: 'clerk/api-key',
    providerIdentifier: refs.credentialId,
    providerState: { kind: 'known', value: 'active' },
    lifecycle: 'active',
    credentialGeneration: 1,
  })
  db.seedTable('credentials', {
    _id: 'credentials:agent',
    credentialRef: refs.storedCredentialRef,
    bindingRef: refs.bindingRef,
    principalRef: refs.principalId,
    type: 'api_key',
    lifecycle: 'active',
    generation: 1,
    expiresAt: refs.expiresAt,
  })
  db.seedTable('authorityDelegationGrants', {
    _id: 'authorityDelegationGrants:grant',
    grantRef: refs.grantRef,
    accountRef: refs.ownerId,
    actorPrincipalRef: refs.principalId,
    subjectPrincipalRef: refs.principalId,
    scopes: ['market_tools:call'],
    resourceRefs: ['operation:test'],
    budgetLimit: 1_000,
    budgetUsed: 0,
    expiresAt: refs.expiresAt,
    generation: 1,
    revision: 1,
    lifecycle: grantLifecycle,
    createdAt: 1,
  })
}

export function invocationRow(overrides: Record<string, unknown> = {}): Row {
  return {
    _id: 'invocation:row',
    callRef: 'invocation:test',
    principalId: 'principal:test',
    ownerId: 'owner:test',
    credentialId: 'credential:test',
    applicationRef: 'application:test',
    toolRef: 'operation:test',
    idempotencyKey: 'idempotency:test',
    environment: 'sandbox',
    grantRef: 'grant:test',
    grantGeneration: 1,
    policyDigest: 'sha256:policy',
    grantExpiresAt: 99_999,
    inputDigest: 'sha256:input',
    requestDigest: 'sha256:request',
    state: 'pending',
    dispatchState: 'running',
    attemptRef: 'attempt:test',
    updatedAt: 1,
    createdAt: 1,
    ...overrides,
  }
}

export function expiryArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    callRef: 'invocation:test',
    principalId: 'principal:test',
    credentialId: 'credential:test',
    attemptRef: 'attempt:test',
    effectGeneration: 1,
    custodyRef,
    authorizationDigest,
    reservationRef: 'reservation:test',
    nativeTransition: 'applied',
    controlExecutionVersion: 2,
    observedControlState: 'leased',
    now: 5_000,
    ...overrides,
  }
}

export function actionControlRow(overrides: Record<string, unknown> = {}): Row {
  const executionRef = String(overrides.executionRef ?? 'invocation:test')
  const attemptRef = String(overrides.attemptRef ?? 'attempt:test')
  const executionVersion = Number(overrides.executionVersion ?? 2)
  return {
    _id: `control:${executionRef}`,
    executionRef,
    executionVersion,
    control: {
      executionRef,
      executionVersion,
      control: { state: 'reconciliation_required', attemptRef },
    },
    currentAttemptRef: attemptRef,
    currentEffectGeneration: 1,
    ...overrides,
  }
}

export class MemoryDb implements Db {
  private readonly tables = new Map<string, Row[]>()
  private throwAfterNextPatch = false
  private nextId = 1
  readonly indexCalls: string[] = []
  readonly patchCalls: Array<{ id: string; value: Record<string, unknown> }> = []

  seed(row: Row): void {
    this.seedTable('moneyX402PaymentAttempts', row)
  }

  seedTable(table: string, row: Row): void {
    const rows = this.tables.get(table) ?? []
    this.tables.set(table, [...rows, row])
  }

  rows(table: string): Row[] {
    return [...(this.tables.get(table) ?? [])]
  }

  loseAcknowledgementAfterNextPatch(): void {
    this.throwAfterNextPatch = true
  }

  async insert(table: string, value: Record<string, unknown>): Promise<string> {
    const id = `${table}:row:${this.nextId++}`
    const rows = this.tables.get(table) ?? []
    this.tables.set(table, [...rows, { ...value, _id: id } as Row])
    return id
  }

  // Synthetic IDs are not Convex table IDs; indexed behavior is tested here.
  normalizeId(_table: string, _id: string): null { return null }

  async get(tableOrId: string, explicitId?: string): Promise<Row | null> {
    const id = explicitId ?? tableOrId
    for (const rows of this.tables.values()) {
      const row = rows.find((candidate) => candidate._id === id)
      if (row !== undefined) return row
    }
    return null
  }

  query(table: string): Query {
    const filters: Array<(row: Row) => boolean> = []
    const query: Query = {
      withIndex: (name, build) => {
        this.indexCalls.push(name)
        const builder: QueryBuilder = {
          eq: (field, value) => {
            filters.push((row) => row[field] === value)
            return builder
          },
          lte: (field, value) => {
            filters.push((row) => (
              typeof row[field] === 'number'
              && typeof value === 'number'
              && row[field] <= value
            ))
            return builder
          },
        }
        build(builder)
        return query
      },
      unique: async () => {
        const matches = (this.tables.get(table) ?? []).filter((row) => filters.every((filter) => filter(row)))
        if (matches.length > 1) throw new Error('expected_unique')
        return matches[0] ?? null
      },
      take: async (limit) => (this.tables.get(table) ?? [])
        .filter((row) => filters.every((filter) => filter(row)))
        .slice(0, limit),
    }
    return query
  }

  async patch(id: string, value: Record<string, unknown>): Promise<void> {
    for (const rows of this.tables.values()) {
      const row = rows.find((candidate) => candidate._id === id)
      if (row === undefined) continue
      this.patchCalls.push({ id, value })
      for (const [key, next] of Object.entries(value)) {
        if (next === undefined) delete row[key]
        else row[key] = next
      }
      if (this.throwAfterNextPatch) {
        this.throwAfterNextPatch = false
        throw new Error('acknowledgement_lost')
      }
      return
    }
    throw new Error(`missing_row:${id}`)
  }
}
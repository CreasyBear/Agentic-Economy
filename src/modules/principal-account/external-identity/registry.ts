import {
  principalRef,
  type Principal,
  type PrincipalRef,
} from '../principal/public'

const BINDING_REF_PATTERN = /^eib_[0-9a-f]{32}$/u
const CREDENTIAL_REF_PATTERN = /^crd_[0-9a-f]{32}$/u
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const PROVIDER_NAMESPACE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?(?:\/[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?)*$/u
const OPAQUE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,499}$/u
const IDEMPOTENCY_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u

declare const externalIdentityBindingRefBrand: unique symbol
declare const credentialRefBrand: unique symbol

export type ExternalIdentityBindingRef = string & Readonly<{
  [externalIdentityBindingRefBrand]: 'ExternalIdentityBindingRef'
}>
export type CredentialRef = string & Readonly<{ [credentialRefBrand]: 'CredentialRef' }>

export const EXTERNAL_IDENTITY_BINDING_LIFECYCLES = ['active', 'revoked'] as const
export type ExternalIdentityBindingLifecycle = typeof EXTERNAL_IDENTITY_BINDING_LIFECYCLES[number]

export const KNOWN_EXTERNAL_PROVIDER_STATES = ['active', 'disabled', 'revoked'] as const
export type KnownExternalProviderState = typeof KNOWN_EXTERNAL_PROVIDER_STATES[number]
export type ExternalProviderState =
  | Readonly<{ kind: 'known'; value: KnownExternalProviderState }>
  | Readonly<{ kind: 'unknown'; value: string }>

export const CREDENTIAL_TYPES = ['provider_token', 'api_key', 'workload_assertion'] as const
export type CredentialType = typeof CREDENTIAL_TYPES[number]

export const CREDENTIAL_LIFECYCLES = ['active', 'stale', 'revoked'] as const
export type CredentialLifecycle = typeof CREDENTIAL_LIFECYCLES[number]

export type ExternalIdentityBinding = Readonly<{
  bindingRef: ExternalIdentityBindingRef
  principalRef: PrincipalRef
  providerNamespace: string
  providerIdentifier: string
  providerState: ExternalProviderState
  lifecycle: ExternalIdentityBindingLifecycle
  credentialGeneration: number
  bindIdempotencyRef: string
  revision: number
  createdAt: number
  updatedAt: number
  revokedAt?: number
}>

export type Credential = Readonly<{
  credentialRef: CredentialRef
  bindingRef: ExternalIdentityBindingRef
  principalRef: PrincipalRef
  type: CredentialType
  lifecycle: CredentialLifecycle
  generation: number
  issueIdempotencyRef: string
  revision: number
  issuedAt: number
  expiresAt: number
  updatedAt: number
  predecessorCredentialRef?: CredentialRef
  staleAt?: number
  revokedAt?: number
}>

export type AuthenticatedExternalIdentity = Readonly<{
  principalRef: PrincipalRef
  bindingRef: ExternalIdentityBindingRef
  credentialRef: CredentialRef
  credentialType: CredentialType
  generation: number
}>

export type ExternalIdentityRegistryErrorCode =
  | 'credential_binding_mismatch'
  | 'credential_expired'
  | 'credential_generation_mismatch'
  | 'credential_idempotency_conflict'
  | 'credential_lifecycle_forbidden'
  | 'credential_not_found'
  | 'credential_principal_mismatch'
  | 'credential_ref_conflict'
  | 'credential_ref_invalid'
  | 'credential_revision_conflict'
  | 'credential_stale'
  | 'credential_timestamp_invalid'
  | 'credential_type_invalid'
  | 'external_identity_binding_collision'
  | 'external_identity_binding_idempotency_conflict'
  | 'external_identity_binding_not_found'
  | 'external_identity_binding_ref_conflict'
  | 'external_identity_binding_ref_invalid'
  | 'external_identity_binding_revoked'
  | 'external_identity_binding_revision_conflict'
  | 'external_identity_provider_identifier_invalid'
  | 'external_identity_provider_namespace_invalid'
  | 'external_identity_provider_state_invalid'
  | 'external_identity_provider_state_untrusted'
  | 'idempotency_ref_invalid'
  | 'principal_inactive'
  | 'principal_not_found'

export class ExternalIdentityRegistryError extends Error {
  readonly code: ExternalIdentityRegistryErrorCode

  constructor(code: ExternalIdentityRegistryErrorCode) {
    super(code)
    this.name = 'ExternalIdentityRegistryError'
    this.code = code
  }
}

export type RevisionedExternalIdentityReplacement<Value> = Readonly<{
  value: Value
  expectedRevision: number
}>

export type ExternalIdentityRegistryCommit = Readonly<{
  bindingInsert?: ExternalIdentityBinding
  bindingReplacement?: RevisionedExternalIdentityReplacement<ExternalIdentityBinding>
  credentialInsert?: Credential
  credentialReplacement?: RevisionedExternalIdentityReplacement<Credential>
}>

export type ExternalIdentityRegistryTransaction = Readonly<{
  getPrincipal(ref: PrincipalRef): Promise<Principal | undefined>
  getBinding(ref: ExternalIdentityBindingRef): Promise<ExternalIdentityBinding | undefined>
  getBindingByProviderIdentifier(
    providerNamespace: string,
    providerIdentifier: string,
  ): Promise<ExternalIdentityBinding | undefined>
  getBindingByIdempotency(
    principalRef: PrincipalRef,
    idempotencyRef: string,
  ): Promise<ExternalIdentityBinding | undefined>
  getCredential(ref: CredentialRef): Promise<Credential | undefined>
  getCredentialByIdempotency(
    principalRef: PrincipalRef,
    idempotencyRef: string,
  ): Promise<Credential | undefined>
  commit(change: ExternalIdentityRegistryCommit): Promise<void>
}>

export type ExternalIdentityRegistryStore = Readonly<{
  transact<Result>(
    operation: (transaction: ExternalIdentityRegistryTransaction) => Promise<Result>,
  ): Promise<Result>
}>

export type ExternalIdentityRegistryOptions = Readonly<{
  now?: () => number
  randomUuid?: () => string
}>

export function externalIdentityBindingRef(value: string): ExternalIdentityBindingRef {
  if (!BINDING_REF_PATTERN.test(value)) {
    throw new ExternalIdentityRegistryError('external_identity_binding_ref_invalid')
  }
  return value as ExternalIdentityBindingRef
}

export function credentialRef(value: string): CredentialRef {
  if (!CREDENTIAL_REF_PATTERN.test(value)) {
    throw new ExternalIdentityRegistryError('credential_ref_invalid')
  }
  return value as CredentialRef
}

export function generateExternalIdentityBindingRef(
  randomUuid: () => string = () => globalThis.crypto.randomUUID(),
): ExternalIdentityBindingRef {
  return externalIdentityBindingRef(prefixedUuid('eib', randomUuid))
}

export function generateCredentialRef(
  randomUuid: () => string = () => globalThis.crypto.randomUUID(),
): CredentialRef {
  return credentialRef(prefixedUuid('crd', randomUuid))
}

export function externalProviderState(value: string): ExternalProviderState {
  const validValue = validProviderState(value)
  if ((KNOWN_EXTERNAL_PROVIDER_STATES as readonly string[]).includes(validValue)) {
    return Object.freeze({ kind: 'known', value: validValue as KnownExternalProviderState })
  }
  return Object.freeze({ kind: 'unknown', value: validValue })
}

export class ExternalIdentityRegistry {
  readonly #store: ExternalIdentityRegistryStore
  readonly #now: () => number
  readonly #randomUuid: () => string

  constructor(store: ExternalIdentityRegistryStore, options: ExternalIdentityRegistryOptions = {}) {
    this.#store = store
    this.#now = options.now ?? (() => Date.now())
    this.#randomUuid = options.randomUuid ?? (() => globalThis.crypto.randomUUID())
  }

  async bind(input: Readonly<{
    principalRef: PrincipalRef
    providerNamespace: string
    providerIdentifier: string
    providerState: string
    idempotencyRef: string
  }>): Promise<ExternalIdentityBinding> {
    const canonicalPrincipalRef = principalRef(input.principalRef)
    const providerNamespace = validProviderNamespace(input.providerNamespace)
    const providerIdentifier = validProviderIdentifier(input.providerIdentifier)
    const providerState = externalProviderState(input.providerState)
    const idempotencyRef = validIdempotencyRef(input.idempotencyRef)

    return await this.#store.transact(async (transaction) => {
      const replay = await transaction.getBindingByIdempotency(canonicalPrincipalRef, idempotencyRef)
      if (replay !== undefined) {
        if (
          replay.providerNamespace !== providerNamespace
          || replay.providerIdentifier !== providerIdentifier
          || !sameProviderState(replay.providerState, providerState)
        ) {
          throw new ExternalIdentityRegistryError('external_identity_binding_idempotency_conflict')
        }
        return replay
      }

      await requireCanonicalActivePrincipal(transaction, canonicalPrincipalRef)
      const collision = await transaction.getBindingByProviderIdentifier(
        providerNamespace,
        providerIdentifier,
      )
      if (collision !== undefined) {
        throw new ExternalIdentityRegistryError('external_identity_binding_collision')
      }

      const timestamp = validTimestamp(this.#now())
      const binding = freezeBinding({
        bindingRef: generateExternalIdentityBindingRef(this.#randomUuid),
        principalRef: canonicalPrincipalRef,
        providerNamespace,
        providerIdentifier,
        providerState,
        lifecycle: 'active',
        credentialGeneration: 1,
        bindIdempotencyRef: idempotencyRef,
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      if (await transaction.getBinding(binding.bindingRef) !== undefined) {
        throw new ExternalIdentityRegistryError('external_identity_binding_ref_conflict')
      }
      await transaction.commit({ bindingInsert: binding })
      return binding
    })
  }

  async issueCredential(input: Readonly<{
    bindingRef: ExternalIdentityBindingRef
    principalRef: PrincipalRef
    expectedBindingRevision: number
    type: CredentialType
    expiresAt: number
    idempotencyRef: string
  }>): Promise<Credential> {
    const bindingRef = externalIdentityBindingRef(input.bindingRef)
    const canonicalPrincipalRef = principalRef(input.principalRef)
    const type = validCredentialType(input.type)
    const expiresAt = validTimestamp(input.expiresAt)
    const idempotencyRef = validIdempotencyRef(input.idempotencyRef)

    return await this.#store.transact(async (transaction) => {
      const replay = await transaction.getCredentialByIdempotency(canonicalPrincipalRef, idempotencyRef)
      if (replay !== undefined) {
        if (
          replay.bindingRef !== bindingRef
          || replay.type !== type
          || replay.expiresAt !== expiresAt
          || replay.predecessorCredentialRef !== undefined
        ) {
          throw new ExternalIdentityRegistryError('credential_idempotency_conflict')
        }
        return replay
      }

      const binding = await requiredActiveBinding(transaction, bindingRef)
      assertBindingPrincipal(binding, canonicalPrincipalRef)
      assertBindingRevision(binding, input.expectedBindingRevision)
      await requireCanonicalActivePrincipal(transaction, canonicalPrincipalRef)
      assertTrustedProviderState(binding.providerState)
      const issuedAt = validTimestamp(this.#now())
      assertFutureExpiry(expiresAt, issuedAt)
      const credential = await this.#newCredential(transaction, {
        binding,
        type,
        issuedAt,
        expiresAt,
        idempotencyRef,
      })
      await transaction.commit({ credentialInsert: credential })
      return credential
    })
  }

  async rotateCredential(input: Readonly<{
    credentialRef: CredentialRef
    bindingRef: ExternalIdentityBindingRef
    principalRef: PrincipalRef
    expectedCredentialRevision: number
    expectedBindingRevision: number
    type: CredentialType
    expiresAt: number
    idempotencyRef: string
  }>): Promise<Readonly<{ binding: ExternalIdentityBinding; previous: Credential; current: Credential }>> {
    const priorRef = credentialRef(input.credentialRef)
    const bindingRef = externalIdentityBindingRef(input.bindingRef)
    const canonicalPrincipalRef = principalRef(input.principalRef)
    const type = validCredentialType(input.type)
    const expiresAt = validTimestamp(input.expiresAt)
    const idempotencyRef = validIdempotencyRef(input.idempotencyRef)

    return await this.#store.transact(async (transaction) => {
      const replay = await transaction.getCredentialByIdempotency(canonicalPrincipalRef, idempotencyRef)
      if (replay !== undefined) {
        if (
          replay.bindingRef !== bindingRef
          || replay.predecessorCredentialRef !== priorRef
          || replay.type !== type
          || replay.expiresAt !== expiresAt
        ) {
          throw new ExternalIdentityRegistryError('credential_idempotency_conflict')
        }
        const replayBinding = await requiredActiveBinding(transaction, bindingRef)
        const replayPrevious = await requiredCredential(transaction, priorRef)
        if (replay.generation !== replayBinding.credentialGeneration) {
          throw new ExternalIdentityRegistryError('credential_generation_mismatch')
        }
        return Object.freeze({ binding: replayBinding, previous: replayPrevious, current: replay })
      }

      const binding = await requiredActiveBinding(transaction, bindingRef)
      const previous = await requiredCredential(transaction, priorRef)
      assertBindingPrincipal(binding, canonicalPrincipalRef)
      assertCredentialPrincipal(previous, canonicalPrincipalRef)
      if (previous.bindingRef !== bindingRef) {
        throw new ExternalIdentityRegistryError('credential_binding_mismatch')
      }
      assertBindingRevision(binding, input.expectedBindingRevision)
      assertCredentialRevision(previous, input.expectedCredentialRevision)
      if (previous.lifecycle !== 'active') {
        throw new ExternalIdentityRegistryError(
          previous.lifecycle === 'stale' ? 'credential_stale' : 'credential_lifecycle_forbidden',
        )
      }
      if (previous.generation !== binding.credentialGeneration) {
        throw new ExternalIdentityRegistryError('credential_stale')
      }
      await requireCanonicalActivePrincipal(transaction, canonicalPrincipalRef)
      assertTrustedProviderState(binding.providerState)
      const timestamp = validTimestamp(this.#now())
      assertMonotonicTimestamp(timestamp, Math.max(binding.updatedAt, previous.updatedAt))
      assertFutureExpiry(expiresAt, timestamp)

      const updatedBinding = freezeBinding({
        ...binding,
        credentialGeneration: binding.credentialGeneration + 1,
        revision: binding.revision + 1,
        updatedAt: timestamp,
      })
      const stalePrevious = freezeCredential({
        ...previous,
        lifecycle: 'stale',
        staleAt: timestamp,
        revision: previous.revision + 1,
        updatedAt: timestamp,
      })
      const current = await this.#newCredential(transaction, {
        binding: updatedBinding,
        type,
        issuedAt: timestamp,
        expiresAt,
        idempotencyRef,
        predecessorCredentialRef: previous.credentialRef,
      })
      await transaction.commit({
        bindingReplacement: { value: updatedBinding, expectedRevision: binding.revision },
        credentialReplacement: { value: stalePrevious, expectedRevision: previous.revision },
        credentialInsert: current,
      })
      return Object.freeze({ binding: updatedBinding, previous: stalePrevious, current })
    })
  }

  async revokeCredential(input: Readonly<{
    credentialRef: CredentialRef
    principalRef: PrincipalRef
    expectedRevision: number
  }>): Promise<Credential> {
    const ref = credentialRef(input.credentialRef)
    const canonicalPrincipalRef = principalRef(input.principalRef)
    return await this.#store.transact(async (transaction) => {
      const credential = await requiredCredential(transaction, ref)
      assertCredentialPrincipal(credential, canonicalPrincipalRef)
      assertCredentialRevision(credential, input.expectedRevision)
      if (credential.lifecycle === 'revoked') return credential
      if (credential.lifecycle !== 'active') {
        throw new ExternalIdentityRegistryError('credential_lifecycle_forbidden')
      }
      const timestamp = validTimestamp(this.#now())
      assertMonotonicTimestamp(timestamp, credential.updatedAt)
      const revoked = freezeCredential({
        ...credential,
        lifecycle: 'revoked',
        revokedAt: timestamp,
        revision: credential.revision + 1,
        updatedAt: timestamp,
      })
      await transaction.commit({
        credentialReplacement: { value: revoked, expectedRevision: credential.revision },
      })
      return revoked
    })
  }

  async setProviderState(input: Readonly<{
    bindingRef: ExternalIdentityBindingRef
    principalRef: PrincipalRef
    expectedRevision: number
    providerState: string
  }>): Promise<ExternalIdentityBinding> {
    const ref = externalIdentityBindingRef(input.bindingRef)
    const canonicalPrincipalRef = principalRef(input.principalRef)
    const providerState = externalProviderState(input.providerState)
    return await this.#store.transact(async (transaction) => {
      const binding = await requiredActiveBinding(transaction, ref)
      assertBindingPrincipal(binding, canonicalPrincipalRef)
      assertBindingRevision(binding, input.expectedRevision)
      if (sameProviderState(binding.providerState, providerState)) return binding
      const timestamp = validTimestamp(this.#now())
      assertMonotonicTimestamp(timestamp, binding.updatedAt)
      const updated = freezeBinding({
        ...binding,
        providerState,
        revision: binding.revision + 1,
        updatedAt: timestamp,
      })
      await transaction.commit({
        bindingReplacement: { value: updated, expectedRevision: binding.revision },
      })
      return updated
    })
  }

  async revokeBinding(input: Readonly<{
    bindingRef: ExternalIdentityBindingRef
    principalRef: PrincipalRef
    expectedRevision: number
  }>): Promise<ExternalIdentityBinding> {
    const ref = externalIdentityBindingRef(input.bindingRef)
    const canonicalPrincipalRef = principalRef(input.principalRef)
    return await this.#store.transact(async (transaction) => {
      const binding = await requiredBinding(transaction, ref)
      assertBindingPrincipal(binding, canonicalPrincipalRef)
      assertBindingRevision(binding, input.expectedRevision)
      if (binding.lifecycle === 'revoked') return binding
      const timestamp = validTimestamp(this.#now())
      assertMonotonicTimestamp(timestamp, binding.updatedAt)
      const revoked = freezeBinding({
        ...binding,
        lifecycle: 'revoked',
        revokedAt: timestamp,
        revision: binding.revision + 1,
        updatedAt: timestamp,
      })
      await transaction.commit({
        bindingReplacement: { value: revoked, expectedRevision: binding.revision },
      })
      return revoked
    })
  }

  async authenticate(input: Readonly<{
    credentialRef: CredentialRef
    bindingRef: ExternalIdentityBindingRef
    principalRef: PrincipalRef
    generation: number
  }>): Promise<AuthenticatedExternalIdentity> {
    const ref = credentialRef(input.credentialRef)
    const bindingRef = externalIdentityBindingRef(input.bindingRef)
    const canonicalPrincipalRef = principalRef(input.principalRef)
    return await this.#store.transact(async (transaction) => {
      const credential = await requiredCredential(transaction, ref)
      const binding = await requiredActiveBinding(transaction, bindingRef)
      assertCredentialPrincipal(credential, canonicalPrincipalRef)
      assertBindingPrincipal(binding, canonicalPrincipalRef)
      if (credential.bindingRef !== binding.bindingRef) {
        throw new ExternalIdentityRegistryError('credential_binding_mismatch')
      }
      if (credential.lifecycle !== 'active') {
        throw new ExternalIdentityRegistryError(
          credential.lifecycle === 'stale' ? 'credential_stale' : 'credential_lifecycle_forbidden',
        )
      }
      if (input.generation !== credential.generation || input.generation !== binding.credentialGeneration) {
        throw new ExternalIdentityRegistryError('credential_generation_mismatch')
      }
      const collisionBinding = await transaction.getBindingByProviderIdentifier(
        binding.providerNamespace,
        binding.providerIdentifier,
      )
      if (collisionBinding?.bindingRef !== binding.bindingRef) {
        throw new ExternalIdentityRegistryError('external_identity_binding_collision')
      }
      assertTrustedProviderState(binding.providerState)
      await requireCanonicalActivePrincipal(transaction, canonicalPrincipalRef)
      if (validTimestamp(this.#now()) >= credential.expiresAt) {
        throw new ExternalIdentityRegistryError('credential_expired')
      }
      return Object.freeze({
        principalRef: canonicalPrincipalRef,
        bindingRef: binding.bindingRef,
        credentialRef: credential.credentialRef,
        credentialType: credential.type,
        generation: credential.generation,
      })
    })
  }

  async #newCredential(
    transaction: ExternalIdentityRegistryTransaction,
    input: Readonly<{
      binding: ExternalIdentityBinding
      type: CredentialType
      issuedAt: number
      expiresAt: number
      idempotencyRef: string
      predecessorCredentialRef?: CredentialRef
    }>,
  ): Promise<Credential> {
    const ref = generateCredentialRef(this.#randomUuid)
    if (await transaction.getCredential(ref) !== undefined) {
      throw new ExternalIdentityRegistryError('credential_ref_conflict')
    }
    return freezeCredential({
      credentialRef: ref,
      bindingRef: input.binding.bindingRef,
      principalRef: input.binding.principalRef,
      type: input.type,
      lifecycle: 'active',
      generation: input.binding.credentialGeneration,
      issueIdempotencyRef: input.idempotencyRef,
      revision: 1,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      updatedAt: input.issuedAt,
      ...(input.predecessorCredentialRef === undefined
        ? {}
        : { predecessorCredentialRef: input.predecessorCredentialRef }),
    })
  }
}

function prefixedUuid(prefix: 'eib' | 'crd', randomUuid: () => string): string {
  const uuid = randomUuid()
  if (!UUID_PATTERN.test(uuid)) {
    throw new ExternalIdentityRegistryError(
      prefix === 'eib' ? 'external_identity_binding_ref_invalid' : 'credential_ref_invalid',
    )
  }
  return `${prefix}_${uuid.replaceAll('-', '')}`
}

function validProviderNamespace(value: string): string {
  if (!PROVIDER_NAMESPACE_PATTERN.test(value)) {
    throw new ExternalIdentityRegistryError('external_identity_provider_namespace_invalid')
  }
  return value
}

function validProviderIdentifier(value: string): string {
  if (!OPAQUE_REF_PATTERN.test(value)) {
    throw new ExternalIdentityRegistryError('external_identity_provider_identifier_invalid')
  }
  return value
}

function validProviderState(value: string): string {
  if (!OPAQUE_REF_PATTERN.test(value)) {
    throw new ExternalIdentityRegistryError('external_identity_provider_state_invalid')
  }
  return value
}

function validIdempotencyRef(value: string): string {
  if (!IDEMPOTENCY_REF_PATTERN.test(value)) {
    throw new ExternalIdentityRegistryError('idempotency_ref_invalid')
  }
  return value
}

function validCredentialType(value: CredentialType): CredentialType {
  if (!(CREDENTIAL_TYPES as readonly string[]).includes(value)) {
    throw new ExternalIdentityRegistryError('credential_type_invalid')
  }
  return value
}

function validTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ExternalIdentityRegistryError('credential_timestamp_invalid')
  }
  return value
}

function assertFutureExpiry(expiresAt: number, issuedAt: number): void {
  if (expiresAt <= issuedAt) throw new ExternalIdentityRegistryError('credential_timestamp_invalid')
}

function assertMonotonicTimestamp(value: number, prior: number): void {
  if (value < prior) throw new ExternalIdentityRegistryError('credential_timestamp_invalid')
}

function assertBindingRevision(binding: ExternalIdentityBinding, expectedRevision: number): void {
  if (binding.revision !== expectedRevision) {
    throw new ExternalIdentityRegistryError('external_identity_binding_revision_conflict')
  }
}

function assertCredentialRevision(credential: Credential, expectedRevision: number): void {
  if (credential.revision !== expectedRevision) {
    throw new ExternalIdentityRegistryError('credential_revision_conflict')
  }
}

function assertBindingPrincipal(binding: ExternalIdentityBinding, expected: PrincipalRef): void {
  if (binding.principalRef !== expected) {
    throw new ExternalIdentityRegistryError('credential_principal_mismatch')
  }
}

function assertCredentialPrincipal(credential: Credential, expected: PrincipalRef): void {
  if (credential.principalRef !== expected) {
    throw new ExternalIdentityRegistryError('credential_principal_mismatch')
  }
}

function assertTrustedProviderState(state: ExternalProviderState): void {
  if (state.kind !== 'known' || state.value !== 'active') {
    throw new ExternalIdentityRegistryError('external_identity_provider_state_untrusted')
  }
}

function sameProviderState(left: ExternalProviderState, right: ExternalProviderState): boolean {
  return left.kind === right.kind && left.value === right.value
}

async function requireCanonicalActivePrincipal(
  transaction: ExternalIdentityRegistryTransaction,
  ref: PrincipalRef,
): Promise<Principal> {
  const principal = await transaction.getPrincipal(ref)
  if (principal === undefined) throw new ExternalIdentityRegistryError('principal_not_found')
  if (principal.lifecycle !== 'active') throw new ExternalIdentityRegistryError('principal_inactive')
  return principal
}

async function requiredBinding(
  transaction: ExternalIdentityRegistryTransaction,
  ref: ExternalIdentityBindingRef,
): Promise<ExternalIdentityBinding> {
  const binding = await transaction.getBinding(ref)
  if (binding === undefined) {
    throw new ExternalIdentityRegistryError('external_identity_binding_not_found')
  }
  return binding
}

async function requiredActiveBinding(
  transaction: ExternalIdentityRegistryTransaction,
  ref: ExternalIdentityBindingRef,
): Promise<ExternalIdentityBinding> {
  const binding = await requiredBinding(transaction, ref)
  if (binding.lifecycle !== 'active') {
    throw new ExternalIdentityRegistryError('external_identity_binding_revoked')
  }
  return binding
}

async function requiredCredential(
  transaction: ExternalIdentityRegistryTransaction,
  ref: CredentialRef,
): Promise<Credential> {
  const credential = await transaction.getCredential(ref)
  if (credential === undefined) throw new ExternalIdentityRegistryError('credential_not_found')
  return credential
}

function freezeBinding(binding: ExternalIdentityBinding): ExternalIdentityBinding {
  return Object.freeze(binding)
}

function freezeCredential(credential: Credential): Credential {
  return Object.freeze(credential)
}

import { describe, expect, it } from 'vitest'

import {
  CREDENTIAL_LIFECYCLES,
  CREDENTIAL_TYPES,
  EXTERNAL_IDENTITY_BINDING_LIFECYCLES,
  KNOWN_EXTERNAL_PROVIDER_STATES,
  ExternalIdentityRegistry,
  ExternalIdentityRegistryError,
  credentialLifecycleValue,
  credentialRef,
  credentialTypeValue,
  credentialValue,
  externalIdentityBindingRef,
  externalIdentityBindingLifecycleValue,
  externalIdentityBindingValue,
  externalIdentityTables,
  externalProviderState,
  externalProviderStateValue,
  generateCredentialRef,
  generateExternalIdentityBindingRef,
  type Credential,
  type CredentialRef,
  type ExternalIdentityBinding,
  type ExternalIdentityBindingRef,
  type ExternalIdentityRegistryCommit,
  type ExternalIdentityRegistryStore,
  type ExternalIdentityRegistryTransaction,
} from '../../../../src/modules/principal-account/external-identity/public'
import {
  principalRef,
  type Principal,
  type PrincipalLifecycle,
  type PrincipalRef,
} from '../../../../src/modules/principal-account/principal/public'

class MemoryExternalIdentityStore implements ExternalIdentityRegistryStore {
  readonly principals = new Map<PrincipalRef, Principal>()
  readonly bindings = new Map<ExternalIdentityBindingRef, ExternalIdentityBinding>()
  readonly credentials = new Map<CredentialRef, Credential>()
  commits = 0
  collisionLookup?: ExternalIdentityBinding

  async transact<Result>(
    operation: (transaction: ExternalIdentityRegistryTransaction) => Promise<Result>,
  ): Promise<Result> {
    return await operation({
      getPrincipal: async (ref) => this.principals.get(ref),
      getBinding: async (ref) => this.bindings.get(ref),
      getBindingByProviderIdentifier: async (namespace, identifier) => this.collisionLookup
        ?? [...this.bindings.values()].find(
          (binding) => binding.providerNamespace === namespace
            && binding.providerIdentifier === identifier,
        ),
      getBindingByIdempotency: async (principal, idempotency) => [...this.bindings.values()].find(
        (binding) => binding.principalRef === principal
          && binding.bindIdempotencyRef === idempotency,
      ),
      getCredential: async (ref) => this.credentials.get(ref),
      getCredentialByIdempotency: async (principal, idempotency) => [...this.credentials.values()].find(
        (credential) => credential.principalRef === principal
          && credential.issueIdempotencyRef === idempotency,
      ),
      commit: async (change) => this.apply(change),
    })
  }

  seedPrincipal(suffix: string, lifecycle: PrincipalLifecycle = 'active'): PrincipalRef {
    const ref = principalRef(`prn_${suffix.padStart(32, '0')}`)
    this.principals.set(ref, Object.freeze({
      principalRef: ref,
      kind: 'agent',
      displayName: `Agent ${suffix}`,
      lifecycle,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    }))
    return ref
  }

  private apply(change: ExternalIdentityRegistryCommit): void {
    this.commits += 1
    if (change.bindingInsert !== undefined) this.bindings.set(change.bindingInsert.bindingRef, change.bindingInsert)
    if (change.bindingReplacement !== undefined) {
      expect(this.bindings.get(change.bindingReplacement.value.bindingRef)?.revision)
        .toBe(change.bindingReplacement.expectedRevision)
      this.bindings.set(change.bindingReplacement.value.bindingRef, change.bindingReplacement.value)
    }
    if (change.credentialInsert !== undefined) {
      this.credentials.set(change.credentialInsert.credentialRef, change.credentialInsert)
    }
    if (change.credentialReplacement !== undefined) {
      expect(this.credentials.get(change.credentialReplacement.value.credentialRef)?.revision)
        .toBe(change.credentialReplacement.expectedRevision)
      this.credentials.set(change.credentialReplacement.value.credentialRef, change.credentialReplacement.value)
    }
  }
}

type Fixture = Readonly<{
  registry: ExternalIdentityRegistry
  store: MemoryExternalIdentityStore
  principal: PrincipalRef
}>

function fixture(options: Readonly<{
  times?: readonly number[]
  uuids?: readonly string[]
  principalLifecycle?: PrincipalLifecycle
}> = {}): Fixture {
  const store = new MemoryExternalIdentityStore()
  const times = [...(options.times ?? [100, 200, 300, 400, 500, 600])]
  const uuids = [...(options.uuids ?? [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000004',
  ])]
  return {
    registry: new ExternalIdentityRegistry(store, {
      now: () => times.shift() ?? 999,
      randomUuid: () => uuids.shift() ?? '00000000-0000-4000-8000-000000000099',
    }),
    store,
    principal: store.seedPrincipal('1', options.principalLifecycle),
  }
}

async function bind(setup: Fixture, overrides: Partial<Parameters<ExternalIdentityRegistry['bind']>[0]> = {}) {
  return await setup.registry.bind({
    principalRef: setup.principal,
    providerNamespace: 'oidc/acme',
    providerIdentifier: 'subject:Alice',
    providerState: 'active',
    idempotencyRef: 'bind:1',
    ...overrides,
  })
}

async function issue(
  setup: Fixture,
  binding: ExternalIdentityBinding,
  overrides: Partial<Parameters<ExternalIdentityRegistry['issueCredential']>[0]> = {},
) {
  return await setup.registry.issueCredential({
    bindingRef: binding.bindingRef,
    principalRef: setup.principal,
    expectedBindingRevision: binding.revision,
    type: 'provider_token',
    expiresAt: 10_000,
    idempotencyRef: 'issue:1',
    ...overrides,
  })
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code })
}

describe('ExternalIdentityRegistry refs and provider states', () => {
  it('exports context-local validators, tables, and closed internal lifecycle vocabularies', () => {
    expect(CREDENTIAL_TYPES).toEqual(['provider_token', 'api_key', 'workload_assertion'])
    expect(CREDENTIAL_LIFECYCLES).toEqual(['active', 'stale', 'revoked'])
    expect(EXTERNAL_IDENTITY_BINDING_LIFECYCLES).toEqual(['active', 'revoked'])
    expect(KNOWN_EXTERNAL_PROVIDER_STATES).toEqual(['active', 'disabled', 'revoked'])
    expect(Object.keys(externalIdentityTables)).toEqual(['externalIdentityBindings', 'credentials'])
    expect([
      externalProviderStateValue,
      externalIdentityBindingLifecycleValue,
      externalIdentityBindingValue,
      credentialTypeValue,
      credentialLifecycleValue,
      credentialValue,
    ]).toHaveLength(6)
  })

  it('validates and generates independent typed references', () => {
    expect(externalIdentityBindingRef('eib_00000000000000000000000000000001')).toBe('eib_00000000000000000000000000000001')
    expect(credentialRef('crd_00000000000000000000000000000001')).toBe('crd_00000000000000000000000000000001')
    expect(generateExternalIdentityBindingRef(() => '00000000-0000-4000-8000-000000000001')).toBe('eib_00000000000040008000000000000001')
    expect(generateCredentialRef(() => '00000000-0000-4000-8000-000000000001')).toBe('crd_00000000000040008000000000000001')
    expect(() => externalIdentityBindingRef('bad')).toThrowError(expect.objectContaining({ code: 'external_identity_binding_ref_invalid' }))
    expect(() => credentialRef('bad')).toThrowError(expect.objectContaining({ code: 'credential_ref_invalid' }))
    expect(() => generateExternalIdentityBindingRef(() => 'bad')).toThrowError(expect.objectContaining({ code: 'external_identity_binding_ref_invalid' }))
    expect(() => generateCredentialRef(() => 'bad')).toThrowError(expect.objectContaining({ code: 'credential_ref_invalid' }))
    expect(generateExternalIdentityBindingRef()).toMatch(/^eib_[0-9a-f]{32}$/u)
    expect(generateCredentialRef()).toMatch(/^crd_[0-9a-f]{32}$/u)
  })

  it('preserves unknown additive provider states instead of coercing them', () => {
    expect(externalProviderState('active')).toEqual({ kind: 'known', value: 'active' })
    expect(externalProviderState('provider_added_pending_review')).toEqual({
      kind: 'unknown',
      value: 'provider_added_pending_review',
    })
    expect(() => externalProviderState('')).toThrowError(expect.objectContaining({
      code: 'external_identity_provider_state_invalid',
    }))
  })

  it('exposes deterministic errors', () => {
    const error = new ExternalIdentityRegistryError('principal_not_found')
    expect(error).toMatchObject({ name: 'ExternalIdentityRegistryError', message: 'principal_not_found' })
  })
})

describe('ExternalIdentityRegistry binding', () => {
  it('creates a namespaced binding to one canonical active Principal and replays idempotently', async () => {
    const setup = fixture()
    const first = await bind(setup)
    const replay = await bind(setup)
    expect(replay).toBe(first)
    expect(setup.store.commits).toBe(1)
    expect(first).toMatchObject({
      principalRef: setup.principal,
      providerNamespace: 'oidc/acme',
      providerIdentifier: 'subject:Alice',
      lifecycle: 'active',
      credentialGeneration: 1,
      revision: 1,
    })
    expect(Object.isFrozen(first)).toBe(true)
    expect(JSON.stringify(first)).not.toMatch(/account|owner|secret|tokenValue/iu)
  })

  it('keeps identical provider identifiers collision-safe across namespaces', async () => {
    const setup = fixture()
    const first = await bind(setup)
    const second = await bind(setup, { providerNamespace: 'oauth/acme', idempotencyRef: 'bind:2' })
    expect(second.providerIdentifier).toBe(first.providerIdentifier)
    expect(second.providerNamespace).not.toBe(first.providerNamespace)
  })

  it('rejects provider-key collisions even for the same Principal', async () => {
    const setup = fixture()
    await bind(setup)
    await expectCode(bind(setup, { idempotencyRef: 'bind:2' }), 'external_identity_binding_collision')
  })

  it('rejects conflicting idempotent replay fields', async () => {
    const setup = fixture()
    await bind(setup)
    await expectCode(bind(setup, { providerIdentifier: 'subject:Bob' }), 'external_identity_binding_idempotency_conflict')
    await expectCode(bind(setup, { providerNamespace: 'oauth/acme' }), 'external_identity_binding_idempotency_conflict')
    await expectCode(bind(setup, { providerState: 'disabled' }), 'external_identity_binding_idempotency_conflict')
  })

  it('rejects invalid namespaces, identifiers, idempotency refs, and generated collisions', async () => {
    const setup = fixture({ uuids: ['00000000-0000-4000-8000-000000000001'] })
    await expectCode(bind(setup, { providerNamespace: 'OIDC Acme' }), 'external_identity_provider_namespace_invalid')
    await expectCode(bind(setup, { providerIdentifier: '' }), 'external_identity_provider_identifier_invalid')
    await expectCode(bind(setup, { idempotencyRef: '' }), 'idempotency_ref_invalid')
    const occupied = externalIdentityBindingRef('eib_00000000000040008000000000000001')
    setup.store.bindings.set(occupied, Object.freeze({
      bindingRef: occupied,
      principalRef: setup.principal,
      providerNamespace: 'other',
      providerIdentifier: 'other',
      providerState: externalProviderState('active'),
      lifecycle: 'active',
      credentialGeneration: 1,
      bindIdempotencyRef: 'occupied',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    }))
    await expectCode(bind(setup), 'external_identity_binding_ref_conflict')
  })

  it('requires an existing active canonical Principal', async () => {
    const missing = fixture()
    missing.store.principals.clear()
    await expectCode(bind(missing), 'principal_not_found')
    const inactive = fixture({ principalLifecycle: 'merged' })
    await expectCode(bind(inactive), 'principal_inactive')
  })
})

describe('ExternalIdentityRegistry credential issuance and authentication', () => {
  it('issues an independent credential fact and authenticates its canonical Principal', async () => {
    const setup = fixture()
    const binding = await bind(setup)
    const credential = await issue(setup, binding)
    const authentication = await setup.registry.authenticate({
      credentialRef: credential.credentialRef,
      bindingRef: binding.bindingRef,
      principalRef: setup.principal,
      generation: 1,
    })
    expect(authentication).toEqual({
      principalRef: setup.principal,
      bindingRef: binding.bindingRef,
      credentialRef: credential.credentialRef,
      credentialType: 'provider_token',
      generation: 1,
    })
    expect(credential).toMatchObject({ lifecycle: 'active', generation: 1, revision: 1, issuedAt: 200 })
    expect(Object.isFrozen(credential)).toBe(true)
    expect(JSON.stringify(credential)).not.toMatch(/account|owner|secret|tokenValue/iu)
  })

  it('replays issuance and rejects conflicting replay fields', async () => {
    const setup = fixture()
    const binding = await bind(setup)
    const first = await issue(setup, binding)
    expect(await issue(setup, binding)).toBe(first)
    await expectCode(issue(setup, binding, { type: 'api_key' }), 'credential_idempotency_conflict')
    await expectCode(issue(setup, binding, { expiresAt: 20_000 }), 'credential_idempotency_conflict')
    const other = await bind(setup, { providerIdentifier: 'other', idempotencyRef: 'bind:2' })
    await expectCode(issue(setup, other), 'credential_idempotency_conflict')
  })

  it('rejects missing, revoked, stale, expired, wrong-principal, wrong-binding, and wrong-generation credentials', async () => {
    const setup = fixture({ times: [100, 200, 300, 10_001, 10_002, 10_003, 10_004] })
    const binding = await bind(setup)
    const credential = await issue(setup, binding)
    const stranger = setup.store.seedPrincipal('2')
    const missingCredential = credentialRef('crd_ffffffffffffffffffffffffffffffff')
    await expectCode(setup.registry.authenticate({ credentialRef: missingCredential, bindingRef: binding.bindingRef, principalRef: setup.principal, generation: 1 }), 'credential_not_found')
    await expectCode(setup.registry.authenticate({ credentialRef: credential.credentialRef, bindingRef: binding.bindingRef, principalRef: stranger, generation: 1 }), 'credential_principal_mismatch')
    await expectCode(setup.registry.authenticate({ credentialRef: credential.credentialRef, bindingRef: binding.bindingRef, principalRef: setup.principal, generation: 2 }), 'credential_generation_mismatch')
    const other = await bind(setup, { providerIdentifier: 'other', idempotencyRef: 'bind:2' })
    await expectCode(setup.registry.authenticate({ credentialRef: credential.credentialRef, bindingRef: other.bindingRef, principalRef: setup.principal, generation: 1 }), 'credential_binding_mismatch')
    await expectCode(setup.registry.authenticate({ credentialRef: credential.credentialRef, bindingRef: binding.bindingRef, principalRef: setup.principal, generation: 1 }), 'credential_expired')
  })

  it('fails closed when the provider collision lookup no longer resolves to the binding', async () => {
    const setup = fixture()
    const binding = await bind(setup)
    const credential = await issue(setup, binding)
    setup.store.collisionLookup = Object.freeze({
      ...binding,
      bindingRef: externalIdentityBindingRef('eib_ffffffffffffffffffffffffffffffff'),
    })
    await expectCode(setup.registry.authenticate({ credentialRef: credential.credentialRef, bindingRef: binding.bindingRef, principalRef: setup.principal, generation: 1 }), 'external_identity_binding_collision')
    delete setup.store.collisionLookup
    setup.store.bindings.delete(binding.bindingRef)
    await expectCode(setup.registry.authenticate({ credentialRef: credential.credentialRef, bindingRef: binding.bindingRef, principalRef: setup.principal, generation: 1 }), 'external_identity_binding_not_found')
  })

  it('rejects invalid issuance inputs and untrusted bindings', async () => {
    const setup = fixture({ times: [100, 200] })
    const binding = await bind(setup)
    await expectCode(issue(setup, binding, { type: 'password' as never }), 'credential_type_invalid')
    await expectCode(issue(setup, binding, { expiresAt: -1 }), 'credential_timestamp_invalid')
    await expectCode(issue(setup, binding, { expiresAt: 200 }), 'credential_timestamp_invalid')
    await expectCode(issue(setup, binding, { expectedBindingRevision: 2 }), 'external_identity_binding_revision_conflict')
    const stranger = setup.store.seedPrincipal('2')
    await expectCode(issue(setup, binding, { principalRef: stranger }), 'credential_principal_mismatch')
    const unknown = await setup.registry.setProviderState({ bindingRef: binding.bindingRef, principalRef: setup.principal, expectedRevision: 1, providerState: 'new_pending' })
    await expectCode(issue(setup, unknown, { expectedBindingRevision: 2 }), 'external_identity_provider_state_untrusted')
  })

  it('rejects credential reference collisions', async () => {
    const setup = fixture({ uuids: [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ] })
    const binding = await bind(setup)
    const occupied = credentialRef('crd_00000000000040008000000000000002')
    setup.store.credentials.set(occupied, Object.freeze({
      credentialRef: occupied,
      bindingRef: binding.bindingRef,
      principalRef: setup.principal,
      type: 'api_key',
      lifecycle: 'active',
      generation: 1,
      issueIdempotencyRef: 'occupied',
      revision: 1,
      issuedAt: 1,
      expiresAt: 2,
      updatedAt: 1,
    }))
    await expectCode(issue(setup, binding), 'credential_ref_conflict')
  })
})

describe('ExternalIdentityRegistry rotation and lifecycle', () => {
  it('rotates atomically while preserving Principal continuity and staling the predecessor', async () => {
    const setup = fixture()
    const binding = await bind(setup)
    const first = await issue(setup, binding)
    const rotated = await setup.registry.rotateCredential({
      credentialRef: first.credentialRef,
      bindingRef: binding.bindingRef,
      principalRef: setup.principal,
      expectedCredentialRevision: 1,
      expectedBindingRevision: 1,
      type: 'workload_assertion',
      expiresAt: 20_000,
      idempotencyRef: 'rotate:1',
    })
    expect(rotated.binding).toMatchObject({ principalRef: setup.principal, credentialGeneration: 2, revision: 2 })
    expect(rotated.previous).toMatchObject({ lifecycle: 'stale', staleAt: 300, revision: 2 })
    expect(rotated.current).toMatchObject({
      principalRef: setup.principal,
      bindingRef: binding.bindingRef,
      lifecycle: 'active',
      generation: 2,
      predecessorCredentialRef: first.credentialRef,
    })
    expect(await setup.registry.rotateCredential({ credentialRef: first.credentialRef, bindingRef: binding.bindingRef, principalRef: setup.principal, expectedCredentialRevision: 1, expectedBindingRevision: 1, type: 'workload_assertion', expiresAt: 20_000, idempotencyRef: 'rotate:1' })).toEqual(rotated)
    await expectCode(setup.registry.authenticate({ credentialRef: first.credentialRef, bindingRef: binding.bindingRef, principalRef: setup.principal, generation: 1 }), 'credential_stale')
    await expect(setup.registry.authenticate({ credentialRef: rotated.current.credentialRef, bindingRef: binding.bindingRef, principalRef: setup.principal, generation: 2 })).resolves.toMatchObject({ principalRef: setup.principal })
  })

  it('rejects conflicting rotation replay and generation drift', async () => {
    const setup = fixture()
    const binding = await bind(setup)
    const first = await issue(setup, binding)
    const request = { credentialRef: first.credentialRef, bindingRef: binding.bindingRef, principalRef: setup.principal, expectedCredentialRevision: 1, expectedBindingRevision: 1, type: 'api_key' as const, expiresAt: 20_000, idempotencyRef: 'rotate:1' }
    const rotated = await setup.registry.rotateCredential(request)
    await expectCode(setup.registry.rotateCredential({ ...request, type: 'provider_token' }), 'credential_idempotency_conflict')
    await expectCode(setup.registry.rotateCredential({ ...request, expiresAt: 30_000 }), 'credential_idempotency_conflict')
    await expectCode(setup.registry.rotateCredential({ ...request, credentialRef: rotated.current.credentialRef }), 'credential_idempotency_conflict')
    setup.store.bindings.set(rotated.binding.bindingRef, Object.freeze({ ...rotated.binding, credentialGeneration: 3 }))
    await expectCode(setup.registry.rotateCredential(request), 'credential_generation_mismatch')
  })

  it('rejects wrong binding, principal, revisions, stale state, and invalid rotation time', async () => {
    const setup = fixture({ times: [100, 200, 150, 199, 300, 400, 500] })
    const binding = await bind(setup)
    const first = await issue(setup, binding)
    const other = await bind(setup, { providerIdentifier: 'other', idempotencyRef: 'bind:2' })
    const stranger = setup.store.seedPrincipal('2')
    let requestSequence = 0
    const rotate = (overrides: Partial<Parameters<ExternalIdentityRegistry['rotateCredential']>[0]> = {}) => setup.registry.rotateCredential({ credentialRef: first.credentialRef, bindingRef: binding.bindingRef, principalRef: setup.principal, expectedCredentialRevision: 1, expectedBindingRevision: 1, type: 'api_key', expiresAt: 20_000, idempotencyRef: `rotate:${++requestSequence}`, ...overrides })
    await expectCode(rotate({ bindingRef: other.bindingRef }), 'credential_binding_mismatch')
    await expectCode(rotate({ principalRef: stranger }), 'credential_principal_mismatch')
    await expectCode(rotate({ expectedBindingRevision: 2 }), 'external_identity_binding_revision_conflict')
    await expectCode(rotate({ expectedCredentialRevision: 2 }), 'credential_revision_conflict')
    await expectCode(rotate(), 'credential_timestamp_invalid')
    setup.store.credentials.set(first.credentialRef, Object.freeze({ ...first, lifecycle: 'revoked' }))
    await expectCode(rotate(), 'credential_lifecycle_forbidden')
    setup.store.credentials.set(first.credentialRef, Object.freeze({ ...first, lifecycle: 'stale' }))
    await expectCode(rotate(), 'credential_stale')
  })

  it('rejects rotating a generation-stale active credential and invalid expiry', async () => {
    const setup = fixture({ times: [100, 200, 300, 400] })
    const binding = await bind(setup)
    const first = await issue(setup, binding)
    setup.store.bindings.set(binding.bindingRef, Object.freeze({ ...binding, credentialGeneration: 2 }))
    await expectCode(setup.registry.rotateCredential({ credentialRef: first.credentialRef, bindingRef: binding.bindingRef, principalRef: setup.principal, expectedCredentialRevision: 1, expectedBindingRevision: 1, type: 'api_key', expiresAt: 20_000, idempotencyRef: 'rotate:stale' }), 'credential_stale')
    setup.store.bindings.set(binding.bindingRef, binding)
    await expectCode(setup.registry.rotateCredential({ credentialRef: first.credentialRef, bindingRef: binding.bindingRef, principalRef: setup.principal, expectedCredentialRevision: 1, expectedBindingRevision: 1, type: 'api_key', expiresAt: 300, idempotencyRef: 'rotate:expiry' }), 'credential_timestamp_invalid')
  })

  it('revokes credentials idempotently and refuses them for authentication', async () => {
    const setup = fixture()
    const binding = await bind(setup)
    const credential = await issue(setup, binding)
    const revoked = await setup.registry.revokeCredential({ credentialRef: credential.credentialRef, principalRef: setup.principal, expectedRevision: 1 })
    expect(revoked).toMatchObject({ lifecycle: 'revoked', revokedAt: 300, revision: 2 })
    expect(await setup.registry.revokeCredential({ credentialRef: credential.credentialRef, principalRef: setup.principal, expectedRevision: 2 })).toBe(revoked)
    await expectCode(setup.registry.authenticate({ credentialRef: credential.credentialRef, bindingRef: binding.bindingRef, principalRef: setup.principal, generation: 1 }), 'credential_lifecycle_forbidden')
  })

  it('rejects invalid credential revocation attempts', async () => {
    const setup = fixture()
    const binding = await bind(setup)
    const credential = await issue(setup, binding)
    const stranger = setup.store.seedPrincipal('2')
    await expectCode(setup.registry.revokeCredential({ credentialRef: credential.credentialRef, principalRef: stranger, expectedRevision: 1 }), 'credential_principal_mismatch')
    await expectCode(setup.registry.revokeCredential({ credentialRef: credential.credentialRef, principalRef: setup.principal, expectedRevision: 2 }), 'credential_revision_conflict')
    setup.store.credentials.set(credential.credentialRef, Object.freeze({ ...credential, lifecycle: 'stale' }))
    await expectCode(setup.registry.revokeCredential({ credentialRef: credential.credentialRef, principalRef: setup.principal, expectedRevision: 1 }), 'credential_lifecycle_forbidden')
  })

  it('preserves provider state exactly and fails closed for unknown or disabled states', async () => {
    const setup = fixture()
    const binding = await bind(setup)
    const unknown = await setup.registry.setProviderState({ bindingRef: binding.bindingRef, principalRef: setup.principal, expectedRevision: 1, providerState: 'provider_new_waiting' })
    expect(unknown.providerState).toEqual({ kind: 'unknown', value: 'provider_new_waiting' })
    expect(await setup.registry.setProviderState({ bindingRef: binding.bindingRef, principalRef: setup.principal, expectedRevision: 2, providerState: 'provider_new_waiting' })).toBe(unknown)
    await expectCode(issue(setup, unknown, { expectedBindingRevision: 2 }), 'external_identity_provider_state_untrusted')
    const disabled = await setup.registry.setProviderState({ bindingRef: binding.bindingRef, principalRef: setup.principal, expectedRevision: 2, providerState: 'disabled' })
    await expectCode(issue(setup, disabled, { expectedBindingRevision: 3, idempotencyRef: 'issue:disabled' }), 'external_identity_provider_state_untrusted')
  })

  it('validates provider-state updates and binding revocation', async () => {
    const setup = fixture()
    const binding = await bind(setup)
    const stranger = setup.store.seedPrincipal('2')
    await expectCode(setup.registry.setProviderState({ bindingRef: binding.bindingRef, principalRef: stranger, expectedRevision: 1, providerState: 'active' }), 'credential_principal_mismatch')
    await expectCode(setup.registry.setProviderState({ bindingRef: binding.bindingRef, principalRef: setup.principal, expectedRevision: 2, providerState: 'active' }), 'external_identity_binding_revision_conflict')
    const revoked = await setup.registry.revokeBinding({ bindingRef: binding.bindingRef, principalRef: setup.principal, expectedRevision: 1 })
    expect(revoked).toMatchObject({ lifecycle: 'revoked', revokedAt: 200, revision: 2 })
    expect(await setup.registry.revokeBinding({ bindingRef: binding.bindingRef, principalRef: setup.principal, expectedRevision: 2 })).toBe(revoked)
    await expectCode(setup.registry.setProviderState({ bindingRef: binding.bindingRef, principalRef: setup.principal, expectedRevision: 2, providerState: 'active' }), 'external_identity_binding_revoked')
    await expectCode(issue(setup, revoked, { expectedBindingRevision: 2 }), 'external_identity_binding_revoked')
  })

  it('rejects wrong-principal and stale-revision binding revocation', async () => {
    const setup = fixture()
    const binding = await bind(setup)
    const stranger = setup.store.seedPrincipal('2')
    await expectCode(setup.registry.revokeBinding({ bindingRef: binding.bindingRef, principalRef: stranger, expectedRevision: 1 }), 'credential_principal_mismatch')
    await expectCode(setup.registry.revokeBinding({ bindingRef: binding.bindingRef, principalRef: setup.principal, expectedRevision: 2 }), 'external_identity_binding_revision_conflict')
  })
})

describe('ExternalIdentityRegistry defaults and timestamp guards', () => {
  it('supports production clock and UUID defaults', async () => {
    const store = new MemoryExternalIdentityStore()
    const principal = store.seedPrincipal('1')
    const registry = new ExternalIdentityRegistry(store)
    const binding = await registry.bind({ principalRef: principal, providerNamespace: 'oidc/default', providerIdentifier: 'subject', providerState: 'active', idempotencyRef: 'bind:default' })
    const credential = await registry.issueCredential({ bindingRef: binding.bindingRef, principalRef: principal, expectedBindingRevision: 1, type: 'provider_token', expiresAt: Date.now() + 60_000, idempotencyRef: 'issue:default' })
    expect(binding.bindingRef).toMatch(/^eib_[0-9a-f]{32}$/u)
    expect(credential.credentialRef).toMatch(/^crd_[0-9a-f]{32}$/u)
  })

  it('rejects non-safe timestamps and backwards lifecycle timestamps', async () => {
    const invalid = fixture({ times: [Number.NaN] })
    await expectCode(bind(invalid), 'credential_timestamp_invalid')

    const backwardsState = fixture({ times: [100, 99] })
    const binding = await bind(backwardsState)
    await expectCode(backwardsState.registry.setProviderState({ bindingRef: binding.bindingRef, principalRef: backwardsState.principal, expectedRevision: 1, providerState: 'disabled' }), 'credential_timestamp_invalid')

    const backwardsRevoke = fixture({ times: [100, 99] })
    const revokeBinding = await bind(backwardsRevoke)
    await expectCode(backwardsRevoke.registry.revokeBinding({ bindingRef: revokeBinding.bindingRef, principalRef: backwardsRevoke.principal, expectedRevision: 1 }), 'credential_timestamp_invalid')

    const backwardsCredential = fixture({ times: [100, 200, 199] })
    const credentialBinding = await bind(backwardsCredential)
    const credential = await issue(backwardsCredential, credentialBinding)
    await expectCode(backwardsCredential.registry.revokeCredential({ credentialRef: credential.credentialRef, principalRef: backwardsCredential.principal, expectedRevision: 1 }), 'credential_timestamp_invalid')
  })
})

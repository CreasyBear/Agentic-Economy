import { describe, expect, it } from 'vitest'

import {
  ExternalIdentityRegistry,
  externalIdentityBindingRef,
  type Credential,
  type CredentialRef,
  type ExternalIdentityBinding,
  type ExternalIdentityBindingRef,
  type ExternalIdentityRegistryCommit,
  type ExternalIdentityRegistryStore,
  type ExternalIdentityRegistryTransaction,
} from '../../src/modules/principal-account/external-identity/public'
import { principalRef, type Principal, type PrincipalRef } from '../../src/modules/principal-account/principal/public'

class ContractStore implements ExternalIdentityRegistryStore {
  readonly principals = new Map<PrincipalRef, Principal>()
  readonly bindings = new Map<ExternalIdentityBindingRef, ExternalIdentityBinding>()
  readonly credentials = new Map<CredentialRef, Credential>()
  collisionOverride?: ExternalIdentityBinding
  commits = 0

  async transact<Result>(operation: (transaction: ExternalIdentityRegistryTransaction) => Promise<Result>): Promise<Result> {
    return await operation({
      getPrincipal: async (ref) => this.principals.get(ref),
      getBinding: async (ref) => this.bindings.get(ref),
      getBindingByProviderIdentifier: async (namespace, identifier) => this.collisionOverride ?? [...this.bindings.values()].find((binding) => binding.providerNamespace === namespace && binding.providerIdentifier === identifier),
      getBindingByIdempotency: async (principal, idempotency) => [...this.bindings.values()].find((binding) => binding.principalRef === principal && binding.bindIdempotencyRef === idempotency),
      getCredential: async (ref) => this.credentials.get(ref),
      getCredentialByIdempotency: async (principal, idempotency) => [...this.credentials.values()].find((credential) => credential.principalRef === principal && credential.issueIdempotencyRef === idempotency),
      commit: async (change) => this.apply(change),
    })
  }

  principal(suffix: string): PrincipalRef {
    const ref = principalRef(`prn_${suffix.padStart(32, '0')}`)
    this.principals.set(ref, Object.freeze({ principalRef: ref, kind: 'agent', displayName: `Agent ${suffix}`, lifecycle: 'active', revision: 1, createdAt: 1, updatedAt: 1 }))
    return ref
  }

  private apply(change: ExternalIdentityRegistryCommit): void {
    this.commits += 1
    if (change.bindingInsert !== undefined) this.bindings.set(change.bindingInsert.bindingRef, change.bindingInsert)
    if (change.bindingReplacement !== undefined) this.bindings.set(change.bindingReplacement.value.bindingRef, change.bindingReplacement.value)
    if (change.credentialInsert !== undefined) this.credentials.set(change.credentialInsert.credentialRef, change.credentialInsert)
    if (change.credentialReplacement !== undefined) this.credentials.set(change.credentialReplacement.value.credentialRef, change.credentialReplacement.value)
  }
}

function setup() {
  const store = new ContractStore()
  const principal = store.principal('1')
  let now = 0
  let sequence = 0
  const registry = new ExternalIdentityRegistry(store, {
    now: () => (now += 1_000),
    randomUuid: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
  })
  return { store, principal, registry }
}

async function provision(context: ReturnType<typeof setup>, namespace = 'oidc/acme', identifier = 'subject:1') {
  const idempotencySuffix = `${namespace}:${identifier}`.replaceAll('/', '-')
  const binding = await context.registry.bind({ principalRef: context.principal, providerNamespace: namespace, providerIdentifier: identifier, providerState: 'active', idempotencyRef: `bind:${idempotencySuffix}` })
  const credential = await context.registry.issueCredential({ bindingRef: binding.bindingRef, principalRef: context.principal, expectedBindingRevision: binding.revision, type: 'provider_token', expiresAt: 100_000, idempotencyRef: `issue:${idempotencySuffix}` })
  return { binding, credential }
}

describe('P1-03 external identity and credential contract', () => {
  it('binds namespaced provider identifiers to a Principal without becoming resource identity', async () => {
    const context = setup()
    const first = await provision(context, 'oidc/acme', 'shared-subject')
    const second = await provision(context, 'oauth/acme', 'shared-subject')

    expect(first.binding.providerIdentifier).toBe(second.binding.providerIdentifier)
    expect(first.binding.providerNamespace).not.toBe(second.binding.providerNamespace)
    expect(first.binding.principalRef).toBe(context.principal)
    expect(JSON.stringify({ bindings: [...context.store.bindings.values()], credentials: [...context.store.credentials.values()] })).not.toMatch(/accountRef|owner|resource|secret|tokenValue/iu)
  })

  it('fails closed on provider binding collisions and collision-bound authentication', async () => {
    const context = setup()
    const { binding, credential } = await provision(context)
    await expect(context.registry.bind({ principalRef: context.principal, providerNamespace: binding.providerNamespace, providerIdentifier: binding.providerIdentifier, providerState: 'active', idempotencyRef: 'bind:collision' })).rejects.toMatchObject({ code: 'external_identity_binding_collision' })

    context.store.collisionOverride = Object.freeze({ ...binding, bindingRef: externalIdentityBindingRef('eib_ffffffffffffffffffffffffffffffff') })
    await expect(context.registry.authenticate({ credentialRef: credential.credentialRef, bindingRef: binding.bindingRef, principalRef: context.principal, generation: 1 })).rejects.toMatchObject({ code: 'external_identity_binding_collision' })
  })

  it('fails closed for stale, revoked, expired, wrong-Principal, wrong-binding and wrong-generation credentials', async () => {
    const context = setup()
    const first = await provision(context)
    const other = await provision(context, 'oidc/other', 'subject:2')
    const wrongPrincipal = context.store.principal('2')

    await expect(context.registry.authenticate({ credentialRef: first.credential.credentialRef, bindingRef: first.binding.bindingRef, principalRef: wrongPrincipal, generation: 1 })).rejects.toMatchObject({ code: 'credential_principal_mismatch' })
    await expect(context.registry.authenticate({ credentialRef: first.credential.credentialRef, bindingRef: other.binding.bindingRef, principalRef: context.principal, generation: 1 })).rejects.toMatchObject({ code: 'credential_binding_mismatch' })
    await expect(context.registry.authenticate({ credentialRef: first.credential.credentialRef, bindingRef: first.binding.bindingRef, principalRef: context.principal, generation: 2 })).rejects.toMatchObject({ code: 'credential_generation_mismatch' })

    const revoked = await context.registry.revokeCredential({ credentialRef: first.credential.credentialRef, principalRef: context.principal, expectedRevision: 1 })
    await expect(context.registry.authenticate({ credentialRef: revoked.credentialRef, bindingRef: first.binding.bindingRef, principalRef: context.principal, generation: 1 })).rejects.toMatchObject({ code: 'credential_lifecycle_forbidden' })

    const expiryContext = setup()
    const expiring = await expiryContext.registry.bind({ principalRef: expiryContext.principal, providerNamespace: 'oidc/acme', providerIdentifier: 'expiry', providerState: 'active', idempotencyRef: 'bind:expiry' })
    const expired = await expiryContext.registry.issueCredential({ bindingRef: expiring.bindingRef, principalRef: expiryContext.principal, expectedBindingRevision: 1, type: 'api_key', expiresAt: 2_001, idempotencyRef: 'issue:expiry' })
    await expect(expiryContext.registry.authenticate({ credentialRef: expired.credentialRef, bindingRef: expiring.bindingRef, principalRef: expiryContext.principal, generation: 1 })).rejects.toMatchObject({ code: 'credential_expired' })
  })

  it('rotates credentials idempotently while preserving Principal continuity and staling older generations', async () => {
    const context = setup()
    const { binding, credential } = await provision(context)
    const request = { credentialRef: credential.credentialRef, bindingRef: binding.bindingRef, principalRef: context.principal, expectedCredentialRevision: 1, expectedBindingRevision: 1, type: 'workload_assertion' as const, expiresAt: 200_000, idempotencyRef: 'rotate:1' }
    const rotated = await context.registry.rotateCredential(request)
    const replay = await context.registry.rotateCredential(request)

    expect(replay).toEqual(rotated)
    expect(rotated.binding.principalRef).toBe(context.principal)
    expect(rotated.current.principalRef).toBe(context.principal)
    expect(rotated.current.generation).toBe(2)
    expect(rotated.previous.lifecycle).toBe('stale')
    await expect(context.registry.authenticate({ credentialRef: credential.credentialRef, bindingRef: binding.bindingRef, principalRef: context.principal, generation: 1 })).rejects.toMatchObject({ code: 'credential_stale' })
    await expect(context.registry.authenticate({ credentialRef: rotated.current.credentialRef, bindingRef: binding.bindingRef, principalRef: context.principal, generation: 2 })).resolves.toMatchObject({ principalRef: context.principal })
  })

  it('preserves unknown provider state exactly and refuses to trust it', async () => {
    const context = setup()
    const binding = await context.registry.bind({ principalRef: context.principal, providerNamespace: 'oidc/acme', providerIdentifier: 'unknown-state', providerState: 'provider_added_review', idempotencyRef: 'bind:unknown' })
    expect(binding.providerState).toEqual({ kind: 'unknown', value: 'provider_added_review' })
    await expect(context.registry.issueCredential({ bindingRef: binding.bindingRef, principalRef: context.principal, expectedBindingRevision: 1, type: 'provider_token', expiresAt: 100_000, idempotencyRef: 'issue:unknown' })).rejects.toMatchObject({ code: 'external_identity_provider_state_untrusted' })
  })
})

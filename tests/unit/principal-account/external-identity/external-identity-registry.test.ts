import { describe, expect, it } from 'vitest'

import {
  KNOWN_EXTERNAL_PROVIDER_STATES,
  ExternalIdentityRegistryError,
  credentialRef,
  credentialValue,
  credentialLifecycleValue,
  credentialTypeValue,
  externalIdentityBindingRef,
  externalIdentityBindingLifecycleValue,
  externalIdentityBindingValue,
  externalIdentityTables,
  externalProviderState,
  externalProviderStateValue,
  generateCredentialRef,
  generateExternalIdentityBindingRef,
} from '../../../../src/modules/principal-account/external-identity/public'

describe('external identity reference and provider-state contracts', () => {
  it('exports known provider states, validators, and table fragments', () => {
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

  it('validates and generates independent binding and credential references', () => {
    expect(externalIdentityBindingRef('eib_00000000000000000000000000000001'))
      .toBe('eib_00000000000000000000000000000001')
    expect(credentialRef('crd_00000000000000000000000000000001'))
      .toBe('crd_00000000000000000000000000000001')
    expect(generateExternalIdentityBindingRef(() => '00000000-0000-4000-8000-000000000001'))
      .toBe('eib_00000000000040008000000000000001')
    expect(generateCredentialRef(() => '00000000-0000-4000-8000-000000000001'))
      .toBe('crd_00000000000040008000000000000001')
    expect(() => externalIdentityBindingRef('bad')).toThrowError(expect.objectContaining({
      code: 'external_identity_binding_ref_invalid',
    }))
    expect(() => credentialRef('bad')).toThrowError(expect.objectContaining({
      code: 'credential_ref_invalid',
    }))
    expect(() => generateExternalIdentityBindingRef(() => 'bad')).toThrowError(expect.objectContaining({
      code: 'external_identity_binding_ref_invalid',
    }))
    expect(() => generateCredentialRef(() => 'bad')).toThrowError(expect.objectContaining({
      code: 'credential_ref_invalid',
    }))
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

  it('exposes deterministic parser errors', () => {
    const error = new ExternalIdentityRegistryError('credential_ref_invalid')
    expect(error).toMatchObject({ name: 'ExternalIdentityRegistryError', message: 'credential_ref_invalid' })
  })
})

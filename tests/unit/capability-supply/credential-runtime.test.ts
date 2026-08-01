import { describe, expect, it } from 'vitest'

import { credentialResolutionRefusal, resolveCapabilityCredential } from '@/modules/capability-supply/internal/credential-runtime'

describe('supply credential runtime', () => {
  it('uses none without looking up a secret', () => {
    expect(resolveCapabilityCredential('none', {})).toEqual({ kind: 'not_required', reference: 'none' })
  })

  it('returns typed unavailable and rejected outcomes', () => {
    const unavailable = resolveCapabilityCredential('env:PROVIDER_KEY', { PROVIDER_KEY: ' ' })
    expect(unavailable.kind).toBe('unavailable')
    expect(credentialResolutionRefusal(unavailable)).toBe('credential_unavailable')
    const rejected = resolveCapabilityCredential('literal-secret', {})
    expect(rejected.kind).toBe('rejected')
    expect(credentialResolutionRefusal(rejected)).toBe('credential_rejected')
  })

  it('resolves only an environment reference and never changes the reference', () => {
    expect(resolveCapabilityCredential('env:PROVIDER_KEY', { PROVIDER_KEY: 'sandbox-value' })).toEqual({ kind: 'ready', reference: 'env:PROVIDER_KEY', credential: 'sandbox-value' })
  })
})

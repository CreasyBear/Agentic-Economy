import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readOnboardingRequest } from '@/lib/server/agent-access-oauth/onboarding'
import { createOAuthStoreFixture, defaultOAuthGrantFixture, defaultOAuthClientFixture } from '../../helpers/agent-access-oauth-store-fixture'
import { hashOAuthValue } from '@/modules/agent-access/oauth-state'

beforeEach(() => vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development'))
afterEach(() => vi.unstubAllEnvs())
const owner = async () => ({ isAuthenticated: true, userId: 'user_owner' })
describe('one owner-visible onboarding request', () => {
  it.each([
    ['pending', 'pending'], ['issuing', 'issuing'], ['approved', 'approved'],
    ['delivery_claimed', 'exchanging'], ['consumed', 'exchanged'], ['denied', 'denied'], ['expired', 'expired'],
  ] as const)('observes %s without repeating consent or delivery', async (status, phase) => {
    const store = createOAuthStoreFixture()
    const grant = defaultOAuthGrantFixture('request:exact', { status, ownerId: 'user_owner', keyId: 'private-key-id', issuanceKey: 'private-issuance-key' })
    await store.insertGrant(grant)
    await store.insertClient(defaultOAuthClientFixture())
    const prove = vi.fn(async () => 'prn_owned')
    const result = await readOnboardingRequest({ grantRef: grant.grantRef }, { store, now: () => 2_000, authenticateOwner: owner }, prove)
    expect(result).toMatchObject({ kind: 'request', grantRef: grant.grantRef, phase, principalRef: 'prn_owned' })
    expect(JSON.stringify(result)).not.toContain('private-')
    expect(JSON.stringify(result)).not.toContain('d-code')
    expect(store.updates).toEqual([])
    expect(store.grants.get(grant.grantRef)).toEqual(grant)
  })
  it('follows a pending device locator before any credential or Agent exists', async () => {
    const store = createOAuthStoreFixture()
    await store.insertGrant(defaultOAuthGrantFixture('device:exact', { userCodeHash: await hashOAuthValue('ABCD-EFGH') }))
    await store.insertGrant(defaultOAuthGrantFixture('device:unrelated'))
    const prove = vi.fn(async () => 'prn_other')
    const result = await readOnboardingRequest({ userCode: 'ABCD-EFGH' }, { store, authenticateOwner: owner, now: () => 2_000 }, prove)
    expect(result).toMatchObject({ kind: 'request', grantRef: 'device:exact', phase: 'pending' })
    expect(result).not.toHaveProperty('principalRef')
    expect(prove).not.toHaveBeenCalled()
  })
  it('does not erase exchange evidence when its original verification deadline passes', async () => {
    const store = createOAuthStoreFixture()
    await store.insertGrant(defaultOAuthGrantFixture('request:consumed', { status: 'consumed', ownerId: 'user_owner', keyId: 'old-key', expiresAt: 3_000 }))
    await expect(readOnboardingRequest({ grantRef: 'request:consumed' }, { store, authenticateOwner: owner, now: () => 100_000 }, async () => 'prn_owned'))
      .resolves.toMatchObject({ kind: 'request', phase: 'exchanged', principalRef: 'prn_owned' })
  })
  it('refuses another human or Account before exposing issued request facts', async () => {
    const store = createOAuthStoreFixture()
    await store.insertGrant(defaultOAuthGrantFixture('request:foreign', { ownerId: 'user_other', keyId: 'foreign-key' }))
    const prove = vi.fn(async () => null)
    await expect(readOnboardingRequest({ grantRef: 'request:foreign' }, { store, authenticateOwner: owner }, prove)).resolves.toEqual({ kind: 'refused', reason: 'owner_mismatch' })
    expect(prove).not.toHaveBeenCalled()
    await store.insertGrant(defaultOAuthGrantFixture('request:account-switch', { ownerId: 'user_owner', keyId: 'old-account-key' }))
    await expect(readOnboardingRequest({ grantRef: 'request:account-switch' }, { store, authenticateOwner: owner }, prove)).resolves.toEqual({ kind: 'refused', reason: 'owner_mismatch' })
  })
  it('requires authentication and the deployment environment', async () => {
    const store = createOAuthStoreFixture()
    const prove = vi.fn(async () => null)
    await expect(readOnboardingRequest({ grantRef: 'request:missing' }, { store, authenticateOwner: async () => ({ isAuthenticated: false, userId: null }) }, prove))
      .resolves.toEqual({ kind: 'refused', reason: 'authentication_required' })
    await store.insertGrant(defaultOAuthGrantFixture('request:production', { requestedAccess: { environment: 'production', toolAccess: 'all_admitted', toolRefs: [], expiresInSeconds: 3_600 } }))
    await expect(readOnboardingRequest({ grantRef: 'request:production' }, { store, authenticateOwner: owner }, prove)).resolves.toEqual({ kind: 'refused', reason: 'environment_mismatch' })
  })
  it.each(['pending', 'issuing', 'approved', 'delivery_claimed'] as const)('marks an expired %s verification request without issuing or exchanging again', async status => {
    const store = createOAuthStoreFixture()
    await store.insertGrant(defaultOAuthGrantFixture('request:expired', { status, ownerId: 'user_owner', expiresAt: 2_000 }))
    await expect(readOnboardingRequest({ grantRef: 'request:expired' }, { store, authenticateOwner: owner, now: () => 3_000 }, async () => null)).resolves.toMatchObject({ kind: 'request', phase: 'expired' })
    expect(store.updates).toEqual([])
  })

})

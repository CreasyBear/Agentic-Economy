import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../convex/_generated/api'
import { InteractiveAuthorityError } from '../../../convex/interactiveAuthority'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createConvexServerFunctionAssertion } from '@/lib/server/convex-source'
import {
  CLERK_SECURITY_OBSERVE_OPERATION,
  CLERK_SECURITY_OBSERVE_SCOPE,
  type ClerkSecurityObservation,
} from '@/modules/security/account-security'
import { provisionedIdentity } from '../../helpers/interactive-authority-provisioning'
import {
  collectAuthorityTables,
  createInteractiveAuthorityBackend,
  resolveInteractiveContext,
  type InteractiveAuthorityBackend,
} from '../../helpers/interactive-authority-runtime'

const NOW = 10_000
const TOKEN = 'https://clerk.example.test|user_session_recovery'
const oldIdentity = provisionedIdentity(TOKEN, { exp: undefined, sid: 'sess_old' })
const newIdentity = provisionedIdentity(TOKEN, { exp: undefined, sid: 'sess_new' })

async function observe(
  backend: InteractiveAuthorityBackend,
  sessionId: string,
  eventType: 'session.created' | 'session.revoked' | 'session.ended',
  observedAt: number,
  providerIdentifier = TOKEN,
) {
  const command: ClerkSecurityObservation = {
    deliveryRefHash: canonicalDigest({ sessionId, eventType, observedAt, providerIdentifier }),
    providerIdentifier,
    eventType,
    targetRefHash: canonicalDigest({
      contract: 'ae.clerk-webhook-target:v1', provider: 'clerk', targetKind: 'session', targetRef: sessionId,
    }),
    observedAt,
    securityAction: eventType === 'session.revoked' ? 'revoke_interactive_credentials' : 'observe_only',
  }
  const serviceAuth = await createConvexServerFunctionAssertion({
    operation: CLERK_SECURITY_OBSERVE_OPERATION,
    scope: CLERK_SECURITY_OBSERVE_SCOPE,
    command,
  })
  return backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
    ...command, serviceAuth: { ...serviceAuth, scopes: [...serviceAuth.scopes] },
  })
}

async function revokedOwner() {
  const backend = createInteractiveAuthorityBackend()
  await expect(backend.withIdentity(oldIdentity).mutation(
    api.interactiveAuthority.materializeCurrentInteractiveAuthority, {},
  )).resolves.toBe(true)
  await observe(backend, 'sess_old', 'session.created', NOW)
  vi.setSystemTime(NOW + 1_000)
  await expect(observe(backend, 'sess_old', 'session.revoked', NOW + 1_000))
    .resolves.toMatchObject({ kind: 'accepted', status: 'applied' })
  vi.setSystemTime(NOW + 2_000)
  return backend
}

describe('interactive session recovery after signed Clerk revocation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', 'session-recovery-test-secret-with-at-least-32-bytes')
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('reproduces refusal before the new session observation, then restores the same Account exactly once', async () => {
    const backend = await revokedOwner()
    const before = await collectAuthorityTables(backend)
    const owner = backend.withIdentity(newIdentity)
    await expect(owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {}))
      .resolves.toBe(false)
    await expect(collectAuthorityTables(backend)).resolves.toEqual(before)

    await expect(observe(backend, 'sess_new', 'session.created', NOW + 2_000))
      .resolves.toMatchObject({ kind: 'accepted', status: 'applied' })
    await expect(Promise.all([
      owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {}),
      owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {}),
    ])).resolves.toEqual([true, true])

    const after = await collectAuthorityTables(backend)
    expect(after.principals).toEqual(before.principals)
    expect(after.accounts).toEqual(before.accounts)
    expect(after.ownerships).toEqual(before.ownerships)
    expect(after.credentials).toHaveLength(2)
    expect(after.credentials.find(row => row.generation === 1)).toEqual(before.credentials[0])
    expect(after.credentials.find(row => row.generation === 2)).toMatchObject({
      lifecycle: 'active', issuedAt: NOW + 2_000, expiresAt: NOW + 62_000,
      predecessorCredentialRef: before.credentials[0]!.credentialRef,
      expiryMaterialization: { state: 'scheduled', credentialGeneration: 2 },
    })
    await expect(resolveInteractiveContext(backend, newIdentity)).resolves.toMatchObject({
      principalRef: before.principals[0]!.principalRef,
      accountRef: before.accounts[0]!.accountRef,
      provenance: { credentialGeneration: 2 },
    })
  })

  it('keeps the old session denied through fresh token windows, creation replay and subsequent renewal', async () => {
    const backend = await revokedOwner()
    await observe(backend, 'sess_new', 'session.created', NOW + 2_000)
    await backend.withIdentity(newIdentity).mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})
    await expect(observe(backend, 'sess_old', 'session.created', NOW)).resolves.toMatchObject({ status: 'replayed' })
    vi.setSystemTime(NOW + 42_000)
    await expect(backend.withIdentity(newIdentity).mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {}))
      .resolves.toBe(true)
    const before = await collectAuthorityTables(backend)
    const currentExpiry = before.credentials.find(row => row.lifecycle === 'active')!.expiresAt / 1_000
    for (const identity of [oldIdentity, { ...oldIdentity, exp: currentExpiry }, { ...oldIdentity, sid: undefined, exp: currentExpiry }]) {
      await expect(backend.withIdentity(identity).mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {}))
        .resolves.toBe(false)
      await expect(resolveInteractiveContext(backend, identity))
        .rejects.toEqual(new InteractiveAuthorityError('credential_not_current'))
    }
    await expect(collectAuthorityTables(backend)).resolves.toEqual(before)
  })

  it.each(['before_revocation', 'future', 'ended', 'wrong_principal'] as const)(
    'refuses %s creation evidence without changing the revoked generation', async scenario => {
      const backend = await revokedOwner()
      const before = await collectAuthorityTables(backend)
      if (scenario === 'wrong_principal') {
        const otherToken = 'https://clerk.example.test|user_other'
        await backend.withIdentity(provisionedIdentity(otherToken, { exp: undefined, sid: 'sess_other' }))
          .mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})
        await observe(backend, 'sess_new', 'session.created', NOW + 2_000, otherToken)
      } else {
        await observe(backend, 'sess_new', 'session.created', scenario === 'before_revocation' ? NOW :
          scenario === 'future' ? NOW + 3_000 : NOW + 2_000)
        if (scenario === 'ended') await observe(backend, 'sess_new', 'session.ended', NOW + 2_000)
      }
      await expect(backend.withIdentity(newIdentity).mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {}))
        .resolves.toBe(false)
      const after = await collectAuthorityTables(backend)
      expect(after.bindings.find(row => row.bindingRef === before.bindings[0]!.bindingRef)).toEqual(before.bindings[0])
      expect(after.credentials.filter(row => row.bindingRef === before.bindings[0]!.bindingRef)).toEqual(before.credentials)
    },
  )
})

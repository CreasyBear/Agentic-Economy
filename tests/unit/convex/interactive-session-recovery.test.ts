import type { UserIdentity } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../../convex/_generated/api'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import { createCustomerRequestServiceAssertion } from '../../../src/modules/agent-access/service-auth-envelope'
import {
  CLERK_SECURITY_OBSERVE_OPERATION,
  CLERK_SECURITY_OBSERVE_SCOPE,
  type ClerkSecurityObservation,
} from '../../../src/modules/security/account-security'
import {
  collectAuthorityTables,
  createInteractiveAuthorityBackend as createBackend,
  expectInteractiveMaterialize as expectMaterialize,
  seededInteractiveAuthorityBackend as seededBackend,
  type InteractiveAuthorityBackend,
} from '../../helpers/interactive-authority-runtime'
import {
  INTERACTIVE_AUTHORITY_NOW as NOW,
  INTERACTIVE_TOKEN_IDENTIFIER as TOKEN_IDENTIFIER,
} from '../../helpers/interactive-authority-seed'

const SERVICE_KEY = 'interactive-session-recovery-service-key-32'
const OLD_SESSION = 'sess_before_revocation'
const NEW_SESSION = 'sess_after_revocation'
const REVOKED_AT = NOW + 1_000
const CREATED_AT = NOW + 2_000

const sessionIdentity = (sid: string | undefined = OLD_SESSION, overrides: Partial<UserIdentity> = {}): UserIdentity => ({
  subject: 'user_sam',
  issuer: 'https://clerk.example.test',
  tokenIdentifier: TOKEN_IDENTIFIER,
  ...(sid === undefined ? {} : { sid }),
  ...overrides,
})

/**
 * Requires: verified session-bound Clerk identity and service-signed events.
 * Ensures: new-session recovery retains the canonical owner and issues one
 * generation; the old bearer fails before recovery and after every rotation.
 * Invariant: revocation cutoffs never decrease, revoked rows stay revoked, and
 * missing/malformed evidence cannot write authority or initialize a cutoff.
 * On violation: materialization returns false and reads return no authority.
 *
 * Retry/concurrency: binding-generation reads/writes and expiry scheduling share
 * one Convex transaction; delivery hashes deduplicate webhook effects. Expected
 * proof failures are recoverable refusals, with no partial authority writes.
 */
describe('interactive session recovery after revocation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', SERVICE_KEY)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('permits first signup when session.created arrived before the binding existed', async () => {
    const backend = createBackend()
    await expect(observe(backend, 'session.created', OLD_SESSION, NOW - 1))
      .resolves.toMatchObject({ kind: 'accepted', status: 'ignored' })
    const owner = backend.withIdentity(sessionIdentity())
    await expectMaterialize(owner, true)
    const rows = await collectAuthorityTables(backend)
    expect(rows.bindings[0]?.interactiveSessionsRevokedBefore).toBe(0)
    await expect(owner.query(internal.interactiveAuthority.readCurrentInteractiveAuthorityFacts, {}))
      .resolves.toMatchObject({ context: { principalRef: rows.principals[0]?.principalRef } })
  })

  it('recovers once for concurrent new sessions and keeps the old bearer denied after rotation', async () => {
    const backend = await revokedBackend()
    const revoked = await collectAuthorityTables(backend)
    const old = backend.withIdentity(sessionIdentity())
    await expectMaterialize(old, false)
    await expect(old.query(internal.interactiveAuthority.readCurrentInteractiveAuthorityFacts, {})).resolves.toBeNull()

    vi.setSystemTime(CREATED_AT)
    await observe(backend, 'session.created', NEW_SESSION, CREATED_AT)
    await observe(backend, 'session.created', 'sess_second_fresh_session', CREATED_AT)
    const fresh = backend.withIdentity(sessionIdentity(NEW_SESSION))
    const concurrent = backend.withIdentity(sessionIdentity('sess_second_fresh_session'))
    await expect(Promise.all([
      fresh.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {}),
      concurrent.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {}),
      fresh.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {}),
    ])).resolves.toEqual([true, true, true])
    const recovered = await collectAuthorityTables(backend)
    expect(recovered.credentials).toHaveLength(2)
    expect(recovered.credentials.find(({ generation }) => generation === 1)).toEqual(revoked.credentials[0])
    expect(recovered.credentials.filter(({ lifecycle }) => lifecycle === 'active')).toHaveLength(1)
    expect(recovered.principals).toEqual(revoked.principals)
    expect(recovered.accounts).toEqual(revoked.accounts)
    expect(recovered.ownerships).toEqual(revoked.ownerships)
    expect(recovered.bindings[0]).toMatchObject({
      bindingRef: revoked.bindings[0]?.bindingRef,
      credentialGeneration: 2,
      interactiveSessionsRevokedBefore: REVOKED_AT,
    })
    await expectMaterialize(fresh, true)
    await expect(collectAuthorityTables(backend)).resolves.toEqual(recovered)

    for (const elapsed of [0, 40_000]) {
      vi.setSystemTime(CREATED_AT + elapsed)
      await expectMaterialize(fresh, true)
      await expect(fresh.query(internal.interactiveAuthority.readCurrentInteractiveAuthorityFacts, {}))
        .resolves.toMatchObject({ context: { principalRef: recovered.principals[0]?.principalRef } })
      const beforeReplay = await collectAuthorityTables(backend)
      await expectMaterialize(old, false)
      await expect(old.query(internal.interactiveAuthority.readCurrentInteractiveAuthorityFacts, {})).resolves.toBeNull()
      await expect(collectAuthorityTables(backend)).resolves.toEqual(beforeReplay)
    }
    const rotated = await collectAuthorityTables(backend)
    expect(rotated.bindings[0]?.credentialGeneration).toBe(3)
    expect(rotated.credentials.filter(({ lifecycle }) => lifecycle === 'revoked')).toEqual(revoked.credentials)
  })

  it.each([
    ['missing creation event', NEW_SESSION, undefined],
    ['session created before cutoff', NEW_SESSION, REVOKED_AT - 1],
    ['session created at cutoff', NEW_SESSION, REVOKED_AT],
    ['missing sid', undefined, CREATED_AT],
    ['malformed sid', 'not-a-session', CREATED_AT],
  ] as const)('refuses %s without changing authority', async (_case, sid, observedAt) => {
    const backend = await revokedBackend()
    vi.setSystemTime(CREATED_AT)
    if (observedAt !== undefined) await observe(backend, 'session.created', NEW_SESSION, observedAt)
    const before = await collectAuthorityTables(backend)
    const identity = sid === undefined ? sessionIdentity(OLD_SESSION, { sid: undefined }) : sessionIdentity(sid)
    const owner = backend.withIdentity(identity)
    await expectMaterialize(owner, false)
    await expect(owner.query(internal.interactiveAuthority.readCurrentInteractiveAuthorityFacts, {})).resolves.toBeNull()
    await expect(collectAuthorityTables(backend)).resolves.toEqual(before)
  })

  it('recovers after delayed signed creation evidence arrives, without bypassing the prior refusal', async () => {
    const backend = await revokedBackend()
    vi.setSystemTime(CREATED_AT + 1_000)
    const owner = backend.withIdentity(sessionIdentity(NEW_SESSION))
    const before = await collectAuthorityTables(backend)
    await expectMaterialize(owner, false)
    await expect(collectAuthorityTables(backend)).resolves.toEqual(before)
    await observe(backend, 'session.created', NEW_SESSION, CREATED_AT)
    await expectMaterialize(owner, true)
  })

  it('refuses an ended session even before the first revocation cutoff', async () => {
    const backend = createBackend()
    const owner = backend.withIdentity(sessionIdentity())
    await expectMaterialize(owner, true)
    await observe(backend, 'session.ended', OLD_SESSION, NOW)
    const before = await collectAuthorityTables(backend)
    expect(before.bindings[0]?.interactiveSessionsRevokedBefore).toBe(0)
    expect(before.credentials[0]?.lifecycle).toBe('active')
    await expectMaterialize(owner, false)
    await expect(owner.query(internal.interactiveAuthority.readCurrentInteractiveAuthorityFacts, {})).resolves.toBeNull()
    await expect(collectAuthorityTables(backend)).resolves.toEqual(before)
  })

  it('does not reopen a closed session when its creation event is delivered later', async () => {
    const backend = await revokedBackend()
    vi.setSystemTime(CREATED_AT + 2_000)
    await observe(backend, 'session.ended', NEW_SESSION, CREATED_AT + 1_000)
    await observe(backend, 'session.created', NEW_SESSION, CREATED_AT)
    await expectMaterialize(backend.withIdentity(sessionIdentity(NEW_SESSION)), false)
  })

  it('keeps the cutoff monotonic across duplicate and delayed revocations after recovery', async () => {
    const backend = await revokedBackend()
    vi.setSystemTime(CREATED_AT)
    await observe(backend, 'session.created', NEW_SESSION, CREATED_AT)
    const owner = backend.withIdentity(sessionIdentity(NEW_SESSION))
    await expectMaterialize(owner, true)
    const before = await collectAuthorityTables(backend)
    await expect(observe(backend, 'session.revoked', OLD_SESSION, REVOKED_AT))
      .resolves.toMatchObject({ status: 'replayed' })
    await expect(collectAuthorityTables(backend)).resolves.toEqual(before)
    await observe(backend, 'session.revoked', 'sess_delayed_old_session', REVOKED_AT - 500)
    await expect(collectAuthorityTables(backend)).resolves.toEqual(before)
    await expectMaterialize(owner, true)

    vi.setSystemTime(CREATED_AT + 1_000)
    await observe(backend, 'session.revoked', NEW_SESSION, CREATED_AT + 1_000)
    await observe(backend, 'session.revoked', 'sess_delayed_old_session', REVOKED_AT)
    const after = await collectAuthorityTables(backend)
    expect(after.bindings[0]?.interactiveSessionsRevokedBefore).toBe(CREATED_AT + 1_000)
    expect(after.credentials.every(({ lifecycle }) => lifecycle === 'revoked')).toBe(true)
    await expectMaterialize(owner, false)
  })

  it('denies a session created before a later password change even if its credential was issued later', async () => {
    const backend = await revokedBackend()
    vi.setSystemTime(CREATED_AT + 10_000)
    await observe(backend, 'session.created', NEW_SESSION, CREATED_AT)
    const owner = backend.withIdentity(sessionIdentity(NEW_SESSION))
    await expectMaterialize(owner, true)
    await observe(backend, 'user.updated', 'security-profile', CREATED_AT + 1_000)
    const before = await collectAuthorityTables(backend)
    expect(before.credentials.some(({ lifecycle }) => lifecycle === 'active')).toBe(true)
    await expect(owner.query(internal.interactiveAuthority.readCurrentInteractiveAuthorityFacts, {})).resolves.toBeNull()
    await expectMaterialize(owner, false)
    await expect(collectAuthorityTables(backend)).resolves.toEqual(before)
  })

  it('reads legacy history without writing and initializes the cutoff only on materialization', async () => {
    const backend = await seededBackend({ omitSessionRevocationCutoff: true })
    const owner = backend.withIdentity(sessionIdentity())
    const before = await collectAuthorityTables(backend)
    await expect(owner.query(internal.interactiveAuthority.readCurrentInteractiveAuthorityFacts, {}))
      .resolves.toMatchObject({ context: { principalRef: before.principals[0]?.principalRef } })
    await expect(collectAuthorityTables(backend)).resolves.toEqual(before)
    await expectMaterialize(owner, true)
    const after = await collectAuthorityTables(backend)
    expect(after.bindings[0]?.interactiveSessionsRevokedBefore).toBe(0)
  })

  it.each([false, true])('honors manual credential revocation with legacy cutoff=%s and valid exp', async (legacy) => {
    const backend = await seededBackend({ omitSessionRevocationCutoff: legacy })
    await backend.run(async (ctx) => {
      const credential = (await ctx.db.query('credentials').collect())[0]!
      await ctx.db.patch(credential._id, { lifecycle: 'revoked', revokedAt: REVOKED_AT })
    })
    vi.setSystemTime(CREATED_AT)
    const before = await collectAuthorityTables(backend)
    const old = backend.withIdentity(sessionIdentity(OLD_SESSION, { exp: 100 }))
    await expectMaterialize(old, false)
    await expect(collectAuthorityTables(backend)).resolves.toEqual(before)
    await observe(backend, 'session.created', NEW_SESSION, CREATED_AT)
    const fresh = backend.withIdentity(sessionIdentity(NEW_SESSION, { exp: 100 }))
    await expectMaterialize(fresh, true)
    const after = await collectAuthorityTables(backend)
    expect(after.bindings[0]?.interactiveSessionsRevokedBefore).toBe(REVOKED_AT)
    expect(after.credentials.find(({ lifecycle }) => lifecycle === 'revoked')).toEqual(before.credentials[0])
    await expectMaterialize(old, false)
    await expect(old.query(internal.interactiveAuthority.readCurrentInteractiveAuthorityFacts, {})).resolves.toBeNull()
  })

  it('bootstraps a legacy historical maximum before applying an older security observation', async () => {
    const backend = await seededBackend({ omitSessionRevocationCutoff: true })
    await backend.run(async (ctx) => {
      const credential = (await ctx.db.query('credentials').collect())[0]!
      await ctx.db.patch(credential._id, { lifecycle: 'revoked', revokedAt: CREATED_AT })
    })
    vi.setSystemTime(CREATED_AT + 1_000)
    await observe(backend, 'session.revoked', OLD_SESSION, REVOKED_AT)
    const after = await collectAuthorityTables(backend)
    expect(after.bindings[0]?.interactiveSessionsRevokedBefore).toBe(CREATED_AT)
  })

  it.each(['session.revoked', 'user.updated'] as const)(
    'includes a later legacy %s when the earlier event already revoked every credential', async (eventType) => {
      const backend = await revokedBackend()
      const laterRevocation = CREATED_AT + 1_000
      vi.setSystemTime(laterRevocation)
      await observe(backend, eventType, 'sess_later_revocation', laterRevocation)
      await observe(backend, 'session.created', NEW_SESSION, CREATED_AT)
      await backend.run(async (ctx) => {
        const binding = (await ctx.db.query('externalIdentityBindings').collect())[0]!
        await ctx.db.patch(binding._id, { interactiveSessionsRevokedBefore: undefined })
      })
      const before = await collectAuthorityTables(backend)
      expect(before.credentials[0]?.revokedAt).toBe(REVOKED_AT)
      await expectMaterialize(backend.withIdentity(sessionIdentity(NEW_SESSION)), false)
      await expect(collectAuthorityTables(backend)).resolves.toEqual(before)

      vi.setSystemTime(laterRevocation + 1_000)
      await observe(backend, 'session.created', 'sess_after_both_revocations', laterRevocation + 1_000)
      await expectMaterialize(backend.withIdentity(sessionIdentity('sess_after_both_revocations')), true)
      const after = await collectAuthorityTables(backend)
      expect(after.bindings[0]?.interactiveSessionsRevokedBefore).toBe(laterRevocation)
    },
  )

  it('compares provider creation and revocation times without assuming the receipt clock matches', async () => {
    const backend = await revokedBackend()
    vi.setSystemTime(CREATED_AT)
    await observe(backend, 'session.created', NEW_SESSION, CREATED_AT + 5_000)
    await expectMaterialize(backend.withIdentity(sessionIdentity(NEW_SESSION)), true)
  })

  it.each(['credentials', 'observations'] as const)('refuses oversized legacy %s history without a partial cutoff', async (history) => {
    const backend = await revokedBackend()
    await backend.run(async (ctx) => {
      const binding = (await ctx.db.query('externalIdentityBindings').collect())[0]!
      await ctx.db.patch(binding._id, { interactiveSessionsRevokedBefore: undefined })
      if (history === 'credentials') {
        const { _id, _creationTime, ...credential } = (await ctx.db.query('credentials').collect())[0]!
        void _id
        void _creationTime
        for (let index = 0; index < 256; index += 1) {
          await ctx.db.insert('credentials', { ...credential, credentialRef: `legacy-credential:${index}` })
        }
      } else {
        const { _id, _creationTime, ...observation } = (await ctx.db.query('auditEvents').collect())[0]!
        void _id
        void _creationTime
        for (let index = 0; index < 256; index += 1) {
          await ctx.db.insert('auditEvents', { ...observation, eventId: `legacy-event:${index}` })
        }
      }
    })
    vi.setSystemTime(CREATED_AT)
    await observe(backend, 'session.created', NEW_SESSION, CREATED_AT)
    const before = await collectAuthorityTables(backend)
    const owner = backend.withIdentity(sessionIdentity(NEW_SESSION))
    await expectMaterialize(owner, false)
    await expect(owner.query(internal.interactiveAuthority.readCurrentInteractiveAuthorityFacts, {})).resolves.toBeNull()
    await expect(collectAuthorityTables(backend)).resolves.toEqual(before)
  })

  it('rejects missing session proof on every read even when a recovered active credential exists', async () => {
    const backend = await revokedBackend()
    vi.setSystemTime(CREATED_AT)
    await observe(backend, 'session.created', NEW_SESSION, CREATED_AT)
    await expectMaterialize(backend.withIdentity(sessionIdentity(NEW_SESSION)), true)
    const before = await collectAuthorityTables(backend)
    const unobserved = backend.withIdentity(sessionIdentity('sess_unobserved'))
    await expect(unobserved.query(internal.interactiveAuthority.readCurrentInteractiveAuthorityFacts, {})).resolves.toBeNull()
    await expectMaterialize(unobserved, false)
    await expect(collectAuthorityTables(backend)).resolves.toEqual(before)
  })

  it.each(['foreign principal', 'untrusted source', 'malformed creation', 'conflicting creation'] as const)(
    'refuses %s evidence', async (fault) => {
      const backend = await revokedBackend()
      vi.setSystemTime(CREATED_AT)
      await observe(backend, 'session.created', NEW_SESSION, CREATED_AT)
      await backend.run(async (ctx) => {
        const event = (await ctx.db.query('auditEvents').collect())
          .find(({ eventType }) => eventType === 'account.session.created')!
        if (fault === 'foreign principal') await ctx.db.patch(event._id, { actorRef: 'prn_foreign' })
        if (fault === 'untrusted source') await ctx.db.patch(event._id, { sourceSystem: 'ae_recorded' })
        if (fault === 'malformed creation') await ctx.db.patch(event._id, { observedAt: CREATED_AT + 0.5 })
      })
      if (fault === 'conflicting creation') {
        await observe(backend, 'session.created', NEW_SESSION, CREATED_AT - 1)
      }
      const before = await collectAuthorityTables(backend)
      await expectMaterialize(backend.withIdentity(sessionIdentity(NEW_SESSION)), false)
      await expect(collectAuthorityTables(backend)).resolves.toEqual(before)
    },
  )
})

async function revokedBackend(): Promise<InteractiveAuthorityBackend> {
  const backend = createBackend()
  await expectMaterialize(backend.withIdentity(sessionIdentity()), true)
  vi.setSystemTime(REVOKED_AT)
  await observe(backend, 'session.revoked', OLD_SESSION, REVOKED_AT)
  return backend
}

async function observe(
  backend: InteractiveAuthorityBackend,
  eventType: ClerkSecurityObservation['eventType'],
  sid: string,
  observedAt: number,
) {
  const command: ClerkSecurityObservation = {
    deliveryRefHash: canonicalDigest({ eventType, sid, observedAt }),
    providerIdentifier: TOKEN_IDENTIFIER,
    eventType,
    targetRefHash: canonicalDigest({
      contract: 'ae.clerk-webhook-target:v1',
      provider: 'clerk',
      targetKind: eventType === 'user.updated' ? 'security_profile' : 'session',
      targetRef: sid,
    }),
    observedAt,
    securityAction: eventType === 'session.revoked' || eventType === 'user.updated'
      ? 'revoke_interactive_credentials'
      : 'observe_only',
  }
  const serviceAuth = await createCustomerRequestServiceAssertion({
    key: SERVICE_KEY,
    operation: CLERK_SECURITY_OBSERVE_OPERATION,
    command,
    principal: {
      principalId: 'ae:server-function',
      ownerId: 'ae:server-function',
      credentialId: 'ae:server-function',
      scopes: [CLERK_SECURITY_OBSERVE_SCOPE],
    },
    issuedAt: Date.now(),
  })
  return await backend.mutation(api.securityAccountHistory.recordClerkSecurityEventForServer, {
    ...command,
    serviceAuth: { ...serviceAuth, scopes: [...serviceAuth.scopes] },
  })
}

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encodePaymentResponseHeader } from '@x402/core/http'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  ProviderConsequencePreReleaseRefusal,
  providerConsequenceInvocationDigest,
  providerConsequenceTicketClaimsDigest,
  type CanonicalProviderConsequenceTicket,
  type JitProviderX402RuntimeFactory,
  type ProviderConsequenceJournalBeginResult,
  type ProviderConsequenceTicketVerifier,
} from '@/modules/capability-execution/provider-consequence-runtime'
import { secretGeneration, secretRef } from '@/modules/secrets/public'
import type { RouteTransportFetch, RouteTransportInvocation } from '@/modules/capability-supply/route-transport-runtime'
import {
  buildTrackedX402Factory,
  callbackScopedX402Runtime,
  CLAIM_REF,
  CREDENTIAL,
  execute,
  expectExecute,
  expectJournalBeginForTicket,
  expectJsonExcludesCredential,
  expectNoJournalBeginOrSend,
  expectNoSend,
  expectRefusedTicketInvalid,
  harness,
  journal,
  journalWithBegin,
  journalWithPatches,
  jitInvocation,
  jwt,
  NOW,
  OPAQUE_TICKET,
  PAYMENT_GENERATION,
  PAYMENT_REF,
  paymentRequired402Response,
  REF,
  requestDigest,
  sendReturning402,
  ticket,
  unreadableJsonResponse,
  vaultFetch,
  viCallbackScopedX402Factory,
  X402_PAYMENT_CREDENTIAL_REF,
  x402Challenge,
  x402Harness,
} from './jit-provider-consequence.harness'

const { getVercelOidcToken } = vi.hoisted(() => ({ getVercelOidcToken: vi.fn() }))
vi.mock('@vercel/oidc', () => ({ getVercelOidcToken }))

describe('JIT provider consequence boundary', () => {
  beforeEach(() => {
    getVercelOidcToken.mockReset()
    getVercelOidcToken.mockResolvedValue(jwt())
  })

  it('performs provider I/O inside callback-scoped production customer secret use', async () => {
    const routeInvocation = jitInvocation()
    const canonicalTicket = ticket(routeInvocation)
    let callbackActive = false
    const active = harness({
      routeInvocation,
      verifiedTicket: canonicalTicket,
      send: vi.fn<RouteTransportFetch>(async (_target, init) => {
        callbackActive = true
        expect(init?.headers).toMatchObject({ Authorization: `Bearer ${CREDENTIAL}` })
        return Response.json({ serviceReference: 'service:jit' })
      }),
    })

    const result = await execute(active)

    expect(result).toMatchObject({
      transport: 'http',
      disposition: 'succeeded',
      releaseStarted: true,
      outputJson: JSON.stringify({ serviceReference: 'service:jit' }),
    })
    expect(callbackActive).toBe(true)
    expect(active.send).toHaveBeenCalledOnce()
    expectJournalBeginForTicket(active.durableJournal, canonicalTicket)
    expect(active.durableJournal.complete).toHaveBeenCalledWith({ claimRef: CLAIM_REF, observation: result })
    expectJsonExcludesCredential(result)
  })

  it.each([
    ['blank opaque ticket', '', async () => ticket()],
    ['unverifiable ticket', 'opaque-ticket', async () => undefined],
    ['verifier outage', 'opaque-ticket', async () => { throw new Error('verification-outage') }],
  ])('fails closed before journal or provider I/O for %s', async (_case, opaque, verifyTicket) => {
    const active = harness({ verifyTicket, send: vi.fn<RouteTransportFetch>() })
    await expectExecute(active, {
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_ticket_invalid',
    }, opaque)
    expectNoJournalBeginOrSend(active)
  })

  it.each([
    ['expired ticket', (value: CanonicalProviderConsequenceTicket) => ({ ...value, expiresAt: NOW })],
    ['future-issued ticket', (value: CanonicalProviderConsequenceTicket) => ({ ...value, issuedAt: NOW + 1 })],
    ['request digest substitution', (value: CanonicalProviderConsequenceTicket) => ({ ...value, requestDigest: canonicalDigest({ request: 'other' }) })],
    ['invocation digest substitution', (value: CanonicalProviderConsequenceTicket) => ({ ...value, invocationDigest: canonicalDigest({ invocation: 'other' }) })],
    ['lease substitution', (value: CanonicalProviderConsequenceTicket) => ({ ...value, leaseRef: 'lease:other' })],
    ['cross-account connection substitution', (value: CanonicalProviderConsequenceTicket) => ({ ...value, connectionRef: 'connection:other' })],
    ['authority generation substitution', (value: CanonicalProviderConsequenceTicket) => ({ ...value, authorityGeneration: 5 })],
    ['authority digest substitution', (value: CanonicalProviderConsequenceTicket) => ({ ...value, authorityDigest: canonicalDigest({ authority: 'other' }) })],
    ['scope widening', (value: CanonicalProviderConsequenceTicket) => ({ ...value, grantedScopes: [...value.grantedScopes, 'admin:*'] })],
    ['resource widening', (value: CanonicalProviderConsequenceTicket) => ({ ...value, grantedResources: [...value.grantedResources, 'account:other'] })],
    ['readiness substitution', (value: CanonicalProviderConsequenceTicket) => ({ ...value, readinessValidUntil: value.readinessValidUntil - 1 })],
    ['pointer generation malformed', (value: CanonicalProviderConsequenceTicket) => ({ ...value, secret: { ...value.secret, activeGeneration: 'provider-generation' } })],
    ['account attribution malformed', (value: CanonicalProviderConsequenceTicket) => ({ ...value, activeAccountRef: 'account:caller' })],
    ['unverified cross-account attribution', (value: CanonicalProviderConsequenceTicket) => ({ ...value, activeAccountRef: 'acc_22222222222222222222222222222222' })],
  ])('rejects hostile canonical-ticket mismatch: %s', async (_case, mutate) => {
    const routeInvocation = jitInvocation()
    const active = harness({
      routeInvocation,
      verifiedTicket: mutate(ticket(routeInvocation)) as CanonicalProviderConsequenceTicket,
      send: vi.fn<RouteTransportFetch>(),
    })
    await expectRefusedTicketInvalid(active, routeInvocation)
  })

  it('does not disclose or send when a valid ticket is replayed against another connection', async () => {
    const original = jitInvocation()
    const substituted = jitInvocation()
    if (substituted.binding.authority.kind !== 'provider_connection') throw new Error('test_fixture_invalid')
    const crossAccountInvocation: RouteTransportInvocation = {
      ...substituted,
      binding: {
        ...substituted.binding,
        authority: { ...substituted.binding.authority, connectionRef: 'connection:other-account' },
      },
    }
    const active = harness({
      routeInvocation: crossAccountInvocation,
      verifiedTicket: ticket(original),
      send: vi.fn<RouteTransportFetch>(),
    })

    const result = await execute(active, OPAQUE_TICKET, crossAccountInvocation)
    expect(result).toMatchObject({ disposition: 'refused', failureCode: 'provider_consequence_ticket_invalid' })
    expectNoSend(active)
    expect(JSON.stringify(result)).not.toContain('acc_11111111111111111111111111111111')
  })

  it('binds account and secret claims to the durable issued ticket before secret or provider I/O', async () => {
    const routeInvocation = jitInvocation()
    const issued = ticket(routeInvocation)
    const substituted: CanonicalProviderConsequenceTicket = {
      ...issued,
      owningAccountRef: 'acc_22222222222222222222222222222222',
      activeAccountRef: 'acc_22222222222222222222222222222222',
      secret: {
        secretRef: secretRef('sec_22222222222222222222222222222222'),
        activeGeneration: secretGeneration('sgn_22222222222222222222222222222222'),
        pointerRevision: 9,
      },
    }
    expect(substituted.requestDigest).toBe(issued.requestDigest)
    expect(substituted.invocationDigest).toBe(issued.invocationDigest)
    expect(providerConsequenceTicketClaimsDigest(substituted)).not.toBe(
      providerConsequenceTicketClaimsDigest(issued),
    )
    const active = harness({
      routeInvocation,
      verifiedTicket: substituted,
      journal: journalWithBegin(async (input: any) => input.ticketClaimsDigest === providerConsequenceTicketClaimsDigest(issued)
        ? { kind: 'claimed', claimRef: CLAIM_REF }
        : { kind: 'unavailable' }),
    })
    await expectExecute(active, {
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_ticket_unavailable',
    })
    expect(getVercelOidcToken).not.toHaveBeenCalled()
    expectNoSend(active)
  })

  it('binds call identity and monetary authority even though the legacy request digest omits them', async () => {
    const original = jitInvocation()
    const altered: RouteTransportInvocation = {
      ...original,
      authority: {
        ...original.authority,
        maximumSpend: { currency: 'USD', units: '999999', exponent: 2 },
        callIdentity: { keyId: 'attacker-key', signature: 'hmac-sha256:attacker' },
      },
    }
    expect(requestDigest(altered)).toBe(requestDigest(original))
    expect(providerConsequenceInvocationDigest(altered)).not.toBe(providerConsequenceInvocationDigest(original))
    const active = harness({ routeInvocation: altered, verifiedTicket: ticket(original) })
    await expectRefusedTicketInvalid(active, altered)
  })

  it('digests only fully materialized provider consequences and canonicalizes absent optional fields', () => {
    const provider = jitInvocation()
    const keyless: RouteTransportInvocation = {
      ...provider,
      binding: { ...provider.binding, authority: { kind: 'public_upstream' } },
      authority: {
        attemptRef: provider.authority.attemptRef,
        operationKeyDigest: provider.authority.operationKeyDigest,
        mandateDigest: provider.authority.mandateDigest,
        grantDigest: provider.authority.grantDigest,
        capabilityContractDigest: provider.authority.capabilityContractDigest,
        maximumSpend: provider.authority.maximumSpend,
        expiresAt: provider.authority.expiresAt,
        callIdentity: provider.authority.callIdentity,
      },
    }
    expect(providerConsequenceInvocationDigest(keyless)).toBeUndefined()

    const missingAuthority = { ...provider.authority }
    Reflect.deleteProperty(missingAuthority, 'readinessValidUntil')
    expect(providerConsequenceInvocationDigest({ ...provider, authority: missingAuthority })).toBeUndefined()

    const optionalAbsent = { ...provider.authority }
    Reflect.deleteProperty(optionalAbsent, 'effectGeneration')
    Reflect.deleteProperty(optionalAbsent, 'readinessDigest')
    expect(providerConsequenceInvocationDigest({ ...provider, authority: optionalAbsent })).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it.each([
    { label: 'unavailable', beginResult: { kind: 'unavailable' as const }, disposition: 'refused', releaseStarted: false, failureCode: 'provider_consequence_ticket_unavailable' },
    { label: 'started', beginResult: { kind: 'started' as const }, disposition: 'unknown', releaseStarted: true, failureCode: 'provider_consequence_started' },
  ])('honors durable single-use journal state $label without a duplicate send', async ({
    beginResult,
    disposition,
    releaseStarted,
    failureCode,
  }) => {
    const active = harness({
      journal: journalWithBegin(async () => beginResult as ProviderConsequenceJournalBeginResult),
      send: vi.fn<RouteTransportFetch>(),
    })
    const result = await execute(active)
    expect(result).toMatchObject({ disposition, releaseStarted, failureCode })
    expectNoSend(active)
  })

  it('returns the exact sanitized completed replay without reacquiring material or sending', async () => {
    const routeInvocation = jitInvocation()
    const replay = {
      transport: 'http' as const,
      disposition: 'succeeded' as const,
      releaseStarted: true,
      requestDigest: requestDigest(routeInvocation),
      outputJson: JSON.stringify({ serviceReference: 'service:replayed' }),
    }
    const active = harness({
      routeInvocation,
      journal: journalWithBegin(async () => ({ kind: 'completed' as const, observation: replay })),
      send: vi.fn<RouteTransportFetch>(),
    })
    await expect(execute(active)).resolves.toEqual(replay)
    expect(getVercelOidcToken).not.toHaveBeenCalled()
    expectNoSend(active)
  })

  it('turns an invalid completed replay or journal outage into a fixed fail-closed outcome', async () => {
    const routeInvocation = jitInvocation()
    const invalidReplay = harness({
      routeInvocation,
      journal: journalWithBegin(async () => ({
        kind: 'completed' as const,
        observation: {
          transport: 'http' as const,
          disposition: 'succeeded' as const,
          releaseStarted: true,
          requestDigest: canonicalDigest({ request: 'other' }),
        },
      })),
    })
    await expectExecute(invalidReplay, {
      disposition: 'unknown',
      failureCode: 'provider_consequence_replay_invalid',
    })

    const outage = harness({
      routeInvocation,
      journal: journalWithBegin(async () => { throw new Error('journal-outage') }),
    })
    await expectExecute(outage, {
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_journal_unavailable',
    })
  })

  it.each([
    ['non-object result', null],
    ['missing result kind', {}],
    ['unrecognized kind', { kind: 'other' }],
    ['claimed without a canonical claim ref', { kind: 'claimed', claimRef: ' claim:test ' }],
    ['started with caller-shaped fields', { kind: 'started', claimRef: 'claim:test' }],
    ['unavailable with caller-shaped fields', { kind: 'unavailable', retry: true }],
    ['completed without a canonical observation', {
      kind: 'completed',
      observation: { transport: 'http', disposition: 'succeeded', releaseStarted: 'yes' },
    }],
  ])('rejects malformed remote journal result before secret or provider I/O: %s', async (_case, remoteResult) => {
    const durableJournal = journalWithBegin(async () => remoteResult)
    const active = harness({ journal: durableJournal })
    await expectExecute(active, {
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_journal_invalid',
    })
    expect(getVercelOidcToken).not.toHaveBeenCalled()
    expectNoSend(active)
    expect(durableJournal.complete).not.toHaveBeenCalled()
    expect(durableJournal.abortBeforeRelease).not.toHaveBeenCalled()
  })

  it('rejects a non-serializable completed journal observation before secret or provider I/O', async () => {
    const observation: Record<string, unknown> = { kind: 'completed' }
    observation.observation = observation
    const active = harness({ journal: journalWithBegin(async () => observation) })
    await expectExecute(active, {
      disposition: 'refused',
      failureCode: 'provider_consequence_journal_invalid',
    })
    expectNoSend(active)
  })

  it('fails closed before provider I/O on exact stale pointer, identity, and vault outages', async () => {
    const stale = harness({
      pointer: Object.freeze({
        secretRef: REF,
        activeGeneration: secretGeneration('sgn_22222222222222222222222222222222'),
        revision: 8,
      }),
    })
    await expectExecute(stale, {
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_secret_unavailable',
    })
    expectNoSend(stale)
    expect(stale.durableJournal.abortBeforeRelease).toHaveBeenCalledOnce()

    getVercelOidcToken.mockRejectedValueOnce(new Error(`identity-${CREDENTIAL}`))
    const identity = harness()
    await expectExecute(identity, {
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_secret_unavailable',
    })
    expectNoSend(identity)

    const vaultHarness = harness({ vaultFetch: vi.fn(async () => { throw new Error(`vault-${CREDENTIAL}`) }) as typeof fetch })
    const vaultResult = await execute(vaultHarness)
    expect(vaultResult).toMatchObject({ disposition: 'refused', failureCode: 'provider_consequence_secret_unavailable' })
    expectJsonExcludesCredential(vaultResult)
    expectNoSend(vaultHarness)
  })

  it('records started transport failures as unknown and never performs a duplicate send', async () => {
    const durableJournal = journal()
    const send = vi.fn<RouteTransportFetch>(async () => { throw new Error(`network-${CREDENTIAL}`) })
    const active = harness({ journal: durableJournal, send })
    const first = await execute(active)
    expect(first).toMatchObject({ disposition: 'unknown', releaseStarted: true })
    expect(send).toHaveBeenCalledOnce()
    expect(durableJournal.complete).toHaveBeenCalledOnce()
    expectJsonExcludesCredential(first)

    const replay = harness({
      journal: journalWithBegin(async () => ({ kind: 'started' as const })),
      send,
    })
    await expectExecute(replay, {
      disposition: 'unknown',
      failureCode: 'provider_consequence_started',
    })
    expect(send).toHaveBeenCalledOnce()
  })

  it('returns reconciliation-required unknown when the completion acknowledgement is unavailable', async () => {
    const active = harness({
      journal: journalWithPatches({
        complete: async () => { throw new Error('completion-outage') },
      }),
    })
    await expectExecute(active, {
      disposition: 'unknown',
      releaseStarted: true,
      failureCode: 'provider_consequence_completion_unknown',
    })
    expect(active.send).toHaveBeenCalledOnce()
  })

  it('returns route preparation refusal before ticket verification', async () => {
    const malformed = jitInvocation()
    const invalidInvocation: RouteTransportInvocation = {
      ...malformed,
      binding: { ...malformed.binding, configDigest: canonicalDigest({ config: 'wrong' }) },
    }
    const verifyTicket = vi.fn<ProviderConsequenceTicketVerifier>()
    const active = harness({ routeInvocation: invalidInvocation, verifyTicket })
    const result = await execute(active, OPAQUE_TICKET, invalidInvocation)
    expect(result).toMatchObject({ disposition: 'refused', failureCode: 'adapter_config_invalid' })
    expect(verifyTicket).not.toHaveBeenCalled()
  })

  it('requires a provider lease authority with every consequence binding field materialized', async () => {
    const routeInvocation = jitInvocation()
    const missing = [
      'callRef',
      'toolRef',
      'leaseRef',
      'grantedScopes',
      'grantedResources',
      'readinessValidUntil',
    ] as const
    for (const field of missing) {
      const authority = { ...routeInvocation.authority }
      Reflect.deleteProperty(authority, field)
      const malformed: RouteTransportInvocation = { ...routeInvocation, authority }
      const active = harness({ routeInvocation: malformed })
      const result = await execute(active, OPAQUE_TICKET, malformed)
      expect(result).toMatchObject({ disposition: 'refused', failureCode: 'provider_consequence_ticket_invalid' })
      expectNoSend(active)
    }
  })

  it('refuses keyless invocations and uses the real wall clock when no test clock is supplied', async () => {
    const provider = jitInvocation()
    const keyless: RouteTransportInvocation = {
      ...provider,
      binding: {
        ...provider.binding,
        authority: { kind: 'public_upstream' },
      },
      authority: {
        attemptRef: provider.authority.attemptRef,
        ...(provider.authority.effectGeneration === undefined
          ? {}
          : { effectGeneration: provider.authority.effectGeneration }),
        operationKeyDigest: provider.authority.operationKeyDigest,
        mandateDigest: provider.authority.mandateDigest,
        grantDigest: provider.authority.grantDigest,
        capabilityContractDigest: provider.authority.capabilityContractDigest,
        maximumSpend: provider.authority.maximumSpend,
        expiresAt: Date.now() + 30_000,
        callIdentity: provider.authority.callIdentity,
      },
    }
    const active = harness({
      verifyTicket: vi.fn(async () => ticket()),
      send: vi.fn<RouteTransportFetch>(),
      omitTestClock: true,
    })
    const result = await execute(active, OPAQUE_TICKET, keyless)
    expect(result).toMatchObject({ disposition: 'refused', failureCode: 'provider_consequence_ticket_invalid' })
    expectNoSend(active)
  })

  it('does not send when the fetched secret material is blank', async () => {
    const active = harness({ vaultFetch: vaultFetch('   ') })
    const result = await execute(active)
    expect(result).toMatchObject({ disposition: 'refused', releaseStarted: false, failureCode: 'credential_unavailable' })
    expectNoSend(active)
    expect(active.durableJournal.complete).toHaveBeenCalledOnce()

    const empty = harness({ vaultFetch: vaultFetch('') })
    await expectExecute(empty, { disposition: 'refused', failureCode: 'credential_unavailable' })
    expectNoSend(empty)
  })

  it('refuses x402 support when the callback-scoped custody and reconciliation factory is absent', async () => {
    const { routeInvocation, ...active } = x402Harness()
    await expectExecute(active, {
      transport: 'x402',
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'payment_custody_unavailable',
    }, OPAQUE_TICKET, routeInvocation)
    expectNoSend(active)
  })

  it('rejects missing, malformed, or provider-secret-reused x402 payment pointers before journal or provider I/O', async () => {
    const { routeInvocation } = x402Harness()
    const canonical = ticket(routeInvocation)
    for (const paymentSecret of [
      undefined,
      { ...canonical.paymentSecret!, secretRef: canonical.secret.secretRef },
      { ...canonical.paymentSecret!, pointerRevision: 0 },
      { ...canonical.paymentSecret!, activeGeneration: 'caller-generation' },
    ]) {
      const verifiedTicket = {
        ...canonical,
        ...(paymentSecret === undefined ? {} : { paymentSecret }),
      }
      if (paymentSecret === undefined) Reflect.deleteProperty(verifiedTicket, 'paymentSecret')
      const active = x402Harness({ verifiedTicket })
      await expectExecute(active, {
        transport: 'x402',
        disposition: 'refused',
        releaseStarted: false,
        failureCode: 'provider_consequence_ticket_invalid',
      }, OPAQUE_TICKET, routeInvocation)
      expectNoJournalBeginOrSend(active)
    }
  })

  it('rejects a caller-injected payment pointer on a non-payment provider ticket', async () => {
    const routeInvocation = jitInvocation()
    const canonical = ticket(routeInvocation)
    const active = harness({
      routeInvocation,
      verifiedTicket: {
        ...canonical,
        paymentSecret: {
          secretRef: PAYMENT_REF,
          activeGeneration: PAYMENT_GENERATION,
          pointerRevision: 8,
        },
      },
    })

    await expectExecute(active, {
      transport: 'http',
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_ticket_invalid',
    })
    expectNoJournalBeginOrSend(active)
  })

  it('runs x402 custody, one signed submission, and reconciliation inside the JIT callback', async () => {
    const { createCallbackScopedX402Runtime, prepareX402PaymentAuthorization,
      readX402PaymentAuthorization, readX402PaymentAuthorizationByDigest,
      markX402PaymentPossiblySubmitted, observeX402PaymentAttempt } = buildTrackedX402Factory()
    const challenge = x402Challenge()
    const durableJournal = journal()
    const send = sendReturning402(challenge)
    const { routeInvocation, ...active } = x402Harness({
      createCallbackScopedX402Runtime,
      journal: durableJournal,
      send,
    })

    const result = await execute(active, OPAQUE_TICKET, routeInvocation)

    expect(result).toMatchObject({
      transport: 'x402',
      disposition: 'unknown',
      releaseStarted: true,
      failureCode: 'payment_required_after_submission',
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'observed',
      settlementEvidence: { kind: 'unknown', reason: 'payment_required_after_submission' },
    })
    expect(createCallbackScopedX402Runtime).toHaveBeenCalledWith({
      ticket: ticket(routeInvocation),
      invocation: routeInvocation,
    })
    expect(prepareX402PaymentAuthorization).toHaveBeenCalledOnce()
    expect(readX402PaymentAuthorization).toHaveBeenCalledOnce()
    expect(readX402PaymentAuthorizationByDigest).not.toHaveBeenCalled()
    expect(markX402PaymentPossiblySubmitted).toHaveBeenCalledOnce()
    expect(observeX402PaymentAttempt).toHaveBeenCalledWith(expect.objectContaining({
      state: 'reconciliation_required',
    }))
    // x402 first re-reads the unpaid 402 challenge, then submits exactly one
    // signed request. This is the two-request flow used by @x402/core clients.
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Payment-Signature')
    expect(send.mock.calls[1]?.[1]?.headers).toMatchObject({
      'Payment-Signature': 'signed-payment',
    })
    expect(durableJournal.complete).toHaveBeenCalledWith({ claimRef: CLAIM_REF, observation: result })
    expect(JSON.stringify(result)).not.toContain('signed-payment')
  })

  it('quarantines an x402 provider observation that echoes encoded leased secret material', async () => {
    const challenge = x402Challenge()
    const durableJournal = journal()
    const send = vi.fn<RouteTransportFetch>()
      .mockResolvedValueOnce(paymentRequired402Response(challenge))
      .mockResolvedValueOnce(Response.json({
        serviceReference: Buffer.from(CREDENTIAL).toString('base64'),
      }, {
        headers: {
          'Payment-Response': encodePaymentResponseHeader({
            success: true,
            transaction: '0xsettled',
            network: 'eip155:84532',
            amount: '1250000',
            payer: 'test:settled-payer',
          }),
        },
      }))
    const { routeInvocation, ...active } = x402Harness({
      createCallbackScopedX402Runtime: viCallbackScopedX402Factory(),
      journal: durableJournal,
      send,
    })

    const result = await execute(active, OPAQUE_TICKET, routeInvocation)

    expect(result).toEqual({
      transport: 'x402',
      disposition: 'unknown',
      releaseStarted: true,
      requestDigest: requestDigest(routeInvocation),
      failureCode: 'provider_consequence_secret_echo',
    })
    expectJsonExcludesCredential(result)
    expect(send).toHaveBeenCalledTimes(2)
    expect(durableJournal.complete).toHaveBeenCalledWith({ claimRef: CLAIM_REF, observation: result })
  })

  it('does not advertise x402 execution when the callback-scoped signer reports unavailable', async () => {
    const { routeInvocation, ...active } = x402Harness({
      createCallbackScopedX402Runtime: async () => callbackScopedX402Runtime({
        x402PaymentSigningAvailable: () => false,
      }),
    })
    await expectExecute(active, {
      transport: 'x402',
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'payment_signature_unavailable',
    }, OPAQUE_TICKET, routeInvocation)
    expectNoSend(active)
  })

  it('leaves a post-release x402 exception started and unknown without making the ticket retryable', async () => {
    const durableJournal = journal()
    const send = sendReturning402()
    const { routeInvocation, ...active } = x402Harness({
      journal: durableJournal,
      send,
      createCallbackScopedX402Runtime: async () => callbackScopedX402Runtime({
        observeX402PaymentAttempt: async () => { throw new Error('reconciliation-port-outage') },
      }),
    })

    await expectExecute(active, {
      transport: 'x402',
      disposition: 'unknown',
      releaseStarted: true,
      failureCode: 'provider_consequence_release_unknown',
    }, OPAQUE_TICKET, routeInvocation)
    expect(send).toHaveBeenCalledTimes(2)
    expect(durableJournal.abortBeforeRelease).not.toHaveBeenCalled()
    expect(durableJournal.complete).not.toHaveBeenCalled()
  })

  it('aborts a claimed ticket when the trusted transport refuses before external release', async () => {
    const durableJournal = journal()
    const send = vi.fn<RouteTransportFetch>(async () => {
      throw new ProviderConsequencePreReleaseRefusal()
    })
    const active = harness({ journal: durableJournal, send })

    await expectExecute(active, {
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_target_refused',
    })
    expect(send).toHaveBeenCalledOnce()
    expect(durableJournal.abortBeforeRelease).toHaveBeenCalledWith({ claimRef: CLAIM_REF })
    expect(durableJournal.complete).not.toHaveBeenCalled()
  })

  it('does not abort or retry when expiry is detected after x402 authorization and submission fencing', async () => {
    const durableJournal = journal()
    const markX402PaymentPossiblySubmitted = vi.fn(async () => undefined)
    const clock = vi.fn()
      .mockReturnValueOnce(NOW)
      .mockReturnValueOnce(NOW)
      .mockReturnValueOnce(NOW)
      .mockReturnValue(NOW + 10_000)
    const { routeInvocation, ...active } = x402Harness({
      journal: durableJournal,
      boundaryNow: clock,
      send: sendReturning402(),
      createCallbackScopedX402Runtime: async () => callbackScopedX402Runtime({
        markX402PaymentPossiblySubmitted,
      }),
    })

    await expectExecute(active, {
      transport: 'x402',
      disposition: 'unknown',
      releaseStarted: true,
      failureCode: 'provider_consequence_release_unknown',
    }, OPAQUE_TICKET, routeInvocation)
    expect(markX402PaymentPossiblySubmitted).toHaveBeenCalledOnce()
    expect(active.send).toHaveBeenCalledOnce()
    expect(durableJournal.abortBeforeRelease).not.toHaveBeenCalled()
    expect(durableJournal.complete).not.toHaveBeenCalled()
  })

  it('fails closed when the callback-scoped x402 runtime factory is unavailable', async () => {
    const { routeInvocation, ...active } = x402Harness({
      createCallbackScopedX402Runtime: async () => { throw new Error('x402-runtime-factory-outage') },
    })
    await expectExecute(active, {
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'payment_custody_unavailable',
    }, OPAQUE_TICKET, routeInvocation)
    expectNoSend(active)
  })

  it.each([
    ['non-object runtime', null],
    ['missing required custody port', {}],
    ['runtime attempting to replace the provider send port', {
      ...callbackScopedX402Runtime(),
      send: async () => Response.json({ attacker: true }),
    }],
    ['invalid optional submission fence', {
      readX402PaymentCredentialRef: async () => X402_PAYMENT_CREDENTIAL_REF,
      validateProviderConnectionAuthority: async () => ({ kind: 'valid' as const }),
      x402PaymentSigningAvailable: () => true,
      verifyX402Settlement: async () => true,
      prepareX402PaymentAuthorization: async () => undefined,
      readX402PaymentAuthorization: async () => undefined,
      readX402PaymentAuthorizationByDigest: async () => undefined,
      beforeX402PaymentAuthorizationRead: true,
      markX402PaymentPossiblySubmitted: async () => undefined,
      observeX402PaymentAttempt: async () => undefined,
    }],
  ])('fails closed for malformed callback-scoped x402 runtime: %s', async (_case, runtime) => {
    const createCallbackScopedX402Runtime = (async () => runtime) as unknown as JitProviderX402RuntimeFactory
    const { routeInvocation, ...active } = x402Harness({ createCallbackScopedX402Runtime })
    await expectExecute(active, {
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'payment_custody_unavailable',
    }, OPAQUE_TICKET, routeInvocation)
    expectNoSend(active)
  })

  it('rechecks ticket expiry immediately before the underlying provider call', async () => {
    const clock = vi.fn()
      .mockReturnValueOnce(NOW)
      .mockReturnValueOnce(NOW)
      .mockReturnValue(NOW + 10_000)
    const active = harness({ boundaryNow: clock })
    const result = await execute(active)
    expect(result).toMatchObject({
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_expired',
    })
    expectNoSend(active)
    expect(active.durableJournal.abortBeforeRelease).toHaveBeenCalledOnce()
    expect(active.durableJournal.complete).not.toHaveBeenCalled()
  })

  it('persists the registered transport unknown result when response handling fails after provider I/O begins', async () => {
    const durableJournal = journal()
    const active = harness({
      journal: durableJournal,
      send: vi.fn<RouteTransportFetch>(async () => unreadableJsonResponse()),
    })
    const result = await execute(active)
    expect(result).toMatchObject({
      disposition: 'unknown',
      releaseStarted: true,
      failureCode: 'network_error',
    })
    expect(durableJournal.complete).toHaveBeenCalledWith({ claimRef: CLAIM_REF, observation: result })
  })

  it.each([
    ['raw', CREDENTIAL, 'response_output_invalid'],
    ['base64', Buffer.from(CREDENTIAL).toString('base64'), 'provider_consequence_secret_echo'],
  ])('quarantines an HTTP provider observation that echoes the %s leased secret', async (_label, echoed, failureCode) => {
    const durableJournal = journal()
    const active = harness({
      journal: durableJournal,
      send: vi.fn(async () => Response.json({ serviceReference: echoed })),
    })

    const result = await execute(active)

    expect(result).toEqual({
      transport: 'http',
      disposition: 'unknown',
      releaseStarted: true,
      requestDigest: requestDigest(active.routeInvocation),
      failureCode,
    })
    expectJsonExcludesCredential(result)
    expect(durableJournal.complete).toHaveBeenCalledWith({
      claimRef: CLAIM_REF,
      observation: result,
    })
  })

  it('keeps observed transport failures unknown when the journal cannot acknowledge completion', async () => {
    const active = harness({
      journal: journalWithPatches({
        complete: async () => { throw new Error('journal-completion-outage') },
      }),
      send: vi.fn(async () => unreadableJsonResponse()),
    })
    await expectExecute(active, {
      disposition: 'unknown',
      releaseStarted: true,
      failureCode: 'provider_consequence_completion_unknown',
    })
  })

  it('remains fail closed when abort-before-release cannot be acknowledged', async () => {
    getVercelOidcToken.mockRejectedValueOnce(new Error('identity-outage'))
    const active = harness({
      journal: journalWithPatches({
        abortBeforeRelease: async () => { throw new Error('abort-outage') },
      }),
    })
    await expectExecute(active, {
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_secret_unavailable',
    })
  })
})

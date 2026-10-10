import { getFunctionName } from 'convex/server'
import {
  BASE_MAINNET_NETWORK,
  BASE_MAINNET_USDC_ADDRESS,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
} from '@/modules/capability-supply/public'
import { describe, expect, it, vi } from 'vitest'

import {
  claimX402PaymentAuthorization,
  checkpointX402Response,
  beginResponseRecovery,
  responseRecoveryIsCurrent,
  listExpiredPreparedX402PaymentAttempts,
  markX402PaymentPossiblySubmitted,
  observeX402PaymentAttempt,
  prepareX402PaymentAuthorization,
  readX402PaymentAttempt,
  readX402PaymentAuthorization,
  readX402PaymentAuthorizationByDigest,
  reconcileX402PaymentAttempt,
  recordX402PaymentAuthorizationFailure,
  recordX402PaymentObservation,
  recordX402PaymentSignatureDigest,
  recordX402PaymentSigningIntent,
} from '../../../convex/moneyX402PaymentAttempts'
import { queueExpiredX402Authorization } from '../../../convex/capabilityCallX402AuthorizationExpiry'
import { X402_PAYMENT_SIGNING_CLAIM_LEASE_MS } from '../../../convex/lib/money/x402PaymentAttempt/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  actionControlRow,
  attempt,
  authorizationDigest,
  authorizationFailureArgs,
  claimArgs,
  custodyRef,
  digestArgs,
  eventArgs,
  expiryArgs,
  expiryArgsForSuffix,
  expiryPreparedPaymentRow,
  fingerprint,
  firstDigest,
  intentArgs,
  intentRowWithoutExpiresAt,
  invocationRow,
  memoryDbWithPayment,
  MemoryDb,
  observationArgs,
  paymentAndInvocationSnapshot,
  paymentAuthorizationExpiresAt,
  paymentAuthorizationValidBefore,
  paymentNonce,
  paymentObservationArgs,
  paymentPayer,
  prepareArgs,
  quarantinedOutputJson,
  quarantinedResponseDigest,
  readArgs,
  reconciliationArgs,
  seedExpiryInvocationControl,
  seedExpiryQueuePair,
  seedPaymentObservationAttempt,
  seedReconciliationAuthority,
  signedAttemptRow,
  signingKey,
  secondDigest,
  attemptRowWithSigningClaim,
  unsignedIdentityFields,
  unsignedMaterialDigest,
  unsignedMaterialJson,
  type HandlerExport,
} from './money-x402-payment-attempt-fixtures'

const claim = (claimX402PaymentAuthorization as unknown as HandlerExport)._handler
const prepare = (prepareX402PaymentAuthorization as unknown as HandlerExport)._handler
const read = (readX402PaymentAuthorization as unknown as HandlerExport)._handler
const readByDigest = (readX402PaymentAuthorizationByDigest as unknown as HandlerExport)._handler
const readAttempt = (readX402PaymentAttempt as unknown as HandlerExport)._handler
const recordDigest = (recordX402PaymentSignatureDigest as unknown as HandlerExport)._handler
const recordIntent = (recordX402PaymentSigningIntent as unknown as HandlerExport)._handler
const recordAuthorizationFailure = (
  recordX402PaymentAuthorizationFailure as unknown as HandlerExport
)._handler
const markPossiblySubmitted = (markX402PaymentPossiblySubmitted as unknown as HandlerExport)._handler
const observe = (observeX402PaymentAttempt as unknown as HandlerExport)._handler
const recordObservation = (recordX402PaymentObservation as unknown as HandlerExport)._handler
const checkpointResponse = (checkpointX402Response as unknown as HandlerExport)._handler
const beginRecovery = (beginResponseRecovery as unknown as HandlerExport)._handler
const recoveryIsCurrent = (responseRecoveryIsCurrent as unknown as HandlerExport)._handler
const reconcile = (reconcileX402PaymentAttempt as unknown as HandlerExport)._handler
const listExpiredPrepared = (listExpiredPreparedX402PaymentAttempts as unknown as HandlerExport)._handler
const queueExpired = (queueExpiredX402Authorization as unknown as HandlerExport)._handler
describe('money x402 payment authorization attempt', () => {
  it('keeps expired payment identities while refusing content reads and late response restoration', async () => {
    const db = memoryDbWithPayment({ ...attempt(), toolRef: 'operation:test', inputDigest: 'sha256:input',
      state: 'observed', settlementStatus: 'settled', contentExpiredAt: 3_000,
      challengeJson: undefined, selectedRequirementJson: undefined, providerEndpoint: undefined,
      quarantinedResponseDigest, quarantinedOutputJson: undefined })
    const before = structuredClone(db.rows('moneyX402PaymentAttempts'))
    await expect(read({ db }, readArgs())).resolves.toBeNull()
    await expect(readByDigest({ db }, readArgs())).resolves.toBeNull()
    await expect(readAttempt({ db }, { dispatchRef: 'invocation:test', attemptRef: 'attempt:test', effectGeneration: 1 })).resolves.toBeNull()
    const observation = paymentObservationArgs({ settlementStatus: 'settled', quarantinedResponseDigest, quarantinedOutputJson })
    await expect(recordObservation({ db }, observation)).rejects.toThrow('x402_payment_content_expired')
    await expect(checkpointResponse({ db }, {
      dispatchRef: observation.dispatchRef, attemptRef: observation.attemptRef, effectGeneration: observation.effectGeneration,
      toolRef: observation.toolRef, inputDigest: observation.inputDigest, paymentIdentifier: observation.paymentIdentifier,
      responseStatus: 200, responseDigest: quarantinedResponseDigest, outputJson: quarantinedOutputJson,
      requestDigest: canonicalDigest('request'),
    })).rejects.toThrow('x402_payment_content_expired')
    expect(db.rows('moneyX402PaymentAttempts')).toEqual(before)
    expect(db.patchCalls).toHaveLength(0)
  })

  it('rejects sandbox chain material when production environment is declared', async () => {
    const db = new MemoryDb()
    await expect(prepare({ db }, prepareArgs({
      aeEnvironment: 'production',
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
    }))).rejects.toThrow('x402_payment_environment_fence_violated')
    expectNoPaymentAttempts(db)
  })

  it.each([
    { label: 'partial', override: { custodyBudgetRef: 'wallet:budget' } },
    { label: 'blank budget ref', override: { custodyBudgetRef: '  ', custodyGeneration: 1, custodyDailyMaximumUnits: '100' } },
    { label: 'zero generation', override: { custodyBudgetRef: 'wallet:budget', custodyGeneration: 0, custodyDailyMaximumUnits: '100' } },
    { label: 'unsafe generation', override: { custodyBudgetRef: 'wallet:budget', custodyGeneration: Number.MAX_SAFE_INTEGER + 1, custodyDailyMaximumUnits: '100' } },
    { label: 'zero daily maximum', override: { custodyBudgetRef: 'wallet:budget', custodyGeneration: 1, custodyDailyMaximumUnits: '0' } },
    { label: 'noncanonical daily maximum', override: { custodyBudgetRef: 'wallet:budget', custodyGeneration: 1, custodyDailyMaximumUnits: '01' } },
  ])('rejects invalid managed custody policy: $label', async ({ override }) => {
    const db = new MemoryDb()
    await expect(prepare({ db }, { ...prepareArgs(), ...override }))
      .rejects.toThrow('x402_payment_custody_policy_invalid')
    expectNoPaymentAttempts(db)
  })

  it('persists and replays unsigned intent identity without a raw header', async () => {
    const db = new MemoryDb()
    const args = prepareArgs({
      custodyBudgetRef: 'wallet:budget',
      custodyGeneration: 3,
      custodyDailyMaximumUnits: '1000000',
    })
    const first = await prepare({ db }, args)
    const row = db.rows('moneyX402PaymentAttempts')[0]
    if (row === undefined) throw new Error('missing_prepared_attempt')

    await expect(recordIntent({ db }, intentArgs({
      custodyRef: row.custodyRef,
      authorizationDigest: row.authorizationDigest,
      custodyGeneration: 3,
    }))).resolves.toBeNull()
    await expect(recordDigest({ db }, digestArgs({
      custodyRef: row.custodyRef,
      authorizationDigest: row.authorizationDigest,
      custodyGeneration: 3,
    }))).resolves.toBeNull()

    const material = await read({ db }, {
      custodyRef: row.custodyRef,
      authorizationDigest: row.authorizationDigest,
      requestFingerprint: fingerprint,
      custodyGeneration: 3,
    })
    expect(material).toMatchObject({
      scheme: 'exact',
      network: BASE_MAINNET_NETWORK,
      asset: BASE_MAINNET_USDC_ADDRESS,
      payTo: '0xrecipient',
      ...unsignedIdentityFields,
      paymentSignatureDigest: firstDigest,
      requestFingerprint: fingerprint,
    })
    expect(material).not.toHaveProperty('paymentSignature')
    expect(JSON.stringify(db.rows('moneyX402PaymentAttempts'))).not.toContain('header:first')
    expect(await prepare({ db }, args)).toEqual(first)
    await expect(prepare({ db }, { ...args, custodyGeneration: 4 }))
      .rejects.toThrow('x402_payment_attempt_attribution_invalid')
  })

  it('validates the UUID and canonical unsigned identity at the mutation boundary', async () => {
    const db = memoryDbWithPayment(attempt())

    await expect(recordIntent({ db }, intentArgs({ paymentSigningIdempotencyKey: 'not-a-uuid' })))
      .rejects.toThrow('x402_payment_signing_idempotency_key_invalid')
    await expect(recordIntent({ db }, intentArgs({ paymentUnsignedMaterialDigest: 'sha256:wrong' })))
      .rejects.toThrow('x402_payment_unsigned_material_invalid')
    await recordIntent({ db }, intentArgs())
    await expect(recordIntent({ db }, intentArgs({ paymentUnsignedMaterialJson: `${unsignedMaterialJson} ` })))
      .rejects.toThrow('x402_payment_unsigned_material_invalid')
    await expect(recordIntent({ db }, intentArgs({
      paymentAuthorizationValidBefore: '1000',
      paymentAuthorizationExpiresAt: 1_000_000,
    }))).rejects.toThrow('x402_payment_unsigned_identity_conflict')
    await expect(recordIntent({ db }, intentArgs({ paymentSigningIdempotencyKey: '22222222-2222-4222-8222-222222222222' })))
      .rejects.toThrow('x402_payment_unsigned_identity_conflict')
    await expect(recordDigest({ db }, digestArgs({ paymentPayer: '0xother' })))
      .rejects.toThrow('x402_payment_authorization_material_invalid')
  })

  it('persists the latest bounded pre-sign refusal stage and replays the same evidence', async () => {
    const db = memoryDbWithPayment(attempt())
    const args = authorizationFailureArgs()
    await withMockedNow(123_456, async () => {
      await expect(recordAuthorizationFailure({ db }, args)).resolves.toBeNull()
      await expect(recordAuthorizationFailure({ db }, args)).resolves.toBeNull()
      await expect(recordAuthorizationFailure({ db }, {
        ...args,
        code: 'grant_invalid',
      })).resolves.toBeNull()
      expect(db.rows('moneyX402PaymentAttempts')[0]).toMatchObject({
        authorizationFailureCode: 'grant_invalid',
        authorizationFailureObservedAt: 123_456,
      })
      expect(db.patchCalls).toHaveLength(2)
    })
  })

  it('refuses invalid detail or post-sign authorization failure evidence', async () => {
    const args = authorizationFailureArgs()
    const invalidDetail = memoryDbWithPayment(attempt())
    await expect(recordAuthorizationFailure({ db: invalidDetail }, {
      ...args,
      code: 'grant_invalid',
      detail: 'connection_not_found',
    })).rejects.toThrow('x402_payment_authorization_failure_detail_invalid')

    for (const evidence of [
      { state: 'possibly_submitted', submissionStartedAt: 1 },
      { paymentSignatureDigest: firstDigest },
    ]) {
      const db = memoryDbWithPayment({ ...attempt(), ...evidence })
      await expect(recordAuthorizationFailure({ db }, args))
        .rejects.toThrow('x402_payment_authorization_failure_state_invalid')
      expect(db.patchCalls).toHaveLength(0)
    }
  })

  it.each([
    ['non-decimal', '1e3', 1_000_000],
    ['noncanonical', '0999', 999_000],
    ['overflow', '9007199254740992', Number.MAX_SAFE_INTEGER],
    ['mismatched milliseconds', paymentAuthorizationValidBefore, paymentAuthorizationExpiresAt + 1],
  ] as const)('rejects invalid expiry identity: %s', async (_label, validBefore, expiresAt) => {
    const db = memoryDbWithPayment(attempt())
    await expect(recordIntent({ db }, intentArgs({
      paymentAuthorizationValidBefore: validBefore,
      paymentAuthorizationExpiresAt: expiresAt,
    }))).rejects.toThrow('x402_payment_unsigned_material_invalid')
  })

  it('refuses a partial first-win expiry identity', async () => {
    const db = memoryDbWithPayment({ ...attempt(), paymentAuthorizationValidBefore })
    await expect(recordIntent({ db }, intentArgs()))
      .rejects.toThrow('x402_payment_unsigned_identity_conflict')
  })

  it('refuses to record a signature digest for a partial expiry identity', async () => {
    const db = memoryDbWithPayment(intentRowWithoutExpiresAt())

    await expect(recordDigest({ db }, digestArgs()))
      .rejects.toThrow('x402_payment_authorization_material_invalid')
    expect(db.rows('moneyX402PaymentAttempts')[0]).not.toHaveProperty('paymentSignatureDigest')
  })

  it('gates managed authorization reads and writes on the expected generation', async () => {
    const db = new MemoryDb()
    db.seed({
      ...attempt(),
      custodyBudgetRef: 'wallet:budget',
      custodyGeneration: 7,
      custodyDailyMaximumUnits: '1000000',
    })

    await expect(read({ db }, { ...readArgs(), custodyGeneration: 8 })).resolves.toBeNull()
    await expect(readByDigest({ db }, { ...readArgs(), custodyGeneration: 8 })).resolves.toBeNull()
    await expect(read({ db }, { ...readArgs(), custodyGeneration: 7 })).resolves.toMatchObject({
      custodyBudgetRef: 'wallet:budget',
      custodyGeneration: 7,
      custodyDailyMaximumUnits: '1000000',
    })
    await expect(claim({ db }, { ...claimArgs(), custodyGeneration: 8 }))
      .rejects.toThrow('x402_payment_custody_generation_conflict')
    await expect(recordDigest({ db }, { ...digestArgs(), custodyGeneration: 8 }))
      .rejects.toThrow('x402_payment_custody_generation_conflict')
  })

  it('makes the first claim authoritative and rejects mismatched concurrent identity', async () => {
    const db = memoryDbWithPayment(attempt())

    await expect(claim({ db }, claimArgs())).resolves.toEqual({ kind: 'claimed' })
    expect(await claim({ db }, claimArgs())).toEqual({ kind: 'pending' })
    await recordIntent({ db }, intentArgs())
    await expect(Promise.all([
      recordDigest({ db }, digestArgs()),
      recordDigest({ db }, digestArgs({ paymentSignatureDigest: secondDigest })),
    ])).rejects.toThrow('x402_payment_signature_identity_conflict')

    const storedIdentity = {
      paymentUnsignedMaterialDigest: unsignedMaterialDigest,
      paymentSigningIdempotencyKey: signingKey,
      paymentSignatureDigest: firstDigest,
      paymentAuthorizationValidBefore,
      paymentAuthorizationExpiresAt,
    }
    const material = await read({ db }, readArgs())
    expect(material).toMatchObject(storedIdentity)
    expect(material).not.toHaveProperty('paymentSignature')
    await expect(claim({ db }, claimArgs())).resolves.toMatchObject({
      kind: 'stored',
      ...storedIdentity,
    })
  })

  it('keeps a bare signing claim pending before its lease expires', async () => {
    const now = 100_000
    const db = memoryDbWithPayment(attemptRowWithSigningClaim(
      now - X402_PAYMENT_SIGNING_CLAIM_LEASE_MS + 1,
    ))
    await withMockedNow(now, async () => {
      await expect(claim({ db }, claimArgs())).resolves.toEqual({ kind: 'pending' })
      expect(db.patchCalls).toHaveLength(0)
    })
  })

  it('reclaims a bare signing claim after its lease expires', async () => {
    const now = 100_000
    const db = memoryDbWithPayment(attemptRowWithSigningClaim(
      now - X402_PAYMENT_SIGNING_CLAIM_LEASE_MS,
    ))
    await withMockedNow(now, async () => {
      await expect(claim({ db }, claimArgs())).resolves.toEqual({ kind: 'claimed' })
      expect(db.rows('moneyX402PaymentAttempts')[0]).toMatchObject({
        paymentSigningClaimedAt: now,
      })
      expect(db.patchCalls).toEqual([{
        id: db.rows('moneyX402PaymentAttempts')[0]?._id,
        value: { paymentSigningClaimedAt: now },
      }])
    })
  })

  it.each([
    ['unsigned material JSON', { paymentUnsignedMaterialJson: unsignedMaterialJson }],
    ['unsigned material digest', { paymentUnsignedMaterialDigest: unsignedMaterialDigest }],
    ['signing idempotency key', { paymentSigningIdempotencyKey: signingKey }],
    ['signature digest', { paymentSignatureDigest: firstDigest }],
    ['payer', { paymentPayer }],
    ['nonce', { paymentNonce }],
    ['authorization valid-before', { paymentAuthorizationValidBefore }],
    ['authorization expiry', { paymentAuthorizationExpiresAt }],
    ['complete unsigned intent', unsignedIdentityFields],
  ])('does not reclaim an expired claim with authorization identity evidence: %s', async (_label, evidence) => {
    const now = 100_000
    const db = memoryDbWithPayment(attemptRowWithSigningClaim(
      now - X402_PAYMENT_SIGNING_CLAIM_LEASE_MS,
      evidence,
    ))
    await withMockedNow(now, async () => {
      await expect(claim({ db }, claimArgs())).resolves.toEqual({ kind: 'pending' })
      expect(db.patchCalls).toHaveLength(0)
    })
  })

  it('refuses a different request fingerprint before reading or claiming', async () => {
    const db = memoryDbWithPayment(signedAttemptRow({ paymentSigningClaimedAt: 1 }))

    await expect(claim({ db }, { ...claimArgs(), requestFingerprint: 'sha256:request-two' }))
      .rejects.toThrow('x402_payment_request_fingerprint_conflict')
    await expect(read({ db }, { ...readArgs(), requestFingerprint: 'sha256:request-two' }))
      .rejects.toThrow('x402_payment_request_fingerprint_conflict')
  })

  it('keeps unsigned identity evidence after submission may have started and blocks re-authorization', async () => {
    const db = memoryDbWithPayment(signedAttemptRow({ paymentSigningClaimedAt: 1 }))

    await markPossiblySubmitted({ db }, eventArgs())
    const row = db.rows('moneyX402PaymentAttempts')[0]
    expect(row).toMatchObject({
      state: 'possibly_submitted',
      paymentUnsignedMaterialDigest: unsignedMaterialDigest,
      paymentSigningIdempotencyKey: signingKey,
      paymentSignatureDigest: firstDigest,
      paymentPayer,
      paymentNonce,
      requestFingerprint: fingerprint,
    })
    expect(row).not.toHaveProperty('paymentSignature')
    expect(await read({ db }, readArgs())).not.toHaveProperty('paymentSignature')
    await expect(claim({ db }, claimArgs()))
      .rejects.toThrow('x402_payment_attempt_reconciliation_required')
    await expect(recordDigest({ db }, digestArgs({ paymentSignatureDigest: secondDigest })))
      .rejects.toThrow('x402_payment_attempt_reconciliation_required')
  })

  it('replays a committed mark after its response is lost without changing safe evidence', async () => {
    const db = memoryDbWithPayment(signedAttemptRow({ paymentSigningClaimedAt: 1 }))
    db.loseAcknowledgementAfterNextPatch()

    await expect(markPossiblySubmitted({ db }, eventArgs())).rejects.toThrow('acknowledgement_lost')
    await expect(markPossiblySubmitted({ db }, eventArgs())).resolves.toBeNull()
    expect(db.rows('moneyX402PaymentAttempts')[0]).toMatchObject({
      state: 'possibly_submitted',
      paymentUnsignedMaterialDigest: unsignedMaterialDigest,
      paymentSignatureDigest: firstDigest,
    })
  })

  it.each(['possibly_submitted', 'observed', 'reconciliation_required'] as const)(
    'replaying a mark keeps an already advanced %s state',
    async (state) => {
      const db = memoryDbWithPayment({ ...attempt(), state, submissionStartedAt: 11 })
      await expect(markPossiblySubmitted({ db }, eventArgs())).resolves.toBeNull()
      expect(db.rows('moneyX402PaymentAttempts')[0]).toMatchObject({ state, submissionStartedAt: 11 })
    },
  )

  it('replays a committed observation after its response is lost without replacing evidence', async () => {
    const db = memoryDbWithPayment({ ...attempt(), state: 'possibly_submitted', submissionStartedAt: 11 })
    const args = observationArgs()
    db.loseAcknowledgementAfterNextPatch()

    await expect(observe({ db }, args)).rejects.toThrow('acknowledgement_lost')
    await expect(observe({ db }, args)).resolves.toBeNull()
    expect(db.rows('moneyX402PaymentAttempts')[0]).toMatchObject({
      state: 'observed',
      settlementStatus: 'settled',
      paymentResponseDigest: 'sha256:settlement',
      evidenceRefs: ['evidence:receipt'],
    })
  })

  it.each([
    ['observed', 'settled'],
    ['reconciliation_required', 'unknown'],
  ] as const)('replays an already %s payment observation without patching', async (state, settlementStatus) => {
    const db = new MemoryDb()
    const args = seedPaymentObservationAttempt(db, state, settlementStatus, 'complete')
    const before = JSON.stringify(db.rows('moneyX402PaymentAttempts'))

    await expect(recordObservation({ db }, args)).resolves.toBeNull()

    expect(db.patchCalls).toHaveLength(0)
    expect(JSON.stringify(db.rows('moneyX402PaymentAttempts'))).toBe(before)
  })

  it.each([
    ['observed', 'settled'],
    ['reconciliation_required', 'unknown'],
  ] as const)(
    'enriches an early %s payment result with the canonical transport observation exactly once',
    async (state, settlementStatus) => {
      const db = new MemoryDb()
      const args = seedPaymentObservationAttempt(db, state, settlementStatus, 'missing-transport')

      await expect(recordObservation({ db }, args)).resolves.toBeNull()
      await expect(recordObservation({ db }, args)).resolves.toBeNull()

      expect(db.rows('moneyX402PaymentAttempts')[0]).toMatchObject({
        state,
        toolRef: args.toolRef,
        inputDigest: args.inputDigest,
        settlementStatus,
        paymentResponseDigest: args.paymentResponseDigest,
        paymentObservationDigest: args.paymentObservationDigest,
        transportObservationDigest: args.transportObservationDigest,
        transportRequestDigest: args.transportRequestDigest,
        ...(settlementStatus === 'unknown'
          ? {
              quarantinedResponseDigest,
              quarantinedOutputJson,
            }
          : {}),
        observedAt: args.observedAt,
      })
      expect(db.patchCalls).toHaveLength(1)
    },
  )

  it('refuses to complete a partially persisted transport observation', async () => {
    const db = new MemoryDb()
    const args = paymentObservationArgs({ settlementStatus: 'unknown' })
    db.seed({
      ...attempt(),
      state: 'reconciliation_required',
      toolRef: args.toolRef,
      inputDigest: args.inputDigest,
      settlementStatus: args.settlementStatus,
      paymentResponseDigest: args.paymentResponseDigest,
      paymentObservationDigest: args.paymentObservationDigest,
      observedAt: 900,
    })

    await expect(recordObservation({ db }, args))
      .rejects.toThrow('x402_payment_observation_attribution_invalid')
    expect(db.patchCalls).toHaveLength(0)
  })

  it.each(['unknown', 'settled'] as const)('durably reads a normalized paid response when settlement is %s', async (settlementStatus) => {
    const db = memoryDbWithPayment({ ...attempt(), state: 'possibly_submitted', submissionStartedAt: 11 })
    const args = paymentObservationArgs({ settlementStatus, quarantinedResponseDigest, quarantinedOutputJson })

    await expect(recordObservation({ db, runMutation: async () => null }, args)).resolves.toBeNull()

    const persisted = await readAttempt({ db }, {
      dispatchRef: 'invocation:test',
      attemptRef: 'attempt:test',
      effectGeneration: 1,
    })
    expect(persisted).toMatchObject({
      state: settlementStatus === 'unknown' ? 'reconciliation_required' : 'observed',
      settlementStatus,
      quarantinedResponseDigest,
      quarantinedOutputJson,
    })
    expect(persisted).not.toHaveProperty('outputJson')
  })

  it('retains the response across a crash before settlement verification without advancing payment state', async () => {
    const db = memoryDbWithPayment({ ...attempt(), toolRef: 'operation:test', inputDigest: 'sha256:input', state: 'possibly_submitted', submissionStartedAt: 11 })
    const observation = paymentObservationArgs({ settlementStatus: 'settled' })
    const checkpoint = {
      dispatchRef: observation.dispatchRef, attemptRef: observation.attemptRef,
      effectGeneration: observation.effectGeneration, toolRef: observation.toolRef,
      inputDigest: observation.inputDigest, paymentIdentifier: observation.paymentIdentifier,
      responseStatus: 200, responseDigest: quarantinedResponseDigest, outputJson: quarantinedOutputJson,
      requestDigest: canonicalDigest('request'),
      settlementTransactionRef: `chain:eip155:8453:0x${'a'.repeat(64)}`,
      paymentResponseDigest: canonicalDigest('payment-response'),
    }
    const scheduler = { runAfter: vi.fn() }
    const checkpointContext = { db, scheduler }
    await checkpointResponse(checkpointContext, checkpoint)
    await checkpointResponse(checkpointContext, checkpoint)
    expect(db.patchCalls).toHaveLength(1)
    expect(scheduler.runAfter).toHaveBeenCalledTimes(1)
    expect(getFunctionName(scheduler.runAfter.mock.calls[0]?.[1])).toBe('moneyX402PaymentAttempts:beginResponseRecovery')
    expect(scheduler.runAfter.mock.calls[0]?.[0]).toBe(15_000)
    const beforeVerification = await readAttempt({ db }, {
      dispatchRef: 'invocation:test', attemptRef: 'attempt:test', effectGeneration: 1,
    })
    expect(beforeVerification).toMatchObject({
      state: 'possibly_submitted', responseStatus: 200, quarantinedOutputJson, quarantinedResponseDigest,
    })
    expect(beforeVerification).not.toHaveProperty('settlementStatus')
    await expect(checkpointResponse({ db }, { ...checkpoint, inputDigest: 'wrong' }))
      .rejects.toThrow('x402_payment_observation_attribution_invalid')
    await expect(checkpointResponse({ db }, { ...checkpoint, outputJson: '{"changed":true}' }))
      .rejects.toThrow('x402_payment_quarantined_output_conflict')
    await expect(checkpointResponse({ db }, { ...checkpoint, responseStatus: 500 }))
      .rejects.toThrow('x402_payment_response_status_conflict')
    await expect(checkpointResponse({ db }, { ...checkpoint, requestDigest: canonicalDigest('other-request') }))
      .rejects.toThrow('x402_payment_observation_attribution_invalid')
    await expect(checkpointResponse({ db }, { ...checkpoint, paymentResponseDigest: canonicalDigest('other-payment') }))
      .rejects.toThrow('x402_payment_observation_attribution_invalid')
    await expect(checkpointResponse({ db }, { ...checkpoint, responseStatus: 600 }))
      .rejects.toThrow('x402_payment_response_status_invalid')
    expect(db.patchCalls).toHaveLength(1)
    // A verifier failure can return an observation without a body; it must not erase it.
    await recordObservation({ db, runMutation: async () => null }, {
      ...observation,
      transportRequestDigest: checkpoint.requestDigest,
      paymentResponseDigest: checkpoint.paymentResponseDigest,
    })
    expect(await readAttempt({ db }, {
      dispatchRef: 'invocation:test', attemptRef: 'attempt:test', effectGeneration: 1,
    })).toMatchObject({ settlementStatus: 'settled', quarantinedOutputJson, quarantinedResponseDigest })
  })

  it('keeps status-only response evidence through retry and a later payment observation', async () => {
    const db = memoryDbWithPayment({ ...attempt(), toolRef: 'operation:test', inputDigest: 'sha256:input', state: 'possibly_submitted' })
    const observation = paymentObservationArgs({
      settlementStatus: 'unknown', responseStatus: 502,
      quarantinedResponseDigest: undefined, quarantinedOutputJson: undefined,
      paymentResponseDigest: undefined,
    })
    const checkpoint = {
      dispatchRef: observation.dispatchRef, attemptRef: observation.attemptRef,
      effectGeneration: observation.effectGeneration, toolRef: observation.toolRef,
      inputDigest: observation.inputDigest, paymentIdentifier: observation.paymentIdentifier,
      responseStatus: 502, requestDigest: canonicalDigest('request'),
      settlementTransactionRef: `chain:eip155:8453:0x${'a'.repeat(64)}`,
    }
    const scheduler = { runAfter: vi.fn() }
    await checkpointResponse({ db, scheduler }, checkpoint)
    await checkpointResponse({ db, scheduler }, checkpoint)
    expect(db.patchCalls).toHaveLength(1)
    expect(scheduler.runAfter).toHaveBeenCalledTimes(1)
    const attemptIdentity = { dispatchRef: 'invocation:test', attemptRef: 'attempt:test', effectGeneration: 1 }
    expect(await readAttempt({ db }, attemptIdentity)).toMatchObject({ responseStatus: 502, state: 'possibly_submitted' })
    expect(await readAttempt({ db }, attemptIdentity)).not.toHaveProperty('quarantinedOutputJson')
    await expect(checkpointResponse({ db }, { ...checkpoint, settlementTransactionRef: `chain:eip155:8453:0x${'b'.repeat(64)}` }))
      .rejects.toThrow('x402_payment_observation_attribution_invalid')
    await expect(recordObservation({ db, runMutation: async () => null }, { ...observation, responseStatus: 503 }))
      .rejects.toThrow('x402_payment_response_status_conflict')
    await recordObservation({ db, runMutation: async () => null }, {
      ...observation, transportRequestDigest: checkpoint.requestDigest,
    })
    expect(await readAttempt({ db }, attemptIdentity)).toMatchObject({ responseStatus: 502, settlementStatus: 'unknown' })
    expect(db.patchCalls).toHaveLength(2)
  })

  it.each([
    ['partial pair', { quarantinedOutputJson: undefined }],
    ['not-settled observation', {
      settlementStatus: 'not_settled',
      quarantinedResponseDigest,
      quarantinedOutputJson,
    }],
    ['noncanonical digest', { quarantinedResponseDigest: 'sha256:not-canonical' }],
    ['malformed JSON', { quarantinedOutputJson: '{not-json' }],
    ['non-normalized JSON', { quarantinedOutputJson: '{ "result": "usable-after-reconciliation" }' }],
    ['oversized JSON', { quarantinedOutputJson: JSON.stringify('x'.repeat(512 * 1024)) }],
  ])('refuses invalid quarantined output: %s', async (_label, overrides) => {
    const db = memoryDbWithPayment({ ...attempt(), state: 'possibly_submitted', submissionStartedAt: 11 })

    await expect(recordObservation({ db }, paymentObservationArgs({
      settlementStatus: 'unknown',
      ...overrides,
    }))).rejects.toThrow('x402_payment_quarantined_output_invalid')
    expect(db.patchCalls).toHaveLength(0)
  })

  it.each([
    ['response digest', { quarantinedResponseDigest: canonicalDigest('different-response') }],
    ['output JSON', { quarantinedOutputJson: JSON.stringify({ result: 'different' }) }],
  ])('refuses replay when quarantined %s drifts', async (_label, overrides) => {
    const db = memoryDbWithPayment({ ...attempt(), state: 'possibly_submitted', submissionStartedAt: 11 })
    const args = paymentObservationArgs({ settlementStatus: 'unknown' })
    await recordObservation({ db, runMutation: async () => null }, args)
    db.patchCalls.length = 0

    await expect(recordObservation({ db }, { ...args, ...overrides }))
      .rejects.toThrow('x402_payment_quarantined_output_conflict')
    expect(db.patchCalls).toHaveLength(0)
  })

  it('refuses a partially persisted quarantined output', async () => {
    const db = new MemoryDb()
    const args = paymentObservationArgs({ settlementStatus: 'unknown' })
    db.seed({
      ...attempt(),
      ...args,
      state: 'reconciliation_required',
      quarantinedOutputJson: undefined,
    })

    await expect(recordObservation({ db }, args))
      .rejects.toThrow('x402_payment_quarantined_output_conflict')
    await expect(readAttempt({ db }, {
      dispatchRef: 'invocation:test',
      attemptRef: 'attempt:test',
      effectGeneration: 1,
    })).rejects.toThrow('x402_payment_quarantined_output_conflict')
    expect(db.patchCalls).toHaveLength(0)
  })

  it('preserves a matching pre-verification checkpoint when recording the observation', async () => {
    const db = new MemoryDb()
    const args = paymentObservationArgs({ settlementStatus: 'unknown' })
    db.seed({
      ...attempt(),
      state: 'possibly_submitted',
      submissionStartedAt: 11,
      quarantinedResponseDigest,
      quarantinedOutputJson,
    })

    await expect(recordObservation({ db, runMutation: async () => null }, args)).resolves.toBeNull()
    expect(await readAttempt({ db }, {
      dispatchRef: 'invocation:test', attemptRef: 'attempt:test', effectGeneration: 1,
    })).toMatchObject({ quarantinedResponseDigest, quarantinedOutputJson, settlementStatus: 'unknown' })
  })

  it.each([
    ['toolRef', 'x402_payment_observation_attribution_invalid'],
    ['inputDigest', 'x402_payment_observation_attribution_invalid'],
    ['paymentObservationDigest', 'x402_payment_observation_attribution_invalid'],
    ['transportObservationDigest', 'x402_payment_observation_attribution_invalid'],
    ['transportRequestDigest', 'x402_payment_observation_attribution_invalid'],
    ['settlementStatus', 'x402_payment_settlement_identity_conflict'],
    ['paymentResponseDigest', 'x402_payment_response_identity_conflict'],
  ] as const)('rejects an already observed payment observation when %s drifts without patching', async (field, error) => {
    const db = new MemoryDb()
    const args = seedPaymentObservationAttempt(db, 'observed', 'settled', 'complete')
    const before = JSON.stringify(db.rows('moneyX402PaymentAttempts'))
    const driftedArgs = {
      ...args,
      [field]: field === 'settlementStatus' ? 'not_settled' : 'sha256:drift',
    }

    await expect(recordObservation({ db }, driftedArgs)).rejects.toThrow(error)

    expect(db.patchCalls).toHaveLength(0)
    expect(JSON.stringify(db.rows('moneyX402PaymentAttempts'))).toBe(before)
  })

  function seedAdmittedPaidConsequence() {
    const db = new MemoryDb()
    seedReconciliationAuthority(db, 'revoked')
    const call = db.rows('capabilityCalls')[0]!
    const payment = db.rows('moneyX402PaymentAttempts')[0]!
    const basis = { kind: 'spending_policy_use', spendingPolicyRef: 'policy:one', spendingPolicyVersion: 1,
      spendingPolicyGeneration: 1, authorityUseRef: 'use:one', grantEvidenceRef: 'evidence:grant' }
    const expiresAt = new Date(10_000).toISOString()
    const actor = { callerRef: call.credentialId, principalRef: call.principalId }
    const origin = { kind: 'standalone', ...actor }
    Object.assign(call, { state: 'reconciliation_required', quoteRef: 'quote:original',
      formanceFinancialState: 'outcome_unknown', formanceReservationRefs: ['reservation:test'],
      authority: { format: 'operation-invoke-authority:v1', callRef: call.callRef, toolRef: call.toolRef,
        inputDigest: call.inputDigest, grantRef: call.grantRef, grantGeneration: call.grantGeneration,
        grantDigest: 'sha256:grant', reference: 'authority:original', decisionDigest: 'sha256:decision',
        targetDigest: 'sha256:target', consequence: 'purchase', limits: {}, expiresAt, acceptedBasis: basis },
    })
    Object.assign(payment, { submissionStartedAt: 3_000, paymentSignatureDigest: firstDigest,
      paymentPayer, paymentNonce, responseStatus: 200, quarantinedOutputJson, quarantinedResponseDigest })
    db.seedTable('actionExecutionControls', {
      ...actionControlRow(), sourceRef: `operation-invocation-source:${String(call.callRef)}`,
      preparedMaterialDigest: call.inputDigest, preparedTargetDigest: 'sha256:target',
      authorityDecisionAt: new Date(2_000).toISOString(),
      control: { executionRef: call.callRef, owner: actor, origin,
        action: { id: 'operation:test', contractVersion: '1' },
        authority: { reference: 'authority:original', expiresAt }, acceptedAuthority: basis },
      authorityBinding: { executionRef: call.callRef, actor, origin, reference: 'authority:original',
        actionId: 'operation:test', contractVersion: '1', digest: 'sha256:decision',
        targetDigest: 'sha256:target', expiresAt, acceptedBasis: basis },
    })
    db.seedTable('actionExecutionAttempts', { _id: 'canonical:attempt', executionRef: call.callRef,
      attemptRef: payment.attemptRef, effectGeneration: payment.effectGeneration, actor,
      idempotency: { materialInputDigest: call.inputDigest } })
    return db
  }

  it.each(['revoked grant', 'expired credential', 'rotated credential'])('finishes only the original admitted paid consequence after %s', async change => {
    const db = seedAdmittedPaidConsequence()
    if (change === 'expired credential') db.rows('credentials')[0]!.expiresAt = 1
    if (change === 'rotated credential') db.rows('externalIdentityBindings')[0]!.credentialGeneration = 2
    await expect(reconcile({ db, runMutation: async () => null }, reconciliationArgs()))
      .resolves.toEqual({ kind: 'settled', settlementStatus: 'settled' })
    expect(db.rows('moneyX402PaymentAttempts')[0]).toMatchObject({ state: 'observed', settlementStatus: 'settled' })
  })

  it.each([
    ['missing original authority', (db: MemoryDb) => { delete db.rows('capabilityCalls')[0]!.authority }],
    ['different reservation', (db: MemoryDb) => { db.rows('capabilityCalls')[0]!.formanceReservationRefs = ['another-reservation'] }],
    ['no submission', (db: MemoryDb) => { delete db.rows('moneyX402PaymentAttempts')[0]!.submissionStartedAt }],
    ['submission after admission expired', (db: MemoryDb) => { db.rows('moneyX402PaymentAttempts')[0]!.submissionStartedAt = 10_001 }],
    ['different effect generation', (db: MemoryDb) => { db.rows('actionExecutionControls')[0]!.currentEffectGeneration = 2 }],
    ['different original actor', (db: MemoryDb) => { db.rows('actionExecutionAttempts')[0]!.actor = { principalRef: 'other', callerRef: 'other' } }],
    ['missing retained HTTP status', (db: MemoryDb) => { delete db.rows('moneyX402PaymentAttempts')[0]!.responseStatus }],
  ] as const)('does not broaden historical recovery for %s', async (_label, change) => {
    const db = seedAdmittedPaidConsequence()
    change(db)
    const before = JSON.stringify(db.rows('moneyX402PaymentAttempts'))
    await expect(reconcile({ db, runMutation: async () => null }, reconciliationArgs()))
      .resolves.toEqual({ kind: 'reconciliation_required' })
    expect(JSON.stringify(db.rows('moneyX402PaymentAttempts'))).toBe(before)
  })

  it('rechecks the persisted invocation grant before reconciling an x402 effect', async () => {
    const active = new MemoryDb()
    seedReconciliationAuthority(active, 'active')
    await expect(
      reconcile({ db: active, runMutation: async () => null }, reconciliationArgs()),
    ).resolves.toEqual({
      kind: 'settled',
      settlementStatus: 'settled',
    })
    expect(active.rows('moneyX402PaymentAttempts')[0]).toMatchObject({
      state: 'observed',
      settlementStatus: 'settled',
      reconciliationEvidenceRef: 'evidence:x402-reconciliation',
      reconciliationEvidenceDigest: 'sha256:x402-reconciliation',
    })

    const revoked = new MemoryDb()
    seedReconciliationAuthority(revoked, 'revoked')
    const before = JSON.stringify(revoked.rows('moneyX402PaymentAttempts'))
    await expect(
      reconcile({ db: revoked, runMutation: async () => null }, reconciliationArgs()),
    ).resolves.toEqual({
      kind: 'reconciliation_required',
    })
    expect(JSON.stringify(revoked.rows('moneyX402PaymentAttempts'))).toBe(before)
  })

  it('reconciles current spending-policy grants and rejects a mismatched current digest', async () => {
    const db = new MemoryDb()
    seedReconciliationAuthority(db, 'active')
    const grant = db.rows('agentAccessGrants')[0]!
    grant.spendingPolicyDigest = grant.policyDigest
    delete grant.policyDigest
    await expect(reconcile({ db, runMutation: async () => null }, reconciliationArgs()))
      .resolves.toMatchObject({ kind: 'settled' })

    const changed = new MemoryDb()
    seedReconciliationAuthority(changed, 'active')
    changed.rows('agentAccessGrants')[0]!.spendingPolicyDigest = 'sha256:changed'
    await expect(reconcile({ db: changed, runMutation: async () => null }, reconciliationArgs()))
      .resolves.toEqual({ kind: 'reconciliation_required' })
  })

  it.each([
    {
      name: 'expired credential',
      mutate: (db: MemoryDb) => {
        const row = db.rows('credentials')[0]
        if (row !== undefined) row.expiresAt = 1
      },
    },
    {
      name: 'stale credential generation',
      mutate: (db: MemoryDb) => {
        const row = db.rows('externalIdentityBindings')[0]
        if (row !== undefined) row.credentialGeneration = 2
      },
    },
    {
      name: 'delegation scope mismatch',
      mutate: (db: MemoryDb) => {
        const row = db.rows('authorityDelegationGrants')[0]
        if (row !== undefined) row.scopes = ['market.operations.read']
      },
    },
    {
      name: 'delegation ancestry cycle',
      mutate: (db: MemoryDb) => {
        const row = db.rows('authorityDelegationGrants')[0]
        if (row !== undefined) {
          row.parentGrantRef = row.grantRef
          row.parentGeneration = row.generation
        }
      },
    },
    {
      name: 'cross-account delegation',
      mutate: (db: MemoryDb) => {
        const row = db.rows('authorityDelegationGrants')[0]
        if (row !== undefined) row.accountRef = `acc_${'8'.repeat(32)}`
      },
    },
  ])('keeps x402 ambiguity safe for $name', async ({ mutate }) => {
    const db = new MemoryDb()
    seedReconciliationAuthority(db, 'active')
    mutate(db)
    const before = JSON.stringify(db.rows('moneyX402PaymentAttempts'))
    await expect(
      reconcile({ db, runMutation: async () => null }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'reconciliation_required' })
    expect(JSON.stringify(db.rows('moneyX402PaymentAttempts'))).toBe(before)
  })

  it('lists at most 25 redacted expired prepared candidates through the expiry index', async () => {
    const db = new MemoryDb()
    for (let index = 0; index < 30; index += 1) {
      db.seed({
        ...attempt(),
        _id: `expired:${index}`,
        dispatchRef: `dispatch:${index}`,
        attemptRef: `attempt:${index}`,
        custodyRef: `custody:${index}`,
        authorizationDigest: `authorization:${index}`,
        reservationRef: `reservation:${index}`,
        paymentAuthorizationExpiresAt: 4_000 + index,
      })
    }
    db.seed({ ...attempt(), state: 'prepared', paymentAuthorizationExpiresAt: 6_000 })
    db.seed({ ...attempt(), state: 'possibly_submitted', paymentAuthorizationExpiresAt: 1_000 })
    db.seed({ ...attempt(), state: 'observed', paymentAuthorizationExpiresAt: 1_000 })
    db.seed({ ...attempt(), paymentAuthorizationExpiresAt: undefined })

    const result = await listExpiredPrepared({ db }, { now: 5_000, limit: 25 }) as Array<Record<string, unknown>>
    expect(db.indexCalls).toContain('by_state_and_paymentAuthorizationExpiresAt')
    expect(result).toHaveLength(25)
    expect(result[0]).toEqual({
      dispatchRef: 'dispatch:0',
      attemptRef: 'attempt:0',
      effectGeneration: 1,
      custodyRef: 'custody:0',
      authorizationDigest: 'authorization:0',
      reservationRef: 'reservation:0',
      paymentAuthorizationExpiresAt: 4_000,
    })
    expect(Object.keys(result[0] ?? {}).sort()).toEqual([
      'attemptRef',
      'authorizationDigest',
      'custodyRef',
      'dispatchRef',
      'effectGeneration',
      'paymentAuthorizationExpiresAt',
      'reservationRef',
    ])
    expect(JSON.stringify(result)).not.toContain('paymentUnsignedMaterialJson')
    expect(JSON.stringify(result)).not.toContain('paymentSigningIdempotencyKey')
    expect(JSON.stringify(result)).not.toContain('paymentPayer')
    expect(JSON.stringify(result)).not.toContain('paymentNonce')
  })

  it('atomically queues an expired prepared authorization and replays by exact identity', async () => {
    const db = new MemoryDb()
    db.seed(signedAttemptRow({
      _id: 'payment:expiry',
      toolRef: 'operation:test',
      inputDigest: 'sha256:input',
      reservationRef: 'reservation:test',
      paymentAuthorizationExpiresAt: 4_000,
      paymentSigningClaimedAt: 1,
    }))
    seedExpiryInvocationControl(db)
    const args = expiryArgs()

    await expect(queueExpired({ db }, args)).resolves.toMatchObject({ kind: 'queued', disposition: 'automatic', callRef: 'invocation:test', toolRef: 'operation:test', evidence: {
      attemptRef: 'attempt:test', effectGeneration: 1, evidenceSource: 'x402_authorization_expired:provider_transaction_or_chain_nonce_evidence_required',
    } })
    const payment = db.rows('moneyX402PaymentAttempts')[0]
    const invocation = db.rows('capabilityCalls')[0]
    expect(payment).toMatchObject({
      state: 'reconciliation_required',
      paymentUnsignedMaterialDigest: unsignedMaterialDigest,
      paymentSigningIdempotencyKey: signingKey,
      paymentSignatureDigest: firstDigest,
      paymentPayer,
      paymentNonce,
      paymentAuthorizationValidBefore,
      paymentAuthorizationExpiresAt: 4_000,
      requestFingerprint: fingerprint,
      reservationRef: 'reservation:test',
      custodyRef,
      authorizationDigest,
    })
    expect(payment).not.toHaveProperty('paymentUnsignedMaterialJson')
    expect(payment).not.toHaveProperty('settlementStatus')
    expect(payment).not.toHaveProperty('paymentResponseDigest')
    expect(payment).not.toHaveProperty('submissionStartedAt')
    expect(invocation).toMatchObject({
      state: 'reconciliation_required',
      dispatchState: 'reconciliation_required',
      attemptRef: 'attempt:test',
      result: {
        kind: 'reconciliation_required',
        callRef: 'invocation:test',
        toolRef: 'operation:test',
        evidence: {
          attemptRef: 'attempt:test',
          effectGeneration: 1,
          requiredAt: new Date(5_000).toISOString(),
          retry: 'reconcile_before_retry',
          evidenceSource: 'x402_authorization_expired:provider_transaction_or_chain_nonce_evidence_required',
        },
      },
      reconciliation: {
        attemptCount: 0,
        nextAttemptAt: 5_000,
        disposition: 'automatic',
        reason: 'authorization_expired',
      },
    })

    const committedSnapshot = JSON.stringify({ payment, invocation })
    await expect(queueExpired({ db }, args)).resolves.toMatchObject({ kind: 'queued', disposition: 'automatic', callRef: 'invocation:test', toolRef: 'operation:test', evidence: {
      attemptRef: 'attempt:test', effectGeneration: 1, evidenceSource: 'x402_authorization_expired:provider_transaction_or_chain_nonce_evidence_required',
    } })
    expect(JSON.stringify({
      payment: db.rows('moneyX402PaymentAttempts')[0],
      invocation: db.rows('capabilityCalls')[0],
    })).toBe(committedSnapshot)

    await expect(claim({ db }, claimArgs())).rejects.toThrow('x402_payment_attempt_reconciliation_required')
    await expect(recordIntent({ db }, intentArgs())).rejects.toThrow('x402_payment_attempt_reconciliation_required')
    await expect(recordDigest({ db }, digestArgs())).rejects.toThrow('x402_payment_attempt_reconciliation_required')
  })

  it('refuses not-yet-expired and possibly submitted rows without changing either table', async () => {
    const db = new MemoryDb()
    seedExpiryQueuePair(db, {
      suffix: 'not-yet-expired',
      payment: { paymentAuthorizationExpiresAt: 6_000 },
    })
    seedExpiryQueuePair(db, {
      suffix: 'possibly-submitted',
      payment: {
        state: 'possibly_submitted',
        submissionStartedAt: 2,
        paymentAuthorizationExpiresAt: 4_000,
      },
    })
    const before = paymentAndInvocationSnapshot(db)

    await expect(queueExpired({ db }, expiryArgsForSuffix('not-yet-expired'))).resolves.toEqual({ kind: 'not_queued' })
    await expect(queueExpired({ db }, expiryArgsForSuffix('possibly-submitted'))).resolves.toEqual({ kind: 'not_queued' })
    expect(paymentAndInvocationSnapshot(db)).toBe(before)
  })

  it('does not overwrite an unrelated outer reconciliation projection', async () => {
    const db = new MemoryDb()
    db.seed(expiryPreparedPaymentRow())
    db.seedTable('capabilityCalls', invocationRow({
      state: 'reconciliation_required',
      dispatchState: 'reconciliation_required',
      result: {
        kind: 'reconciliation_required',
        callRef: 'invocation:test',
        toolRef: 'operation:test',
        evidence: {
          attemptRef: 'attempt:test',
          effectGeneration: 1,
          requiredAt: new Date(1_000).toISOString(),
          retry: 'reconcile_before_retry',
          evidenceSource: 'operation:unrelated',
        },
      },
      reconciliation: {
        attemptCount: 2,
        nextAttemptAt: 6_000,
        disposition: 'automatic',
        reason: 'pending_accounting',
      },
    }))
    db.seedTable('actionExecutionControls', actionControlRow())
    const before = paymentAndInvocationSnapshot(db)

    await expect(queueExpired({ db }, expiryArgs())).resolves.toEqual({ kind: 'not_queued' })
    expect(paymentAndInvocationSnapshot(db)).toBe(before)
  })

  it('refuses the expiry transition when the canonical control version changed', async () => {
    const db = new MemoryDb()
    db.seed(expiryPreparedPaymentRow())
    seedExpiryInvocationControl(db, { executionVersion: 3 })
    const before = paymentAndInvocationSnapshot(db)

    await expect(queueExpired({ db }, expiryArgs())).resolves.toEqual({ kind: 'not_queued' })
    expect(paymentAndInvocationSnapshot(db)).toBe(before)
  })

  it.each([0, 26, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects expired prepared candidate limit %s',
    async (limit) => {
      const db = new MemoryDb()
      await expect(listExpiredPrepared({ db }, { now: 5_000, limit }))
        .rejects.toThrow('x402_payment_expired_prepared_limit_invalid')
    },
  )
})
async function withMockedNow<T>(now: number, run: () => Promise<T>): Promise<T> {
  const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now)
  try {
    return await run()
  } finally {
    nowSpy.mockRestore()
  }
}

function expectNoPaymentAttempts(db: MemoryDb): void {
  expect(db.rows('moneyX402PaymentAttempts')).toHaveLength(0)
}


describe('retained response recovery watchdog', () => {
  function claimedHttpErrorRemedy(attemptCount: number, mismatchedTransaction = false) {
    const db = new MemoryDb()
    const transactionHash = `0x${'a'.repeat(64)}`
    const owner = `paid-result-loss:http-error:${transactionHash}`
    db.seedTable('capabilityCalls', { _id: 'call:watchdog', callRef: 'call:watchdog', state: 'reconciliation_required',
      toolRef: 'operation:test', inputDigest: 'sha256:input',
      result: { kind: 'reconciliation_required', evidence: { attemptRef: 'attempt:test', effectGeneration: 1 } },
      reconciliation: { leaseOwner: owner, leaseExpiresAt: Number.MAX_SAFE_INTEGER, nextAttemptAt: Date.now(),
        attemptCount, disposition: 'manual_review', reason: 'refund_pending' } })
    db.seed({ ...attempt(), dispatchRef: 'call:watchdog', toolRef: 'operation:test', inputDigest: 'sha256:input',
      responseStatus: 500,
      evidenceRefs: [`chain:eip155:8453:${mismatchedTransaction ? `0x${'b'.repeat(64)}` : transactionHash}`] })
    return { db, owner }
  }

  it.each([0, 1])('resumes an exact HTTP-error refund after claim or ledger interruption at watchdog step %s', async step => {
    const { db, owner } = claimedHttpErrorRemedy(step)
    const scheduler = { runAt: vi.fn(), runAfter: vi.fn() }
    const ctx = { db, scheduler }
    await expect(beginRecovery(ctx, { callRef: 'call:watchdog', attempt: step })).resolves.toBe(true)
    expect(db.rows('capabilityCalls')[0]).toMatchObject({ reconciliation: {
      leaseOwner: owner, leaseExpiresAt: Number.MAX_SAFE_INTEGER, reason: 'refund_pending',
      disposition: 'automatic', attemptCount: step + 1,
    } })
    await expect(recoveryIsCurrent({ db }, { callRef: 'call:watchdog', attempt: step })).resolves.toBe(true)
    await expect(beginRecovery(ctx, { callRef: 'call:watchdog', attempt: step })).resolves.toBe(false)
    expect(scheduler.runAt).toHaveBeenCalledTimes(1)
    expect(scheduler.runAt.mock.calls[0]?.[2]).toEqual({ callRef: 'call:watchdog', attempt: step + 1 })
    expect(scheduler.runAfter).toHaveBeenCalledTimes(1)
    // Claiming the same refund after the ledger interruption retains attemptCount.
    const record = db.rows('capabilityCalls')[0]!
    await db.patch(String(record._id), { reconciliation: { ...(record.reconciliation as Record<string, unknown>), disposition: 'manual_review' } })
    await expect(beginRecovery(ctx, { callRef: 'call:watchdog', attempt: step + 1 })).resolves.toBe(true)
    await expect(recoveryIsCurrent({ db }, { callRef: 'call:watchdog', attempt: step })).resolves.toBe(false)
    expect(db.rows('capabilityCalls')[0]).toMatchObject({ reconciliation: { leaseOwner: owner, leaseExpiresAt: Number.MAX_SAFE_INTEGER } })
  })

  it('does not resume a permanent refund claim for a different transaction', async () => {
    const { db } = claimedHttpErrorRemedy(1, true)
    const scheduler = { runAt: vi.fn(), runAfter: vi.fn() }
    const before = JSON.stringify(db.rows('capabilityCalls'))
    await expect(beginRecovery({ db, scheduler }, { callRef: 'call:watchdog', attempt: 1 })).resolves.toBe(false)
    expect(scheduler.runAt).not.toHaveBeenCalled()
    expect(scheduler.runAfter).not.toHaveBeenCalled()
    expect(JSON.stringify(db.rows('capabilityCalls'))).toBe(before)
  })

  it('exhausts HTTP-error retries without removing the permanent money fence', async () => {
    const { db, owner } = claimedHttpErrorRemedy(4)
    const scheduler = { runAt: vi.fn(), runAfter: vi.fn() }
    await expect(beginRecovery({ db, scheduler }, { callRef: 'call:watchdog', attempt: 4 })).resolves.toBe(false)
    expect(db.rows('capabilityCalls')[0]).toMatchObject({ reconciliation: {
      leaseOwner: owner, leaseExpiresAt: Number.MAX_SAFE_INTEGER, disposition: 'manual_review', attemptCount: 5,
    } })
    expect(scheduler.runAt).not.toHaveBeenCalled()
    expect(scheduler.runAfter).not.toHaveBeenCalled()
    await expect(recoveryIsCurrent({ db }, { callRef: 'call:watchdog', attempt: 4 })).resolves.toBe(false)
  })

  it('waits out an existing status sweep without losing or duplicating the paid-response watchdog', async () => {
    const db = new MemoryDb()
    const expiresAt = Date.now() + 10_000
    db.seedTable('capabilityCalls', { _id: 'call:watchdog', callRef: 'call:watchdog', state: 'reconciliation_required',
      reconciliation: { leaseOwner: 'reconciliation-sweep:one', leaseExpiresAt: expiresAt, nextAttemptAt: Date.now(),
        attemptCount: 0, disposition: 'automatic', reason: 'unknown_settlement' } })
    const scheduler = { runAt: vi.fn(), runAfter: vi.fn() }
    const ctx = { db, scheduler }
    await expect(beginRecovery(ctx, { callRef: 'call:watchdog', attempt: 0 })).resolves.toBe(false)
    await expect(beginRecovery(ctx, { callRef: 'call:watchdog', attempt: 0 })).resolves.toBe(false)
    expect(scheduler.runAt).toHaveBeenCalledTimes(1)
    expect(scheduler.runAt.mock.calls[0]?.[0]).toBe(expiresAt + 1)
    expect(db.rows('capabilityCalls')[0]).toMatchObject({ reconciliation: { leaseOwner: 'reconciliation-sweep:one' } })
  })

  it('durably queues one successor before recovery, prevents duplicate fanout, and bounds retry exhaustion', async () => {
    const db = new MemoryDb()
    db.seedTable('capabilityCalls', { _id: 'call:watchdog', callRef: 'call:watchdog', state: 'reconciliation_required' })
    const scheduler = { runAt: vi.fn(), runAfter: vi.fn() }
    const ctx = { db, scheduler }
    const t0 = 1_000_000
    const clock = vi.spyOn(Date, 'now').mockReturnValue(t0)
    await expect(beginRecovery(ctx, { callRef: 'call:watchdog', attempt: 0 })).resolves.toBe(true)
    await expect(beginRecovery(ctx, { callRef: 'call:watchdog', attempt: 0 })).resolves.toBe(false)
    expect(scheduler.runAt).toHaveBeenCalledTimes(1)
    expect(scheduler.runAt.mock.calls[0]?.[0]).toBe(t0 + 60_000)
    expect(db.rows('capabilityCalls')[0]).toMatchObject({ reconciliation: {
      nextAttemptAt: t0 + 60_000, leaseExpiresAt: t0 + 120_000 } })
    expect(getFunctionName(scheduler.runAt.mock.calls[0]?.[1])).toBe('moneyX402PaymentAttempts:beginResponseRecovery')
    expect(scheduler.runAfter).toHaveBeenCalledTimes(1)
    expect(getFunctionName(scheduler.runAfter.mock.calls[0]?.[1])).toBe('moneyX402ResponseActions:recover')
    await expect(recoveryIsCurrent({ db }, { callRef: 'call:watchdog', attempt: 0 })).resolves.toBe(true)
    // Never run effect action 0: simulate death before the first instruction.
    // The independently committed successor still advances recovery.
    await expect(beginRecovery(ctx, { callRef: 'call:watchdog', attempt: 1 })).resolves.toBe(true)
    await expect(recoveryIsCurrent({ db }, { callRef: 'call:watchdog', attempt: 0 })).resolves.toBe(false)
    await beginRecovery(ctx, { callRef: 'call:watchdog', attempt: 2 })
    await beginRecovery(ctx, { callRef: 'call:watchdog', attempt: 3 })
    await expect(beginRecovery(ctx, { callRef: 'call:watchdog', attempt: 4 })).resolves.toBe(false)
    clock.mockRestore()
    // After the 15s checkpoint hop, the ladder reaches manual review about 15 minutes later.
    expect(scheduler.runAt.mock.calls.map(call => (call[0] as number) - t0)).toEqual([60_000, 120_000, 240_000, 480_000])
    expect(scheduler.runAfter).toHaveBeenCalledTimes(4)
    await expect(recoveryIsCurrent({ db }, { callRef: 'call:watchdog', attempt: 4 })).resolves.toBe(false)
    expect(db.rows('capabilityCalls')[0]).toMatchObject({ reconciliation: { disposition: 'manual_review', attemptCount: 5 } })
    await db.patch('call:watchdog', { state: 'completed' })
    await expect(beginRecovery(ctx, { callRef: 'call:watchdog', attempt: 4 })).resolves.toBe(false)
  })
})

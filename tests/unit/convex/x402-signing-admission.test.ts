import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import type { CdpX402PaymentSigningIntent } from '@/modules/capability-supply/server'
import { admitManagedX402Signing } from '@/modules/capability-execution/call-worker/x402SigningAdmission'
import { getFunctionName } from 'convex/server'

const provider = vi.hoisted(() => ({ screen: vi.fn() }))
vi.mock('@/modules/money/x402-payee-screening.server', () => ({ screenX402Payee: provider.screen }))
const material = { accepted: { network: 'eip155:84532', payTo: `0x${'aB'.repeat(20)}` },
  typedData: { domain: { chainId: 84532 }, message: { value: '1000' } } }
const intent: CdpX402PaymentSigningIntent = {
  paymentUnsignedMaterialJson: stableStringify(material), paymentUnsignedMaterialDigest: canonicalDigest(material),
  paymentSigningIdempotencyKey: '11111111-1111-4111-8111-111111111111',
  paymentPayer: `0x${'1'.repeat(40)}`, paymentNonce: `0x${'2'.repeat(64)}`,
  paymentAuthorizationValidBefore: '2000000000', paymentAuthorizationExpiresAt: 2_000_000_000_000,
  requestFingerprint: canonicalDigest('request'),
}
const attempt = { custodyRef: 'custody:one', authorizationDigest: canonicalDigest('authorization'), custodyGeneration: 1 }
const request = { network: material.accepted.network, normalizedPayTo: material.accepted.payTo.toLowerCase(),
  paymentUnsignedMaterialDigest: intent.paymentUnsignedMaterialDigest, typedDataDigest: canonicalDigest(material.typedData) }
const clear = { ...request, provider: 'trm-wallet-screening' as const, outcome: 'clear' as const,
  startedAt: 1_000, checkedAt: 1_001, reason: 'provider_clear' }
const admitted = { kind: 'admitted', reservationRef: 'reservation:one', screeningCheckRef: 'check:one', policyRevision: 'policy:one' }
const context = () => ({ runMutation: vi.fn().mockResolvedValue(admitted) })

beforeEach(() => { provider.screen.mockReset().mockResolvedValue(clear) })
afterEach(() => { vi.restoreAllMocks() })

describe('managed signing orchestration', () => {
  it('screens the signed recipient and typed data afresh on every invocation, then requires committed admission', async () => {
    const ctx = context()
    expect(await admitManagedX402Signing(ctx as never, attempt, intent)).toBe(true)
    expect(await admitManagedX402Signing(ctx as never, attempt, intent, 'forensic_replay')).toBe(true)
    expect(provider.screen.mock.calls).toEqual([[request], [request]])
    const first = ctx.runMutation.mock.calls[0]!
    const second = ctx.runMutation.mock.calls[1]!
    expect(getFunctionName(first[0])).toBe('moneyX402PaymentAttempts:recordScreeningAndReserveSigning')
    expect(first[1]).toEqual({ ...attempt, purpose: 'sign', screening: clear,
      paymentUnsignedMaterialDigest: intent.paymentUnsignedMaterialDigest,
      paymentSigningIdempotencyKey: intent.paymentSigningIdempotencyKey, screeningInvocationRef: expect.any(String) })
    expect(second[1].purpose).toBe('forensic_replay')
    expect(second[1].screeningInvocationRef).not.toBe(first[1].screeningInvocationRef)
  })

  it('waits for the provider before writing the audit or admitting a signature', async () => {
    let finish: (value: typeof clear) => void = () => { throw new Error('not_started') }
    provider.screen.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const ctx = context()
    const pending = admitManagedX402Signing(ctx as never, attempt, intent)
    expect(ctx.runMutation).not.toHaveBeenCalled()
    finish(clear)
    expect(await pending).toBe(true)
  })

  it('returns false on atomic cap refusal even when the provider cleared the payee', async () => {
    const ctx = context()
    ctx.runMutation.mockResolvedValue({ kind: 'refused', code: 'spend_platform_cap_exceeded', screeningCheckRef: 'check:one' })
    expect(await admitManagedX402Signing(ctx as never, attempt, intent)).toBe(false)
  })

  it('records provider exceptions as unavailable rather than a no-sign CDP response', async () => {
    provider.screen.mockRejectedValue({ statusCode: 403, errorType: 'policy_violation' })
    const ctx = context()
    ctx.runMutation.mockResolvedValue({ kind: 'refused', code: 'screening_not_clear', screeningCheckRef: 'check:one' })
    expect(await admitManagedX402Signing(ctx as never, attempt, intent)).toBe(false)
    expect(ctx.runMutation.mock.calls[0]?.[1].screening).toMatchObject({ ...request,
      outcome: 'unavailable', reason: 'screening_provider_unavailable' })
  })

  it('keeps the default provider unavailable until the entitled TRM contract exists', async () => {
    const actual = await vi.importActual<typeof import('@/modules/money/x402-payee-screening.server')>('@/modules/money/x402-payee-screening.server')
    expect(await actual.screenX402Payee(request)).toMatchObject({ ...request,
      outcome: 'unavailable', reason: 'trm_tenant_contract_unavailable' })
  })
})

import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import { StrictLivePayoutReceiptSchema } from '../../../src/modules/money/public'
import {
  buildGatewayPayoutReceipt,
  sanitizeGatewayPayoutProviderTransfers,
} from '../../../tools/release/operation-gateway-production-smoke'

const payoutRef = 'ae-release-smoke:run-1:payout'
const amount = { currency: 'USD', units: '60', exponent: 2 }
const zero = { currency: 'USD', units: '0', exponent: 2 }
const transferId = 'tr_test_1'
const transferDigest = canonicalDigest({ format: 'stripe-transfer:v1', transferId })

function payout() {
  return StrictLivePayoutReceiptSchema.parse({
    payoutRef,
    payoutCommandId: 'payout-command-1',
    supplierBusinessId: 'business:provider',
    payoutAccountRef: 'account:provider:USD',
    stripeAccountDigest: canonicalDigest({ format: 'stripe-account:v1', destinationAccountId: 'acct_test_1' }),
    stripeTransferDigest: transferDigest,
    transferEvidenceDigest: canonicalDigest({ format: 'stripe-transfer-evidence:v1', transferId }),
    providerNetAmount: amount,
    providerHeldBefore: amount,
    providerHeldAfter: zero,
    providerPaidBefore: zero,
    providerPaidAfter: amount,
    replayAdditionalDebits: 0,
  })
}

describe('production payout provider replay proof', () => {
  it('passes a normal exact-key replay with one independent provider transfer', () => {
    const initial = payout()
    const providerBefore = sanitizeGatewayPayoutProviderTransfers(payoutRef, [])
    const providerAfterInitial = sanitizeGatewayPayoutProviderTransfers(payoutRef, [transferId])
    const providerAfterReplay = sanitizeGatewayPayoutProviderTransfers(payoutRef, [transferId])

    const receipt = buildGatewayPayoutReceipt({
      payout: initial,
      payoutReplay: initial,
      providerTransfersBeforePayout: providerBefore,
      providerTransfersAfterInitialPayout: providerAfterInitial,
      providerTransfersAfterReplay: providerAfterReplay,
    })

    expect(receipt.replayAdditionalDebits).toBe(0)
    expect(receipt.providerTransfers.beforePayout.count).toBe(0)
    expect(receipt.providerTransfers.afterInitialPayout.count).toBe(1)
    expect(receipt.providerTransfers.afterReplay.count).toBe(1)
    expect(receipt.providerTransfers.afterReplay.transferIdDigests).toEqual([transferDigest])
  })

  it('rejects a duplicate provider transfer even when the AE replay returns the original transfer', () => {
    const initial = payout()
    const providerBefore = sanitizeGatewayPayoutProviderTransfers(payoutRef, [])
    const providerAfterInitial = sanitizeGatewayPayoutProviderTransfers(payoutRef, [transferId])
    const providerAfterReplay = sanitizeGatewayPayoutProviderTransfers(payoutRef, [transferId, 'tr_test_2'])

    expect(() => buildGatewayPayoutReceipt({
      payout: initial,
      payoutReplay: initial,
      providerTransfersBeforePayout: providerBefore,
      providerTransfersAfterInitialPayout: providerAfterInitial,
      providerTransfersAfterReplay: providerAfterReplay,
    })).toThrow('gateway_smoke_payout_provider_transfer_identity_invalid')
  })
})

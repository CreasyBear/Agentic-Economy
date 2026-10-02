import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '../../../_generated/api'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { COMMERCIAL_POLICY_FAMILIES } from '../../../../src/modules/money/public'
import { PRODUCTION_COMMERCIAL_POLICY_CONTROLS } from '../../../../tests/helpers/commercial-policy-fixtures'
import { samIdentity } from '../../../../tests/helpers/interactive-authority-provisioning'
import { seededInteractiveAuthorityBackend } from '../../../../tests/helpers/interactive-authority-runtime'
import {
  INTERACTIVE_ACCOUNT_REF,
  INTERACTIVE_AUTHORITY_NOW,
  INTERACTIVE_PRINCIPAL_REF,
  INTERACTIVE_TOKEN_IDENTIFIER,
} from '../../../../tests/helpers/interactive-authority-seed'

describe('owner invoice history tax admission', () => {
  afterEach(() => { vi.unstubAllEnvs() })
  it('reports an ungenerated invoice when persisted owner tax facts and production policy admit issuance', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const backend = await seededInteractiveAuthorityBackend()
    const now = Date.now()
    const owner = backend.withIdentity(samIdentity(INTERACTIVE_TOKEN_IDENTIFIER))
    const commandRef = 'funding:tax-facts:admitted'

    await expect(owner.mutation(api.moneyCustomerTaxFacts.upsertCustomerTaxFacts, {
      abn: '51824753556',
      legalName: 'Acme Technologies Pty Ltd',
      addressLine1: '1 Market Street',
      locality: 'Sydney',
      region: 'NSW',
      postalCode: '2000',
      country: 'AU',
      expectedRevision: 0,
      correlationRef: 'invoice-history:tax-facts:admitted',
      idempotencyRef: 'invoice-history:tax-facts:admitted',
    })).resolves.toMatchObject({ kind: 'updated', revision: 1 })

    await backend.run(async (ctx) => {
      const facts = await ctx.db.query('moneyCustomerTaxFacts')
        .withIndex('by_accountRef', (index) => index.eq('accountRef', INTERACTIVE_ACCOUNT_REF))
        .unique()
      expect(facts).toMatchObject({ abn: '51824753556', revision: 1 })

      for (const [index, family] of COMMERCIAL_POLICY_FAMILIES.entries()) {
        await ctx.db.insert('moneyCommercialPolicies', {
          policyRef: `commercial-policy:${family}:tax-facts-admitted`,
          family,
          environment: 'production',
          revision: 1,
          lifecycle: 'active',
          effectiveAt: now - 1,
          expiresAt: now + 86_400_000,
          evidenceRef: `approval:${family}:tax-facts-admitted`,
          evidenceDigest: `sha256:${String(index).repeat(64)}`,
          control: family === 'tax'
            ? { ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.tax, taxInvoiceIssuance: 'enabled' as const }
            : PRODUCTION_COMMERCIAL_POLICY_CONTROLS[family],
          approvedByPrincipalRef: INTERACTIVE_PRINCIPAL_REF,
          activeAccountRef: INTERACTIVE_ACCOUNT_REF,
          authorityGeneration: 1,
          correlationRef: `correlation:${family}:tax-facts-admitted`,
          idempotencyRef: `idempotency:${family}:tax-facts-admitted`,
          commandDigest: `sha256:${String(index + 1).repeat(64)}`,
          activatedAt: now - 1,
          updatedAt: now - 1,
        })
      }

      await ctx.db.insert('moneyFundingCommands', {
        commandRef,
        accountRef: INTERACTIVE_ACCOUNT_REF,
        legalCustomerRef: `legal-customer:${INTERACTIVE_ACCOUNT_REF}`,
        actorPrincipalRef: INTERACTIVE_PRINCIPAL_REF,
        environment: 'production',
        currency: 'AUD',
        exponent: 6,
        principalUnits: '5000000',
        serviceFeeUnits: '250000',
        taxUnits: '530000',
        totalUnits: '5780000',
        commercialPolicyDigest: canonicalDigest({ kind: 'policy', commandRef }),
        commercialPolicyRefs: ['commercial-policy:production'],
        idempotencyKey: commandRef,
        inputDigest: canonicalDigest({ kind: 'input', commandRef }),
        successReturnRef: 'owner/credit',
        providerRecoveryDeadlineAt: INTERACTIVE_AUTHORITY_NOW + 60_000,
        initiationKind: 'owner_top_up',
        state: 'succeeded',
        appliedTransactionRef: 'formance:tx:tax-facts-admitted',
        externalRef: `cs_${commandRef}`,
        providerStatus: 'succeeded',
        appliedStripeEventId: `evt_${commandRef}`,
        appliedPayloadDigest: canonicalDigest({ kind: 'applied', commandRef }),
        createdAt: INTERACTIVE_AUTHORITY_NOW,
        updatedAt: INTERACTIVE_AUTHORITY_NOW,
      })
    })

    const history = await owner.query(api.moneyAccountFunding.listOwnerInvoiceHistory, {
      paginationOpts: { numItems: 20, cursor: null },
    })
    expect(history.page).toEqual([
      expect.objectContaining({
        commandRef,
        taxInvoice: { kind: 'withheld', reason: 'tax_invoice_not_generated' },
      }),
    ])
  })
})

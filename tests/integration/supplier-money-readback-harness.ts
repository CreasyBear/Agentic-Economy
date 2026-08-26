import { convexTest } from 'convex-test'
import { anyApi } from 'convex/server'

import schema from '../../convex/schema'
import { accountRefForProvider } from '@/modules/money/public'
import {
  convexModules as modules,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'

const moneyLedgerApi = anyApi.moneyLedger
if (moneyLedgerApi === undefined) throw new Error('moneyLedger API missing')

const payoutAccountByStripeId = moneyLedgerApi.readPayoutAccountByStripeId
if (payoutAccountByStripeId === undefined)
  throw new Error('moneyLedger.readPayoutAccountByStripeId missing')
export const readPayoutAccountByStripeId = payoutAccountByStripeId

const ownerProviderEarnings = moneyLedgerApi.readOwnerProviderEarnings
if (ownerProviderEarnings === undefined)
  throw new Error('moneyLedger.readOwnerProviderEarnings missing')
export const readOwnerProviderEarnings = ownerProviderEarnings

const ownerPayoutTransfer = moneyLedgerApi.readOwnerPayoutTransfer
if (ownerPayoutTransfer === undefined)
  throw new Error('moneyLedger.readOwnerPayoutTransfer missing')
export const readOwnerPayoutTransfer = ownerPayoutTransfer

const beginTransfer = moneyLedgerApi.beginPayoutTransfer
if (beginTransfer === undefined)
  throw new Error('moneyLedger.beginPayoutTransfer missing')
export const beginPayoutTransfer = beginTransfer

const reconcileTransfer = moneyLedgerApi.reconcilePayoutTransfer
if (reconcileTransfer === undefined)
  throw new Error('moneyLedger.reconcilePayoutTransfer missing')
export const reconcilePayoutTransfer = reconcileTransfer

export function createSupplierMoneyBackend(): ConvexFixtureBackend {
  return convexTest(schema, modules)
}

export function withBillingIdentity(
  backend: ConvexFixtureBackend,
  principalId: string,
) {
  return backend.withIdentity({
    subject: principalId,
    issuer: 'https://identity.example',
    tokenIdentifier: principalId,
  })
}

export async function createSupplierMoneyOwner(slug: string) {
  const backend = createSupplierMoneyBackend()
  const {
    businessId,
    owner,
    canonicalPrincipalRef,
    canonicalAccountRef,
  } =
    await publishedBusinessOwner(backend, slug)
  const businessRef = String(businessId)
  return {
    backend,
    businessId,
    owner,
    businessRef,
    principalId: canonicalPrincipalRef,
    accountRef: canonicalAccountRef,
    providerAccountRef: accountRefForProvider(businessRef, 'USD'),
  }
}

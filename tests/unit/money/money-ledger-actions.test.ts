/// <reference types="vite/client" />
import { anyApi } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { convexTestWithMarketComponents, publishedBusinessOwner } from '../../helpers/convex-fixtures'

const readCreditAccount = anyApi.moneyLedger?.readCreditAccount
const listCreditActivity = anyApi.moneyLedger?.listCreditActivity
const readKeyUsage = anyApi.moneyLedger?.readKeyUsage
if (readCreditAccount === undefined || listCreditActivity === undefined || readKeyUsage === undefined) {
  throw new Error('moneyLedger credit-read actions missing')
}

const FORMANCE_ENV_KEYS = [
  'AE_FORMANCE_ENVIRONMENT',
  'AE_FORMANCE_GATEWAY_URL',
  'AE_FORMANCE_LEDGER',
  'AE_FORMANCE_ACCESS_CLIENT_ID',
  'AE_FORMANCE_ACCESS_CLIENT_SECRET',
  'AE_FORMANCE_REQUEST_TIMEOUT_MS',
] as const
const saved: Partial<Record<(typeof FORMANCE_ENV_KEYS)[number], string>> = {}

describe('moneyLedger credit reads through the Formance boundary', () => {
  beforeEach(() => {
    // These three actions must refuse `source_unavailable` with Formance
    // unconfigured (the only state local dev/CI actually run in). Force that
    // regardless of what happens to be in the ambient environment.
    for (const key of FORMANCE_ENV_KEYS) {
      const value = process.env[key]
      if (value !== undefined) saved[key] = value
      delete process.env[key]
    }
  })
  afterEach(() => {
    for (const key of FORMANCE_ENV_KEYS) {
      const value = saved[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
      delete saved[key]
    }
  })

  it('refuses every credit read as unauthenticated for a caller with no owner session', async () => {
    const backend = convexTestWithMarketComponents()
    await expect(backend.action(readCreditAccount, { principalId: 'acc_x', currency: 'AUD' }))
      .resolves.toEqual({ kind: 'refused', code: 'unauthenticated' })
    await expect(backend.action(listCreditActivity, {
      principalId: 'acc_x',
      credentialId: 'credential:one',
      currency: 'AUD',
      paginationOpts: { numItems: 10, cursor: null },
    })).resolves.toEqual({ kind: 'refused', code: 'unauthenticated', items: [] })
    await expect(backend.action(readKeyUsage, {
      principalId: 'acc_x',
      credentialId: 'credential:one',
      currency: 'AUD',
    })).resolves.toEqual({ kind: 'refused', code: 'unauthenticated', items: [] })
  })

  it('refuses every credit read when the args claim an Account that is not the signed-in owner’s', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'credit-read-mismatch')
    await expect(fixture.owner.action(readCreditAccount, { principalId: 'acc_someone-else', currency: 'AUD' }))
      .resolves.toEqual({ kind: 'refused', code: 'billing_identity_mismatch' })
    await expect(fixture.owner.action(listCreditActivity, {
      principalId: 'acc_someone-else',
      credentialId: 'credential:one',
      currency: 'AUD',
      paginationOpts: { numItems: 10, cursor: null },
    })).resolves.toEqual({ kind: 'refused', code: 'billing_identity_mismatch', items: [] })
    await expect(fixture.owner.action(readKeyUsage, {
      principalId: 'acc_someone-else',
      credentialId: 'credential:one',
      currency: 'AUD',
    })).resolves.toEqual({ kind: 'refused', code: 'billing_identity_mismatch', items: [] })
  })

  it('refuses every credit read as source_unavailable when Formance is not configured', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'credit-read-unconfigured')
    await expect(fixture.owner.action(readCreditAccount, {
      principalId: fixture.canonicalAccountRef,
      currency: 'AUD',
    })).resolves.toEqual({ kind: 'refused', code: 'source_unavailable' })
    await expect(fixture.owner.action(listCreditActivity, {
      principalId: fixture.canonicalAccountRef,
      credentialId: 'credential:one',
      currency: 'AUD',
      paginationOpts: { numItems: 10, cursor: null },
    })).resolves.toEqual({ kind: 'refused', code: 'source_unavailable', items: [] })
    await expect(fixture.owner.action(readKeyUsage, {
      principalId: fixture.canonicalAccountRef,
      credentialId: 'credential:one',
      currency: 'AUD',
    })).resolves.toEqual({ kind: 'refused', code: 'source_unavailable', items: [] })
  })
})

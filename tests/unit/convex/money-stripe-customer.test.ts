import { makeFunctionReference, type UserIdentity } from 'convex/server'
import {
  describe,
  expect,
  it,
} from 'vitest'

import type { Doc } from '../../../convex/_generated/dataModel'
import { samIdentity } from '../../helpers/interactive-authority-provisioning'
import {
  createInteractiveAuthorityBackend as createBackend,
  type InteractiveAuthorityBackend,
} from '../../helpers/interactive-authority-runtime'
import {
  INTERACTIVE_ACCOUNT_REF as ACCOUNT_REF,
  INTERACTIVE_PRINCIPAL_REF as PRINCIPAL_REF,
  INTERACTIVE_TOKEN_IDENTIFIER as TOKEN_IDENTIFIER,
  seedInteractiveAuthority as seedAuthority,
} from '../../helpers/interactive-authority-seed'

type StripeCustomerBindingRow = Doc<'moneyStripeCustomerBindings'>

type UpsertStripeCustomerBindingArgs = Readonly<{
  stripeCustomerId: string
  correlationRef: string
  idempotencyRef: string
}>

type UpsertStripeCustomerBindingReceipt = Readonly<
  | { kind: 'updated'; revision: number }
  | { kind: 'replayed'; revision: number }
>

type ObserveStripePaymentMandateArgs = Readonly<{
  mandateState: 'ready' | 'missing'
  correlationRef: string
  idempotencyRef: string
  expectedRevision: number
}>

type ObserveStripePaymentMandateReceipt = Readonly<
  | { kind: 'updated'; revision: number; mandateState: 'ready' | 'missing' }
  | { kind: 'replayed'; revision: number; mandateState: 'ready' | 'missing' }
>

type RecordBillingPortalStartedArgs = Readonly<{
  correlationRef: string
  idempotencyRef: string
}>

type RecordBillingPortalStartedReceipt = Readonly<{ kind: 'recorded' }>

const upsertStripeCustomerBindingRef = makeFunctionReference<
  'mutation',
  UpsertStripeCustomerBindingArgs,
  UpsertStripeCustomerBindingReceipt
>('moneyStripeCustomer:upsertStripeCustomerBinding')

const observeStripePaymentMandateRef = makeFunctionReference<
  'mutation',
  ObserveStripePaymentMandateArgs,
  ObserveStripePaymentMandateReceipt
>('moneyStripeCustomer:observeStripePaymentMandate')

const recordBillingPortalStartedRef = makeFunctionReference<
  'mutation',
  RecordBillingPortalStartedArgs,
  RecordBillingPortalStartedReceipt
>('moneyStripeCustomer:recordBillingPortalStarted')

const identity = (overrides: Partial<UserIdentity> = {}) =>
  samIdentity(TOKEN_IDENTIFIER, overrides)

const correlationRef = (label: string) => `test:money-stripe-customer:${label}`

const idempotencyRef = (label: string) => `idem:money-stripe-customer:${label}`

const stripeCustomerId = 'cus_test_binding_one'

function upsertPayload(
  overrides: Partial<UpsertStripeCustomerBindingArgs> = {},
): UpsertStripeCustomerBindingArgs {
  return {
    stripeCustomerId,
    correlationRef: correlationRef('default'),
    idempotencyRef: idempotencyRef('default'),
    ...overrides,
  }
}

function observePayload(
  overrides: Partial<ObserveStripePaymentMandateArgs> = {},
): ObserveStripePaymentMandateArgs {
  return {
    mandateState: 'ready',
    correlationRef: correlationRef('observe-default'),
    idempotencyRef: idempotencyRef('observe-default'),
    expectedRevision: 1,
    ...overrides,
  }
}

async function upsertStripeCustomerBinding(
  backend: InteractiveAuthorityBackend,
  input: UpsertStripeCustomerBindingArgs,
  presentedIdentity: UserIdentity = identity(),
): Promise<UpsertStripeCustomerBindingReceipt> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.mutation(upsertStripeCustomerBindingRef, input)
}

async function observeStripePaymentMandate(
  backend: InteractiveAuthorityBackend,
  input: ObserveStripePaymentMandateArgs,
  presentedIdentity: UserIdentity = identity(),
): Promise<ObserveStripePaymentMandateReceipt> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.mutation(observeStripePaymentMandateRef, input)
}

async function recordBillingPortalStarted(
  backend: InteractiveAuthorityBackend,
  input: RecordBillingPortalStartedArgs,
  presentedIdentity: UserIdentity = identity(),
): Promise<RecordBillingPortalStartedReceipt> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.mutation(recordBillingPortalStartedRef, input)
}

async function expectStripeCustomerRefusal(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(run()).rejects.toMatchObject({
    name: 'InteractiveAuthorityError',
    code,
  })
}

async function readStripeCustomerBindings(
  backend: InteractiveAuthorityBackend,
): Promise<StripeCustomerBindingRow[]> {
  return await backend.run(async (ctx) =>
    await ctx.db.query('moneyStripeCustomerBindings').collect())
}

async function readAuditEvents(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => await ctx.db.query('auditEvents').collect())
}

describe('moneyStripeCustomer (W-22)', () => {
  it('C1: unauthenticated upsert refuses identity_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectStripeCustomerRefusal(
      () => backend.mutation(upsertStripeCustomerBindingRef, upsertPayload()),
      'identity_invalid',
    )
  })

  it('C2: active member upsert refuses authority_mismatch', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { access: 'membership' })

    await expectStripeCustomerRefusal(
      () => upsertStripeCustomerBinding(backend, upsertPayload({
        correlationRef: correlationRef('c2'),
        idempotencyRef: idempotencyRef('c2'),
      })),
      'authority_mismatch',
    )
  })

  it('C3: owner upserts first customer binding with missing mandate', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const receipt = await upsertStripeCustomerBinding(backend, upsertPayload({
      correlationRef: correlationRef('c3'),
      idempotencyRef: idempotencyRef('c3'),
    }))

    expect(receipt).toEqual({ kind: 'updated', revision: 1 })
    const rows = await readStripeCustomerBindings(backend)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      accountRef: ACCOUNT_REF,
      stripeCustomerId,
      mandateState: 'missing',
      revision: 1,
      legalCustomerRef: PRINCIPAL_REF,
    })
  })

  it('C4: owner upserts same customer replays without bumping revision', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const payload = upsertPayload({
      correlationRef: correlationRef('c4'),
      idempotencyRef: idempotencyRef('c4'),
    })
    await upsertStripeCustomerBinding(backend, payload)
    const replay = await upsertStripeCustomerBinding(backend, payload)

    expect(replay).toEqual({ kind: 'replayed', revision: 1 })
    const rows = await readStripeCustomerBindings(backend)
    expect(rows).toHaveLength(1)
  })

  it('C5: owner observes mandate state ready bumps revision', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await upsertStripeCustomerBinding(backend, upsertPayload({
      correlationRef: correlationRef('c5-upsert'),
      idempotencyRef: idempotencyRef('c5-upsert'),
    }))

    const receipt = await observeStripePaymentMandate(backend, observePayload({
      mandateState: 'ready',
      correlationRef: correlationRef('c5'),
      idempotencyRef: idempotencyRef('c5'),
      expectedRevision: 1,
    }))

    expect(receipt).toEqual({ kind: 'updated', revision: 2, mandateState: 'ready' })
    const rows = await readStripeCustomerBindings(backend)
    expect(rows[0]?.mandateState).toBe('ready')
    expect(rows[0]?.revision).toBe(2)
  })

  it('C6: owner observes mandate state missing updates binding', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await upsertStripeCustomerBinding(backend, upsertPayload({
      correlationRef: correlationRef('c6-upsert'),
      idempotencyRef: idempotencyRef('c6-upsert'),
    }))
    await observeStripePaymentMandate(backend, observePayload({
      mandateState: 'ready',
      correlationRef: correlationRef('c6-ready'),
      idempotencyRef: idempotencyRef('c6-ready'),
      expectedRevision: 1,
    }))

    const receipt = await observeStripePaymentMandate(backend, observePayload({
      mandateState: 'missing',
      correlationRef: correlationRef('c6'),
      idempotencyRef: idempotencyRef('c6'),
      expectedRevision: 2,
    }))

    expect(receipt).toEqual({ kind: 'updated', revision: 3, mandateState: 'missing' })
    const rows = await readStripeCustomerBindings(backend)
    expect(rows[0]?.mandateState).toBe('missing')
  })

  it('C7: owner records billing portal started audit event', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await recordBillingPortalStarted(backend, {
      correlationRef: correlationRef('c7'),
      idempotencyRef: idempotencyRef('c7'),
    })

    const events = await readAuditEvents(backend)
    expect(events).toEqual([
      expect.objectContaining({
        eventType: 'billing.portal_started',
        activeAccountRef: ACCOUNT_REF,
      }),
    ])
  })
})

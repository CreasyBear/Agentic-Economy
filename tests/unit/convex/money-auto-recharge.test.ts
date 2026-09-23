import { makeFunctionReference, type UserIdentity } from 'convex/server'
import {
  describe,
  expect,
  it,
} from 'vitest'

import { samIdentity } from '../../helpers/interactive-authority-provisioning'
import {
  createInteractiveAuthorityBackend as createBackend,
  type InteractiveAuthorityBackend,
} from '../../helpers/interactive-authority-runtime'
import {
  INTERACTIVE_TOKEN_IDENTIFIER as TOKEN_IDENTIFIER,
  seedInteractiveAuthority as seedAuthority,
} from '../../helpers/interactive-authority-seed'

type AutoRechargeSettingsRead = Readonly<{
  kind: 'missing' | 'configured'
  revision: number
  enabled: boolean
  thresholdUnits: string
  rechargeAmountUnits: string
  accountRef?: string
}>

type ConfigureAutoRechargeArgs = Readonly<{
  enabled: boolean
  thresholdUnits: string
  rechargeAmountUnits: string
  expectedRevision: number
  correlationRef: string
  idempotencyRef: string
}>

type ConfigureAutoRechargeReceipt = Readonly<
  | { kind: 'updated'; revision: number }
  | { kind: 'replayed'; revision: number }
>

const readAutoRechargeSettingsRef = makeFunctionReference<
  'query',
  Record<string, never>,
  AutoRechargeSettingsRead
>('moneyAutoRecharge:readAutoRechargeSettings')

const configureAutoRechargeRef = makeFunctionReference<
  'mutation',
  ConfigureAutoRechargeArgs,
  ConfigureAutoRechargeReceipt
>('moneyAutoRecharge:configureAutoRecharge')

const identity = (overrides: Partial<UserIdentity> = {}) =>
  samIdentity(TOKEN_IDENTIFIER, overrides)

const correlationRef = (label: string) => `test:money-auto-recharge:${label}`

const idempotencyRef = (label: string) => `idem:money-auto-recharge:${label}`

function configurePayload(
  overrides: Partial<ConfigureAutoRechargeArgs> = {},
): ConfigureAutoRechargeArgs {
  return {
    enabled: false,
    thresholdUnits: '20000000',
    rechargeAmountUnits: '50000000',
    expectedRevision: 0,
    correlationRef: correlationRef('default'),
    idempotencyRef: idempotencyRef('default'),
    ...overrides,
  }
}

async function readAutoRechargeSettings(
  backend: InteractiveAuthorityBackend,
  presentedIdentity: UserIdentity = identity(),
): Promise<AutoRechargeSettingsRead> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.query(readAutoRechargeSettingsRef, {})
}

async function configureAutoRecharge(
  backend: InteractiveAuthorityBackend,
  input: ConfigureAutoRechargeArgs,
  presentedIdentity: UserIdentity = identity(),
): Promise<ConfigureAutoRechargeReceipt> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.mutation(configureAutoRechargeRef, input)
}

async function expectAutoRechargeRefusal(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(run()).rejects.toMatchObject({
    name: 'InteractiveAuthorityError',
    code,
  })
}

describe('moneyAutoRecharge (W-21)', () => {
  it('C1: readAutoRechargeSettings returns missing defaults when no row exists', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expect(readAutoRechargeSettings(backend)).resolves.toEqual({
      kind: 'missing',
      revision: 0,
      enabled: false,
      thresholdUnits: '0',
      rechargeAmountUnits: '0',
    })
  })

  it('C2: owner configureAutoRecharge persists disabled settings at revision 1', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const receipt = await configureAutoRecharge(backend, configurePayload({
      correlationRef: correlationRef('c2'),
      idempotencyRef: idempotencyRef('c2'),
    }))

    expect(receipt).toEqual({ kind: 'updated', revision: 1 })
    await expect(readAutoRechargeSettings(backend)).resolves.toMatchObject({
      revision: 1,
      enabled: false,
      thresholdUnits: '20000000',
      rechargeAmountUnits: '50000000',
    })
  })

  it('C3: same correlationRef and payload replays without bumping revision', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const payload = configurePayload({
      correlationRef: correlationRef('c3'),
      idempotencyRef: idempotencyRef('c3'),
    })
    await configureAutoRecharge(backend, payload)
    const replay = await configureAutoRecharge(backend, payload)

    expect(replay).toEqual({ kind: 'replayed', revision: 1 })
  })

  it('C4: negative thresholdUnits refuses auto_recharge_units_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectAutoRechargeRefusal(
      () => configureAutoRecharge(backend, configurePayload({
        thresholdUnits: '-1',
        correlationRef: correlationRef('c4'),
        idempotencyRef: idempotencyRef('c4'),
      })),
      'auto_recharge_units_invalid',
    )
  })

  it('C5: recharge amount below minimum principal refuses funding_amount_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectAutoRechargeRefusal(
      () => configureAutoRecharge(backend, configurePayload({
        rechargeAmountUnits: '4999999',
        correlationRef: correlationRef('c5'),
        idempotencyRef: idempotencyRef('c5'),
      })),
      'funding_amount_invalid',
    )
  })

  it('C6: recharge amount off increment refuses funding_amount_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectAutoRechargeRefusal(
      () => configureAutoRecharge(backend, configurePayload({
        rechargeAmountUnits: '5000001',
        correlationRef: correlationRef('c6'),
        idempotencyRef: idempotencyRef('c6'),
      })),
      'funding_amount_invalid',
    )
  })

  it('C7: enabling without payment mandate refuses payment_mandate_missing', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectAutoRechargeRefusal(
      () => configureAutoRecharge(backend, configurePayload({
        enabled: true,
        correlationRef: correlationRef('c7'),
        idempotencyRef: idempotencyRef('c7'),
      })),
      'payment_mandate_missing',
    )
  })

  it('C8: stale expectedRevision refuses auto_recharge_revision_conflict', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await configureAutoRecharge(backend, configurePayload({
      correlationRef: correlationRef('c8-first'),
      idempotencyRef: idempotencyRef('c8-first'),
    }))

    await expectAutoRechargeRefusal(
      () => configureAutoRecharge(backend, configurePayload({
        expectedRevision: 0,
        correlationRef: correlationRef('c8-stale'),
        idempotencyRef: idempotencyRef('c8-stale'),
      })),
      'auto_recharge_revision_conflict',
    )
  })

  it('C9: same correlationRef with changed payload refuses auto_recharge_correlation_mismatch', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const sharedCorrelation = correlationRef('c9')
    await configureAutoRecharge(backend, configurePayload({
      correlationRef: sharedCorrelation,
      idempotencyRef: idempotencyRef('c9-first'),
    }))

    await expectAutoRechargeRefusal(
      () => configureAutoRecharge(backend, configurePayload({
        thresholdUnits: '25000000',
        expectedRevision: 1,
        correlationRef: sharedCorrelation,
        idempotencyRef: idempotencyRef('c9-second'),
      })),
      'auto_recharge_correlation_mismatch',
    )
  })

  it('C10: unauthenticated read refuses identity_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectAutoRechargeRefusal(
      () => backend.query(readAutoRechargeSettingsRef, {}),
      'identity_invalid',
    )
  })

  it('C11: unauthenticated configure refuses identity_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectAutoRechargeRefusal(
      () => backend.mutation(configureAutoRechargeRef, configurePayload()),
      'identity_invalid',
    )
  })

  it('C12: active member configure refuses authority_mismatch', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { access: 'membership' })

    await expectAutoRechargeRefusal(
      () => configureAutoRecharge(backend, configurePayload({
        correlationRef: correlationRef('c12'),
        idempotencyRef: idempotencyRef('c12'),
      })),
      'authority_mismatch',
    )
  })

  it('C13: active member read refuses authority_mismatch', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { access: 'membership' })

    await expectAutoRechargeRefusal(
      () => readAutoRechargeSettings(backend),
      'authority_mismatch',
    )
  })
})

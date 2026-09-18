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
  INTERACTIVE_ACCOUNT_REF as ACCOUNT_REF,
  INTERACTIVE_TOKEN_IDENTIFIER as TOKEN_IDENTIFIER,
  seedInteractiveAuthority as seedAuthority,
} from '../../helpers/interactive-authority-seed'

type MonthlySpendBudgetRead = Readonly<{
  kind: 'missing' | 'configured'
  revision: number
  enabled: boolean
  ceilingUnits: string
}>

type ConfigureMonthlySpendBudgetArgs = Readonly<{
  enabled: boolean
  ceilingUnits: string
  expectedRevision: number
  correlationRef: string
  idempotencyRef: string
}>

type ConfigureMonthlySpendBudgetReceipt = Readonly<
  | { kind: 'updated'; revision: number }
  | { kind: 'replayed'; revision: number }
>

const readMonthlySpendBudgetRef = makeFunctionReference<
  'query',
  Record<string, never>,
  MonthlySpendBudgetRead
>('moneyMonthlySpendBudget:readMonthlySpendBudget')

const configureMonthlySpendBudgetRef = makeFunctionReference<
  'mutation',
  ConfigureMonthlySpendBudgetArgs,
  ConfigureMonthlySpendBudgetReceipt
>('moneyMonthlySpendBudget:configureMonthlySpendBudget')

const identity = (overrides: Partial<UserIdentity> = {}) =>
  samIdentity(TOKEN_IDENTIFIER, overrides)

const correlationRef = (label: string) => `test:money-monthly-spend-budget:${label}`

const idempotencyRef = (label: string) => `idem:money-monthly-spend-budget:${label}`

function configurePayload(
  overrides: Partial<ConfigureMonthlySpendBudgetArgs> = {},
): ConfigureMonthlySpendBudgetArgs {
  return {
    enabled: false,
    ceilingUnits: '500000000',
    expectedRevision: 0,
    correlationRef: correlationRef('default'),
    idempotencyRef: idempotencyRef('default'),
    ...overrides,
  }
}

async function readMonthlySpendBudget(
  backend: InteractiveAuthorityBackend,
  presentedIdentity: UserIdentity = identity(),
): Promise<MonthlySpendBudgetRead> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.query(readMonthlySpendBudgetRef, {})
}

async function configureMonthlySpendBudget(
  backend: InteractiveAuthorityBackend,
  input: ConfigureMonthlySpendBudgetArgs,
  presentedIdentity: UserIdentity = identity(),
): Promise<ConfigureMonthlySpendBudgetReceipt> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.mutation(configureMonthlySpendBudgetRef, input)
}

async function expectMonthlySpendBudgetRefusal(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(run()).rejects.toMatchObject({
    name: 'InteractiveAuthorityError',
    code,
  })
}

async function readAuditEvents(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => await ctx.db.query('auditEvents').collect())
}

describe('moneyMonthlySpendBudget (W-23)', () => {
  it('C1: readMonthlySpendBudget returns missing defaults when no row exists', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expect(readMonthlySpendBudget(backend)).resolves.toEqual({
      kind: 'missing',
      enabled: false,
      ceilingUnits: '0',
      revision: 0,
    })
  })

  it('C2: owner configureMonthlySpendBudget persists disabled settings at revision 1', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const receipt = await configureMonthlySpendBudget(backend, configurePayload({
      correlationRef: correlationRef('c2'),
      idempotencyRef: idempotencyRef('c2'),
    }))

    expect(receipt).toEqual({ kind: 'updated', revision: 1 })
    await expect(readMonthlySpendBudget(backend)).resolves.toMatchObject({
      kind: 'configured',
      revision: 1,
      enabled: false,
      ceilingUnits: '500000000',
    })
  })

  it('C3: owner enables A$500 ceiling at revision 2', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await configureMonthlySpendBudget(backend, configurePayload({
      correlationRef: correlationRef('c3-disabled'),
      idempotencyRef: idempotencyRef('c3-disabled'),
    }))

    const receipt = await configureMonthlySpendBudget(backend, configurePayload({
      enabled: true,
      ceilingUnits: '500000000',
      expectedRevision: 1,
      correlationRef: correlationRef('c3-enabled'),
      idempotencyRef: idempotencyRef('c3-enabled'),
    }))

    expect(receipt).toEqual({ kind: 'updated', revision: 2 })
    await expect(readMonthlySpendBudget(backend)).resolves.toMatchObject({
      revision: 2,
      enabled: true,
      ceilingUnits: '500000000',
    })
  })

  it('C4: same correlationRef and payload replays without bumping revision', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const payload = configurePayload({
      correlationRef: correlationRef('c4'),
      idempotencyRef: idempotencyRef('c4'),
    })
    await configureMonthlySpendBudget(backend, payload)
    const replay = await configureMonthlySpendBudget(backend, payload)

    expect(replay).toEqual({ kind: 'replayed', revision: 1 })
  })

  it('C5: same correlationRef with changed payload refuses monthly_spend_budget_correlation_mismatch', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const sharedCorrelation = correlationRef('c5')
    await configureMonthlySpendBudget(backend, configurePayload({
      correlationRef: sharedCorrelation,
      idempotencyRef: idempotencyRef('c5-first'),
    }))

    await expectMonthlySpendBudgetRefusal(
      () => configureMonthlySpendBudget(backend, configurePayload({
        ceilingUnits: '250000000',
        expectedRevision: 1,
        correlationRef: sharedCorrelation,
        idempotencyRef: idempotencyRef('c5-second'),
      })),
      'monthly_spend_budget_correlation_mismatch',
    )
  })

  it('C6: stale expectedRevision refuses monthly_spend_budget_revision_conflict', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await configureMonthlySpendBudget(backend, configurePayload({
      correlationRef: correlationRef('c6-first'),
      idempotencyRef: idempotencyRef('c6-first'),
    }))

    await expectMonthlySpendBudgetRefusal(
      () => configureMonthlySpendBudget(backend, configurePayload({
        expectedRevision: 0,
        correlationRef: correlationRef('c6-stale'),
        idempotencyRef: idempotencyRef('c6-stale'),
      })),
      'monthly_spend_budget_revision_conflict',
    )
  })

  it('C7: invalid ceilingUnits refuses monthly_spend_budget_units_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    for (const ceilingUnits of ['-1', '12.5', '']) {
      await expectMonthlySpendBudgetRefusal(
        () => configureMonthlySpendBudget(backend, configurePayload({
          ceilingUnits,
          correlationRef: correlationRef(`c7-${ceilingUnits || 'empty'}`),
          idempotencyRef: idempotencyRef(`c7-${ceilingUnits || 'empty'}`),
        })),
        'monthly_spend_budget_units_invalid',
      )
    }
  })

  it('C8: active member configure refuses authority_mismatch', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { access: 'membership' })

    await expectMonthlySpendBudgetRefusal(
      () => configureMonthlySpendBudget(backend, configurePayload({
        correlationRef: correlationRef('c8'),
        idempotencyRef: idempotencyRef('c8'),
      })),
      'authority_mismatch',
    )
  })

  it('C9: unauthenticated configure refuses identity_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectMonthlySpendBudgetRefusal(
      () => backend.mutation(configureMonthlySpendBudgetRef, configurePayload()),
      'identity_invalid',
    )
  })

  it('C10: owner configure emits billing.monthly_spend_ceiling_configured audit event', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await configureMonthlySpendBudget(backend, configurePayload({
      enabled: true,
      correlationRef: correlationRef('c10'),
      idempotencyRef: idempotencyRef('c10'),
    }))

    const events = await readAuditEvents(backend)
    expect(events).toEqual([
      expect.objectContaining({
        eventType: 'billing.monthly_spend_ceiling_configured',
        activeAccountRef: ACCOUNT_REF,
      }),
    ])
  })
})

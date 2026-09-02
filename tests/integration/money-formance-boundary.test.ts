import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  createFormanceContext,
  executeFormanceMoneyCommand,
  installPackage4FormanceSchema,
  readFormanceAccount,
  readFormanceHealth,
  readFormanceTransactionByReference,
  type FormanceConfiguration,
} from '@/modules/money/formance'
import { PACKAGE4_FORMANCE_REQUIREMENTS } from '@/modules/money/public'

const integrationEnabled = process.env.AE_FORMANCE_INTEGRATION === 'true'

describe.runIf(integrationEnabled)('Package 4 real Formance boundary', () => {
  it('installs and verifies the strict schema, then writes and replays by exact reference', async () => {
    const runDigest = digest(`package4-pr2:${Date.now()}:${process.pid}`)
    const configuration: FormanceConfiguration = {
      environment: 'sandbox',
      gatewayUrl: process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:8080',
      ledger: `ae-package4-pr2-${runDigest.slice(0, 16)}`,
      requestTimeoutMs: 10_000,
    }
    const context = createFormanceContext(configuration)

    const installed = await installPackage4FormanceSchema(context)
    expect(installed).toMatchObject({
      kind: 'completed',
      ledger: configuration.ledger,
      schemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
      replayed: false,
    })
    expect(await installPackage4FormanceSchema(context)).toMatchObject({
      kind: 'completed',
      replayed: true,
    })
    expect(await readFormanceHealth(context)).toMatchObject({
      kind: 'ready',
      gatewayVersion: PACKAGE4_FORMANCE_REQUIREMENTS.gatewayVersion,
      ledgerVersion: PACKAGE4_FORMANCE_REQUIREMENTS.ledgerVersion,
      schemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
    })

    const accountDigest = digest('account')
    const processorDigest = digest('processor')
    const commandDigest = digest('funding-command')
    const idempotencyDigest = digest('funding-idempotency')
    const reference = `ae-p4:${commandDigest}`
    const command = {
      commandRef: reference,
      idempotencyKey: idempotencyDigest,
      schemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
      template: 'FUNDING_SETTLED' as const,
      variables: {
        processor: `processor:${processorDigest}:settlement`,
        account: `accounts:${accountDigest}:available`,
        amount: 'AUD/6 25000000000',
      },
      metadata: {
        command_digest: commandDigest,
        idempotency_digest: idempotencyDigest,
        account_digest: accountDigest,
      },
    }

    expect(await executeFormanceMoneyCommand(context, command)).toEqual({
      kind: 'completed',
      transactionRefs: [reference],
      replayed: false,
    })
    expect(await executeFormanceMoneyCommand(context, command)).toEqual({
      kind: 'completed',
      transactionRefs: [reference],
      replayed: true,
    })
    expect(await readFormanceTransactionByReference(context, reference)).toMatchObject({
      kind: 'found',
      reference,
      template: 'FUNDING_SETTLED',
      metadata: {
        command_digest: commandDigest,
        idempotency_digest: idempotencyDigest,
      },
    })
    expect(await readFormanceAccount(context, `accounts:${accountDigest}:available`)).toEqual({
      kind: 'completed',
      address: `accounts:${accountDigest}:available`,
      volumes: {
        'AUD/6': {
          inputUnits: '25000000000',
          outputUnits: '0',
          balanceUnits: '25000000000',
        },
      },
    })
  })

  it('refuses schema drift before a transaction can be submitted', async () => {
    const runDigest = digest(`package4-pr2-drift:${Date.now()}:${process.pid}`)
    const context = createFormanceContext({
      environment: 'sandbox',
      gatewayUrl: process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:8080',
      ledger: `ae-package4-drift-${runDigest.slice(0, 16)}`,
      requestTimeoutMs: 10_000,
    })
    await context.sdk.ledger.v2.createLedger({
      ledger: context.configuration.ledger,
      v2CreateLedgerRequest: { metadata: { purpose_digest: runDigest } },
    }, { retries: { strategy: 'none' } })
    await context.sdk.ledger.v2.insertSchema({
      idempotencyKey: digest('drift-schema'),
      ledger: context.configuration.ledger,
      version: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
      v2SchemaData: {
        chart: { world: { dotSelf: {} } },
        queries: {},
        transactions: {},
      },
    }, { retries: { strategy: 'none' } })

    expect(await installPackage4FormanceSchema(context)).toEqual({
      kind: 'setup_required',
      code: 'formance_schema_drift',
    })

    const commandDigest = digest('drift-command')
    const idempotencyDigest = digest('drift-idempotency')
    const reference = `ae-p4:${commandDigest}`
    expect(await executeFormanceMoneyCommand(context, {
      commandRef: reference,
      idempotencyKey: idempotencyDigest,
      schemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
      template: 'FUNDING_SETTLED',
      variables: {
        processor: `processor:${digest('processor')}:settlement`,
        account: `accounts:${digest('account')}:available`,
        amount: 'AUD/6 1',
      },
      metadata: { command_digest: commandDigest, idempotency_digest: idempotencyDigest },
    })).toEqual({ kind: 'refused', code: 'formance_schema_drift', retryable: false })
    expect(await readFormanceTransactionByReference(context, reference)).toEqual({
      kind: 'absent',
      reference,
    })
  })
})

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

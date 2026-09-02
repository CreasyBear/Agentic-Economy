import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  PACKAGE4_FORMANCE_SCHEMA,
  PACKAGE4_FORMANCE_SCHEMA_DIGEST,
  PACKAGE4_FORMANCE_TEMPLATE_NAMES,
  canonicalFormanceUnits,
  createFormanceContext,
  executeFormanceMoneyBulk,
  formanceMonetaryVariable,
  formanceSafeUnitsFromSdk,
  mapFormanceWriteError,
  readFormanceConfiguration,
  readFormanceHealth,
  readFormancePeriodSpend,
  validateFormanceMoneyCommand,
  validFormanceMetadata,
  type FormanceContext,
} from '@/modules/money/formance'
import {
  prepareFormanceFundingReversal,
  prepareFormanceFundingSettlement,
  prepareFormanceManagedCallRelease,
  prepareFormanceManagedCallReservation,
  prepareFormanceManagedCallSettlement,
} from '@/modules/money/formance-workflows'
import { PACKAGE4_FORMANCE_REQUIREMENTS } from '@/modules/money/public'

const DIGEST_A = 'a'.repeat(64)
const DIGEST_B = 'b'.repeat(64)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Package 4 official Formance boundary', () => {
  it('locks the immutable schema to the approved named machine templates', () => {
    expect(PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion).toBe('v1.2.0')
    expect(PACKAGE4_FORMANCE_SCHEMA_DIGEST).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(Object.keys(PACKAGE4_FORMANCE_SCHEMA.transactions ?? {})).toEqual(
      PACKAGE4_FORMANCE_TEMPLATE_NAMES,
    )
    expect(Object.values(PACKAGE4_FORMANCE_SCHEMA.transactions ?? {})
      .every((template) => template.runtime === 'machine')).toBe(true)
    expect(JSON.stringify(PACKAGE4_FORMANCE_SCHEMA)).not.toContain('experimental')
    expect(PACKAGE4_FORMANCE_SCHEMA.transactions?.FUNDING_SETTLED?.script)
      .toContain('monetary $total_amount')
    expect(PACKAGE4_FORMANCE_SCHEMA.transactions?.FUNDING_SETTLED?.script)
      .toContain('destination = $tax')
    expect(PACKAGE4_FORMANCE_SCHEMA.transactions?.TREASURY_CAPACITY_SYNCED?.script)
      .toContain('source = @world')
    expect(PACKAGE4_FORMANCE_SCHEMA.transactions?.TREASURY_CAPACITY_SYNCED?.script)
      .toContain('destination = $capacity')
  })

  it('maps one verified funding command to principal, fee, GST, and processor-total facts', () => {
    const input = {
      commandRef: 'account-funding:command-one',
      idempotencyKey: 'account-funding:idempotency-one',
      accountRef: 'account:one',
      processorRef: 'stripe:payment-intent:one',
      principalUnits: '100000000',
      serviceFeeUnits: '5000000',
      taxUnits: '500000',
      totalUnits: '105500000',
      policyDigest: `sha256:${DIGEST_A}`,
      externalEvidenceDigest: `sha256:${DIGEST_B}`,
    }
    const settlement = prepareFormanceFundingSettlement(input)
    expect(settlement).toMatchObject({
      kind: 'prepared',
      command: {
        schemaVersion: 'v1.2.0',
        template: 'FUNDING_SETTLED',
        variables: {
          principal_amount: 'AUD/6 100000000',
          service_fee_amount: 'AUD/6 5000000',
          tax_amount: 'AUD/6 500000',
          total_amount: 'AUD/6 105500000',
          revenue: 'platform:revenue:sales',
          tax: 'platform:tax:gst',
        },
        metadata: {
          external_evidence_digest: DIGEST_B,
          policy_digest: DIGEST_A,
        },
      },
    })
    if (settlement.kind !== 'prepared') throw new Error(settlement.code)
    expect(settlement.command.variables.account).not.toContain(input.accountRef)
    expect(settlement.command.variables.processor).not.toContain(input.processorRef)
    expect(settlement.command.metadata).not.toHaveProperty('principalUnits')

    expect(prepareFormanceFundingReversal(input)).toMatchObject({
      kind: 'prepared',
      command: { template: 'FUNDING_REVERSED' },
    })
  })

  it('refuses inconsistent, unsafe, or zero required funding amounts before the SDK', () => {
    const valid = {
      commandRef: 'account-funding:command-two',
      idempotencyKey: 'account-funding:idempotency-two',
      accountRef: 'account:two',
      processorRef: 'stripe:payment-intent:two',
      principalUnits: '100000000',
      serviceFeeUnits: '5000000',
      taxUnits: '500000',
      totalUnits: '105500000',
      policyDigest: `sha256:${DIGEST_A}`,
      externalEvidenceDigest: `sha256:${DIGEST_B}`,
    }
    expect(prepareFormanceFundingSettlement({ ...valid, totalUnits: '105500001' }))
      .toEqual({ kind: 'refused', code: 'formance_funding_input_invalid', retryable: false })
    expect(prepareFormanceFundingSettlement({ ...valid, principalUnits: '9007199254740992' }))
      .toEqual({ kind: 'refused', code: 'formance_funding_input_invalid', retryable: false })
    expect(prepareFormanceFundingSettlement({ ...valid, taxUnits: '0' }))
      .toEqual({ kind: 'refused', code: 'formance_funding_input_invalid', retryable: false })
  })

  it('maps managed reservation, release, and settlement to fixed atomic template sets', () => {
    const booking = managedCallBooking()
    const reserved = prepareFormanceManagedCallReservation(booking)
    expect(reserved).toMatchObject({
      kind: 'prepared',
      bulk: {
        commands: [
          { template: 'CALL_RESERVED_AUD' },
          { template: 'CALL_RESERVED_USDC' },
          { template: 'PROVIDER_OBLIGATION_ACCRUED' },
        ],
      },
    })
    if (reserved.kind !== 'prepared') throw new Error(reserved.code)
    expect(new Set(reserved.bulk.commands.map(({ commandRef }) => commandRef)).size).toBe(3)
    expect(JSON.stringify(reserved)).not.toContain(booking.accountRef)
    expect(JSON.stringify(reserved)).not.toContain(booking.providerRef)

    expect(prepareFormanceManagedCallRelease({
      booking,
      externalEvidenceDigest: `sha256:${'c'.repeat(64)}`,
      submissionProvenAbsent: true,
    })).toMatchObject({
      kind: 'prepared',
      bulk: { commands: [{ template: 'CALL_RELEASED_AUD' }, { template: 'CALL_RELEASED_USDC' }] },
    })
    expect(prepareFormanceManagedCallRelease({
      booking,
      externalEvidenceDigest: `sha256:${'c'.repeat(64)}`,
      submissionProvenAbsent: false,
    } as never)).toEqual({
      kind: 'refused',
      code: 'formance_managed_call_input_invalid',
      retryable: false,
    })
    expect(prepareFormanceManagedCallSettlement({
      booking,
      externalEvidenceDigest: `sha256:${'d'.repeat(64)}`,
    })).toMatchObject({
      kind: 'prepared',
      bulk: { commands: [{ template: 'BUYER_SALE_SETTLED' }, { template: 'PROVIDER_SETTLED' }] },
    })
  })

  it('binds changed managed-call terms to the same references but different command digests', () => {
    const booking = managedCallBooking()
    const original = prepareFormanceManagedCallReservation(booking)
    const changed = prepareFormanceManagedCallReservation({
      ...booking,
      buyerAmountUnits: '4',
      buyerRevenueUnits: '3',
    })
    if (original.kind !== 'prepared' || changed.kind !== 'prepared') throw new Error('fixture_invalid')
    expect(changed.bulk.commands.map(({ commandRef }) => commandRef))
      .toEqual(original.bulk.commands.map(({ commandRef }) => commandRef))
    expect(changed.bulk.commands.map(({ metadata }) => metadata.command_digest))
      .not.toEqual(original.bulk.commands.map(({ metadata }) => metadata.command_digest))
    expect(prepareFormanceManagedCallReservation({
      ...booking,
      providerAmountUnits: '9007199254740992',
    })).toEqual({ kind: 'refused', code: 'formance_managed_call_input_invalid', retryable: false })
  })

  it('recovers a lost bulk response only when every exact reference matches', async () => {
    const prepared = prepareFormanceManagedCallReservation(managedCallBooking())
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    let referenceReads = 0
    const ledger = {
      getSchema: vi.fn(async () => ({
        v2SchemaResponse: { data: { version: 'v1.2.0', ...PACKAGE4_FORMANCE_SCHEMA } },
      })),
      listTransactions: vi.fn(async ({ query }: { query: { $match: { reference: string } } }) => {
        referenceReads += 1
        const reference = query.$match.reference
        const command = prepared.bulk.commands.find((candidate) => candidate.commandRef === reference)!
        return {
          v2TransactionsCursorResponse: {
            cursor: {
              data: referenceReads <= prepared.bulk.commands.length
                ? []
                : [{
                    id: 1n,
                    reference,
                    template: command.template,
                    metadata: command.metadata,
                    postings: [],
                  }],
            },
          },
        }
      }),
      createBulk: vi.fn(async () => { throw new Error('response_lost') }),
    }
    const context = {
      configuration: {
        environment: 'sandbox',
        gatewayUrl: 'http://127.0.0.1:8080',
        ledger: 'test-ledger',
        requestTimeoutMs: 1_000,
      },
      sdk: { ledger: { v2: ledger } },
    } as unknown as FormanceContext

    expect(await executeFormanceMoneyBulk(context, prepared.bulk)).toEqual({
      kind: 'completed',
      transactionRefs: prepared.bulk.commands.map(({ commandRef }) => commandRef),
      replayed: true,
    })
    expect(ledger.createBulk).toHaveBeenCalledOnce()
  })

  it('reads exact Account period spend through official filtered cursors', async () => {
    const listTransactions = vi.fn()
      .mockResolvedValueOnce({
        v2TransactionsCursorResponse: {
          cursor: {
            data: [
              {
                id: 1n,
                timestamp: new Date('2026-09-01T01:00:00.000Z'),
                reverted: false,
                template: 'BUYER_SALE_SETTLED',
                metadata: { account_digest: DIGEST_A },
                postings: [
                  { source: `calls:${DIGEST_B}:buyer_reserved`, destination: 'platform:revenue:sales', asset: 'AUD/6', amount: 2n },
                  { source: `calls:${DIGEST_B}:buyer_reserved`, destination: 'platform:tax:gst', asset: 'AUD/6', amount: 1n },
                ],
              },
              {
                id: 2n,
                timestamp: new Date('2026-09-01T02:00:00.000Z'),
                reverted: false,
                template: 'CALL_RESERVED_AUD',
                metadata: { account_digest: DIGEST_A },
                postings: [{ source: 'accounts:a:available', destination: 'calls:b:buyer_reserved', asset: 'AUD/6', amount: 50n }],
              },
            ],
            hasMore: true,
            next: 'cursor:two',
            pageSize: 15,
          },
        },
      })
      .mockResolvedValueOnce({
        v2TransactionsCursorResponse: {
          cursor: {
            data: [{
              id: 3n,
              timestamp: new Date('2026-09-02T01:00:00.000Z'),
              reverted: false,
              template: 'BUYER_SALE_SETTLED',
              metadata: { account_digest: DIGEST_A },
              postings: [
                { source: `calls:${DIGEST_A}:buyer_reserved`, destination: 'platform:revenue:sales', asset: 'AUD/6', amount: 4n },
                { source: `calls:${DIGEST_A}:buyer_reserved`, destination: 'platform:tax:gst', asset: 'AUD/6', amount: 1n },
              ],
            }],
            hasMore: false,
            pageSize: 15,
          },
        },
      })
    const context = {
      configuration: {
        environment: 'sandbox',
        gatewayUrl: 'http://127.0.0.1:8080',
        ledger: 'test-ledger',
        requestTimeoutMs: 1_000,
      },
      sdk: { ledger: { v2: { listTransactions } } },
    } as unknown as FormanceContext
    const periodStartAt = Date.parse('2026-09-01T00:00:00.000Z')
    const periodEndAt = Date.parse('2026-10-01T00:00:00.000Z')

    await expect(readFormancePeriodSpend(context, {
      accountDigest: DIGEST_A,
      periodStartAt,
      periodEndAt,
      now: 123,
    })).resolves.toEqual({
      kind: 'available',
      currency: 'AUD',
      exponent: 6,
      spendUnits: '8',
      transactionCountUnits: '2',
      periodStartAt,
      periodEndAt,
      observedAt: 123,
      source: 'formance_transaction_cursor',
      authoritativeForConsequences: false,
    })
    expect(listTransactions.mock.calls[0]?.[0]).toMatchObject({
      ledger: 'test-ledger',
      pageSize: 15,
      sort: 'id:asc',
      query: {
        $and: [
          { $match: { 'metadata[account_digest]': DIGEST_A } },
          { $gte: { timestamp: '2026-09-01T00:00:00.000Z' } },
          { $lt: { timestamp: '2026-10-01T00:00:00.000Z' } },
        ],
      },
    })
    expect(listTransactions.mock.calls[1]?.[0]).toEqual({
      cursor: 'cursor:two',
      ledger: 'test-ledger',
    })
  })

  it('accepts loopback only for sandbox and requires Cloudflare Access for remote Gateway use', () => {
    expect(readFormanceConfiguration({
      AE_FORMANCE_ENVIRONMENT: 'sandbox',
      AE_FORMANCE_GATEWAY_URL: 'http://127.0.0.1:8080',
      AE_FORMANCE_LEDGER: 'agentic-economy-sandbox',
    })).toMatchObject({ kind: 'configured' })

    expect(readFormanceConfiguration({
      AE_FORMANCE_ENVIRONMENT: 'production',
      AE_FORMANCE_GATEWAY_URL: 'http://formance.example.com',
      AE_FORMANCE_LEDGER: 'agentic-economy-production',
    })).toEqual({ kind: 'setup_required', code: 'formance_gateway_invalid' })

    expect(readFormanceConfiguration({
      AE_FORMANCE_ENVIRONMENT: 'production',
      AE_FORMANCE_GATEWAY_URL: 'https://formance.example.com',
      AE_FORMANCE_LEDGER: 'agentic-economy-production',
    })).toEqual({ kind: 'setup_required', code: 'formance_access_configuration_invalid' })

    expect(readFormanceConfiguration({
      AE_FORMANCE_ENVIRONMENT: 'production',
      AE_FORMANCE_GATEWAY_URL: 'https://formance.example.com/path',
      AE_FORMANCE_LEDGER: 'agentic-economy-production',
      AE_FORMANCE_ACCESS_CLIENT_ID: 'id',
      AE_FORMANCE_ACCESS_CLIENT_SECRET: 'secret',
    })).toEqual({ kind: 'setup_required', code: 'formance_gateway_invalid' })
  })

  it('uses the official HTTP hook for Access headers and disables SDK retries', async () => {
    const requests: Request[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push(request)
      return new Response(JSON.stringify({
        env: 'sandbox',
        region: 'local',
        versions: [
          { health: true, name: 'gateway', version: PACKAGE4_FORMANCE_REQUIREMENTS.gatewayVersion },
          { health: true, name: 'ledger', version: PACKAGE4_FORMANCE_REQUIREMENTS.ledgerVersion },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    const configuration = readFormanceConfiguration({
      AE_FORMANCE_ENVIRONMENT: 'production',
      AE_FORMANCE_GATEWAY_URL: 'https://formance.example.com',
      AE_FORMANCE_LEDGER: 'agentic-economy-production',
      AE_FORMANCE_ACCESS_CLIENT_ID: 'access-client-id',
      AE_FORMANCE_ACCESS_CLIENT_SECRET: 'access-client-secret',
      AE_FORMANCE_REQUEST_TIMEOUT_MS: '5000',
    })
    if (configuration.kind !== 'configured') throw new Error(configuration.code)

    const context = createFormanceContext(configuration.configuration)
    const response = await context.sdk.getVersions({ retries: { strategy: 'none' } })

    expect(response.statusCode).toBe(200)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.headers.get('CF-Access-Client-Id')).toBe('access-client-id')
    expect(requests[0]?.headers.get('CF-Access-Client-Secret')).toBe('access-client-secret')
  })

  it('rotates Access tokens by rebuilding the client and fails closed after revocation', async () => {
    const observedIds: Array<string | null> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init)
      observedIds.push(request.headers.get('CF-Access-Client-Id'))
      return new Response(JSON.stringify({ code: 'access_denied' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    }))
    const metric = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const base = {
      environment: 'production' as const,
      gatewayUrl: 'https://formance.example.com',
      ledger: 'agentic-economy-production',
      requestTimeoutMs: 5_000,
      accessClientSecret: 'rotated-secret',
    }

    expect(await readFormanceHealth(createFormanceContext({
      ...base,
      accessClientId: 'old-token',
    }))).toEqual({ kind: 'unavailable', code: 'formance_health_unavailable' })
    expect(await readFormanceHealth(createFormanceContext({
      ...base,
      accessClientId: 'new-token',
    }))).toEqual({ kind: 'unavailable', code: 'formance_health_unavailable' })

    expect(observedIds).toEqual(['old-token', 'new-token'])
    expect(metric.mock.calls.flat().join(' ')).not.toContain('old-token')
    expect(metric.mock.calls.flat().join(' ')).not.toContain('new-token')
    expect(metric.mock.calls.flat().join(' ')).not.toContain('rotated-secret')
  })

  it.each([
    ['1', '1'],
    ['current funding maximum', '25000000000'],
    ['maximum safe integer', Number.MAX_SAFE_INTEGER.toString()],
  ])('round-trips the supported %s boundary exactly', (_label, units) => {
    expect(canonicalFormanceUnits(units)).toBe(units)
    expect(formanceSafeUnitsFromSdk(BigInt(units))).toBe(units)
    expect(formanceMonetaryVariable('AUD', units)).toBe(`AUD/6 ${units}`)
    expect(formanceMonetaryVariable('USDC', units)).toBe(`USDC/6 ${units}`)
  })

  it.each([
    '0',
    '-1',
    '01',
    '1.0',
    (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString(),
    '999999999999999999999999999999',
  ])('refuses unsafe or non-canonical positive units %s', (units) => {
    expect(canonicalFormanceUnits(units)).toBeUndefined()
    expect(formanceMonetaryVariable('AUD', units)).toBeUndefined()
  })

  it('admits only the closed command, template, schema, and digest metadata contract', () => {
    const command = {
      commandRef: `ae-p4:${DIGEST_A}`,
      idempotencyKey: DIGEST_B,
      schemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
      template: 'FUNDING_SETTLED' as const,
      variables: { amount: 'AUD/6 1000000', account: `accounts:${DIGEST_A}:available` },
      metadata: { command_digest: DIGEST_A, idempotency_digest: DIGEST_B },
    }
    expect(validateFormanceMoneyCommand(command)).toBeUndefined()
    expect(validFormanceMetadata(command.metadata)).toBe(true)
    expect(validateFormanceMoneyCommand({
      ...command,
      schemaVersion: 'v1.0.1',
    })).toBe('formance_schema_version_invalid')
    expect(validateFormanceMoneyCommand({
      ...command,
      metadata: { ...command.metadata, secret: DIGEST_A },
    })).toBe('formance_metadata_invalid')
    expect(validateFormanceMoneyCommand({
      ...command,
      variables: {
        ...command.variables,
        amount: `AUD/6 ${BigInt(Number.MAX_SAFE_INTEGER) + 1n}`,
      },
    })).toBe('formance_variables_invalid')
  })

  it('maps only typed pre-commit refusals and preserves uncertainty otherwise', () => {
    const reference = `ae-p4:${DIGEST_A}`
    expect(mapFormanceWriteError({ statusCode: 409 }, reference)).toEqual({
      kind: 'refused',
      code: 'formance_idempotency_conflict',
      retryable: false,
    })
    expect(mapFormanceWriteError({ statusCode: 403 }, reference)).toEqual({
      kind: 'unavailable',
      code: 'formance_access_unavailable',
      submissionProvenAbsent: true,
    })
    expect(mapFormanceWriteError(new Error('socket closed'), reference)).toEqual({
      kind: 'outcome_unknown',
      reference,
      statusRef: `formance-transaction:${reference}`,
    })
  })
})

function managedCallBooking() {
  return {
    invocationRef: 'invocation:one',
    commitmentRef: 'commitment:one',
    idempotencyKey: 'invoke:one',
    accountRef: 'account:one',
    principalRef: 'principal:one',
    agentBudgetGeneration: 1,
    legalCustomerRef: 'legal-customer:one',
    legalCustomerGeneration: 1,
    treasuryRef: 'custody:one',
    treasuryGeneration: 1,
    operationRef: 'operation:one',
    providerRef: 'provider:one',
    authorityGeneration: 1,
    policyGeneration: 1,
    buyerAmountUnits: '2',
    buyerRevenueUnits: '1',
    buyerTaxUnits: '1',
    providerAmountUnits: '1',
    commitmentDigest: `sha256:${'1'.repeat(64)}`,
    inputDigest: `sha256:${'2'.repeat(64)}`,
    policyDigest: `sha256:${'3'.repeat(64)}`,
    rateEvidenceDigest: `sha256:${'4'.repeat(64)}`,
    treasuryEvidenceDigest: `sha256:${'5'.repeat(64)}`,
    x402RequirementDigest: `sha256:${'6'.repeat(64)}`,
  }
}

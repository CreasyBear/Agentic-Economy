import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  PACKAGE4_FORMANCE_SCHEMA,
  PACKAGE4_FORMANCE_SCHEMA_DIGEST,
  PACKAGE4_FORMANCE_TEMPLATE_NAMES,
  canonicalFormanceUnits,
  createFormanceContext,
  formanceMonetaryVariable,
  formanceSafeUnitsFromSdk,
  mapFormanceWriteError,
  readFormanceConfiguration,
  readFormanceHealth,
  validateFormanceMoneyCommand,
  validFormanceMetadata,
} from '@/modules/money/formance'
import {
  prepareFormanceFundingReversal,
  prepareFormanceFundingSettlement,
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
    expect(PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion).toBe('v1.1.0')
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
        schemaVersion: 'v1.1.0',
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

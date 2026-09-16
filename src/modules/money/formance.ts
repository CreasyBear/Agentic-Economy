"use node"

import { HTTPClient, SDK } from '@formance/formance-sdk'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { accountHistoryCursorSchema, type AccountHistoryEntry, type AccountHistoryResult } from './internal/account-history'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { PACKAGE4_FORMANCE_REQUIREMENTS } from './internal/commercial-policy'
import {
  LEGACY_FORMANCE_SCHEMA_VERSION,
  FORMANCE_SCHEMA_VERSION,
  PACKAGE4_FORMANCE_TEMPLATE_NAMES,
  FORMANCE_TEMPLATE_NAMES,
  LEGACY_FORMANCE_TEMPLATE_NAMES,
  type FormanceMoneyTemplate,
  type FormanceLegacyMoneyTemplate,
  type FormanceSchemaData,
  type FormanceChartSegment,
  PACKAGE4_FORMANCE_SCHEMA,
  FORMANCE_SCHEMA,
  LEGACY_FORMANCE_SCHEMA_DIGEST,
  PACKAGE4_FORMANCE_SCHEMA_DIGEST,
  FORMANCE_SCHEMA_DIGEST,
  LEGACY_FORMANCE_SCHEMA_READBACK_DIGEST,
  FORMANCE_SCHEMA_READBACK_DIGEST,
  schemaReadbackDigest,
} from './formance-schema'
import {
  completed,
  completedMany,
  refused,
  unavailable,
  unknown,
  type FormanceMoneyResult,
} from './formance-result'

export type { FormanceMoneyResult }

export {
  LEGACY_FORMANCE_SCHEMA_VERSION,
  FORMANCE_SCHEMA_VERSION,
  PACKAGE4_FORMANCE_TEMPLATE_NAMES,
  FORMANCE_TEMPLATE_NAMES,
  LEGACY_FORMANCE_TEMPLATE_NAMES,
  type FormanceMoneyTemplate,
  type FormanceLegacyMoneyTemplate,
  type FormanceSchemaData,
  type FormanceChartSegment,
  PACKAGE4_FORMANCE_SCHEMA,
  FORMANCE_SCHEMA,
  LEGACY_FORMANCE_SCHEMA_DIGEST,
  PACKAGE4_FORMANCE_SCHEMA_DIGEST,
  FORMANCE_SCHEMA_DIGEST,
}

const DIGEST_PATTERN = /^[a-f0-9]{64}$/u
const COMMAND_REFERENCE_PATTERN = /^ae-p4:[a-f0-9]{64}(?::[a-z0-9_-]{1,32})?$/u
const ACCOUNT_ADDRESS_PATTERN = /^[a-z][a-z0-9_-]*(?::[a-z0-9_-]+)*$/u
const LEDGER_NAME_PATTERN = /^[a-z][a-z0-9-]{2,62}$/u
const VARIABLE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u
const MAX_VARIABLES = 24
const MAX_VARIABLE_VALUE_LENGTH = 500
const DEFAULT_TIMEOUT_MS = 10_000
const MINIMUM_TIMEOUT_MS = 100
const MAXIMUM_TIMEOUT_MS = 30_000
const AUD_ASSET = 'AUD/6'
const USDC_ASSET = 'USDC/6'

const ALLOWED_METADATA_KEYS = new Set([
  'account_digest',
  'call_digest',
  'command_digest',
  'commitment_digest',
  'external_evidence_digest',
  'idempotency_digest',
  'invocation_digest',
  'legal_customer_digest',
  'operation_digest',
  'policy_digest',
  'principal_digest',
  'provider_digest',
])

export type FormanceMoneyCommand = Readonly<{
  commandRef: string
  idempotencyKey: string
  schemaVersion: string
  template: FormanceMoneyTemplate
  variables: Readonly<Record<string, string>>
  metadata: Readonly<Record<string, string>>
}>

export type FormanceMoneyBulkCommand = Readonly<{
  commands: readonly FormanceMoneyCommand[]
}>

export type FormanceEnvironment = 'sandbox' | 'production'

export type FormanceConfiguration = Readonly<{
  environment: FormanceEnvironment
  gatewayUrl: string
  ledger: string
  requestTimeoutMs: number
  accessClientId?: string
  accessClientSecret?: string
}>

export type FormanceConfigurationResult =
  | Readonly<{ kind: 'configured'; configuration: FormanceConfiguration }>
  | Readonly<{ kind: 'setup_required'; code: string }>

export type FormanceContext = Readonly<{
  sdk: SDK
  configuration: FormanceConfiguration
}>

export type FormanceHealthResult =
  | Readonly<{
      kind: 'ready'
      gatewayVersion: string
      ledgerVersion: string
      schemaVersion: string
      schemaDigest: string
    }>
  | Readonly<{ kind: 'setup_required'; code: string }>
  | Readonly<{ kind: 'unavailable'; code: string }>

export type FormanceSchemaInstallResult =
  | Readonly<{
      kind: 'completed'
      ledger: string
      schemaVersion: string
      schemaDigest: string
      replayed: boolean
    }>
  | Readonly<{ kind: 'setup_required'; code: string }>
  | Readonly<{ kind: 'unavailable'; code: string }>

export type FormanceAccountReadResult =
  | Readonly<{
      kind: 'completed'
      address: string
      volumes: Readonly<Record<string, Readonly<{
        inputUnits: string
        outputUnits: string
        balanceUnits: string
      }>>>
    }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'setup_required'; code: string }>
  | Readonly<{ kind: 'unavailable'; code: string }>

/**
 * Capacity readback keeps signed native balances. It is deliberately separate
 * from FormanceAccountReadResult: buyer funds and ordinary capacity reads must
 * continue rejecting a negative ledger balance as malformed money data.
 */
export type FormanceSignedAccountReadResult =
  | Readonly<{
      kind: 'completed'
      address: string
      volumes: Readonly<Record<string, Readonly<{
        inputUnits: string
        outputUnits: string
        balanceUnits: string
      }>>>
    }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'setup_required'; code: string }>
  | Readonly<{ kind: 'unavailable'; code: string }>

export type FormanceReferenceReadResult =
  | Readonly<{
      kind: 'found'
      reference: string
      transactionId: string
      template?: string
      metadata: Record<string, string>
      postings: Array<{
        source: string
        destination: string
        asset: string
        amountUnits: string
      }>
    }>
  | Readonly<{ kind: 'absent'; reference: string }>
  | Readonly<{ kind: 'setup_required'; code: string }>
  | Readonly<{ kind: 'unavailable'; code: string }>

export type FormancePeriodSpendResult =
  | Readonly<{
      kind: 'available'
      currency: 'AUD'
      exponent: 6
      spendUnits: string
      transactionCountUnits: string
      periodStartAt: number
      periodEndAt: number
      observedAt: number
      source: 'formance_transaction_cursor'
      authoritativeForConsequences: false
    }>
  | Readonly<{ kind: 'empty' }>
  | Readonly<{ kind: 'setup_required'; code: string }>
  | Readonly<{ kind: 'unavailable'; code: string }>

export type FormanceStatementPageResult =
  | Readonly<{
      kind: 'available'
      transactionRefs: readonly string[]
      exactAmountUnits: string
      continueCursor: string
      isDone: boolean
    }>
  | Readonly<{ kind: 'setup_required'; code: string }>
  | Readonly<{ kind: 'unavailable'; code: string }>

const NO_RETRY = Object.freeze({ retries: Object.freeze({ strategy: 'none' as const }) })

export function readFormanceConfiguration(
  env: Readonly<Record<string, string | undefined>> = process.env,
): FormanceConfigurationResult {
  const environment = env.AE_FORMANCE_ENVIRONMENT?.trim()
  const gateway = env.AE_FORMANCE_GATEWAY_URL?.trim()
  const ledger = env.AE_FORMANCE_LEDGER?.trim()
  if ((environment !== 'sandbox' && environment !== 'production')
    || gateway === undefined
    || ledger === undefined
    || !LEDGER_NAME_PATTERN.test(ledger)) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_configuration_invalid' })
  }

  let parsed: URL
  try {
    parsed = new URL(gateway)
  } catch (cause) {
    return degradeBackend(cause, Object.freeze({ kind: 'setup_required', code: 'formance_gateway_invalid' }), { site: 'readFormanceConfiguration', reason: 'invalid_response' })
  }
  const loopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
  if (parsed.username !== ''
    || parsed.password !== ''
    || parsed.search !== ''
    || parsed.hash !== ''
    || parsed.pathname !== '/'
    || (parsed.protocol !== 'https:' && !(environment === 'sandbox' && loopback && parsed.protocol === 'http:'))) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_gateway_invalid' })
  }

  const accessClientId = nonempty(env.AE_FORMANCE_ACCESS_CLIENT_ID)
  const accessClientSecret = nonempty(env.AE_FORMANCE_ACCESS_CLIENT_SECRET)
  if ((accessClientId === undefined) !== (accessClientSecret === undefined)
    || (!loopback && accessClientId === undefined)) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_access_configuration_invalid' })
  }
  const requestTimeoutMs = timeout(env.AE_FORMANCE_REQUEST_TIMEOUT_MS)
  if (requestTimeoutMs === undefined) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_timeout_invalid' })
  }

  const access = accessClientId === undefined || accessClientSecret === undefined
    ? {}
    : { accessClientId, accessClientSecret }
  return Object.freeze({
    kind: 'configured',
    configuration: Object.freeze({
      environment,
      gatewayUrl: parsed.origin,
      ledger,
      requestTimeoutMs,
      ...access,
    }),
  })
}

export function createFormanceContext(configuration: FormanceConfiguration): FormanceContext {
  const httpClient = new HTTPClient()
  const gatewayOrigin = new URL(configuration.gatewayUrl).origin
  httpClient.addHook('beforeRequest', (request) => {
    if (new URL(request.url).origin !== gatewayOrigin) {
      throw new Error('formance_request_origin_refused')
    }
    if (configuration.accessClientId !== undefined
      && configuration.accessClientSecret !== undefined) {
      request.headers.set('CF-Access-Client-Id', configuration.accessClientId)
      request.headers.set('CF-Access-Client-Secret', configuration.accessClientSecret)
    }
  })
  return Object.freeze({
    configuration,
    sdk: new SDK({
      serverURL: configuration.gatewayUrl,
      httpClient,
      retryConfig: { strategy: 'none' },
      timeoutMs: configuration.requestTimeoutMs,
    }),
  })
}

export function validateFormanceMoneyCommand(command: FormanceMoneyCommand): string | undefined {
  if (!COMMAND_REFERENCE_PATTERN.test(command.commandRef)) return 'formance_command_reference_invalid'
  if (!DIGEST_PATTERN.test(command.idempotencyKey)) return 'formance_idempotency_key_invalid'
  if (command.schemaVersion !== FORMANCE_SCHEMA_VERSION
    && command.schemaVersion !== LEGACY_FORMANCE_SCHEMA_VERSION) {
    return 'formance_schema_version_invalid'
  }
  const allowedTemplates = command.schemaVersion === LEGACY_FORMANCE_SCHEMA_VERSION
    ? LEGACY_FORMANCE_TEMPLATE_NAMES
    : FORMANCE_TEMPLATE_NAMES
  if (!allowedTemplates.some((template) => template === command.template)) {
    return 'formance_template_invalid'
  }
  const variables = Object.entries(command.variables)
  if (variables.length === 0 || variables.length > MAX_VARIABLES) return 'formance_variables_invalid'
  for (const [key, value] of variables) {
    if (!VARIABLE_NAME_PATTERN.test(key)
      || value.length === 0
      || value.length > MAX_VARIABLE_VALUE_LENGTH
      || value !== value.trim()
      || !validFormanceVariableValue(
        value,
        command.template === 'BUYER_SALE_SETTLED'
          && key === 'tax_amount',
      )) return 'formance_variables_invalid'
  }
  if (!validFormanceMetadata(command.metadata)
    || command.metadata.idempotency_digest !== command.idempotencyKey) {
    return 'formance_metadata_invalid'
  }
  return undefined
}

export function validFormanceMetadata(metadata: Readonly<Record<string, string>>): boolean {
  const entries = Object.entries(metadata)
  return entries.length > 0
    && entries.length <= ALLOWED_METADATA_KEYS.size
    && entries.every(([key, value]) => ALLOWED_METADATA_KEYS.has(key) && DIGEST_PATTERN.test(value))
    && typeof metadata.command_digest === 'string'
    && typeof metadata.idempotency_digest === 'string'
}

export function canonicalFormanceUnits(value: string, positive = true): string | undefined {
  if (!/^(?:0|[1-9]\d{0,15})$/u.test(value)) return undefined
  const units = BigInt(value)
  if (positive && units === 0n) return undefined
  const number = Number(value)
  return Number.isSafeInteger(number) && BigInt(number) === units ? value : undefined
}

export function formanceMonetaryVariable(
  asset: 'AUD' | 'USDC',
  units: string,
  allowZeroTax = false,
): string | undefined {
  const exact = canonicalFormanceUnits(units, !(allowZeroTax && asset === 'AUD'))
  if (exact === undefined) return undefined
  return `${asset === 'AUD' ? AUD_ASSET : USDC_ASSET} ${exact}`
}

export function formanceSafeUnitsFromSdk(value: bigint | number | string): string | undefined {
  if (typeof value === 'string' && !/^(?:0|[1-9]\d*)$/u.test(value)) return undefined
  let units: bigint
  try {
    units = typeof value === 'bigint' ? value : BigInt(value)
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'formanceSafeUnitsFromSdk', reason: 'invalid_response' })
  }
  if (units < 0n) return undefined
  const number = Number(units)
  return Number.isSafeInteger(number) && BigInt(number) === units ? units.toString() : undefined
}

/** Parse native capacity balances, whose control adjustment may intentionally be negative. */
export function formanceSignedSafeUnitsFromSdk(value: bigint | number | string): string | undefined {
  if (typeof value === 'string' && !/^-?(?:0|[1-9]\d*)$/u.test(value)) return undefined
  let units: bigint
  try {
    units = typeof value === 'bigint' ? value : BigInt(value)
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'formanceSignedSafeUnitsFromSdk', reason: 'invalid_response' })
  }
  const absolute = units < 0n ? -units : units
  const number = Number(absolute)
  return Number.isSafeInteger(number) && BigInt(number) === absolute ? units.toString() : undefined
}

function validFormanceVariableValue(value: string, allowZeroTax = false): boolean {
  const monetary = /^(AUD|USDC)\/6 (.+)$/u.exec(value)
  return monetary === null
    ? validFormanceAccountAddress(value)
    : canonicalFormanceUnits(monetary[2] ?? '', !(allowZeroTax && monetary[1] === 'AUD')) !== undefined
}

export function validFormanceAccountAddress(address: string): boolean {
  return address.length <= 500 && ACCOUNT_ADDRESS_PATTERN.test(address)
}

export async function installPackage4FormanceSchema(
  context: FormanceContext,
): Promise<FormanceSchemaInstallResult> {
  const startedAt = Date.now()
  try {
    const current = await readSchema(context, FORMANCE_SCHEMA_VERSION)
    const legacy = await readSchema(context, LEGACY_FORMANCE_SCHEMA_VERSION)
    if (current.kind === 'setup_required') return current
    if (legacy.kind === 'setup_required') return legacy
    if (current.kind !== 'ready' && current.code !== 'formance_schema_absent') return current
    if (legacy.kind !== 'ready' && legacy.code !== 'formance_schema_absent') return legacy
    if (current.kind === 'ready' && legacy.kind === 'ready') {
      recordMetric('install_schema', 'replayed', startedAt)
      return Object.freeze({
        kind: 'completed',
        ledger: context.configuration.ledger,
        schemaVersion: current.schemaVersion,
        schemaDigest: current.schemaDigest,
        replayed: true,
      })
    }

    await ensureLedger(context)
    if (legacy.kind !== 'ready') {
      const installedLegacy = await insertSchemaVersion(context, LEGACY_FORMANCE_SCHEMA_VERSION)
      if (installedLegacy.kind !== 'ready') return installedLegacy
    }
    if (current.kind !== 'ready') {
      const installedCurrent = await insertSchemaVersion(context, FORMANCE_SCHEMA_VERSION)
      if (installedCurrent.kind !== 'ready') return installedCurrent
    }
    const installed = await readSchema(context, FORMANCE_SCHEMA_VERSION)
    if (installed.kind !== 'ready') return installed
    recordMetric('install_schema', 'completed', startedAt)
    return Object.freeze({
      kind: 'completed',
      ledger: context.configuration.ledger,
      schemaVersion: installed.schemaVersion,
      schemaDigest: installed.schemaDigest,
      replayed: false,
    })
  } catch (cause) {
    recordMetric('install_schema', 'unavailable', startedAt)
    return degradeBackend(cause, Object.freeze({ kind: 'unavailable', code: 'formance_install_unavailable' }), { site: 'installPackage4FormanceSchema', reason: 'source_unavailable' })
  }
}

export async function readFormanceHealth(context: FormanceContext): Promise<FormanceHealthResult> {
  const startedAt = Date.now()
  try {
    const response = await context.sdk.getVersions(NO_RETRY)
    const versions = response.getVersionsResponse?.versions
    if (versions === undefined) return unavailableHealth('formance_health_response_invalid', startedAt)
    const ledger = versions.find(({ name }) => name.toLowerCase() === 'ledger')
    if (ledger?.health !== true) {
      return unavailableHealth('formance_health_unavailable', startedAt)
    }
    if (ledger.version !== PACKAGE4_FORMANCE_REQUIREMENTS.ledgerVersion) {
      recordMetric('health', 'schema_drift', startedAt)
      return Object.freeze({ kind: 'setup_required', code: 'formance_component_version_drift' })
    }
    const schema = await readSchema(context)
    if (schema.kind !== 'ready') return schema
    recordMetric('health', 'ready', startedAt)
    return Object.freeze({
      kind: 'ready',
      gatewayVersion: PACKAGE4_FORMANCE_REQUIREMENTS.gatewayVersion,
      ledgerVersion: ledger.version,
      schemaVersion: schema.schemaVersion,
      schemaDigest: schema.schemaDigest,
    })
  } catch (error) {
    return unavailableHealth(formanceReadFailureCode(error, 'health'), startedAt)
  }
}

export async function readFormanceAccount(
  context: FormanceContext,
  address: string,
): Promise<FormanceAccountReadResult> {
  const startedAt = Date.now()
  if (!validFormanceAccountAddress(address)) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_account_address_invalid' })
  }
  try {
    const response = await context.sdk.ledger.v2.getAccount({
      address,
      expand: 'volumes',
      ledger: context.configuration.ledger,
    }, NO_RETRY)
    const account = response.v2AccountResponse?.data
    if (account === undefined) return Object.freeze({ kind: 'not_found' })
    const volumes: Record<string, { inputUnits: string; outputUnits: string; balanceUnits: string }> = {}
    for (const [asset, volume] of Object.entries(account.volumes ?? {})) {
      const inputUnits = formanceSafeUnitsFromSdk(volume.input)
      const outputUnits = formanceSafeUnitsFromSdk(volume.output)
      const balanceUnits = formanceSafeUnitsFromSdk(volume.balance ?? 0n)
      if (inputUnits === undefined || outputUnits === undefined || balanceUnits === undefined) {
        recordMetric('read_account', 'unsafe_integer', startedAt)
        return Object.freeze({ kind: 'setup_required', code: 'formance_unsafe_integer' })
      }
      volumes[asset] = Object.freeze({ inputUnits, outputUnits, balanceUnits })
    }
    recordMetric('read_account', 'completed', startedAt)
    return Object.freeze({ kind: 'completed', address: account.address, volumes: Object.freeze(volumes) })
  } catch (error) {
    if (statusCode(error) === 404) return Object.freeze({ kind: 'not_found' })
    recordMetric('read_account', 'unavailable', startedAt)
    return Object.freeze({ kind: 'unavailable', code: 'formance_read_unavailable' })
  }
}

/**
 * Read a native capacity account while preserving a signed available balance.
 * This boundary is only for spending-period control accounts; customer money
 * continues through readFormanceAccount, which rejects negative balances.
 *
 * CONTRACT: readFormanceSignedAccount(context, address)
 *   Requires: address is a valid Formance account address and the source is a
 *     capacity account whose native balance may be negative after an authorized
 *     limit decrease.
 *   Ensures: returns exact safe input/output/balance units, preserving the sign
 *     of balanceUnits; an absent account is reported as not_found.
 *   Invariant: no ledger state changes and ordinary buyer-money validation is
 *     untouched.
 *   On violation: returns setup_required for malformed address or unsafe native
 *     integers, unavailable for source failures, and never coerces bad data.
 */
export async function readFormanceSignedAccount(
  context: FormanceContext,
  address: string,
): Promise<FormanceSignedAccountReadResult> {
  const startedAt = Date.now()
  if (!validFormanceAccountAddress(address)) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_account_address_invalid' })
  }
  try {
    const response = await context.sdk.ledger.v2.getAccount({
      address,
      expand: 'volumes',
      ledger: context.configuration.ledger,
    }, NO_RETRY)
    const account = response.v2AccountResponse?.data
    if (account === undefined) return Object.freeze({ kind: 'not_found' })
    const volumes: Record<string, { inputUnits: string; outputUnits: string; balanceUnits: string }> = {}
    for (const [asset, volume] of Object.entries(account.volumes ?? {})) {
      const inputUnits = formanceSafeUnitsFromSdk(volume.input)
      const outputUnits = formanceSafeUnitsFromSdk(volume.output)
      const balanceUnits = formanceSignedSafeUnitsFromSdk(volume.balance ?? 0n)
      if (inputUnits === undefined || outputUnits === undefined || balanceUnits === undefined) {
        recordMetric('read_signed_account', 'unsafe_integer', startedAt)
        return Object.freeze({ kind: 'setup_required', code: 'formance_unsafe_integer' })
      }
      volumes[asset] = Object.freeze({ inputUnits, outputUnits, balanceUnits })
    }
    recordMetric('read_signed_account', 'completed', startedAt)
    return Object.freeze({ kind: 'completed', address: account.address, volumes: Object.freeze(volumes) })
  } catch (error) {
    if (statusCode(error) === 404) return Object.freeze({ kind: 'not_found' })
    recordMetric('read_signed_account', 'unavailable', startedAt)
    return Object.freeze({ kind: 'unavailable', code: 'formance_read_unavailable' })
  }
}

export async function readFormanceTransactionByReference(
  context: FormanceContext,
  reference: string,
): Promise<FormanceReferenceReadResult> {
  const startedAt = Date.now()
  if (!COMMAND_REFERENCE_PATTERN.test(reference)) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_reference_invalid' })
  }
  try {
    const response = await context.sdk.ledger.v2.listTransactions({
      ledger: context.configuration.ledger,
      pageSize: 2,
      query: { $match: { reference } },
    }, NO_RETRY)
    const rows = response.v2TransactionsCursorResponse?.cursor.data
    if (rows === undefined) {
      return Object.freeze({ kind: 'unavailable', code: 'formance_read_response_invalid' })
    }
    if (rows.length === 0) return Object.freeze({ kind: 'absent', reference })
    if (rows.length !== 1 || rows[0]?.reference !== reference) {
      return Object.freeze({ kind: 'setup_required', code: 'formance_reference_conflict' })
    }
    const row = rows[0]
    const postings = []
    for (const posting of row.postings) {
      const amountUnits = formanceSafeUnitsFromSdk(posting.amount)
      if (amountUnits === undefined) {
        return Object.freeze({ kind: 'setup_required', code: 'formance_unsafe_integer' })
      }
      postings.push(Object.freeze({
        source: posting.source,
        destination: posting.destination,
        asset: posting.asset,
        amountUnits,
      }))
    }
    const transactionId = formanceSafeUnitsFromSdk(row.id)
    if (transactionId === undefined) {
      return Object.freeze({ kind: 'setup_required', code: 'formance_unsafe_integer' })
    }
    recordMetric('read_reference', 'found', startedAt)
    return Object.freeze({
      kind: 'found',
      reference,
      transactionId,
      ...(row.template === undefined ? {} : { template: row.template }),
      metadata: safeMetadata(row.metadata),
      postings,
    })
  } catch (cause) {
    recordMetric('read_reference', 'unavailable', startedAt)
    return degradeBackend(cause, Object.freeze({ kind: 'unavailable', code: 'formance_read_unavailable' }), { site: 'readFormanceTransactionByReference', reason: 'source_unavailable' })
  }
}

export async function readFormancePeriodSpend(
  context: FormanceContext,
  input: Readonly<{
    accountDigest: string
    periodStartAt: number
    periodEndAt: number
    now?: number
  }>,
): Promise<FormancePeriodSpendResult> {
  const startedAt = Date.now()
  if (!DIGEST_PATTERN.test(input.accountDigest)
    || !Number.isSafeInteger(input.periodStartAt)
    || !Number.isSafeInteger(input.periodEndAt)
    || input.periodStartAt < 0
    || input.periodEndAt <= input.periodStartAt
    || input.periodEndAt - input.periodStartAt > 366 * 24 * 60 * 60 * 1_000) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_spend_query_invalid' })
  }
  const observedAt = input.now ?? Date.now()
  if (!Number.isSafeInteger(observedAt) || observedAt < 0) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_spend_query_invalid' })
  }
  let cursor: string | undefined
  let visited = 0
  let settledCount = 0n
  let spend = 0n
  try {
    do {
      const response = await context.sdk.ledger.v2.listTransactions(
        cursor === undefined
          ? {
              ledger: context.configuration.ledger,
              pageSize: 15,
              sort: 'id:asc',
              query: {
                $and: [
                  { $match: { 'metadata[account_digest]': input.accountDigest } },
                  { $gte: { timestamp: new Date(input.periodStartAt).toISOString() } },
                  { $lt: { timestamp: new Date(input.periodEndAt).toISOString() } },
                ],
              },
            }
          : { cursor, ledger: context.configuration.ledger },
        NO_RETRY,
      )
      const page = response.v2TransactionsCursorResponse?.cursor
      if (page === undefined) {
        return Object.freeze({ kind: 'unavailable', code: 'formance_spend_response_invalid' })
      }
      visited += page.data.length
      if (visited > 10_000) {
        return Object.freeze({ kind: 'unavailable', code: 'formance_spend_window_too_large' })
      }
      for (const transaction of page.data) {
        if (transaction.reverted || transaction.template !== 'BUYER_SALE_SETTLED') continue
        let transactionSpend = 0n
        for (const posting of transaction.postings) {
          if (posting.asset !== AUD_ASSET
            || !/^calls:[a-f0-9]{64}:buyer_reserved$/u.test(posting.source)
            || (posting.destination !== 'platform:revenue:sales'
              && posting.destination !== 'platform:tax:gst')) continue
          const units = formanceSafeUnitsFromSdk(posting.amount)
          if (units === undefined) {
            return Object.freeze({ kind: 'setup_required', code: 'formance_unsafe_integer' })
          }
          transactionSpend += BigInt(units)
        }
        if (transactionSpend === 0n) {
          return Object.freeze({ kind: 'setup_required', code: 'formance_spend_transaction_invalid' })
        }
        spend += transactionSpend
        if (canonicalFormanceUnits(spend.toString(), false) === undefined) {
          return Object.freeze({ kind: 'setup_required', code: 'formance_unsafe_integer' })
        }
        settledCount += 1n
      }
      cursor = page.hasMore ? page.next : undefined
      if (page.hasMore && cursor === undefined) {
        return Object.freeze({ kind: 'unavailable', code: 'formance_spend_cursor_invalid' })
      }
    } while (cursor !== undefined)
  } catch (cause) {
    recordMetric('read_period_spend', 'unavailable', startedAt)
    return degradeBackend(cause, Object.freeze({ kind: 'unavailable', code: 'formance_read_unavailable' }), { site: 'readFormancePeriodSpend', reason: 'source_unavailable' })
  }
  if (settledCount === 0n) {
    recordMetric('read_period_spend', 'empty', startedAt)
    return Object.freeze({ kind: 'empty' })
  }
  recordMetric('read_period_spend', 'available', startedAt)
  return Object.freeze({
    kind: 'available',
    currency: 'AUD',
    exponent: 6,
    spendUnits: spend.toString(),
    transactionCountUnits: settledCount.toString(),
    periodStartAt: input.periodStartAt,
    periodEndAt: input.periodEndAt,
    observedAt,
    source: 'formance_transaction_cursor',
    authoritativeForConsequences: false,
  })
}

export async function readFormanceStatementPage(
  context: FormanceContext,
  input: Readonly<{
    accountDigest: string
    periodStartAt: number
    periodEndAt: number
    snapshotCutoffAt: number
    cursor?: string
  }>,
): Promise<FormanceStatementPageResult> {
  const startedAt = Date.now()
  if (!DIGEST_PATTERN.test(input.accountDigest)
    || !Number.isSafeInteger(input.periodStartAt)
    || !Number.isSafeInteger(input.periodEndAt)
    || !Number.isSafeInteger(input.snapshotCutoffAt)
    || input.periodStartAt < 0
    || input.periodEndAt <= input.periodStartAt
    || input.snapshotCutoffAt < input.periodEndAt
    || input.periodEndAt - input.periodStartAt > 366 * 24 * 60 * 60 * 1_000
    || (input.cursor !== undefined && (input.cursor.length < 1 || input.cursor.length > 2_000))) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_statement_query_invalid' })
  }
  try {
    const response = await context.sdk.ledger.v2.listTransactions(
      input.cursor === undefined
        ? {
            ledger: context.configuration.ledger,
            pageSize: 15,
            pit: new Date(input.snapshotCutoffAt),
            sort: 'id:asc',
            query: {
              $and: [
                { $match: { 'metadata[account_digest]': input.accountDigest } },
                { $gte: { timestamp: new Date(input.periodStartAt).toISOString() } },
                { $lt: { timestamp: new Date(input.periodEndAt).toISOString() } },
              ],
            },
          }
        : { cursor: input.cursor, ledger: context.configuration.ledger },
      NO_RETRY,
    )
    const page = response.v2TransactionsCursorResponse?.cursor
    if (page === undefined || page.data.length > 15) {
      return Object.freeze({ kind: 'unavailable', code: 'formance_statement_response_invalid' })
    }
    const transactionRefs: string[] = []
    let exactAmountUnits = 0n
    for (const transaction of page.data) {
      if (transaction.reverted || transaction.template !== 'BUYER_SALE_SETTLED') continue
      if (transaction.reference === undefined || !COMMAND_REFERENCE_PATTERN.test(transaction.reference)) {
        return Object.freeze({ kind: 'setup_required', code: 'formance_statement_transaction_invalid' })
      }
      let transactionUnits = 0n
      for (const posting of transaction.postings) {
        if (posting.asset !== AUD_ASSET
          || !/^calls:[a-f0-9]{64}:buyer_reserved$/u.test(posting.source)
          || (posting.destination !== 'platform:revenue:sales'
            && posting.destination !== 'platform:tax:gst')) continue
        const units = formanceSafeUnitsFromSdk(posting.amount)
        if (units === undefined) {
          return Object.freeze({ kind: 'setup_required', code: 'formance_unsafe_integer' })
        }
        transactionUnits += BigInt(units)
      }
      if (transactionUnits === 0n) {
        return Object.freeze({ kind: 'setup_required', code: 'formance_statement_transaction_invalid' })
      }
      exactAmountUnits += transactionUnits
      if (canonicalFormanceUnits(exactAmountUnits.toString(), false) === undefined) {
        return Object.freeze({ kind: 'setup_required', code: 'formance_unsafe_integer' })
      }
      transactionRefs.push(transaction.reference)
    }
    if (page.hasMore && (page.next === undefined || page.next.length < 1 || page.next.length > 2_000)) {
      return Object.freeze({ kind: 'unavailable', code: 'formance_statement_cursor_invalid' })
    }
    recordMetric('read_statement_page', 'available', startedAt)
    return Object.freeze({
      kind: 'available',
      transactionRefs: Object.freeze(transactionRefs),
      exactAmountUnits: exactAmountUnits.toString(),
      continueCursor: page.hasMore ? page.next! : '',
      isDone: !page.hasMore,
    })
  } catch (cause) {
    recordMetric('read_statement_page', 'unavailable', startedAt)
    return degradeBackend(cause, Object.freeze({ kind: 'unavailable', code: 'formance_read_unavailable' }), { site: 'readFormanceStatementPage', reason: 'source_unavailable' })
  }
}

type LedgerHistoryTransaction = NonNullable<Awaited<ReturnType<SDK['ledger']['v2']['listTransactions']>>['v2TransactionsCursorResponse']>['cursor']['data'][number]
type HistoryCursor = ReturnType<typeof accountHistoryCursorSchema.parse>

function historyCursorSignature(payload: string, key: string): Buffer {
  return createHmac('sha256', key).update(`ae.account-history-cursor:v1.${payload}`).digest()
}

function encodeHistoryCursor(payload: HistoryCursor, key: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${historyCursorSignature(encoded, key).toString('base64url')}`
}

function decodeHistoryCursor(token: string, key: string): HistoryCursor | undefined {
  if (token.length > 4096) return undefined
  const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/u.exec(token)
  if (match?.[1] === undefined || match[2] === undefined) return undefined
  const signature = Buffer.from(match[2], 'base64url')
  if (signature.length !== 32 || !timingSafeEqual(signature, historyCursorSignature(match[1], key))) return undefined
  try {
    const parsed = accountHistoryCursorSchema.safeParse(JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

function historyTransactionEffect(transaction: LedgerHistoryTransaction, accountDigest: string): AccountHistoryEntry | null | undefined {
  if (transaction.metadata.account_digest !== accountDigest) return undefined
  const occurredAt = transaction.timestamp.getTime()
  const recordedAt = transaction.insertedAt?.getTime() ?? null
  const revertedAt = transaction.revertedAt?.getTime() ?? null
  // This SDK decodes IDs through JSON numbers before bigint; reject lost precision.
  if (!Number.isSafeInteger(occurredAt) || occurredAt < 0 || formanceSafeUnitsFromSdk(transaction.id) === undefined
    || (recordedAt !== null && (!Number.isSafeInteger(recordedAt) || recordedAt < 0))
    || (revertedAt !== null && (!Number.isSafeInteger(revertedAt) || revertedAt < 0))) return undefined
  const available = `accounts:${accountDigest}:available`
  const callDigest = transaction.metadata.call_digest
  const reserved = callDigest !== undefined && DIGEST_PATTERN.test(callDigest) ? `calls:${callDigest}:buyer_reserved` : undefined
  let credit = 0n
  let document = 0n
  for (const posting of transaction.postings) {
    if (posting.asset !== AUD_ASSET) continue
    const units = formanceSafeUnitsFromSdk(posting.amount)
    if (units === undefined) return undefined
    // Account and Call attribution must agree with the booked addresses.
    if ([posting.source, posting.destination].some((address) =>
      (/^calls:[a-f0-9]{64}:buyer_reserved$/u.test(address) && address !== reserved)
      || (/^accounts:[a-f0-9]{64}:available$/u.test(address) && address !== available))) return undefined
    const amount = BigInt(units)
    if (posting.destination === available || posting.destination === reserved) credit += amount
    if (posting.source === available || posting.source === reserved) credit -= amount
    if (/^adjustments:[a-f0-9]{64}:buyer$/u.test(posting.destination)) document += amount
    if (/^adjustments:[a-f0-9]{64}:buyer$/u.test(posting.source)) document -= amount
  }
  const kinds: Partial<Record<FormanceMoneyTemplate, AccountHistoryEntry['kind']>> = {
    FUNDING_SETTLED: 'funding', FUNDING_REVERSED: 'funding_reversal',
    BUYER_SALE_SETTLED: 'call_spend', BUYER_ADJUSTED: 'document_adjustment',
  }
  const template = transaction.template
  const known = PACKAGE4_FORMANCE_TEMPLATE_NAMES.find((value) => value === template)
  let kind = known === undefined ? 'unmapped' : kinds[known]
  if ((kind === 'funding' && (credit <= 0n || document !== 0n))
    || ((kind === 'funding_reversal' || kind === 'call_spend') && (credit >= 0n || document !== 0n))
    || (kind === 'document_adjustment' && (credit !== 0n || document === 0n))) kind = 'unmapped'
  // Only known zero-effect internal legs can be omitted. Unknown bookings stay
  // visible and mark coverage partial, even if their credit effect is zero.
  if (kind === undefined && credit === 0n && document === 0n && !transaction.reverted) return null
  const sourceDigest = template === 'BUYER_SALE_SETTLED'
    ? transaction.metadata.call_digest
    : transaction.metadata.command_digest
  return {
    transactionId: transaction.id.toString(), transactionRef: transaction.reference ?? null,
    occurredAt, recordedAt, kind: kind ?? 'unmapped',
    accountEffect: { currency: 'AUD', units: credit.toString(), exponent: 6 },
    documentEffectUnits: document.toString(), reverted: transaction.reverted, revertedAt,
    sourceRef: null,
    sourceDigest: sourceDigest !== undefined && DIGEST_PATTERN.test(sourceDigest) ? sourceDigest : null,
  }
}

/**
 * Requires a canonical Account digest and server-held cursor key. Returns each
 * booked transaction once in native ID order, not effective-date order. Exact
 * Account effects exclude internal allocation; document adjustments stay separate.
 * Invalid source attribution/order/snapshot fails unavailable without a partial page.
 * Does not change statement-document rules or write money.
 */
export async function readFormanceAccountHistory(
  context: FormanceContext,
  input: Readonly<{ accountDigest: string; cursorKey: string; cursor?: string; now?: number }>,
): Promise<AccountHistoryResult> {
  if (!DIGEST_PATTERN.test(input.accountDigest) || input.cursorKey.length < 32) {
    return { kind: 'setup_required', code: 'formance_history_configuration_invalid' }
  }
  const cursor = input.cursor === undefined ? undefined : decodeHistoryCursor(input.cursor, input.cursorKey)
  if (input.cursor !== undefined && (cursor === undefined || cursor.accountDigest !== input.accountDigest
    || cursor.ledger !== context.configuration.ledger)) return { kind: 'refused', code: 'account_history_cursor_invalid' }
  const snapshotAt = cursor?.snapshotAt ?? input.now ?? Date.now()
  if (!Number.isSafeInteger(snapshotAt) || snapshotAt < 0) return { kind: 'refused', code: 'account_history_cursor_invalid' }
  try {
    const response = await context.sdk.ledger.v2.listTransactions(cursor === undefined ? {
      ledger: context.configuration.ledger, pageSize: 15, pit: new Date(snapshotAt), sort: 'id:desc',
      // Formance v2.4.12 PIT bounds effective time only. Its native cursor
      // retains these filters; we also enforce the snapshot on every returned row.
      query: { $and: [
        { $match: { 'metadata[account_digest]': input.accountDigest } },
        { $lte: { inserted_at: new Date(snapshotAt).toISOString() } },
      ] },
    } : { ledger: context.configuration.ledger, cursor: cursor.cursor }, NO_RETRY)
    const page = response.v2TransactionsCursorResponse?.cursor
    if (page === undefined || page.data.length > 15 || (page.hasMore && (page.data.length === 0
      || page.next === undefined || page.next.length === 0 || page.next.length > 2000 || page.next === cursor?.cursor))) {
      return { kind: 'unavailable', code: 'formance_history_response_invalid' }
    }
    const entries: AccountHistoryEntry[] = []
    let lastId = cursor?.lastId
    let coverage: 'complete' | 'partial' = cursor?.coverage ?? 'complete'
    for (const transaction of page.data) {
      const timestamp = transaction.timestamp.getTime()
      if (timestamp > snapshotAt || (transaction.insertedAt?.getTime() ?? snapshotAt) > snapshotAt
        || (transaction.revertedAt?.getTime() ?? snapshotAt) > snapshotAt) {
        return { kind: 'unavailable', code: 'formance_history_snapshot_invalid' }
      }
      if (lastId !== undefined && transaction.id >= BigInt(lastId)) {
        return { kind: 'unavailable', code: 'formance_history_order_invalid' }
      }
      const entry = historyTransactionEffect(transaction, input.accountDigest)
      if (entry === undefined) return { kind: 'unavailable', code: 'formance_history_attribution_invalid' }
      lastId = transaction.id.toString()
      if (entry !== null) {
        entries.push(entry)
        // Native reverts lack a guaranteed reverse-reference projection in the
        // installed SDK. Preserve the original and never claim complete netting.
        if (entry.kind === 'unmapped' || entry.recordedAt === null || entry.reverted
          || (!entry.transactionRef && entry.sourceDigest === null)) coverage = 'partial'
      }
    }
    const continueCursor = page.hasMore && page.next !== undefined && lastId !== undefined
      ? encodeHistoryCursor({ accountDigest: input.accountDigest, ledger: context.configuration.ledger,
          snapshotAt, cursor: page.next, lastId, coverage }, input.cursorKey)
      : ''
    return { kind: 'available', entries, snapshotAt, continueCursor, isDone: !page.hasMore, coverage,
      sourceLinkCoverage: 'unavailable', source: 'formance_transaction_cursor', ordering: 'recorded_transaction_sequence_desc' }
  } catch (cause) {
    return degradeBackend(cause, { kind: 'unavailable' as const, code: 'formance_read_unavailable' }, { site: 'readFormanceAccountHistory', reason: 'source_unavailable' })
  }
}

export async function executeFormanceMoneyCommand(
  context: FormanceContext,
  command: FormanceMoneyCommand,
): Promise<FormanceMoneyResult> {
  const startedAt = Date.now()
  const invalid = validateFormanceMoneyCommand(command)
  if (invalid !== undefined) return refused(invalid)
  const schema = await readSchema(context, command.schemaVersion as SupportedFormanceSchemaVersion)
  if (schema.kind !== 'ready') {
    return schema.kind === 'setup_required'
      ? refused(schema.code)
      : unavailable(schema.code)
  }
  const existing = await readFormanceTransactionByReference(context, command.commandRef)
  if (existing.kind === 'found') {
    if (!matchingCommand(existing, command)) {
      return refused('formance_reference_conflict')
    }
    recordMetric('write', 'replayed', startedAt)
    return completed(command.commandRef, true)
  }
  if (existing.kind === 'setup_required') return refused(existing.code)
  if (existing.kind === 'unavailable') return unavailable(existing.code)

  try {
    const response = await context.sdk.ledger.v2.createTransaction({
      idempotencyKey: command.idempotencyKey,
      ledger: context.configuration.ledger,
      schemaVersion: command.schemaVersion,
      v2PostTransaction: {
        metadata: command.metadata,
        reference: command.commandRef,
        runtime: 'machine',
        script: { template: command.template, vars: command.variables },
      },
    }, NO_RETRY)
    const transaction = response.v2CreateTransactionResponse?.data
    if (transaction === undefined || transaction.reference !== command.commandRef) {
      return unknown(command.commandRef)
    }
    for (const posting of transaction.postings) {
      if (formanceSafeUnitsFromSdk(posting.amount) === undefined) {
        recordMetric('write', 'unsafe_integer', startedAt)
        return Object.freeze({ kind: 'refused', code: 'formance_unsafe_integer', retryable: false })
      }
    }
    recordMetric('write', 'completed', startedAt)
    return completed(command.commandRef, false)
  } catch (error) {
    const reconciled = await readFormanceTransactionByReference(context, command.commandRef)
    const result = reconciled.kind === 'found'
      ? matchingCommand(reconciled, command)
        ? completed(command.commandRef, true)
        : refused('formance_reference_conflict')
      : reconciled.kind === 'setup_required'
        ? refused(reconciled.code)
        : reconciled.kind === 'unavailable'
          ? unknown(command.commandRef)
          : mapFormanceWriteError(error, command.commandRef)
    recordMetric('write', result.kind, startedAt)
    return result
  }
}

export async function executeFormanceMoneyBulk(
  context: FormanceContext,
  bulk: FormanceMoneyBulkCommand,
): Promise<FormanceMoneyResult> {
  const startedAt = Date.now()
  const commands = [...bulk.commands]
  if (commands.length < 2 || commands.length > 4
    || new Set(commands.map(({ commandRef }) => commandRef)).size !== commands.length
    || new Set(commands.map(({ idempotencyKey }) => idempotencyKey)).size !== commands.length) {
    return refused('formance_bulk_invalid')
  }
  for (const command of commands) {
    const invalid = validateFormanceMoneyCommand(command)
    if (invalid !== undefined) return refused(invalid)
  }
  const schemaVersions = new Set(commands.map(({ schemaVersion }) => schemaVersion))
  if (schemaVersions.size !== 1) return refused('formance_bulk_schema_mismatch')
  const schemaVersion = commands[0]!.schemaVersion
  const schema = await readSchema(context, schemaVersion as SupportedFormanceSchemaVersion)
  if (schema.kind !== 'ready') {
    return schema.kind === 'setup_required'
      ? refused(schema.code)
      : unavailable(schema.code)
  }
  const before = await readBulkReferences(context, commands)
  if (before.kind === 'completed') return before.result
  if (before.kind === 'refused') return refused(before.code)
  if (before.kind === 'unavailable') return unavailable(before.code)

  try {
    const response = await context.sdk.ledger.v2.createBulk({
      atomic: true,
      continueOnFailure: false,
      ledger: context.configuration.ledger,
      parallel: false,
      requestBody: commands.map((command) => ({
        action: 'CREATE_TRANSACTION' as const,
        data: {
          metadata: command.metadata,
          reference: command.commandRef,
          runtime: 'machine' as const,
          script: { template: command.template, vars: command.variables },
        },
        ik: command.idempotencyKey,
      })),
      schemaVersion,
    }, NO_RETRY)
    const rows = response.v2BulkResponse?.data
    if (rows === undefined) return unknown(commands[0]!.commandRef)
    // Native atomic responses may include staged successes before a later error.
    // The SDK validates response shape; final reference readback decides whether
    // those staged entries were committed or rolled back.
    if (rows.some((row) => row.responseType === 'ERROR')) {
      const reconciled = await readBulkReferences(context, commands)
      const result = reconciled.kind === 'absent'
        ? refused('formance_bulk_refused')
        : reconciled.kind === 'completed'
          ? reconciled.result
          : unknown(commands[0]!.commandRef)
      recordMetric('write_bulk', result.kind, startedAt)
      return result
    }
    if (rows.length !== commands.length) return unknown(commands[0]!.commandRef)
    if (!rows.every((row, index) => row.responseType === 'CREATE_TRANSACTION'
      && row.data.reference === commands[index]!.commandRef
      && row.data.postings.every(({ amount }) => formanceSafeUnitsFromSdk(amount) !== undefined))) {
      return unknown(commands[0]!.commandRef)
    }
    recordMetric('write_bulk', 'completed', startedAt)
    return completedMany(commands.map(({ commandRef }) => commandRef), false)
  } catch (error) {
    if (statusCode(error) === 401 || statusCode(error) === 403) {
      recordMetric('write_bulk', 'unavailable', startedAt)
      return unavailable('formance_access_unavailable')
    }
    const reconciled = await readBulkReferences(context, commands)
    const result = reconciled.kind === 'completed'
      ? reconciled.result
      : reconciled.kind === 'absent'
        ? errorName(error) === 'SDKValidationError'
          ? unknown(commands[0]!.commandRef)
          : mapFormanceWriteError(error, commands[0]!.commandRef)
        : unknown(commands[0]!.commandRef)
    recordMetric('write_bulk', result.kind, startedAt)
    return result
  }
}

type BulkReadback =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'completed'; result: FormanceMoneyResult }>
  | Readonly<{ kind: 'refused'; code: string }>
  | Readonly<{ kind: 'unavailable'; code: string }>

async function readBulkReferences(
  context: FormanceContext,
  commands: readonly FormanceMoneyCommand[],
): Promise<BulkReadback> {
  const reads = await Promise.all(
    commands.map(async ({ commandRef }) => await readFormanceTransactionByReference(context, commandRef)),
  )
  const unavailableRead = reads.find((read) => read.kind === 'unavailable')
  if (unavailableRead?.kind === 'unavailable') return unavailableRead
  const invalidRead = reads.find((read) => read.kind === 'setup_required')
  if (invalidRead?.kind === 'setup_required') return Object.freeze({ kind: 'refused', code: invalidRead.code })
  if (reads.every((read) => read.kind === 'absent')) return Object.freeze({ kind: 'absent' })
  if (commands.every((command, index) => {
    const read = reads[index]
    return read !== undefined && read.kind === 'found' && matchingCommand(read, command)
  })) {
    return Object.freeze({
      kind: 'completed',
      result: completedMany(commands.map(({ commandRef }) => commandRef), true),
    })
  }
  if (reads.every((read) => read.kind === 'found')) {
    return Object.freeze({ kind: 'refused', code: 'formance_reference_conflict' })
  }
  return Object.freeze({ kind: 'refused', code: 'formance_bulk_partial_state' })
}

function matchingCommand(
  existing: Extract<FormanceReferenceReadResult, { kind: 'found' }>,
  command: FormanceMoneyCommand,
): boolean {
  return existing.metadata.command_digest === command.metadata.command_digest
    && existing.metadata.idempotency_digest === command.idempotencyKey
    && existing.template === command.template
}

export function mapFormanceWriteError(error: unknown, reference: string): FormanceMoneyResult {
  const status = statusCode(error)
  if (status === 401 || status === 403) return unavailable('formance_access_unavailable')
  if (status === 400 || status === 404 || status === 409 || status === 422
    || errorName(error) === 'SDKValidationError') {
    return refused(status === 409 ? 'formance_idempotency_conflict' : 'formance_request_refused')
  }
  return unknown(reference)
}

async function ensureLedger(context: FormanceContext): Promise<void> {
  try {
    await context.sdk.ledger.v2.createLedger({
      ledger: context.configuration.ledger,
      v2CreateLedgerRequest: {
        metadata: {
          purpose_digest: FORMANCE_SCHEMA_DIGEST.slice('sha256:'.length),
        },
      },
    }, NO_RETRY)
  } catch (error) {
    if (statusCode(error) !== 409) throw error
  }
}

type SupportedFormanceSchemaVersion =
  | typeof LEGACY_FORMANCE_SCHEMA_VERSION
  | typeof FORMANCE_SCHEMA_VERSION

function schemaDefinition(version: SupportedFormanceSchemaVersion): Readonly<{
  version: SupportedFormanceSchemaVersion
  schema: FormanceSchemaData
  digest: string
  readbackDigest: string
}> {
  return version === LEGACY_FORMANCE_SCHEMA_VERSION
    ? {
        version,
        schema: PACKAGE4_FORMANCE_SCHEMA,
        digest: PACKAGE4_FORMANCE_SCHEMA_DIGEST,
        readbackDigest: LEGACY_FORMANCE_SCHEMA_READBACK_DIGEST,
      }
    : {
        version,
        schema: FORMANCE_SCHEMA,
        digest: FORMANCE_SCHEMA_DIGEST,
        readbackDigest: FORMANCE_SCHEMA_READBACK_DIGEST,
      }
}

async function insertSchemaVersion(
  context: FormanceContext,
  version: SupportedFormanceSchemaVersion,
): Promise<FormanceHealthResult> {
  const definition = schemaDefinition(version)
  try {
    await context.sdk.ledger.v2.insertSchema({
      idempotencyKey: definition.digest.slice('sha256:'.length),
      ledger: context.configuration.ledger,
      version: definition.version,
      v2SchemaData: definition.schema,
    }, NO_RETRY)
  } catch (cause) {
    degradeBackend(cause, undefined, { site: 'insertSchemaVersion', reason: 'source_unavailable' })
    const reconciled = await readSchema(context, version)
    if (reconciled.kind !== 'ready') return reconciled
  }
  return await readSchema(context, version)
}

async function readSchema(
  context: FormanceContext,
  version: SupportedFormanceSchemaVersion = FORMANCE_SCHEMA_VERSION,
): Promise<FormanceHealthResult> {
  const definition = schemaDefinition(version)
  try {
    const response = await context.sdk.ledger.v2.getSchema({
      ledger: context.configuration.ledger,
      version: definition.version,
    }, NO_RETRY)
    const schema = response.v2SchemaResponse?.data
    if (schema === undefined) return Object.freeze({ kind: 'unavailable', code: 'formance_schema_response_invalid' })
    const readbackDigest = schemaReadbackDigest({
      chart: schema.chart,
      queries: schema.queries ?? {},
      transactions: schema.transactions ?? {},
    })
    if (schema.version !== definition.version || readbackDigest !== definition.readbackDigest) {
      return Object.freeze({ kind: 'setup_required', code: 'formance_schema_drift' })
    }
    return Object.freeze({
      kind: 'ready',
      gatewayVersion: PACKAGE4_FORMANCE_REQUIREMENTS.gatewayVersion,
      ledgerVersion: PACKAGE4_FORMANCE_REQUIREMENTS.ledgerVersion,
      schemaVersion: schema.version,
      schemaDigest: definition.digest,
    })
  } catch (error) {
    if (statusCode(error) === 404) {
      return Object.freeze({ kind: 'unavailable', code: 'formance_schema_absent' })
    }
    return Object.freeze({ kind: 'unavailable', code: 'formance_schema_unavailable' })
  }
}

function safeMetadata(metadata: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([key, value]) => ALLOWED_METADATA_KEYS.has(key) && DIGEST_PATTERN.test(value)),
  )
}

function nonempty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed
}

function timeout(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return DEFAULT_TIMEOUT_MS
  if (!/^\d{1,5}$/u.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed)
    && parsed >= MINIMUM_TIMEOUT_MS
    && parsed <= MAXIMUM_TIMEOUT_MS
    ? parsed
    : undefined
}

function statusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return undefined
  return typeof error.statusCode === 'number' ? error.statusCode : undefined
}

function errorName(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('name' in error)) return undefined
  return typeof error.name === 'string' ? error.name : undefined
}

function formanceReadFailureCode(error: unknown, operation: 'health'): string {
  const status = statusCode(error)
  if (status === 401 || status === 403) return 'formance_access_unavailable'
  if (errorName(error) === 'RequestTimeoutError') return 'formance_request_timeout'
  if (errorName(error) === 'ConnectionError') return 'formance_connection_unavailable'
  return `formance_${operation}_unavailable`
}

function unavailableHealth(code: string, startedAt: number): FormanceHealthResult {
  recordMetric('health', 'unavailable', startedAt)
  return Object.freeze({ kind: 'unavailable', code })
}

function recordMetric(operation: string, outcome: string, startedAt: number): void {
  console.info(JSON.stringify({
    kind: 'AE_FORMANCE_METRIC',
    operation,
    outcome,
    latencyMs: Math.max(0, Date.now() - startedAt),
  }))
}

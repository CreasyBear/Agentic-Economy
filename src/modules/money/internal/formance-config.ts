"use node"

import { HTTPClient, SDK } from '@formance/formance-sdk'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import {
  LEGACY_FORMANCE_SCHEMA_VERSION,
  FORMANCE_SCHEMA_VERSION,
  FORMANCE_TEMPLATE_NAMES,
  LEGACY_FORMANCE_TEMPLATE_NAMES,
  type FormanceMoneyTemplate,
} from '../formance-schema'

export const DIGEST_PATTERN = /^[a-f0-9]{64}$/u
export const COMMAND_REFERENCE_PATTERN = /^ae-p4:[a-f0-9]{64}(?::[a-z0-9_-]{1,32})?$/u
const ACCOUNT_ADDRESS_PATTERN = /^[a-z][a-z0-9_-]*(?::[a-z0-9_-]+)*$/u
const LEDGER_NAME_PATTERN = /^[a-z][a-z0-9-]{2,62}$/u
const VARIABLE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u
const MAX_VARIABLES = 24
const MAX_VARIABLE_VALUE_LENGTH = 500
const DEFAULT_TIMEOUT_MS = 10_000
const MINIMUM_TIMEOUT_MS = 100
const MAXIMUM_TIMEOUT_MS = 30_000
export const AUD_ASSET = 'AUD/6'
const USDC_ASSET = 'USDC/6'

export const ALLOWED_METADATA_KEYS = new Set([
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

export const NO_RETRY = Object.freeze({ retries: Object.freeze({ strategy: 'none' as const }) })

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

export function nonempty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed
}

export function timeout(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return DEFAULT_TIMEOUT_MS
  if (!/^\d{1,5}$/u.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed)
    && parsed >= MINIMUM_TIMEOUT_MS
    && parsed <= MAXIMUM_TIMEOUT_MS
    ? parsed
    : undefined
}

export function statusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return undefined
  return typeof error.statusCode === 'number' ? error.statusCode : undefined
}

export function errorName(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('name' in error)) return undefined
  return typeof error.name === 'string' ? error.name : undefined
}

export function recordMetric(operation: string, outcome: string, startedAt: number): void {
  console.info(JSON.stringify({
    kind: 'AE_FORMANCE_METRIC',
    operation,
    outcome,
    latencyMs: Math.max(0, Date.now() - startedAt),
  }))
}
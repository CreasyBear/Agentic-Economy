"use node"

import { HTTPClient, SDK } from '@formance/formance-sdk'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { PACKAGE4_FORMANCE_REQUIREMENTS } from './internal/commercial-policy'

type FormanceSchemaData = Parameters<SDK['ledger']['v2']['insertSchema']>[0]['v2SchemaData']
type FormanceChartSegment = FormanceSchemaData['chart'][string]

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

export const PACKAGE4_FORMANCE_TEMPLATE_NAMES = Object.freeze([
  'FUNDING_SETTLED',
  'FUNDING_REVERSED',
  'CALL_RESERVED_AUD',
  'CALL_RESERVED_USDC',
  'CALL_RELEASED_AUD',
  'CALL_RELEASED_USDC',
  'BUYER_SALE_SETTLED',
  'BUYER_ADJUSTED',
  'TREASURY_CAPACITY_SYNCED',
  'PROVIDER_OBLIGATION_ACCRUED',
  'PROVIDER_SETTLED',
  'PROVIDER_REVERSED',
] as const)

export type FormanceMoneyTemplate = (typeof PACKAGE4_FORMANCE_TEMPLATE_NAMES)[number]

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

export type FormanceMoneyResult =
  | Readonly<{
      kind: 'completed'
      transactionRefs: readonly string[]
      replayed: boolean
    }>
  | Readonly<{
      kind: 'refused'
      code: string
      retryable: false
    }>
  | Readonly<{
      kind: 'unavailable'
      code: string
      submissionProvenAbsent: true
    }>
  | Readonly<{
      kind: 'outcome_unknown'
      reference: string
      statusRef: string
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

const leaf: FormanceChartSegment = { dotSelf: {} }

function fixed(children: Record<string, FormanceChartSegment>): FormanceChartSegment {
  return { additionalProperties: children }
}

function digestSegment(children: Record<string, FormanceChartSegment>): FormanceChartSegment {
  return {
    additionalProperties: {
      '$digest': {
        dotPattern: '^[a-f0-9]{64}$',
        additionalProperties: children,
      },
    },
  }
}

function transferTemplate(description: string) {
  return Object.freeze({
    description,
    runtime: 'machine' as const,
    script: `vars {
  account $source
  account $destination
  monetary $amount
}
send $amount (
  source = $source
  destination = $destination
)`,
  })
}

export const PACKAGE4_FORMANCE_SCHEMA: FormanceSchemaData = Object.freeze({
  chart: Object.freeze({
    world: leaf,
    processor: digestSegment({ settlement: leaf }),
    accounts: digestSegment({ available: leaf }),
    calls: digestSegment({ buyer_reserved: leaf }),
    agents: digestSegment({
      budget_available: leaf,
      budget_reserved: leaf,
      budget_spent: leaf,
    }),
    legal_customers: digestSegment({
      exposure_available: leaf,
      exposure_reserved: leaf,
      exposure_settled: leaf,
    }),
    provider_obligations: digestSegment({
      accrued: leaf,
      settled: leaf,
      reversed: leaf,
    }),
    providers: digestSegment({ settlement: leaf }),
    adjustments: digestSegment({ buyer: leaf }),
    treasury: fixed({
      corporate: digestSegment({ available: leaf, committed: leaf }),
    }),
    platform: fixed({
      expense: fixed({ providers: leaf }),
      revenue: fixed({ sales: leaf }),
      tax: fixed({ gst: leaf }),
    }),
  }),
  queries: Object.freeze({}),
  transactions: Object.freeze({
    FUNDING_SETTLED: Object.freeze({
      description: 'Record processor settlement, Account AUD principal, service fee, and GST',
      runtime: 'machine' as const,
      script: `vars {
  account $processor
  account $account
  account $revenue
  account $tax
  monetary $principal_amount
  monetary $service_fee_amount
  monetary $tax_amount
  monetary $total_amount
}
send $total_amount (
  source = @world
  destination = $processor
)
send $principal_amount (
  source = $processor
  destination = $account
)
send $service_fee_amount (
  source = $processor
  destination = $revenue
)
send $tax_amount (
  source = $processor
  destination = $tax
)`,
    }),
    FUNDING_REVERSED: Object.freeze({
      description: 'Append a full processor reversal across principal, fee, and GST',
      runtime: 'machine' as const,
      script: `vars {
  account $processor
  account $account
  account $revenue
  account $tax
  monetary $principal_amount
  monetary $service_fee_amount
  monetary $tax_amount
  monetary $total_amount
}
send $principal_amount (
  source = $account
  destination = $processor
)
send $service_fee_amount (
  source = $revenue
  destination = $processor
)
send $tax_amount (
  source = $tax
  destination = $processor
)
send $total_amount (
  source = $processor
  destination = @world
)`,
    }),
    CALL_RESERVED_AUD: Object.freeze({
      description: 'Atomically reserve Account AUD, Agent budget, and legal-customer exposure',
      runtime: 'machine' as const,
      script: `vars {
  account $account_available
  account $call_reserved
  account $agent_available
  account $agent_reserved
  account $legal_available
  account $legal_reserved
  monetary $buyer_amount
  monetary $budget_amount
  monetary $exposure_amount
}
send $buyer_amount (
  source = $account_available
  destination = $call_reserved
)
send $budget_amount (
  source = $agent_available
  destination = $agent_reserved
)
send $exposure_amount (
  source = $legal_available
  destination = $legal_reserved
)`,
    }),
    CALL_RESERVED_USDC: transferTemplate('Reserve corporate USDC capacity'),
    CALL_RELEASED_AUD: Object.freeze({
      description: 'Release Account AUD, Agent budget, and legal-customer exposure',
      runtime: 'machine' as const,
      script: `vars {
  account $account_available
  account $call_reserved
  account $agent_available
  account $agent_reserved
  account $legal_available
  account $legal_reserved
  monetary $buyer_amount
  monetary $budget_amount
  monetary $exposure_amount
}
send $buyer_amount (
  source = $call_reserved
  destination = $account_available
)
send $budget_amount (
  source = $agent_reserved
  destination = $agent_available
)
send $exposure_amount (
  source = $legal_reserved
  destination = $legal_available
)`,
    }),
    CALL_RELEASED_USDC: transferTemplate('Release corporate USDC capacity'),
    BUYER_SALE_SETTLED: Object.freeze({
      description: 'Settle buyer AUD sale, Agent spend, and legal-customer exposure',
      runtime: 'machine' as const,
      script: `vars {
  account $call_reserved
  account $revenue
  account $tax
  account $agent_reserved
  account $agent_spent
  account $legal_reserved
  account $legal_settled
  monetary $revenue_amount
  monetary $tax_amount
  monetary $budget_amount
  monetary $exposure_amount
}
send $revenue_amount (
  source = $call_reserved
  destination = $revenue
)
send $tax_amount (
  source = $call_reserved
  destination = $tax
)
send $budget_amount (
  source = $agent_reserved
  destination = $agent_spent
)
send $exposure_amount (
  source = $legal_reserved
  destination = $legal_settled
)`,
    }),
    BUYER_ADJUSTED: transferTemplate('Append a buyer AUD adjustment'),
    TREASURY_CAPACITY_SYNCED: Object.freeze({
      description: 'Establish one immutable controlled-capacity generation',
      runtime: 'machine' as const,
      script: `vars {
  account $capacity
  monetary $amount
}
send $amount (
  source = @world
  destination = $capacity
)`,
    }),
    PROVIDER_OBLIGATION_ACCRUED: Object.freeze({
      description: 'Accrue Provider USDC expense separately from the buyer AUD sale',
      runtime: 'machine' as const,
      script: `vars {
  account $expense
  account $obligation
  monetary $amount
}
send $amount (
  source = $expense allowing unbounded overdraft
  destination = $obligation
)`,
    }),
    PROVIDER_SETTLED: Object.freeze({
      description: 'Settle corporate USDC and mark the linked Provider obligation paid',
      runtime: 'machine' as const,
      script: `vars {
  account $treasury_committed
  account $provider_settlement
  account $obligation_accrued
  account $obligation_settled
  monetary $amount
}
send $amount (
  source = $treasury_committed
  destination = $provider_settlement
)
send $amount (
  source = $obligation_accrued
  destination = $obligation_settled
)`,
    }),
    PROVIDER_REVERSED: Object.freeze({
      description: 'Append a Provider settlement reversal',
      runtime: 'machine' as const,
      script: `vars {
  account $treasury_available
  account $provider_settlement
  account $obligation_settled
  account $obligation_reversed
  monetary $amount
}
send $amount (
  source = $provider_settlement
  destination = $treasury_available
)
send $amount (
  source = $obligation_settled
  destination = $obligation_reversed
)`,
    }),
  }),
})

export const PACKAGE4_FORMANCE_SCHEMA_DIGEST = canonicalDigest({
  format: 'ae.package4.formance-schema:v1',
  schema: PACKAGE4_FORMANCE_SCHEMA,
})

const PACKAGE4_FORMANCE_SCHEMA_READBACK_DIGEST = schemaReadbackDigest(PACKAGE4_FORMANCE_SCHEMA)

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
  } catch {
    return Object.freeze({ kind: 'setup_required', code: 'formance_gateway_invalid' })
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
  if (command.schemaVersion !== PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion) {
    return 'formance_schema_version_invalid'
  }
  if (!PACKAGE4_FORMANCE_TEMPLATE_NAMES.includes(command.template)) {
    return 'formance_template_invalid'
  }
  const variables = Object.entries(command.variables)
  if (variables.length === 0 || variables.length > MAX_VARIABLES) return 'formance_variables_invalid'
  for (const [key, value] of variables) {
    if (!VARIABLE_NAME_PATTERN.test(key)
      || value.length === 0
      || value.length > MAX_VARIABLE_VALUE_LENGTH
      || value !== value.trim()
      || !validFormanceVariableValue(value)) return 'formance_variables_invalid'
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
): string | undefined {
  const exact = canonicalFormanceUnits(units)
  if (exact === undefined) return undefined
  return `${asset === 'AUD' ? AUD_ASSET : USDC_ASSET} ${exact}`
}

export function formanceSafeUnitsFromSdk(value: bigint | number | string): string | undefined {
  if (typeof value === 'string' && !/^(?:0|[1-9]\d*)$/u.test(value)) return undefined
  let units: bigint
  try {
    units = typeof value === 'bigint' ? value : BigInt(value)
  } catch {
    return undefined
  }
  if (units < 0n) return undefined
  const number = Number(units)
  return Number.isSafeInteger(number) && BigInt(number) === units ? units.toString() : undefined
}

function validFormanceVariableValue(value: string): boolean {
  const monetary = /^(AUD|USDC)\/6 (.+)$/u.exec(value)
  return monetary === null
    ? validFormanceAccountAddress(value)
    : canonicalFormanceUnits(monetary[2] ?? '') !== undefined
}

export function validFormanceAccountAddress(address: string): boolean {
  return address.length <= 500 && ACCOUNT_ADDRESS_PATTERN.test(address)
}

export async function installPackage4FormanceSchema(
  context: FormanceContext,
): Promise<FormanceSchemaInstallResult> {
  const startedAt = Date.now()
  try {
    const current = await readSchema(context)
    if (current.kind === 'ready') {
      recordMetric('install_schema', 'replayed', startedAt)
      return Object.freeze({
        kind: 'completed',
        ledger: context.configuration.ledger,
        schemaVersion: current.schemaVersion,
        schemaDigest: current.schemaDigest,
        replayed: true,
      })
    }
    if (current.kind === 'setup_required') return current
    if (current.code !== 'formance_schema_absent') return current

    await ensureLedger(context)
    try {
      await context.sdk.ledger.v2.insertSchema({
        idempotencyKey: PACKAGE4_FORMANCE_SCHEMA_DIGEST.slice('sha256:'.length),
        ledger: context.configuration.ledger,
        version: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
        v2SchemaData: PACKAGE4_FORMANCE_SCHEMA,
      }, NO_RETRY)
    } catch {
      const reconciled = await readSchema(context)
      if (reconciled.kind !== 'ready') return reconciled
    }
    const installed = await readSchema(context)
    if (installed.kind !== 'ready') return installed
    recordMetric('install_schema', 'completed', startedAt)
    return Object.freeze({
      kind: 'completed',
      ledger: context.configuration.ledger,
      schemaVersion: installed.schemaVersion,
      schemaDigest: installed.schemaDigest,
      replayed: false,
    })
  } catch {
    recordMetric('install_schema', 'unavailable', startedAt)
    return Object.freeze({ kind: 'unavailable', code: 'formance_install_unavailable' })
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
  } catch {
    return unavailableHealth('formance_health_unavailable', startedAt)
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
  } catch {
    recordMetric('read_reference', 'unavailable', startedAt)
    return Object.freeze({ kind: 'unavailable', code: 'formance_read_unavailable' })
  }
}

export async function executeFormanceMoneyCommand(
  context: FormanceContext,
  command: FormanceMoneyCommand,
): Promise<FormanceMoneyResult> {
  const startedAt = Date.now()
  const invalid = validateFormanceMoneyCommand(command)
  if (invalid !== undefined) return refused(invalid)
  const schema = await readSchema(context)
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
          purpose_digest: PACKAGE4_FORMANCE_SCHEMA_DIGEST.slice('sha256:'.length),
        },
      },
    }, NO_RETRY)
  } catch (error) {
    if (statusCode(error) !== 409) throw error
  }
}

async function readSchema(context: FormanceContext): Promise<FormanceHealthResult> {
  try {
    const response = await context.sdk.ledger.v2.getSchema({
      ledger: context.configuration.ledger,
      version: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
    }, NO_RETRY)
    const schema = response.v2SchemaResponse?.data
    if (schema === undefined) return Object.freeze({ kind: 'unavailable', code: 'formance_schema_response_invalid' })
    const readbackDigest = schemaReadbackDigest({
      chart: schema.chart,
      queries: schema.queries ?? {},
      transactions: schema.transactions ?? {},
    })
    if (schema.version !== PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion
      || readbackDigest !== PACKAGE4_FORMANCE_SCHEMA_READBACK_DIGEST) {
      return Object.freeze({ kind: 'setup_required', code: 'formance_schema_drift' })
    }
    return Object.freeze({
      kind: 'ready',
      gatewayVersion: PACKAGE4_FORMANCE_REQUIREMENTS.gatewayVersion,
      ledgerVersion: PACKAGE4_FORMANCE_REQUIREMENTS.ledgerVersion,
      schemaVersion: schema.version,
      schemaDigest: PACKAGE4_FORMANCE_SCHEMA_DIGEST,
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

function schemaReadbackDigest(schema: FormanceSchemaData): string {
  return canonicalDigest({
    format: 'ae.package4.formance-schema-readback:v1',
    schema: normalizeSchemaReadback(schema),
  })
}

function normalizeSchemaReadback(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeSchemaReadback)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'dotSelf')
      .map(([key, item]) => [key, normalizeSchemaReadback(item)]),
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

function completed(reference: string, replayed: boolean): FormanceMoneyResult {
  return Object.freeze({ kind: 'completed', transactionRefs: Object.freeze([reference]), replayed })
}

function refused(code: string): FormanceMoneyResult {
  return Object.freeze({ kind: 'refused', code, retryable: false })
}

function unavailable(code: string): FormanceMoneyResult {
  return Object.freeze({ kind: 'unavailable', code, submissionProvenAbsent: true })
}

function unknown(reference: string): FormanceMoneyResult {
  return Object.freeze({
    kind: 'outcome_unknown',
    reference,
    statusRef: `formance-transaction:${reference}`,
  })
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

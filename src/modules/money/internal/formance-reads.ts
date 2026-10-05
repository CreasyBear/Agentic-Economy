"use node"

import { SDK } from '@formance/formance-sdk'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { accountHistoryCursorSchema, type AccountHistoryEntry, type AccountHistoryResult } from './account-history'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { PACKAGE4_FORMANCE_REQUIREMENTS } from './commercial-policy'
import {
  LEGACY_FORMANCE_SCHEMA_VERSION,
  PERIOD_FORMANCE_SCHEMA_VERSION,
  PROMOTIONAL_FORMANCE_SCHEMA_VERSION,
  PLAN_FORMANCE_SCHEMA_VERSION,
  FORMANCE_SCHEMA_VERSION,
  FORMANCE_TEMPLATE_NAMES,
  type FormanceMoneyTemplate,
  type FormanceSchemaData,
  PACKAGE4_FORMANCE_SCHEMA,
  PERIOD_FORMANCE_SCHEMA,
  PROMOTIONAL_FORMANCE_SCHEMA,
  FORMANCE_SCHEMA,
  PLAN_FORMANCE_SCHEMA,
  PACKAGE4_FORMANCE_SCHEMA_DIGEST,
  PERIOD_FORMANCE_SCHEMA_DIGEST,
  PROMOTIONAL_FORMANCE_SCHEMA_DIGEST,
  FORMANCE_SCHEMA_DIGEST,
  PLAN_FORMANCE_SCHEMA_DIGEST,
  LEGACY_FORMANCE_SCHEMA_READBACK_DIGEST,
  PERIOD_FORMANCE_SCHEMA_READBACK_DIGEST,
  PROMOTIONAL_FORMANCE_SCHEMA_READBACK_DIGEST,
  FORMANCE_SCHEMA_READBACK_DIGEST,
  PLAN_FORMANCE_SCHEMA_READBACK_DIGEST,
  schemaReadbackDigest,
} from '../formance-schema'
import {
  ALLOWED_METADATA_KEYS,
  AUD_ASSET,
  COMMAND_REFERENCE_PATTERN,
  DIGEST_PATTERN,
  NO_RETRY,
  canonicalFormanceUnits,
  formanceSafeUnitsFromSdk,
  formanceSignedSafeUnitsFromSdk,
  errorName,
  recordMetric,
  statusCode,
  validFormanceAccountAddress,
  type FormanceAccountReadResult,
  type FormanceContext,
  type FormanceHealthResult,
  type FormancePeriodSpendResult,
  type FormanceReferenceReadResult,
  type FormanceSchemaInstallResult,
  type FormanceSignedAccountReadResult,
  type FormanceStatementPageResult,
} from './formance-config'

export async function installPackage4FormanceSchema(
  context: FormanceContext,
): Promise<FormanceSchemaInstallResult> {
  const startedAt = Date.now()
  try {
    const current = await readSchema(context, FORMANCE_SCHEMA_VERSION)
    const plan = await readSchema(context, PLAN_FORMANCE_SCHEMA_VERSION)
    const promotional = await readSchema(context, PROMOTIONAL_FORMANCE_SCHEMA_VERSION)
    const period = await readSchema(context, PERIOD_FORMANCE_SCHEMA_VERSION)
    const legacy = await readSchema(context, LEGACY_FORMANCE_SCHEMA_VERSION)
    if (current.kind === 'setup_required') return current
    if (plan.kind === 'setup_required') return plan
    if (promotional.kind === 'setup_required') return promotional
    if (period.kind === 'setup_required') return period
    if (legacy.kind === 'setup_required') return legacy
    if (current.kind !== 'ready' && current.code !== 'formance_schema_absent') return current
    if (plan.kind !== 'ready' && plan.code !== 'formance_schema_absent') return plan
    if (promotional.kind !== 'ready' && promotional.code !== 'formance_schema_absent') return promotional
    if (period.kind !== 'ready' && period.code !== 'formance_schema_absent') return period
    if (legacy.kind !== 'ready' && legacy.code !== 'formance_schema_absent') return legacy
    if (current.kind === 'ready' && plan.kind === 'ready' && promotional.kind === 'ready'
      && period.kind === 'ready' && legacy.kind === 'ready') {
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
    if (period.kind !== 'ready') {
      const installedPeriod = await insertSchemaVersion(context, PERIOD_FORMANCE_SCHEMA_VERSION)
      if (installedPeriod.kind !== 'ready') return installedPeriod
    }
    if (promotional.kind !== 'ready') {
      const installedPromotional = await insertSchemaVersion(context, PROMOTIONAL_FORMANCE_SCHEMA_VERSION)
      if (installedPromotional.kind !== 'ready') return installedPromotional
    }
    if (current.kind !== 'ready') {
      const installedCurrent = await insertSchemaVersion(context, FORMANCE_SCHEMA_VERSION)
      if (installedCurrent.kind !== 'ready') return installedCurrent
    }
    if (plan.kind !== 'ready') {
      const installedPlan = await insertSchemaVersion(context, PLAN_FORMANCE_SCHEMA_VERSION)
      if (installedPlan.kind !== 'ready') return installedPlan
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
    // A native reversal invalidates the original posting as financial evidence.
    if (row.reverted === true) return Object.freeze({ kind: 'setup_required', code: 'formance_reference_reverted' })
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

export type LedgerHistoryTransaction = NonNullable<Awaited<ReturnType<SDK['ledger']['v2']['listTransactions']>>['v2TransactionsCursorResponse']>['cursor']['data'][number]
export type HistoryCursor = ReturnType<typeof accountHistoryCursorSchema.parse>

function historyCursorSignature(payload: string, key: string): Buffer {
  return createHmac('sha256', key).update(`ae.account-history-cursor:v1.${payload}`).digest()
}

export function encodeHistoryCursor(payload: HistoryCursor, key: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${historyCursorSignature(encoded, key).toString('base64url')}`
}

export function decodeHistoryCursor(token: string, key: string): HistoryCursor | undefined {
  if (token.length > 4096) return undefined
  const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/u.exec(token)
  if (match?.[1] === undefined || match[2] === undefined) return undefined
  const signature = Buffer.from(match[2], 'base64url')
  if (signature.length !== 32 || !timingSafeEqual(signature, historyCursorSignature(match[1], key))) return undefined
  try {
    const parsed = accountHistoryCursorSchema.safeParse(JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')))
    return parsed.success ? parsed.data : undefined
  } catch (cause) {
    void cause;
    return undefined
  }
}

export function historyTransactionEffect(transaction: LedgerHistoryTransaction, accountDigest: string): AccountHistoryEntry | null | undefined {
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
  const promoReserved = callDigest !== undefined && DIGEST_PATTERN.test(callDigest) ? `calls:${callDigest}:buyer_promo_reserved` : undefined
  const isPromotional = (address: string) => new RegExp(`^accounts:${accountDigest}:promo:[a-f0-9]{64}:available$`, 'u').test(address)
  let credit = 0n
  let document = 0n
  for (const posting of transaction.postings) {
    if (posting.asset !== AUD_ASSET) continue
    const units = formanceSafeUnitsFromSdk(posting.amount)
    if (units === undefined) return undefined
    // Account and Call attribution must agree with the booked addresses.
    if ([posting.source, posting.destination].some((address) =>
      (/^calls:[a-f0-9]{64}:buyer_reserved$/u.test(address) && address !== reserved)
      || (/^accounts:[a-f0-9]{64}:available$/u.test(address) && address !== available)
      || (/^calls:[a-f0-9]{64}:buyer_promo_reserved$/u.test(address) && address !== promoReserved)
      || (/^accounts:[a-f0-9]{64}:promo:[a-f0-9]{64}:available$/u.test(address) && !isPromotional(address)))) return undefined
    const amount = BigInt(units)
    if (posting.destination === available || posting.destination === reserved || posting.destination === promoReserved || isPromotional(posting.destination)) credit += amount
    if (posting.source === available || posting.source === reserved || posting.source === promoReserved || isPromotional(posting.source)) credit -= amount
    if (/^adjustments:[a-f0-9]{64}:buyer$/u.test(posting.destination)) document += amount
    if (/^adjustments:[a-f0-9]{64}:buyer$/u.test(posting.source)) document -= amount
  }
  const kinds: Partial<Record<FormanceMoneyTemplate, AccountHistoryEntry['kind']>> = {
    FUNDING_SETTLED: 'funding', FUNDING_REVERSED: 'funding_reversal',
    BUYER_SALE_SETTLED: 'call_spend', BUYER_SALE_REFUNDED: 'call_refund', CALL_PROMO_REFUNDED: 'promotional_refund', BUYER_ADJUSTED: 'document_adjustment',
    PROMO_GRANTED: 'promotional_grant', PROMO_EXPIRED: 'promotional_expiry', CALL_PROMO_SETTLED: 'promotional_use',
  }
  const template = transaction.template
  const known = FORMANCE_TEMPLATE_NAMES.find((value) => value === template)
  let kind = known === undefined ? 'unmapped' : kinds[known]
  if ((template === 'BUYER_SALE_SETTLED' || template === 'BUYER_SALE_REFUNDED') && credit === 0n && document === 0n && !transaction.reverted) return null
  if (((kind === 'funding' || kind === 'promotional_grant' || kind === 'call_refund' || kind === 'promotional_refund') && (credit <= 0n || document !== 0n))
    || ((kind === 'funding_reversal' || kind === 'call_spend' || kind === 'promotional_expiry' || kind === 'promotional_use') && (credit >= 0n || document !== 0n))
    || (kind === 'document_adjustment' && (credit !== 0n || document === 0n))) kind = 'unmapped'
  // Only known zero-effect internal legs can be omitted. Unknown bookings stay
  // visible and mark coverage partial, even if their credit effect is zero.
  if (kind === undefined && credit === 0n && document === 0n && !transaction.reverted) return null
  const sourceDigest = template === 'BUYER_SALE_SETTLED' || template === 'CALL_PROMO_SETTLED' || template === 'BUYER_SALE_REFUNDED' || template === 'CALL_PROMO_REFUNDED'
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
    || cursor.ledger !== context.configuration.ledger || cursor.scopeDigest !== undefined)) return { kind: 'refused', code: 'account_history_cursor_invalid' }
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
    if (statusCode(error) !== 409 && !isLedgerAlreadyExists(error)) throw error
  }
}

/** Formance Ledger v2 reports an existing ledger as a typed HTTP 400 error. */
function isLedgerAlreadyExists(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'ErrorsV2ErrorResponse'
    && 'statusCode' in error
    && error.statusCode === 400
    && 'errorCode' in error
    && error.errorCode === 'LEDGER_ALREADY_EXISTS'
}

export type SupportedFormanceSchemaVersion =
  | typeof LEGACY_FORMANCE_SCHEMA_VERSION
  | typeof PERIOD_FORMANCE_SCHEMA_VERSION
  | typeof PROMOTIONAL_FORMANCE_SCHEMA_VERSION
  | typeof FORMANCE_SCHEMA_VERSION
  | typeof PLAN_FORMANCE_SCHEMA_VERSION

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
    : version === PERIOD_FORMANCE_SCHEMA_VERSION
      ? {
          version,
          schema: PERIOD_FORMANCE_SCHEMA,
          digest: PERIOD_FORMANCE_SCHEMA_DIGEST,
          readbackDigest: PERIOD_FORMANCE_SCHEMA_READBACK_DIGEST,
        }
      : version === PROMOTIONAL_FORMANCE_SCHEMA_VERSION
        ? {
            version,
            schema: PROMOTIONAL_FORMANCE_SCHEMA,
            digest: PROMOTIONAL_FORMANCE_SCHEMA_DIGEST,
            readbackDigest: PROMOTIONAL_FORMANCE_SCHEMA_READBACK_DIGEST,
          }
        : version === PLAN_FORMANCE_SCHEMA_VERSION
          ? {
              version,
              schema: PLAN_FORMANCE_SCHEMA,
              digest: PLAN_FORMANCE_SCHEMA_DIGEST,
              readbackDigest: PLAN_FORMANCE_SCHEMA_READBACK_DIGEST,
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

export async function readSchema(
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

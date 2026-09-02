"use node"

import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  canonicalFormanceUnits,
  executeFormanceMoneyCommand,
  formanceMonetaryVariable,
  readFormanceAccount,
  readFormanceTransactionByReference,
  type FormanceContext,
  type FormanceMoneyCommand,
  type FormanceMoneyResult,
} from './formance'
import { PACKAGE4_FORMANCE_REQUIREMENTS } from './internal/commercial-policy'

const SHA256 = /^sha256:[a-f0-9]{64}$/u
const BOUNDED_REFERENCE = /^[\u0020-\u007e]{1,500}$/u

export type FormanceFundingBooking = Readonly<{
  commandRef: string
  idempotencyKey: string
  accountRef: string
  processorRef: string
  principalUnits: string
  serviceFeeUnits: string
  taxUnits: string
  totalUnits: string
  policyDigest: string
  externalEvidenceDigest: string
}>

export type FormanceCapacityKind =
  | 'agent_budget'
  | 'legal_customer_exposure'
  | 'treasury_usdc'

export type FormanceBalanceKind = 'account_aud' | FormanceCapacityKind

export type FormanceCapacitySync = Readonly<{
  commandRef: string
  idempotencyKey: string
  kind: FormanceCapacityKind
  subjectRef: string
  generation: number
  targetUnits: string
  policyDigest: string
  externalEvidenceDigest: string
}>

export type FormanceDisplayBalanceResult =
  | Readonly<{
      kind: 'available'
      balanceKind: FormanceBalanceKind
      subjectRef: string
      generation?: number
      currency: 'AUD' | 'USDC'
      exponent: 6
      units: string
      observedAt: number
      source: 'formance_live_read'
      authoritativeForConsequences: false
    }>
  | Readonly<{ kind: 'setup_required'; code: string }>
  | Readonly<{ kind: 'unavailable'; code: string }>

export type FormanceLegalCustomerRebindResult =
  | Readonly<{ kind: 'allowed' }>
  | Readonly<{
      kind: 'refused'
      code: 'legal_customer_capacity_reserved' | 'legal_customer_calls_pending'
    }>
  | Readonly<{ kind: 'setup_required'; code: string }>
  | Readonly<{ kind: 'unavailable'; code: string }>

type PreparedCommand =
  | Readonly<{ kind: 'prepared'; command: FormanceMoneyCommand }>
  | Readonly<{ kind: 'refused'; code: string; retryable: false }>

export function prepareFormanceFundingSettlement(input: FormanceFundingBooking): PreparedCommand {
  return prepareFundingCommand('FUNDING_SETTLED', 'funding', input)
}

export function prepareFormanceFundingReversal(input: FormanceFundingBooking): PreparedCommand {
  return prepareFundingCommand('FUNDING_REVERSED', 'funding-reversal', input)
}

export async function bookFormanceFundingSettlement(
  context: FormanceContext,
  input: FormanceFundingBooking,
): Promise<FormanceMoneyResult> {
  return executePrepared(context, prepareFormanceFundingSettlement(input))
}

export async function bookFormanceFundingReversal(
  context: FormanceContext,
  input: FormanceFundingBooking,
): Promise<FormanceMoneyResult> {
  return executePrepared(context, prepareFormanceFundingReversal(input))
}

export async function syncFormanceCapacity(
  context: FormanceContext,
  input: FormanceCapacitySync,
): Promise<FormanceMoneyResult> {
  const semantic = capacitySemantic(input)
  if (semantic === undefined) return refused('formance_capacity_input_invalid')
  const generationIdentity = {
    kind: input.kind,
    subjectRef: input.subjectRef,
    generation: input.generation,
  }
  const reference = formanceReference(generationIdentity, 'capacity')
  const idempotencyDigest = digestValue('capacity-idempotency', generationIdentity)
  const commandDigest = digestValue('capacity-command', semantic)
  const existing = await readFormanceTransactionByReference(context, reference)
  if (existing.kind === 'found') {
    return existing.template === 'TREASURY_CAPACITY_SYNCED'
      && existing.metadata.command_digest === commandDigest
      && existing.metadata.idempotency_digest === idempotencyDigest
      ? completed(reference, true)
      : refused('formance_reference_conflict')
  }
  if (existing.kind === 'setup_required') return refused(existing.code)
  if (existing.kind === 'unavailable') return unavailable(existing.code)

  const account = capacityAccount(input.kind, input.subjectRef, input.generation)
  const asset = capacityAsset(input.kind)
  const amount = `${asset} ${input.targetUnits}`
  const subjectDigest = digestReference(input.kind, input.subjectRef)
  const metadata = {
    command_digest: commandDigest,
    idempotency_digest: idempotencyDigest,
    external_evidence_digest: stripDigest(input.externalEvidenceDigest),
    policy_digest: stripDigest(input.policyDigest),
    ...(input.kind === 'agent_budget' ? { principal_digest: subjectDigest } : {}),
    ...(input.kind === 'legal_customer_exposure'
      ? { legal_customer_digest: subjectDigest }
      : {}),
  }
  return await executeFormanceMoneyCommand(context, {
    commandRef: reference,
    idempotencyKey: idempotencyDigest,
    schemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
    template: 'TREASURY_CAPACITY_SYNCED',
    variables: {
      capacity: account,
      amount,
    },
    metadata,
  })
}

export async function readFormanceDisplayBalance(
  context: FormanceContext,
  input: Readonly<{
    balanceKind: FormanceBalanceKind
    subjectRef: string
    generation?: number
    now?: number
  }>,
): Promise<FormanceDisplayBalanceResult> {
  if (!boundedReference(input.subjectRef)) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_balance_subject_invalid' })
  }
  if (input.balanceKind !== 'account_aud' && !positiveGeneration(input.generation)) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_balance_generation_invalid' })
  }
  const observedAt = input.now ?? Date.now()
  if (!Number.isSafeInteger(observedAt) || observedAt < 0) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_balance_time_invalid' })
  }
  const address = balanceAccount(input.balanceKind, input.subjectRef, input.generation)
  const asset = balanceAsset(input.balanceKind)
  const read = await readFormanceAccount(context, address)
  if (read.kind === 'setup_required' || read.kind === 'unavailable') return read
  const units = read.kind === 'not_found' ? '0' : read.volumes[asset]?.balanceUnits ?? '0'
  return Object.freeze({
    kind: 'available',
    balanceKind: input.balanceKind,
    subjectRef: input.subjectRef,
    ...(input.generation === undefined ? {} : { generation: input.generation }),
    currency: asset === 'AUD/6' ? 'AUD' : 'USDC',
    exponent: 6,
    units,
    observedAt,
    source: 'formance_live_read',
    authoritativeForConsequences: false,
  })
}

export async function canRebindFormanceLegalCustomer(
  context: FormanceContext,
  input: Readonly<{
    legalCustomerRef: string
    generation: number
    pendingCallCount: number
  }>,
): Promise<FormanceLegalCustomerRebindResult> {
  if (!boundedReference(input.legalCustomerRef)
    || !positiveGeneration(input.generation)
    || !Number.isSafeInteger(input.pendingCallCount)
    || input.pendingCallCount < 0) {
    return Object.freeze({ kind: 'setup_required', code: 'legal_customer_rebind_input_invalid' })
  }
  if (input.pendingCallCount > 0) {
    return Object.freeze({ kind: 'refused', code: 'legal_customer_calls_pending' })
  }
  const read = await readFormanceAccount(
    context,
    capacityAccount('legal_customer_exposure', input.legalCustomerRef, input.generation).replace(
      /:exposure_available$/u,
      ':exposure_reserved',
    ),
  )
  if (read.kind === 'setup_required' || read.kind === 'unavailable') return read
  const reserved = read.kind === 'not_found' ? '0' : read.volumes['AUD/6']?.balanceUnits ?? '0'
  return reserved === '0'
    ? Object.freeze({ kind: 'allowed' })
    : Object.freeze({ kind: 'refused', code: 'legal_customer_capacity_reserved' })
}

function prepareFundingCommand(
  template: 'FUNDING_SETTLED' | 'FUNDING_REVERSED',
  suffix: 'funding' | 'funding-reversal',
  input: FormanceFundingBooking,
): PreparedCommand {
  const semantic = fundingSemantic(input)
  if (semantic === undefined) return refused('formance_funding_input_invalid')
  const principalAmount = formanceMonetaryVariable('AUD', input.principalUnits)
  const serviceFeeAmount = formanceMonetaryVariable('AUD', input.serviceFeeUnits)
  const taxAmount = formanceMonetaryVariable('AUD', input.taxUnits)
  const totalAmount = formanceMonetaryVariable('AUD', input.totalUnits)
  if (principalAmount === undefined
    || serviceFeeAmount === undefined
    || taxAmount === undefined
    || totalAmount === undefined) return refused('formance_funding_amount_invalid')
  const accountDigest = digestReference('account', input.accountRef)
  const processorDigest = digestReference('processor', input.processorRef)
  const idempotencyDigest = digestValue('idempotency', input.idempotencyKey)
  const commandDigest = digestValue(`${template}:command`, semantic)
  return Object.freeze({
    kind: 'prepared',
    command: Object.freeze({
      commandRef: formanceReference(input.commandRef, suffix),
      idempotencyKey: idempotencyDigest,
      schemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
      template,
      variables: Object.freeze({
        processor: `processor:${processorDigest}:settlement`,
        account: `accounts:${accountDigest}:available`,
        revenue: 'platform:revenue:sales',
        tax: 'platform:tax:gst',
        principal_amount: principalAmount,
        service_fee_amount: serviceFeeAmount,
        tax_amount: taxAmount,
        total_amount: totalAmount,
      }),
      metadata: Object.freeze({
        account_digest: accountDigest,
        command_digest: commandDigest,
        external_evidence_digest: stripDigest(input.externalEvidenceDigest),
        idempotency_digest: idempotencyDigest,
        policy_digest: stripDigest(input.policyDigest),
      }),
    }),
  })
}

function fundingSemantic(input: FormanceFundingBooking) {
  if (!boundedReference(input.commandRef)
    || !boundedReference(input.idempotencyKey)
    || !boundedReference(input.accountRef)
    || !boundedReference(input.processorRef)
    || !SHA256.test(input.policyDigest)
    || !SHA256.test(input.externalEvidenceDigest)) return undefined
  const amounts = [
    input.principalUnits,
    input.serviceFeeUnits,
    input.taxUnits,
    input.totalUnits,
  ]
  if (amounts.some((amount) => canonicalFormanceUnits(amount) === undefined)) return undefined
  if (BigInt(input.principalUnits) + BigInt(input.serviceFeeUnits) + BigInt(input.taxUnits)
    !== BigInt(input.totalUnits)) return undefined
  return Object.freeze({
    format: 'ae.formance-funding-booking:v1',
    ...input,
  })
}

function capacitySemantic(input: FormanceCapacitySync) {
  if (!boundedReference(input.commandRef)
    || !boundedReference(input.idempotencyKey)
    || !boundedReference(input.subjectRef)
    || !positiveGeneration(input.generation)
    || !SHA256.test(input.policyDigest)
    || !SHA256.test(input.externalEvidenceDigest)
    || canonicalFormanceUnits(input.targetUnits) === undefined) return undefined
  return Object.freeze({ format: 'ae.formance-capacity-sync:v1', ...input })
}

function balanceAccount(
  kind: FormanceBalanceKind,
  subjectRef: string,
  generation: number | undefined,
): string {
  if (kind === 'account_aud') {
    return `accounts:${digestReference('account', subjectRef)}:available`
  }
  return capacityAccount(kind, subjectRef, generation!)
}

function capacityAccount(kind: FormanceCapacityKind, subjectRef: string, generation: number): string {
  const digest = digestReference(kind, { subjectRef, generation })
  if (kind === 'agent_budget') return `agents:${digest}:budget_available`
  if (kind === 'legal_customer_exposure') {
    return `legal_customers:${digest}:exposure_available`
  }
  return `treasury:corporate:${digest}:available`
}

function balanceAsset(kind: FormanceBalanceKind): 'AUD/6' | 'USDC/6' {
  return kind === 'treasury_usdc' ? 'USDC/6' : 'AUD/6'
}

function capacityAsset(kind: FormanceCapacityKind): 'AUD/6' | 'USDC/6' {
  return balanceAsset(kind)
}

function formanceReference(commandIdentity: unknown, suffix: string): string {
  return `ae-p4:${digestValue('transaction-reference', commandIdentity)}:${suffix}`
}

function digestReference(kind: string, reference: unknown): string {
  return digestValue('account-segment', { kind, reference })
}

function digestValue(kind: string, value: unknown): string {
  return stripDigest(canonicalDigest({ format: `ae.formance-${kind}:v1`, value }))
}

function stripDigest(value: string): string {
  return value.slice('sha256:'.length)
}

function boundedReference(value: string): boolean {
  return value === value.trim() && BOUNDED_REFERENCE.test(value)
}

function positiveGeneration(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0
}

async function executePrepared(
  context: FormanceContext,
  prepared: PreparedCommand,
): Promise<FormanceMoneyResult> {
  return prepared.kind === 'refused'
    ? prepared
    : await executeFormanceMoneyCommand(context, prepared.command)
}

function completed(reference: string, replayed: boolean): FormanceMoneyResult {
  return Object.freeze({ kind: 'completed', transactionRefs: Object.freeze([reference]), replayed })
}

function refused(code: string): Readonly<{ kind: 'refused'; code: string; retryable: false }> {
  return Object.freeze({ kind: 'refused', code, retryable: false })
}

function unavailable(code: string): FormanceMoneyResult {
  return Object.freeze({ kind: 'unavailable', code, submissionProvenAbsent: true })
}

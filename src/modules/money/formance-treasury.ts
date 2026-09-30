"use node"

import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import {
  canonicalFormanceUnits,
  executeFormanceMoneyCommand,
  executeFormanceMoneyBulk,
  readFormanceHealth,
  PROMOTIONAL_FORMANCE_SCHEMA_VERSION,
  readFormanceAccount,
  readFormanceTransactionByReference,
  type FormanceContext,
  type FormanceMoneyCommand,
  type FormanceMoneyResult,
} from './formance'
import { refused, unknown, type FormanceRefused } from './formance-result'
import type { TreasuryBatch, TreasuryIdentity } from './treasury'
import { capacityAccount, formanceReference, prepareFormanceCapacitySync } from './internal/formance-transaction-templates'

const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,499}$/u
const ADDRESS = /^0x[0-9a-fA-F]{40}$/u
const HASH = /^0x[0-9a-fA-F]{64}$/u
// Money's admission pair; importing supply here would reverse its dependency.
const USDC_LANES = {
  sandbox: { network: 'eip155:84532', asset: '0x036cbd53842c5426634e7929541ec2318f3dcf7e' },
  production: { network: 'eip155:8453', asset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' },
} as const

export type FormanceTreasuryBalanceSubject = Readonly<{
  custodyRef: string
  custodyGeneration: number
}>

export type FormanceTreasuryDeposit = FormanceTreasuryBalanceSubject & Readonly<{
  environment: 'sandbox' | 'production'
  network: string
  asset: string
  payer: string
  recipient: string
  transactionHash: string
  logIndex: number
  blockHash: string
  blockNumber: string
  amountUnits: string
  observationRef: string
  evidenceDigest: string
}>

export type PreparedFormanceTreasuryDeposit =
  | Readonly<{ kind: 'prepared'; command: FormanceMoneyCommand }>
  | FormanceRefused

/**
 * CONTRACT: prepare/bookFormanceTreasuryDeposit
 * Requires: trusted verified incoming Transfer evidence for the supported USDC
 * lane and custody destination; this leaf validates shape, not chain truth.
 * Ensures: one world -> custody available posting for the exact positive amount;
 * completed means the reference, template, metadata and posting were read back.
 * Invariant: identity is environment/network/asset/transaction/log, never polling
 * observation or custody generation. Changed immutable evidence/target conflicts.
 * On violation: refuse before submission. Ambiguous post-write readback remains
 * outcome_unknown. Retry uses the same native key, including after local failure.
 * Mutation: ledger credit is non-idempotent naturally; native reference/key and
 * exact command digest protect concurrent submissions and permanent replays.
 * Complexity: one leaf owns transfer validation, identity and readback; it reuses
 * the native executor/template rather than adding a schema or second dedup store.
 */
export function prepareFormanceTreasuryDeposit(input: FormanceTreasuryDeposit): PreparedFormanceTreasuryDeposit {
  const lane = USDC_LANES[input.environment]
  if (lane === undefined
    || !validSubject(input)
    || input.network !== lane.network
    || !ADDRESS.test(input.asset)
    || input.asset.toLowerCase() !== lane.asset
    || !ADDRESS.test(input.payer)
    || !ADDRESS.test(input.recipient)
    || input.payer.toLowerCase() === input.recipient.toLowerCase()
    || !HASH.test(input.transactionHash)
    || !HASH.test(input.blockHash)
    || !Number.isSafeInteger(input.logIndex) || input.logIndex < 0
    || canonicalFormanceUnits(input.blockNumber, false) === undefined
    || canonicalFormanceUnits(input.amountUnits) === undefined
    || !REFERENCE.test(input.observationRef)
    || !isCanonicalDigest(input.evidenceDigest)) {
    return refused('formance_treasury_deposit_input_invalid')
  }
  const identity = {
    environment: input.environment,
    network: input.network,
    asset: input.asset.toLowerCase(),
    transactionHash: input.transactionHash.toLowerCase(),
    logIndex: input.logIndex,
  }
  // observationRef is polling provenance, retained by the caller's observation;
  // it is deliberately excluded from the immutable native command material.
  const semantic = {
    ...identity,
    custodyRef: input.custodyRef,
    custodyGeneration: input.custodyGeneration,
    payer: input.payer.toLowerCase(),
    recipient: input.recipient.toLowerCase(),
    blockHash: input.blockHash.toLowerCase(),
    blockNumber: input.blockNumber,
    amountUnits: input.amountUnits,
    evidenceDigest: input.evidenceDigest,
  }
  const idempotencyDigest = canonicalDigest({ format: 'ae.formance-treasury-deposit-idempotency:v1', identity }).slice(7)
  return Object.freeze({
    kind: 'prepared',
    command: Object.freeze({
      commandRef: formanceReference(identity, 'treasury-deposit'),
      idempotencyKey: idempotencyDigest,
      schemaVersion: PROMOTIONAL_FORMANCE_SCHEMA_VERSION,
      template: 'TREASURY_CAPACITY_SYNCED',
      variables: Object.freeze({
        capacity: capacityAccount('treasury_usdc', input.custodyRef, input.custodyGeneration),
        amount: `USDC/6 ${input.amountUnits}`,
      }),
      metadata: Object.freeze({
        command_digest: canonicalDigest({ format: 'ae.formance-treasury-deposit:v1', semantic }).slice(7),
        idempotency_digest: idempotencyDigest,
        external_evidence_digest: input.evidenceDigest.slice(7),
      }),
    }),
  })
}

export async function bookFormanceTreasuryDeposit(
  context: FormanceContext,
  input: FormanceTreasuryDeposit,
): Promise<FormanceMoneyResult> {
  const prepared = prepareFormanceTreasuryDeposit(input)
  if (prepared.kind === 'refused') return prepared
  if (context.configuration.environment !== input.environment) {
    return refused('formance_treasury_environment_mismatch')
  }
  const result = await executeFormanceMoneyCommand(context, prepared.command)
  if (result.kind !== 'completed') return result
  const readback = await readFormanceTransactionByReference(context, prepared.command.commandRef)
  if (readback.kind === 'unavailable' || readback.kind === 'absent') return unknown(prepared.command.commandRef)
  if (readback.kind === 'setup_required') return refused(readback.code)
  const posting = readback.postings[0]
  if (readback.reference !== prepared.command.commandRef
    || readback.template !== prepared.command.template
    || !Object.entries(prepared.command.metadata).every(([key, value]) => readback.metadata[key] === value)
    || readback.postings.length !== 1
    || posting?.source !== 'world'
    || posting.destination !== prepared.command.variables.capacity
    || posting.asset !== 'USDC/6'
    || posting.amountUnits !== input.amountUnits) return refused('formance_treasury_deposit_evidence_conflict')
  return result
}

export type FormanceTreasuryBalancesResult =
  | (FormanceTreasuryBalanceSubject & Readonly<{
      kind: 'available'
      currency: 'USDC'
      exponent: 6
      availableUnits: string
      committedUnits: string
      bufferUnits: string
      hasActivity: boolean
      source: 'formance_live_read'
      authoritativeForConsequences: false
    }>)
  | Readonly<{ kind: 'setup_required' | 'unavailable'; code: string }>

/** Exact independent account reads; no shared snapshot or admission guarantee. */
export async function readFormanceTreasuryBalances(
  context: FormanceContext,
  subject: FormanceTreasuryBalanceSubject,
): Promise<FormanceTreasuryBalancesResult> {
  if (!validSubject(subject)) return { kind: 'setup_required', code: 'formance_treasury_subject_invalid' }
  const availableAddress = capacityAccount('treasury_usdc', subject.custodyRef, subject.custodyGeneration)
  const [available, committed, buffer] = await Promise.all([
    readFormanceAccount(context, availableAddress),
    readFormanceAccount(context, availableAddress.replace(/:available$/u, ':committed')),
    readFormanceAccount(context, treasuryBufferAccount(subject)),
  ])
  if (available.kind === 'setup_required' || available.kind === 'unavailable') return available
  if (committed.kind === 'setup_required' || committed.kind === 'unavailable') return committed
  if (buffer.kind === 'setup_required' || buffer.kind === 'unavailable') return buffer
  return Object.freeze({
    kind: 'available',
    custodyRef: subject.custodyRef,
    custodyGeneration: subject.custodyGeneration,
    currency: 'USDC',
    exponent: 6,
    availableUnits: available.kind === 'not_found' ? '0' : available.volumes['USDC/6']?.balanceUnits ?? '0',
    committedUnits: committed.kind === 'not_found' ? '0' : committed.volumes['USDC/6']?.balanceUnits ?? '0',
    bufferUnits: buffer.kind === 'not_found' ? '0' : buffer.volumes['USDC/6']?.balanceUnits ?? '0',
    hasActivity: [available, committed, buffer].some(account => account.kind === 'completed'
      && Object.values(account.volumes).some(volume => BigInt(volume.inputUnits) > 0n || BigInt(volume.outputUnits) > 0n)),
    source: 'formance_live_read',
    authoritativeForConsequences: false,
  })
}

/** Separate native account: buffer is corporate cash, never a Call liability. */
export function treasuryBufferAccount(subject: FormanceTreasuryBalanceSubject): string {
  const digest = canonicalDigest({ kind: 'ae.treasury-buffer-account:v1',
    custodyRef: subject.custodyRef, custodyGeneration: subject.custodyGeneration }).slice(7)
  return `treasury:corporate:${digest}:committed`
}

/**
 * Requires an immutable, cursor-owned range and buffer plan. Ensures full incoming
 * cash and its protected buffer commit atomically. A racing Call sees either the
 * old available amount or the net credit after buffer; never the gross credit.
 * Retry uses the same native identities and exact posting readback. On ambiguity,
 * retain the pending range. Existing v1.5 chart/templates suffice; no ledger fork.
 */
export function prepareFormanceTreasuryBatch(identity: TreasuryIdentity, batch: TreasuryBatch):
  Readonly<{ kind: 'prepared'; commands: readonly FormanceMoneyCommand[] }> | FormanceRefused {
  if (identity.custodyRef !== batch.custodyRef || identity.custodyGeneration !== batch.custodyGeneration
    || !validSubject(identity) || canonicalFormanceUnits(identity.bufferTargetUnits, false) === undefined
    || canonicalFormanceUnits(batch.previousBufferUnits, false) === undefined
    || canonicalFormanceUnits(batch.bufferIncreaseUnits, false) === undefined
    || BigInt(batch.previousBufferUnits) + BigInt(batch.bufferIncreaseUnits) > BigInt(identity.bufferTargetUnits)) {
    return refused('formance_treasury_batch_invalid')
  }
  const commands: FormanceMoneyCommand[] = []
  const incoming = batch.previousCheckpoint === null ? [] : batch.observation.transfers.filter(transfer =>
    transfer.recipient === identity.address && transfer.payer !== identity.address && BigInt(transfer.amountUnits) > 0n)
  const creditedUnits = batch.previousCheckpoint === null ? BigInt(batch.observation.checkpoint.balanceUnits)
    : incoming.reduce((total, transfer) => total + BigInt(transfer.amountUnits), 0n)
  const remainingBuffer = BigInt(identity.bufferTargetUnits) - BigInt(batch.previousBufferUnits)
  if (BigInt(batch.bufferIncreaseUnits) !== (creditedUnits < remainingBuffer ? creditedUnits : remainingBuffer)) {
    return refused('formance_treasury_buffer_plan_invalid')
  }
  if (batch.previousCheckpoint === null && creditedUnits > 0n) {
    const prepared = prepareFormanceCapacitySync({ kind: 'treasury_usdc', subjectRef: identity.custodyRef,
      generation: identity.custodyGeneration, commandRef: batch.batchRef, idempotencyKey: batch.batchRef,
      targetUnits: creditedUnits.toString(), policyDigest: canonicalDigest({ kind: 'ae.treasury-opening:v1', ...identity }),
      externalEvidenceDigest: canonicalDigest({ kind: 'ae.treasury-opening-evidence:v1', ...identity,
        checkpoint: batch.observation.checkpoint }),
    })
    if (prepared.kind !== 'prepared') return prepared
    commands.push(prepared.command)
  }
  for (const transfer of incoming) {
    const prepared = prepareFormanceTreasuryDeposit({ ...identity, ...transfer, observationRef: batch.batchRef })
    if (prepared.kind !== 'prepared') return prepared
    commands.push(prepared.command)
  }
  if (BigInt(batch.bufferIncreaseUnits) > 0n) {
    const material = { kind: 'ae.treasury-buffer:v1', environment: identity.environment, custodyRef: identity.custodyRef,
      custodyGeneration: identity.custodyGeneration, batchRef: batch.batchRef, targetUnits: identity.bufferTargetUnits,
      previousUnits: batch.previousBufferUnits, amountUnits: batch.bufferIncreaseUnits }
    const digest = canonicalDigest(material).slice(7)
    commands.push({ commandRef: formanceReference(material, 'treasury-buffer'), idempotencyKey: digest,
      schemaVersion: PROMOTIONAL_FORMANCE_SCHEMA_VERSION, template: 'CALL_RESERVED_USDC',
      variables: { source: capacityAccount('treasury_usdc', identity.custodyRef, identity.custodyGeneration),
        destination: treasuryBufferAccount(identity), amount: `USDC/6 ${batch.bufferIncreaseUnits}` },
      metadata: { command_digest: digest, idempotency_digest: digest },
    })
  }
  return { kind: 'prepared', commands }
}

export async function bookFormanceTreasuryBatch(context: FormanceContext,
  identity: TreasuryIdentity, batch: TreasuryBatch): Promise<FormanceMoneyResult> {
  if (context.configuration.environment !== identity.environment) return refused('formance_treasury_environment_mismatch')
  const prepared = prepareFormanceTreasuryBatch(identity, batch)
  if (prepared.kind !== 'prepared') return prepared
  const commands = prepared.commands
  if (batch.previousCheckpoint === null) {
    // Empty accounts alone do not prove the ledger exists: unknown 404s can be
    // gateway/ledger failures. Validate health/schema before a zero checkpoint.
    if (commands.length === 0) {
      const health = await readFormanceHealth(context)
      if (health.kind !== 'ready') return refused(health.code)
    }
    const opening = commands[0]
    const prior = opening === undefined ? { kind: 'absent' as const }
      : await readFormanceTransactionByReference(context, opening.commandRef)
    if (prior.kind === 'unavailable') return unknown(batch.batchRef)
    if (prior.kind === 'setup_required') return refused(prior.code)
    if (prior.kind === 'absent') {
      const balances = await readFormanceTreasuryBalances(context, identity)
      if (balances.kind !== 'available') return refused(balances.code)
      if (balances.hasActivity) return refused('treasury_legacy_cutover_required')
    }
  }
  if (batch.previousCheckpoint !== null) {
    const before = await readFormanceTreasuryBalances(context, identity)
    if (before.kind !== 'available') return refused(before.code)
    if (before.bufferUnits !== batch.previousBufferUnits) {
      // A peer may already have committed this same atomic range. A new ledger
      // or an altered buffer must never receive unprotected gross credits.
      const replay = await verifyTreasuryCommands(context, commands)
      if (replay.kind === 'completed'
        && BigInt(before.bufferUnits) >= BigInt(batch.previousBufferUnits) + BigInt(batch.bufferIncreaseUnits)) return replay
      return refused('treasury_buffer_continuity_conflict')
    }
  }
  const firstCommand = commands[0]
  const posted: FormanceMoneyResult = firstCommand === undefined ? { kind: 'completed', transactionRefs: [], replayed: false }
    : commands.length === 1 ? await executeFormanceMoneyCommand(context, firstCommand)
      : await executeFormanceMoneyBulk(context, { commands })
  if (posted.kind !== 'completed') return posted
  const verified = await verifyTreasuryCommands(context, commands)
  if (verified.kind !== 'completed') return verified
  const after = await readFormanceTreasuryBalances(context, identity)
  if (after.kind !== 'available') return refused(after.code)
  if (BigInt(after.bufferUnits) < BigInt(batch.previousBufferUnits) + BigInt(batch.bufferIncreaseUnits)) {
    return refused('treasury_buffer_continuity_conflict')
  }
  return posted
}

async function verifyTreasuryCommands(context: FormanceContext, commands: readonly FormanceMoneyCommand[]): Promise<FormanceMoneyResult> {
  for (const command of commands) {
    const readback = await readFormanceTransactionByReference(context, command.commandRef)
    if (readback.kind === 'unavailable' || readback.kind === 'absent') return unknown(command.commandRef)
    if (readback.kind === 'setup_required') return refused(readback.code)
    const posting = readback.postings[0]
    const credit = command.template === 'TREASURY_CAPACITY_SYNCED'
    if (readback.reference !== command.commandRef || readback.template !== command.template
      || Object.entries(command.metadata).some(([key, value]) => readback.metadata[key] !== value)
      || readback.postings.length !== 1 || posting?.asset !== 'USDC/6'
      || posting.source !== (credit ? 'world' : command.variables.source)
      || posting.destination !== (credit ? command.variables.capacity : command.variables.destination)
      || posting.amountUnits !== command.variables.amount?.split(' ')[1]) return refused('treasury_posting_evidence_conflict')
  }
  return { kind: 'completed', transactionRefs: commands.map(command => command.commandRef), replayed: true }
}

function validSubject(subject: FormanceTreasuryBalanceSubject): boolean {
  return REFERENCE.test(subject.custodyRef)
    && Number.isSafeInteger(subject.custodyGeneration) && subject.custodyGeneration > 0
}

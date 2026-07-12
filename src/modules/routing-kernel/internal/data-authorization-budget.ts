export type DisclosureAttempt = Readonly<{
  disclosureGrantId: string
  rootRunId: string
  leafRunId: string
  attempt: number
  recipientBindingId: string
  purpose: string
  fields: readonly string[]
  projectionDigest: string
  disposition: 'not_released' | 'released' | 'indeterminate'
  consumedAt: number
  resolvedAt?: number
}>

export type DataAuthorizationBudget = Readonly<{
  dataAuthorizationBudgetRef: string
  sourceGrantId: string
  agentId: string
  principalId: string
  networkId: string
  protectedFieldSetId: string
  permittedFields: readonly string[]
  permittedRecipientBindingIds: readonly string[]
  permittedPurposes: readonly string[]
  maximumAttempts: number
  maximumExposures: number
  consumedAttempts: number
  consumedExposures: number
  expiresAt: number
  status: 'active' | 'revoked'
  revision: number
  attempts: readonly DisclosureAttempt[]
}>

type CreateInput = Omit<DataAuthorizationBudget, 'consumedAttempts' | 'consumedExposures' | 'status' | 'revision' | 'attempts'>
type ConsumeInput = Omit<DisclosureAttempt, 'disposition' | 'consumedAt' | 'resolvedAt'> & Readonly<{ now: number }>

type Refusal =
  | 'data_authorization_expired'
  | 'data_authorization_revoked'
  | 'disclosure_attempt_capacity_exceeded'
  | 'disclosure_exposure_capacity_exceeded'
  | 'disclosure_field_not_permitted'
  | 'disclosure_recipient_not_permitted'
  | 'disclosure_purpose_not_permitted'
  | 'disclosure_grant_conflict'
  | 'disclosure_input_invalid'

export type ConsumeDisclosureResult =
  | Readonly<{ kind: 'consumed'; budget: DataAuthorizationBudget; attempt: DisclosureAttempt }>
  | Readonly<{ kind: 'refused'; reason: Refusal }>

export function createDataAuthorizationBudget(input: CreateInput): DataAuthorizationBudget {
  if (!validLimit(input.maximumAttempts) || !validLimit(input.maximumExposures)) throw new Error('data_authorization_limit_invalid')
  if (input.permittedFields.length === 0 || input.permittedRecipientBindingIds.length === 0 || input.permittedPurposes.length === 0) {
    throw new Error('data_authorization_scope_empty')
  }
  return Object.freeze({
    ...input,
    permittedFields: sortedUnique(input.permittedFields),
    permittedRecipientBindingIds: sortedUnique(input.permittedRecipientBindingIds),
    permittedPurposes: sortedUnique(input.permittedPurposes),
    consumedAttempts: 0,
    consumedExposures: 0,
    status: 'active' as const,
    revision: 0,
    attempts: Object.freeze([]),
  })
}

export function consumeDisclosureGrant(budget: DataAuthorizationBudget, input: ConsumeInput): ConsumeDisclosureResult {
  const fields = sortedUnique(input.fields)
  const existing = budget.attempts.find((attempt) => attempt.disclosureGrantId === input.disclosureGrantId)
  if (existing !== undefined) {
    return sameAttempt(existing, input, fields)
      ? { kind: 'consumed', budget, attempt: existing }
      : refused('disclosure_grant_conflict')
  }
  if (budget.status !== 'active') return refused('data_authorization_revoked')
  if (budget.expiresAt <= input.now) return refused('data_authorization_expired')
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1 || fields.length === 0 || input.projectionDigest.length === 0) return refused('disclosure_input_invalid')
  if (fields.some((field) => !budget.permittedFields.includes(field))) return refused('disclosure_field_not_permitted')
  if (!budget.permittedRecipientBindingIds.includes(input.recipientBindingId)) return refused('disclosure_recipient_not_permitted')
  if (!budget.permittedPurposes.includes(input.purpose)) return refused('disclosure_purpose_not_permitted')
  if (budget.consumedAttempts >= budget.maximumAttempts) return refused('disclosure_attempt_capacity_exceeded')
  if (budget.consumedExposures >= budget.maximumExposures) return refused('disclosure_exposure_capacity_exceeded')

  const attempt = Object.freeze({
    disclosureGrantId: input.disclosureGrantId,
    rootRunId: input.rootRunId,
    leafRunId: input.leafRunId,
    attempt: input.attempt,
    recipientBindingId: input.recipientBindingId,
    purpose: input.purpose,
    fields,
    projectionDigest: input.projectionDigest,
    disposition: 'indeterminate' as const,
    consumedAt: input.now,
  })
  return {
    kind: 'consumed',
    attempt,
    budget: Object.freeze({
      ...budget,
      consumedAttempts: budget.consumedAttempts + 1,
      consumedExposures: budget.consumedExposures + 1,
      revision: budget.revision + 1,
      attempts: Object.freeze([...budget.attempts, attempt]),
    }),
  }
}

export function resolveDisclosureAttempt(
  budget: DataAuthorizationBudget,
  input: Readonly<{ disclosureGrantId: string; disposition: 'not_released' | 'released'; now: number }>,
): Readonly<{ kind: 'resolved'; budget: DataAuthorizationBudget; attempt: DisclosureAttempt }> | Readonly<{ kind: 'refused'; reason: 'disclosure_attempt_not_found' | 'disclosure_attempt_already_resolved' }> {
  const index = budget.attempts.findIndex((attempt) => attempt.disclosureGrantId === input.disclosureGrantId)
  if (index < 0) return { kind: 'refused', reason: 'disclosure_attempt_not_found' }
  const current = budget.attempts.at(index)
  if (current === undefined) return { kind: 'refused', reason: 'disclosure_attempt_not_found' }
  if (current.disposition !== 'indeterminate') return { kind: 'refused', reason: 'disclosure_attempt_already_resolved' }
  const attempt = Object.freeze({ ...current, disposition: input.disposition, resolvedAt: input.now })
  const attempts = [...budget.attempts]
  attempts[index] = attempt
  const resolved = Object.freeze({
    ...budget,
    consumedExposures: budget.consumedExposures - (input.disposition === 'not_released' ? 1 : 0),
    revision: budget.revision + 1,
    attempts: Object.freeze(attempts),
  })
  return { kind: 'resolved', budget: resolved, attempt }
}

function validLimit(value: number) { return Number.isSafeInteger(value) && value >= 0 }
function sortedUnique(values: readonly string[]) { return Object.freeze([...new Set(values)].sort()) }
function refused(reason: Refusal): ConsumeDisclosureResult { return { kind: 'refused', reason } }
function sameAttempt(existing: DisclosureAttempt, input: ConsumeInput, fields: readonly string[]) {
  return existing.rootRunId === input.rootRunId && existing.leafRunId === input.leafRunId && existing.attempt === input.attempt
    && existing.recipientBindingId === input.recipientBindingId && existing.purpose === input.purpose
    && existing.projectionDigest === input.projectionDigest && JSON.stringify(existing.fields) === JSON.stringify(fields)
}

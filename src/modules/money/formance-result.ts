export type FormanceCompleted = Readonly<{
  kind: 'completed'
  transactionRefs: readonly string[]
  replayed: boolean
}>

export type FormanceRefused = Readonly<{
  kind: 'refused'
  code: string
  retryable: false
}>

export type FormanceUnavailable = Readonly<{
  kind: 'unavailable'
  code: string
  submissionProvenAbsent: true
}>

export type FormanceUnknown = Readonly<{
  kind: 'outcome_unknown'
  reference: string
  statusRef: string
}>

export type FormanceMoneyResult =
  | FormanceCompleted
  | FormanceRefused
  | FormanceUnavailable
  | FormanceUnknown

export function completed(reference: string, replayed: boolean): FormanceCompleted {
  return Object.freeze({ kind: 'completed', transactionRefs: Object.freeze([reference]), replayed })
}

export function completedMany(references: readonly string[], replayed: boolean): FormanceCompleted {
  return Object.freeze({
    kind: 'completed',
    transactionRefs: Object.freeze([...references]),
    replayed,
  })
}

export function refused(code: string): FormanceRefused {
  return Object.freeze({ kind: 'refused', code, retryable: false })
}

export function unavailable(code: string): FormanceUnavailable {
  return Object.freeze({ kind: 'unavailable', code, submissionProvenAbsent: true })
}

export function unknown(reference: string): FormanceUnknown {
  return Object.freeze({
    kind: 'outcome_unknown',
    reference,
    statusRef: `formance-transaction:${reference}`,
  })
}

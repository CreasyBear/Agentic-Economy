import {
  createCurrentOperationCommitment,
} from '@/modules/capability-supply/current-operation'
import {
  parsePublishedOperationSnapshot,
  type PublishedOperation,
} from '@/modules/capability-supply/public'

/**
 * The durable invocation row already stores the admitted Operation JSON. Its
 * canonical currentDigest is therefore recoverable without another schema
 * field and can be compared with a freshly read current Operation immediately
 * before provider release.
 */
export function currentOperationDigest(input: Readonly<{
  operationRef: string
  operation: PublishedOperation
}>): string | undefined {
  try {
    return createCurrentOperationCommitment(input).currentDigest
  } catch {
    return undefined
  }
}

export function currentOperationDigestFromSnapshot(input: Readonly<{
  operationRef: string
  operationJson: string
}>): string | undefined {
  const operation = parsePublishedOperationSnapshot(input.operationJson)
  return operation === undefined
    ? undefined
    : currentOperationDigest({ operationRef: input.operationRef, operation })
}

export function currentOperationCommitmentsMatch(input: Readonly<{
  operationRef: string
  pinned: PublishedOperation
  current: PublishedOperation
}>): boolean {
  const pinnedDigest = currentOperationDigest({
    operationRef: input.operationRef,
    operation: input.pinned,
  })
  return pinnedDigest !== undefined
    && pinnedDigest === currentOperationDigest({
      operationRef: input.operationRef,
      operation: input.current,
    })
}
